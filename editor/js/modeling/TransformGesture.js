import * as THREE from 'three';
import { modelSnapMode, snapMeshFeature } from './ModelSnap.js';

export const transformModes = new Map( [ [ 'g', 'translate' ], [ 'r', 'rotate' ], [ 's', 'scale' ] ] );

export function modalSnapMode( config, invert ) {

	const enabled = config.getKey( 'settings/transformSnap' ) != null;
	return enabled === Boolean( invert ) ? null : modelSnapMode( config, true );

}

export function trackballDelta( camera, dx, dy ) {

	const orientation = camera.getWorldQuaternion( new THREE.Quaternion() );
	const up = new THREE.Vector3( 0, 1, 0 ).applyQuaternion( orientation );
	const right = new THREE.Vector3( 1, 0, 0 ).applyQuaternion( orientation );
	return new THREE.Quaternion().setFromAxisAngle( right, dy * .008 )
		.multiply( new THREE.Quaternion().setFromAxisAngle( up, dx * .008 ) );

}

export function automaticAxis( frame, pivot, basis, start, pointer, plane ) {

	const drag = new THREE.Vector2( pointer.clientX - start.clientX, start.clientY - pointer.clientY );
	if ( drag.lengthSq() < 36 ) return;
	drag.normalize();
	const { camera, rect } = frame;
	const center = pivot.clone().project( camera );
	const right = new THREE.Vector3().setFromMatrixColumn( camera.matrixWorld, 0 );
	const up = new THREE.Vector3().setFromMatrixColumn( camera.matrixWorld, 1 );
	let score = -Infinity, axis;
	for ( let i = 0; i < 3; i ++ ) {

		const dir = new THREE.Vector3().setComponent( i, 1 ).applyQuaternion( basis );
		const screen = new THREE.Vector2( right.dot( dir ), up.dot( dir ) );
		if ( screen.lengthSq() < 1e-6 ) continue;
		// Account for perspective foreshortening away from the center of the pane.
		const end = pivot.clone().addScaledVector( dir, camera.isPerspectiveCamera ?
			Math.max( .001, -pivot.clone().applyMatrix4( camera.matrixWorldInverse ).z * .001 ) : 1 ).project( camera );
		screen.set( ( end.x - center.x ) * rect.width, ( end.y - center.y ) * rect.height ).normalize();
		const alignment = Math.abs( screen.dot( drag ) ) * ( plane ? -1 : 1 );
		if ( alignment > score ) { score = alignment; axis = 'XYZ'[ i ]; }

	}
	return axis;

}

function transformRay( editor, frame, event ) {

	const rect = editor.viewLayout.clientRect( frame );
	const camera = frame.camera;
	const cursor = new THREE.Vector2( event.clientX - rect.left, event.clientY - rect.top );
	const ray = new THREE.Raycaster();
	ray.setFromCamera( new THREE.Vector2( cursor.x * 2 / rect.width - 1, 1 - cursor.y * 2 / rect.height ), camera );
	return { ray, scene: editor.scene, camera, rect, cursor };

}

export function transformFeature( editor, frame, event, mode, reference, allows ) {

	return snapMeshFeature( { ...transformRay( editor, frame, event ), mode, reference, allows } );

}

export function pickTransformSnapBase( editor, frame, event, pivot, controlPoint ) {

	const params = transformRay( editor, frame, event );
	const nearby = snapMeshFeature( { ...params, mode: 'vertex' } );
	const surface = snapMeshFeature( { ...params, mode: 'face' } );
	if ( controlPoint && ( ! surface || params.ray.ray.origin.distanceToSquared( controlPoint ) <= params.ray.ray.origin.distanceToSquared( surface ) + 1e-6 ) ) return controlPoint;
	return nearby || surface || snapMeshFeature( { ...params, mode: 'object' } ) ||
		params.ray.ray.intersectPlane( new THREE.Plane().setFromNormalAndCoplanarPoint(
			frame.camera.getWorldDirection( new THREE.Vector3() ), pivot ), new THREE.Vector3() );

}

export function isConstraintDrag( event ) {

	return event.button === 1 || event.button === 0 && event.altKey;

}

export function startConstraintDrag( event, mode ) {

	return { clientX: event.clientX, clientY: event.clientY, button: event.button, id: event.pointerId,
		plane: event.shiftKey && mode !== 'rotate', locked: false };

}

export function endsConstraintDrag( drag, event ) {

	return drag && drag.button !== undefined && drag.id === event.pointerId &&
		( drag.button === event.button || event.type === 'pointercancel' );

}

export function constraintHint( drag, lock ) {

	if ( drag && ! drag.locked ) return 'Move the pointer to choose a constraint';
	if ( ! lock ) return '';
	return drag && drag.button === undefined ? lock + ' selected · release Alt to lock' : lock + ' locked';

}

export function createSnapBaseMarker( viewport ) {

	const marker = document.createElement( 'span' );
	marker.className = 'transform-snap-base';
	marker.setAttribute( 'aria-hidden', 'true' );
	marker.hidden = true;
	viewport.append( marker );
	return marker;

}

export function showSnapBase( marker, frame, point ) {

	marker.hidden = true;
	if ( ! frame || ! point ) return;
	const projected = point.project( frame.camera );
	if ( ! Number.isFinite( projected.x ) || Math.abs( projected.x ) > 1 || Math.abs( projected.y ) > 1 || Math.abs( projected.z ) > 1 ) return;
	const { x, y, width, height } = frame.rect;
	marker.style.left = x + ( projected.x + 1 ) * width / 2 + 'px';
	marker.style.top = y + ( 1 - projected.y ) * height / 2 + 'px';
	marker.hidden = false;

}

export function snapBaseHint( picking, base, moving ) {

	if ( picking ) return 'Click a reference point in the scene';
	if ( base ) return 'Snap base set · move it onto a snap target · B repick';
	return moving ? 'B pick snap base' : '';

}

export function transformNumber( value, key ) {

	if ( key === 'backspace' ) return value.slice( 0, -1 );
	if ( key === '-' ) return value.startsWith( '-' ) ? value.slice( 1 ) : '-' + value;
	if ( /^[0-9]$/.test( key ) || key === '.' && ! value.includes( '.' ) ) return value + key;
	return value;

}

export const transformHints = 'G/R/S switch · R twice trackball · X/Y/Z axis · Shift+axis plane · Hold Alt and move, or middle drag, to lock · Shift+Alt plane · Shift fine · Ctrl invert snap · Shift+Tab snap · Enter confirm · Esc cancel';
