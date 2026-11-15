import * as THREE from 'three';
import { isVisible } from '../ObjectRestrictions.js';

export function rayToView( ray, layout, frame, x, y ) {

	const rect = layout.clientRect( frame );
	const pointer = new THREE.Vector2( 2 * ( x - rect.left ) / rect.width - 1, 1 - 2 * ( y - rect.top ) / rect.height );
	ray.setFromCamera( pointer, frame.camera );
	return ray;

}

export function meshHit( ray, scene, exclude ) {

	scene.updateMatrixWorld( true );
	return ray.intersectObjects( scene.children ).find( hit => {

		const object = hit.object;
		return object.isMesh && ! object.isInstancedMesh && object !== exclude && hit.face &&
			! object.userData.runtimeOnly && ! object.userData.surfaceMark && isVisible( object );

	} );

}
