import * as THREE from 'three';
import { modelObject } from './ModelGeometry.js';

export function localSurfacePoint( hit, ray ) {

	const normal = ( hit.normal || hit.face.normal ).clone().applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( hit.object.matrixWorld ) );
	if ( normal.dot( ray.ray.direction ) > 0 ) normal.negate();
	const offset = Math.max( .00015, hit.distance * .00008 );
	return hit.object.worldToLocal( hit.point.clone().addScaledVector( normal, offset ) ).toArray();

}

export function surfacePath( points, color ) {

	const line = modelObject( THREE, { kind: 'path', points, smooth: false, closed: false, planar: false }, 'Surface path' );
	line.material.color.set( color );
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
