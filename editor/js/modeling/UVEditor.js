import * as THREE from 'three';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { isProjector, upgradeProjectorScript } from '../assets/Projector.js?v=projector-mapping';
import { SetScriptValueCommand } from '../commands/SetScriptValueCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { modelButton } from './ModelControls.js';
import { layoutUV } from './UVLayout.js';

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

export function openUVEditor( editor, object ) {

	if ( document.querySelector( '.mapping-editor' ) || hasRestriction( object, 'locked' ) ) return;
	const warp = isProjector( object );
	const dialog = document.createElement( 'dialog' );
	dialog.className = 'mapping-editor';
	dialog.setAttribute( 'aria-label', warp ? 'Projection warp editor' : 'UV editor' );
	const toolbar = document.createElement( 'div' );
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 440;
	const ctx = canvas.getContext( '2d' );
	const status = document.createElement( 'output' );
	status.setAttribute( 'role', 'status' );
	const size = object.userData.projectorWarp?.size || 4;
	let geometry = object.geometry;
	let selected = [], dragging;
	const original = object.geometry;
	function reset() {

		if ( warp ) return structuredClone( object.userData.projectorWarp?.points || Array.from( { length: size * size },
			( _, i ) => [ i % size / ( size - 1 ), Math.floor( i / size ) / ( size - 1 ) ] ) );
		const uv = geometry.attributes.uv;
		return Array.from( { length: uv?.count || 0 }, ( _, i ) => [ uv.getX( i ), 1 - uv.getY( i ) ] );

	}
	let points = reset();
	const margin = 25, span = canvas.width - margin * 2;
	const pixel = ( [ u, v ] ) => [ margin + u * span, margin + v * span ];
	const layout = document.createElement( 'select' );
	layout.setAttribute( 'aria-label', 'UV layout' );
	function run( action ) {

		try { status.textContent = ''; action(); draw(); }
		catch ( error ) { status.textContent = error.message; }

	}
	if ( ! warp ) {

		for ( const [ id, label ] of [ [ 'xy', 'Planar XY' ], [ 'xz', 'Planar XZ' ], [ 'yz', 'Planar YZ' ], [ 'box', 'Box by face' ] ] ) layout.append( new Option( label, id ) );
		editor.scene.traverse( candidate => { if ( isProjector( candidate ) ) layout.append( new Option( candidate.name || 'Projector', candidate.uuid ) ); } );
		toolbar.append( layout );
		modelButton( toolbar, 'Auto layout', 'toolGrid', () => run( () => {

			const next = layoutUV( THREE, object, layout.value, editor.objectByUuid( layout.value ) );
			if ( geometry !== original ) geometry.dispose();
			geometry = next;
			points = reset();
			selected = [];

		} ) );

	} else modelButton( toolbar, 'Clear warp', 'regenerate', () => run( () => {

		setProjectorMapping( editor, object, 'projectorWarp', null );
		points = reset();
		selected = [];

	} ) );
	modelButton( toolbar, 'Apply', 'apply', () => run( () => {

		if ( warp ) setProjectorMapping( editor, object, 'projectorWarp', { size, points } );
		else {

			if ( object.geometry !== original ) throw new Error( 'The mesh changed. Reopen the UV editor to continue.' );
			if ( ! points.length ) throw new Error( 'Choose an automatic layout first.' );
			const next = geometry.clone();
			const uv = next.attributes.uv;
			points.forEach( ( [ u, v ], i ) => uv.setXY( i, u, 1 - v ) );
			uv.needsUpdate = true;
			const command = new SetGeometryCommand( editor, object, next );
			command.updatable = false;
			editor.execute( command, 'Edit UVs' );

		}
		dialog.close();

	} ) );
	modelButton( toolbar, 'Cancel', 'remove', () => dialog.close() );
	function line( indices ) {

		ctx.beginPath();
		indices.forEach( ( index, i ) => ctx[ i ? 'lineTo' : 'moveTo' ]( ...pixel( points[ index ] ) ) );
		ctx.stroke();

	}
	function draw() {

		ctx.fillStyle = '#12161d';
		ctx.fillRect( 0, 0, canvas.width, canvas.height );
		const material = Array.isArray( object.material ) ? object.material[ 0 ] : object.material;
		const output = object.projectorOutput;
		const source = warp ? output?.warpSource || output?.canvas : material?.map?.image;
		if ( source?.width || source?.videoWidth ) {

			try {

				ctx.globalAlpha = .55;
				if ( warp ) ctx.drawImage( source, output.x, output.y, output.width, output.height, margin, margin, span, span );
				else ctx.drawImage( source, margin, margin, span, span );

			} catch { /* The image has not decoded yet. */ }
			finally { ctx.globalAlpha = 1; }

		}
		ctx.strokeStyle = '#6a7c8d';
		ctx.strokeRect( margin, margin, span, span );
		if ( warp ) for ( let i = 0; i < points.length; i ++ ) {

			if ( i % size < size - 1 ) line( [ i, i + 1 ] );
			if ( i + size < points.length ) line( [ i, i + size ] );

		}
		else if ( points.length ) {

			const index = geometry.index;
			const at = i => index ? index.getX( i ) : i;
			for ( let i = 0; i + 2 < ( index?.count ?? points.length ); i += 3 ) line( [ at( i ), at( i + 1 ), at( i + 2 ), at( i ) ] );

		}
		points.forEach( ( point, index ) => {

			ctx.fillStyle = selected.includes( index ) ? '#ffae62' : '#70dcee';
			ctx.beginPath(); ctx.arc( ...pixel( point ), 2.5, 0, Math.PI * 2 ); ctx.fill();

		} );

	}
	function cursor( event ) {

		const rect = canvas.getBoundingClientRect();
		return [ ( event.clientX - rect.left ) * canvas.width / rect.width, ( event.clientY - rect.top ) * canvas.height / rect.height ];

	}
	canvas.onpointerdown = event => {

		if ( event.button !== 0 ) return;
		const at = cursor( event );
		let hit = -1, best = 9;
		points.forEach( ( point, index ) => {

			const p = pixel( point );
			const distance = Math.hypot( p[ 0 ] - at[ 0 ], p[ 1 ] - at[ 1 ] );
			if ( distance < best ) { best = distance; hit = index; }

		} );
		if ( hit < 0 ) return;
		const matches = points.flatMap( ( point, index ) => point.every( ( value, axis ) => Math.abs( value - points[ hit ][ axis ] ) < 1e-6 ) ? [ index ] : [] );
		selected = event.shiftKey ? [ ...new Set( [ ...selected, ...matches ] ) ] : matches;
		dragging = { at, points: selected.map( index => points[ index ].slice() ) };
		canvas.setPointerCapture( event.pointerId );
		draw();

	};
	canvas.onpointermove = event => {

		if ( ! dragging ) return;
		const at = cursor( event );
		selected.forEach( ( index, i ) => {

			points[ index ] = dragging.points[ i ].map( ( value, axis ) => {

				const next = value + ( at[ axis ] - dragging.at[ axis ] ) / span;
				return warp ? Math.max( 0, Math.min( 1, next ) ) : next;

			} );

		} );
		draw();

	};
	canvas.onpointerup = () => { dragging = null; };
	canvas.onpointercancel = () => {

		if ( dragging ) selected.forEach( ( index, i ) => { points[ index ] = dragging.points[ i ]; } );
		dragging = null;
		draw();

	};
	dialog.append( toolbar, canvas, status );
	document.body.append( dialog );
	dialog.addEventListener( 'close', () => { if ( ! warp && geometry !== original ) geometry.dispose(); dialog.remove(); } );
	dialog.showModal();
	draw();

}
