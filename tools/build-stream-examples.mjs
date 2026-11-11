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
	const attach = ( object, name, source, extra ) => { scripts[ object.uuid ] = [ { name, source, enabled: true, assetBehavior: 'stream', ...extra } ]; };
	const route = ( source, fallback, object, property, input, output ) => {

		( scene.userData.streamRoutes ||= [] ).push( { source, fallback, input, output, target: { kind: 'object', uuid: object.uuid, property } } );

	};
	const mesh = ( geometry, color ) => new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( { color } ) );
	const save = async ( file, dir = output ) => {

		scene.updateMatrixWorld( true );
		camera.updateMatrixWorld( true );
		await writeFile( new URL( file + '.app.json', dir ), JSON.stringify( {
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

const serpentine = lesson( 'Serpentine particles', 'Motion energy and silk tints from Danse serpentine (1897) drive round glowing particles, multi-light stage colors, haze, bloom, focus, and burst events. Assign a webcam or local video in Streams to take over.', 'https://languel.github.io/mediatheque/items/danse-serpentine-lumiere-1897/clips/01.webm' );
serpentine.scene.background = new THREE.Color( 0x07050f );
serpentine.scene.fog = new THREE.FogExp2( 0x07050f, .068 );
serpentine.scene.userData.postprocessing = {
	bloom: true, bloomStrength: .72, bloomRadius: .62, bloomThreshold: .34,
	dof: true, focus: 6.0, aperture: .002, maxblur: .01
};

const screen = serpentine.add( new THREE.Mesh(
	new THREE.CircleGeometry( 1.08, 64 ),
	new THREE.MeshBasicMaterial( { color: 0xd0b8d8, transparent: true, opacity: .82, side: THREE.DoubleSide } )
), 'Serpentine screen' );
screen.position.set( 0, .28, 0 );

const orreryDisk = serpentine.add( new THREE.Group(), 'Orrery bezel disk' );
orreryDisk.position.set( 0, .28, - .02 );
const bezelPlate = new THREE.Mesh(
	new THREE.RingGeometry( 1.07, 1.32, 64 ),
	new THREE.MeshStandardMaterial( { color: 0x1e162c, roughness: .28, metalness: .88, side: THREE.DoubleSide } )
);
bezelPlate.name = 'Bezel ring';
const bezelOuter = new THREE.Mesh(
	new THREE.TorusGeometry( 1.32, .022, 12, 80 ),
	new THREE.MeshStandardMaterial( { color: 0xffa66b, emissive: 0xff6e40, emissiveIntensity: .9, roughness: .25, metalness: .7 } )
);
bezelOuter.name = 'Bezel outer rim';
const bezelInner = new THREE.Mesh(
	new THREE.TorusGeometry( 1.08, .016, 12, 80 ),
	new THREE.MeshStandardMaterial( { color: 0xff7ad9, emissive: 0xff4fa3, emissiveIntensity: 1.1, roughness: .25, metalness: .7 } )
);
bezelInner.name = 'Bezel inner rim';
orreryDisk.add( bezelPlate, bezelOuter, bezelInner );

const bulbGeo = new THREE.SphereGeometry( .034, 10, 8 );
const bulbColors = [ [ 0xffb860, 0xff8830 ], [ 0xff6eb8, 0xff3b9a ], [ 0x6ae8ff, 0x2ec8ff ] ];
for ( let i = 0; i < 24; i ++ ) {

	const ang = ( i / 24 ) * Math.PI * 2;
	const [ col, em ] = bulbColors[ i % 3 ];
	const bulb = new THREE.Mesh(
		bulbGeo,
		new THREE.MeshStandardMaterial( { color: col, emissive: em, emissiveIntensity: 2.1, roughness: .15 } )
	);
	bulb.name = 'Bezel jewel ' + ( i + 1 );
	bulb.position.set( Math.cos( ang ) * 1.2, Math.sin( ang ) * 1.2, .025 );
	orreryDisk.add( bulb );

}

const stageFloor = serpentine.add( new THREE.Mesh(
	new THREE.CircleGeometry( 9.5, 64 ),
	new THREE.MeshStandardMaterial( { color: 0x151024, roughness: .15, metalness: .84 } )
), 'Stage floor' );
stageFloor.rotation.x = - Math.PI / 2;
stageFloor.position.y = - 1.38;

const floorRing = serpentine.add( new THREE.Mesh(
	new THREE.TorusGeometry( 2.35, .022, 12, 80 ),
	new THREE.MeshStandardMaterial( { color: 0xff9255, emissive: 0xff6b35, emissiveIntensity: 1.15, roughness: .28 } )
), 'Floor footlight ring' );
floorRing.rotation.x = Math.PI / 2;
floorRing.position.y = - 1.36;

const floorBeacons = serpentine.add( new THREE.Group(), 'Floor beacons' );
floorBeacons.position.y = - 1.34;
for ( let i = 0; i < 12; i ++ ) {

	const ang = ( i / 12 ) * Math.PI * 2;
	const [ col, em ] = bulbColors[ i % 3 ];
	const node = new THREE.Mesh(
		new THREE.SphereGeometry( .045, 10, 8 ),
		new THREE.MeshStandardMaterial( { color: col, emissive: em, emissiveIntensity: 1.8, roughness: .2 } )
	);
	node.position.set( Math.cos( ang ) * 2.35, 0, Math.sin( ang ) * 2.35 );
	floorBeacons.add( node );

}

const pillarGeo = new THREE.CylinderGeometry( .065, .085, 5.2, 14 );
const pillarMat = new THREE.MeshStandardMaterial( { color: 0x1c172b, roughness: .35, metalness: .82 } );
for ( const [ i, x, z ] of [ [ 1, - 2.65, - 2.3 ], [ 2, 2.65, - 2.3 ], [ 3, - 3.6, 1.5 ], [ 4, 3.6, 1.5 ] ] ) {

	const col = serpentine.add( new THREE.Mesh( pillarGeo, pillarMat ), 'Stage column ' + i );
	col.position.set( x, 1.2, z );

}

const halo = serpentine.add( new THREE.Group(), 'Stage halo' );
halo.position.set( 0, .28, 0 );
const ringSpecs = [
	[ 'Halo ring 1', 1.78, .016, 0xff62b8, 0xff4fa3, 1.3, [ .18, .1, 0 ], 0x3ce8ff, true ],
	[ 'Halo ring 2', 1.52, .014, 0xff94cc, 0xff66b2, 1.15, [ - .22, .25, .4 ], 0xffaa44, true ],
	[ 'Halo ring 3', 1.98, .013, 0xd185ff, 0xa855ff, 1.25, [ .34, - .2, .9 ], 0xff55aa, false ],
	[ 'Halo ring 4', 2.22, .011, 0xffa47a, 0xff7744, .95, [ - .14, - .18, 1.4 ], 0x77ddff, false ]
];
for ( const [ rName, rRadius, rTube, rColor, rEmissive, rEmissiveInt, rRot, orbColor, withLight ] of ringSpecs ) {

	const ring = new THREE.Mesh(
		new THREE.TorusGeometry( rRadius, rTube, 14, 96 ),
		new THREE.MeshStandardMaterial( { color: rColor, emissive: rEmissive, emissiveIntensity: rEmissiveInt, roughness: .25 } )
	);
	ring.name = rName;
	ring.rotation.set( ...rRot );
	const orb = new THREE.Mesh(
		new THREE.SphereGeometry( .055, 12, 10 ),
		new THREE.MeshStandardMaterial( { color: orbColor, emissive: orbColor, emissiveIntensity: 2.4, roughness: .15 } )
	);
	orb.position.set( rRadius, 0, 0 );
	if ( withLight ) {

		const orbLight = new THREE.PointLight( orbColor, 4.5, 6.5, 1.4 );
		orb.add( orbLight );

	}
	ring.add( orb );
	halo.add( ring );

}

const keySpot = serpentine.add( new THREE.SpotLight( 0xffe4f3, 28, 18, .58, .88, 1.5 ), 'Key spotlight' );
keySpot.position.set( 0, 3.8, 3.2 );
keySpot.target.position.set( 0, .2, 0 );
serpentine.add( keySpot.target, 'Key target' );
const rimLight = serpentine.add( new THREE.PointLight( 0xff4fa3, 6, 14, 1.4 ), 'Rim light' );
rimLight.position.set( 0, .6, - .8 );
const underLight = serpentine.add( new THREE.PointLight( 0xff9640, 5.5, 9, 1.4 ), 'Understage uplight' );
underLight.position.set( 0, - 1.12, .15 );
const cyanFill = serpentine.add( new THREE.PointLight( 0x3ce8ff, 4.2, 12, 1.4 ), 'Cyan accent light' );
cyanFill.position.set( - 3.1, 1.2, .8 );
const floorLightGroup = serpentine.add( new THREE.Group(), 'Floor sweep lights' );
for ( const [ i, color, x, z ] of [ [ 1, 0xff5eb3, 2.1, 0 ], [ 2, 0x3ce8ff, - 1.1, 1.9 ], [ 3, 0xffa64d, - 1.1, - 1.9 ] ] ) {

	const fl = new THREE.PointLight( color, 5.5, 7.5, 1.4 );
	fl.name = 'Floor light ' + i;
	fl.position.set( x, - 1.08, z );
	floorLightGroup.add( fl );

}
serpentine.add( new THREE.HemisphereLight( 0x453272, 0x0b0712, .95 ), 'Stage fill' );

const hazeGroup = serpentine.add( new THREE.Group(), 'Volumetric haze' );
for ( const [ i, z, scale, color ] of [ [ 1, - .9, 5.2, 0x7b3a8a ], [ 2, .35, 4.4, 0x315a8a ], [ 3, 1.9, 5.8, 0x8a3d5a ] ] ) {

	const layer = new THREE.Mesh(
		new THREE.PlaneGeometry( scale, scale * .65 ),
		new THREE.MeshBasicMaterial( { color, transparent: true, opacity: .07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide } )
	);
	layer.name = 'Haze layer ' + i;
	layer.position.set( ( i - 2 ) * .5, .15, z );
	hazeGroup.add( layer );

}

const roundVertex = `
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
varying float vBokeh;
uniform float uSize;
uniform float uFocus;
void main() {
 vColor = color;
 vec4 mv = modelViewMatrix * vec4(position, 1.0);
 float dist = -mv.z;
 vBokeh = clamp(abs(dist - uFocus) * 0.16, 0.0, 0.85);
 vAlpha = aAlpha * (1.0 - vBokeh * 0.45);
 gl_PointSize = clamp(aSize * uSize * (1.0 + vBokeh * 1.4) * (340.0 / max(dist, 0.4)), 2.0, 72.0);
 gl_Position = projectionMatrix * mv;
}`;
const roundFragment = `
varying vec3 vColor;
varying float vAlpha;
varying float vBokeh;
void main() {
 vec2 uv = gl_PointCoord - 0.5;
 float r2 = dot(uv, uv) * 4.0;
 if (r2 > 1.0) discard;
 float sharp = exp(-r2 * 7.2) + 0.42 * exp(-r2 * 2.1);
 float soft = smoothstep(1.0, 0.12, r2) * 0.72;
 float glow = mix(sharp, soft, vBokeh);
 gl_FragColor = vec4(vColor * (1.0 + glow * 0.55), glow * vAlpha);
}`;

function makeRoundMaterial( size = 1.0, focus = 5.7 ) {

	return new THREE.ShaderMaterial( {
		vertexShader: roundVertex,
		fragmentShader: roundFragment,
		uniforms: { uSize: { value: size }, uFocus: { value: focus } },
		vertexColors: true,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false
	} );

}

const COUNT = 4800;
const pPos = new Float32Array( COUNT * 3 );
const pCol = new Float32Array( COUNT * 3 );
const pSize = new Float32Array( COUNT );
const pAlpha = new Float32Array( COUNT );
for ( let i = 0; i < COUNT; i ++ ) {

	const a = i * 0.13 + ( i % 11 ) * 0.09, r = 0.88 + ( ( i * 37 ) % 1000 ) / 1000 * 1.95;
	pPos[ i * 3 ] = Math.cos( a ) * r;
	pPos[ i * 3 + 1 ] = - 1.33 + ( ( i * 19 ) % 100 ) / 100 * 0.42;
	pPos[ i * 3 + 2 ] = Math.sin( a ) * r * 0.85;
	pCol[ i * 3 ] = 0.96;
	pCol[ i * 3 + 1 ] = 0.45 + 0.35 * Math.sin( i * 0.05 );
	pCol[ i * 3 + 2 ] = 0.78;
	pSize[ i ] = 0.55 + ( i % 7 ) * 0.15;
	pAlpha[ i ] = 0.75;

}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute( 'position', new THREE.BufferAttribute( pPos, 3 ) );
pGeo.setAttribute( 'color', new THREE.BufferAttribute( pCol, 3 ) );
pGeo.setAttribute( 'aSize', new THREE.BufferAttribute( pSize, 1 ) );
pGeo.setAttribute( 'aAlpha', new THREE.BufferAttribute( pAlpha, 1 ) );
const particles = serpentine.add( new THREE.Points( pGeo, makeRoundMaterial( .19, 5.7 ) ), 'Serpentine particles' );
particles.frustumCulled = false;

const DUST = 420;
const dPos = new Float32Array( DUST * 3 ), dCol = new Float32Array( DUST * 3 ), dSize = new Float32Array( DUST ), dAlpha = new Float32Array( DUST );
for ( let i = 0; i < DUST; i ++ ) {

	dPos[ i * 3 ] = ( ( ( i * 73 ) % 100 ) / 100 - 0.5 ) * 7.5;
	dPos[ i * 3 + 1 ] = ( ( ( i * 41 ) % 100 ) / 100 ) * 3.8 - 1.2;
	dPos[ i * 3 + 2 ] = ( ( ( i * 29 ) % 100 ) / 100 - 0.5 ) * 6.5;
	dCol[ i * 3 ] = 0.75 + 0.25 * ( i % 2 );
	dCol[ i * 3 + 1 ] = 0.65;
	dCol[ i * 3 + 2 ] = 0.95;
	dSize[ i ] = 0.35 + ( i % 5 ) * 0.14;
	dAlpha[ i ] = 0.32;

}
const dGeo = new THREE.BufferGeometry();
dGeo.setAttribute( 'position', new THREE.BufferAttribute( dPos, 3 ) );
dGeo.setAttribute( 'color', new THREE.BufferAttribute( dCol, 3 ) );
dGeo.setAttribute( 'aSize', new THREE.BufferAttribute( dSize, 1 ) );
dGeo.setAttribute( 'aAlpha', new THREE.BufferAttribute( dAlpha, 1 ) );
const dust = serpentine.add( new THREE.Points( dGeo, makeRoundMaterial( .07, 5.7 ) ), 'Stage dust' );
dust.frustumCulled = false;

serpentine.attach( particles, 'Serpentine particle driver', `
// Motion energy & color from Danse serpentine drive round glowing particles, multi-light stage, haze, bloom, focus, and burst events.
// @param playing = true
// @label playing = "Playing"
// @param videoSource = "video"
// @options videoSource = ["video", "webcam"]
// @label videoSource = "Video source"
// @param ringPattern = "wave"
// @options ringPattern = ["wave", "alternate", "chase", "breathe", "oppose"]
// @label ringPattern = "Ring pattern"
// @param ringFadeSpeed = 0.65 (0..4)
// @label ringFadeSpeed = "Ring fade speed"
// @slider ringFadeSpeed
// @param ringSpinSpeed = 0.45 (0..3)
// @label ringSpinSpeed = "Ring spin"
// @slider ringSpinSpeed
// @param ringBrightness = 2.4 (0.2..5)
// @label ringBrightness = "Ring brightness"
// @slider ringBrightness
// @param swirl = 1.4 (0..4)
// @label swirl = "Swirl"
// @slider swirl
// @param turbulence = 0.8 (0..3)
// @label turbulence = "Turbulence"
// @slider turbulence
// @param particleAmount = 0.7 (0..1)
// @label particleAmount = "Particle amount"
// @slider particleAmount
// @param particleScale = 1.0 (0.25..2.5)
// @label particleScale = "Particle scale"
// @slider particleScale
// @param particleSize = 0.19 (0.02..0.5)
// @label particleSize = "Particle size"
// @slider particleSize
// @param lightSpeed = 0.45 (0..3)
// @label lightSpeed = "Light speed"
// @slider lightSpeed
// @param lightMovement = 1.0 (0..3)
// @label lightMovement = "Light movement"
// @slider lightMovement
// @param burstForce = 1.35 (0..3)
// @label burstForce = "Burst force"
// @slider burstForce
const VIDEO_URL = 'https://languel.github.io/mediatheque/items/danse-serpentine-lumiere-1897/clips/01.webm';
const GW = 24, GH = 18;
let video, camVideo, camStream, camReq = 0, curSourceMode = 'video', aCanvas, aCtx, sCanvas, sCtx, sTex, prevLuma, vel, life, spots = [], bezelJewels = [], unsub, burstPulse = 0, smoothEnergy = 0.08, ringBoost = 0, noiseTime = 0, lightPhase = 0, floorSpin = 0, ringPhase = 0, runTime = 0, lastT = 0;

function stopWebcam() {
 camReq++;
 if (camStream) { camStream.getTracks().forEach(tr => tr.stop()); camStream = null; }
 if (camVideo) { camVideo.pause(); camVideo.srcObject = null; camVideo = null; }
}

function syncVideoSource(mode, isPlaying) {
 const nextMode = mode === 'webcam' ? 'webcam' : 'video';
 if (nextMode === 'webcam') {
  if (video && !video.paused) video.pause();
  if (!camStream && !camVideo && navigator.mediaDevices?.getUserMedia) {
   const reqId = ++camReq;
   navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then(stream => {
    if (reqId !== camReq || curSourceMode !== 'webcam') { stream.getTracks().forEach(tr => tr.stop()); return; }
    camStream = stream;
    camVideo = document.createElement('video');
    camVideo.muted = true; camVideo.playsInline = true; camVideo.srcObject = stream;
    if (isPlaying) camVideo.play().catch(() => {});
   }).catch(() => {});
  } else if (camVideo) {
   if (isPlaying && camVideo.paused) camVideo.play().catch(() => {}); else if (!isPlaying && !camVideo.paused) camVideo.pause();
  }
 } else {
  stopWebcam();
  if (video) {
   if (isPlaying && video.paused) video.play().catch(() => {}); else if (!isPlaying && !video.paused) video.pause();
  }
 }
 curSourceMode = nextMode;
}

function applyParticleSettings(obj, p) {
 if (obj.material.uniforms?.uSize) obj.material.uniforms.uSize.value = p.particleSize;
 const sc = Math.max(0.05, Number(p.particleScale) || 1);
 obj.scale.setScalar(sc);
 const amt = Math.max(0, Math.min(1, Number(p.particleAmount ?? 1)));
 const maxN = obj.geometry.attributes.position.count;
 const activeN = Math.round(maxN * amt);
 obj.geometry.setDrawRange(0, activeN);
 const dustMesh = scene.getObjectByName('Stage dust');
 if (dustMesh) {
  dustMesh.scale.setScalar(sc);
  dustMesh.geometry.setDrawRange(0, Math.round(dustMesh.geometry.attributes.position.count * amt));
 }
 return activeN;
}

function makeHazeTexture() {
 const c = document.createElement('canvas'); c.width = 128; c.height = 128;
 const g = c.getContext('2d');
 const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
 grad.addColorStop(0, 'rgba(255,255,255,1)');
 grad.addColorStop(0.45, 'rgba(255,255,255,0.42)');
 grad.addColorStop(1, 'rgba(255,255,255,0)');
 g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
 const tex = new THREE.CanvasTexture(c);
 tex.colorSpace = THREE.SRGBColorSpace;
 return tex;
}

function init() {
 const n = this.geometry.attributes.position.count;
 vel = new Float32Array(n * 3);
 life = new Float32Array(n);
 for (let i = 0; i < n; i++) life[i] = 0.25 + Math.random() * 1.45;
 aCanvas = document.createElement('canvas'); aCanvas.width = GW; aCanvas.height = GH;
 aCtx = aCanvas.getContext('2d', { willReadFrequently: true });
 prevLuma = new Float32Array(GW * GH);

 video = document.createElement('video');
 video.crossOrigin = 'anonymous'; video.muted = true; video.loop = true; video.playsInline = true;
 video.src = VIDEO_URL;

 const scr = scene.getObjectByName('Serpentine screen');
 if (scr) {
  sCanvas = document.createElement('canvas'); sCanvas.width = 256; sCanvas.height = 256;
  sCtx = sCanvas.getContext('2d');
  sTex = new THREE.CanvasTexture(sCanvas); sTex.colorSpace = THREE.SRGBColorSpace;
  scr.material.map?.dispose(); scr.material.map = sTex; scr.material.needsUpdate = true;
 }

 const disk = scene.getObjectByName('Orrery bezel disk');
 bezelJewels = [];
 if (disk) {
  for (const child of disk.children) {
   if (!child.name?.startsWith('Bezel jewel ') || !child.material) continue;
   const c = child.material.color;
   bezelJewels.push({ mesh: child, r: c.r, g: c.g, b: c.b, intensity: child.material.emissiveIntensity });
  }
 }

 syncVideoSource(params.videoSource, params.playing);

 const haze = scene.getObjectByName('Volumetric haze');
 if (haze) {
  const hTex = makeHazeTexture();
  for (const layer of haze.children) { layer.material.map = hTex; layer.material.needsUpdate = true; }
 }

 unsub = player.streams.on('burst', () => {
  burstPulse = params.burstForce;
  ringBoost = Math.min(2.2, ringBoost + 0.9);
  const pos = this.geometry.attributes.position.array;
  for (let i = 0; i < vel.length; i += 3) {
   const len = Math.hypot(pos[i], pos[i + 1], pos[i + 2]) || 1;
   vel[i] += (pos[i] / len) * burstPulse * 0.7;
   vel[i + 1] += (pos[i + 1] / len) * burstPulse * 0.7;
   vel[i + 2] += (pos[i + 2] / len) * burstPulse * 0.55;
  }
 });
 applyParticleSettings(this, params);
}

function setParameters(next) {
 syncVideoSource(next.videoSource, next.playing);
 applyParticleSettings(this, next);
}

function update(event) {
 const dt = Math.min((event.time - (lastT || event.time)) / 1000 || 0.016, 0.05);
 lastT = event.time;
 if (!params.playing) return;
 runTime += dt;
 const activeN = applyParticleSettings(this, params);
 if (params.videoSource !== curSourceMode) syncVideoSource(params.videoSource, params.playing);
 const focusDist = scene.userData.postprocessing?.focus ?? 5.7;
 if (this.material.uniforms?.uFocus) this.material.uniforms.uFocus.value = focusDist;
 burstPulse *= Math.max(0, 1 - dt * 2.8);

 const bus = player.streams;
 const ext = bus.get('video.frame');
 const hasCam = curSourceMode === 'webcam' && camVideo && camVideo.readyState >= 2 && camVideo.videoWidth;
 const hasClip = video && video.readyState >= 2 && video.videoWidth;
 const src = hasCam ? camVideo : (ext || (curSourceMode === 'video' && hasClip ? video : null));
 const mirrorSrc = hasCam;
 const t = event.time / 1000;
 ringBoost *= Math.max(0, 1 - dt * 1.6);

 const haze = scene.getObjectByName('Volumetric haze');
 if (haze) haze.children.forEach((layer, i) => {
  layer.position.x = Math.sin(t * 0.25 + i * 2.1) * 0.85;
  layer.rotation.z = t * 0.04 * (i % 2 ? 1 : -1);
 });
 const dustMesh = scene.getObjectByName('Stage dust');
 if (dustMesh) {
  if (dustMesh.material.uniforms?.uFocus) dustMesh.material.uniforms.uFocus.value = focusDist;
  const dp = dustMesh.geometry.attributes.position.array;
  for (let i = 0; i < dp.length; i += 3) {
   dp[i + 1] += dt * 0.09;
   dp[i] += Math.sin(t * 0.6 + i) * dt * 0.06;
   if (dp[i + 1] > 2.6) dp[i + 1] = -1.2;
  }
  dustMesh.geometry.attributes.position.needsUpdate = true;
 }

 if (src) {
  if (sCtx && sTex) {
   const vw = src.videoWidth || src.width || 256, vh = src.videoHeight || src.height || 256;
   const side = Math.min(vw, vh), sx = (vw - side) * 0.5, sy = (vh - side) * 0.5;
   sCtx.save();
   if (mirrorSrc) { sCtx.translate(sCanvas.width, 0); sCtx.scale(-1, 1); }
   sCtx.drawImage(src, sx, sy, side, side, 0, 0, sCanvas.width, sCanvas.height);
   sCtx.restore();
   sTex.needsUpdate = true;
  }
  aCtx.save();
  if (mirrorSrc) { aCtx.translate(GW, 0); aCtx.scale(-1, 1); }
  aCtx.drawImage(src, 0, 0, GW, GH);
  aCtx.restore();
  const data = aCtx.getImageData(0, 0, GW, GH).data;
  let energySum = 0, weightSum = 0, cx = 0, cy = 0, rSum = 0, gSum = 0, bSum = 0;
  spots.length = 0;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
   const idx = y * GW + x, o = idx * 4;
   const r = data[o] / 255, g = data[o + 1] / 255, b = data[o + 2] / 255;
   const luma = 0.21 * r + 0.72 * g + 0.07 * b;
   const diff = Math.abs(luma - prevLuma[idx]);
   prevLuma[idx] = luma;
   energySum += diff;
   const w = diff * 3 + Math.max(0, luma - 0.32) * 0.28;
   if (w > 0.04) {
    weightSum += w; cx += (x / (GW - 1)) * w; cy += (1 - y / (GH - 1)) * w;
    rSum += r * w; gSum += g * w; bSum += b * w;
    if (spots.length < 180) spots.push([ (x / (GW - 1) - 0.5) * 3.2, (0.5 - y / (GH - 1)) * 2.4, r, g, b ]);
   }
  }
  const energy = energySum / (GW * GH);
  smoothEnergy += (energy - smoothEnergy) * Math.min(1, dt * 4.5);
  bus.publish('serpentine.energy', energy);
  if (weightSum > 0) {
   bus.publish('serpentine.cx', cx / weightSum);
   bus.publish('serpentine.cy', cy / weightSum);
   const nr = rSum / weightSum, ng = gSum / weightSum, nb = bSum / weightSum;
   const mx = Math.max(nr, ng, nb), mn = Math.min(nr, ng, nb), d = mx - mn || 1;
   let hue = 0;
   if (mx === nr) hue = ((ng - nb) / d + (ng < nb ? 6 : 0)) / 6;
   else if (mx === ng) hue = ((nb - nr) / d + 2) / 6;
   else hue = ((nr - ng) / d + 4) / 6;
   bus.publish('serpentine.hue', hue);
  }
 } else {
  const e = 0.12 + 0.11 * Math.sin(t * 2.1);
  smoothEnergy += (e - smoothEnergy) * Math.min(1, dt * 4.5);
  bus.publish('demo.serpentine.energy', e);
  bus.publish('demo.serpentine.cx', 0.5 + 0.35 * Math.sin(t * 1.4));
  bus.publish('demo.serpentine.hue', (t * 0.12) % 1);
 }

 const lSpeed = Math.max(0, Number(params.lightSpeed) || 0);
 const lMove = Math.max(0, Number(params.lightMovement) || 0);
 lightPhase += dt * (0.45 + smoothEnergy * 1.2) * lSpeed;
 floorSpin += dt * (0.38 + smoothEnergy * 1.1) * lSpeed;

 const haloGroup = scene.getObjectByName('Stage halo');
 if (haloGroup) {
  const motion = (smoothEnergy * 4.2 + ringBoost * 0.55) * lMove;
  haloGroup.children.forEach((ring, i) => {
   const dir = i % 2 === 0 ? 1 : -1;
   const speed = (0.18 + i * 0.11) * (0.35 + motion) * lSpeed;
   ring.rotation.z += dir * speed * dt;
   ring.rotation.x += Math.sin(lightPhase * (0.65 + i * 0.22)) * speed * 0.28 * lMove * dt;
   ring.rotation.y += Math.cos(lightPhase * (0.58 + i * 0.18)) * speed * 0.24 * lMove * dt;
  });
 }
 const disk = scene.getObjectByName('Orrery bezel disk');
 if (disk) {
  const rSpin = Math.max(0, Number(params.ringSpinSpeed) || 0);
  const rFade = Math.max(0, Number(params.ringFadeSpeed) || 0);
  const rBright = Math.max(0, Number(params.ringBrightness) || 0);
  disk.rotation.z += dt * (0.14 + smoothEnergy * 0.5) * rSpin;
  ringPhase += dt * rFade * (0.85 + smoothEnergy * 2.1);
  const pat = params.ringPattern || 'wave';
  const bCount = bezelJewels.length || 24;
  let pulseSum = 0;
  for (let i = 0; i < bezelJewels.length; i++) {
   const j = bezelJewels[i];
   const th = (i / bCount) * 6.283185;
   let level = 0.5;
   if (pat === 'alternate') level = 0.5 + 0.5 * Math.sin(ringPhase * 2.0 + (i % 2) * Math.PI);
   else if (pat === 'chase') level = Math.pow(0.5 + 0.5 * Math.cos(th * 2 - ringPhase * 1.9), 2.8);
   else if (pat === 'breathe') level = 0.5 + 0.5 * Math.sin(ringPhase * 1.35 - (i % 3) * 0.65);
   else if (pat === 'oppose') level = 0.5 + 0.25 * Math.cos(th * 2 - ringPhase * 1.5) + 0.25 * Math.cos(th * 4 + ringPhase * 1.2);
   else level = Math.pow(0.5 + 0.5 * Math.cos(th * 3 - ringPhase * 1.45), 1.4);
   pulseSum += level;
   const lift = 1 + smoothEnergy * 1.45;
   j.mesh.material.emissiveIntensity = rBright * (0.02 + 0.98 * level) * lift;
   const cScale = 0.14 + 0.86 * level;
   j.mesh.material.color.setRGB(j.r * cScale, j.g * cScale, j.b * cScale);
   j.mesh.scale.setScalar(0.72 + 0.38 * level);
  }
  const avgPulse = bCount ? pulseSum / bCount : 0.5;
  const innerRim = disk.getObjectByName('Bezel inner rim');
  if (innerRim) innerRim.material.emissiveIntensity = (0.55 + 0.7 * avgPulse + smoothEnergy * 1.2) * (rBright / 2.4);
  const outerRim = disk.getObjectByName('Bezel outer rim');
  if (outerRim) outerRim.material.emissiveIntensity = (0.45 + 0.6 * (1 - avgPulse) + smoothEnergy * 1.1) * (rBright / 2.4);
 }
 const floorLights = scene.getObjectByName('Floor sweep lights');
 if (floorLights) {
  floorLights.children.forEach((fl, i) => {
   const ang = floorSpin + i * 2.0944;
   const rad = 1.9 + 0.55 * lMove * Math.sin(lightPhase * 0.85 + i * 1.7);
   fl.position.x = Math.cos(ang) * rad;
   fl.position.z = Math.sin(ang) * rad;
   fl.intensity = 4.2 + smoothEnergy * 24 + Math.sin(lightPhase * 2.6 + i * 2.1) * 1.6 * lMove;
  });
 }
 const beacons = scene.getObjectByName('Floor beacons');
 if (beacons) {
  beacons.children.forEach((node, i) => {
   node.material.emissiveIntensity = 1.1 + smoothEnergy * 5.0 + 0.65 * lMove * Math.sin(lightPhase * 3.1 + i * 0.52);
  });
 }
 const rim = scene.getObjectByName('Rim light');
 if (rim) {
  // Smooth organic vibration of the rose rim light coupled to motion energy.
  const amp = (0.08 + smoothEnergy * 0.9) * lMove;
  rim.position.x = Math.sin(lightPhase * 2.2) * amp * 0.55;
  rim.position.y = 0.6 + Math.cos(lightPhase * 1.7) * amp * 0.35;
  rim.intensity = 4.5 + smoothEnergy * 34 + Math.sin(lightPhase * 3.2) * (0.6 + smoothEnergy * 4.5) * lMove;
 }

 const posAttr = this.geometry.attributes.position;
 const colAttr = this.geometry.attributes.color;
 const alphaAttr = this.geometry.attributes.aAlpha;
 const pos = posAttr.array, col = colAttr.array, alpha = alphaAttr.array;
 const swirl = params.swirl, turb = params.turbulence;
 // Agitate 3D divergence-free curl noise time & amplitude with smoothed movement energy.
 const agitation = 0.65 + smoothEnergy * 4.2 + burstPulse * 0.9;
 noiseTime += dt * (0.45 + smoothEnergy * 5.0 + burstPulse * 1.2);
 const nt = noiseTime;
 const curlAmp = turb * agitation * 1.35;
 const groundLift = Math.min(1, runTime / 2.4);
 const ringCy = 0.28;

 for (let i = 0; i < activeN; i++) {
  const k = i * 3;
  life[i] -= dt * (0.32 + turb * 0.16);
  if (life[i] <= 0) {
   life[i] = 0.85 + Math.random() * 1.15;
   const theta = Math.random() * 6.283;
   const isSpill = Math.random() < 0.12;
   const spawnR = isSpill ? 0.62 + Math.random() * 0.58 : 1.26 + Math.random() * 0.96;
   let ang = t * 1.3 + theta;
   if (spots.length) {
    const s = spots[Math.floor(Math.random() * spots.length)];
    ang = Math.atan2(s[1], s[0]) + (Math.random() - 0.5) * 0.68;
    col[k] = Math.min(1, s[2] * 1.35 + 0.18);
    col[k + 1] = Math.min(1, s[3] * 1.2 + 0.1);
    col[k + 2] = Math.min(1, s[4] * 1.35 + 0.22);
   } else {
    col[k] = 0.96; col[k + 1] = 0.42 + Math.random() * 0.45; col[k + 2] = 0.72 + Math.random() * 0.25;
   }
   if (groundLift < 0.35 && Math.random() > groundLift * 2.5) {
    const gr = 1.05 + Math.random() * 1.55;
    pos[k] = Math.cos(ang) * gr;
    pos[k + 1] = -1.32 + Math.random() * 0.28;
    pos[k + 2] = Math.sin(theta) * gr * 0.7;
   } else {
    pos[k] = Math.cos(ang) * spawnR;
    pos[k + 1] = ringCy + Math.sin(ang) * spawnR * (isSpill ? 0.9 : 0.88);
    pos[k + 2] = Math.sin(theta) * (isSpill ? 0.35 : 0.68) - 0.08;
   }
   const tx = -Math.sin(ang), ty = Math.cos(ang);
   const tangSpeed = (0.35 + Math.random() * 0.45) * (0.4 + swirl * 0.3);
   vel[k] = tx * tangSpeed + (Math.random() - 0.5) * 0.25;
   vel[k + 1] = ty * tangSpeed + (runTime < 2.2 ? 0.32 : (Math.random() - 0.5) * 0.25);
   vel[k + 2] = (Math.random() - 0.5) * 0.55;
   alpha[i] = 0.88;
  } else {
   const x = pos[k], y = pos[k + 1], z = pos[k + 2];
   // Exact analytical 3D curl(P) = (dPz/dy - dPy/dz, dPx/dz - dPz/dx, dPy/dx - dPx/dy).
   const dPx_dy = 1.3 * Math.cos(1.3 * y + 0.7 * nt) * Math.cos(1.1 * z - 0.5 * nt) - 0.95 * Math.cos(2.4 * z - 1.9 * y + 1.1 * nt);
   const dPx_dz = -1.1 * Math.sin(1.3 * y + 0.7 * nt) * Math.sin(1.1 * z - 0.5 * nt) + 1.2 * Math.cos(2.4 * z - 1.9 * y + 1.1 * nt);
   const dPy_dz = 1.2 * Math.cos(1.2 * z + 0.6 * nt) * Math.cos(1.3 * x + 0.4 * nt) + 1.05 * Math.cos(2.3 * x + 2.1 * z - 0.9 * nt);
   const dPy_dx = -1.3 * Math.sin(1.2 * z + 0.6 * nt) * Math.sin(1.3 * x + 0.4 * nt) + 1.15 * Math.cos(2.3 * x + 2.1 * z - 0.9 * nt);
   const dPz_dx = 1.1 * Math.cos(1.1 * x - 0.8 * nt) * Math.cos(1.4 * y + 0.6 * nt) - 1.0 * Math.cos(2.5 * y - 2.0 * x + 1.2 * nt);
   const dPz_dy = -1.4 * Math.sin(1.1 * x - 0.8 * nt) * Math.sin(1.4 * y + 0.6 * nt) + 1.25 * Math.cos(2.5 * y - 2.0 * x + 1.2 * nt);

   const cx = dPz_dy - dPy_dz;
   const cy = dPx_dz - dPz_dx;
   const cz = dPy_dx - dPx_dy;

   // Swirl particles primarily in a 3D halo framing the circular screen around (0, 0.28), keeping the center clear except occasional spill.
   const dx = x, dy = y - ringCy;
   const rXY = Math.hypot(dx, dy) || 0.001;
   const nx = dx / rXY, ny = dy / rXY;
   const targetR = 1.56 + 0.28 * Math.sin(i * 0.37 + nt * 0.55);
   const ringPull = (targetR - rXY) * (0.9 + 0.5 * groundLift);
   const screenRepel = (rXY < 1.12 && z > -0.28 && (i % 8 !== 0)) ? (1.12 - rXY) * 4.2 : 0;
   const radialF = ringPull + screenRepel;
   const swirlXY = swirl * 0.72 * (0.45 + 0.55 * groundLift);
   const liftDraft = (runTime < 3.0) ? (ringCy - y) * 0.45 * groundLift : 0;

   vel[k] += (cx * curlAmp * 0.85 - ny * swirlXY + nx * radialF) * dt;
   vel[k + 1] += (cy * curlAmp * 0.85 + nx * swirlXY + ny * radialF + liftDraft) * dt;
   vel[k + 2] += (cz * curlAmp * 0.85 - z * 0.55 - z * swirl * 0.15) * dt;
   const damp = Math.max(0, 1 - dt * 1.55);
   vel[k] *= damp; vel[k + 1] *= damp; vel[k + 2] *= damp;
   pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
   alpha[i] = Math.min(1, life[i] * 1.1);
  }
 }
 posAttr.needsUpdate = colAttr.needsUpdate = alphaAttr.needsUpdate = true;
}

function stop() {
 unsub?.();
 stopWebcam();
 for (const j of bezelJewels) {
  j.mesh.material.emissiveIntensity = j.intensity;
  j.mesh.material.color.setRGB(j.r, j.g, j.b);
  j.mesh.scale.setScalar(1);
 }
 if (video) { video.pause(); video.removeAttribute('src'); video.load(); video = null; }
}
`, { favoriteParams: [ 'videoSource', 'ringPattern', 'ringFadeSpeed', 'ringSpinSpeed', 'ringBrightness', 'lightSpeed', 'lightMovement', 'particleAmount', 'particleScale', 'particleSize', 'swirl', 'turbulence' ] } );

serpentine.scene.userData.streamRoutes = [
	{ source: 'serpentine.energy', fallback: 'demo.serpentine.energy', input: [ 0, .3 ], output: [ .35, 2.6 ], curve: 'smoothstep', smooth: .75, target: { kind: 'param', uuid: particles.uuid, scriptIndex: 0, param: 'turbulence' } },
	{ source: 'serpentine.cx', fallback: 'demo.serpentine.cx', input: [ 0, 1 ], output: [ - 2.6, 2.6 ], smooth: .88, target: { kind: 'object', uuid: keySpot.uuid, property: 'position.x' } },
	{ source: 'serpentine.hue', fallback: 'demo.serpentine.hue', input: [ 0, 1 ], output: [ 0, 1 ], smooth: .9, target: { kind: 'object', uuid: rimLight.uuid, property: 'color.hue' } },
	{ source: 'serpentine.energy', fallback: 'demo.serpentine.energy', input: [ 0, .3 ], output: [ 2.5, 9 ], smooth: .85, target: { kind: 'object', uuid: underLight.uuid, property: 'intensity' } },
	{ source: 'serpentine.energy', fallback: 'demo.serpentine.energy', input: [ 0, .3 ], output: [ .94, 1.18 ], curve: 'smoothstep', smooth: .88, target: { kind: 'object', uuid: halo.uuid, property: 'scale' } },
	{ source: 'serpentine.energy', fallback: 'demo.serpentine.energy', input: [ 0, .3 ], output: [ .55, 1.05 ], curve: 'smoothstep', smooth: .84, target: { kind: 'scene', property: 'postprocessing.bloomStrength' } }
];
serpentine.scene.userData.streamEvents = [
	{ source: 'serpentine.energy', fallback: 'demo.serpentine.energy', trigger: 'rising', threshold: .15, cooldown: 550, action: { kind: 'emit', name: 'burst', value: 1 } }
];
await serpentine.save( 'serpentine-particles' );
await serpentine.save( 'serpentine-particles', new URL( '../editor/examples/lessons/', import.meta.url ) );
