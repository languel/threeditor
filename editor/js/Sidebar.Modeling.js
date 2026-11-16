import * as THREE from 'three';
import { UIPanel } from './libs/ui.js';
import { isProjector } from './assets/Projector.js';
import { setLightMask } from './modeling/LightMask.js';
import { hasRestriction, isVisible } from './ObjectRestrictions.js';
import { isClosedOutline, outlinePoints } from './modeling/ModelGeometry.js?v=top-toolbar';
import { editableMesh } from './modeling/ModelViewport.js?v=outline-brushes';
import { modelButton, modelField } from './modeling/ModelControls.js';
import { maskFromOutline } from './modeling/ProjectionMask.js';

function element( tag, text, parent ) {

	const node = document.createElement( tag );
	if ( text ) node.textContent = text;
	parent?.append( node );
	return node;

}

function field( label, glyph, parent, type, value, change ) {

	const input = modelField( parent, label, glyph, type, value );
	input.onchange = () => change( type === 'checkbox' ? input.checked : input.valueAsNumber );
	return input;

}

function SidebarProjectionMask( editor, object, host, run ) {

	let points = object.userData.projectionMask?.points?.map( point => [ ...point ] ) || [];
	let mode = object.userData.projectionMask?.mode || 'inside';
	let selected = - 1, dragging = false, moved = false;
	const canvas = element( 'canvas', null, host );
	canvas.className = 'projection-mask-canvas';
	canvas.width = 320;
	canvas.height = 240;
	canvas.setAttribute( 'aria-label', 'Projector mask editor' );
	const ctx = canvas.getContext( '2d' );
	const controls = element( 'div', null, host );
	controls.className = 'modeling-actions';
	const newMask = modelButton( controls, 'Draw new mask', 'add', () => { points = []; selected = - 1; draw(); } );
	const remove = modelButton( controls, 'Remove point', 'remove', () => {

		if ( selected < 0 ) return;
		points.splice( selected, 1 );
		selected = - 1;
		draw();

	} );
	const apply = modelButton( controls, 'Apply mask', 'apply', () => run( () => commit( { mode, points: points.map( point => [ ...point ] ) } ) ) );
	modelButton( controls, 'Clear mask', 'delete', () => run( () => {

		commit( null );
		points = [];
		selected = - 1;
		draw();

	} ) );
	const modeLabel = element( 'label', 'Mask mode', host );
	const chooseMode = element( 'select', null, modeLabel );
	for ( const [ value, label ] of [ [ 'inside', 'Light inside' ], [ 'cutout', 'Block inside' ] ] ) {

		const option = element( 'option', label, chooseMode );
		option.value = value;

	}
	chooseMode.value = mode;
	chooseMode.onchange = () => { mode = chooseMode.value; draw(); };
	const sources = element( 'label', 'Copy outline', host );
	const outline = element( 'select', null, sources );
	element( 'option', 'Choose a closed shape or path…', outline ).value = '';
	editor.scene.traverse( source => {

		const data = source.geometry?.userData.modeling;
		if ( data?.points?.length >= 3 && ( data.kind === 'shape' || data.kind === 'path' ) && isClosedOutline( data ) ) {

			element( 'option', source.name, outline ).value = source.uuid;

		}

	} );
	outline.onchange = () => run( () => {

		const data = editor.scene.getObjectByProperty( 'uuid', outline.value )?.geometry.userData.modeling;
		if ( ! data ) return;
		points = maskFromOutline( outlinePoints( THREE, data ).map( point => point.toArray() ) ).points;
		selected = - 1;
		draw();

	} );
	element( 'p', 'Click to add points or drag a handle. Apply the mask to update the light.', host ).className = 'modeling-instructions';
	let frame = { x: 0, y: 0, width: 320, height: 240 };
	let lastTexture, lastVersion = - 1;

	function draw() {

		if ( ! canvas.isConnected ) return;
		const optics = object.projectorFrame;
		const aspect = optics?.aspect || 16 / 9;
		const width = Math.min( canvas.width, canvas.height * aspect );
		const height = width / aspect;
		frame = { x: ( canvas.width - width ) / 2, y: ( canvas.height - height ) / 2, width, height };
		ctx.fillStyle = '#10151c';
		ctx.fillRect( 0, 0, canvas.width, canvas.height );
		const texture = object.children.find( child => child.isSpotLight && child.userData.runtimeOnly )?.map;
		const image = texture?.image;
		lastTexture = texture;
		lastVersion = texture?.version;
		if ( optics && image ) {

			const w = image.width * optics.width / optics.radius, h = image.height * optics.height / optics.radius;
			ctx.drawImage( image, ( image.width - w ) / 2, ( image.height - h ) / 2, w, h, frame.x, frame.y, width, height );

		}
		ctx.strokeStyle = '#657789';
		ctx.strokeRect( frame.x, frame.y, width, height );
		const pixels = points.map( ( [ u, v ] ) => [ frame.x + u * width, frame.y + v * height ] );
		ctx.beginPath();
		pixels.forEach( ( point, index ) => index ? ctx.lineTo( ...point ) : ctx.moveTo( ...point ) );
		if ( pixels.length >= 3 ) ctx.closePath();
		ctx.strokeStyle = '#6cd4f2';
		ctx.lineWidth = 1.5;
		ctx.stroke();
		pixels.forEach( ( point, index ) => {

			ctx.beginPath();
			ctx.arc( ...point, selected === index ? 5 : 3.5, 0, Math.PI * 2 );
			ctx.fillStyle = selected === index ? '#ffba62' : '#6cd4f2';
			ctx.fill();
			ctx.strokeStyle = '#111';
			ctx.stroke();

		} );
		remove.disabled = selected < 0;
		apply.disabled = points.length < 3;
		newMask.disabled = ! points.length;

	}

	function commit( mask ) {

		setLightMask( editor, object, mask );

	}

	function pointer( event ) {

		const rect = canvas.getBoundingClientRect();
		const pos = [ ( event.clientX - rect.left ) * canvas.width / rect.width, ( event.clientY - rect.top ) * canvas.height / rect.height ];
		return [ ( pos[ 0 ] - frame.x ) / frame.width, ( pos[ 1 ] - frame.y ) / frame.height ];

	}
	canvas.onpointerdown = event => {

		if ( event.button !== 0 ) return;
		const [ u, v ] = pointer( event );
		let hit = - 1, nearest = 10;
		points.forEach( ( [ x, y ], index ) => {

			const distance = Math.hypot( ( x - u ) * frame.width, ( y - v ) * frame.height );
			if ( distance < nearest ) { nearest = distance; hit = index; }

		} );
		if ( hit < 0 && ( u < 0 || u > 1 || v < 0 || v > 1 ) ) return;
		selected = hit;
		if ( hit < 0 ) selected = points.push( [ u, v ] ) - 1;
		dragging = true;
		moved = hit < 0;
		canvas.setPointerCapture( event.pointerId );
		draw();

	};
	canvas.onpointermove = event => {

		if ( ! dragging ) return;
		points[ selected ] = pointer( event ).map( value => THREE.MathUtils.clamp( value, 0, 1 ) );
		moved = true;
		draw();

	};
	canvas.onpointerup = canvas.onpointercancel = () => { dragging = false; if ( moved ) draw(); };
	draw();
	return () => {

		if ( ! canvas.getClientRects().length ) return;
		const texture = object.children.find( child => child.isSpotLight && child.userData.runtimeOnly )?.map;
		if ( texture !== lastTexture || texture?.version !== lastVersion ) draw();

	};

}

export function SidebarModeling( editor ) {

	const panel = new UIPanel();
	panel.dom.className = 'modeling-panel';
	const tools = editor.modeling;
	let updateMask;
	const status = element( 'p', '', panel.dom );
	status.setAttribute( 'role', 'status' );
	const body = element( 'div', null, panel.dom );
	const run = action => {

		try { status.textContent = ''; action(); }
		catch ( error ) { status.textContent = error.message; }

	};

	function draw() {

		const object = editor.selected;
		updateMask = null;
		body.replaceChildren();
		if ( ! object || hasRestriction( object, 'locked' ) || ! isVisible( object ) ) return;
		if ( isProjector( object ) ) {

			updateMask = SidebarProjectionMask( editor, object, body, run );
			return;

		}
		if ( ! object.geometry?.userData.modeling && ! editableMesh( object ) ) return;
		if ( tools.object !== object ) {

			modelButton( body, 'Edit points', 'editMode', () => run( () => tools.start( object ) ) );
			return;

		}
		const { data, indices } = tools;
		const actions = element( 'div', null, body );
		actions.className = 'modeling-actions';
		modelButton( actions, 'Object mode', 'objectMode', () => tools.stop() );
		for ( const { label, glyph, run: action, disabled, pressed } of tools.actions() ) {

			const control = modelButton( actions, label, glyph, () => run( action ), disabled );
			if ( pressed !== undefined ) control.setAttribute( 'aria-pressed', String( pressed ) );

		}
		element( 'p', tools.adding ? 'Click the viewport to place points.' :
			'Shift-click to extend the selection. Use the viewport gizmo to move, rotate, or scale points.', body ).className = 'modeling-instructions';
		const count = element( 'output', indices.length ? indices.length + ' selected' : data.points.length + ' points', body );
		count.className = 'modeling-instructions';
		if ( indices.length === 1 ) {

			const coords = element( 'div', null, body );
			coords.className = 'modeling-coordinates';
			for ( const [ i, axis ] of ( data.kind === 'shape' || data.planar ? [ 'X', 'Y' ] : [ 'X', 'Y', 'Z' ] ).entries() ) {

				field( axis, '', coords, 'number', Number( data.points[ indices[ 0 ] ][ i ].toFixed( 4 ) ), value => run( () => {

					if ( Number.isFinite( value ) ) tools.edit( 'Set point coordinate', next => { next.points[ indices[ 0 ] ][ i ] = value; } );

				} ) );

			}

		}
		if ( data.kind === 'path' || data.kind === 'shape' ) {

			field( 'Smooth curve', 'toolPath', body, 'checkbox', data.smooth, value => tools.edit( 'Set curve interpolation', next => { next.smooth = value; } ) );
			if ( data.kind === 'path' ) {

				field( 'Closed path', 'toolMask', body, 'checkbox', data.closed, value => tools.edit( 'Set path closure', next => { next.closed = value; } ) );
				field( 'Constrain to local XY', 'toolGrid', body, 'checkbox', data.planar, value => tools.edit( 'Set path editing plane', next => {

					next.planar = value;
					if ( value ) next.points.forEach( point => { point[ 2 ] = 0; } );

				} ) );

			} else {

				field( 'Extrusion depth', 'extrude', body, 'number', data.depth, value => run( () => {

					if ( ! Number.isFinite( value ) || value < 0 ) throw new Error( 'Enter a depth of zero or greater.' );
					tools.edit( 'Set shape depth', next => { next.depth = value; } );

				} ) ).min = 0;

			}
		}
		if ( data.kind === 'mesh' ) field( 'Extrusion distance', 'extrude', body, 'number', tools.extrudeDistance, value => {
			if ( Number.isFinite( value ) ) tools.extrudeDistance = value;
		} );

	}

	tools.onChange = draw;
	editor.signals.objectSelected.add( () => { status.textContent = ''; draw(); } );
	editor.signals.objectChanged.add( ( object, attribute ) => {

		if ( object === editor.selected && attribute === 'userData' ) draw();

	} );
	editor.signals.sceneRendered.add( () => updateMask?.() );
	return panel;

}
