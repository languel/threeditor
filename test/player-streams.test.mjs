import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Object3D, Scene } from '../build/three.module.js';
import { MidiDevice, SerialDevice, bindDeviceOutputs } from '../editor/js/streams/DeviceStreams.js';
import { playerStreamNeeds } from '../editor/js/streams/PlayerStreams.js';
import { StreamRouter } from '../editor/js/streams/StreamRouter.js';

test( 'The published player discovers live inputs from saved nodes and stream routes', () => {

	const scene = new Scene();
	const mesh = new Object3D();
	scene.add( mesh );
	scene.userData.streamRoutes = [
		{ source: 'audio.rms', fallback: 'preview.audio.rms' },
		{ source: 'input.cam.video.time' },
		{ source: 'input.cam.vision.leftHand.3.x' },
		{ source: 'vision.pose.16.x' },
		{ source: 'midi.cc.1.1', enabled: false }
	];
	mesh.userData.logicGraph = {
		nodes: [
			{ type: 'logic.landmark', values: { source: 'cam', group: 'face' } },
			{ type: 'logic.streamText' },
			{ type: 'logic.sendSerial' },
			{ type: 'logic.sendCC', muted: true }
		],
		links: []
	};

	assert.deepEqual( playerStreamNeeds( scene ), {
		midi: false, serial: true, output: true, media: new Map( [
			[ '', { camera: true, microphone: true, trackers: new Set( [ 'pose' ] ) } ],
			[ 'cam', { camera: true, microphone: false, trackers: new Set( [ 'holistic', 'face' ] ) } ]
		] )
	} );

} );

test( 'Shared MIDI ports route samples and stop sounding notes on disconnect', async t => {

	const bus = new StreamRouter();
	const input = { close: async () => {} };
	const close = t.mock.fn( async () => {} );
	const send = t.mock.fn();
	const access = { inputs: new Map( [ [ 'in', input ] ] ), outputs: new Map( [ [ 'out', { send, close } ] ] ) };
	t.mock.method( globalThis, 'navigator', () => ( { requestMIDIAccess: async () => access } ), { getter: true } );
	const portsChanged = t.mock.fn();
	const midi = new MidiDevice( bus, portsChanged );
	let armed = false;
	bindDeviceOutputs( bus, undefined, midi, () => armed );
	await midi.connect();
	assert.equal( portsChanged.mock.calls[ 0 ].arguments[ 0 ], access );
	midi.selectInput( 'in' );
	midi.selectOutput( 'out' );
	input.onmidimessage( { data: new Uint8Array( [ 0xb0, 1, 80 ] ) } );
	assert.equal( bus.getSample( 'midi.cc.1.1' ).value, 80 );
	assert.deepEqual( bus.getSample( 'midi.message' ).value, [ 0xb0, 1, 80 ] );

	const note = { channel: 1, note: 60 };
	assert.equal( bus.sendOutput( 'midi.note', note, 100 ), false );
	armed = true;
	assert.equal( bus.sendOutput( 'midi.note', note, 100, true ), false );
	assert.equal( bus.sendOutput( 'midi.note', note, 100 ), true );
	midi.disconnect();
	assert.deepEqual( send.mock.calls.map( call => call.arguments[ 0 ] ), [ [ 0x90, 60, 100 ], [ 0x80, 60, 0 ] ] );
	assert.equal( bus.getSample( 'midi.cc.1.1' ), undefined );
	assert.equal( input.onmidimessage, null );
	assert.equal( access.onstatechange, null );
	assert.equal( close.mock.callCount(), 1 );

} );

test( 'Disconnecting cancels a serial connection still awaiting a chosen port', async t => {

	let selectPort;
	const open = t.mock.fn();
	const port = new Promise( resolve => { selectPort = resolve; } );
	t.mock.method( globalThis, 'navigator', () => ( { serial: { requestPort: () => port } } ), { getter: true } );
	const serial = new SerialDevice( new StreamRouter(), () => {} );
	const connecting = serial.connect( 9600 );
	await serial.disconnect();
	selectPort( { open } );
	await connecting;
	assert.equal( open.mock.callCount(), 0 );
	assert.equal( serial.port, null );

} );
