import * as THREE from 'three';
import { unwrapUVs } from 'three/addons/utils/unwrapUVs.js';
import { modifierSource, setModifierStack } from './Modifiers.js?v=poly-context';
import { bakeTexture } from './TextureBake.js';
import { lightViewCamera } from './LightView.js';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { isProjector, upgradeProjectorScript } from '../assets/Projector.js?v=mask-editor';
import { SetScriptValueCommand } from '../commands/SetScriptValueCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { modelButton } from './ModelControls.js?v=pencil-stroke-depth';
import { canvasView, createCanvasShelf, selectionTools2D, transformCanvasPoint, transformTools2D } from './Canvas2DTools.js?v=pencil-stroke-depth';
import { selectionRegionContains } from './MeshSelection.js?v=shape-selection';
import { brushPalette, brushPressure, brushStroke, pencilBrush, useBrushShortcut } from './PencilBrush.js?v=pencil-guides';
import { TexturePaintStroke } from './TexturePaint.js?v=pencil-guides';
import { layoutUV } from './UVLayout.js?v=unwrap-modes';

export function setProjectorMapping( editor, projector, key, value ) {

	if ( ! isProjector( projector ) || hasRestriction( projector, 'locked' ) || hasRestriction( projector, 'disabled' ) ) throw new Error( 'Select an unlocked, enabled projector.' );
	const script = editor.scripts[ projector.uuid ]?.find( item => item.assetBehavior === 'projector' );
	if ( ! script ) throw new Error( 'Attach a projector behavior first.' );
	const upgraded = { ...script };
	upgradeProjectorScript( upgraded );
	if ( ! upgraded.source.includes( 'function drawTargetAperture(' ) ) throw new Error( 'This projector script needs the standard mapping runtime.' );
	const userData = { ...projector.userData };
	if ( value ) userData[ key ] = value;
	else delete userData[ key ];
	const command = new SetValueCommand( editor, projector, 'userData', userData );
	command.updatable = false;
	const edit = upgraded.source === script.source ? command : new MultiCmdsCommand( editor, [
		new SetScriptValueCommand( editor, projector, script, 'source', upgraded.source ), command
	] );
	editor.execute( edit, key === 'projectorTarget' ? 'Set projector silhouette target' : 'Set projector warp' );

}

export function addProjectorTargetControl( editor, projector, host, run ) {

	const label = document.createElement( 'label' );
	label.textContent = 'Auto-mask target';
	const select = document.createElement( 'select' );
	select.append( new Option( 'None', '' ) );
	editor.scene.traverse( object => {

		if ( object.isMesh && ! object.isInstancedMesh && ! object.userData.runtimeOnly && ! hasRestriction( object, 'disabled' ) ) {
			select.append( new Option( object.name || object.type, object.uuid ) );
		}

	} );
	select.value = projector.userData.projectorTarget || '';
	select.onchange = () => run( () => setProjectorMapping( editor, projector, 'projectorTarget', select.value ) );
	select.setAttribute( 'aria-label', 'Auto-mask target' );
	label.append( select );
	host.append( label );
	modelButton( host, 'Edit projection warp', 'toolGrid', () => openUVEditor( editor, projector ) );

}

export function openUVEditor( editor, object, { focus = true } = {} ) {

	if ( ! object || hasRestriction( object, 'locked' ) || hasRestriction( object, 'disabled' ) ) return;
	const warp = isProjector( object );
	const workspacePanel = document.createElement( 'section' );
	workspacePanel.className = 'mapping-editor';
	workspacePanel.setAttribute( 'aria-label', warp ? 'Projection warp editor' : 'UV editor' );
	const toolbar = document.createElement( 'div' );
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 640;
	canvas.tabIndex = 0;
	canvas.setAttribute( 'aria-label', warp ? 'Projection warp grid' : 'UV grid' );
	const ctx = canvas.getContext( '2d' );
	const status = document.createElement( 'output' );
	status.setAttribute( 'role', 'status' );
	const size = object.userData.projectorWarp?.size || 4;
	const source = () => modifierSource( object );
	let geometry = source();
	let selected = [], dragging, dirty = false;
	let tool = 'select', lastPoint, pivot = [ .5, .5 ];
	const undo = [], redo = [];
	let bake, showBake = true;
	let original = geometry;
	function reset() {

		if ( warp ) return structuredClone( object.userData.projectorWarp?.points || Array.from( { length: size * size },
			( _, i ) => [ i % size / ( size - 1 ), Math.floor( i / size ) / ( size - 1 ) ] ) );
		const uv = geometry.attributes.uv;
		return Array.from( { length: uv?.count || 0 }, ( _, i ) => [ uv.getX( i ), 1 - uv.getY( i ) ] );

	}
	let points = reset();
	const margin = 25, span = canvas.width - margin * 2;
	const pixel = ( [ u, v ] ) => [ margin + u * span, margin + v * span ];
	const pointUV = point => point.map( value => ( value - margin ) / span );
	const view = canvasView( canvas, draw, () => tool === 'pan' && ! dragging );
	const shelf = createCanvasShelf( canvas, [
		...selectionTools2D, [ 'cursor', 'Set 2D Cursor', 'pivotOrigin' ], ...transformTools2D,
		...( warp ? [] : [ [ 'pencil', 'Pencil', 'freehandDraw' ], [ 'erase', 'Erase Texture', 'erase' ] ] ),
		[ 'pan', 'Pan', 'hand' ], [ 'fit', 'Frame All', 'frame' ]
	], id => {

		cancelDrag();
		if ( id === 'fit' ) view.fit();
		else { tool = id; draw(); }

	}, warp ? 'Warp tools' : 'UV tools' );
	const paintControls = document.createElement( 'div' );
	paintControls.className = 'canvas-pencil-settings';
	const palette = ! warp && brushPalette( editor, paintControls, draw );
	const materialSelect = document.createElement( 'select' );
	materialSelect.setAttribute( 'aria-label', 'Material slot' );
	if ( ! warp && Array.isArray( object.material ) ) {

		object.material.forEach( ( material, i ) => materialSelect.append( new Option( material.name || 'Material ' + ( i + 1 ), i ) ) );
		toolbar.append( materialSelect );

	}
	const materialSlot = () => Number( materialSelect.value );
	const paintTool = () => tool === 'pencil' || tool === 'erase';
	const pivotSelect = document.createElement( 'select' );
	pivotSelect.setAttribute( 'aria-label', 'UV transform pivot' );
	pivotSelect.append( new Option( 'Median pivot', 'median' ), new Option( '2D Cursor pivot', 'cursor' ) );
	toolbar.append( pivotSelect );
	modelButton( toolbar, 'Undo UV edit', 'undo', () => restore( undo, redo ) );
	modelButton( toolbar, 'Redo UV edit', 'redo', () => restore( redo, undo ) );
	const layout = document.createElement( 'select' );
	layout.setAttribute( 'aria-label', 'UV layout' );
	function run( action ) {

		try { status.textContent = ''; action(); draw(); }
		catch ( error ) { status.textContent = error.message; }

	}
	let baking;
	if ( ! warp ) {

		const options = ( label, rows ) => {

			const group = document.createElement( 'optgroup' );
			group.label = label;
			group.append( ...rows.map( ( [ id, name ] ) => new Option( name, id ) ) );
			layout.append( group );

		};
		options( 'Unwrap', [ [ 'smart', 'Smart unwrap' ], [ 'lightmap', 'Lightmap pack' ] ] );
		options( 'Projection', [ [ 'box', 'Cube projection' ], [ 'cylinder', 'Cylinder projection (Y)' ],
			[ 'sphere', 'Sphere projection' ], [ 'view', 'Project from view' ],
			[ 'xy', 'Planar XY' ], [ 'xz', 'Planar XZ' ], [ 'yz', 'Planar YZ' ] ] );
		const projectors = [];
		editor.scene.traverse( candidate => { if ( isProjector( candidate ) ) projectors.push( [ candidate.uuid, candidate.name || 'Projector' ] ); } );
		if ( projectors.length ) options( 'Projectors', projectors );
		toolbar.append( layout );
		modelButton( toolbar, 'Auto layout', 'toolGrid', () => run( () => {

			const mode = layout.value;
			let next;
			if ( mode === 'smart' || mode === 'lightmap' ) {

				object.updateWorldMatrix( true, false );
				const proxy = new THREE.Mesh( original, object.material );
				proxy.matrixAutoUpdate = false;
				proxy.matrix.copy( object.matrixWorld );
				const atlas = unwrapUVs( proxy, { mode: mode === 'smart' ? 'normal' : 'lightmap', attribute: 'uv',
					respectUVSeams: false } );
				if ( ! atlas?.charts.length ) { if ( proxy.geometry !== original ) proxy.geometry.dispose(); throw new Error( 'No usable UV islands could be packed.' ); }
				next = proxy.geometry;
				if ( atlas.warnings.excludedFaces ) status.textContent = atlas.warnings.excludedFaces + ' degenerate faces were omitted.';

			} else {

				const view = mode === 'view' ? editor.modeling.frame?.camera : null;
				if ( mode === 'view' && ! view ) throw new Error( 'Open a 3D viewport to project from view.' );
				next = layoutUV( THREE, object, mode, editor.objectByUuid( mode ), view, original );

			}
			if ( geometry !== original ) geometry.dispose();
			geometry = next;
			points = reset();
			undo.length = redo.length = 0;
			selected = [];
			dirty = true;

		} ) );

		baking = document.createElement( 'details' );
		baking.className = 'uv-bake';
		const summary = document.createElement( 'summary' );
		summary.textContent = 'Texture Bake';
		baking.append( summary );
		const controls = document.createElement( 'div' );
		baking.append( controls );
		const bakeMode = document.createElement( 'select' );
		bakeMode.setAttribute( 'aria-label', 'Bake pass' );
		bakeMode.append( new Option( 'Light and shadow guide', 'guide' ), new Option( 'Scene appearance', 'scene' ),
			new Option( 'Masked projector frame', 'projector' ) );
		const bakeSource = document.createElement( 'select' );
		bakeSource.setAttribute( 'aria-label', 'Bake source view' );
		const updateSources = () => {

			const sources = bakeMode.value === 'projector' ? [] : [ new Option( 'Current 3D view', '' ) ];
			editor.scene.traverse( candidate => {

				const projector = isProjector( candidate );
				const optical = projector || candidate.isCamera || candidate.isSpotLight || candidate.isDirectionalLight;
				if ( ( bakeMode.value === 'projector' ? projector : optical ) && ! hasRestriction( candidate, 'disabled' ) && ! candidate.userData.runtimeOnly ) {

					sources.push( new Option( candidate.name || candidate.type, candidate.uuid ) );

				}

			} );
			const last = bakeSource.value;
			bakeSource.replaceChildren( ...sources );
			if ( sources.some( option => option.value === last ) ) bakeSource.value = last;

		};
		updateSources();
		bakeMode.onchange = bakeSource.onfocus = updateSources;
		const resolution = document.createElement( 'select' );
		resolution.setAttribute( 'aria-label', 'Bake resolution' );
		resolution.append( ...[ 256, 512, 1024 ].map( side => new Option( side + ' × ' + side, side ) ) );
		resolution.value = '512';
		controls.append( bakeMode, bakeSource, resolution );
		modelButton( controls, 'Bake texture', 'regenerate', () => run( () => {

			if ( object.userData.modifiers?.length ) throw new Error( 'Apply mesh modifiers before baking this UV layout.' );
			if ( source() !== original ) throw new Error( 'The mesh changed. Reopen the UV editor to continue.' );
			if ( ! points.length ) throw new Error( 'Unwrap the mesh before baking.' );
			const sourceObject = editor.objectByUuid( bakeSource.value );
			const view = sourceObject?.isCamera ? sourceObject : sourceObject ? lightViewCamera( THREE, sourceObject ) : editor.modeling.frame?.camera;
			if ( ! view ) throw new Error( 'Choose a source camera, light or projector.' );
			const camera = view.clone( false );
			view.updateWorldMatrix( true, false );
			view.matrixWorld.decompose( camera.position, camera.quaternion, camera.scale );
			camera.updateMatrixWorld( true );
			const target = new THREE.BufferGeometry().copy( geometry );
			const uv = target.attributes.uv;
			points.forEach( ( [ u, v ], i ) => uv.setXY( i, u, 1 - v ) );
			try {

				const image = bakeTexture( editor.renderer, editor.scene, object, target, camera, {
					mode: bakeMode.value, size: Number( resolution.value ), output: sourceObject?.projectorOutput
				} );
				bake?.geometry.dispose();
				bake = { image, geometry: target, label: bakeMode.selectedOptions[ 0 ].textContent };

			} catch ( error ) { target.dispose(); throw error; }
			showBake = true;
			guide.disabled = download.disabled = addGuide.disabled = false;
			guide.setAttribute( 'aria-pressed', 'true' );
			status.textContent = 'Bake ready. Preview it here, download the PNG, or add a guide mesh.';

		} ) );
		const guide = modelButton( controls, 'Show baked UV guide', 'viewportOverlays', () => {

			showBake = ! showBake;
			guide.setAttribute( 'aria-pressed', String( showBake ) );
			draw();

		}, true );
		const download = modelButton( controls, 'Download bake PNG', 'save', () => {

			bake.image.toBlob( blob => { if ( blob ) editor.utils.save( blob, ( object.name || 'mesh' ) + ' bake.png' ); }, 'image/png' );

		}, true );
		const addGuide = modelButton( controls, 'Add baked guide mesh', 'add', () => run( () => {

			const texture = new THREE.CanvasTexture( bake.image );
			texture.colorSpace = THREE.SRGBColorSpace;
			const material = new THREE.MeshBasicMaterial( { map: texture, side: THREE.DoubleSide, alphaTest: .02,
				polygonOffset: true, polygonOffsetFactor: - 1, polygonOffsetUnits: - 1, toneMapped: false } );
			const mesh = new THREE.Mesh( new THREE.BufferGeometry().copy( bake.geometry ), material );
			mesh.name = ( object.name || 'Mesh' ) + ' · ' + bake.label;
			mesh.position.copy( object.position );
			mesh.quaternion.copy( object.quaternion );
			mesh.scale.copy( object.scale );
			editor.execute( new AddObjectCommand( editor, mesh, object.parent, false ), 'Add baked guide mesh' );
			status.textContent = 'Guide mesh added.';

		} ), true );

	} else modelButton( toolbar, 'Clear warp', 'regenerate', () => run( () => {

		setProjectorMapping( editor, object, 'projectorWarp', null );
		points = reset();
		selected = [];

	} ) );
	modelButton( toolbar, 'Apply', 'apply', () => run( () => {

		if ( warp ) setProjectorMapping( editor, object, 'projectorWarp', { size, points } );
		else {

			if ( source() !== original ) throw new Error( 'The mesh changed. Reopen the UV editor to continue.' );
			if ( ! points.length ) throw new Error( 'Choose an automatic layout first.' );
			const next = new THREE.BufferGeometry().copy( geometry );
			const uv = next.attributes.uv;
			points.forEach( ( [ u, v ], i ) => uv.setXY( i, u, 1 - v ) );
			uv.needsUpdate = true;
			if ( object.userData.modifiers?.length ) {

				try { setModifierStack( editor, object, object.userData.modifiers, next, 'Edit UVs' ); }
				finally { next.dispose(); }

			} else {

				const command = new SetGeometryCommand( editor, object, next );
				command.updatable = false;
				editor.execute( command, 'Edit UVs' );

			}
			if ( geometry !== original ) geometry.dispose();
			original = geometry = source();
			dirty = false;

		}
		undo.length = redo.length = 0;
		if ( warp ) dirty = false;
		status.textContent = warp ? 'Warp applied.' : 'UVs applied.';

	} ) );
	function line( indices, closed = false ) {

		ctx.beginPath();
		indices.forEach( ( index, i ) => ctx[ i ? 'lineTo' : 'moveTo' ]( ...pixel( points[ index ] ) ) );
		if ( closed ) ctx.closePath();
		ctx.stroke();

	}

	function eachTriangle( visit ) {

		const index = geometry.index;
		for ( let row = 0; row + 2 < ( index?.count ?? points.length ); row += 3 ) {

			const face = [ row, row + 1, row + 2 ];
			visit( index ? face.map( i => index.getX( i ) ) : face );

		}

	}

	function draw() {

		ctx.fillStyle = '#12161d';
		ctx.fillRect( 0, 0, canvas.width, canvas.height );
		ctx.save();
		view.apply( ctx );
		ctx.lineWidth = 1 / view.scale;
		ctx.strokeStyle = '#53606f';
		for ( let i = 1; i < 10; i ++ ) {

			const grid = margin + i * span / 10;
			ctx.beginPath();
			ctx.moveTo( grid, margin ); ctx.lineTo( grid, margin + span );
			ctx.moveTo( margin, grid ); ctx.lineTo( margin + span, grid );
			ctx.stroke();

		}
		const material = editor.getObjectMaterial( object, materialSlot() );
		const output = object.projectorOutput;
		const source = warp ? output?.warpSource || output?.canvas : ( ! paintTool() && showBake && bake?.image ) || material?.map?.image;
		if ( source?.width || source?.videoWidth ) {

			try {

				ctx.globalAlpha = paintTool() || source === bake?.image ? 1 : .55;
				if ( warp ) ctx.drawImage( source, output.x, output.y, output.width, output.height, margin, margin, span, span );
				else ctx.drawImage( source, margin, margin, span, span );

			} catch { /* Wait for image decode. */ }
			finally { ctx.globalAlpha = 1; }

		}
		ctx.strokeStyle = '#6a7c8d';
		ctx.strokeRect( margin, margin, span, span );
		const selection = new Set( selected );
		if ( warp ) for ( let i = 0; i < points.length; i ++ ) {

			if ( i % size < size - 1 ) line( [ i, i + 1 ] );
			if ( i + size < points.length ) line( [ i, i + size ] );

		}
		else if ( points.length ) eachTriangle( face => {

			const active = face.every( index => selection.has( index ) );
			ctx.strokeStyle = active ? '#ffae62' : '#768597';
			line( face, true );
			if ( active ) { ctx.fillStyle = '#ff9d4526'; ctx.fill(); }

		} );
		points.forEach( ( point, index ) => {

			ctx.fillStyle = selection.has( index ) ? '#ffae62' : '#8ba4bb';
			ctx.beginPath(); ctx.arc( ...pixel( point ), 2.5 / view.scale, 0, Math.PI * 2 ); ctx.fill();

		} );
		if ( tool === 'cursor' || pivotSelect.value === 'cursor' ) {

			const [ x, y ] = pixel( pivot ), r = 9 / view.scale;
			ctx.strokeStyle = '#ffbc8d';
			ctx.beginPath(); ctx.arc( x, y, r * .6, 0, Math.PI * 2 );
			ctx.moveTo( x - r, y ); ctx.lineTo( x + r, y ); ctx.moveTo( x, y - r ); ctx.lineTo( x, y + r );
			ctx.stroke();

		}
		if ( dragging?.region ) {

			ctx.beginPath();
			const { start, end, polygon } = dragging;
			if ( tool === 'circle' ) ctx.arc( ...end, 22 / view.scale, 0, Math.PI * 2 );
			else if ( tool === 'lasso' ) {

				polygon.forEach( ( p, i ) => ctx[ i ? 'lineTo' : 'moveTo' ]( ...p ) );
				ctx.closePath();

			} else ctx.rect( ...start, end[ 0 ] - start[ 0 ], end[ 1 ] - start[ 1 ] );
			ctx.fillStyle = '#ff9d4520'; ctx.strokeStyle = '#ffae62'; ctx.fill(); ctx.stroke();

		}
		if ( paintTool() && lastPoint ) {

			const diameter = pencilBrush( editor ).size;
			const width = material?.map?.image?.width || 1024;
			ctx.strokeStyle = '#ffdc97';
			ctx.beginPath();
			ctx.arc( ...lastPoint, diameter * span / width / 2, 0, Math.PI * 2 );
			ctx.stroke();

		}
		ctx.restore();
		paintControls.hidden = ! paintTool();
		shelf.update( tool );

	}

	function nearest( at ) {

		let hit = -1, best = 9 / view.scale;
		points.forEach( ( point, index ) => {

			const p = pixel( point );
			const distance = Math.hypot( p[ 0 ] - at[ 0 ], p[ 1 ] - at[ 1 ] );
			if ( distance < best ) { best = distance; hit = index; }

		} );
		return hit;

	}

	function pointKey( i ) {

		const uv = points[ i ].map( value => Math.round( value * 1e6 ) ).join( ',' );
		const xyz = geometry.attributes.position;
		return warp ? i : uv + '/' + [ xyz.getX( i ), xyz.getY( i ), xyz.getZ( i ) ].join( ',' );

	}

	function select( hits, event ) {

		if ( event.ctrlKey ) selected = selected.filter( i => ! hits.includes( i ) );
		else if ( event.shiftKey ) selected = [ ...new Set( [ ...selected, ...hits ] ) ];
		else selected = hits;

	}

	function selectLinked() {

		if ( warp ) return;
		const hit = lastPoint && nearest( lastPoint );
		const seeds = hit >= 0 ? [ hit ] : selected;
		const links = new Map();
		eachTriangle( face => {

			const keys = face.map( pointKey );
			for ( const key of keys ) {

				if ( ! links.has( key ) ) links.set( key, new Set() );
				for ( const neighbor of keys ) links.get( key ).add( neighbor );

			}

		} );
		const queue = seeds.map( pointKey ), reached = new Set( queue );
		for ( let i = 0; i < queue.length; i ++ ) for ( const next of links.get( queue[ i ] ) || [] ) {

			if ( reached.has( next ) ) continue;
			reached.add( next ); queue.push( next );

		}
		selected = points.flatMap( ( _, index ) => reached.has( pointKey( index ) ) ? [ index ] : [] );

	}

	function restore( from, to ) {

		if ( ! from.length || dragging ) return;
		to.push( { points, dirty } );
		( { points, dirty } = from.pop() );

	}

	function beginTransform( mode, point, modal = false ) {

		if ( ! selected.length ) return;
		const center = [ 0, 1 ].map( axis => selected.reduce( ( sum, index ) => sum + points[ index ][ axis ], 0 ) / selected.length );
		dragging = { mode, at: pointUV( point ), center: pivotSelect.value === 'cursor' ? pivot.slice() : center,
			before: { points: points.slice(), dirty }, modal };

	}

	function cancelDrag() {

		if ( dragging?.before ) ( { points, dirty } = dragging.before );
		if ( dragging?.paint ) {

			dragging.paint.finish( false );
			editor.signals.objectChanged.dispatch( object );

		}
		dragging = null;

	}

	function finishDrag() {

		if ( dragging?.paint ) {

			const [ command ] = dragging.paint.finish( true );
			dragging = null;
			if ( command ) editor.execute( command, 'Paint UV texture' );
			draw();
			return;

		}
		if ( dragging?.changed ) {

			undo.push( dragging.before );
			if ( undo.length > 30 ) undo.shift();
			redo.length = 0;

		}
		dragging = null;
		draw();

	}

	canvas.onpointerdown = event => {

		if ( event.button !== 0 ) return;
		canvas.focus( { preventScroll: true } );
		if ( dragging?.modal ) { finishDrag(); return; }
		const point = lastPoint = view.point( event );
		if ( tool === 'cursor' ) { pivot = pointUV( point ); draw(); return; }
		if ( paintTool() ) {

			const uv = pointUV( point );
			if ( uv.some( value => value < 0 || value > 1 ) ) return;
			const slot = materialSlot();
			const image = editor.getObjectMaterial( object, slot )?.map?.image;
			const w = image?.width || 1024, h = image?.height || 1024;
			const brush = { ...pencilBrush( editor ) };
			const paint = new TexturePaintStroke( editor );
			const pressure = brushPressure( event );
			const sample = brushStroke( brush, uv[ 0 ] * w, uv[ 1 ] * h, pressure, ( x, y, force ) => {

				if ( x < 0 || x > w || y < 0 || y > h ) return;
				const issue = paint.paintUV( object, slot, x / w, y / h, brush, force, tool === 'erase' );
				if ( issue ) status.textContent = issue;

			} );
			dragging = { paint, sample, w, h };
			editor.signals.objectChanged.dispatch( object );

		} else if ( [ 'box', 'circle', 'lasso' ].includes( tool ) ) {

			dragging = { region: true, tool, start: point, end: point, polygon: [ point ], event };

		} else {

			const hit = nearest( point );
			if ( tool === 'select' || ! selected.length ) {

				const key = hit >= 0 ? pointKey( hit ) : null;
				select( key === null ? [] : points.flatMap( ( _, i ) => pointKey( i ) === key ? [ i ] : [] ), event );

			}
			if ( tool !== 'select' || hit >= 0 && ! event.ctrlKey ) beginTransform( tool === 'select' ? 'move' : tool, point );

		}
		if ( dragging ) canvas.setPointerCapture( event.pointerId );
		draw();

	};

	canvas.onpointermove = event => {

		const point = lastPoint = view.point( event );
		if ( ! dragging ) { if ( paintTool() ) draw(); return; }
		if ( dragging.paint ) {

			const uv = pointUV( point );
			dragging.sample( uv[ 0 ] * dragging.w, uv[ 1 ] * dragging.h, brushPressure( event ) );
			editor.signals.objectChanged.dispatch( object );

		} else if ( dragging.region ) {

			dragging.end = point;
			dragging.polygon.push( point );

		} else {

			const to = pointUV( point );
			dragging.changed ||= Math.hypot( to[ 0 ] - dragging.at[ 0 ], to[ 1 ] - dragging.at[ 1 ] ) > 1e-7;
			for ( const index of selected ) {

				const next = transformCanvasPoint( dragging.mode, dragging.before.points[ index ], dragging.at, to, dragging.center );
				points[ index ] = warp ? next.map( value => THREE.MathUtils.clamp( value, 0, 1 ) ) : next;

			}
			dirty ||= dragging.changed;

		}
		draw();

	};

	canvas.onpointerup = () => {

		if ( dragging?.region ) {

			const region = dragging;
			select( points.flatMap( ( point, i ) => selectionRegionContains( region, pixel( point ), 22 / view.scale ) ? [ i ] : [] ), region.event );

		}
		if ( dragging && ! dragging.modal ) finishDrag();

	};
	canvas.onpointercancel = () => { cancelDrag(); draw(); };
	canvas.onlostpointercapture = () => { if ( dragging && ! dragging.modal ) canvas.onpointercancel(); };
	canvas.onpointerleave = () => { if ( ! dragging ) { lastPoint = null; draw(); } };
	canvas.onkeydown = event => {

		const key = event.key.toLowerCase();
		const modes = { g: 'move', r: 'rotate', s: 'scale' };
		if ( ! dragging && paintTool() && useBrushShortcut( editor, event ) ) palette.refresh();
		else if ( dragging && key === 'escape' ) cancelDrag();
		else if ( dragging?.modal && key === 'enter' ) finishDrag();
		else if ( key === 'z' && ( event.ctrlKey || event.metaKey ) ) {

			if ( event.shiftKey ) { if ( redo.length ) restore( redo, undo ); else if ( ! dragging ) editor.redo(); }
			else if ( undo.length ) restore( undo, redo );
			else if ( ! dragging ) editor.undo();

		} else if ( ! dragging && key === 'a' && ! event.ctrlKey && ! event.metaKey ) selected = event.altKey ? [] : points.map( ( _, i ) => i );
		else if ( ! dragging && key === 'l' ) selectLinked();
		else if ( ! dragging && key === 'home' ) view.fit();
		else if ( ! dragging && ! warp && key === 'd' && ! event.ctrlKey && ! event.metaKey ) { tool = 'pencil'; palette.refresh(); }
		else if ( ! dragging && modes[ key ] && ! event.ctrlKey && ! event.metaKey && selected.length ) beginTransform( modes[ key ], lastPoint || pixel( [ .5, .5 ] ), true );
		else return;
		event.preventDefault();
		event.stopPropagation();
		draw();

	};
	pivotSelect.onchange = materialSelect.onchange = draw;


	workspacePanel.append( toolbar );
	if ( baking ) workspacePanel.append( baking );
	const workArea = document.createElement( 'div' );
	workArea.className = 'uv-work-area';
	workArea.append( shelf.element, canvas );
	workspacePanel.append( workArea );
	if ( ! warp ) workspacePanel.append( paintControls );
	workspacePanel.append( status );
	const updateGeometry = changed => {

		if ( warp || changed !== object || source() === original || dirty ) return;
		original = geometry = source();
		points = reset();
		undo.length = redo.length = 0;
		selected = [];
		draw();

	};
	editor.signals.geometryChanged.add( updateGeometry );
	editor.signals.materialChanged.add( draw );
	editor.editWorkspace.mount( warp ? 'warp' : 'uv', object, workspacePanel, () => {

		editor.signals.geometryChanged.remove( updateGeometry );
		editor.signals.materialChanged.remove( draw );
		cancelDrag();
		if ( ! warp && geometry !== original ) geometry.dispose();
		bake?.geometry.dispose();

	}, () => dirty );
	if ( focus ) canvas.focus();
	draw();

}
