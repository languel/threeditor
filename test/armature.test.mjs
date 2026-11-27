import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { armatureBones, armatureOf, boneRestFromPoints, boneRestTail, createArmature, createBone, findBone } from '../editor/js/rigging/Armature.js';
import { withArmatureDeformation } from '../editor/js/rigging/ArmatureDeformation.js';
import { LogicRuntime } from '../editor/js/nodes/LogicRuntime.js';
import { createLogicGraph, LOGIC_DOMAIN } from '../editor/js/nodes/LogicNodes.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';

function chain() {

	const rig = createArmature( THREE );
	const root = rig.children[ 0 ];
	const tip = createBone( THREE, 'Tip', boneRestFromPoints( THREE, [ 0, 1, 0 ], [ 0, 2, 0 ], 0, true ) );
	root.add( tip );
	return { rig, root, tip };

}

function bind( rig, object, influences ) {

	rig.updateWorldMatrix( true, false );
	object.updateWorldMatrix( true, false );
	const objectToRig = rig.matrixWorld.clone().invert().multiply( object.matrixWorld ).toArray();
	object.userData.armatureBinding = { rig: rig.uuid, objectToRig, influences };

}

function vertex( object, index ) {

	return new THREE.Vector3().fromBufferAttribute( object.geometry.attributes.position, index );

}

test( 'Native bone parenting, endpoints, rest state and pose survive scene serialization', () => {

	const { rig, root, tip } = chain();
	const lamp = new THREE.PointLight();
	lamp.position.y = 1;
	tip.add( lamp );
	root.rotation.z = Math.PI / 2;
	const scene = new THREE.Scene();
	scene.add( rig );
	scene.updateMatrixWorld( true );
	const copy = new THREE.ObjectLoader().parse( JSON.parse( JSON.stringify( scene.toJSON() ) ) );
	const savedRig = copy.getObjectByProperty( 'uuid', rig.uuid );
	const savedTip = findBone( savedRig, tip.uuid );
	assert.equal( savedTip.parent.uuid, root.uuid );
	assert.equal( armatureOf( savedTip ), savedRig );
	assert.deepEqual( armatureBones( savedRig ).map( bone => bone.isBone ), [ true, true ] );
	assert.deepEqual( boneRestTail( THREE, savedTip.userData.armatureBone ), [ 0, 2, 0 ] );
	assert.ok( savedTip.children[ 0 ].getWorldPosition( new THREE.Vector3() ).distanceTo( new THREE.Vector3( - 2, 0, 0 ) ) < 1e-7 );

} );

test( 'Mesh, pencil-style triangle buffers and curves share a weighted pose without altering editable geometry', () => {

	const { rig, tip } = chain();
	const scene = new THREE.Scene();
	rig.position.set( 3, 1, - 4 );
	scene.add( rig );
	const mesh = new THREE.Mesh( new THREE.BufferGeometry().setAttribute( 'position', new THREE.Float32BufferAttribute( [
		0, .2, 0, 0, 1.8, 0, .1, 1.8, 0
	], 3 ) ) );
	mesh.geometry.computeVertexNormals();
	const pencil = new THREE.Mesh( mesh.geometry, new THREE.MeshBasicMaterial() );
	pencil.userData.pencilStroke = true;
	const line = new THREE.Line( mesh.geometry, new THREE.LineBasicMaterial() );
	const objects = [ mesh, pencil, line ];
	for ( const object of objects ) {

		object.position.copy( rig.position );
		scene.add( object );
		bind( rig, object, 2 );

	}
	const original = mesh.geometry;
	tip.rotation.z = Math.PI / 2;
	const scratch = withArmatureDeformation( THREE, scene, () => {

		assert.ok( objects.every( object => object.geometry !== original ) );
		assert.ok( objects.every( object => vertex( object, 0 ).distanceTo( new THREE.Vector3( 0, .2, 0 ) ) < .004 ) );
		assert.ok( objects.every( object => vertex( object, 1 ).distanceTo( new THREE.Vector3( - .8, 1, 0 ) ) < .004 ) );
		return mesh.geometry;

	} );
	assert.ok( objects.every( object => object.geometry === original ) );
	assert.ok( vertex( mesh, 1 ).distanceTo( new THREE.Vector3( 0, 1.8, 0 ) ) < 1e-7 );
	assert.throws( () => withArmatureDeformation( THREE, scene, () => {

		assert.equal( mesh.geometry, scratch );
		throw new Error( 'draw failed' );

	} ), /draw failed/ );
	assert.equal( mesh.geometry, original );
	withArmatureDeformation( THREE, scene, () => assert.equal( mesh.geometry, original ), mesh );

	scene.remove( rig );
	withArmatureDeformation( THREE, scene, () => assert.equal( mesh.geometry, original ) );

} );

test( 'Armature Bone passes a typed target and does not turn the host when a bone is missing', () => {

	const { rig, tip } = chain();
	const scene = new THREE.Scene();
	scene.add( rig );
	const graph = createLogicGraph();
	const target = addNode( graph, 'logic.bone', 0, 0 );
	const rotate = addNode( graph, 'logic.rotate', 4, 0 );
	target.values.name = 'Tip';
	rotate.values.z = 90;
	function link( from, out, to, input ) {

		connectNodes( graph, LOGIC_DOMAIN, { node: from, socket: out }, { node: to, socket: input } );

	}
	link( 'logic.start', 'then', rotate.id, 'run' );
	link( target.id, 'object', rotate.id, 'target' );
	rig.userData.logicGraph = graph;
	const streams = { on: () => () => {} };
	const runtime = new LogicRuntime( THREE, scene, streams );
	runtime.start();
	assert.ok( Math.abs( tip.rotation.z - Math.PI / 2 ) < 1e-7 );
	runtime.stop();

	target.values.name = 'Missing';
	tip.rotation.z = 0;
	const missing = new LogicRuntime( THREE, scene, streams );
	missing.start();
	assert.equal( rig.rotation.z, 0 );
	assert.equal( tip.rotation.z, 0 );
	missing.stop();

} );
