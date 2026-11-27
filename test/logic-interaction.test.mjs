import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { LogicInput } from '../editor/js/nodes/LogicInput.js';
import { createLogicGraph, LOGIC_DOMAIN } from '../editor/js/nodes/LogicNodes.js';
import { LogicRuntime } from '../editor/js/nodes/LogicRuntime.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';
import { StreamRouter } from '../editor/js/streams/StreamRouter.js';

function node( graph, type, values = {} ) {

	const entry = addNode( graph, type, 0, 0 );
	Object.assign( entry.values, values );
	return entry.id;

}

function wire( graph, from, output, to, input ) {

	connectNodes( graph, LOGIC_DOMAIN, { node: from, socket: output }, { node: to, socket: input } );

}

test( 'Pointer graphs use frontmost visible faces and preserve a clicked world point through a delayed action', () => {

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera( 45, 1, .1, 35 );
	camera.position.z = 5;
	const panel = new THREE.Group(), receiverParent = new THREE.Group(), receiver = new THREE.Object3D();
	const mesh = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 1 ) );
	const blocker = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 1 ) );
	const disabled = new THREE.Group();
	disabled.userData.threeditor = { disabled: true };
	disabled.add( blocker );
	blocker.position.z = 2;
	panel.add( mesh );
	receiverParent.position.set( 4, 0, 0 );
	receiverParent.scale.setScalar( 2 );
	receiverParent.add( receiver );
	scene.add( panel, receiverParent, disabled );

	const graph = panel.userData.logicGraph = createLogicGraph();
	const over = node( graph, 'logic.pointerOver' );
	const press = node( graph, 'logic.objectPress' );
	const ray = node( graph, 'logic.pointerRay' );
	const wait = node( graph, 'logic.delay', { seconds: 0 } );
	const hide = node( graph, 'logic.setVisibility', { target: receiver.uuid, visible: false } );
	const show = node( graph, 'logic.setVisibility', { target: receiver.uuid, visible: true } );
	const place = node( graph, 'logic.setPositionVector', { target: receiver.uuid } );
	for ( const edge of [
		[ over, 'enter', hide, 'run' ], [ over, 'exit', show, 'run' ],
		[ press, 'then', wait, 'run' ], [ wait, 'then', place, 'run' ],
		[ ray, 'point', place, 'vector' ]
	] ) wire( graph, ...edge );

	const router = new StreamRouter();
	const runtime = new LogicRuntime( THREE, scene, router );
	const pointer = { x: .5, y: .5 };
	runtime.start();
	runtime.tick( .1, .1, { camera, pointer } );
	assert.equal( receiver.visible, false );
	router.emit( 'pointerdown', runtime.pointerDetail( 0, pointer, camera ) );
	mesh.position.x = - 2;
	runtime.tick( .2, .1, { camera, pointer: { x: .95, y: .5 } } );
	assert.equal( receiver.visible, true );
	assert.deepEqual( receiver.position.toArray(), [ 0, 0, 0 ] );
	runtime.tick( .3, .1, { camera } );
	assert.deepEqual( receiver.getWorldPosition( new THREE.Vector3() ).toArray(), [ 0, 0, .5 ] );
	assert.deepEqual( receiver.position.toArray(), [ -2, 0, .25 ] );

} );

test( 'World ray queries respect range, ignored hierarchies, mesh normals and camera layers', () => {

	const scene = new THREE.Scene();
	const front = new THREE.Mesh( new THREE.BoxGeometry() );
	const group = new THREE.Group();
	const other = new THREE.Mesh( new THREE.BoxGeometry() );
	group.add( front );
	group.position.z = 2;
	scene.add( group, other );
	const input = new LogicInput( THREE, scene );
	const query = { origin: [ 0, 0, 5 ], direction: [ 0, 0, - 10 ], distance: 10 };
	const hit = input.raycast( query, scene );
	assert.equal( hit.object, front.uuid );
	assert.deepEqual( hit.normal, [ 0, 0, 1 ] );
	assert.equal( hit.distance, 2.5 );
	assert.equal( input.raycast( query, scene, group ).object, other.uuid );
	assert.equal( input.raycast( query, other ).object, other.uuid );
	assert.equal( input.raycast( { ...query, distance: 2 }, scene ).hit, false );
	assert.equal( input.raycast( { ...query, direction: [ 0, 0, 0 ] }, scene ).hit, false );

	const camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, .1, 12 );
	camera.position.z = 5;
	front.layers.set( 2 );
	input.update( { camera, pointer: { x: .5, y: .5 } } );
	assert.equal( input.hoverHit().object, other.uuid );

} );

test( 'Gamepad graphs distinguish connection, button edges and held frames and apply a stick dead zone', () => {

	const scene = new THREE.Scene();
	const actor = new THREE.Object3D();
	scene.add( actor );
	const graph = actor.userData.logicGraph = createLogicGraph();
	const connection = node( graph, 'logic.gamepadConnection' );
	const pressed = node( graph, 'logic.gamepadButton' );
	const held = node( graph, 'logic.gamepadButton', { mode: 'Held' } );
	const released = node( graph, 'logic.gamepadButton', { mode: 'Release' } );
	const value = node( graph, 'logic.eventValue' );
	const stick = node( graph, 'logic.gamepadStick', { deadZone: .2 } );
	const hide = node( graph, 'logic.setVisibility', { visible: false } );
	const show = node( graph, 'logic.setVisibility' );
	const step = node( graph, 'logic.move' );
	const lift = node( graph, 'logic.move', { y: 1 } );
	const back = node( graph, 'logic.move', { z: - 1 } );
	const vibrate = node( graph, 'logic.gamepadVibrate' );
	const custom = node( graph, 'logic.receive', { name: 'preview' } );
	const merge = node( graph, 'logic.merge' );
	for ( const edge of [
		[ connection, 'connected', hide, 'run' ], [ connection, 'disconnected', show, 'run' ],
		[ pressed, 'then', lift, 'run' ], [ pressed, 'then', merge, 'a' ],
		[ value, 'value', lift, 'y' ], [ held, 'then', step, 'run' ], [ stick, 'x', step, 'x' ],
		[ released, 'then', back, 'run' ], [ custom, 'then', merge, 'b' ], [ merge, 'then', vibrate, 'run' ]
	] ) wire( graph, ...edge );
	const router = new StreamRouter();
	const runtime = new LogicRuntime( THREE, scene, router );
	let rumbles = 0;
	let resets = 0;
	const pad = {
		index: 0, id: 'controller', connected: true, axes: [ .15, 0 ],
		buttons: [ { pressed: true, value: .75 } ],
		vibrationActuator: { playEffect: () => { rumbles ++; }, reset: () => { resets ++; } }
	};
	runtime.tick( .1, .1, { gamepads: [ pad ] } );
	assert.equal( actor.visible, false );
	assert.deepEqual( actor.position.toArray(), [ 0, .75, 0 ] );
	assert.equal( rumbles, 1 );
	pad.axes[ 0 ] = .6;
	router.emit( 'preview', {}, true );
	runtime.tick( .2, .1, { gamepads: [ pad ] } );
	assert.ok( Math.abs( actor.position.x - .5 ) < 1e-8 );
	assert.equal( actor.position.y, .75 );
	assert.equal( rumbles, 1 );
	pad.buttons[ 0 ].pressed = false;
	runtime.tick( .3, .1, { gamepads: [ pad ] } );
	runtime.tick( .4, .1 );
	assert.equal( actor.position.z, - 1 );
	assert.equal( actor.visible, true );
	assert.equal( resets, 1 );
	runtime.stop();

} );
