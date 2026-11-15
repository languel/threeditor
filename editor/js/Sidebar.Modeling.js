import * as THREE from 'three';
import { UIPanel } from './libs/ui.js';
import { AddObjectCommand } from './commands/AddObjectCommand.js';
import { SetValueCommand } from './commands/SetValueCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { SetScriptValueCommand } from './commands/SetScriptValueCommand.js';
import { isProjector, upgradeProjectorScript } from './assets/Projector.js';
import { hasRestriction, isVisible } from './ObjectRestrictions.js';
import { addFace, extrudeFace, outlinePoints, removePoints, splitEdge } from './modeling/ModelGeometry.js';
import { editableMesh } from './modeling/ModelViewport.js';
import { maskFromOutline } from './modeling/ProjectionMask.js';

function element( tag, text, parent ) {

	const node = document.createElement( tag );
	if ( text ) node.textContent = text;
	parent?.append( node );
	return node;

}

function button( label, parent, action, disabled = false ) {

	const node = element( 'button', label, parent );
	node.type = 'button';
	node.disabled = disabled;
	node.onclick = action;
	return node;

}

function field( label, parent, type, value, change ) {

	const row = element( 'label', label, parent );
	const input = element( 'input', null, row );
	input.type = type;
	if ( type === 'checkbox' ) input.checked = !! value;
	else { input.value = value; input.step = 'any'; }
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
	const newMask = button( 'Draw new mask', controls, () => { points = []; selected = - 1; draw(); } );
	const remove = button( 'Remove point', controls, () => {

		if ( selected < 0 ) return;
		points.splice( selected, 1 );
		selected = - 1;
		draw();

	} );
	const apply = button( 'Apply mask', controls, () => run( () => commit( { mode, points: points.map( point => [ ...point ] ) } ) ) );
	button( 'Clear mask', controls, () => run( () => {

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
		if ( data?.points?.length >= 3 && ( data.kind === 'shape' || data.kind === 'path' && data.closed ) ) {

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
	element( 'p', 'Click to add points or drag a handle. Apply the mask to update the light.', host );
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

		const userData = { ...object.userData };
		if ( mask ) userData.projectionMask = mask;
		else delete userData.projectionMask;
		const commands = [];
		const script = editor.scripts[ object.uuid ]?.find( item => item.assetBehavior === 'projector' );
		if ( mask ) {

			if ( ! script ) throw new Error( 'Attach the projector behavior to use a mask.' );
			const upgraded = { ...script };
			upgradeProjectorScript( upgraded );
			if ( ! upgraded.source.includes( 'applyProjectionMask( ctx,' ) ) throw new Error( 'This projector behavior does not support editable masks.' );
			if ( upgraded.source !== script.source ) commands.push( new SetScriptValueCommand( editor, object, script, 'source', upgraded.source ) );

		}
		const set = new SetValueCommand( editor, object, 'userData', userData );
		set.updatable = false;
		commands.push( set );
		editor.execute( commands.length === 1 ? set : new MultiCmdsCommand( editor, commands ), mask ? 'Apply projector mask' : 'Clear projector mask' );

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
	let extrudeDistance = .3;
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

			button( 'Edit points', body, () => run( () => tools.start( object ) ) );
			return;

		}
		const { data, indices } = tools;
		const actions = element( 'div', null, body );
		actions.className = 'modeling-actions';
		button( 'Done', actions, () => tools.stop() );
		if ( data.kind !== 'vertices' ) {

			const add = button( tools.adding ? 'Stop adding' : 'Add points', actions, () => { tools.adding = ! tools.adding; draw(); } );
			add.setAttribute( 'aria-pressed', String( tools.adding ) );
			button( 'Remove selected', actions, () => run( () => tools.edit( 'Remove modeling points', next => { removePoints( next, indices ); return []; } ) ), ! indices.length );
			if ( data.points.length ) button( 'Clear points', actions, () => tools.edit( 'Clear modeling points', next => { next.points = []; if ( next.faces ) next.faces = []; return []; } ) );
			if ( data.kind !== 'shape' && ! data.planar ) field( 'Snap new points to meshes', body, 'checkbox', tools.snap, value => { tools.snap = value; } );

		}
		element( 'p', tools.adding ? 'Click the viewport to place points.' : 'Drag a point to move it. Shift-click to select multiple points.', body );
		element( 'p', indices.length ? indices.length + ' selected' : data.points.length + ' points', body );
		if ( indices.length === 1 ) {

			const coords = element( 'div', null, body );
			coords.className = 'modeling-coordinates';
			for ( const [ i, axis ] of ( data.kind === 'shape' || data.planar ? [ 'X', 'Y' ] : [ 'X', 'Y', 'Z' ] ).entries() ) {

				field( axis, coords, 'number', Number( data.points[ indices[ 0 ] ][ i ].toFixed( 4 ) ), value => run( () => {

					if ( Number.isFinite( value ) ) tools.edit( 'Set point coordinate', next => { next.points[ indices[ 0 ] ][ i ] = value; } );

				} ) );

			}

		}
		if ( data.kind === 'path' || data.kind === 'shape' ) {

			field( 'Smooth curve', body, 'checkbox', data.smooth, value => tools.edit( 'Set curve interpolation', next => { next.smooth = value; } ) );
			if ( data.kind === 'path' ) {

				field( 'Closed path', body, 'checkbox', data.closed, value => tools.edit( 'Set path closure', next => { next.closed = value; } ) );
				field( 'Constrain to local XY', body, 'checkbox', data.planar, value => tools.edit( 'Set path editing plane', next => {

					next.planar = value;
					if ( value ) next.points.forEach( point => { point[ 2 ] = 0; } );

				} ) );
				button( 'Create shape from path', actions, () => run( () => {

					const shape = tools.toShape();
					const parent = object.parent;
					object.updateWorldMatrix( true, false );
					if ( parent !== editor.scene ) object.matrixWorld.decompose( shape.position, shape.quaternion, shape.scale );
					editor.execute( new AddObjectCommand( editor, shape ) );
					tools.start( shape );

				} ), ! data.closed || data.points.length < 3 );

			} else {

				field( 'Extrusion depth', body, 'number', data.depth, value => run( () => {

					if ( ! Number.isFinite( value ) || value < 0 ) throw new Error( 'Enter a depth of zero or greater.' );
					tools.edit( 'Set shape depth', next => { next.depth = value; } );

				} ) ).min = 0;

			}
			button( 'Insert point', actions, () => run( () => tools.edit( 'Insert outline point', next => {

				const i = indices[ 0 ];
				const following = data.kind === 'shape' || data.closed ? ( i + 1 ) % next.points.length : i + 1;
				const other = next.points[ following ] || next.points[ i - 1 ];
				const sign = next.points[ following ] ? 1 : - 1;
				const point = next.points[ i ].map( ( value, axis ) => other ? value + sign * ( other[ axis ] - value ) * .5 : value + ( axis === 0 ? .5 : 0 ) );
				next.points.splice( i + 1, 0, point );
				return [ i + 1 ];

			} ) ), indices.length !== 1 );

		}
		if ( data.kind === 'mesh' ) {

			const faceIndex = data.faces.findIndex( face => face.length === indices.length && face.every( index => indices.includes( index ) ) );
			button( 'Fill face', actions, () => run( () => tools.edit( 'Fill mesh face', next => { addFace( THREE, next, indices ); } ) ), indices.length < 3 );
			button( 'Split edge', actions, () => run( () => tools.edit( 'Split mesh edge', next => [ splitEdge( next, ...indices ) ] ) ), indices.length !== 2 );
			button( 'Delete face', actions, () => tools.edit( 'Delete mesh face', next => { next.faces.splice( faceIndex, 1 ); } ), faceIndex < 0 );
			button( 'Extrude face', actions, () => run( () => tools.edit( 'Extrude mesh face', next => extrudeFace( THREE, next, faceIndex, extrudeDistance ) ) ), faceIndex < 0 );
			field( 'Extrusion distance', body, 'number', extrudeDistance, value => { if ( Number.isFinite( value ) ) extrudeDistance = value; } );
			element( 'p', 'Select vertices in boundary order to fill a face. Select all vertices of a face to extrude or delete it.', body );

		}

	}

	tools.onChange = draw;
	editor.signals.objectSelected.add( () => { status.textContent = ''; draw(); } );
	editor.signals.objectChanged.add( ( object, attribute ) => {

		if ( object === editor.selected && attribute === 'userData' ) draw();

	} );
	editor.signals.sceneRendered.add( () => updateMask?.() );
	return panel;

}
