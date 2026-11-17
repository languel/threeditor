import { SetValueCommand } from '../commands/SetValueCommand.js';
import * as THREE from 'three';
import { modelButton } from './ModelControls.js';
import { applyProjectionMask, maskFromOutline, maskShapes } from './ProjectionMask.js?v=mask-editor';
import { canEditLightMask, setLightMask } from './LightMask.js?v=mask-editor';
import { isClosedOutline, outlinePoints } from './ModelGeometry.js?v=top-toolbar';
import { lightViewCamera } from './LightView.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { sculptMask } from './MaskSculpt.js';

export function openMaskEditor( editor, light, showPicker = false, vectorMode = false ) {

	if ( ! vectorMode && ! canEditLightMask( light ) ) return;
	const scene = editor.scene;
	const saved = () => vectorMode ? scene.userData.vectorDrawing : light.userData.projectionMask;
	let initial = saved();
	let reference, referenceURL;
	let referenceVisible = true;
	let shapes = maskShapes( initial ), active = shapes.length - 1, vertex = -1, tool = 'edit', draft = [], gesture;
	const undo = [], redo = [];
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
	addTool( 'freehand', 'Freehand outline', 'toolPaint' );
	addTool( 'rectangle', 'Draw rectangle', 'toolGrid' );
	addTool( 'ellipse', 'Draw ellipse', 'brushWidth' );
	addTool( 'push', 'Push brush', 'brush' );
	addTool( 'smooth', 'Smooth brush', 'toolPath' );
	const radiusLabel = node( 'label', toolbar, 'Brush radius ' );
	const radius = node( 'input', radiusLabel );
	Object.assign( radius, { type: 'range', min: 12, max: 130, value: 46 } );
	radius.oninput = () => draw();
	modelButton( toolbar, 'Undo mask edit', 'undo', () => restore( undo, redo ) );
	modelButton( toolbar, 'Redo mask edit', 'redo', () => restore( redo, undo ) );
	const workspace = node( 'section', workspacePanel );
	toolbar.className = 'editor-2d-tools';
	workspace.append( toolbar );
	const canvas = node( 'canvas', workspace );
	canvas.setAttribute( 'aria-label', 'Projection frame' );
	canvas.tabIndex = 0;
	canvas.width = 760;
	canvas.height = 490;
	const ctx = canvas.getContext( '2d' );
	const panel = node( 'aside', workspace );
	node( 'label', panel, vectorMode ? 'Vector shapes' : 'Mask shapes' ).htmlFor = 'mask-shape-list';
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
		fill.setAttribute( 'aria-label', 'Shape fill' );
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
		if ( ! data || ! [ 'path', 'shape' ].includes( data.kind ) || ! isClosedOutline( data ) || hasRestriction( object, 'disabled' ) ) return;
		const path = [];
		for ( let parent = object; parent && parent !== editor.scene; parent = parent.parent ) path.unshift( parent.name || parent.type );
		available.push( [ object, path.join( ' / ' ) ] );

	} );
	const importActions = node( 'div', picker );
	importActions.className = 'modeling-actions';
	const fit = modelButton( importActions, 'Fit outline to frame', 'toolGrid', () => importOutline( false ) );
	const project = ! vectorMode && modelButton( importActions, 'Project outline in place', 'toolMask', () => importOutline( true ) );
	const pickerNotes = node( 'small', picker );
	function filter() {

		const query = search.value.toLowerCase().trim();
		const matches = available.filter( ( [ , path ] ) => path.toLowerCase().includes( query ) );
		sources.replaceChildren( ...matches.map( ( [ object, path ] ) => new Option( path, object.uuid ) ) );
		sources.selectedIndex = matches.length ? 0 : -1;
		fit.disabled = ! matches.length;
		if ( project ) project.disabled = fit.disabled;
		pickerNotes.textContent = matches.length ? '' : available.length ? 'No matching outlines.' : 'Create a closed Shape or Path in the scene first.';

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

		return { shapes: structuredClone( shapes ), active, vertex };

	}
	function remember( state = snapshot() ) {

		undo.push( state );
		if ( undo.length > 60 ) undo.shift();
		redo.length = 0;

	}
	function restore( from, to ) {

		if ( ! from.length || gesture ) return;
		to.push( snapshot() );
		( { shapes, active, vertex } = from.pop() );
		draft = [];
		refresh();

	}
	function change( action ) {

		remember();
		action();
		refresh();

	}
	function addShape( shape ) {

		change( () => {

			shapes.push( { mode: 'inside', ...shape, name: shape.name || 'Mask ' + ( shapes.length + 1 ) } );
			active = shapes.length - 1;
			vertex = -1;
			draft = [];
			tool = 'edit';
			status.textContent = '';

		} );

	}
	function closeDraft() {

		if ( draft.length >= 3 ) addShape( { points: draft } );

	}
	function removeVertex() {

		if ( vertex < 0 || shapes[ active ]?.points.length < 4 ) return;
		change( () => { shapes[ active ].points.splice( vertex, 1 ); vertex = -1; } );

	}
	function importOutline( inPlace ) {

		try {

			const object = editor.objectByUuid( sources.value );
			if ( ! object ) throw new Error( 'The source outline is no longer in the scene.' );
			const outline = outlinePoints( THREE, object.geometry.userData.modeling );
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
	function drawVectors( target, width, height ) {

		target.save();
		for ( const operation of [ 'inside', 'cutout' ] ) for ( const shape of shapes ) {

			if ( shape.mode !== operation ) continue;
			target.globalCompositeOperation = operation === 'cutout' ? 'destination-out' : 'source-over';
			target.fillStyle = color( shape );
			target.beginPath();
			shape.points.forEach( ( [ x, y ], i ) => target[ i ? 'lineTo' : 'moveTo' ]( x * width, y * height ) );
			target.closePath();
			target.fill( 'evenodd' );

		}
		target.restore();

	}
	const vectorCanvas = document.createElement( 'canvas' );
	function exportSVG() {

		const path = shape => shape.points.map( ( [ x, y ], i ) => ( i ? 'L' : 'M' ) + ( x * 1000 ).toFixed( 2 ) + ' ' + ( y * 1000 ).toFixed( 2 ) ).join( ' ' ) + ' Z';
		const layers = operation => shapes.filter( shape => shape.mode === operation ).map( shape =>
			'<path fill="' + ( operation === 'cutout' ? 'black' : color( shape ) ) + '" fill-rule="evenodd" d="' + path( shape ) + '"/>' ).join( '' );
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><mask id="cutouts"><rect width="1000" height="1000" fill="white"/>' +
			layers( 'cutout' ) + '</mask></defs><g mask="url(#cutouts)">' + layers( 'inside' ) + '</g></svg>';
		editor.utils.save( new Blob( [ svg ], { type: 'image/svg+xml' } ), 'drawing.svg' );

	}
	function exportPNG() {

		const output = document.createElement( 'canvas' );
		const side = output.width = output.height = 1024;
		const target = output.getContext( '2d' );
		if ( referenceVisible ) drawImage( target, reference, 0, 0, side, side );
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
			drawVectors( layer, w, h );
			ctx.drawImage( vectorCanvas, x, y, width, height );

		} else {

			drawImage( ctx, image, x, y, width, height );
			applyProjectionMask( ctx, { shapes }, x, y, width, height );

		}
		for ( const [ index, shape ] of shapes.entries() ) {

			trace( shape.points, true );
			ctx.strokeStyle = shape.mode === 'cutout' ? '#ff9e71' : '#74dcf3';
			ctx.lineWidth = active === index ? 2 : 1;
			ctx.stroke();
			if ( index === active && tool === 'edit' ) shape.points.forEach( ( point, i ) => {

				ctx.fillStyle = vertex === i ? '#ffb459' : '#74dcf3';
				ctx.beginPath(); ctx.arc( ...pixel( point ), 3, 0, Math.PI * 2 ); ctx.fill();

			} );

		}
		if ( draft.length ) {

			trace( draft, tool !== 'polygon' );
			ctx.strokeStyle = '#fff';
			ctx.stroke();
			ctx.fillStyle = '#fff';
			ctx.beginPath(); ctx.arc( ...pixel( draft[ 0 ] ), 4, 0, Math.PI * 2 ); ctx.fill();

		}
		if ( cursor && [ 'push', 'smooth' ].includes( tool ) ) {

			ctx.strokeStyle = '#fff';
			ctx.beginPath(); ctx.arc( ...cursor, Number( radius.value ), 0, Math.PI * 2 ); ctx.stroke();

		}
		ctx.restore();
		ctx.strokeStyle = '#68778a';
		ctx.strokeRect( x, y, width, height );
		radiusLabel.hidden = ! [ 'push', 'smooth' ].includes( tool );
		deletePoint.disabled = vertex < 0 || shapes[ active ]?.points.length < 4;
		for ( const [ id, button ] of tools ) button.setAttribute( 'aria-pressed', String( id === tool ) );

	}

	function pointer( event ) {

		const rect = canvas.getBoundingClientRect();
		return [ ( event.clientX - rect.left ) * canvas.width / rect.width, ( event.clientY - rect.top ) * canvas.height / rect.height ];

	}
	function bounded( point ) {

		return uv( point ).map( value => Math.max( 0, Math.min( 1, value ) ) );

	}
	function hitShape( point ) {

		const order = [ active, ...shapes.map( ( _, i ) => i ).reverse().filter( i => i !== active ) ];
		for ( const i of order ) {

			const shape = shapes[ i ];
			if ( ! shape ) continue;
			const hit = shape.points.findIndex( p => distance( pixel( p ), point ) < 8 );
			if ( hit >= 0 ) return [ i, hit ];
			trace( shape.points, true );
			if ( ctx.isPointInPath( ...point, 'evenodd' ) || ctx.isPointInStroke( ...point ) ) return [ i, -1 ];

		}
		return [ -1, -1 ];

	}

	canvas.onpointerdown = event => {

		if ( event.button !== 0 ) return;
		const point = pointer( event );
		if ( uv( point ).some( value => value < 0 || value > 1 ) ) return;
		canvas.focus();
		if ( tool === 'polygon' ) {

			const closes = draft.length > 2 && distance( pixel( draft[ 0 ] ), point ) < 9;
			if ( ! closes && ( ! draft.length || distance( pixel( draft.at( -1 ) ), point ) > 3 ) ) draft.push( uv( point ) );
			draw();
			return;

		}
		if ( tool === 'edit' ) [ active, vertex ] = hitShape( point );
		if ( [ 'edit', 'push', 'smooth' ].includes( tool ) && ! shapes[ active ] ) { refresh(); return; }
		gesture = { start: point, last: point, before: snapshot(), moved: false };
		draft = tool === 'freehand' ? [ uv( point ) ] : [];
		canvas.setPointerCapture( event.pointerId );
		refresh();

	};
	canvas.onpointermove = event => {

		const point = cursor = pointer( event );
		if ( ! gesture ) { draw(); return; }
		if ( distance( point, gesture.last ) < 3 ) return;
		const start = bounded( gesture.start ), end = bounded( point );
		const delta = end.map( ( value, i ) => value - start[ i ] );
		const shape = shapes[ active ];
		if ( tool === 'edit' ) {

			const original = gesture.before.shapes[ active ].points;
			shape.points = original.map( ( p, i ) => vertex >= 0 && vertex !== i ? p : p.map( ( value, axis ) => value + delta[ axis ] ) );

		} else if ( tool === 'freehand' ) draft.push( end );
		else if ( tool === 'rectangle' ) draft = [ start, [ end[ 0 ], start[ 1 ] ], end, [ start[ 0 ], end[ 1 ] ] ];
		else if ( tool === 'ellipse' ) draft = Array.from( { length: 48 }, ( _, i ) => {

			const angle = i / 48 * Math.PI * 2;
			return [ start[ 0 ] + delta[ 0 ] * ( 1 + Math.cos( angle ) ) / 2, start[ 1 ] + delta[ 1 ] * ( 1 + Math.sin( angle ) ) / 2 ];

		} );
		else {

			const step = point.map( ( value, i ) => value - gesture.last[ i ] );
			shape.points = sculptMask( shape.points.map( pixel ), point, step, Number( radius.value ), tool ).map( uv );

		}
		gesture.last = point;
		gesture.moved = true;
		draw();

	};
	canvas.onpointerup = () => {

		if ( ! gesture ) return;
		if ( draft.length >= 3 && ( tool === 'freehand' || gesture.last.every( ( value, axis ) => Math.abs( value - gesture.start[ axis ] ) > 3 ) ) ) closeDraft();
		else if ( gesture.moved && [ 'edit', 'push', 'smooth' ].includes( tool ) ) remember( gesture.before );
		gesture = null;
		draft = [];
		refresh();

	};
	canvas.onpointercancel = () => {

		if ( gesture ) ( { shapes, active, vertex } = gesture.before );
		gesture = null;
		draft = [];
		refresh();

	};
	canvas.onpointerleave = () => { cursor = null; if ( ! gesture ) draw(); };
	canvas.ondblclick = event => {

		if ( tool === 'polygon' && draft.length > 2 && distance( pixel( draft[ 0 ] ), pointer( event ) ) < 9 ) { closeDraft(); return; }
		if ( tool !== 'edit' || vertex >= 0 || ! shapes[ active ] ) return;
		const point = pointer( event ), points = shapes[ active ].points;
		let best, threshold = 12;
		points.forEach( ( p, i ) => {

			const a = pixel( p ), b = pixel( points[ ( i + 1 ) % points.length ] );
			const ab = b.map( ( value, axis ) => value - a[ axis ] );
			const t = Math.max( 0, Math.min( 1, ( ( point[ 0 ] - a[ 0 ] ) * ab[ 0 ] + ( point[ 1 ] - a[ 1 ] ) * ab[ 1 ] ) / ( ab[ 0 ] ** 2 + ab[ 1 ] ** 2 || 1 ) ) );
			const q = a.map( ( value, axis ) => value + t * ab[ axis ] );
			const d = distance( q, point );
			if ( d < threshold ) { threshold = d; best = [ i + 1, uv( q ) ]; }

		} );
		if ( best ) change( () => { points.splice( best[ 0 ], 0, best[ 1 ] ); vertex = best[ 0 ]; } );

	};
	workspacePanel.onkeydown = event => {

		if ( [ 'INPUT', 'SELECT', 'BUTTON' ].includes( event.target.tagName ) ) return;
		const key = event.key.toLowerCase();
		if ( key === 'enter' && draft.length ) { event.preventDefault(); closeDraft(); }
		if ( key === 'delete' || key === 'backspace' ) { event.preventDefault(); removeVertex(); }
		if ( key === 'z' && ( event.metaKey || event.ctrlKey ) ) {

			event.preventDefault();
			if ( event.shiftKey ) restore( redo, undo );
			else restore( undo, redo );

		}

	};
	const abortDraft = event => {

		if ( event.key !== 'Escape' || ! draft.length ) return;
		event.preventDefault();
		draft = [];
		draw();

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
	else canvas.focus();

}
