import { icon } from '../Glyphs.js?v=poly-context';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import * as THREE from 'three';
import { canvasView, transformCanvasPoint, transformTools2D } from './Canvas2DTools.js?v=pencil-stroke-depth';
import { brushDab, brushPalette, brushPressure, brushStroke, pencilBrush, useBrushShortcut } from './PencilBrush.js?v=pencil-stabilizer';
import { simplifyPencilStroke, smoothPencilStroke, stabilizePointer } from './PencilStroke.js';
import { modelButton } from './ModelControls.js?v=pencil-stroke-depth';
import { applyProjectionMask, maskFromOutline, maskShapes } from './ProjectionMask.js?v=mask-editor';
import { canEditLightMask, setLightMask } from './LightMask.js?v=mask-editor';
import { isClosedOutline, modelObject, outlinePoints } from './ModelGeometry.js?v=contour-editing';
import { lightViewCamera } from './LightView.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { sculptMask } from './MaskSculpt.js?v=brush-shortcuts';
import { closestPointOnSegment, fitDrawingContour, insertContourPoint, segmentCount } from './Contour.js';

export function openMaskEditor( editor, light, showPicker = false, vectorMode = false ) {

	if ( ! vectorMode && ! canEditLightMask( light ) ) return;
	const scene = editor.scene;
	const saved = () => vectorMode ? scene.userData.vectorDrawing : light.userData.projectionMask;
	let initial = saved();
	let reference, referenceURL;
	let referenceVisible = true;
	let shapes = maskShapes( initial ), active = shapes.length - 1, vertex = -1, tool = 'edit', draft = [], gesture;
	const undo = [], redo = [];
	let brushStrokes = vectorMode ? structuredClone( initial?.brushStrokes || [] ) : [];
	const raster = vectorMode ? document.createElement( 'canvas' ) : null;
	const rasterSize = 1024;
	if ( raster ) raster.width = raster.height = rasterSize;
	const rasterContext = raster?.getContext( '2d' );
	const usesPalette = () => [ 'stroke', 'raster', 'erase' ].includes( tool );
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
	node( 'h3', workspacePanel, vectorMode ? 'Image and vector editor' : ( light.name || light.type ) + ' · Mask editor' );
	const toolbar = node( 'div', workspacePanel );
	const tools = new Map();
	const addTool = ( id, label, glyph ) => tools.set( id, modelButton( toolbar, label, glyph, () => {

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
		for ( const [ id, label, glyph ] of transformTools2D ) addTool( id, label, glyph );

	}
	addTool( 'pan', 'Pan', 'hand' );
	modelButton( toolbar, 'Frame All', 'frame', () => view.fit() );
	addTool( 'rectangle', 'Draw rectangle', 'toolGrid' );
	addTool( 'ellipse', 'Draw ellipse', 'brushWidth' );
	addTool( 'push', 'Push brush', 'sculptTool' );
	addTool( 'smooth', 'Smooth brush', 'toolPath' );
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
	toolbar.className = 'editor-2d-tools';
	workspace.append( toolbar );
	const canvas = node( 'canvas', workspace );
	canvas.setAttribute( 'aria-label', vectorMode ? 'Vector drawing canvas' : 'Projection frame' );
	canvas.tabIndex = 0;
	canvas.width = 760;
	canvas.height = 490;
	const ctx = canvas.getContext( '2d' );
	const view = canvasView( canvas, draw, () => tool === 'pan' && ! gesture );
	const brushSettings = node( 'div' );
	brushSettings.className = 'canvas-pencil-settings';
	const palette = vectorMode && brushPalette( editor, brushSettings, draw, { strokeOptions: true } );
	if ( palette ) workspace.after( brushSettings );
	const panel = node( 'aside', workspace );
	node( 'label', panel, vectorMode ? 'Contours' : 'Mask shapes' ).htmlFor = 'mask-shape-list';
	const layers = node( 'select', panel );
	layers.id = 'mask-shape-list';
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
	const createCurve = vectorMode && modelButton( layerActions, 'Create scene curve', 'toolPath', () => createSceneObject( 'path' ) );
	const createShape = vectorMode && modelButton( layerActions, 'Create filled scene shape', 'fillTool', () => createSceneObject( 'shape' ) );

	function createSceneObject( kind ) {

		const shape = shapes[ active ];
		const points = shape.points.map( ( [ u, v ] ) => [ 2 * u - 1, 1 - 2 * v, 0 ] );
		const closed = shape.closed !== false;
		const object = modelObject( THREE, { kind, points, closed, planar: true, smooth: false }, kind === 'shape' ? shape.name + ' fill' : shape.name );
		object.material.color.set( color( shape ) );
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
	status.setAttribute( 'role', 'status' );
	if ( vectorMode ) {

		const media = node( 'div', panel );
		const upload = node( 'input', media );
		upload.type = 'file';
		upload.accept = 'image/*';
		upload.hidden = true;
		modelButton( media, 'Open reference image', 'assets', () => upload.click() );
		const toggle = modelButton( media, 'Show reference image', 'scene', () => {

			referenceVisible = ! referenceVisible;
			toggle.setAttribute( 'aria-pressed', String( referenceVisible ) );
			draw();

		} );
		toggle.setAttribute( 'aria-pressed', 'true' );
		upload.onchange = () => {

			const file = upload.files[ 0 ];
			if ( ! file ) return;
			if ( referenceURL ) URL.revokeObjectURL( referenceURL );
			const image = new Image();
			reference = image;
			image.onload = draw;
			image.onerror = () => { status.textContent = 'The image could not be decoded.'; };
			image.src = referenceURL = URL.createObjectURL( file );
			image.alt = file.name;
			upload.value = '';

		};
		modelButton( footer, 'Export SVG', 'code', exportSVG );
		modelButton( footer, 'Export PNG', 'save', exportPNG );

	}

	modelButton( footer, vectorMode ? 'Apply drawing' : 'Apply masks', 'apply', () => {

		try {

			if ( draft.length ) throw new Error( 'Close the polygon with Enter, or press Escape to discard it.' );
			if ( saved() !== initial ) throw new Error( 'The saved shapes changed. Reopen the editor to continue.' );
			const value = { shapes: structuredClone( shapes ) };
			if ( vectorMode && brushStrokes.length ) value.brushStrokes = structuredClone( brushStrokes );
			if ( vectorMode ) {

				const command = new SetValueCommand( editor, scene, 'userData', { ...scene.userData, vectorDrawing: value } );
				command.updatable = false;
				editor.execute( command, 'Edit vector drawing' );

			} else setLightMask( editor, light, shapes.length ? value : null );
			initial = saved();
			status.textContent = vectorMode ? 'Drawing applied.' : 'Masks applied.';

		} catch ( error ) { status.textContent = error.message; }

	} );


	function snapshot() {

		return { shapes: structuredClone( shapes ), brushStrokes: brushStrokes.slice(), active, vertex };

	}
	function remember( state = snapshot() ) {

		undo.push( state );
		if ( undo.length > 60 ) undo.shift();
		redo.length = 0;

	}
	function restore( from, to ) {

		if ( ! from.length || gesture ) return;
		to.push( snapshot() );
		( { shapes, brushStrokes, active, vertex } = from.pop() );
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
					closed: isClosedOutline( data ), color: material?.color && '#' + material.color.getHexString() } );
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

		layers.replaceChildren( ...shapes.map( shape => new Option( ( shape.mode === 'cutout' ? '− ' : '+ ' ) + shape.name ) ) );
		layers.selectedIndex = active;
		const shape = shapes[ active ];
		name.value = shape?.name || '';
		mode.value = shape?.mode || 'inside';
		name.disabled = mode.disabled = remove.disabled = duplicate.disabled = ! shape;
		if ( fill ) {

			const closed = shape?.closed !== false;
			createCurve.disabled = ! shape;
			createShape.disabled = ! shape || ! closed || shape.mode === 'cutout' || shape.points.length < 3;
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
	function color( shape ) {

		return /^#[0-9a-f]{6}$/i.test( shape?.color ) ? shape.color : '#72cbef';

	}
	function drawImage( target, image, x, y, width, height ) {

		const iw = image?.videoWidth || image?.naturalWidth || image?.width;
		const ih = image?.videoHeight || image?.naturalHeight || image?.height;
		if ( ! iw || ! ih ) return;
		const scale = Math.min( width / iw, height / ih );
		try { target.drawImage( image, x + ( width - iw * scale ) / 2, y + ( height - ih * scale ) / 2, iw * scale, ih * scale ); }
		catch { /* Wait for a decoded image. */ }

	}
	function lineWidth( shape ) {

		return Number.isFinite( shape.width ) ? Math.max( .001, Math.min( .25, shape.width ) ) : .004;

	}
	function lineOpacity( shape ) {

		return Number.isFinite( shape.opacity ) ? Math.max( 0, Math.min( 1, shape.opacity ) ) : 1;

	}
	function drawVectors( target, width, height ) {

		target.save();
		for ( const operation of [ 'inside', 'cutout' ] ) for ( const shape of shapes ) {

			if ( shape.mode !== operation ) continue;
			target.globalCompositeOperation = operation === 'cutout' ? 'destination-out' : 'source-over';
			target.beginPath();
			shape.points.forEach( ( [ x, y ], i ) => target[ i ? 'lineTo' : 'moveTo' ]( x * width, y * height ) );
			if ( shape.closed === false ) {

				target.strokeStyle = color( shape );
				target.lineWidth = width * lineWidth( shape );
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
		rasterContext.clearRect( 0, 0, rasterSize, rasterSize );
		for ( const stroke of brushStrokes ) for ( const [ x, y, force ] of stroke.samples ) rasterDab( stroke, x, y, force );

	}
	repaint();

	function exportSVG() {

		const layers = operation => shapes.filter( shape => shape.mode === operation ).map( shape => {

			const path = shape.points.map( ( [ x, y ], i ) => ( i ? 'L' : 'M' ) + ( x * 1000 ).toFixed( 2 ) + ' ' + ( y * 1000 ).toFixed( 2 ) ).join( ' ' );
			if ( shape.closed === false ) return '<path fill="none" stroke="' + color( shape ) + '" stroke-width="' + ( 1000 * lineWidth( shape ) ).toFixed( 2 ) +
				'" stroke-opacity="' + lineOpacity( shape ) + '" stroke-linecap="round" stroke-linejoin="round" d="' + path + '"/>';
			return '<path fill="' + ( operation === 'cutout' ? 'black' : color( shape ) ) + '" fill-rule="evenodd" d="' + path + ' Z"/>';

		} ).join( '' );
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><mask id="cutouts"><rect width="1000" height="1000" fill="white"/>' +
			layers( 'cutout' ) + '</mask></defs><g mask="url(#cutouts)">' +
			( brushStrokes.length ? '<image width="1000" height="1000" href="' + raster.toDataURL() + '"/>' : '' ) +
			layers( 'inside' ) + '</g></svg>';
		editor.utils.save( new Blob( [ svg ], { type: 'image/svg+xml' } ), 'drawing.svg' );

	}
	function exportPNG() {

		const output = document.createElement( 'canvas' );
		const side = output.width = output.height = 1024;
		const target = output.getContext( '2d' );
		if ( referenceVisible ) drawImage( target, reference, 0, 0, side, side );
		target.drawImage( raster, 0, 0 );
		drawVectors( target, side, side );
		output.toBlob( blob => { if ( blob ) editor.utils.save( blob, 'drawing.png' ); }, 'image/png' );

	}

	function draw() {

		const output = light?.projectorOutput;
		const image = vectorMode ? ( referenceVisible && reference ) : output?.source || ( ! output && light.map?.image );
		const aspect = light?.projectorFrame?.aspect || 1;
		const width = Math.min( canvas.width - 36, ( canvas.height - 36 ) * aspect ), height = width / aspect;
		frame = { x: ( canvas.width - width ) / 2, y: ( canvas.height - height ) / 2, width, height };
		const { x, y } = frame;
		ctx.fillStyle = '#13171e';
		ctx.fillRect( 0, 0, canvas.width, canvas.height );
		ctx.save();
		view.apply( ctx );
		ctx.save();
		ctx.beginPath();
		ctx.rect( x, y, width, height );
		ctx.clip();
		ctx.fillStyle = '#343d48';
		ctx.fillRect( x, y, width, height );
		ctx.strokeStyle = '#4f5a66';
		for ( let i = 1; i < 8; i ++ ) {

			ctx.beginPath();
			ctx.moveTo( x + width * i / 8, y ); ctx.lineTo( x + width * i / 8, y + height );
			ctx.moveTo( x, y + height * i / 8 ); ctx.lineTo( x + width, y + height * i / 8 );
			ctx.stroke();

		}
		if ( vectorMode ) {

			const w = Math.ceil( width ), h = Math.ceil( height );
			if ( vectorCanvas.width !== w ) vectorCanvas.width = w;
			if ( vectorCanvas.height !== h ) vectorCanvas.height = h;
			const layer = vectorCanvas.getContext( '2d' );
			layer.clearRect( 0, 0, w, h );
			drawImage( layer, image, 0, 0, w, h );
			layer.drawImage( raster, 0, 0, w, h );
			drawVectors( layer, w, h );
			ctx.drawImage( vectorCanvas, x, y, width, height );

		} else {

			drawImage( ctx, image, x, y, width, height );
			applyProjectionMask( ctx, { shapes }, x, y, width, height );

		}
		for ( const [ index, shape ] of shapes.entries() ) {

			trace( shape.points, shape.closed !== false );
			ctx.strokeStyle = shape.mode === 'cutout' ? '#ff9e71' : '#74dcf3';
			ctx.lineWidth = active === index ? 2 : 1;
			ctx.stroke();
			if ( index === active && tool === 'edit' ) shape.points.forEach( ( point, i ) => {

				ctx.fillStyle = vertex === i ? '#ffb459' : '#74dcf3';
				ctx.beginPath(); ctx.arc( ...pixel( point ), 3, 0, Math.PI * 2 ); ctx.fill();

			} );

		}
		if ( draft.length ) {

			trace( draft, tool !== 'polygon' && tool !== 'stroke' );
			ctx.strokeStyle = '#fff';
			ctx.stroke();
			ctx.fillStyle = '#fff';
			ctx.beginPath(); ctx.arc( ...pixel( draft[ 0 ] ), 4, 0, Math.PI * 2 ); ctx.fill();

		}
		if ( cursor && gesture?.stabilizer ) {

			ctx.strokeStyle = '#ffae66';
			ctx.lineWidth = 1 / view.scale;
			ctx.beginPath();
			ctx.moveTo( ...gesture.stabilizer );
			ctx.lineTo( ...cursor );
			ctx.stroke();

		}
		if ( cursor && [ 'push', 'smooth', 'raster', 'erase' ].includes( tool ) ) {

			ctx.strokeStyle = '#fff';
			ctx.beginPath(); ctx.arc( ...cursor, usesPalette() ? pencilBrush( editor ).size * width / rasterSize / 2 : Number( radius.value ), 0, Math.PI * 2 ); ctx.stroke();

		}
		ctx.restore();
		ctx.strokeStyle = '#68778a';
		ctx.strokeRect( x, y, width, height );
		ctx.restore();
		brushSettings.hidden = ! usesPalette();
		if ( usesPalette() ) { palette.refresh(); palette.showStrokeOptions( tool === 'stroke' ); }
		radiusLabel.hidden = strengthLabel.hidden = ! [ 'push', 'smooth' ].includes( tool );
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
		canvas.focus( { preventScroll: true } );
		if ( tool === 'polygon' ) {

			const closes = draft.length > 2 && distance( pixel( draft[ 0 ] ), point ) < 9;
			if ( ! closes && ( ! draft.length || distance( pixel( draft.at( -1 ) ), point ) > 3 ) ) draft.push( uv( point ) );
			draw();
			return;

		}
		if ( tool === 'edit' || transforms() && active < 0 ) [ active, vertex ] = hitShape( point );
		if ( ( transforms() || [ 'edit', 'push', 'smooth' ].includes( tool ) ) && ! shapes[ active ] ) { refresh(); return; }
		gesture = { start: point, last: point, before: snapshot(), moved: false };
		if ( tool === 'stroke' ) {

			gesture.brush = { ...pencilBrush( editor ) };
			if ( gesture.brush.stabilize ) gesture.stabilizer = point.slice();

		}
		if ( pencilRaster() ) {

			const stroke = { brush: { ...pencilBrush( editor ) }, erase: tool === 'erase', samples: [] };
			gesture.paint = stroke;
			gesture.sample = brushStroke( stroke.brush, ...uv( point ).map( value => value * rasterSize ), brushPressure( event ), ( x, y, force ) => {

				if ( x < 0 || x > rasterSize || y < 0 || y > rasterSize ) return;
				stroke.samples.push( [ x, y, force ] );
				rasterDab( stroke, x, y, force );

			} );

		}
		draft = [ 'freehand', 'stroke' ].includes( tool ) ? [ uv( point ) ] : [];
		canvas.setPointerCapture( event.pointerId );
		refresh();

	};
	canvas.onpointermove = event => {

		let point = cursor = pointer( event );
		if ( gesture?.stabilizer ) {

			const radius = gesture.brush.stabilizeRadius * canvas.width / canvas.getBoundingClientRect().width / view.scale;
			point = stabilizePointer( gesture.stabilizer, ...point, radius ).slice();

		}
		if ( ! gesture ) { draw(); return; }
		if ( distance( point, gesture.last ) < 3 ) return;
		const start = bounded( gesture.start ), end = bounded( point );
		const delta = end.map( ( value, i ) => value - start[ i ] );
		const shape = shapes[ active ];
		if ( gesture.paint ) gesture.sample( ...uv( point ).map( value => value * rasterSize ), brushPressure( event ) );
		else if ( transforms() ) {

			const original = gesture.before.shapes[ active ].points;
			const center = [ 0, 1 ].map( axis => original.reduce( ( sum, p ) => sum + p[ axis ], 0 ) / original.length );
			shape.points = original.map( p => transformCanvasPoint( tool, p, start, end, center ) );

		} else if ( tool === 'edit' ) {

			const original = gesture.before.shapes[ active ].points;
			shape.points = original.map( ( p, i ) => vertex >= 0 && vertex !== i ? p : p.map( ( value, axis ) => value + delta[ axis ] ) );

		} else if ( tool === 'freehand' || tool === 'stroke' ) draft.push( end );
		else if ( tool === 'rectangle' ) draft = [ start, [ end[ 0 ], start[ 1 ] ], end, [ start[ 0 ], end[ 1 ] ] ];
		else if ( tool === 'ellipse' ) draft = Array.from( { length: 48 }, ( _, i ) => {

			const angle = i / 48 * Math.PI * 2;
			return [ start[ 0 ] + delta[ 0 ] * ( 1 + Math.cos( angle ) ) / 2, start[ 1 ] + delta[ 1 ] * ( 1 + Math.sin( angle ) ) / 2 ];

		} );
		else {

			const step = point.map( ( value, i ) => value - gesture.last[ i ] );
			shape.points = sculptMask( shape.points.map( pixel ), point, step, Number( radius.value ), event.shiftKey ? 'smooth' : tool,
				Number( strength.value ) * ( event.pointerType === 'pen' ? event.pressure || .5 : 1 ), shape.closed !== false ).map( uv );

		}
		gesture.last = point;
		gesture.moved = true;
		draw();

	};
	canvas.onpointerup = () => {

		if ( ! gesture ) return;
		if ( gesture.paint ) {

			remember( gesture.before );
			brushStrokes.push( gesture.paint );

		} else if ( tool === 'stroke' && draft.length >= 2 ) {

			const { color, size, strength, smoothing, simplify } = gesture.brush;
			const tolerance = simplify * canvas.width / canvas.getBoundingClientRect().width / view.scale;
			const points = simplifyPencilStroke( smoothPencilStroke( draft, smoothing ), pixel, tolerance );
			addShape( { points, closed: false, color, width: size / rasterSize, opacity: strength, name: 'Stroke ' + ( shapes.length + 1 ) }, 'stroke' );

		}
		else if ( draft.length >= 3 && ( tool === 'freehand' || gesture.last.every( ( value, axis ) => Math.abs( value - gesture.start[ axis ] ) > 3 ) ) ) closeDraft();
		else if ( gesture.moved && ( transforms() || [ 'edit', 'push', 'smooth' ].includes( tool ) ) ) remember( gesture.before );
		gesture = null;
		draft = [];
		refresh();

	};
	canvas.onpointercancel = () => {

		if ( gesture ) ( { shapes, brushStrokes, active, vertex } = gesture.before );
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

		if ( ! [ 'INPUT', 'SELECT', 'TEXTAREA' ].includes( event.target.tagName ) && [ 'push', 'smooth' ].includes( tool ) && ! event.metaKey && ! event.ctrlKey && ! event.altKey &&
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

			const next = { d: 'stroke', g: 'move', r: 'rotate', s: 'scale' }[ key ];
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
	const tick = light?.projectorOutput && setInterval( draw, 150 );
	editor.editWorkspace.mount( vectorMode ? 'image' : 'mask', light, workspacePanel, () => {

		clearInterval( tick );
		if ( reference ) reference.onload = reference.onerror = null;
		if ( referenceURL ) URL.revokeObjectURL( referenceURL );

	} );
	refresh();
	if ( showPicker ) search.focus();
	else canvas.focus( { preventScroll: true } );

}
