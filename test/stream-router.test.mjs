import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { StreamRouter, mapValue } from '../editor/js/streams/StreamRouter.js';
import { SerialDevice, midiTopics, serialValues } from '../editor/js/streams/DeviceStreams.js';
import { MediaStreams } from '../editor/js/streams/MediaStreams.js';
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

test( 'Holistic publishes iris, pose and hand topics for its selected input', async () => {

	const bus = new StreamRouter();
	const media = new MediaStreams( bus, 'camera', () => false );
	media.element = { readyState: 2, videoWidth: 640, currentTime: 1 };
	media.mode = 'holistic';
	const face = Array.from( { length: 478 }, ( _, index ) => ( { x: index / 478, y: .5, z: 0 } ) );
	const pose = [ { x: .1, y: .2, z: .3 } ];
	media.tracker = { close() {}, detectForVideo: () => ( { faceLandmarks: [ face ], poseLandmarks: [ pose ], rightHandLandmarks: [ pose ] } ) };
	media.tick( 100 );
	assert.deepEqual( bus.get( 'vision.iris.left.landmarks' ), face.slice( 473 ) );
	assert.equal( bus.get( 'input.camera.vision.iris.right.0.x' ), face[ 468 ].x );
	assert.equal( bus.get( 'vision.pose.landmarks' ), pose );
	assert.equal( bus.get( 'vision.rightHand.landmarks' ), pose );
	assert.equal( bus.get( 'video.frame' ), undefined );
	assert.equal( bus.get( 'input.camera.video.frame' ), media.element );
	await media.track( '' );
	assert.equal( bus.get( 'vision.iris.left.landmarks' ), undefined );
	assert.equal( bus.get( 'input.camera.video.frame' ), media.element );

} );

test( 'A still image stays available to a tracker started after input assignment', async () => {

	const bus = new StreamRouter();
	const media = new MediaStreams( bus, 'still' );
	const image = { width: 320, height: 240 };
	await media.start( null, { still: true, image } );
	media.tick( 100 );
	assert.equal( bus.get( 'input.still.video.frame' ), image );
	let frames = 0;
	media.mode = 'face';
	media.tracker = { detectForVideo( frame ) { assert.equal( frame, image ); frames ++; return {}; } };
	media.refreshFrame();
	media.tick( 200 );
	media.tick( 300 );
	assert.equal( frames, 1 );
	media.pause();
	assert.equal( bus.get( 'input.still.video.frame' ), undefined );
	await media.resume( null, { still: true } );
	media.tick( 400 );
	assert.equal( frames, 2 );

} );

test( 'Drivers target materials, morphs, curves, smoothing, and script parameters', () => {

	const bus = new StreamRouter(), scene = new THREE.Scene();
	const mesh = new THREE.Mesh(
		new THREE.BoxGeometry(),
		new THREE.MeshStandardMaterial( { color: 0xffffff, opacity: 1 } )
	);
	mesh.morphTargetDictionary = { jawOpen: 0 };
	mesh.morphTargetInfluences = [ 0 ];
	scene.add( mesh );
	const params = { turbulence: 0.5, playing: true };
	bus.getParam = ( uuid, idx, key ) => uuid === mesh.uuid && idx === 0 ? params[ key ] : undefined;
	bus.setParam = ( uuid, idx, key, value ) => { if ( uuid === mesh.uuid && idx === 0 ) { params[ key ] = value; return true; } return false; };

	scene.userData.streamRoutes = [
		{ source: 'a', input: [ 0, 1 ], output: [ 0, 1 ], curve: 'smoothstep', target: { kind: 'object', uuid: mesh.uuid, property: 'material.opacity' } },
		{ source: 'b', input: [ 0, 1 ], output: [ 0, 1 ], smooth: 0.5, target: { kind: 'morph', uuid: mesh.uuid, morph: 'jawOpen' } },
		{ source: 'c', input: [ 0, 10 ], output: [ 1, 3 ], target: { kind: 'param', uuid: mesh.uuid, scriptIndex: 0, param: 'turbulence' } },
		{ source: 'd', input: [ 0, 1 ], output: [ 0, 1 ], target: { kind: 'object', uuid: mesh.uuid, property: 'color.hue' } }
	];

	bus.publish( 'a', 0.5 );
	bus.publish( 'b', 0 );
	bus.publish( 'c', 5 );
	bus.publish( 'd', 1 / 3 );
	assert.equal( bus.tick( scene ), true );
	assert.equal( mesh.material.opacity, 0.5 );
	assert.equal( mesh.material.transparent, true );
	assert.equal( mesh.morphTargetInfluences[ 0 ], 0 );
	assert.equal( params.turbulence, 2 );
	assert.ok( mesh.material.color.g > 0.99 && mesh.material.color.r < 0.01 );

	bus.publish( 'b', 1 );
	bus.tick( scene );
	assert.equal( mesh.morphTargetInfluences[ 0 ], 0.5 );
	bus.tick( scene );
	assert.equal( mesh.morphTargetInfluences[ 0 ], 0.75 );

} );

test( 'Event rules fire edge triggers, emit named events, modify objects/params, and respect preview safety', () => {

	const bus = new StreamRouter(), scene = new THREE.Scene(), light = new THREE.PointLight();
	scene.add( light );
	const params = { active: false };
	bus.getParam = ( uuid, idx, key ) => uuid === light.uuid ? params[ key ] : undefined;
	bus.setParam = ( uuid, idx, key, value ) => { if ( uuid === light.uuid ) { params[ key ] = value; return true; } return false; };
	const hardwareSent = [];
	bus.outputs.set( 'serial', ( action, val ) => hardwareSent.push( [ action.key, val ] ) );
	const emitted = [];
	const unsub = bus.on( 'burst', ( detail ) => emitted.push( detail.value ) );

	scene.userData.streamEvents = [
		{ source: 'audio.rms', fallback: 'demo.rms', trigger: 'rising', threshold: 0.5, action: { kind: 'emit', name: 'burst', value: 42 } },
		{ source: 'burst', trigger: 'event', action: { kind: 'addProperty', uuid: light.uuid, property: 'intensity', value: 2 } },
		{ source: 'burst', trigger: 'event', action: { kind: 'setParam', uuid: light.uuid, scriptIndex: 0, param: 'active', toggle: true } },
		{ source: 'serial.line', trigger: 'match', match: 'GO', action: { kind: 'toggleVisible', uuid: light.uuid } },
		{ source: 'audio.rms', fallback: 'demo.rms', trigger: 'rising', threshold: 0.5, action: { kind: 'serial', key: 'PING', value: 1 } }
	];

	// Preview sample should fire scene actions and named events, but block hardware output.
	bus.publish( 'demo.rms', 0.8 );
	assert.equal( bus.tick( scene ), true );
	assert.deepEqual( emitted, [ 42 ] );
	assert.equal( light.intensity, 3 );
	assert.equal( params.active, true );
	assert.deepEqual( hardwareSent, [] );

	// Match trigger toggles visibility; real sample triggers hardware output.
	bus.publish( 'serial.line', 'NOPE' );
	bus.tick( scene );
	assert.equal( light.visible, true );
	bus.publish( 'serial.line', 'GO' );
	bus.tick( scene );
	assert.equal( light.visible, false );

	bus.publish( 'audio.rms', 0.2 );
	bus.tick( scene );
	bus.publish( 'audio.rms', 0.9 );
	bus.tick( scene );
	assert.deepEqual( hardwareSent, [ [ 'PING', 1 ] ] );
	unsub();

} );
