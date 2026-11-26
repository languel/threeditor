import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
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

test( 'Keyboard events and typed values drive a different object through the scene event bus', () => {

	const scene = new THREE.Scene();
	const sender = new THREE.Object3D();
	const receiver = new THREE.Object3D();
	scene.add( sender, receiver );
	const origin = sender.userData.logicGraph = createLogicGraph();
	const press = node( origin, 'logic.keyDown' );
	const send = node( origin, 'logic.send', { name: 'advance', value: 2 } );
	wire( origin, press, 'then', send, 'run' );

	const destination = receiver.userData.logicGraph = createLogicGraph();
	const receive = node( destination, 'logic.receive', { name: 'advance' } );
	const payload = node( destination, 'logic.eventValue' );
	const move = node( destination, 'logic.move' );
	wire( destination, payload, 'value', move, 'x' );
	wire( destination, receive, 'then', move, 'run' );

	const saved = new THREE.ObjectLoader().parse( JSON.parse( JSON.stringify( scene.toJSON() ) ) );
	const moved = saved.getObjectByProperty( 'uuid', receiver.uuid );
	const streams = new StreamRouter();
	const runtime = new LogicRuntime( THREE, saved, streams );
	runtime.start();
	streams.emit( 'keydown', { code: 'Space', repeat: true } );
	runtime.tick( .1, .1 );
	assert.equal( moved.position.x, 0 );
	streams.emit( 'keydown', { code: 'Space' } );
	runtime.tick( .2, .1 );
	assert.equal( moved.position.x, 2 );
	streams.emit( 'advance', { value: 3 }, true );
	runtime.tick( .3, .1 );
	assert.equal( moved.position.x, 5 );
	runtime.stop();
	streams.emit( 'advance', { value: 100 } );
	assert.equal( runtime.pending.length, 0 );
	assert.equal( receiver.position.x, 0 );

} );

test( 'Logic feedback needs a Delay and executes at most once per frame with zero seconds', () => {

	const scene = new THREE.Scene();
	const owner = new THREE.Object3D();
	scene.add( owner );
	const graph = owner.userData.logicGraph = createLogicGraph();
	const merge = node( graph, 'logic.merge' );
	const move = node( graph, 'logic.move', { x: 1 } );
	const delay = node( graph, 'logic.delay', { seconds: 0 } );
	wire( graph, 'logic.start', 'then', merge, 'a' );
	wire( graph, merge, 'then', move, 'run' );
	assert.throws( () => wire( graph, move, 'then', merge, 'b' ), /Feedback needs a Delay/ );
	wire( graph, move, 'then', delay, 'run' );
	wire( graph, delay, 'then', merge, 'b' );
	const runtime = new LogicRuntime( THREE, scene, new StreamRouter() );
	runtime.start();
	assert.equal( owner.position.x, 1 );
	runtime.tick( .1, .1 );
	assert.equal( owner.position.x, 2 );
	runtime.tick( .2, .1 );
	assert.equal( owner.position.x, 3 );
	runtime.stop();
	assert.equal( runtime.timers.length, 0 );

} );

test( 'Overlap and branch pulses support object references and run nested sequences in order', () => {

	const scene = new THREE.Scene();
	const owner = new THREE.Mesh( new THREE.BoxGeometry() );
	const marker = new THREE.Mesh( new THREE.BoxGeometry() );
	scene.add( owner, marker );
	const graph = owner.userData.logicGraph = createLogicGraph();
	const sensor = node( graph, 'logic.overlap', { target: marker.uuid } );
	const sequence = node( graph, 'logic.sequence' );
	const store = node( graph, 'logic.setVariable', { value: 7 } );
	const read = node( graph, 'logic.variable' );
	const compare = node( graph, 'logic.compare', { b: 5 } );
	const branch = node( graph, 'logic.branch' );
	const hide = node( graph, 'logic.setVisibility', { target: marker.uuid, visible: false } );
	const show = node( graph, 'logic.setVisibility', { target: marker.uuid, visible: true } );
	wire( graph, sensor, 'enter', sequence, 'run' );
	wire( graph, sequence, 'first', store, 'run' );
	wire( graph, sequence, 'second', branch, 'run' );
	wire( graph, read, 'value', compare, 'a' );
	wire( graph, compare, 'value', branch, 'condition' );
	wire( graph, branch, 'yes', hide, 'run' );
	wire( graph, sensor, 'exit', show, 'run' );

	const runtime = new LogicRuntime( THREE, scene, new StreamRouter() );
	runtime.tick( .1, .1 );
	assert.equal( marker.visible, false );
	marker.position.x = 4;
	runtime.tick( .2, .1 );
	assert.equal( marker.visible, true );
	runtime.stop();

} );
