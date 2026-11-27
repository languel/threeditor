import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';

const models = new URL( '../editor/js/modeling/', import.meta.url );
const three = new URL( '../build/three.module.js', import.meta.url ).href;
const restrictions = new URL( '../ObjectRestrictions.js', models ).href;
const deformation = new URL( '../rigging/ArmatureDeformation.js', models ).href;
async function moduleUrl( name, imports = {} ) {

	let source = await readFile( new URL( name, models ), 'utf8' );
	const replacements = { 'three': three, '../ObjectRestrictions.js': restrictions, '../rigging/ArmatureDeformation.js': deformation, ...imports };
	source = source.replace( /from '([^'?]+)(?:\?[^']+)?'/g, ( match, from ) => replacements[ from ] ? `from '${ replacements[ from ] }'` : match );
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

test( 'Surface and vertex snapping use the world position of a point cloud sample and respect mesh occlusion', async () => {

	const { modelSurfaceHit, modelSurfaceNormal } = await import( surface );
	const scene = new THREE.Scene();
	const camera = new THREE.OrthographicCamera( - 2, 2, 2, - 2, .1, 20 );
	camera.position.z = 5;
	camera.updateMatrixWorld();
	const cloud = new THREE.Points( new THREE.BufferGeometry()
		.setAttribute( 'position', new THREE.Float32BufferAttribute( [ 0, 0, 0 ], 3 ) )
		.setAttribute( 'normal', new THREE.Float32BufferAttribute( [ 0, 0, 1 ], 3 ) ) );
	cloud.position.set( .04, 0, 1 );
	const other = new THREE.Mesh( new THREE.PlaneGeometry( 3, 3 ) );
	scene.add( other, cloud );
	const ray = new THREE.Raycaster();
	ray.setFromCamera( new THREE.Vector2(), camera );
	const rect = { width: 400, height: 400 };
	const hit = modelSurfaceHit( ray, scene, null, camera, rect );
	assert.equal( hit.object, cloud );
	assert.deepEqual( hit.point.toArray(), [ .04, 0, 1 ] );
	assert.deepEqual( modelSurfaceNormal( hit, ray ).toArray(), [ 0, 0, 1 ] );
	assert.deepEqual( snapMeshFeature( { mode: 'vertex', ray, scene, object: new THREE.Object3D(), camera, rect,
		cursor: new THREE.Vector2( 200, 200 ) } ).toArray(), hit.point.toArray() );
	other.position.z = 2;
	assert.equal( modelSurfaceHit( ray, scene, null, camera, rect ).object, other );
	other.position.z = 0;
	cloud.position.x = .11;
	assert.equal( modelSurfaceHit( ray, scene, null, camera, rect ).object, other );

} );

test( 'Empty handles stay in the editor and follow saved shape and object transforms', async () => {

	const { createEmpty, createEmptyHelper, imageReference } = await import( await moduleUrl( 'ReferenceObjects.js' ) );
	const empty = createEmpty( 'axes' );
	empty.position.set( 1, 2, 3 );
	empty.updateMatrix();
	const loaded = new THREE.ObjectLoader().parse( JSON.parse( JSON.stringify( empty.toJSON() ) ) );
	assert.equal( loaded.children.length, 0 );
	const helper = createEmptyHelper( loaded );
	helper.update();
	assert.equal( helper.geometry.attributes.position.count, 6 );
	loaded.userData.emptyDisplay = { style: 'cube', size: 2 };
	helper.update();
	assert.equal( helper.geometry.attributes.position.count, 24 );
	const position = new THREE.Vector3().setFromMatrixPosition( helper.matrixWorld );
	assert.deepEqual( position.toArray(), [ 1, 2, 3 ] );
	assert.equal( helper.matrixWorld.getMaxScaleOnAxis(), 2 );
	helper.dispose();

	const plane = imageReference( new THREE.Mesh( new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial() ), 'back' );
	assert.equal( plane.userData.annotation, true );
	assert.equal( plane.material.depthWrite, false );
	assert.equal( plane.material.depthTest, false );
	assert.equal( plane.material.blending, THREE.CustomBlending );

} );

test( 'A transformed level set provides a triangle surface for modeling picks', async () => {

	const reference = await moduleUrl( 'ReferenceObjects.js' );
	const marching = await moduleUrl( '../../../examples/jsm/objects/MarchingCubes.js' );
	const parser = new URL( '../libs/openvdb/parser.mjs', models ).href;
	const { volumeSurface } = await import( await moduleUrl( '../assets/VolumeReference.js', {
		'../modeling/ReferenceObjects.js': reference,
		'three/addons/objects/MarchingCubes.js': marching,
		'../libs/openvdb/parser.mjs': parser
	} ) );
	const matrix = new THREE.Matrix4().makeScale( .5, .5, .5 );
	matrix.setPosition( 1, 2, 3 );
	const grid = {
		indexBBox: { min: [ - 5, - 5, - 5 ], max: [ 5, 5, 5 ] }, background: 1,
		transform: { matrix: matrix.clone().transpose().toArray() },
		readValue: ( xyz ) => ( { value: Math.min( 1, Math.hypot( ...xyz ) - 4 ) } )
	};
	const { geometry, iso } = volumeSurface( grid );
	assert.equal( iso, 0 );
	assert.deepEqual( geometry.boundingBox.min.toArray(), [ - 1, 0, 1 ] );
	assert.deepEqual( geometry.boundingBox.max.toArray(), [ 3, 4, 5 ] );
	const mesh = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } ) );
	const ray = new THREE.Raycaster( new THREE.Vector3( 1, 2, 7 ), new THREE.Vector3( 0, 0, - 1 ) );
	const hit = ray.intersectObject( mesh )[ 0 ];
	assert.deepEqual( hit.point.toArray(), [ 1, 2, 5 ] );

} );
