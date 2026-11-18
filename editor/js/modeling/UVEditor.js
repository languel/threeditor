import * as THREE from 'three';
import { unwrapUVs } from 'three/addons/utils/unwrapUVs.js';
import { modifierSource, setModifierStack } from './Modifiers.js?v=poly-context';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { isProjector, upgradeProjectorScript } from '../assets/Projector.js?v=mask-editor';
import { SetScriptValueCommand } from '../commands/SetScriptValueCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { modelButton } from './ModelControls.js';
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
	const layout = document.createElement( 'select' );
	layout.setAttribute( 'aria-label', 'UV layout' );
	function run( action ) {

		try { status.textContent = ''; action(); draw(); }
		catch ( error ) { status.textContent = error.message; }

	}
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
			selected = [];
			dirty = true;

		} ) );

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
		status.textContent = warp ? 'Warp applied.' : 'UVs applied.';

	} ) );
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
		if ( selected.length ) dirty = true;
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
	workspacePanel.append( toolbar, canvas, status );
	const updateGeometry = changed => {

		if ( warp || changed !== object || source() === original || dirty ) return;
		original = geometry = source();
		points = reset();
		selected = [];
		draw();

	};
	editor.signals.geometryChanged.add( updateGeometry );
	editor.editWorkspace.mount( warp ? 'warp' : 'uv', object, workspacePanel, () => {

		editor.signals.geometryChanged.remove( updateGeometry );
		if ( ! warp && geometry !== original ) geometry.dispose();

	}, () => dirty );
	if ( focus ) canvas.focus();
	draw();

}
