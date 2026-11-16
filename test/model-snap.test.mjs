import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';

const models = new URL( '../editor/js/modeling/', import.meta.url );
const three = new URL( '../build/three.module.js', import.meta.url ).href;
const restrictions = new URL( '../ObjectRestrictions.js', models ).href;
async function moduleUrl( name, imports = {} ) {

	let source = await readFile( new URL( name, models ), 'utf8' );
	for ( const [ from, to ] of Object.entries( { 'three': three, '../ObjectRestrictions.js': restrictions, ...imports } ) ) {

		source = source.replace( `from '${ from }'`, `from '${ to }'` );

	}
	return 'data:text/javascript;base64,' + Buffer.from( source ).toString( 'base64' );

}
const surface = await moduleUrl( 'SurfacePicking.js' );
const { modelSnapMode, snapIncrement, snapMeshFeature } = await import( await moduleUrl( 'ModelSnap.js', { './SurfacePicking.js': surface } ) );

test( 'Increment snapping preserves axes outside the active lattice and recalls the magnet target', () => {

	const reference = new THREE.Vector3( 0.2, 0.3, 7 );
	const axes = [ new THREE.Vector3( 1, 0, 0 ), new THREE.Vector3( 0, 1, 0 ) ];
	assert.deepEqual( snapIncrement( new THREE.Vector3( 1.25, 2.21, 14 ), reference, axes, 1 ).toArray(), [ 1.2, 2.3, 7 ] );
	const values = { 'settings/transformSnap': null, 'settings/transformSnapTarget': 'face' };
	const config = { getKey: key => values[ key ] };
	assert.equal( modelSnapMode( config ), null );
	assert.equal( modelSnapMode( config, true ), 'face' );
	values[ 'settings/transformSnap' ] = 0.5;
	assert.equal( modelSnapMode( config ), 0.5 );

} );

test( 'Mesh magnets distinguish vertices, edge midpoints, perpendicular feet, and face centers', () => {

	const scene = new THREE.Scene();
	const camera = new THREE.OrthographicCamera( 0, 4, 4, 0, 0.1, 10 );
	camera.position.z = 3;
	camera.updateMatrixWorld();
	const geometry = new THREE.BufferGeometry().setAttribute( 'position',
		new THREE.Float32BufferAttribute( [ 0, 0, 0, 4, 0, 0, 0, 4, 0 ], 3 ) );
	const receiver = new THREE.Mesh( geometry );
	const object = new THREE.Object3D();
	scene.add( receiver, object );
	const rect = { width: 400, height: 400 };
	const ray = new THREE.Raycaster();
	function snap( mode, x, y, reference, points, excluded ) {

		ray.setFromCamera( new THREE.Vector2( x / 2 - 1, y / 2 - 1 ), camera );
		return snapMeshFeature( { mode, ray, scene, object, camera, rect, cursor: new THREE.Vector2( x * 100, 400 - y * 100 ),
			reference, points, excluded } );

	}
	assert.deepEqual( snap( 'vertex', 0.04, 0.04 ).toArray(), [ 0, 0, 0 ] );
	assert.deepEqual( snap( 'edgeCenter', 1, 0.05 ).toArray(), [ 2, 0, 0 ] );
	assert.deepEqual( snap( 'edgePerpendicular', 1, 0.05, new THREE.Vector3( 3, 2, 0 ) ).toArray(), [ 3, 0, 0 ] );
	assert.deepEqual( snap( 'faceCenter', 1, 1 ).toArray(), [ 4 / 3, 4 / 3, 0 ] );
	assert.deepEqual( snap( 'faceNearest', 1, 1, new THREE.Vector3( 2, 1, 8 ) ).toArray(), [ 2, 1, 0 ] );
	assert.equal( snap( 'vertex', 2, 2, undefined, [ [ 2, 2, 0 ] ], [ 0 ] ), undefined );

} );
