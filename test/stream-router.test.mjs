import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { StreamRouter, mapValue } from '../editor/js/streams/StreamRouter.js';
import { SerialDevice, midiTopics, serialValues } from '../editor/js/streams/DeviceStreams.js';
import { vrmBoneMap, poseScript } from '../editor/js/streams/PoseDriver.js';
import { serializeScript } from '../editor/js/ScriptParams.js';

test( 'Device formats cover p5comp A0 and MIDI controls and releases', () => {

	assert.deepEqual( serialValues( 'A0 625' ), { A0: 625 } );
	assert.deepEqual( serialValues( 'A0:0.5 A1=-2e1' ), { A0: .5, A1: -20 } );
	assert.deepEqual( serialValues( '42' ), { value: 42 } );
	assert.deepEqual( serialValues( 'OK START' ), {} );
	assert.deepEqual( midiTopics( [ 0xb1, 7, 100 ] ), { 'midi.cc.2.7': 100 } );
	assert.deepEqual( midiTopics( [ 0x80, 60, 64 ] ), { 'midi.note.1.60': 0 } );
	assert.deepEqual( midiTopics( [ 0xe0, 0, 64 ] ), { 'midi.bend.1': 0 } );

} );

test( 'Mapped samples drive scenes, preserve preview provenance and deduplicate device output', () => {

	const bus = new StreamRouter(), scene = new THREE.Scene(), object = new THREE.Object3D();
	scene.add( object );
	const sent = [];
	bus.outputs.set( 'serial', ( target, value ) => sent.push( value ) );
	scene.userData.streamRoutes = [
		{ source: 'serial.A0', fallback: 'demo.a0', input: [ 0, 100 ], target: { kind: 'topic', topic: 'map.knob' } },
		{ source: 'map.knob', output: [ 2, -2 ], target: { kind: 'object', uuid: object.uuid, property: 'position.x' } },
		{ source: 'map.knob', output: [ 0, 10 ], target: { kind: 'serial' } }
	];
	const received = [];
	const unsubscribe = bus.subscribe( 'serial.A0', value => received.push( value ) );
	bus.publish( 'demo.a0', 25 );
	assert.equal( bus.tick( scene ), true );
	assert.equal( object.position.x, 1 );
	assert.deepEqual( sent, [] );
	bus.publish( 'serial.A0', 75 );
	bus.tick( scene );
	assert.equal( object.position.x, -1 );
	bus.publish( 'serial.A0', 75 );
	bus.tick( scene );
	assert.deepEqual( sent, [ 7.5 ] );
	unsubscribe();
	bus.publish( 'serial.A0', 100 );
	assert.deepEqual( received, [ 75, 75 ] );
	object.userData.threeditor = { disabled: true };
	bus.tick( scene );
	assert.equal( object.position.x, -1 );
	assert.equal( mapValue( 2, { input: [ 0, 1 ], output: [ 0, 10 ], clamp: false } ), 20 );
	bus.clear( 'serial.' );
	assert.equal( bus.get( 'map.knob' ), undefined );

} );

test( 'Web Serial frames chunked input, writes lines and releases both locks', async () => {

	const bus = new StreamRouter();
	let incoming, baud, closed = false;
	const written = [];
	const port = {
		readable: new ReadableStream( { start( controller ) { incoming = controller; } } ),
		writable: new WritableStream( { write( bytes ) { written.push( new TextDecoder().decode( bytes ) ); } } ),
		async open( options ) { baud = options.baudRate; },
		async close() {
			assert.equal( this.readable.locked, false );
			assert.equal( this.writable.locked, false );
			closed = true;
		}
	};
	const previous = Object.getOwnPropertyDescriptor( globalThis, 'navigator' );
	Object.defineProperty( globalThis, 'navigator', { configurable: true, value: { serial: { requestPort: async () => port } } } );
	const serial = new SerialDevice( bus, () => {} );
	try {

		await serial.connect( 9600 );
		assert.equal( baud, 9600 );
		const line = new Promise( resolve => bus.subscribe( 'serial.A0', resolve ) );
		const encoder = new TextEncoder();
		incoming.enqueue( encoder.encode( 'A0 1' ) );
		incoming.enqueue( encoder.encode( '023\r\n' ) );
		assert.equal( await line, 1023 );
		serial.send( 'START' );
		await serial.drain;
		assert.deepEqual( written, [ 'START\n' ] );
		await serial.disconnect();
		assert.equal( closed, true );
		assert.equal( bus.get( 'serial.A0' ), undefined );

	} finally {

		await serial.disconnect();
		if ( previous ) Object.defineProperty( globalThis, 'navigator', previous );
		else delete globalThis.navigator;

	}

} );

test( 'VRM node indices bind limb directions and stop restores the rest pose', () => {

	const scene = new THREE.Group(), arm = new THREE.Bone(), elbow = new THREE.Bone();
	scene.add( arm );
	arm.add( elbow );
	elbow.position.x = 1;
	const parser = {
		json: { extensions: { VRMC_vrm: { humanoid: { humanBones: { leftUpperArm: { node: 1 }, leftLowerArm: { node: 2 } } } } } },
		associations: new Map( [ [ arm, { nodes: 1 } ], [ elbow, { nodes: 2 } ] ] )
	};
	scene.userData.vrmBones = vrmBoneMap( { scene, parser } );
	assert.equal( scene.userData.vrmBones.leftUpperArm, arm.uuid );
	const bus = new StreamRouter(), script = poseScript();
	const run = new Function( 'THREE', 'player', 'params', script.source + '\nreturn {init,update,stop};' )( THREE, { streams: bus }, serializeScript( script ).parameters );
	run.init.call( scene );
	const points = [];
	points[ 11 ] = { x: 0, y: 0, z: 0 };
	points[ 13 ] = { x: 0, y: 1, z: 0 };
	bus.publish( 'vision.pose.landmarks', points );
	run.update( { time: 0 } );
	assert.ok( new THREE.Vector3( 1, 0, 0 ).applyQuaternion( arm.quaternion ).distanceTo( new THREE.Vector3( 0, -1, 0 ) ) < 1e-5 );
	run.stop();
	assert.equal( arm.quaternion.angleTo( new THREE.Quaternion() ), 0 );

} );
