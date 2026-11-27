import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { bonePoseOffsets, boneRestFromPoints, createArmature, createBone } from '../editor/js/rigging/Armature.js';
import { constraintSettings, resolveConstraint } from '../editor/js/rigging/ArmatureConstraints.js';
import { withArmatureDeformation } from '../editor/js/rigging/ArmatureDeformation.js';
import { prepareArmaturePhysics } from '../editor/js/rigging/ArmaturePhysics.js';
import { hasConstraintDependencyCycle, withArmaturePose } from '../editor/js/rigging/ArmaturePose.js';
import { LogicRuntime } from '../editor/js/nodes/LogicRuntime.js';
import { LOGIC_DOMAIN, createLogicGraph } from '../editor/js/nodes/LogicNodes.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';

function setup() {

	const scene = new THREE.Scene();
	const rig = createArmature( THREE );
	const bone = rig.children[ 0 ];
	const target = new THREE.Object3D();
	scene.add( rig, target );
	return { scene, rig, bone, target };

}

function constraint( type, options ) {

	const settings = constraintSettings( { id: type, name: type, type, ...options } );
	assert.ok( settings );
	return settings;

}

function near( a, b ) {

	assert.ok( Math.abs( a - b ) < 1e-6, a + ' differs from ' + b );

}

const world = object => object.getWorldPosition( new THREE.Vector3() );
const degrees = THREE.MathUtils.degToRad;

test( 'Ordered constraints carry bound lines and attachments through drawing, undo the evaluation on exceptions, and reopen from JSON', () => {

	const { scene, rig, bone, target } = setup();
	target.position.set( 3, 4, 5 );
	const camera = new THREE.PerspectiveCamera();
	camera.position.y = 1;
	bone.add( camera );
	const curve = new THREE.Line( new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3(), new THREE.Vector3( 0, .4, 0 ) ] ) );
	rig.add( curve );
	curve.userData.armatureBinding = { rig: rig.uuid, objectToRig: new THREE.Matrix4().toArray(), influences: 1 };
	const source = curve.geometry;
	const copy = constraint( 'copyLocation', { target: target.uuid, axes: 'X', influence: .5 } );
	const limit = constraint( 'limitLocation', { ownerSpace: 'world', max: [ .75, null, null ] } );
	bone.userData.armatureConstraints = [ copy, limit ];
	assert.throws( () => withArmatureDeformation( THREE, scene, () => {

		near( world( camera ).x, .75 );
		near( curve.geometry.attributes.position.getX( 1 ), .75 );
		throw new Error( 'drawing stopped' );

	} ), /drawing stopped/ );
	near( world( camera ).x, 0 );
	assert.equal( curve.geometry, source );
	bone.userData.armatureConstraints.reverse();
	const loaded = new THREE.ObjectLoader().parse( JSON.parse( JSON.stringify( scene.toJSON() ) ) );
	withArmaturePose( THREE, loaded, () => near( world( loaded.getObjectByProperty( 'uuid', camera.uuid ) ).x, 1.5 ) );
	assert.equal( bone.position.x, 0 );
	withArmaturePose( THREE, scene, () => near( world( camera ).x, 0 ), rig );

} );

test( 'Copy Transforms reads target local values in the owner rest frame and Copy Rotation supports additive mix', () => {

	const { scene, rig, bone, target } = setup();
	bone.userData.armatureBone = boneRestFromPoints( THREE, [ 1, 0, 0 ], [ 2, 0, 0 ] );
	bone.position.set( 1, 0, 0 );
	bone.quaternion.fromArray( bone.userData.armatureBone.quaternion );
	rig.position.set( 0, 2, 1 );
	rig.rotation.y = .4;
	target.position.set( 0, 2, 0 );
	target.rotation.z = .4;
	target.scale.set( 2, 3, 4 );
	bone.userData.armatureConstraints = [ constraint( 'copyTransforms', {
		target: target.uuid, targetSpace: 'local', ownerSpace: 'local'
	} ) ];
	withArmaturePose( THREE, scene, () => {

		const pose = bonePoseOffsets( THREE, bone );
		near( pose.location[ 1 ], 2 );
		near( pose.rotation[ 2 ], .4 );
		assert.deepEqual( pose.scale, [ 2, 3, 4 ] );

	} );
	bone.userData.armatureConstraints.push( constraint( 'copyRotation', {
		target: target.uuid, targetSpace: 'local', ownerSpace: 'local', axes: 'Z', mix: 'add'
	} ), constraint( 'copyScale', {
		target: target.uuid, targetSpace: 'local', ownerSpace: 'local', axes: 'Y', mix: 'multiply'
	} ) );
	withArmaturePose( THREE, scene, () => {

		const pose = bonePoseOffsets( THREE, bone );
		near( pose.rotation[ 2 ], .8 );
		assert.deepEqual( pose.scale, [ 2, 9, 4 ] );

	} );

} );

test( 'Limit Rotation wraps across the Euler boundary, and Limit Scale can restore zero and mirrored local scales', () => {

	const { scene, bone } = setup();
	bone.rotation.z = degrees( - 175 );
	bone.scale.set( - 2, 0, 3 );
	bone.userData.armatureConstraints = [
		constraint( 'limitRotation', { min: [ null, null, degrees( 160 ) ], max: [ null, null, degrees( 172 ) ] } ),
		constraint( 'limitScale', { min: [ null, .5, null ], max: [ 1, null, 2 ] } )
	];
	withArmaturePose( THREE, scene, () => {

		near( bone.rotation.z, degrees( 172 ) );
		assert.deepEqual( bone.scale.toArray(), [ 1, .5, 2 ] );

	} );
	near( bone.rotation.z, degrees( - 175 ) );
	assert.deepEqual( bone.scale.toArray(), [ - 2, 0, 3 ] );

} );

test( 'Damped Track points to a target bone tail and Limit Distance uses world units under nonuniform armature transforms', () => {

	const { scene, rig, bone, target } = setup();
	target.position.set( - 2, 2.5, 1 );
	rig.position.set( 1, 0, 1 );
	rig.rotation.y = .7;
	rig.scale.set( 2, 1, .35 );
	const other = createArmature( THREE );
	other.position.copy( target.position );
	scene.add( other );
	const targetBone = other.children[ 0 ];
	bone.userData.armatureConstraints = [
		constraint( 'limitDistance', { target: target.uuid, distance: 1.25, mode: 'surface' } ),
		constraint( 'dampedTrack', { target: targetBone.uuid, headTail: 1, trackAxis: '-Y' } )
	];
	withArmaturePose( THREE, scene, () => {

		const head = world( bone );
		near( head.distanceTo( world( target ) ), 1.25 );
		const axis = bone.localToWorld( new THREE.Vector3( 0, - 1, 0 ) ).sub( head ).normalize();
		const toward = targetBone.localToWorld( new THREE.Vector3( 0, 1, 0 ) ).sub( head ).normalize();
		near( axis.dot( toward ), 1 );

	} );

} );

test( 'IK reads evaluated targets, follows local stacks on its chain, and rejects mixed dependency cycles', () => {

	const { scene, bone, target } = setup();
	const solvedTail = createBone( THREE, 'Tip', boneRestFromPoints( THREE, [ 0, 1, 0 ], [ 0, 2, 0 ], 0, true ) );
	bone.add( solvedTail );
	const controlRig = createArmature( THREE );
	const control = controlRig.children[ 0 ];
	scene.add( controlRig );
	target.position.set( .8, 1.2, .4 );
	control.userData.armatureConstraints = [ constraint( 'copyLocation', { target: target.uuid } ) ];
	solvedTail.userData.armatureIK = { target: control.uuid, chainLength: 2 };
	bone.userData.armatureConstraints = [ constraint( 'limitRotation', { min: [ null, null, -.2 ], max: [ null, null, .2 ] } ) ];
	withArmaturePose( THREE, scene, () => {

		const tail = solvedTail.localToWorld( new THREE.Vector3( 0, 1, 0 ) );
		near( tail.distanceTo( world( target ) ), 0 );

	} );
	const cycle = [ constraint( 'copyLocation', { target: solvedTail.uuid } ) ];
	assert.equal( hasConstraintDependencyCycle( scene, control, cycle ), true );
	const downstream = new THREE.Object3D();
	bone.add( downstream );
	assert.match( resolveConstraint( scene, bone, constraint( 'dampedTrack', { target: downstream.uuid } ) ).error, /descendants/ );

} );

test( 'A Logic Node retargets and blends a constraint that also drives a Rapier kinematic body', async () => {

	const { scene, rig, bone, target } = setup();
	const replacement = new THREE.Object3D();
	replacement.position.set( 2, 0, 1 );
	scene.add( replacement );
	bone.userData.armaturePhysics = { mode: 'kinematic' };
	bone.userData.armatureConstraints = [ constraint( 'copyLocation', { target: target.uuid } ) ];
	const graph = createLogicGraph();
	const retarget = addNode( graph, 'logic.setConstraintTarget', 0, 0 );
	Object.assign( retarget.values, { target: bone.uuid, name: 'copyLocation', source: replacement.uuid } );
	const blend = addNode( graph, 'logic.setConstraintInfluence', 0, 0 );
	Object.assign( blend.values, { target: bone.uuid, name: 'copyLocation', influence: .5 } );
	connectNodes( graph, LOGIC_DOMAIN, { node: 'logic.start', socket: 'then' }, { node: retarget.id, socket: 'run' } );
	connectNodes( graph, LOGIC_DOMAIN, { node: retarget.id, socket: 'then' }, { node: blend.id, socket: 'run' } );
	rig.userData.logicGraph = graph;
	const runtime = new LogicRuntime( THREE, scene, { on: () => () => {} } );
	const physics = await prepareArmaturePhysics( THREE, scene );
	try {

		runtime.start();
		physics.advanceTo( .1 );
		const body = physics.bodies.get( bone ).body;
		near( body.translation().x, 1 );
		near( body.translation().z, .5 );
		assert.equal( bone.position.x, 0 );
		const pose = runtime.value( runtime.instances[ 0 ], 'logic.bonePose', { target: bone.uuid, evaluated: true }, {} );
		assert.deepEqual( pose.location, [ 1, 0, .5 ] );
		bone.userData.armaturePhysics.mode = 'dynamic';
		withArmaturePose( THREE, scene, () => assert.equal( bone.position.x, 0 ) );

	} finally {

		runtime.stop();
		physics.dispose();

	}

} );
