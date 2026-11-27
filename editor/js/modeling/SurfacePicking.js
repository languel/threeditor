import * as THREE from 'three';
import { isVisible } from '../ObjectRestrictions.js';

export function rayToView( ray, layout, frame, x, y ) {

	const rect = layout.clientRect( frame );
	const pointer = new THREE.Vector2( 2 * ( x - rect.left ) / rect.width - 1, 1 - 2 * ( y - rect.top ) / rect.height );
	ray.setFromCamera( pointer, frame.camera );
	return ray;

}

export function meshHit( ray, scene, exclude, allows ) {

	scene.updateMatrixWorld( true );
	return ray.intersectObjects( scene.children ).find( hit => {

		const object = hit.object;
		return object.isMesh && ! object.isInstancedMesh && object !== exclude && hit.face &&
			! object.userData.runtimeOnly && ! object.userData.surfaceMark && isVisible( object ) && allows?.( object ) !== false;

	} );

}


export function paintSurfaces( scene, allows ) {

	const triangles = [], scans = [], receivers = new Map();
	scene.traverseVisible( object => {

		if ( object.userData.surfaceMark || ! isVisible( object ) || allows?.( object ) === false ) return;
		if ( ! object.userData.runtimeOnly && object.isMesh ) {

			triangles.push( object );
			receivers.set( object, object );

		} else if ( object.isPoints || object.splats && object.isInitialized ) {

			const receiver = object.userData.runtimeOnly ? object.parent : object;
			// Keep hit testing on the original receiver as painted Gaussians accumulate.
			if ( receiver && ! receiver.userData.surfaceMark &&
				( receiver === object || receiver.userData.assetObject?.type === 'gaussian-splat' ) ) {

				scans.push( object );
				receivers.set( object, receiver );

			}

		}

	} );
	return { triangles, scans, receivers };

}

export function modelSurfaceHit( ray, scene, exclude, camera, rect, allows ) {

	scene.updateMatrixWorld( true );
	const { triangles, scans, receivers } = paintSurfaces( scene, allows );
	const mesh = ray.intersectObjects( triangles.filter( object => object !== exclude && ! object.isInstancedMesh &&
		( object.userData.modelReference?.kind !== 'image' || object.material.map ) ), false ).find( hit => hit.face );
	let closest = mesh;
	const position = new THREE.Vector3(), projected = new THREE.Vector3(), sample = new THREE.Vector3();
	const pixel = 8;
	const threshold = ray.params.Points.threshold;
	try {

		for ( const object of scans ) {

			const owner = receivers.get( object );
			if ( owner === exclude || owner.userData.assetObject?.paintBatch ) continue;
			if ( ! object.isPoints ) {

				const hit = ray.intersectObject( object, false )[ 0 ];
				if ( hit && ( ! closest || hit.distance < closest.distance ) ) closest = hit;
				continue;

			}
			const geometry = object.geometry;
			if ( ! geometry.boundingSphere ) geometry.computeBoundingSphere();
			const sphere = geometry.boundingSphere;
			const center = position.copy( sphere.center ).applyMatrix4( object.matrixWorld ).applyMatrix4( camera.matrixWorldInverse );
			const farthest = Math.max( camera.near, - center.z + sphere.radius * object.matrixWorld.getMaxScaleOnAxis() );
			const frustumHeight = camera.isOrthographicCamera ? ( camera.top - camera.bottom ) / camera.zoom :
				2 * farthest * Math.tan( THREE.MathUtils.degToRad( camera.getEffectiveFOV() / 2 ) );
			ray.params.Points.threshold = pixel * frustumHeight / rect.height;
			let best, bestPixel = pixel;
			for ( const hit of ray.intersectObject( object, false ) ) {

				if ( closest && hit.distance > closest.distance ) break;
				position.fromBufferAttribute( geometry.attributes.position, hit.index ).applyMatrix4( object.matrixWorld );
				ray.ray.at( hit.distance, projected ).project( camera );
				sample.copy( position ).project( camera );
				const error = Math.hypot( ( projected.x - sample.x ) * rect.width / 2, ( projected.y - sample.y ) * rect.height / 2 );
				if ( error <= bestPixel ) { bestPixel = error; best = { ...hit, point: position.clone() }; }

			}
			if ( best ) closest = best;

		}

	} finally { ray.params.Points.threshold = threshold; }
	return closest;

}

export function modelSurfaceNormal( hit, ray ) {

	const normals = hit.object.geometry?.attributes.normal;
	const normal = hit.face ? hit.face.normal.clone() : normals && Number.isInteger( hit.index ) ?
		new THREE.Vector3().fromBufferAttribute( normals, hit.index ) : null;
	if ( ! normal?.lengthSq() ) return ray.ray.direction.clone().negate();
	normal.applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( hit.object.matrixWorld ) );
	return normal.dot( ray.ray.direction ) > 0 ? normal.negate() : normal;

}
