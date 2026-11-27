import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { createArmature } from '../editor/js/rigging/Armature.js';
import { constraintTargetFrame } from '../editor/js/rigging/ArmatureConstraints.js';
import { prepareArmaturePhysics } from '../editor/js/rigging/ArmaturePhysics.js';
import { withArmaturePose } from '../editor/js/rigging/ArmaturePose.js';
import { switchedParentStack, withChildInverse } from '../editor/js/rigging/ConstraintParenting.js';
import { LogicRuntime } from '../editor/js/nodes/LogicRuntime.js';
import { LOGIC_DOMAIN, createLogicGraph } from '../editor/js/nodes/LogicNodes.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';
import { availableTargets, timelineBinding } from '../editor/js/animation/TimelineBindings.js';
import { autoKeySamples } from '../editor/js/animation/TimelineAutoKey.js';
import { targetId } from '../editor/js/animation/TimelineData.js';

function world( object ) {

	object.updateWorldMatrix( true, false );
	return object.matrixWorld.clone();

}

function near( a, b ) {

	assert.ok( Math.abs( a - b ) < 1e-7, a + ' differs from ' + b );

}

function sameMatrix( a, b ) {

	a.elements.forEach( ( value, i ) => near( value, b.elements[ i ] ) );

}

function parentEntry( id, target, influence = 1 ) {

	return { id, name: id, type: 'childOf', target: target.uuid, influence, headTail: Number( !! target.isBone ) };

}

test( 'Child Of preserves affine motion for the curves, Pencil geometry, lights and cameras in a group', () => {

	const scene = new THREE.Scene();
	const rig = createArmature( THREE ), bone = rig.children[ 0 ];
	const parent = new THREE.Group(), owner = new THREE.Group();
	parent.rotation.y = .4;
	parent.scale.set( .8, 2, 1.3 );
	owner.rotation.z = .6;
	owner.position.set( 2, 1, .2 );
	parent.add( owner );
	scene.add( parent, rig );
	const objects = [ new THREE.Line(), new THREE.Mesh(), new THREE.PointLight(), new THREE.PerspectiveCamera(), new THREE.Points() ];
	objects[ 1 ].userData.modeling = { kind: 'path', pencilBrush: {} };
	objects.forEach( ( object, i ) => { object.position.set( i * .2, .5, -.5 ); owner.add( object ); } );
	const unconstrained = world( owner );
	const children = objects.map( world );
	owner.userData.armatureConstraints = [ parentEntry( 'follow', bone ) ];
	owner.userData.armatureConstraints = withChildInverse( THREE, scene, owner, 'follow' );
	withArmaturePose( THREE, scene, () => sameMatrix( world( owner ), unconstrained ) );
	const bindFrame = constraintTargetFrame( THREE, bone, 1 );
	rig.scale.set( 1.5, .7, 1.8 );
	rig.position.set( -.6, .3, .4 );
	bone.rotation.z = .8;
	const delta = constraintTargetFrame( THREE, bone, 1 ).multiply( bindFrame.invert() );
	assert.throws( () => withArmaturePose( THREE, scene, () => {

		assert.equal( owner.matrixAutoUpdate, false );
		sameMatrix( world( owner ), delta.clone().multiply( unconstrained ) );
		objects.forEach( ( object, i ) => sameMatrix( world( object ), delta.clone().multiply( children[ i ] ) ) );
		throw new Error( 'draw ended early' );

	} ), /draw ended early/ );
	assert.equal( owner.matrixAutoUpdate, true );
	sameMatrix( world( owner ), unconstrained );

} );

test( 'Logic switches parents without moving the evaluated transform and saves the new offset', () => {

	const scene = new THREE.Scene();
	const sender = createArmature( THREE ), receiver = createArmature( THREE );
	const from = sender.children[ 0 ], to = receiver.children[ 0 ];
	const owner = new THREE.Camera();
	scene.add( sender, receiver, owner );
	sender.position.x = - 2;
	receiver.position.set( 2, 0, 1 );
	receiver.scale.set( .6, 1.5, 1.3 );
	owner.position.set( 0, 1, 3 );
	owner.userData.armatureConstraints = [ parentEntry( 'sender', from ), parentEntry( 'receiver', to, 0 ) ];
	owner.userData.armatureConstraints = withChildInverse( THREE, scene, owner, 'sender' );
	sender.position.y = .4;
	receiver.rotation.z = .9;
	const before = withArmaturePose( THREE, scene, () => world( owner ) );
	const graph = createLogicGraph();
	const action = addNode( graph, 'logic.switchConstraintParent', 0, 0 );
	action.values.name = 'receiver';
	connectNodes( graph, LOGIC_DOMAIN, { node: 'logic.start', socket: 'then' }, { node: action.id, socket: 'run' } );
	owner.userData.logicGraph = graph;
	const runtime = new LogicRuntime( THREE, scene, { on: () => () => {} } );
	runtime.start();
	const [ oldParent, newParent ] = owner.userData.armatureConstraints;
	assert.equal( oldParent.influence, 0 );
	assert.equal( newParent.influence, 1 );
	withArmaturePose( THREE, scene, () => sameMatrix( world( owner ), before ) );
	const read = runtime.value( runtime.instances[ 0 ], 'logic.evaluatedTransform', { target: owner.uuid } );
	near( read.position[ 1 ], 1.4 );
	sender.position.y += 4;
	receiver.position.x += .7;
	scene.updateMatrixWorld( true );
	const loaded = new THREE.ObjectLoader().parse( scene.toJSON() );
	withArmaturePose( THREE, loaded, () => {

		const actual = world( loaded.getObjectByProperty( 'uuid', owner.uuid ) );
		sameMatrix( actual, new THREE.Matrix4().makeTranslation( .7, 0, 0 ).multiply( before ) );

	} );
	runtime.stop();

} );

test( 'Switching rejects mixed owner cycles and leaves the active stack intact', () => {

	const scene = new THREE.Scene(), rig = createArmature( THREE );
	const bone = rig.children[ 0 ], object = new THREE.Group(), valid = new THREE.Group();
	scene.add( rig, object, valid );
	object.userData.armatureConstraints = [ parentEntry( 'current', valid ), parentEntry( 'cycle', bone, 0 ) ];
	bone.userData.armatureIK = { target: object.uuid, chainLength: 1 };
	const before = JSON.stringify( object.userData.armatureConstraints );
	assert.throws( () => switchedParentStack( THREE, scene, object, 'cycle' ), /cycle/ );
	assert.equal( JSON.stringify( object.userData.armatureConstraints ), before );
	valid.scale.setScalar( 0 );
	assert.throws( () => switchedParentStack( THREE, scene, object, 'current' ), /invertible/ );
	assert.equal( JSON.stringify( object.userData.armatureConstraints ), before );

} );

test( 'Constraint influence bindings and Auto Key address stable IDs across reordering', () => {

	const scene = new THREE.Scene(), owned = new THREE.Group(), target = new THREE.Group();
	scene.add( owned, target );
	owned.userData.armatureConstraints = [ parentEntry( 'first', target ), parentEntry( 'second', target, 0 ) ];
	const context = { object: uuid => scene.getObjectByProperty( 'uuid', uuid ), scripts: {} };
	const targets = availableTargets( owned, {} ).filter( entry => entry.kind === 'constraint' );
	assert.notEqual( targetId( targets[ 0 ] ), targetId( targets[ 1 ] ) );
	const binding = timelineBinding( context, targets[ 1 ] );
	assert.equal( binding.read(), 0 );
	owned.userData.armatureConstraints.reverse();
	binding.write( .35 );
	assert.equal( binding.read(), .35 );
	assert.equal( owned.userData.armatureConstraints[ 1 ].influence, 1 );
	const command = { type: 'SetValueCommand', attributeName: 'userData', object: owned, oldValue: owned.userData,
		newValue: { armatureConstraints: [ { ...owned.userData.armatureConstraints[ 0 ], influence: .7 }, owned.userData.armatureConstraints[ 1 ] ] } };
	assert.deepEqual( autoKeySamples( context, command ), [ { target: targets[ 1 ], value: .7 } ] );

} );

test( 'A scene object can follow a Rapier dynamic bone without taking over its pose', async () => {

	const scene = new THREE.Scene(), rig = createArmature( THREE );
	const bone = rig.children[ 0 ], owner = new THREE.PointLight();
	bone.userData.armaturePhysics = { mode: 'dynamic', gravity: 0 };
	scene.add( rig, owner );
	owner.userData.armatureConstraints = [ parentEntry( 'dynamic', bone ) ];
	owner.userData.armatureConstraints = withChildInverse( THREE, scene, owner, 'dynamic' );
	const physics = await prepareArmaturePhysics( THREE, scene );
	try {

		physics.impulse( bone, [ 1, 0, 0 ] );
		physics.advanceTo( .2 );
		assert.ok( world( bone ).elements[ 12 ] > .08 );
		withArmaturePose( THREE, scene, () => near( world( owner ).elements[ 12 ], world( bone ).elements[ 12 ] ) );
		assert.equal( owner.position.x, 0 );

	} finally {

		physics.dispose();

	}

} );
