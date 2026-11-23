import { icon } from '../Glyphs.js?v=color-sampler';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { storeSourceFiles } from '../ProjectAssets.js';
import * as THREE from 'three';
import { canvasView, transformCanvasPoint, transformTools2D } from './Canvas2DTools.js?v=uv-sculpt';
import { brushDab, brushGrainFill, brushGrainTile, brushPalette, brushPressure, brushStroke, pencilBrush, useBrushShortcut } from './PencilBrush.js?v=pencil-reference';
import { guidePencilPoint, simplifyPencilStroke, smoothPencilStroke, stabilizePointer } from './PencilStroke.js?v=pencil-placement';
import { createBrushColorSampler } from './BrushColorSampler.js?v=pencil-reference';
import { modelButton, modelField } from './ModelControls.js?v=uv-anchors';
import { applyProjectionMask, maskFromOutline, maskShapes } from './ProjectionMask.js?v=mask-editor';
import { canEditLightMask, setLightMask } from './LightMask.js?v=mask-editor';
import { isClosedOutline, modelObject, outlinePoints } from './ModelGeometry.js?v=pencil-grain';
import { lightViewCamera } from './LightView.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { sculptMask } from './MaskSculpt.js?v=uv-sculpt';
import { closestPointOnSegment, fitDrawingContour, insertContourPoint, segmentCount } from './Contour.js';

const defaultTextureSize = 1024;
const maxTextureSize = 4096;
const isPencilContour = shape => shape?.pencilStroke === true || Number.isFinite( shape?.width );
const referenceDefaults = { x: 0, y: 0, scale: 1, opacity: 1 };

function readReferencePlacement( saved ) {

	const limits = { x: [ -2, 2 ], y: [ -2, 2 ], scale: [ .05, 16 ], opacity: [ .05, 1 ] };
	return Object.fromEntries( Object.entries( referenceDefaults ).map( ( [ key, fallback ] ) => [
		key, Number.isFinite( saved?.[ key ] ) ? THREE.MathUtils.clamp( saved[ key ], ...limits[ key ] ) : fallback
	] ) );

}

export function openMaskEditor( editor, light, showPicker = false, vectorMode = false ) {

	if ( ! vectorMode && ! canEditLightMask( light ) ) return;
	const scene = editor.scene;
	const saved = () => vectorMode ? scene.userData.vectorDrawing : light.userData.projectionMask;
	let initial = saved();
	let reference, referenceFile, referenceRequest, referenceURL;
	let texture, textureRequest, upload, uploadTexture = false;
	let texturePath = initial?.texturePath;
	let textureName = initial?.textureName || 'drawing';
	const readSize = value => Number.isInteger( value ) && value > 0 && value <= maxTextureSize ? value : defaultTextureSize;
	let textureWidth = readSize( initial?.textureWidth );
	let textureHeight = readSize( initial?.textureHeight );
	let referencePath = vectorMode ? initial?.referencePath : undefined;
	let includeReference = vectorMode && initial?.includeReference === true;
	let referencePlacement = vectorMode && readReferencePlacement( initial?.referencePlacement );
	let updateReferenceControls, referencePicker;
	let referenceVisible = true;
	let guideCenter = [ .5, .5 ];
	let shapes = maskShapes( initial ), active = shapes.length - 1, vertex = -1, tool = 'edit', draft = [], gesture;
	const undo = [], redo = [];
	let brushStrokes = vectorMode ? structuredClone( initial?.brushStrokes || [] ) : [];
	const raster = vectorMode ? document.createElement( 'canvas' ) : null;

	const rasterContext = raster?.getContext( '2d' );
	const usesPalette = () => [ 'stroke', 'raster', 'erase', 'pickColor' ].includes( tool );
	const pickColor = vectorMode && createBrushColorSampler( editor );
	let beforeColorPick = 'raster';
	const pencilRaster = () => tool === 'raster' || tool === 'erase';
	const transforms = () => transformTools2D.some( ( [ id ] ) => id === tool );
	const node = ( tag, parent, label ) => {

		const item = document.createElement( tag );
		if ( label ) item.textContent = label;
		parent?.append( item );
		return item;

	};
	const workspacePanel = node( 'section' );
	workspacePanel.className = 'mapping-editor mask-editor';
	if ( vectorMode ) workspacePanel.classList.add( 'vector-editor' );
	workspacePanel.setAttribute( 'aria-label', vectorMode ? 'Image and vector editor' : '2D mask editor' );
	if ( ! vectorMode ) node( 'h3', workspacePanel, ( light.name || light.type ) + ' · Mask editor' );
	const imageHeader = vectorMode && node( 'div', workspacePanel );
	if ( imageHeader ) imageHeader.className = 'image-editor-header';
	const toolbar = node( 'div' );
	const tools = new Map();
	const addTool = ( id, label, glyph ) => tools.set( id, modelButton( toolbar, label, glyph, () => {

		if ( id === 'pickColor' && tool !== 'pickColor' ) beforeColorPick = usesPalette() ? tool : 'raster';
		tool = id;
		draft = [];
		vertex = -1;
		status.textContent = id === 'polygon' ? 'Click to place points. Double-click the first point or press Enter to close.' : '';
		draw();

	} ) );
	addTool( 'edit', 'Edit points', 'toolSelect' );
	addTool( 'polygon', 'Draw polygon', 'toolMask' );
	addTool( 'freehand', 'Freehand outline', 'toolPath' );
	if ( vectorMode ) {

		addTool( 'stroke', 'Pencil', 'freehandDraw' );
		addTool( 'raster', 'Brush', 'brush' );
		addTool( 'erase', 'Erase Brush Marks', 'erase' );
		addTool( 'pickColor', 'Sample Brush Color', 'eyedropper' );
		addTool( 'guideCenter', 'Set drawing guide center', 'pivotOrigin' );
		for ( const [ id, label, glyph ] of transformTools2D ) addTool( id, label, glyph );

	}
	addTool( 'pan', 'Pan', 'hand' );
	modelButton( toolbar, 'Frame All', 'frame', () => view.fit() );
	addTool( 'rectangle', 'Draw rectangle', 'toolGrid' );
	addTool( 'ellipse', 'Draw ellipse', 'brushWidth' );
	addTool( 'push', 'Push brush', 'sculptTool' );
	addTool( 'smooth', 'Smooth brush', 'sculptSmooth' );
	addTool( 'pinch', 'Pinch brush', 'sculptPinch' );
	const radiusLabel = node( 'label', toolbar, 'Brush radius ' );
	const radius = node( 'input', radiusLabel );
	Object.assign( radius, { type: 'range', min: 12, max: 130, value: 46 } );
	radius.oninput = () => draw();
	radius.setAttribute( 'aria-label', vectorMode ? 'Brush radius' : 'Mask brush radius' );
	const strengthLabel = node( 'label', toolbar ); strengthLabel.innerHTML = icon( 'opacity' ); strengthLabel.title = 'Brush strength (Shift+[ / Shift+])';
	const strength = node( 'input', strengthLabel );
	Object.assign( strength, { type: 'range', min: .05, max: 1, step: .05, value: 1 } );
	strength.setAttribute( 'aria-label', vectorMode ? 'Brush strength' : 'Mask brush strength' );
	strength.oninput = () => draw();
	modelButton( toolbar, vectorMode ? 'Undo drawing edit' : 'Undo mask edit', 'undo', () => restore( undo, redo ) );
	modelButton( toolbar, vectorMode ? 'Redo drawing edit' : 'Redo mask edit', 'redo', () => restore( redo, undo ) );
	const workspace = node( 'section', workspacePanel );
	workspace.className = 'mask-work-area';
	toolbar.className = 'editor-2d-tools';
	workspace.append( toolbar );
	const canvas = node( 'canvas', workspace );
	canvas.setAttribute( 'aria-label', vectorMode ? 'Vector drawing canvas' : 'Projection frame' );
	canvas.tabIndex = 0;
	canvas.width = 760;
	canvas.height = 490;
	const ctx = canvas.getContext( '2d' );
	const view = canvasView( canvas, draw, () => tool === 'pan' && ! gesture, () => editor.config.getKey( 'settings/emulateThreeButtonMouse' ) );
	const brushSettings = node( 'div' );
	brushSettings.className = 'canvas-pencil-settings';
	const palette = vectorMode && brushPalette( editor, brushSettings, draw, { strokeOptions: true, singleRow: true } );
	if ( palette ) workspace.before( brushSettings );
	const panel = node( 'aside', workspace );
	if ( vectorMode ) panel.hidden = ! showPicker;
	const listId = vectorMode ? 'vector-shape-list' : 'mask-shape-list';
	node( 'label', panel, vectorMode ? 'Contours' : 'Mask shapes' ).htmlFor = listId;
	const layers = node( 'select', panel );
	layers.id = listId;
	layers.size = 5;
	layers.onchange = () => { active = layers.selectedIndex; vertex = -1; refresh(); };
	const name = node( 'input', panel );
	name.setAttribute( 'aria-label', 'Shape name' );
	name.onchange = () => change( () => { shapes[ active ].name = name.value.trim() || 'Mask'; } );
	const mode = node( 'select', panel );
	mode.setAttribute( 'aria-label', 'Shape operation' );
	mode.append( new Option( vectorMode ? 'Fill' : 'Light inside', 'inside' ), new Option( vectorMode ? 'Cutout' : 'Block inside', 'cutout' ) );
	mode.onchange = () => change( () => { shapes[ active ].mode = mode.value; } );
	const fill = vectorMode ? node( 'input', panel ) : null;
	if ( fill ) {

		fill.type = 'color';
		fill.setAttribute( 'aria-label', 'Contour color' );
		fill.onchange = () => change( () => { shapes[ active ].color = fill.value; } );

	}
	const layerActions = node( 'div', panel );
	layerActions.className = 'modeling-actions';
	const remove = modelButton( layerActions, 'Delete shape', 'delete', () => change( () => {

		shapes.splice( active, 1 );
		active = Math.min( active, shapes.length - 1 );
		vertex = -1;

	} ) );
	const duplicate = modelButton( layerActions, 'Duplicate shape', 'add', () => addShape( structuredClone( shapes[ active ] ) ) );
	const deletePoint = modelButton( layerActions, 'Delete point', 'remove', removeVertex );
	const cyclic = vectorMode && modelButton( layerActions, 'Toggle Cyclic', 'closeTool', toggleCyclic );
	const annotation = vectorMode && modelField( panel, 'Annotation', 'freehandDraw', 'checkbox', false );
	if ( annotation ) annotation.onchange = () => change( () => { shapes[ active ].annotation = annotation.checked; } );
	const createCurve = vectorMode && modelButton( layerActions, 'Create scene curve', 'toolPath', () => createSceneObject( 'path' ) );
	const createShape = vectorMode && modelButton( layerActions, 'Create filled scene shape', 'fillTool', () => createSceneObject( 'shape' ) );

	function createSceneObject( kind ) {

		const shape = shapes[ active ];
		const points = shape.points.map( ( [ u, v ] ) => [ 2 * u - 1, 1 - 2 * v, 0 ] );
		const closed = shape.closed !== false;
		const object = modelObject( THREE, { kind, points, closed, planar: true, smooth: false }, kind === 'shape' ? shape.name + ' fill' : shape.name );
		object.material.color.set( color( shape ) );
		if ( kind === 'path' && isPencilContour( shape ) ) {

			object.userData.pencilStroke = true;
			object.userData.annotation = shape.annotation === true;

		}
		editor.execute( new AddObjectCommand( editor, object ), kind === 'shape' ? 'Create filled scene shape' : 'Create scene curve' );
		available.push( [ object, object.name ] );
		filter();
		status.textContent = 'Created ' + object.name + ' in the 3D view.';

	}
	const picker = node( 'details', panel );
	picker.open = showPicker;
	node( 'summary', picker, 'Pick scene outline' );
	const search = node( 'input', picker );
	search.type = 'search';
	search.placeholder = 'Search scene outlines';
	search.setAttribute( 'aria-label', 'Search scene outlines' );
	const sources = node( 'select', picker );
	sources.size = 5;
	sources.setAttribute( 'aria-label', 'Scene outline' );
	const available = [];
	editor.scene.traverse( object => {

		const data = object.geometry?.userData.modeling;
		if ( ! data || ! [ 'path', 'shape' ].includes( data.kind ) || data.points.length < 2 ||
			( ! vectorMode && ! isClosedOutline( data ) ) || hasRestriction( object, 'disabled' ) ) return;
		const path = [];
		for ( let parent = object; parent && parent !== editor.scene; parent = parent.parent ) path.unshift( parent.name || parent.type );
		available.push( [ object, path.join( ' / ' ) ] );

	} );
	const importActions = node( 'div', picker );
	importActions.className = 'modeling-actions';
	const fit = modelButton( importActions, 'Fit outline to frame', 'toolGrid', () => importOutline( false ) );
	const project = modelButton( importActions, vectorMode ? 'Copy from scene in place' : 'Project outline in place', 'toolMask', () => importOutline( true ) );
	const pickerNotes = node( 'small', picker );
	function filter() {

		const query = search.value.toLowerCase().trim();
		const matches = available.filter( ( [ , path ] ) => path.toLowerCase().includes( query ) );
		sources.replaceChildren( ...matches.map( ( [ object, path ] ) => new Option( path, object.uuid ) ) );
		sources.selectedIndex = matches.length ? 0 : -1;
		fit.disabled = ! matches.length;
		project.disabled = fit.disabled;
		pickerNotes.textContent = matches.length ? '' : available.length ? 'No matching outlines.' :
			vectorMode ? 'Create a Shape or Path in the scene first.' : 'Create a closed Shape or Path in the scene first.';

	}
	search.oninput = filter;
	filter();

	const footer = node( 'div', workspacePanel );
	const status = node( 'output', footer );
	if ( vectorMode ) footer.className = 'image-editor-status';
	status.setAttribute( 'role', 'status' );
	const imageLabel = vectorMode && node( 'span', imageHeader );
	function syncImageLabel() {

		if ( ! imageLabel ) return;
		imageLabel.textContent = textureName + ' · ' + textureWidth + ' × ' + textureHeight;
		imageLabel.title = texturePath || imageLabel.textContent;

	}
	if ( imageHeader ) {

		modelButton( imageHeader, 'New texture', 'add', () => createTexture.showModal() );
		modelButton( imageHeader, 'Open texture from Project assets', 'editorAssets', () => chooseImageAsset( true ) );
		modelButton( imageHeader, 'Open image file', 'assets', () => { uploadTexture = true; upload.click(); } );
		modelButton( imageHeader, 'Save texture to Project assets', 'save', saveDrawingAsset );
		const inspector = modelButton( imageHeader, 'Contours and reference', 'editorProperties', () => {

			panel.hidden = ! panel.hidden;
			inspector.setAttribute( 'aria-expanded', String( ! panel.hidden ) );

		} );
		inspector.setAttribute( 'aria-expanded', String( ! panel.hidden ) );
		const createTexture = node( 'dialog', workspacePanel );
		createTexture.className = 'new-texture-dialog';
		createTexture.setAttribute( 'aria-label', 'New texture' );
		const form = node( 'form', createTexture );
		const fields = [
			[ 'Texture name', 'text', 'Texture' ],
			[ 'Width (px)', 'number', defaultTextureSize ],
			[ 'Height (px)', 'number', defaultTextureSize ]
		].map( ( [ label, type, value ] ) => {

			const input = node( 'input', node( 'label', form, label ) );
			Object.assign( input, { type, value, required: true } );
			if ( type === 'number' ) Object.assign( input, { min: 1, max: maxTextureSize, step: 1 } );
			return input;

		} );
		const create = node( 'button', form, 'Create' );
		create.type = 'submit';
		const cancel = node( 'button', form, 'Cancel' );
		cancel.type = 'button';
		cancel.onclick = () => createTexture.close();
		createTexture.addEventListener( 'keydown', event => {

			if ( event.key === 'Escape' ) event.stopPropagation();

		} );
		form.onsubmit = event => {

			event.preventDefault();
			const [ label, width, height ] = fields;
			cancelReferencePicker();
			textureRequest = undefined;
			setTexture( label.value.trim() || 'Texture', width.valueAsNumber, height.valueAsNumber );
			createTexture.close();
			status.textContent = 'Created ' + textureName + '.';
			canvas.focus( { preventScroll: true } );

		};
		syncImageLabel();

	}
	function chooseImageAsset( asTexture ) {

		const assets = editor.assetBrowser;
		const picker = referencePicker = {
			kind: 'reference',
			label: asTexture ? 'Choose an image to edit' : undefined,
			includeTextures: asTexture,
			onPick: ( { file, path, texture: sourceTexture } ) => {

				const isCurrent = () => assets.picker === picker;
				if ( ! asTexture ) return loadReference( file, path, isCurrent );
				if ( sourceTexture ) return loadMaterialTexture( sourceTexture, path, isCurrent );
				return loadTexture( file, path, isCurrent );

			}
		};
		assets.open( picker );

	}
	function setTexture( label, width, height, image, path ) {

		remember();
		texture = image;
		texturePath = path;
		textureName = label;
		textureWidth = width;
		textureHeight = height;
		shapes = [];
		brushStrokes = [];
		cancelReferenceLoad();
		reference = referenceFile = referencePath = undefined;
		includeReference = false;
		referenceVisible = true;
		referencePlacement = { ...referenceDefaults };
		if ( tool === 'reference' ) tool = 'edit';
		updateReferenceControls();
		active = vertex = -1;
		draft = [];
		repaint();
		view.fit();
		refresh();

	}
	async function loadMaterialTexture( sourceTexture, path, canApply ) {

		const source = editor.sourceFiles.get( path )?.file;
		if ( source ) return loadTexture( source, path, canApply );
		try {

			const image = sourceTexture.image;
			const width = image.naturalWidth || image.width;
			const height = image.naturalHeight || image.height;
			if ( ! width || ! height || Math.max( width, height ) > maxTextureSize ) throw new Error();
			const copy = document.createElement( 'canvas' );
			copy.width = width;
			copy.height = height;
			copy.getContext( '2d' ).drawImage( image, 0, 0 );
			const blob = await new Promise( resolve => copy.toBlob( resolve, 'image/png' ) );
			if ( ! blob ) throw new Error();
			if ( ! workspacePanel.isConnected || ! canApply() ) return false;
			return loadTexture( new File( [ blob ], ( sourceTexture.name || 'Texture' ) + '.png', { type: 'image/png' } ), undefined, canApply );

		} catch {

			if ( workspacePanel.isConnected && canApply() ) status.textContent = 'Choose a readable still image up to 4096 px per side.';
			return false;

		}

	}
	async function loadTexture( file, path, canApply = () => true, restoring = false ) {

		const image = textureRequest = new Image();
		const url = URL.createObjectURL( file );
		try {

			image.src = url;
			await image.decode();
			if ( textureRequest !== image || ! workspacePanel.isConnected || ! canApply() ) return false;
			if ( Math.max( image.naturalWidth, image.naturalHeight ) > maxTextureSize ) {

				status.textContent = 'Choose an image up to 4096 px per side.';
				return false;

			}
			if ( restoring ) {

				texture = image;
				repaint();
				draw();

			} else {

				path ||= storeSourceFiles( editor, { [ file.name ]: file } ).get( file );
				setTexture( file.name.replace( /\.[^.]+$/, '' ), image.naturalWidth, image.naturalHeight, image, path );

			}
			status.textContent = 'Loaded ' + file.name + '.';
			return true;

		} catch {

			if ( textureRequest === image && workspacePanel.isConnected && canApply() ) status.textContent = 'The image could not be decoded.';
			return false;

		} finally {

			URL.revokeObjectURL( url );
			if ( textureRequest === image ) textureRequest = undefined;

		}

	}

	if ( vectorMode ) {

		const media = node( 'div', panel );
		upload = node( 'input', media );
		upload.type = 'file';
		upload.accept = 'image/*';
		upload.hidden = true;
		modelButton( media, 'Open reference image', 'page', () => { uploadTexture = false; upload.click(); } );
		modelButton( media, 'Choose reference from assets', 'assets', () => chooseImageAsset( false ) );
		const toggle = modelButton( media, 'Show reference image', 'scene', () => {

			referenceVisible = ! referenceVisible;
			if ( ! referenceVisible && tool === 'reference' ) tool = 'edit';
			toggle.setAttribute( 'aria-pressed', String( referenceVisible ) );
			draw();

		} );
		toggle.setAttribute( 'aria-pressed', 'true' );
		const clearReference = modelButton( media, 'Remove reference image', 'erase', () => {

			cancelReferencePicker();
			cancelReferenceLoad();
			reference = referenceFile = referencePath = undefined;
			if ( tool === 'reference' ) tool = 'edit';
			includeReference = false;
			updateReferenceControls();
			status.textContent = 'Reference removed.';
			draw();

		} );
		const include = modelField( media, 'Include reference in output', 'export', 'checkbox', includeReference );
		include.onchange = () => { includeReference = include.checked; };
		const place = modelButton( media, 'Place reference image', 'move', () => {

			tool = tool === 'reference' ? 'edit' : 'reference';
			referenceVisible = true;
			draft = [];
			status.textContent = tool === 'reference' ? 'Drag to move the reference. Shift-drag up or down to scale it.' : '';
			updateReferenceControls();
			canvas.focus( { preventScroll: true } );
			draw();

		} );
		tools.set( 'reference', place );
		const fitReference = modelButton( media, 'Fit reference to canvas', 'frame', () => change( () => {

			referencePlacement = { ...referencePlacement, x: 0, y: 0, scale: 1 };

		} ) );
		const opacity = modelField( media, 'Reference guide opacity', 'opacity', 'number', referencePlacement.opacity );
		Object.assign( opacity, { min: .05, max: 1, step: .05, onchange: () => change( () => {

			referencePlacement = readReferencePlacement( { ...referencePlacement, opacity: opacity.valueAsNumber } );
			opacity.value = referencePlacement.opacity;

		} ) } );
		const referenceName = node( 'small', media );
		updateReferenceControls = () => {

			toggle.disabled = place.disabled = fitReference.disabled = opacity.disabled = ! reference;
			place.setAttribute( 'aria-pressed', String( tool === 'reference' ) );
			toggle.setAttribute( 'aria-pressed', String( referenceVisible ) );
			opacity.value = referencePlacement.opacity;
			clearReference.disabled = ! reference && ! referencePath;
			include.disabled = ! reference;
			include.checked = includeReference;
			referenceName.textContent = referenceFile?.name || referencePath?.split( '/' ).pop() || '';
			referenceName.title = referencePath || referenceName.textContent;
			referenceName.hidden = ! referenceName.textContent;

		};
		updateReferenceControls();
		upload.onchange = () => {

			const file = upload.files[ 0 ];
			if ( file ) {

				cancelReferencePicker();
				if ( uploadTexture ) loadTexture( file );
				else loadReference( file );

			}
			uploadTexture = false;
			upload.value = '';

		};
		modelButton( footer, 'Export SVG', 'code', exportSVG );
		modelButton( footer, 'Export PNG', 'save', exportPNG );

	}

	function cancelReferencePicker() {

		if ( referencePicker && editor.assetBrowser.picker === referencePicker ) editor.assetBrowser.cancelPicker();
		referencePicker = undefined;

	}

	function cancelReferenceLoad() {

		if ( ! referenceRequest ) return;
		URL.revokeObjectURL( referenceURL );
		referenceRequest = referenceURL = undefined;

	}

	async function loadReference( file, path, canApply = () => true ) {

		cancelReferenceLoad();
		const image = referenceRequest = new Image();
		image.src = referenceURL = URL.createObjectURL( file );
		try {

			await image.decode();
			if ( referenceRequest !== image || ! canApply() ) return false;
			reference = image;
			referenceFile = file;
			referencePath = path;
			updateReferenceControls();
			status.textContent = 'Reference image loaded.';
			draw();
			return true;

		} catch {

			if ( referenceRequest === image && canApply() ) status.textContent = 'The reference image could not be decoded.';
			return false;

		} finally {

			if ( referenceRequest === image ) cancelReferenceLoad();

		}

	}

	modelButton( footer, vectorMode ? 'Apply drawing' : 'Apply masks', 'apply', () => {

		try {

			if ( draft.length ) throw new Error( 'Close the polygon with Enter, or press Escape to discard it.' );
			if ( saved() !== initial ) throw new Error( 'The saved shapes changed. Reopen the editor to continue.' );
			const value = { shapes: structuredClone( shapes ) };
			if ( vectorMode && brushStrokes.length ) value.brushStrokes = structuredClone( brushStrokes );
			if ( vectorMode ) {

				if ( textureRequest || referenceRequest ) throw new Error( 'Wait for the image to load.' );
				Object.assign( value, { textureName, textureWidth, textureHeight } );
				if ( texturePath ) value.texturePath = texturePath;
				if ( referenceFile && ! referencePath ) {

					referencePath = storeSourceFiles( editor, { [ referenceFile.name ]: referenceFile } ).get( referenceFile );

				}
				if ( referencePath ) {

					value.referencePath = referencePath;
					if ( Object.keys( referenceDefaults ).some( key => referencePlacement[ key ] !== referenceDefaults[ key ] ) ) {
						value.referencePlacement = { ...referencePlacement };
					}

				}
				if ( includeReference ) value.includeReference = true;
				const command = new SetValueCommand( editor, scene, 'userData', { ...scene.userData, vectorDrawing: value } );
				command.updatable = false;
				editor.execute( command, 'Edit vector drawing' );

			} else setLightMask( editor, light, shapes.length ? value : null );
			initial = saved();
			status.textContent = vectorMode ? 'Drawing applied.' : 'Masks applied.';

		} catch ( error ) { status.textContent = error.message; }

	} );


	function snapshot() {

		return { shapes: structuredClone( shapes ), brushStrokes: brushStrokes.slice(), active, vertex,
			referencePlacement, reference, referenceFile, referencePath, includeReference, referenceVisible,
			texture, texturePath, textureName, textureWidth, textureHeight };

	}
	function remember( state = snapshot() ) {

		undo.push( state );
		if ( undo.length > 60 ) undo.shift();
		redo.length = 0;

	}
	function restore( from, to ) {

		if ( ! from.length || gesture ) return;
		to.push( snapshot() );
		textureRequest = undefined;
		cancelReferenceLoad();
		( { shapes, brushStrokes, active, vertex, referencePlacement, reference, referenceFile, referencePath,
			includeReference, referenceVisible, texture, texturePath, textureName, textureWidth, textureHeight } = from.pop() );
		if ( ! reference && tool === 'reference' ) tool = 'edit';
		updateReferenceControls?.();
		repaint();
		draft = [];
		refresh();

	}
	function change( action ) {

		remember();
		action();
		refresh();

	}
	function addShape( shape, nextTool = 'edit' ) {

		change( () => {

			shapes.push( { mode: 'inside', ...shape, name: shape.name || ( vectorMode ? 'Contour ' : 'Mask ' ) + ( shapes.length + 1 ) } );
			active = shapes.length - 1;
			vertex = -1;
			draft = [];
			tool = nextTool;
			status.textContent = '';

		} );

	}
	function closeDraft() {

		if ( draft.length >= 3 ) addShape( { points: draft } );

	}
	function removeVertex() {

		if ( ! canRemoveVertex() ) return;
		change( () => { shapes[ active ].points.splice( vertex, 1 ); vertex = -1; } );

	}
	function canRemoveVertex() {

		const shape = shapes[ active ];
		return vertex >= 0 && shape && shape.points.length > ( shape.closed === false ? 2 : 3 );

	}
	function toggleCyclic() {

		const shape = shapes[ active ];
		if ( ! shape || shape.points.length < 3 || shape.mode === 'cutout' ) return;
		change( () => { shape.closed = shape.closed === false; } );

	}
	function importOutline( inPlace ) {

		try {

			const object = editor.objectByUuid( sources.value );
			if ( ! object ) throw new Error( 'The source outline is no longer in the scene.' );
			const data = object.geometry.userData.modeling;
			const outline = outlinePoints( THREE, data );
			if ( vectorMode ) {

				const material = Array.isArray( object.material ) ? object.material[ 0 ] : object.material;
				const points = inPlace ? outline.map( point => {

					const { x, y } = object.localToWorld( point );
					return [ ( x + 1 ) / 2, ( 1 - y ) / 2 ];

				} ) : fitDrawingContour( outline.map( point => point.toArray() ) );
				addShape( { name: object.name || object.type, points,
					closed: isClosedOutline( data ), pencilStroke: object.userData.pencilStroke,
					annotation: object.userData.annotation, color: material?.color && '#' + material.color.getHexString() } );
				return;

			}
			const camera = inPlace && lightViewCamera( THREE, light );
			const points = camera ? outline.map( point => {

				object.localToWorld( point );
				if ( point.clone().applyMatrix4( camera.matrixWorldInverse ).z >= -camera.near ) throw new Error( 'Place the outline in front of the light.' );
				point.project( camera );
				return [ ( point.x + 1 ) / 2, ( 1 - point.y ) / 2 ];

			} ) : maskFromOutline( outline.map( point => point.toArray() ) ).points;
			addShape( { name: object.name || object.type, points } );

		} catch ( error ) { status.textContent = error.message; }

	}
	function refresh() {

		layers.replaceChildren( ...shapes.map( shape => new Option( ( shape.mode === 'cutout' ? '− ' : '+ ' ) + shape.name + ( shape.annotation ? ' · Annotation' : '' ) ) ) );
		layers.selectedIndex = active;
		const shape = shapes[ active ];
		syncImageLabel();
		if ( annotation ) {

			annotation.parentElement.hidden = ! isPencilContour( shape );
			annotation.checked = shape?.annotation === true;

		}
		name.value = shape?.name || '';
		mode.value = shape?.mode || 'inside';
		name.disabled = mode.disabled = remove.disabled = duplicate.disabled = ! shape;
		if ( fill ) {

			const closed = shape?.closed !== false;
			createCurve.disabled = ! shape;
			createShape.disabled = ! shape || shape.annotation || ! closed || shape.mode === 'cutout' || shape.points.length < 3;
			cyclic.disabled = ! shape || shape.points.length < 3 || shape.mode === 'cutout';
			cyclic.setAttribute( 'aria-pressed', String( !! shape && closed ) );
			mode.disabled = ! shape || ! closed;
			fill.value = color( shape );
			fill.disabled = ! shape || shape.mode === 'cutout';

		}
		draw();

	}

	let frame, cursor;
	const pixel = ( [ u, v ] ) => [ frame.x + u * frame.width, frame.y + v * frame.height ];
	const uv = ( [ x, y ] ) => [ ( x - frame.x ) / frame.width, ( y - frame.y ) / frame.height ];
	const distance = ( a, b ) => Math.hypot( a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ] );
	function trace( points, closed ) {

		ctx.beginPath();
		points.forEach( ( point, i ) => ctx[ i ? 'lineTo' : 'moveTo' ]( ...pixel( point ) ) );
		if ( closed ) ctx.closePath();

	}
	function pencilPoints( points ) {

		if ( points.length !== 1 ) return points;
		// Keep a tap as a round cap on a subpixel segment, editable like any other stroke.
		const [ u, v ] = points[ 0 ];
		return [ points[ 0 ], [ u + ( u > .5 ? -.25 : .25 ) / textureWidth, v ] ];

	}

	function texturePoint( point ) {

		const [ u, v ] = uv( point );
		return [ u * textureWidth, v * textureHeight ];

	}

	function color( shape ) {

		return /^#[0-9a-f]{6}$/i.test( shape?.color ) ? shape.color : '#72cbef';

	}
	function imageBounds( image, x, y, width, height, placement ) {

		const iw = image?.videoWidth || image?.naturalWidth || image?.width;
		const ih = image?.videoHeight || image?.naturalHeight || image?.height;
		if ( ! iw || ! ih ) return;
		const scale = Math.min( width / iw, height / ih ) * ( placement?.scale ?? 1 );
		return [ x + ( width - iw * scale ) / 2 + width * ( placement?.x ?? 0 ),
			y + ( height - ih * scale ) / 2 + height * ( placement?.y ?? 0 ), iw * scale, ih * scale ];

	}
	function drawImage( target, image, x, y, width, height, placement ) {

		const bounds = imageBounds( image, x, y, width, height, placement );
		if ( ! bounds ) return;
		try { target.drawImage( image, ...bounds ); }
		catch { /* Wait for a decoded image. */ }

	}
	function lineWidth( shape ) {

		return Number.isFinite( shape.width ) ? Math.max( .001, Math.min( .25, shape.width ) ) : .004;

	}
	function lineOpacity( shape ) {

		return Number.isFinite( shape.opacity ) ? Math.max( 0, Math.min( 1, shape.opacity ) ) : 1;

	}
	function drawVectors( target, width, height, showAnnotations = false ) {

		target.save();
		for ( const operation of [ 'inside', 'cutout' ] ) for ( const shape of shapes ) {

			if ( shape.mode !== operation || shape.annotation && ! showAnnotations ) continue;
			target.globalCompositeOperation = operation === 'cutout' ? 'destination-out' : 'source-over';
			target.beginPath();
			shape.points.forEach( ( [ x, y ], i ) => target[ i ? 'lineTo' : 'moveTo' ]( x * width, y * height ) );
			if ( shape.closed === false ) {

				target.lineWidth = Math.min( width, height ) * lineWidth( shape );
				target.strokeStyle = brushGrainFill( target, color( shape ), shape, target.lineWidth );
				target.globalAlpha = lineOpacity( shape );
				target.lineCap = target.lineJoin = 'round';
				target.stroke();

			} else {

				target.fillStyle = color( shape );
				target.closePath();
				target.globalAlpha = 1;
				target.fill( 'evenodd' );

			}

		}
		target.restore();

	}
	const vectorCanvas = document.createElement( 'canvas' );

	function rasterDab( stroke, x, y, force ) {

		brushDab( rasterContext, x, y, force, stroke.brush, stroke.erase );

	}

	function repaint() {

		if ( ! rasterContext ) return;
		if ( raster.width !== textureWidth ) raster.width = textureWidth;
		if ( raster.height !== textureHeight ) raster.height = textureHeight;
		rasterContext.clearRect( 0, 0, textureWidth, textureHeight );
		if ( texture ) rasterContext.drawImage( texture, 0, 0, textureWidth, textureHeight );
		for ( const stroke of brushStrokes ) for ( const [ x, y, force ] of stroke.samples ) rasterDab( stroke, x, y, force );

	}
	repaint();

	function exportSVG() {

		const patterns = [];
		const layers = operation => shapes.filter( shape => shape.mode === operation && ! shape.annotation ).map( shape => {

			const path = shape.points.map( ( [ x, y ], i ) => ( i ? 'L' : 'M' ) + ( x * textureWidth ).toFixed( 2 ) + ' ' + ( y * textureHeight ).toFixed( 2 ) ).join( ' ' );
			if ( shape.closed === false ) {

				const width = Math.min( textureWidth, textureHeight ) * lineWidth( shape );
				let stroke = color( shape );
				const tile = brushGrainTile( stroke, shape, width );
				if ( tile ) {

					const id = 'brush-grain-' + patterns.length;
					const size = tile.size.toFixed( 2 );
					patterns.push( '<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + size + '" height="' + size +
						'"><image width="' + size + '" height="' + size + '" href="' + tile.image.toDataURL() + '"/></pattern>' );
					stroke = 'url(#' + id + ')';

				}
				return '<path fill="none" stroke="' + stroke + '" stroke-width="' + width.toFixed( 2 ) +
					'" stroke-opacity="' + lineOpacity( shape ) + '" stroke-linecap="round" stroke-linejoin="round" d="' + path + '"/>';

			}
			return '<path fill="' + ( operation === 'cutout' ? 'black' : color( shape ) ) + '" fill-rule="evenodd" d="' + path + ' Z"/>';

		} ).join( '' );
		const cutouts = layers( 'cutout' ), drawing = layers( 'inside' );
		let base = texture || brushStrokes.length ? raster : null;
		if ( includeReference && reference ) base = drawingCanvas( false );
		const dimensions = ' width="' + textureWidth + '" height="' + textureHeight + '"';
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + textureWidth + ' ' + textureHeight + '"><defs>' + patterns.join( '' ) +
			'<mask id="cutouts"><rect' + dimensions + ' fill="white"/>' + cutouts + '</mask></defs><g mask="url(#cutouts)">' +
			( base ? '<image' + dimensions + ' href="' + base.toDataURL() + '"/>' : '' ) +
			drawing + '</g></svg>';
		editor.utils.save( new Blob( [ svg ], { type: 'image/svg+xml' } ), 'drawing.svg' );

	}
	function drawingCanvas( vectors = true ) {

		const output = document.createElement( 'canvas' );
		output.width = textureWidth;
		output.height = textureHeight;
		const target = output.getContext( '2d' );
		if ( includeReference ) drawImage( target, reference, 0, 0, textureWidth, textureHeight, referencePlacement );
		target.drawImage( raster, 0, 0 );
		if ( vectors ) drawVectors( target, textureWidth, textureHeight );
		return output;

	}

	function exportPNG() {

		drawingCanvas().toBlob( blob => { if ( blob ) editor.utils.save( blob, 'drawing.png' ); }, 'image/png' );

	}

	function saveDrawingAsset() {

		if ( referenceRequest || textureRequest ) {

			status.textContent = 'Wait for the image to load.';
			return;

		}
		if ( draft.length || gesture ) {

			status.textContent = 'Finish the current stroke or contour before saving a texture.';
			return;

		}
		const projectFiles = editor.sourceFiles;
		const filename = textureName.replace( /[/\\]/g, '-' ) + '.png';
		drawingCanvas().toBlob( blob => {

			if ( editor.sourceFiles !== projectFiles || ! workspacePanel.isConnected ) return;
			if ( ! blob ) {

				status.textContent = 'The drawing could not be encoded as PNG.';
				return;

			}
			const file = new File( [ blob ], filename, { type: 'image/png' } );
			const path = storeSourceFiles( editor, { [ file.name ]: file } ).get( file );
			status.textContent = 'Saved ' + path + ' to Project assets.';

		}, 'image/png' );

	}

	function draw() {

		const output = light?.projectorOutput;
		const image = vectorMode ? ( referenceVisible && reference ) : output?.source || ( ! output && light.map?.image );
		const aspect = vectorMode ? textureWidth / textureHeight : light?.projectorFrame?.aspect || 1;
		const margin = Math.min( 36, canvas.width / 4, canvas.height / 4 );
		const width = Math.min( canvas.width - margin, ( canvas.height - margin ) * aspect ), height = width / aspect;
		frame = { x: ( canvas.width - width ) / 2, y: ( canvas.height - height ) / 2, width, height };
		const { x, y } = frame;
		const gridColor = vectorMode ? getComputedStyle( canvas ).color : '#4f5a66';
		ctx.clearRect( 0, 0, canvas.width, canvas.height );
		if ( ! vectorMode ) {

			ctx.fillStyle = '#13171e';
			ctx.fillRect( 0, 0, canvas.width, canvas.height );

		}
		ctx.save();
		view.apply( ctx );
		ctx.save();
		ctx.beginPath();
		ctx.rect( x, y, width, height );
		ctx.clip();
		if ( ! vectorMode ) {

			ctx.fillStyle = '#343d48';
			ctx.fillRect( x, y, width, height );

		}
		ctx.strokeStyle = gridColor;
		if ( vectorMode ) ctx.globalAlpha = .12;
		for ( let i = 1; i < 8; i ++ ) {

			ctx.beginPath();
			ctx.moveTo( x + width * i / 8, y ); ctx.lineTo( x + width * i / 8, y + height );
			ctx.moveTo( x, y + height * i / 8 ); ctx.lineTo( x + width, y + height * i / 8 );
			ctx.stroke();

		}
		ctx.globalAlpha = 1;
		if ( vectorMode ) {

			const w = Math.ceil( width ), h = Math.ceil( height );
			if ( vectorCanvas.width !== w ) vectorCanvas.width = w;
			if ( vectorCanvas.height !== h ) vectorCanvas.height = h;
			const layer = vectorCanvas.getContext( '2d' );
			layer.clearRect( 0, 0, w, h );
			layer.globalAlpha = referencePlacement.opacity;
			drawImage( layer, image, 0, 0, w, h, referencePlacement );
			layer.globalAlpha = 1;
			layer.drawImage( raster, 0, 0, w, h );
			drawVectors( layer, w, h, true );
			ctx.drawImage( vectorCanvas, x, y, width, height );

		} else {

			drawImage( ctx, image, x, y, width, height );
			applyProjectionMask( ctx, { shapes }, x, y, width, height );

		}
		for ( const [ index, shape ] of shapes.entries() ) {

			if ( vectorMode && ! shape.annotation && shape.closed === false && shape.grain > 0 && ( index !== active || tool !== 'edit' ) ) continue;
			trace( shape.points, shape.closed !== false );
			ctx.strokeStyle = shape.annotation ? '#e9cc7b' : shape.mode === 'cutout' ? '#ff9e71' : '#74dcf3';
			ctx.lineWidth = active === index ? 2 : 1;
			ctx.stroke();
			if ( index === active && tool === 'edit' ) shape.points.forEach( ( point, i ) => {

				ctx.fillStyle = vertex === i ? '#ffb459' : '#74dcf3';
				ctx.beginPath(); ctx.arc( ...pixel( point ), 3, 0, Math.PI * 2 ); ctx.fill();

			} );

		}
		if ( draft.length ) {

			trace( tool === 'stroke' ? pencilPoints( draft ) : draft, tool !== 'polygon' && tool !== 'stroke' );
			if ( tool === 'stroke' && gesture?.brush ) {

				const style = gesture.brush;
				ctx.save();
				ctx.lineWidth = Math.min( width, height ) * style.size / Math.min( textureWidth, textureHeight );
				ctx.strokeStyle = brushGrainFill( ctx, style.color, style, ctx.lineWidth );
				ctx.globalAlpha = style.strength;
				ctx.lineCap = ctx.lineJoin = 'round';
				ctx.stroke();
				ctx.restore();

			} else {

				ctx.strokeStyle = '#fff';
				ctx.stroke();
				ctx.fillStyle = '#fff';
				ctx.beginPath(); ctx.arc( ...pixel( draft[ 0 ] ), 4, 0, Math.PI * 2 ); ctx.fill();

			}

		}
		if ( tool === 'guideCenter' || tool === 'stroke' && [ 'circle', 'radial' ].includes( pencilBrush( editor ).guide ) ) {

			const [ cx, cy ] = pixel( guideCenter );
			const size = 5 / view.scale;
			ctx.strokeStyle = '#ffae66';
			ctx.lineWidth = 1 / view.scale;
			ctx.beginPath();
			ctx.moveTo( cx - size, cy ); ctx.lineTo( cx + size, cy );
			ctx.moveTo( cx, cy - size ); ctx.lineTo( cx, cy + size );
			ctx.stroke();

		}
		if ( cursor && gesture?.stabilizer ) {

			ctx.strokeStyle = '#ffae66';
			ctx.lineWidth = 1 / view.scale;
			ctx.beginPath();
			ctx.moveTo( ...gesture.stabilizer );
			ctx.lineTo( ...cursor );
			ctx.stroke();

		}
		if ( cursor && [ 'push', 'smooth', 'pinch', 'raster', 'erase' ].includes( tool ) ) {

			ctx.strokeStyle = '#fff';
			ctx.beginPath(); ctx.arc( ...cursor, usesPalette() ? pencilBrush( editor ).size * width / textureWidth / 2 : Number( radius.value ), 0, Math.PI * 2 ); ctx.stroke();

		}
		if ( tool === 'reference' && referenceVisible ) {

			const bounds = imageBounds( reference, x, y, width, height, referencePlacement );
			if ( bounds ) {

				ctx.save();
				ctx.strokeStyle = '#ffae66';
				ctx.lineWidth = 1 / view.scale;
				ctx.setLineDash( [ 5 / view.scale, 4 / view.scale ] );
				ctx.strokeRect( ...bounds );
				ctx.restore();

			}

		}
		ctx.restore();
		ctx.strokeStyle = vectorMode ? gridColor : '#68778a';
		if ( vectorMode ) ctx.globalAlpha = .22;
		ctx.strokeRect( x, y, width, height );
		ctx.restore();
		brushSettings.hidden = ! usesPalette();
		canvas.style.cursor = tool === 'pickColor' ? 'crosshair' : tool === 'reference' ? 'move' : '';
		if ( usesPalette() ) { palette.refresh(); palette.showStrokeOptions( tool === 'stroke' ); palette.showTipOptions( tool !== 'stroke' ); }
		radiusLabel.hidden = strengthLabel.hidden = ! [ 'push', 'smooth', 'pinch' ].includes( tool );
		deletePoint.disabled = ! canRemoveVertex();
		for ( const [ id, button ] of tools ) button.setAttribute( 'aria-pressed', String( id === tool ) );

	}

	function pointer( event ) {

		return view.point( event );

	}
	function bounded( point ) {

		return uv( point ).map( value => Math.max( 0, Math.min( 1, value ) ) );

	}
	function hitShape( point ) {

		const order = [ active, ...shapes.map( ( _, i ) => i ).reverse().filter( i => i !== active ) ];
		for ( const i of order ) {

			const shape = shapes[ i ];
			if ( ! shape ) continue;
			const hit = shape.points.findIndex( p => distance( pixel( p ), point ) < 8 / view.scale );
			if ( hit >= 0 ) return [ i, hit ];
			const closed = shape.closed !== false;
			trace( shape.points, closed );
			ctx.save();
			ctx.lineWidth = 12;
			const hitStroke = ctx.isPointInStroke( ...point );
			ctx.restore();
			if ( hitStroke || ( closed && ctx.isPointInPath( ...point, 'evenodd' ) ) ) return [ i, -1 ];

		}
		return [ -1, -1 ];

	}

	canvas.onpointerdown = event => {

		if ( event.button !== 0 ) return;
		const point = pointer( event );
		if ( uv( point ).some( value => value < 0 || value > 1 ) ) return;
		if ( tool === 'pickColor' ) {

			const color = pickColor( vectorCanvas, ...uv( point ) );
			status.textContent = color ? 'Picked ' + color + '.' : 'No readable color at this point.';
			if ( color ) tool = beforeColorPick;
			draw();
			return;

		}
		if ( tool === 'guideCenter' ) { guideCenter = uv( point ); tool = 'stroke'; draw(); return; }
		canvas.focus( { preventScroll: true } );
		if ( tool === 'polygon' ) {

			const closes = draft.length > 2 && distance( pixel( draft[ 0 ] ), point ) < 9;
			if ( ! closes && ( ! draft.length || distance( pixel( draft.at( -1 ) ), point ) > 3 ) ) draft.push( uv( point ) );
			draw();
			return;

		}
		if ( tool === 'edit' || transforms() && active < 0 ) [ active, vertex ] = hitShape( point );
		if ( ( transforms() || [ 'edit', 'push', 'smooth', 'pinch' ].includes( tool ) ) && ! shapes[ active ] ) { refresh(); return; }
		gesture = { start: point, last: point, before: snapshot(), moved: false };
		cursor = point;
		if ( tool === 'reference' ) gesture.referenceScale = event.shiftKey;
		if ( tool === 'stroke' ) {

			gesture.brush = { ...pencilBrush( editor ) };
			if ( gesture.brush.stabilize || event.shiftKey ) gesture.stabilizer = point.slice();

		}
		if ( pencilRaster() ) {

			const stroke = { brush: { ...pencilBrush( editor ) }, erase: tool === 'erase', samples: [] };
			gesture.paint = stroke;
			gesture.pressure = brushPressure( event );
			gesture.dab = ( x, y, force ) => {

				if ( x < 0 || x > textureWidth || y < 0 || y > textureHeight || stroke.brush.pressureOpacity && force === 0 ) return;
				stroke.samples.push( [ x, y, force ] );
				rasterDab( stroke, x, y, force );

			};
			gesture.sample = brushStroke( stroke.brush, ...texturePoint( point ), gesture.pressure, gesture.dab );

		}
		draft = [ 'freehand', 'stroke' ].includes( tool ) ? [ uv( point ) ] : [];
		canvas.setPointerCapture( event.pointerId );
		refresh();

	};
	canvas.onpointermove = event => {

		let point = cursor = pointer( event );
		if ( gesture?.brush && ( gesture.brush.stabilize || event.shiftKey ) ) {

			gesture.stabilizer ||= gesture.last.slice();
			const radius = gesture.brush.stabilizeRadius * canvas.width / canvas.getBoundingClientRect().width / view.scale;
			point = stabilizePointer( gesture.stabilizer, ...point, radius ).slice();

		} else if ( gesture ) gesture.stabilizer = null;
		if ( ! gesture ) { draw(); return; }
		if ( ! gesture.paint && tool !== 'stroke' && distance( point, gesture.last ) < 3 ) return;
		if ( gesture.brush ) point = guidePencilPoint( point, gesture.start, pixel( guideCenter ), gesture.brush.guide,
			THREE.MathUtils.degToRad( gesture.brush.guideAngle ) );
		const start = bounded( gesture.start ), end = bounded( point );
		const delta = end.map( ( value, i ) => value - start[ i ] );
		const shape = shapes[ active ];
		if ( gesture.paint ) {

			const pressure = brushPressure( event );
			if ( pressure > 0 ) {
				gesture.pressure = pressure;
				if ( ! gesture.paint.samples.length ) gesture.dab( ...texturePoint( point ), pressure );
			}
			gesture.sample( ...texturePoint( point ), pressure );

		}
		else if ( tool === 'reference' ) {

			const placement = gesture.before.referencePlacement;
			const [ dx, dy ] = uv( point ).map( ( value, axis ) => value - start[ axis ] );
			referencePlacement = readReferencePlacement( gesture.referenceScale ? { ...placement, scale: placement.scale * 2 ** ( -3 * dy ) } :
				{ ...placement, x: placement.x + dx, y: placement.y + dy } );

		} else if ( transforms() ) {

			const original = gesture.before.shapes[ active ].points;
			const center = [ 0, 1 ].map( axis => original.reduce( ( sum, p ) => sum + p[ axis ], 0 ) / original.length );
			shape.points = original.map( p => transformCanvasPoint( tool, p, start, end, center ) );

		} else if ( tool === 'edit' ) {

			const original = gesture.before.shapes[ active ].points;
			shape.points = original.map( ( p, i ) => vertex >= 0 && vertex !== i ? p : p.map( ( value, axis ) => value + delta[ axis ] ) );

		} else if ( tool === 'freehand' || tool === 'stroke' ) {

			if ( distance( draft.at( -1 ), end ) > 1e-8 ) draft.push( end );

		}
		else if ( tool === 'rectangle' ) draft = [ start, [ end[ 0 ], start[ 1 ] ], end, [ start[ 0 ], end[ 1 ] ] ];
		else if ( tool === 'ellipse' ) draft = Array.from( { length: 48 }, ( _, i ) => {

			const angle = i / 48 * Math.PI * 2;
			return [ start[ 0 ] + delta[ 0 ] * ( 1 + Math.cos( angle ) ) / 2, start[ 1 ] + delta[ 1 ] * ( 1 + Math.sin( angle ) ) / 2 ];

		} );
		else {

			const step = point.map( ( value, i ) => value - gesture.last[ i ] );
			shape.points = sculptMask( shape.points.map( pixel ), point, step, Number( radius.value ), event.shiftKey ? 'smooth' : tool,
				Number( strength.value ) * brushPressure( event ), shape.closed !== false ).map( uv );

		}
		gesture.last = point;
		gesture.moved = true;
		draw();

	};
	canvas.onpointerup = event => {

		if ( ! gesture ) return;
		if ( gesture.paint ) {

			const { samples } = gesture.paint;
			const end = texturePoint( pointer( event ) );
			gesture.sample( ...end, gesture.pressure );
			if ( ! samples.length ) gesture.dab( ...texturePoint( gesture.start ), gesture.pressure || .5 );
			else if ( samples.length === 1 && distance( end, samples[ 0 ] ) >= .25 ) gesture.dab( ...end, gesture.pressure );
			remember( gesture.before );
			brushStrokes.push( gesture.paint );

		} else if ( tool === 'stroke' && draft.length ) {

			if ( distance( pointer( event ), cursor ) > 1e-8 ) canvas.onpointermove( event );

			const { color, size, strength, smoothing, simplify, grain, grainScale, grainPattern } = gesture.brush;
			const tolerance = simplify * canvas.width / canvas.getBoundingClientRect().width / view.scale;
			const points = simplifyPencilStroke( smoothPencilStroke( pencilPoints( draft ), smoothing ), pixel, tolerance );
			addShape( { points, closed: false, color, width: size / Math.min( textureWidth, textureHeight ), pencilStroke: true, opacity: strength, grain, grainScale, grainPattern, name: 'Stroke ' + ( shapes.length + 1 ) }, 'stroke' );

		}
		else if ( draft.length >= 3 && ( tool === 'freehand' || gesture.last.every( ( value, axis ) => Math.abs( value - gesture.start[ axis ] ) > 3 ) ) ) closeDraft();
		else if ( gesture.moved && ( transforms() || [ 'edit', 'push', 'smooth', 'pinch', 'reference' ].includes( tool ) ) ) remember( gesture.before );
		gesture = null;
		draft = [];
		refresh();

	};
	canvas.onpointercancel = () => {

		if ( gesture ) ( { shapes, brushStrokes, active, vertex, referencePlacement } = gesture.before );
		repaint();
		gesture = null;
		draft = [];
		refresh();

	};
	canvas.onlostpointercapture = () => { if ( gesture ) canvas.onpointercancel(); };
	canvas.onpointerleave = () => { cursor = null; if ( ! gesture ) draw(); };
	canvas.ondblclick = event => {

		if ( tool === 'polygon' && draft.length > 2 && distance( pixel( draft[ 0 ] ), pointer( event ) ) < 9 ) { closeDraft(); return; }
		if ( tool !== 'edit' || vertex >= 0 || ! shapes[ active ] ) return;
		const shape = shapes[ active ], point = pointer( event );
		const points = shape.points, pixels = points.map( pixel );
		let best, threshold = 12;
		for ( let i = 0; i < segmentCount( points, shape.closed !== false ); i ++ ) {

			const { distance, fraction } = closestPointOnSegment( point, pixels[ i ], pixels[ ( i + 1 ) % pixels.length ] );
			if ( distance < threshold && fraction > 0 && fraction < 1 ) { threshold = distance; best = [ i, fraction ]; }

		}
		if ( best ) change( () => { vertex = insertContourPoint( points, ...best ); } );

	};
	workspacePanel.onkeydown = event => {

		if ( ! [ 'INPUT', 'SELECT', 'TEXTAREA' ].includes( event.target.tagName ) && [ 'push', 'smooth', 'pinch' ].includes( tool ) && ! event.metaKey && ! event.ctrlKey && ! event.altKey &&
			( [ 'BracketLeft', 'BracketRight' ].includes( event.code ) || [ '[', ']', '{', '}' ].includes( event.key ) ) ) {

			event.preventDefault(); event.stopPropagation();
			const smaller = event.code === 'BracketLeft' || [ '[', '{' ].includes( event.key );
			if ( event.shiftKey ) strength.value = Math.max( .05, Math.min( 1, Number( strength.value ) + ( smaller ? -.05 : .05 ) ) );
			else radius.value = Math.max( 12, Math.min( 130, Math.round( Number( radius.value ) * ( smaller ? 1 / 1.2 : 1.2 ) ) ) );
			draw(); return;

		}
		if ( [ 'INPUT', 'SELECT', 'BUTTON' ].includes( event.target.tagName ) ) return;
		const key = event.key.toLowerCase();
		if ( ! gesture && usesPalette() && useBrushShortcut( editor, event ) ) {

			event.preventDefault();
			event.stopPropagation();
			draw();
			return;

		}
		if ( key === 'home' ) { event.preventDefault(); view.fit(); return; }
		if ( vectorMode && ! gesture && ! event.ctrlKey && ! event.metaKey && ! event.altKey ) {

			const next = { d: 'stroke', b: 'raster', g: 'move', r: 'rotate', s: 'scale' }[ key ];
			if ( next ) { event.preventDefault(); tool = next; draw(); return; }

		}
		if ( key === 'enter' && tool === 'polygon' && draft.length ) { event.preventDefault(); closeDraft(); }
		if ( key === 'f' && vectorMode && [ 'edit', 'stroke' ].includes( tool ) && ! ( event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ) ) {

			event.preventDefault();
			toggleCyclic();

		}
		if ( key === 'delete' || key === 'backspace' || key === 'x' && ! ( event.ctrlKey || event.metaKey || event.altKey ) ) { event.preventDefault(); removeVertex(); }
		if ( key === 'z' && ( event.metaKey || event.ctrlKey ) ) {

			event.preventDefault();
			if ( event.shiftKey ) restore( redo, undo );
			else restore( undo, redo );

		}

	};
	const abortDraft = event => {

		if ( event.key !== 'Escape' || ( ! draft.length && ! gesture ) ) return;
		event.preventDefault();
		canvas.onpointercancel();

	};
	workspacePanel.addEventListener( 'keydown', abortDraft );
	const resizeCanvas = vectorMode ? new ResizeObserver( ( [ entry ] ) => {

		const width = Math.max( 1, Math.round( entry.contentRect.width ) );
		const height = Math.max( 1, Math.round( entry.contentRect.height ) );
		if ( canvas.width === width && canvas.height === height ) return;
		if ( gesture ) canvas.onpointercancel();
		canvas.width = width;
		canvas.height = height;
		draw();

	} ) : null;
	const tick = light?.projectorOutput && setInterval( draw, 150 );
	editor.editWorkspace.mount( vectorMode ? 'image' : 'mask', light, workspacePanel, () => {

		clearInterval( tick );
		resizeCanvas?.disconnect();
		textureRequest = undefined;
		cancelReferenceLoad();
		cancelReferencePicker();

	} );
	if ( resizeCanvas ) resizeCanvas.observe( canvas );
	refresh();
	if ( texturePath ) {

		const file = editor.sourceFiles.get( texturePath )?.file;
		if ( file ) loadTexture( file, texturePath, () => true, true );
		else status.textContent = 'The source texture is missing from Project assets.';

	}
	if ( referencePath ) {

		const file = editor.sourceFiles.get( referencePath )?.file;
		if ( file ) loadReference( file, referencePath );
		else status.textContent = 'The saved reference image is missing from Project assets.';

	}
	if ( showPicker ) search.focus();
	else canvas.focus( { preventScroll: true } );

}
