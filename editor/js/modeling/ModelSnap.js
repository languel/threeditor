import * as THREE from 'three';
import { isVisible } from '../ObjectRestrictions.js';
import { meshHit, modelSurfaceHit } from './SurfacePicking.js?v=local-view';

export const modelSnapTargets = [
	[ 'increment', 'Increment', 'toolSnap' ], [ 'grid', 'Grid', 'toolGrid' ],
	[ 'vertex', 'Vertex', 'snapVertex' ], [ 'edge', 'Edge', 'snapEdge' ],
	[ 'edgeCenter', 'Edge midpoint', 'snapMidpoint' ], [ 'edgePerpendicular', 'Edge perpendicular', 'snapPerpendicular' ],
	[ 'face', 'Face project', 'snapFace' ], [ 'faceCenter', 'Face center', 'snapFaceCenter' ],
	[ 'faceNearest', 'Face nearest', 'snapFace' ], [ 'object', 'Object origin', 'pivotActive' ]
];

export function modelSnapMode( config, held = false ) {

	const configured = config.getKey( 'settings/transformSnap' );
	return configured ?? ( held ? config.getKey( 'settings/transformSnapTarget' ) ?? 'grid' : null );

}

export function snapIncrement( point, reference, axes, step ) {

	if ( ! Number.isFinite( step ) || step <= 0 ) return point.clone();
	const delta = point.clone().sub( reference );
	const snapped = reference.clone();
	for ( const axis of axes ) snapped.addScaledVector( axis, Math.round( delta.dot( axis ) / step ) * step );
	return snapped;

}

function screenPoint( point, camera, rect ) {

	const ndc = point.clone().project( camera );
	if ( ndc.z < - 1 || ndc.z > 1 ) return null;
	return new THREE.Vector2( ( ndc.x + 1 ) * rect.width / 2, ( 1 - ndc.y ) * rect.height / 2 );

}

// Measure feature proximity in pixels so zooming does not change the pick tolerance.
export function snapMeshFeature( { mode, ray, scene, object, camera, rect, cursor, reference, points = [], excluded = [], allows } ) {

	if ( mode === 'object' ) {

		let nearest = 24, result;
		scene.traverseVisible( candidate => {

			if ( candidate === scene || candidate === object || candidate.userData.runtimeOnly || ! isVisible( candidate ) || allows?.( candidate ) === false ) return;
			const point = candidate.getWorldPosition( new THREE.Vector3() );
			const distance = screenPoint( point, camera, rect )?.distanceTo( cursor );
			if ( distance < nearest ) { nearest = distance; result = point; }

		} );
		return result;

	}

	const hit = mode === 'face' || mode === 'vertex' ? modelSurfaceHit( ray, scene, object, camera, rect, allows ) : meshHit( ray, scene, object, allows );
	if ( mode === 'face' ) return hit?.point;
	const candidates = [];
	if ( hit && ! hit.face && mode === 'vertex' ) candidates.push( { point: hit.point } );
	else if ( hit?.face ) {

		const { a, b, c } = hit.face;
		const positions = hit.posedPosition || hit.object.geometry.attributes.position;
		const corners = [ a, b, c ].map( index => new THREE.Vector3().fromBufferAttribute( positions, index ).applyMatrix4( hit.object.matrixWorld ) );
		const triangle = new THREE.Triangle( ...corners );
		if ( mode === 'faceCenter' ) return triangle.getMidpoint( new THREE.Vector3() );
		if ( mode === 'faceNearest' ) return triangle.closestPointToPoint( reference ?? hit.point, new THREE.Vector3() );
		if ( mode === 'vertex' ) {

			for ( const point of corners ) candidates.push( { point } );

		} else for ( let i = 0; i < 3; i ++ ) {

			const edge = new THREE.Line3( corners[ i ], corners[ ( i + 1 ) % 3 ] );
			const nearest = edge.closestPointToPoint( hit.point, true, new THREE.Vector3() );
			const point = mode === 'edgeCenter' ? edge.getCenter( new THREE.Vector3() ) : mode === 'edgePerpendicular' && reference ?
				edge.closestPointToPoint( reference, true, new THREE.Vector3() ) : nearest;
			candidates.push( { point, nearest } );

		}

	}
	let nearest = 18, result;
	function consider( point, where = point ) {

		const distance = screenPoint( where, camera, rect )?.distanceTo( cursor );
		if ( distance < nearest ) { nearest = distance; result = point; }

	}
	for ( const { point, nearest } of candidates ) consider( point, nearest );
	if ( mode === 'vertex' ) {

		const moving = new Set( excluded );
		points.forEach( ( point, index ) => {

			if ( ! moving.has( index ) ) consider( object.localToWorld( new THREE.Vector3( ...point ) ) );

		} );

	}
	return result;

}
