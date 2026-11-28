import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { armatureVertexWeights, weightsForVertexEdits, withArmatureDeformation } from '../editor/js/rigging/ArmatureDeformation.js';
import { paintBoneWeight, weightNeighbors, weightPointKey } from '../editor/js/rigging/ArmatureWeights.js';
import { boneRestFromPoints, createArmature, createBone } from '../editor/js/rigging/Armature.js';
import { LogicRuntime } from '../editor/js/nodes/LogicRuntime.js';
import { createLogicGraph, LOGIC_DOMAIN } from '../editor/js/nodes/LogicNodes.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';

function setup( line = false ) {

	const scene = new THREE.Scene();
	const rig = createArmature( THREE );
	const root = rig.children[ 0 ];
	const tip = createBone( THREE, 'Tip', boneRestFromPoints( THREE, [ 0, 1, 0 ], [ 0, 2, 0 ], 0, true ) );
	root.add( tip );
	const geometry = new THREE.BufferGeometry().setAttribute( 'position', new THREE.Float32BufferAttribute( [
		.12, .22, 0, .14, 1.8, 0, .12, .22, 0, .14, 1.8, 0
	], 3 ) );
	const object = line ? new THREE.Line( geometry ) : new THREE.Mesh( geometry );
	object.userData.armatureBinding = { rig: rig.uuid, objectToRig: new THREE.Matrix4().toArray(), influences: 2 };
	scene.add( rig, object );
	return { scene, object, root, tip };

}

test( 'Painting preserves the chosen share, caps influences, and redistributes the rest', () => {

	const weights = paintBoneWeight( { a: .5, b: .25, c: .25 }, 'd', .2, [ 'a', 'b', 'c', 'd' ], 3 );
	assert.ok( Math.abs( weights.a - .8 * 2 / 3 ) < 1e-9 );
	assert.ok( Math.abs( weights.b - .8 / 3 ) < 1e-9 );
	assert.equal( weights.d, .2 );
	assert.equal( weights.c, undefined );
	assert.deepEqual( paintBoneWeight( { a: 1 }, 'a', 0, [ 'a', 'b' ], 2 ), { b: 1 } );

} );

test( 'Smoothing joins seam neighbors and respects separate line segments', () => {

	const positions = new THREE.Float32BufferAttribute( [ 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 1, 0 ], 3 );
	const geometry = new THREE.BufferGeometry().setAttribute( 'position', positions );
	const mesh = new THREE.Mesh( geometry );
	const neighbors = weightNeighbors( mesh, positions );
	assert.deepEqual( new Set( neighbors.get( weightPointKey( positions, 0 ) ).values() ), new Set( [ 1, 4, 5 ] ) );
	const lines = new THREE.LineSegments( geometry );
	assert.equal( weightNeighbors( lines, positions ).get( weightPointKey( positions, 1 ) ).size, 1 );

} );

test( 'Painted weights deform coincident vertices across JSON reload and new rest points retain automatic weights', () => {

	for ( const line of [ false, true ] ) {

		const { scene, object, root, tip } = setup( line );
		const source = object.geometry;
		const samples = weightsForVertexEdits( THREE, scene, object, root.uuid, [ 1 ], 1 );
		object.userData.armatureBinding.weightSamples = samples;
		tip.rotation.z = Math.PI / 2;
		scene.updateMatrixWorld( true );
		const copy = new THREE.ObjectLoader().parse( JSON.parse( JSON.stringify( scene.toJSON() ) ) );
		const loaded = copy.getObjectByProperty( 'uuid', object.uuid );
		const data = armatureVertexWeights( THREE, copy, loaded );
		assert.deepEqual( data.at( 1 ), { [ root.uuid ]: 1 } );
		assert.deepEqual( data.at( 3 ), { [ root.uuid ]: 1 } );

		withArmatureDeformation( THREE, copy, () => {

			const positioned = loaded.geometry.attributes.position;
			assert.ok( Math.abs( positioned.getY( 1 ) - 1.8 ) < 1e-5 );
			assert.ok( Math.abs( positioned.getY( 3 ) - 1.8 ) < 1e-5 );

		} );
		assert.equal( object.geometry, source );

		loaded.geometry.attributes.position.setY( 1, 1.9 );
		loaded.geometry.attributes.position.needsUpdate = true;
		const moved = armatureVertexWeights( THREE, copy, loaded );
		assert.ok( moved.at( 1 )[ tip.uuid ] > .9 );
		assert.equal( moved.at( 3 )[ root.uuid ], 1 );

	}

} );

test( 'Logic can read a vertex weight and update it through normalized deformation', () => {

	const { scene, object, root } = setup();
	const graph = createLogicGraph();
	const change = addNode( graph, 'logic.setBoneWeight', 0, 0 );
	Object.assign( change.values, { bone: root.uuid, vertex: 1, weight: .69 } );
	connectNodes( graph, LOGIC_DOMAIN, { node: 'logic.start', socket: 'then' }, { node: change.id, socket: 'run' } );
	object.userData.logicGraph = graph;
	const logic = new LogicRuntime( THREE, scene, { on: () => () => {} } );
	const instance = logic.instances[ 0 ];
	const read = () => logic.value( instance, 'logic.boneWeight', { target: '', bone: root.uuid, vertex: 1 }, {} ).value;
	assert.ok( read() < .1 );
	logic.start();
	assert.ok( Math.abs( read() - .69 ) < 1e-6 );
	logic.stop();

} );

test( 'Subdivided segments compete as one automatic influence and the nearest segment inherits its weight', () => {

	const { scene, object, root, tip } = setup( true );
	object.geometry.attributes.position.setY( 0, .8 );
	root.rotation.z = .45;
	const original = armatureVertexWeights( THREE, scene, object ).at( 0 );
	const readPositions = () => withArmatureDeformation( THREE, scene, () => Array.from( object.geometry.attributes.position.array ) );
	const posed = readPositions();

	root.userData.armatureBone = { ...root.userData.armatureBone, length: .5, weightGroup: root.uuid };
	const section = createBone( THREE, 'Section', {
		...boneRestFromPoints( THREE, [ 0, .5, 0 ], [ 0, 1, 0 ], 0, true ), weightGroup: root.uuid
	} );
	root.add( section );
	section.add( tip );
	tip.userData.armatureBone = { ...tip.userData.armatureBone, position: [ 0, .5, 0 ] };
	tip.position.y = .5;

	const split = armatureVertexWeights( THREE, scene, object );
	assert.deepEqual( split.at( 0 ), { [ section.uuid ]: original[ root.uuid ], [ tip.uuid ]: original[ tip.uuid ] } );
	assert.ok( split.at( 2 )[ root.uuid ] > .5 );
	assert.ok( readPositions().every( ( value, i ) => Math.abs( value - posed[ i ] ) < 1e-6 ) );

} );

test( 'Mirror weights pair rest vertices in rig bind space, handle seams and share center influences', () => {

	const { scene, object, root, tip } = setup( true );
	root.name = 'Arm.L';
	tip.name = 'Arm.R';
	const transform = new THREE.Matrix4().makeRotationZ( .38 ).setPosition( .7, .31, 0 );
	const local = transform.clone().invert();
	const vertices = [ [ .8, 1, 0 ], [ -.8, 1, 0 ], [ .8, 1, 0 ], [ 0, .9, 0 ], [ 1.4, 1.4, 0 ] ]
		.map( point => new THREE.Vector3( ...point ).applyMatrix4( local ) );
	object.geometry = new THREE.BufferGeometry().setFromPoints( vertices );
	object.userData.armatureBinding.objectToRig = transform.toArray();
	const positions = object.geometry.attributes.position;
	const key = index => weightPointKey( positions, index );
	const result = weightsForVertexEdits( THREE, scene, object, root.uuid, [ 0, 2, 3, 4 ], .8, true );
	assert.deepEqual( Object.keys( result ).sort(), [ key( 0 ), key( 1 ), key( 3 ), key( 4 ) ].sort() );
	assert.equal( result[ key( 0 ) ][ root.uuid ], .8 );
	assert.equal( result[ key( 1 ) ][ tip.uuid ], .8 );
	assert.deepEqual( result[ key( 3 ) ], { [ root.uuid ]: .5, [ tip.uuid ]: .5 } );

} );
