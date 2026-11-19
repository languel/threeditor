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
	return new THREE.Quaternion().setFromAxisAngle( right, -dy * .008 )
		.multiply( new THREE.Quaternion().setFromAxisAngle( up, -dx * .008 ) );

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

export function transformFeature( editor, frame, event, mode, reference, allows ) {

	const rect = editor.viewLayout.clientRect( frame );
	const camera = frame.camera;
	const cursor = new THREE.Vector2( event.clientX - rect.left, event.clientY - rect.top );
	const ray = new THREE.Raycaster();
	ray.setFromCamera( new THREE.Vector2( cursor.x * 2 / rect.width - 1, 1 - cursor.y * 2 / rect.height ), camera );
	return snapMeshFeature( { mode, ray, scene: editor.scene, camera, rect, cursor, reference, allows } );

}

export function transformNumber( value, key ) {

	if ( key === 'backspace' ) return value.slice( 0, -1 );
	if ( key === '-' ) return value.startsWith( '-' ) ? value.slice( 1 ) : '-' + value;
	if ( /^[0-9]$/.test( key ) || key === '.' && ! value.includes( '.' ) ) return value + key;
	return value;

}

export const transformHints = 'G/R/S switch · R twice trackball · X/Y/Z axis · Shift+axis plane · middle drag auto constraint · Shift fine · Ctrl invert snap · Shift+Tab snap · Enter confirm · Esc cancel';
