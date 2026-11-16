import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { addFace, extrudeFace, modelData, modelGeometry, modelObject, outlinePoints, removePoints, splitEdge } from '../editor/js/modeling/ModelGeometry.js';
import { applyProjectionMask, maskFromOutline } from '../editor/js/modeling/ProjectionMask.js';
import { projectorScript, upgradeProjectorScript } from '../editor/js/assets/Projector.js';
import { layoutUV } from '../editor/js/modeling/UVLayout.js';
import { generateThreeCode } from '../editor/js/ThreeCodeExporter.js';

test( 'Authored polygon topology persists through split, extrusion, serialization and deletion', () => {

	const data = modelData( 'mesh' );
	const midpoint = splitEdge( data, 0, 1 );
	assert.deepEqual( data.faces[ 0 ], [ 0, midpoint, 1, 2, 3 ] );
	assert.throws( () => addFace( THREE, data, [ 0, midpoint, 1 ] ), /area/ );
	assert.throws( () => splitEdge( data, 0, 2 ), /existing edge/ );
	const cap = extrudeFace( THREE, data, 0, .5 );
	assert.equal( data.faces.length, 6 );
	assert.equal( data.points[ cap[ 0 ] ][ 2 ], .5 );
	const object = modelObject( THREE, data, 'Mesh' );
	const restored = new THREE.ObjectLoader().parse( object.toJSON() );
	assert.deepEqual( restored.geometry.userData.modeling, data );
	assert.ok( restored.geometry.attributes.position.count >= 30 );
	assert.equal( restored.geometry.attributes.position.count, restored.geometry.attributes.uv.count );
	removePoints( data, cap );
	assert.ok( data.faces.every( face => face.every( index => index < data.points.length ) ) );

} );

test( 'A closed curve can become an extruded receiver or a normalized projector aperture', () => {

	const shape = modelData( 'shape' );
	shape.smooth = true;
	shape.depth = .45;
	const outline = outlinePoints( THREE, shape );
	assert.ok( outline.length > shape.points.length );
	const geometry = modelGeometry( THREE, shape );
	geometry.computeBoundingBox();
	assert.ok( Math.abs( geometry.boundingBox.max.z - .45 ) < 1e-6 );
	const mask = maskFromOutline( outline.map( point => point.toArray() ) );
	assert.equal( mask.mode, 'inside' );
	assert.ok( mask.points.flat().every( value => value >= .1 && value <= .9 ) );

} );

test( 'Projector masking uses the optical rectangle and survives source export and legacy upgrade', () => {

	const mask = { mode: 'inside', points: [ [ .2, .3 ], [ .8, .3 ], [ .5, .7 ] ] };
	const calls = [];
	const context = new Proxy( {}, { get: ( target, key ) => ( ...args ) => calls.push( [ key, ...args ] ) } );
	applyProjectionMask( context, mask, 10, 20, 100, 50 );
	assert.deepEqual( calls.find( call => call[ 0 ] === 'rect' ), [ 'rect', 10, 20, 100, 50 ] );
	assert.deepEqual( calls.find( call => call[ 0 ] === 'moveTo' ), [ 'moveTo', 30, 35 ] );
	assert.deepEqual( calls.find( call => call[ 0 ] === 'fill' ), [ 'fill', 'evenodd' ] );
	calls.length = 0;
	applyProjectionMask( context, { ...mask, mode: 'cutout' }, 10, 20, 100, 50 );
	assert.ok( ! calls.some( call => call[ 0 ] === 'rect' ) );

	const scene = new THREE.Scene(), rig = new THREE.Group();
	rig.userData = { assetObject: { type: 'projector' }, projectionMask: mask };
	scene.add( rig, modelObject( THREE, modelData( 'path' ), 'Curve' ) );
	const script = projectorScript();
	const { code } = generateThreeCode( {
		scene, camera: new THREE.PerspectiveCamera(), scripts: { [ rig.uuid ]: [ script ] }, config: { getKey() {} }
	} );
	assert.match( code, /\.userData\.projectionMask =/ );
	assert.match( code, /g\.userData\.modeling =/ );
	assert.match( code, /applyProjectionMask\( ctx, root\.userData\.projectionMask/ );
	const legacy = { assetBehavior: 'projector', source: 'function projectorRuntime( THREE, root, player ) {\n\t\ttexture.needsUpdate = true;\n}' };
	upgradeProjectorScript( legacy );
	const upgraded = legacy.source;
	assert.match( upgraded, /applyProjectionMask\( ctx, root\.userData\.projectionMask/ );
	upgradeProjectorScript( legacy );
	assert.equal( legacy.source, upgraded );

} );

test( 'A rolled, parented projector preserves the same image plane in its viewport camera', async () => {

	const { fitView, lightViewCamera } = await import( '../editor/js/modeling/LightView.js' );
	const parent = new THREE.Group(), rig = new THREE.Group();
	parent.rotation.y = .63;
	parent.position.set( 3, 1, - 2 );
	parent.add( rig );
	rig.rotation.z = .7;
	rig.userData.assetObject = { type: 'projector' };
	rig.projectorFrame = { width: .4, height: .25, range: 18 };
	const camera = lightViewCamera( THREE, rig );
	const corner = rig.localToWorld( new THREE.Vector3( .4 * 3, .25 * 3, - 3 ) ).project( camera );
	assert.ok( Math.abs( corner.x - 1 ) < 1e-8 && Math.abs( corner.y - 1 ) < 1e-8 );
	assert.equal( lightViewCamera( THREE, rig, camera ), camera );
	assert.deepEqual( fitView( { x: 500, y: 0, width: 500, height: 500 }, 2 ), { x: 500, y: 125, width: 500, height: 250 } );

	const spot = new THREE.SpotLight( 0xffffff, 1, 10, Math.PI / 6 );
	spot.position.set( 0, 1, 5 );
	spot.target.position.set( 0, 1, 0 );
	assert.ok( Math.abs( lightViewCamera( THREE, spot ).fov - 60 ) < 1e-8 );
	assert.ok( lightViewCamera( THREE, new THREE.DirectionalLight() ).isOrthographicCamera );

} );

test( 'Ruler distances follow mesh transforms and report upright area in calibrated units', async () => {

	const { formatMeasurement, makeMeasurePoint, measurementArea, measurementLength, worldMeasurePoints } = await import( '../editor/js/modeling/Measurements.js' );
	const scene = new THREE.Scene(), wall = new THREE.Mesh( new THREE.PlaneGeometry() );
	scene.add( wall );
	const corners = [ [ 0, 0, 0 ], [ 2, 0, 0 ], [ 2, 3, 0 ], [ 0, 3, 0 ] ].map( point => new THREE.Vector3( ...point ) );
	const anchors = corners.map( point => makeMeasurePoint( point, wall ) );
	wall.position.set( 3, 4, 5 );
	wall.scale.setScalar( 2 );
	const resolved = worldMeasurePoints( THREE, scene, null, anchors );
	assert.deepEqual( resolved[ 0 ].toArray(), [ 3, 4, 5 ] );
	assert.equal( measurementLength( resolved, true ), 20 );
	assert.equal( measurementArea( THREE, resolved ), 24 );
	assert.equal( formatMeasurement( 24, 'm', .5, true ), '6.00 m²' );
	wall.removeFromParent();
	assert.deepEqual( worldMeasurePoints( THREE, scene, null, anchors )[ 2 ].toArray(), [ 2, 3, 0 ] );

} );

test( 'Optics helpers place the body behind the lens and the projector frustum along its beam', async () => {

	const { createCameraHelper, createProjectorHelper } = await import( '../editor/js/modeling/OpticsHelpers.js' );
	const parent = new THREE.Group(), projector = new THREE.Group();
	parent.position.set( 4, 2, - 1 );
	parent.rotation.set( .1, .8, -.12 );
	parent.add( projector );
	projector.position.set( 1, .4, - 2 );
	projector.rotation.set( -.35, .6, .2 );
	projector.userData.assetObject = { type: 'projector' };
	projector.projectorFrame = { width: .4, height: .25, range: 12 };
	const helper = createProjectorHelper( THREE, projector );
	helper.updateMatrixWorld( true );

	const origin = projector.getWorldPosition( new THREE.Vector3() );
	const beam = projector.localToWorld( new THREE.Vector3( 0, 0, - 1 ) ).sub( origin ).normalize();
	const frustum = helper.geometry.attributes.position;
	const end = [ 'f1', 'f2', 'f3', 'f4' ].reduce( ( center, corner ) =>
		center.add( new THREE.Vector3().fromBufferAttribute( frustum, helper.pointMap[ corner ][ 0 ] ) ), new THREE.Vector3()
	).multiplyScalar( .25 ).applyMatrix4( helper.matrixWorld );
	assert.ok( end.sub( origin ).distanceTo( beam.clone().multiplyScalar( 12 ) ) < 1e-5 );

	for ( const body of [ helper.getObjectByName( 'Projector body' ), createCameraHelper( THREE, new THREE.PerspectiveCamera() ).getObjectByName( 'Camera body' ) ] ) {

		assert.ok( body.isLineSegments );
		assert.equal( body.material.color.getHex(), 0xff9d3d );
		body.geometry.computeBoundingBox();
		assert.equal( body.geometry.boundingBox.min.z, 0 );
		assert.ok( body.geometry.boundingBox.max.z > .2 );

	}

} );

test( 'Draft shapes stay open until completed and legacy shapes still fill', () => {

	const legacy = modelData( 'shape' );
	const draft = { ...legacy, closed: false };
	assert.equal( modelGeometry( THREE, draft ).attributes.position.count, 0 );
	const closed = { ...draft, closed: true };
	assert.ok( modelGeometry( THREE, closed ).attributes.position.count >= 3 );
	assert.equal( modelGeometry( THREE, legacy ).attributes.position.count, modelGeometry( THREE, closed ).attributes.position.count );
	assert.deepEqual( closed.points, draft.points );

} );


test( 'Projector UV layout uses the lens and preserves the source mesh', () => {

	const projector = new THREE.Group();
	projector.userData.assetObject = { type: 'projector' };
	projector.projectorFrame = { width: .5, height: .25, range: 20 };
	const mesh = new THREE.Mesh( new THREE.PlaneGeometry( 2, 1 ) );
	mesh.position.z = -4;
	const source = mesh.geometry.attributes.uv;
	const uv = layoutUV( THREE, mesh, projector.uuid, projector ).attributes.uv;
	assert.ok( Math.abs( uv.getX( 0 ) - .25 ) < 1e-6 );
	assert.ok( Math.abs( uv.getY( 0 ) - .75 ) < 1e-6 );
	assert.equal( source.getX( 0 ), 0 );
	assert.equal( source.getY( 0 ), 1 );
	mesh.position.z = 1;
	assert.throws( () => layoutUV( THREE, mesh, projector.uuid, projector ), /in front/ );

} );
