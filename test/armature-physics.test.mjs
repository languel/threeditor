import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { boneRestFromPoints, createArmature, createBone } from '../editor/js/rigging/Armature.js';
import { withArmatureDeformation } from '../editor/js/rigging/ArmatureDeformation.js';
import { prepareArmaturePhysics } from '../editor/js/rigging/ArmaturePhysics.js';
import { usesArmaturePhysics } from '../editor/js/rigging/ArmaturePhysicsConfig.js';
import { LogicRuntime } from '../editor/js/nodes/LogicRuntime.js';
import { StreamRouter } from '../editor/js/streams/StreamRouter.js';
import { createLogicGraph, LOGIC_DOMAIN } from '../editor/js/nodes/LogicNodes.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';

test( 'A serialized kinematic and dynamic chain drives weighted geometry and attached objects from real Rapier joint poses', async () => {

	const scene = new THREE.Scene();
	const rig = createArmature( THREE );
	rig.position.y = 2;
	const base = rig.children[ 0 ];
	base.userData.armaturePhysics = { mode: 'kinematic', radius: .05 };
	const child = createBone( THREE, 'Child', boneRestFromPoints( THREE, [ 0, 1, 0 ], [ 1, 1, 0 ], 0, true ) );
	child.userData.armaturePhysics = { mode: 'dynamic', joint: 'hinge', axis: 'Z', limits: true, min: - 150, max: 150 };
	base.add( child );
	const follower = new THREE.Object3D();
	follower.position.y = 1;
	child.add( follower );
	const stroke = new THREE.Line( new THREE.BufferGeometry().setFromPoints( [
		new THREE.Vector3( 0, 1, 0 ), new THREE.Vector3( 1, 1, 0 )
	] ) );
	stroke.userData.armatureBinding = { rig: rig.uuid, objectToRig: new THREE.Matrix4().toArray(), influences: 1 };
	rig.add( stroke );
	scene.add( rig );
	scene.updateMatrixWorld( true );

	const saved = JSON.parse( JSON.stringify( scene.toJSON() ) );
	assert.equal( usesArmaturePhysics( saved.object ), true );
	const loaded = new THREE.ObjectLoader().parse( saved );
	const root = loaded.getObjectByProperty( 'uuid', base.uuid );
	const loadedBone = loaded.getObjectByProperty( 'uuid', child.uuid );
	const marker = loaded.getObjectByProperty( 'uuid', follower.uuid );
	const loadedStroke = loaded.getObjectByProperty( 'uuid', stroke.uuid );
	const physics = await prepareArmaturePhysics( THREE, loaded );
	try {

		const initial = marker.getWorldPosition( new THREE.Vector3() );
		physics.advanceTo( .3 );
		assert.ok( marker.getWorldPosition( new THREE.Vector3() ).y < initial.y - .15 );
		withArmatureDeformation( THREE, loaded, () => {

			const deformed = new THREE.Vector3().fromBufferAttribute( loadedStroke.geometry.attributes.position, 1 );
			assert.ok( loadedStroke.localToWorld( deformed ).distanceTo( marker.getWorldPosition( new THREE.Vector3() ) ) < 1e-5 );

		} );
		assert.ok( Math.hypot( ...physics.velocity( loadedBone ) ) > .1 );
		const next = loadedBone.getWorldPosition( new THREE.Vector3() );
		root.position.x = 2;
		physics.advanceTo( .55 );
		assert.ok( loadedBone.getWorldPosition( new THREE.Vector3() ).x > next.x + 1.8 );
		assert.ok( Math.abs( marker.getWorldPosition( new THREE.Vector3() ).z ) < 1e-5 );

		root.position.x = 0;
		physics.rewindIfNeeded( 0 );
		assert.equal( physics.frame, 0 );
		assert.ok( marker.getWorldPosition( new THREE.Vector3() ).distanceTo( initial ) < 1e-5 );

	} finally {

		physics.dispose();

	}

} );

test( 'Unanchored capsules collide with fixed scene boxes and respond to Logic Nodes impulses', async () => {

	const scene = new THREE.Scene();
	const rig = createArmature( THREE );
	rig.position.y = 2;
	const bone = rig.children[ 0 ];
	bone.userData.armaturePhysics = { mode: 'dynamic', radius: .1 };
	const floor = new THREE.Mesh( new THREE.BoxGeometry( 10, .5, 10 ) );
	floor.position.y = - .25;
	floor.userData.armatureCollider = { mode: 'fixed' };
	scene.add( rig, floor );
	const graph = createLogicGraph();
	const target = addNode( graph, 'logic.bone', 0, 0 );
	const upward = addNode( graph, 'logic.boneImpulse', 2, 2 );
	upward.values.impulse = [ 0, 4, 0 ];
	connectNodes( graph, LOGIC_DOMAIN, { node: 'logic.start', socket: 'then' }, { node: upward.id, socket: 'run' } );
	connectNodes( graph, LOGIC_DOMAIN, { node: target.id, socket: 'object' }, { node: upward.id, socket: 'target' } );
	const contact = addNode( graph, 'logic.boneContact', 4, 4 );
	const enter = addNode( graph, 'logic.setVariable', 6, 6 );
	const exit = addNode( graph, 'logic.setVariable', 6, 8 );
	contact.values.other = floor.uuid;
	Object.assign( enter.values, { name: 'touching floor', value: 1 } );
	Object.assign( exit.values, { name: 'touching floor', value: 0 } );
	connectNodes( graph, LOGIC_DOMAIN, { node: target.id, socket: 'object' }, { node: contact.id, socket: 'target' } );
	connectNodes( graph, LOGIC_DOMAIN, { node: contact.id, socket: 'enter' }, { node: enter.id, socket: 'run' } );
	connectNodes( graph, LOGIC_DOMAIN, { node: contact.id, socket: 'exit' }, { node: exit.id, socket: 'run' } );
	rig.userData.logicGraph = graph;

	const physics = await prepareArmaturePhysics( THREE, scene );
	const streams = new StreamRouter();
	const logic = new LogicRuntime( THREE, scene, streams );
	logic.physics = physics;
	physics.onContact = ( first, second, entered ) => streams.emit( 'bonecontact', { first: first.uuid, second: second.uuid, entered } );
	try {

		logic.start();
		physics.advanceTo( .1 );
		assert.ok( bone.getWorldPosition( new THREE.Vector3() ).y > 2.2 );
		const velocity = logic.value( logic.instances[ 0 ], 'logic.boneVelocity', { target: bone.uuid }, {} );
		assert.ok( velocity.speed > 2 && velocity.velocity[ 1 ] > 2 );
		physics.advanceTo( 3 );
		assert.ok( Math.abs( bone.getWorldPosition( new THREE.Vector3() ).y ) < .015 );
		logic.tick( 3, 2.9 );
		assert.equal( logic.instances[ 0 ].variables.get( 'touching floor' ).value, 1 );
		physics.resetBone( bone );
		assert.ok( Math.abs( bone.getWorldPosition( new THREE.Vector3() ).y - 2 ) < 1e-6 );
		assert.ok( Math.hypot( ...physics.velocity( bone ) ) < 1e-6 );
		physics.advanceTo( 3.1 );
		logic.tick( 3.1, .1 );
		assert.equal( logic.instances[ 0 ].variables.get( 'touching floor' ).value, 0 );

	} finally {

		logic.stop();
		physics.dispose();

	}
	assert.ok( Math.abs( bone.getWorldPosition( new THREE.Vector3() ).y - 2 ) < 1e-6 );

} );

test( 'Hinge limits measure motion from an initially angled bone', async () => {

	const scene = new THREE.Scene();
	const rig = createArmature( THREE );
	const child = createBone( THREE, 'Angled', boneRestFromPoints( THREE, [ 0, 1, 0 ], [ 1, .5, 0 ], 0, true ) );
	child.userData.armaturePhysics = { mode: 'dynamic', joint: 'hinge', axis: 'Z', limits: true, min: - 25, max: 25 };
	rig.children[ 0 ].add( child );
	scene.add( rig );
	const initial = child.quaternion.clone();
	const physics = await prepareArmaturePhysics( THREE, scene );
	try {

		physics.advanceTo( .8 );
		assert.ok( Math.abs( initial.angleTo( child.quaternion ) - THREE.MathUtils.degToRad( 25 ) ) < .04 );

	} finally {

		physics.dispose();

	}

} );

test( 'Disabled rig branches do not load armature physics', async () => {

	const scene = new THREE.Scene();
	const rig = createArmature( THREE );
	rig.children[ 0 ].userData.armaturePhysics = { mode: 'dynamic' };
	rig.userData.threeditor = { disabled: true };
	scene.add( rig );
	assert.equal( usesArmaturePhysics( scene ), false );
	assert.equal( await prepareArmaturePhysics( THREE, scene ), undefined );

} );
