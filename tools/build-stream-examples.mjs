import * as THREE from '../build/three.module.js';
import { writeFile } from 'node:fs/promises';

const output = new URL( '../editor/examples/streams/', import.meta.url );
const project = { renderer: 'WebGLRenderer', cameraController: 'orbit' };
function lesson( title, instructions, source ) {

	const scene = new THREE.Scene();
	scene.name = title;
	scene.background = new THREE.Color( 0x20242e );
	scene.userData.lesson = { title, instructions, source };
	const camera = new THREE.PerspectiveCamera( 44, 1, .01, 80 );
	camera.position.set( 0, 1, 6 );
	camera.lookAt( 0, 0, 0 );
	const scripts = {};
	const add = ( object, name ) => { object.name = name; scene.add( object ); return object; };
	const attach = ( object, name, source ) => { scripts[ object.uuid ] = [ { name, source, enabled: true, assetBehavior: 'stream' } ]; };
	const route = ( source, fallback, object, property, input, output ) => {

		( scene.userData.streamRoutes ||= [] ).push( { source, fallback, input, output, target: { kind: 'object', uuid: object.uuid, property } } );

	};
	const mesh = ( geometry, color ) => new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( { color } ) );
	const save = async file => {

		scene.updateMatrixWorld( true );
		camera.updateMatrixWorld( true );
		await writeFile( new URL( file + '.app.json', output ), JSON.stringify( {
			project: { ...project, title }, scene: scene.toJSON(), camera: camera.toJSON(), viewportCamera: camera.uuid,
			viewportTarget: [ 0, 0, 0 ], environmentType: 'None', backgroundType: 'Color', scripts, history: { undos: [], redos: [] }
		} ) + '\n' );

	};
	return { scene, add, attach, route, mesh, save };

}

const serial = lesson( 'Arduino A0', 'Preview sweeps the sensor range. Upload the p5comp A0 sketch, connect at 9600 baud, then send HELLO and START.', 'https://github.com/languel/p5comp/tree/main/examples/legacy/ino/webserial-a0-circle' );
const sensor = serial.add( serial.mesh( new THREE.IcosahedronGeometry( .63, 1 ), 0x71edcf ), 'A0 indicator' );
serial.attach( sensor, 'Preview sensor', `
function update(event) {
 player.streams.publish('demo.a0', 511.5 * (1 + Math.sin(event.time / 850)));
 this.rotation.y = event.time / 1500;
}` );
serial.scene.userData.streamRoutes = [
	{ source: 'serial.A0', fallback: 'demo.a0', input: [ 0, 1023 ], target: { kind: 'topic', topic: 'map.a0' } }
];
serial.route( 'map.a0', '', sensor, 'position.x', [ 0, 1 ], [ -1.65, 1.65 ] );
serial.route( 'map.a0', '', sensor, 'scale', [ 0, 1 ], [ .3, 1.35 ] );
await serial.save( 'arduino-a0' );

const signal = lesson( 'MIDI and audio', 'Select a MIDI input and move channel 1 CC 1. Turn on the microphone or open a media file for the audio meter.' );
const midi = signal.add( signal.mesh( new THREE.TorusKnotGeometry( .48, .15, 40, 8 ), 0xc1acff ), 'MIDI mod wheel' );
const meter = signal.add( signal.mesh( new THREE.BoxGeometry( .62, 1.3, .6 ), 0xffa45c ), 'Audio RMS' );
midi.position.x = -.9;
meter.position.x = .9;
signal.attach( midi, 'Preview signals', `
function update(event) {
 player.streams.publish('demo.midi', 63.5 * (1 + Math.sin(event.time / 1100)));
 player.streams.publish('demo.rms', .16 * (1 + Math.sin(event.time / 190)));
}` );
signal.route( 'midi.cc.1.1', 'demo.midi', midi, 'rotation.z', [ 0, 127 ], [ -2, 2 ] );
signal.route( 'audio.rms', 'demo.rms', meter, 'scale', [ 0, .35 ], [ .15, 1.35 ] );
signal.scene.userData.streamRoutes.push( {
	source: 'audio.rms', input: [ 0, .35 ], output: [ 0, 127 ],
	target: { kind: 'midi.cc', channel: 1, controller: 11 }
} );
await signal.save( 'midi-audio' );

const board = lesson( 'Video pinboard', 'Open a local video or start the webcam. Pixel brightness drives the pins. Preview uses a travelling wave.', 'https://github.com/languel/threejslessons/blob/main/03-pinboard.js' );
const pins = board.add( new THREE.Group(), 'Luminance pins' );
const pinGeometry = new THREE.BoxGeometry( .125, .125, .55 );
const pinMaterial = new THREE.MeshBasicMaterial( { color: 0x6ee4fd } );
for ( let y = 0; y < 12; y ++ ) for ( let x = 0; x < 20; x ++ ) {

	const pin = new THREE.Mesh( pinGeometry, pinMaterial );
	pin.position.set( ( x - 9.5 ) * .15, ( 5.5 - y ) * .15, 0 );
	pins.add( pin );

}
board.attach( pins, 'Video luminance driver', `
let canvas, ctx, frame;
function init() {
 canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 12;
 ctx = canvas.getContext('2d', { willReadFrequently: true });
}
function update(event) {
 const video = player.streams.get('video.frame');
 if (video && player.streams.get('video.time') !== frame) {
  frame = player.streams.get('video.time');
  ctx.drawImage(video,0,0,20,12);
 } else if (video) return;
 const data = video && ctx.getImageData(0,0,20,12).data;
 this.children.forEach((pin,i) => {
  pin.position.z = data ? (data[4*i]*.21 + data[4*i+1]*.72 + data[4*i+2]*.07)/255 :
    .5 + .35*Math.sin(i%20*.45 + Math.floor(i/20)*.35 - event.time/450);
 });
}` );
await board.save( 'pinboard' );

const reach = lesson( 'Pose reach plane', 'Enable webcam and MediaPipe Pose. Move a wrist in front of the plane. Preview uses a moving hand marker.', 'https://github.com/languel/threejslessons/blob/main/04-fusion.js' );
const plane = reach.add( new THREE.Mesh( new THREE.PlaneGeometry( 2.15, 1.5 ), new THREE.MeshBasicMaterial( { color: 0x547ca6, transparent: true, opacity: .32, side: THREE.DoubleSide } ) ), 'Reach plane' );
plane.position.z = .2;
const hand = reach.add( reach.mesh( new THREE.SphereGeometry( .14, 14, 10 ), 0xffae62 ), 'Wrist marker' );
reach.attach( hand, 'Wrist and plane driver', `
function update(event) {
 const bus = player.streams;
 const t = event.time/1000;
 bus.publish('demo.reach.x', .5 + .3*Math.sin(t));
 bus.publish('demo.reach.y', .5 + .2*Math.cos(t*1.5));
 bus.publish('demo.reach.z', .15*Math.cos(t));
 const z = bus.get('vision.pose.16.z') ?? bus.get('demo.reach.z');
 scene.getObjectByName('Reach plane').material.opacity = z < -.05 ? .7 : .22;
}` );
for ( const [ axis, to ] of [ [ 'x', [ -1.8, 1.8 ] ], [ 'y', [ 1.4, -1.4 ] ], [ 'z', [ 1.4, -1.4 ] ] ] ) {

	reach.route( 'vision.pose.16.' + axis, 'demo.reach.' + axis, hand, 'position.' + axis, axis === 'z' ? [ -.5, .5 ] : [ 0, 1 ], to );

}
await reach.save( 'pose-reach' );

const voice = `
function tone(ctx, frequency, drum) {
 if (!ctx || ctx.state !== 'running') return;
 const oscillator = ctx.createOscillator(), gain = ctx.createGain();
 const now = ctx.currentTime;
 oscillator.type = drum ? 'sine' : 'triangle';
 oscillator.frequency.setValueAtTime(frequency, now);
 if (drum) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency/3), now+.14);
 gain.gain.setValueAtTime(.16, now);
 gain.gain.exponentialRampToValueAtTime(.001, now+.32);
 oscillator.connect(gain).connect(ctx.destination);
 oscillator.start(now);
 oscillator.stop(now+.33);
 oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}`;
const harp = lesson( 'Laser harp', 'Enable instrument sound. In MediaPipe Hand mode, move your index finger across the beams. With no hand input, a preview sweeps the beams silently.', 'https://github.com/languel/threejslessons/blob/main/05-laser-harp.js' );
const beams = harp.add( new THREE.Group(), 'Harp beams' );
for ( let i = 0; i < 7; i ++ ) {

	const beam = harp.mesh( new THREE.CylinderGeometry( .016, .025, 2.1, 8 ), 0x346990 );
	beam.name = 'Beam ' + ( i + 1 );
	beam.position.x = ( i - 3 ) * .39;
	beams.add( beam );

}
harp.attach( beams, 'Finger to note', `
 // @param playPreview = false
 let last = -1;
 ${ voice }
 function update(event) {
  const bus = player.streams, x = bus.get('vision.hand.8.x'), y = bus.get('vision.hand.8.y');
  const live = Number.isFinite(x);
  const index = live && y > .84 ? -1 : Math.max(0,Math.min(6,Math.floor((live ? 1-x : .5+.48*Math.sin(event.time/1000))*7)));
  if (index === last) return;
  this.children.forEach((beam,i) => beam.material.color.setHex(i===index ? 0x8cfffa : 0x346990));
  last = index;
  if (index >= 0 && (live || params.playPreview)) tone(bus.audio, 261.63 * 2**([0,2,4,7,9,12,14][index]/12), false);
 }
` );
await harp.save( 'laser-harp' );

const drums = lesson( 'Body drum', 'Enable instrument sound and MediaPipe Pose. Hit the pads with either wrist. Preview demonstrates the hit sequence silently.', 'https://github.com/languel/threejslessons/blob/main/06-body-drum.js' );
const pads = drums.add( new THREE.Group(), 'Body drum pads' );
for ( const [ x, y ] of [ [ -.86, .48 ], [ .86, .48 ], [ -.66, -.52 ], [ .66, -.52 ] ] ) {

	const pad = drums.mesh( new THREE.CircleGeometry( .29, 32 ), 0x9c4770 );
	pad.position.set( x, y, 0 );
	pads.add( pad );

}
drums.attach( pads, 'Wrist pad triggers', `
 // @param playPreview = false
 let last = new Set(), flashes = [];
 ${ voice }
 function update(event) {
  const bus = player.streams;
  const points = bus.get('vision.pose.landmarks');
  const hits = new Set();
  if (points) {
   for (const joint of [15,16]) {
    const p = points[joint];
    if (!p || (p.visibility ?? 1) < .5) continue;
    this.children.forEach((pad,i) => {
     if (Math.hypot((p.x-.5)*-3.6-pad.position.x, (.5-p.y)*2.8-pad.position.y) < .32) hits.add(i);
    });
   }
  } else hits.add(Math.floor(event.time/430)%4);
  for (const i of hits) if (!last.has(i)) {
   flashes[i] = event.time + 180;
   if (points || params.playPreview) tone(bus.audio,[105,160,245,350][i],true);
  }
  this.children.forEach((pad,i) => pad.material.color.setHex(flashes[i]>event.time ? 0xffda83 : 0x9c4770));
  last = hits;
 }
` );
await drums.save( 'body-drum' );

const { poseScript } = await import( '../editor/js/streams/PoseDriver.js' );
const avatar = lesson( 'Humanoid pose driver', 'Preview the rig or use MediaPipe Pose with a webcam. Select the avatar and use Record motion in the MediaPipe panel to bake a live performance. Import a VRM through Assets for the same driver.' );
const rig = avatar.add( new THREE.Group(), 'Humanoid avatar' );
rig.userData.vrmBones = {};
function bone( parent, name, x, y ) {

	const item = new THREE.Group();
	item.name = name;
	item.position.set( x, y, 0 );
	parent.add( item );
	rig.userData.vrmBones[ name ] = item.uuid;
	return item;

}
const torso = avatar.mesh( new THREE.BoxGeometry( .67, .88, .34 ), 0x7fb5ff );
torso.position.y = .38;
rig.add( torso );
const head = avatar.mesh( new THREE.SphereGeometry( .26, 18, 12 ), 0xf6cf9c );
head.position.y = 1.09;
rig.add( head );
for ( const [ side, sign ] of [ [ 'left', 1 ], [ 'right', -1 ] ] ) {

	const upperArm = bone( rig, side + 'UpperArm', sign * .35, .7 );
	const lowerArm = bone( upperArm, side + 'LowerArm', sign * .43, 0 );
	bone( lowerArm, side + 'Hand', sign * .4, 0 );
	const upperLeg = bone( rig, side + 'UpperLeg', sign * .18, 0 );
	const lowerLeg = bone( upperLeg, side + 'LowerLeg', 0, -.52 );
	bone( lowerLeg, side + 'Foot', 0, -.48 );
	for ( const [ parent, dx, dy, length ] of [ [ upperArm, sign*.215, 0, .43 ], [ lowerArm, sign*.2, 0, .4 ], [ upperLeg, 0, -.26, .52 ], [ lowerLeg, 0, -.24, .48 ] ] ) {

		const part = avatar.mesh( new THREE.BoxGeometry( dx ? length : .17, dy ? length : .16, .17 ), dx ? 0xf6cf9c : 0x6579bd );
		part.position.set( dx, dy, 0 );
		parent.add( part );

	}

}
const driver = poseScript( true );
avatar.attach( rig, driver.name, driver.source );
await avatar.save( 'humanoid-pose' );

const drawing = lesson( 'One-line portrait', 'Start MediaPipe Face with a webcam or local video. Preview draws a stylized face using the same continuous line.', 'https://github.com/languel/threejslessons/blob/main/08-unicursal.js' );
const paper = drawing.add( drawing.mesh( new THREE.PlaneGeometry( 3.1, 2.5 ), 0xf5e7cb ), 'Paper' );
paper.position.z = -.1;
const ink = drawing.add( new THREE.Line(
	new THREE.BufferGeometry().setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( 384 * 3 ), 3 ) ),
	new THREE.LineBasicMaterial( { color: 0x322448 } )
), 'Unbroken ink line' );
ink.frustumCulled = false;
drawing.attach( ink, 'Face landmarks to line', `
const features = [[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10],
 [33,160,158,133,153,144,33],[168,6,4,1,2],[263,387,385,362,380,373,263],[61,0,291,17,61]];
let last;
function update(event) {
 if (event.time-last<65) return;
 last=event.time;
 const face=player.streams.get('vision.face.landmarks');
 const points=[];
 if (face) {
  const origin=face[1];
  for (const i of features.flat()) {
   const point=face[i];
   if (point) points.push(new THREE.Vector3((origin.x-point.x)*5,(origin.y-point.y)*5,0));
  }
 } else {
  for(let i=0;i<=48;i++) {
   const a=i/48*Math.PI*2;
   points.push(new THREE.Vector3(.74*Math.cos(a),.92*Math.sin(a),0));
  }
  const y=.09+.04*Math.sin(event.time/480);
  for(const [x,v] of [[-.53,y],[-.32,y+.12],[-.15,y],[0,-.12],[.16,-.08],[.24,y],[.43,y+.12],[.54,y],[.31,-.39],[0,-.49],[-.31,-.39],[.31,-.39]]) points.push(new THREE.Vector3(x,v,0));
 }
 const line=new THREE.CatmullRomCurve3(points).getPoints(383);
 const positions=this.geometry.attributes.position;
 line.forEach((p,i)=>positions.setXYZ(i,p.x,p.y,p.z));
 positions.needsUpdate=true;
}` );
await drawing.save( 'one-line' );
