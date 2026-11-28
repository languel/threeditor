import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { armatureBones, armatureOf, bonePoseOffsets, boneRestFrames, boneRestFromPoints, boneRestTail, createArmature, createBone, findBone, mirroredBoneName } from '../editor/js/rigging/Armature.js';
import { withArmatureDeformation } from '../editor/js/rigging/ArmatureDeformation.js';
import { stageBoneRest } from '../editor/js/rigging/ArmatureRestEditing.js';
import { LogicRuntime } from '../editor/js/nodes/LogicRuntime.js';
import { createLogicGraph, LOGIC_DOMAIN } from '../editor/js/nodes/LogicNodes.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';
import { mirroredBoneConstraint, mirroredBonePhysics, reflectBoneFrame } from '../editor/js/rigging/ArmatureMirror.js';

function chain() {

	const rig = createArmature( THREE );
	const root = rig.children[ 0 ];
	const tip = createBone( THREE, 'Tip', boneRestFromPoints( THREE, [ 0, 1, 0 ], [ 0, 2, 0 ], 0, true ) );
	root.add( tip );
	return { rig, root, tip };

}

test( 'Side names retain the subdivision suffix and preserve the naming convention', () => {

	for ( const [ left, right ] of [
		[ 'Arm.L', 'Arm.R' ], [ 'Wrist.L.001', 'Wrist.R.001' ], [ 'LeftHand', 'RightHand' ],
		[ 'FlapLeft', 'FlapRight' ], [ 'FlapLeft.003', 'FlapRight.003' ], [ 'l-foot', 'r-foot' ], [ 'foot LEFT', 'foot RIGHT' ]
	] ) {

		assert.deepEqual( mirroredBoneName( left ), { side: 'l', name: right } );
		assert.deepEqual( mirroredBoneName( right ), { side: 'r', name: left } );

	}
	assert.equal( mirroredBoneName( 'Spine.003' ), null );

} );

test( 'Mirroring reflects the bone frame, signed limits and cardinal world-space offsets', () => {

	const { rig, root } = chain();
	root.userData.armatureBone = boneRestFromPoints( THREE, [ .6, 0, .3 ], [ 1, .7, .6 ], .4 );
	const frame = boneRestFrames( THREE, rig ).get( root );
	const mirrored = reflectBoneFrame( THREE, frame );
	const axis = new THREE.Vector3( 0, 1, 0 ).applyQuaternion( mirrored.quaternion );
	assert.ok( axis.distanceTo( mirrored.tail.clone().sub( mirrored.head ).normalize() ) < 1e-9 );
	assert.deepEqual( mirrored.head.toArray(), [ -.6, 0, .3 ] );
	assert.equal( mirroredBonePhysics( { mode: 'dynamic', joint: 'hinge', axis: 'Z', min: -20, max: 85 } ).min, -85 );
	assert.equal( mirroredBonePhysics( { mode: 'dynamic', joint: 'hinge', axis: 'X', min: -20, max: 85 } ).min, -20 );
	const worldReflection = new THREE.Matrix4().makeScale( -1, 1, 1 ).setPosition( 6, 0, 0 );
	const next = mirroredBoneConstraint( {
		id: 'limit', name: 'World box', type: 'limitLocation', ownerSpace: 'world', min: [ 4, null, 0 ], max: [ 5, null, 2 ]
	}, worldReflection, '', 'opposite' );
	assert.deepEqual( next.min, [ 1, null, 0 ] );
	assert.deepEqual( next.max, [ 2, null, 2 ] );

} );

test( 'A mirrored edit keeps the shared head on the center plane and mirrors a paired roll', () => {

	const rig = createArmature( THREE );
	const root = rig.children[ 0 ];
	const makeArm = ( name, x ) => createBone( THREE, name, boneRestFromPoints( THREE, [ 0, 1, 0 ], [ x, 1.4, 0 ], 0, true ) );
	const left = makeArm( 'Arm.L', .8 ), right = makeArm( 'Arm.R', -.8 );
	root.add( left, right );
	const result = stageBoneRest( THREE, rig, new Map( [
		[ left, { head: new THREE.Vector3( .4, 1.1, 0 ), tail: new THREE.Vector3( 1.2, 1.5, 0 ), roll: .3 } ]
	] ), true );
	for ( const [ bone, rest ] of result ) bone.userData.armatureBone = rest;
	const frames = boneRestFrames( THREE, rig );
	assert.ok( frames.get( root ).tail.distanceTo( new THREE.Vector3( 0, 1.1, 0 ) ) < 1e-9 );
	assert.ok( frames.get( right ).tail.distanceTo( new THREE.Vector3( -1.2, 1.5, 0 ) ) < 1e-9 );
	assert.equal( right.userData.armatureBone.roll, -.3 );

} );

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

test( 'Editing a shared head moves the entire joint without shifting other rest endpoints', () => {

	const { rig, root, tip } = chain();
	const branch = createBone( THREE, 'Branch', boneRestFromPoints( THREE, [ 0, 1, 0 ], [ 1, 2, 0 ], .37, true ) );
	const offset = createBone( THREE, 'Offset', boneRestFromPoints( THREE, [ 0, 2, 1 ], [ 0, 3, 1 ] ) );
	root.add( branch, offset );
	root.rotation.z = Math.PI / 2;
	const before = boneRestFrames( THREE, rig );
	const joint = new THREE.Vector3( .5, 1.2, 0 );
	const changes = stageBoneRest( THREE, rig, new Map( [ [ tip, { head: joint } ], [ root, { roll: .3 } ] ] ) );
	assert.ok( root.userData.armatureBone.length === 1 );
	assert.throws( () => stageBoneRest( THREE, rig, new Map( [ [ tip, { head: before.get( tip ).tail } ] ] ) ), /different head and tail/ );
	for ( const [ bone, rest ] of changes ) bone.userData.armatureBone = rest;
	const after = boneRestFrames( THREE, rig );

	assert.ok( after.get( root ).tail.distanceTo( joint ) < 1e-7 );
	assert.equal( root.userData.armatureBone.roll, .3 );
	for ( const bone of [ tip, branch ] ) {

		assert.ok( bone.userData.armatureBone.connected );
		assert.ok( after.get( bone ).head.distanceTo( joint ) < 1e-7 );
		assert.ok( after.get( bone ).tail.distanceTo( before.get( bone ).tail ) < 1e-7 );

	}
	assert.ok( after.get( offset ).head.distanceTo( before.get( offset ).head ) < 1e-7 );
	assert.ok( after.get( offset ).tail.distanceTo( before.get( offset ).tail ) < 1e-7 );
	assert.equal( root.rotation.z, Math.PI / 2 );

} );

test( 'Set Bone Pose writes offsets in the bone rest frame and Bone Pose reads them in degrees', () => {

	const { rig, root } = chain();
	root.userData.armatureBone = boneRestFromPoints( THREE, [ 0, 0, 0 ], [ 1, 0, 0 ] );
	const scene = new THREE.Scene();
	scene.add( rig );
	const graph = createLogicGraph();
	const bone = addNode( graph, 'logic.bone', 0, 0 );
	const set = addNode( graph, 'logic.setBonePose', 0, 0 );
	const read = addNode( graph, 'logic.bonePose', 0, 0 );
	const move = addNode( graph, 'logic.setPositionVector', 0, 0 );
	set.values.location = [ 0, 2, 0 ];
	set.values.rotation = [ 0, 0, 60 ];
	function link( from, out, to, input ) {

		connectNodes( graph, LOGIC_DOMAIN, { node: from, socket: out }, { node: to, socket: input } );

	}
	link( 'logic.start', 'then', set.id, 'run' );
	link( bone.id, 'object', set.id, 'target' );
	link( bone.id, 'object', read.id, 'target' );
	link( set.id, 'then', move.id, 'run' );
	link( read.id, 'rotation', move.id, 'vector' );
	rig.userData.logicGraph = graph;
	const runtime = new LogicRuntime( THREE, scene, { on: () => () => {} } );
	runtime.start();
	assert.ok( root.position.distanceTo( new THREE.Vector3( 2, 0, 0 ) ) < 1e-7 );
	assert.ok( Math.abs( bonePoseOffsets( THREE, root ).location[ 1 ] - 2 ) < 1e-7 );
	assert.ok( Math.abs( rig.position.z - 60 ) < 1e-7 );
	runtime.stop();

} );
