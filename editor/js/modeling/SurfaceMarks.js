import * as THREE from 'three';
import { modelObject } from './ModelGeometry.js?v=texture-projection';

export function localSurfacePoint( hit, ray, receiver = hit.object ) {

	const normal = ray.ray.direction.clone().negate();
	if ( hit.face ) {

		const matrix = hit.object.matrixWorld;
		const surfaceMatrix = hit.instanceId === undefined ? matrix : new THREE.Matrix4();
		if ( hit.instanceId !== undefined ) {

			hit.object.getMatrixAt( hit.instanceId, surfaceMatrix );
			surfaceMatrix.premultiply( matrix );

		}
		normal.copy( hit.normal || hit.face.normal ).applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( surfaceMatrix ) );

	}
	if ( normal.dot( ray.ray.direction ) > 0 ) normal.negate();
	const offset = Math.max( .00015, hit.distance * .00008 );
	return receiver.worldToLocal( hit.point.clone().addScaledVector( normal, offset ) ).toArray();

}

export function surfacePath( points, color, closed = false, opacity = 1 ) {

	const line = modelObject( THREE, { kind: 'path', points, smooth: false, closed, planar: false }, 'Surface path' );
	line.material.color.set( color );
	line.material.opacity = opacity;
	line.material.transparent = opacity < 1;
	line.userData.surfaceMark = true;
	return line;

}

export function surfacePaint( positions, color, opacity ) {

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	const material = new THREE.MeshBasicMaterial( {
		color, opacity, side: THREE.DoubleSide,
		transparent: opacity < 1, depthWrite: false,
		polygonOffset: true, polygonOffsetFactor: - 1, polygonOffsetUnits: - 1
	} );
	const mark = new THREE.Mesh( geometry, material );
	mark.name = 'Surface paint';
	mark.userData.surfaceMark = true;
	return mark;

}
