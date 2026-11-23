import { closestPointOnSegment, segmentCount } from './Contour.js';
import { outlinePoints } from './ModelGeometry.js?v=expressive-pencil';
import * as THREE from 'three';
import { selectionRegionIntersectsSegment } from './MeshSelection.js?v=pencil-selection';

export function isPencilStroke( object ) {

	return object.geometry?.userData.modeling?.kind === 'path' &&
		( object.userData.pencilStroke || object.name === 'Pencil stroke' );

}

function projectedSegments( object, camera, width, height, visit ) {

	const data = object.geometry.userData.modeling;
	const view = new THREE.Matrix4().multiplyMatrices( camera.matrixWorldInverse, object.matrixWorld );
	const points = outlinePoints( THREE, data ).map( point => point.applyMatrix4( view ) );
	const screen = point => {

		const projected = point.clone().applyMatrix4( camera.projectionMatrix );
		return [ ( projected.x + 1 ) * width / 2, ( 1 - projected.y ) * height / 2 ];

	};
	for ( let i = 0, count = segmentCount( points, data.closed ); i < count; i ++ ) {

		const a = points[ i ], b = points[ ( i + 1 ) % points.length ];
		const za = -a.z, zb = -b.z;
		if ( Math.max( za, zb ) < camera.near || Math.min( za, zb ) > camera.far ) continue;
		const clip = ( point, depth, other ) => depth >= camera.near && depth <= camera.far ? point :
			point.clone().lerp( other, ( Math.max( camera.near, Math.min( camera.far, depth ) ) - depth ) / ( -other.z - depth ) );
		const start = clip( a, za, b ), end = clip( b, zb, a );
		if ( visit( screen( start ), screen( end ), start, end ) ) return true;

	}
	return false;

}

export function hitPencilStroke( object, camera, width, height, cursor ) {

	let hit, best = 7;
	projectedSegments( object, camera, width, height, ( a, b, start, end ) => {

		const { distance, fraction } = closestPointOnSegment( cursor, a, b );
		if ( distance > best ) return false;
		best = distance;
		const t = camera.isOrthographicCamera ? fraction :
			( fraction / end.z ) / ( ( 1 - fraction ) / start.z + fraction / end.z );
		hit = new THREE.Vector3().lerpVectors( start, end, t ).applyMatrix4( camera.matrixWorld );
		return false;

	} );
	return hit;

}

export function regionHitsPencilStroke( object, camera, width, height, region, radius ) {

	return projectedSegments( object, camera, width, height, ( a, b ) => selectionRegionIntersectsSegment( region, a, b, radius ) );

}
