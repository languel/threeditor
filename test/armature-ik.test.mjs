import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { boneRestFromPoints, createArmature, createBone } from '../editor/js/rigging/Armature.js';
import { hasIKDependencyCycle, ikSettings, resolveIK, withArmatureIK } from '../editor/js/rigging/ArmatureIK.js';
import { prepareArmaturePhysics } from '../editor/js/rigging/ArmaturePhysics.js';
import { LogicRuntime } from '../editor/js/nodes/LogicRuntime.js';
import { LOGIC_DOMAIN, createLogicGraph } from '../editor/js/nodes/LogicNodes.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';

function setup( count = 2 ) {

	const scene = new THREE.Scene();
	const rig = createArmature( THREE );
	rig.position.set( .2, -.1, .7 );
	rig.rotation.y = .7;
	rig.scale.set( 1.4, .8, .5 );
	scene.add( rig );
	const root = rig.children[ 0 ];
	let tip = root;
	for ( let i = 1; i < count; i ++ ) {

		const bone = createBone( THREE, 'Joint ' + i, boneRestFromPoints( THREE, [ 0, 1, 0 ], [ 0, 2, 0 ], 0, true ) );
		tip.add( bone );
		tip = bone;

	}
	const target = new THREE.Object3D(), pole = new THREE.Object3D();
	target.position.set( .8, 1.3, .1 );
	pole.position.set( 2, .3, 1 );
	rig.add( target, pole );
	tip.userData.armatureIK = { target: target.uuid, pole: pole.uuid, chainLength: 0, iterations: 64 };
	const marker = new THREE.Object3D();
	marker.position.y = 1;
	tip.add( marker );
	return { scene, rig, root, tip, target, pole, marker };

}

const vector = () => new THREE.Vector3();
const distance = ( a, b ) => a.getWorldPosition( vector() ).distanceTo( b.getWorldPosition( vector() ) );

test( 'A two-bone IK constraint bends toward either pole under rotated and scaled armature transforms', () => {

	const { scene, rig, root, tip, target, pole, marker } = setup();
	const original = root.quaternion.clone();
	for ( const sign of [ 1, - 1 ] ) {

		pole.position.set( sign * 2, .3, sign * 2 );
		withArmatureIK( THREE, scene, () => {

			assert.ok( distance( marker, target ) < 1e-6 );
			const elbow = rig.worldToLocal( tip.getWorldPosition( vector() ) );
			const axis = target.position.clone().normalize();
			const outward = elbow.addScaledVector( axis, - elbow.dot( axis ) );
			const poleVector = pole.position.clone().addScaledVector( axis, - pole.position.dot( axis ) );
			assert.ok( outward.dot( poleVector ) > 0 );

		} );
		assert.ok( root.quaternion.equals( original ) );
		assert.ok( distance( marker, target ) > .1 );

	}

} );

test( 'Long chains respect their reach, preserve the authored pose after exceptions, and reopen from JSON', () => {

	const { scene, rig, tip, target, marker } = setup( 4 );
	target.position.set( .7, 2.2, 0 );
	scene.updateMatrixWorld( true );
	const saved = new THREE.ObjectLoader().parse( JSON.parse( JSON.stringify( scene.toJSON() ) ) );
	const loadedTarget = saved.getObjectByProperty( 'uuid', target.uuid );
	const loadedMarker = saved.getObjectByProperty( 'uuid', marker.uuid );
	assert.throws( () => withArmatureIK( THREE, saved, () => {

		assert.ok( distance( loadedMarker, loadedTarget ) < 1e-3 );
		throw new Error( 'draw stopped' );

	} ), /draw stopped/ );
	assert.ok( distance( loadedMarker, loadedTarget ) > .1 );

	target.position.set( 10, 4, 4 );
	withArmatureIK( THREE, scene, () => {

		const result = rig.worldToLocal( marker.getWorldPosition( vector() ) );
		assert.ok( result.distanceTo( target.position.clone().setLength( 4 ) ) < 1e-6 );

	} );
	const previous = tip.quaternion.clone();
	tip.userData.armatureIK = { target: target.uuid, useTail: false, chainLength: 0 };
	target.position.set( .3, 2.4, .25 );
	withArmatureIK( THREE, scene, () => {

		assert.ok( distance( tip, target ) < 1e-3 );
		assert.ok( tip.quaternion.equals( previous ) );

	} );

} );

test( 'IK ignores illegal dependencies and lets dynamic physics own its bones', () => {

	const { scene, root, tip, target, marker } = setup();
	const settings = tip.userData.armatureIK;
	assert.match( resolveIK( scene, tip, ikSettings( { ...settings, target: marker.uuid } ) ).error, /descendants/ );
	root.userData.armaturePhysics = { mode: 'dynamic' };
	assert.match( resolveIK( scene, tip, ikSettings( settings ) ).error, /Rapier/ );
	withArmatureIK( THREE, scene, () => assert.ok( distance( marker, target ) > .1 ) );
	delete root.userData.armaturePhysics;
	const other = createArmature( THREE, 'Other' );
	scene.add( other );
	const otherBone = other.children[ 0 ];
	tip.userData.armatureIK = { ...settings, target: otherBone.uuid };
	const cycle = resolveIK( scene, otherBone, ikSettings( { target: marker.uuid } ) );
	assert.equal( hasIKDependencyCycle( scene, cycle ), true );
	tip.userData.armatureIK = settings;
	root.userData.armatureIK = { target: target.uuid, influence: 0 };
	tip.userData.armatureIK.influence = 0;
	withArmatureIK( THREE, scene, () => assert.ok( distance( marker, target ) > .1 ) );

} );

test( 'Logic can change IK influence and read evaluated bone endpoints', () => {

	const { scene, rig, tip, marker, target } = setup();
	const graph = createLogicGraph();
	const bone = addNode( graph, 'logic.bone', 0, 0 );
	bone.values.name = tip.name;
	const influence = addNode( graph, 'logic.setIKInfluence', 2, 0 );
	influence.values.influence = 0;
	connectNodes( graph, LOGIC_DOMAIN, { node: 'logic.start', socket: 'then' }, { node: influence.id, socket: 'run' } );
	connectNodes( graph, LOGIC_DOMAIN, { node: bone.id, socket: 'object' }, { node: influence.id, socket: 'target' } );
	rig.userData.logicGraph = graph;
	const logic = new LogicRuntime( THREE, scene, { on: () => () => {} } );
	const instance = logic.instances[ 0 ];
	const tail = () => vector().fromArray( logic.value( instance, 'logic.bone', { armature: '', name: tip.name }, {} ).tail );
	assert.ok( tail().distanceTo( target.getWorldPosition( vector() ) ) < 1e-6 );
	logic.start();
	assert.equal( tip.userData.armatureIK.influence, 0 );
	assert.ok( tail().distanceTo( marker.getWorldPosition( vector() ) ) < 1e-6 );
	logic.stop();

} );

test( 'Rapier kinematic capsules initialize and step from the solved pose', async () => {

	const { scene, rig, tip, target } = setup();
	rig.scale.setScalar( 1 );
	tip.userData.armaturePhysics = { mode: 'kinematic' };
	const authored = tip.quaternion.clone();
	const physics = await prepareArmaturePhysics( THREE, scene );
	try {

		const body = physics.bodies.get( tip ).body;
		const assertPose = () => {

			const position = body.translation(), rotation = body.rotation();
			withArmatureIK( THREE, scene, () => {

				assert.ok( tip.getWorldPosition( vector() ).distanceTo( vector().copy( position ) ) < 1e-6 );
				assert.ok( tip.getWorldQuaternion( new THREE.Quaternion() ).angleTo( new THREE.Quaternion().copy( rotation ).normalize() ) < 1e-6 );

			} );
			assert.ok( tip.quaternion.equals( authored ) );

		};
		assertPose();
		target.position.x -= .4;
		physics.advanceTo( .1 );
		assertPose();

	} finally {

		physics.dispose();

	}

} );
