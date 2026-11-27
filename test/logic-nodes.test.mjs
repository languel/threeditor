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

test( 'Stream samples drive logic from numeric inputs and preserve edge transitions in a burst', () => {

	const scene = new THREE.Scene();
	const owner = new THREE.Object3D();
	scene.add( owner );
	const graph = owner.userData.logicGraph = createLogicGraph();
	const threshold = node( graph, 'logic.streamThreshold', { topic: 'serial.A0', threshold: 30 } );
	const rise = node( graph, 'logic.move', { x: 1 } );
	const fall = node( graph, 'logic.move', { z: 1 } );
	wire( graph, threshold, 'above', rise, 'run' );
	wire( graph, threshold, 'below', fall, 'run' );
	const sample = node( graph, 'logic.streamSample', { topic: 'midi.cc.1.1' } );
	const pressure = node( graph, 'logic.midiCC' );
	const move = node( graph, 'logic.move' );
	wire( graph, sample, 'then', move, 'run' );
	wire( graph, pressure, 'normalized', move, 'y' );
	const streams = new StreamRouter();
	const runtime = new LogicRuntime( THREE, scene, streams, error => { throw error; } );
	runtime.start();
	for ( const value of [ 10, 60, 70, 20, 50 ] ) streams.publish( 'serial.A0', value );
	streams.publish( 'midi.cc.1.1', 127 );
	runtime.tick( 1, .1 );
	assert.deepEqual( owner.position.toArray(), [ 2, 1, 1 ] );
	runtime.stop();
	streams.publish( 'serial.A0', 2 );
	assert.equal( runtime.pending.length, 0 );

} );

test( 'MediaPipe vector data moves an object and preview data cannot drive hardware', () => {

	const scene = new THREE.Scene();
	const owner = new THREE.Object3D();
	scene.add( owner );
	const graph = owner.userData.logicGraph = createLogicGraph();
	const landmark = node( graph, 'logic.landmark' );
	const sample = node( graph, 'logic.streamSample', { topic: 'vision.pose.16.z' } );
	const move = node( graph, 'logic.moveVector' );
	wire( graph, sample, 'then', move, 'run' );
	wire( graph, landmark, 'vector', move, 'vector' );

	const update = node( graph, 'logic.update' );
	const serial = node( graph, 'logic.serialValue' );
	const store = node( graph, 'logic.setVariable' );
	const get = node( graph, 'logic.variable' );
	const send = node( graph, 'logic.sendSerial' );
	wire( graph, update, 'then', store, 'run' );
	wire( graph, serial, 'value', store, 'value' );
	wire( graph, store, 'then', send, 'run' );
	wire( graph, get, 'value', send, 'value' );
	const streams = new StreamRouter();
	const writes = [];
	streams.outputs.set( 'serial', ( target, value ) => writes.push( [ target.key, value ] ) );
	const runtime = new LogicRuntime( THREE, scene, streams, error => { throw error; } );
	runtime.start();
	streams.publish( 'serial.A0', 9, true );
	for ( const [ i, axis ] of [ 'x', 'y', 'z' ].entries() ) streams.publish( 'vision.pose.16.' + axis, i + 1 );
	runtime.tick( 1, .1 );
	assert.deepEqual( owner.position.toArray(), [ 1, 2, 3 ] );
	assert.deepEqual( writes, [] );
	streams.publish( 'serial.A0', 12, false );
	runtime.tick( 2, .1 );
	assert.deepEqual( writes, [ [ 'LED', 12 ] ] );
	runtime.stop();

} );
