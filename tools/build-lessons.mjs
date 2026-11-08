import * as THREE from '../build/three.module.js';
import { readFile, writeFile } from 'node:fs/promises';
import { Body, JOINTS } from './lesson-sources/body.js';
import { Costume, COSTUMES } from './lesson-sources/costume.js';
import { Painter } from './lesson-sources/paint.js';

// Native, editable scene adaptations of languel/threejslessons. The supplied
// recording replaces live tracking, so these projects need no camera or models.
const recording = JSON.parse( await readFile( new URL( './lesson-sources/discus-recording.json', import.meta.url ) ) );
const frames = recording.frames;
const output = new URL( '../editor/examples/lessons/', import.meta.url );
const projectSettings = { renderer: 'WebGLRenderer', shadows: true, shadowType: 1, toneMapping: 7, toneMappingExposure: 1, cameraController: 'orbit' };
const mixerScript = `// @param playbackSpeed = 1 (0.1..3)
let mixer;
function init() {
 mixer = new THREE.AnimationMixer(this);
 mixer.clipAction(this.animations[0]).play();
}
function update(event) { mixer.update(event.delta / 1000 * params.playbackSpeed); }
`;

function room( title, source, description, cameraPosition = [ 3.2, 1.8, 5.5 ] ) {

	const scene = new THREE.Scene();
	scene.name = title;
	scene.background = new THREE.Color( 0xe9e5da );
	scene.userData.lesson = { title, source: 'https://github.com/languel/threejslessons/blob/main/' + source, description,
		instructions: 'Use the director camera to explore. Select objects to inspect geometry and materials. Open Script → Edit to change behavior or parameters. Alt/Option+P plays the lesson.' };
	const camera = new THREE.PerspectiveCamera( 50, 1, 0.05, 100 );
	camera.name = 'Camera';
	camera.position.fromArray( cameraPosition );
	camera.lookAt( 0, 0, 0 );
	const floor = new THREE.Mesh( new THREE.PlaneGeometry( 20, 20 ), new THREE.MeshStandardMaterial( { color: 0xd1c9b8, roughness: 1 } ) );
	floor.name = 'Floor'; floor.rotation.x = - Math.PI / 2; floor.position.y = - 1.15; floor.receiveShadow = true;
	const sun = new THREE.DirectionalLight( 0xffead0, 2.5 );
	sun.name = 'Key light'; sun.position.set( 3, 6, 4 ); sun.castShadow = true;
	const sky = new THREE.HemisphereLight( 0xe8f4ff, 0x79715b, 2 ); sky.name = 'Fill light';
	scene.add( floor, sun, sky );
	return { scene, camera, scripts: {} };

}

async function save( filename, lesson ) {

	const { scene, camera, scripts } = lesson;
	scene.updateMatrixWorld( true );
	camera.updateMatrixWorld( true );
	const json = { metadata: {}, project: { ...projectSettings, title: scene.name }, camera: camera.toJSON(), viewportCamera: camera.uuid,
		viewportTarget: [ 0, 0, 0 ], controls: { center: [ 0, 0, 0 ] }, scene: scene.toJSON(), scripts, history: { undos: [], redos: [] }, backgroundType: 'Color', environmentType: 'None' };
	await writeFile( new URL( filename + '.app.json', output ), JSON.stringify( json ) + '\n' );
	console.log( filename + ': ' + scene.name );

}

// Bake actual source-module transforms into standard AnimationClips. Every
// part remains a normal editable mesh/group; no source classes are needed at runtime.
function bake( root, update ) {

	const nodes = [];
	root.traverse( node => { if ( node !== root ) nodes.push( node ); } );
	const tracks = nodes.map( node => ( { node, position: [], quaternion: [], scale: [] } ) );
	for ( const frame of frames ) {

		update( frame );
		for ( const track of tracks ) {

			const node = track.node;
			if ( ! node.matrixAutoUpdate ) node.matrix.decompose( node.position, node.quaternion, node.scale );
			track.position.push( ...node.position );
			track.quaternion.push( ...node.quaternion );
			track.scale.push( ...node.scale );

		}

	}
	const times = frames.map( frame => frame.t );
	root.animations = [ new THREE.AnimationClip( 'Recorded discus performance', - 1, tracks.flatMap( track => [
		new THREE.VectorKeyframeTrack( track.node.uuid + '.position', times, track.position ),
		new THREE.QuaternionKeyframeTrack( track.node.uuid + '.quaternion', times, track.quaternion ),
		new THREE.VectorKeyframeTrack( track.node.uuid + '.scale', times, track.scale )
	] ) ) ];
	update( frames[ 0 ] );
	root.traverse( node => {

		if ( ! node.matrixAutoUpdate ) node.matrix.decompose( node.position, node.quaternion, node.scale );
		node.matrixAutoUpdate = true;

	} );
	return root;

}

const cubeLesson = room( 'A spinning cube', 'cube.js', 'Scene, camera, mesh and renderer: the four parts of a three.js program.', [ 2, 1.5, 3 ] );
const cube = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshNormalMaterial() ); cube.name = 'Spinning cube'; cubeLesson.scene.add( cube );
cubeLesson.scripts[ cube.uuid ] = [ { name: 'Spin the cube', enabled: true, parameters: { xSpeed: 1, ySpeed: 0.6667 }, source: `// From threejslessons/cube.js. Speeds are radians per second.
// @param xSpeed = 1 (-3..3)
// @param ySpeed = 0.6667 (-3..3)
function update(event) { this.rotation.x += event.delta / 1000 * params.xSpeed; this.rotation.y += event.delta / 1000 * params.ySpeed; }
` } ];
await save( '00-cube', cubeLesson );

const anatomy = room( 'Anatomy of a scene', '01-anatomy.js', 'Compare geometry, materials, lights and a scene camera with its frustum.', [ 5.5, 4, 7 ] );
const group = new THREE.Group(); group.name = 'Meshes · geometry plus material'; anatomy.scene.add( group );
const materials = [ new THREE.MeshNormalMaterial(), new THREE.MeshStandardMaterial( { color: 0xf2b84b, roughness: .35, metalness: .1 } ), new THREE.MeshBasicMaterial( { color: 0x467b9a, wireframe: true } ) ];
const geometries = [ new THREE.BoxGeometry(), new THREE.SphereGeometry( .6, 24, 16 ), new THREE.TorusKnotGeometry( .45, .16, 64, 10 ) ];
for ( let i = 0; i < 3; i ++ ) { const mesh = new THREE.Mesh( geometries[ i ], materials[ i ] ); mesh.name = [ 'Normal cube', 'Lit sphere', 'Wireframe torus knot' ][ i ]; mesh.position.set( ( i - 1 ) * 1.8, 0, 0 ); mesh.castShadow = true; group.add( mesh ); }
const sceneCamera = new THREE.PerspectiveCamera( 50, 1.5, .5, 6 ); sceneCamera.name = 'Scene camera · no controller'; sceneCamera.position.set( 0, 1, 4 ); sceneCamera.lookAt( 0, 0, 0 ); anatomy.scene.add( sceneCamera );
await save( '01-anatomy', anatomy );

const body = new Body();
const bodyLesson = room( 'Recorded body landmarks', '02-body.js', 'The supplied McCracken discus recording: 33 joints and connecting bones, baked to a standard AnimationClip.' );
const skeleton = new THREE.Group(); skeleton.name = 'Recorded body';
const jointGeometry = new THREE.SphereGeometry( .035, 10, 6 );
const amber = new THREE.MeshStandardMaterial( { color: 0xe3a339, roughness: .5 } );
const joints = JOINTS.map( name => { const mesh = new THREE.Mesh( jointGeometry, amber ); mesh.name = name; skeleton.add( mesh ); return mesh; } );
const pairs = [ [11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32] ];
const bones = pairs.map( ( pair, i ) => { const mesh = new THREE.Mesh( new THREE.CylinderGeometry( .015, .015, 1, 8 ), amber ); mesh.name = 'Bone ' + i; skeleton.add( mesh ); return mesh; } );
bake( skeleton, frame => {

	body.update( frame ); joints.forEach( ( joint, i ) => joint.position.copy( body.w[ i ] ) );
	pairs.forEach( ( [ a, b ], i ) => { const delta = body.w[ b ].clone().sub( body.w[ a ] ); bones[ i ].position.copy( body.w[ a ] ).add( body.w[ b ] ).multiplyScalar( .5 ); bones[ i ].quaternion.setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), delta.clone().normalize() ); bones[ i ].scale.y = delta.length(); } );

} );
bodyLesson.scene.add( skeleton ); bodyLesson.scripts[ skeleton.uuid ] = [ { name: 'Replay body recording', enabled: true, source: mixerScript, parameters: { playbackSpeed: 1 } } ];
await save( '02-body', bodyLesson );

const triadic = room( 'Triadic costumes', '07-triadic.js', 'Actual disc, parasol and ball-pyramid costumes from the source Costume module, driven by its recorded Body measurements.', [ 4, 2, 7 ] );
for ( const [ i, preset ] of [ 'disc', 'fan', 'balls' ].entries() ) {

	const costume = new Costume( COSTUMES[ preset ].parts ); costume.name = COSTUMES[ preset ].label; costume.setPalette( [ 'yellow', 'pink', 'bauhaus' ][ i ] );
	bake( costume, frame => { body.update( frame ); costume.update( body ); } );
	costume.position.x = ( i - 1 ) * 1.8;
	triadic.scene.add( costume ); triadic.scripts[ costume.uuid ] = [ { name: 'Perform in costume', enabled: true, source: mixerScript, parameters: { playbackSpeed: 1 } } ];

}
await save( '03-triadic', triadic );

const painting = room( 'Paint marks in space', '09-ghost.js', 'The source Painter follows the recorded hands, head and feet. Each stroke is an editable three.js line, revealed over time.' );
const painter = new Painter();
const marks = [ [ 'right hand', 20 ], [ 'left hand', 19 ], [ 'head', 0 ], [ 'right foot', 32 ], [ 'left foot', 31 ] ];
for ( const frame of frames ) { body.update( frame ); for ( const [ name, index ] of marks ) painter.update( name, body.w[ index ], frame.t ); }
const strokes = new THREE.Group(); strokes.name = 'Body paint strokes';
painter.strokes.forEach( ( stroke, i ) => {

	if ( stroke.pts.length < 2 ) return;
	const geometry = new THREE.BufferGeometry().setFromPoints( stroke.pts.map( point => new THREE.Vector3( point.x, point.y, point.z ) ) );
	const color = new THREE.Color().setHSL( marks.findIndex( ( [ name ] ) => name === stroke.id ) / 5, .75, .4 );
	const line = new THREE.Line( geometry, new THREE.LineBasicMaterial( { color } ) ); line.name = stroke.id + ' stroke ' + i; line.userData.times = stroke.pts.map( point => point.t ); strokes.add( line );

} );
painting.scene.add( strokes ); painting.scripts[ strokes.uuid ] = [ { name: 'Reveal recorded paint marks', enabled: true, parameters: { playbackSpeed: 1 }, source: `// @param playbackSpeed = 1 (0.1..3)
let time = 0;
function update(event) {
 time = (time + event.delta / 1000 * params.playbackSpeed) % ${ frames.at( -1 ).t + 2 };
 for (const line of this.children) { const times = line.userData.times; let count = 0; while (count < times.length && times[count] <= time) count++; line.geometry.setDrawRange(0, count); }
}
` } ];
await save( '04-paint', painting );
