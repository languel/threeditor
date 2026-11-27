import { writeFile } from 'node:fs/promises';
import * as THREE from '../build/three.module.js';
import { evaluateModifierStack } from '../editor/js/modeling/ModifierEvaluation.js';
import { createGeometryGraph, GEOMETRY_DOMAIN, GEOMETRY_MODIFIER } from '../editor/js/nodes/GeometryNodes.js';
import { joinGeometry } from '../editor/js/nodes/GeometryOperations.js';
import { addNode, connectNodes, removeNode } from '../editor/js/nodes/NodeGraph.js';
import { createShaderGraph, SHADER_DOMAIN } from '../editor/js/nodes/ShaderNodes.js';
import { createLogicGraph, LOGIC_DOMAIN } from '../editor/js/nodes/LogicNodes.js';

function newGraph( type, settings = {} ) {

	const graph = createGeometryGraph();
	const node = addNode( graph, type, 262, 32, GEOMETRY_DOMAIN );
	Object.assign( node.values, settings );
	graph.nodes.at( 1 ).x = 506;
	wire( graph, GEOMETRY_DOMAIN, 'geometry.input', 'geometry', node.id, 'geometry' );
	wire( graph, GEOMETRY_DOMAIN, node.id, 'geometry', 'geometry.output', 'geometry' );
	return { graph, zone: node.body, domain: GEOMETRY_DOMAIN.nodes.get( type ).bodyDomain() };

}

function wire( graph, domain, from, output, to, input ) {

	connectNodes( graph, domain, { node: from, socket: output }, { node: to, socket: input } );

}

function geometryMesh( name, base, graph, material ) {

	const modifiers = [ { id: THREE.MathUtils.generateUUID(), type: GEOMETRY_MODIFIER, name: 'Geometry Nodes', enabled: true, params: { graph } } ];
	const mesh = new THREE.Mesh( evaluateModifierStack( THREE, base, modifiers ), material );
	mesh.name = name;
	mesh.userData = { modifiers, modifierBase: base.toJSON() };
	mesh.castShadow = mesh.receiveShadow = true;
	return mesh;

}

async function save( filename, title, mesh, instructions, position, renderer = 'WebGLRenderer' ) {

	const requested = process.argv.slice( 2 );
	if ( requested.length && ! requested.includes( filename ) ) return;
	const scene = new THREE.Scene();
	scene.name = title;
	scene.background = new THREE.Color( 0x182433 );
	scene.userData.lesson = { title, instructions };
	const camera = new THREE.PerspectiveCamera( 44, 1, .05, 100 );
	camera.name = 'Director';
	camera.position.fromArray( position );
	camera.lookAt( 0, 0, 0 );
	const floor = new THREE.Mesh( new THREE.PlaneGeometry( 18, 18 ), new THREE.MeshStandardMaterial( { color: 0x475567, roughness: .9 } ) );
	floor.name = 'Stage';
	floor.rotation.x = - Math.PI / 2;
	floor.position.y = - .9;
	floor.receiveShadow = true;
	const key = new THREE.DirectionalLight( 0xffdfb0, 2.7 );
	key.name = 'Key light';
	key.position.set( 1, 7, 3 );
	key.castShadow = true;
	key.shadow.mapSize.set( 1024, 1024 );
	key.shadow.normalBias = .03;
	const fill = new THREE.HemisphereLight( 0xcde8ff, 0x485469, 1.6 );
	fill.name = 'Fill light';
	scene.add( floor, key, fill, ...[ mesh ].flat() );
	scene.updateMatrixWorld( true );
	camera.updateMatrixWorld( true );
	const project = { title, renderer, shadows: true, shadowType: 1, toneMapping: 7, toneMappingExposure: 1, cameraController: 'orbit' };
	const data = {
		metadata: {}, project, camera: camera.toJSON(), viewportCamera: camera.uuid, viewportTarget: [ 0, 0, 0 ], controls: { center: [ 0, 0, 0 ] },
		scene: scene.toJSON(), scripts: {}, history: { undos: [], redos: [] }, backgroundType: 'Color', environmentType: 'None'
	};
	await writeFile( new URL( '../editor/examples/lessons/' + filename + '.app.json', import.meta.url ), JSON.stringify( data ) + '\n' );
	console.log( filename + ': ' + title );

}

const repeat = newGraph( 'geometry.repeat', { count: 7 } );
const repeatInput = 'geometry.repeat.input', repeatOutput = 'geometry.repeat.output';
const step = addNode( repeat.zone, 'geometry.box', 24, 240 );
Object.assign( step.values, { width: 1.6, height: .18, depth: .49 } );
const next = addNode( repeat.zone, 'math.add', 270, 96 );
next.values.b = 1;
const rise = addNode( repeat.zone, 'math.multiply', 516, 60 );
rise.values.b = .22;
const run = addNode( repeat.zone, 'math.multiply', 516, 202 );
run.values.b = .55;
const move = addNode( repeat.zone, 'geometry.transform', 762, 92 );
const combine = addNode( repeat.zone, 'geometry.join', 1008, 56 );
repeat.zone.nodes[ 1 ].x = 1254;
for ( const [ from, output, to, input ] of [
	[ repeatInput, 'iteration', next.id, 'a' ],
	[ next.id, 'value', rise.id, 'a' ],
	[ next.id, 'value', run.id, 'a' ],
	[ step.id, 'geometry', move.id, 'geometry' ],
	[ rise.id, 'value', move.id, 'y' ],
	[ run.id, 'value', move.id, 'z' ],
	[ repeatInput, 'geometry', combine.id, 'a' ],
	[ move.id, 'geometry', combine.id, 'b' ],
	[ combine.id, 'geometry', repeatOutput, 'geometry' ]
] ) wire( repeat.zone, repeat.domain, from, output, to, input );
const stairMesh = geometryMesh( 'Procedural stairs', new THREE.BoxGeometry( 1.6, .18, .49 ), repeat.graph, new THREE.MeshStandardMaterial( { color: 0x46c7ae, roughness: .34 } ) );
stairMesh.position.set( 0, - .77, - 1.925 );
await save( '06-repeat-stairs', 'Stairs with Repeat', stairMesh,
	'Select Procedural stairs and open Geometry Nodes. Change Iterations on Repeat. Open its body and follow Iteration through the Rise and Run multipliers to Transform Geometry. Join Geometry adds each new tread to the carried mesh.',
	[ 5.1, 3.2, 6.8 ] );

const simulation = newGraph( 'geometry.simulation' );
const motionInput = 'geometry.simulation.input', motionOutput = 'geometry.simulation.output';
const rate = addNode( simulation.zone, 'math.multiply', 262, 174 );
rate.values.b = 120;
const rotate = addNode( simulation.zone, 'geometry.transform', 506, 30 );
simulation.zone.nodes[ 1 ].x = 750;
for ( const [ from, output, to, input ] of [
	[ motionInput, 'delta', rate.id, 'a' ],
	[ motionInput, 'geometry', rotate.id, 'geometry' ],
	[ rate.id, 'value', rotate.id, 'rotationY' ],
	[ rotate.id, 'geometry', motionOutput, 'geometry' ]
] ) wire( simulation.zone, simulation.domain, from, output, to, input );
const blades = [];
for ( let i = 0; i < 3; i ++ ) {

	const blade = new THREE.BoxGeometry( 1.3, .13, .33 ).translate( .74, 0, 0 ).rotateY( i * 2 * Math.PI / 3 );
	blade.clearGroups();
	blade.addGroup( 0, blade.index.count, i );
	blades.push( blade );

}
const rotor = joinGeometry( THREE, blades );
const materials = [ 0xfab66b, 0xfa7674, 0x68d1b4 ].map( color => new THREE.MeshStandardMaterial( { color, roughness: .32 } ) );
const rotorMesh = geometryMesh( 'Simulation pinwheel', rotor, simulation.graph, materials );
await save( '07-simulation-pinwheel', 'A simulated pinwheel', rotorMesh,
	'Select Simulation pinwheel and open Geometry Nodes. In the Simulation body, Multiply converts Delta Seconds to degrees per step. Try a different rotation rate, then choose Play Scene. Stop and Play again to restart from the authored geometry.',
	[ 3.5, 3.4, 4.5 ] );

const shader = createShaderGraph( '#cc866a' );
const pattern = addNode( shader, 'shader.checker', 260, 22 );
pattern.values.scale = 4;
const palette = addNode( shader, 'shader.mixColor', 502, 22 );
Object.assign( palette.values, { a: '#19476f', b: '#e6b267' } );
const uv = addNode( shader, 'shader.uvTransform', 24, 22 );
const time = addNode( shader, 'shader.time', 24, 234 );
const speed = addNode( shader, 'math.multiply', 260, 234 );
speed.values.b = .14;
const roughness = addNode( shader, 'shader.mixNumber', 502, 242 );
Object.assign( roughness.values, { a: .28, b: .64 } );
removeNode( shader, 'shader.color' );
shader.nodes.find( node => node.type === 'shader.output' ).x = 746;
for ( const [ from, output, to, input ] of [
	[ time.id, 'value', speed.id, 'a' ],
	[ speed.id, 'value', uv.id, 'offsetX' ],
	[ uv.id, 'uv', pattern.id, 'uv' ],
	[ pattern.id, 'value', palette.id, 'factor' ],
	[ pattern.id, 'value', roughness.id, 'factor' ],
	[ palette.id, 'color', 'shader.output', 'color' ],
	[ roughness.id, 'value', 'shader.output', 'roughness' ]
] ) wire( shader, SHADER_DOMAIN, from, output, to, input );
const ceramic = new THREE.Mesh( new THREE.TorusKnotGeometry( 1, .27, 110, 20 ), new THREE.MeshStandardMaterial( { color: 0xcc866a } ) );
ceramic.name = 'Glazed knot';
ceramic.material.name = 'Animated glaze';
ceramic.material.userData.shaderGraph = shader;
ceramic.castShadow = ceramic.receiveShadow = true;
await save( '08-animated-glaze', 'An animated TSL glaze', ceramic,
	'Select Glazed knot and open Shader Graph. Change the two colors on Mix Color and the scale on Checker. Time drives the UV offset through Multiply. Connect Checker to both color and roughness to see the pattern affect both properties.',
	[ 4.5, 3, 5.2 ], 'WebGPURenderer' );

const runner = new THREE.Mesh( new THREE.BoxGeometry( .56, .56, .56 ), new THREE.MeshStandardMaterial( { color: 0xffae62, roughness: .35 } ) );
runner.name = 'Runner';
runner.position.set( - 1.75, - .6, 0 );
runner.castShadow = true;
const gate = new THREE.Mesh( new THREE.BoxGeometry( .23, .94, 1.1 ), new THREE.MeshStandardMaterial( { color: 0x60d3b2, roughness: .52 } ) );
gate.name = 'Gate';
gate.position.set( 1.45, - .42, 0 );
gate.castShadow = true;

function logicNode( graph, type, x, y, values ) {

	const node = addNode( graph, type, x, y );
	Object.assign( node.values, values );
	return node.id;

}

const controls = runner.userData.logicGraph = createLogicGraph();
removeNode( controls, 'logic.start' );
const clock = logicNode( controls, 'logic.clock', 24, 45 );
const faster = logicNode( controls, 'math.multiply', 280, 36, { b: 2 } );
const slower = logicNode( controls, 'math.multiply', 280, 186, { b: - 2 } );
const right = logicNode( controls, 'logic.keyHeld', 24, 206, { key: 'ArrowRight' } );
const left = logicNode( controls, 'logic.keyHeld', 24, 350, { key: 'ArrowLeft' } );
const moveRight = logicNode( controls, 'logic.move', 540, 36 );
const moveLeft = logicNode( controls, 'logic.move', 540, 280 );
const contact = logicNode( controls, 'logic.overlap', 24, 510, { target: gate.uuid } );
const open = logicNode( controls, 'logic.send', 280, 510, { name: 'gate.open' } );
const home = logicNode( controls, 'logic.keyDown', 24, 682 );
const reset = logicNode( controls, 'logic.setPosition', 280, 682, { x: - 1.75, y: - .6 } );
const close = logicNode( controls, 'logic.send', 540, 682, { name: 'gate.close' } );
for ( const [ from, output, to, input ] of [
	[ clock, 'delta', faster, 'a' ], [ clock, 'delta', slower, 'a' ],
	[ faster, 'value', moveRight, 'x' ], [ slower, 'value', moveLeft, 'x' ],
	[ right, 'then', moveRight, 'run' ], [ left, 'then', moveLeft, 'run' ],
	[ contact, 'enter', open, 'run' ], [ home, 'then', reset, 'run' ], [ reset, 'then', close, 'run' ]
] ) wire( controls, LOGIC_DOMAIN, from, output, to, input );
const mechanism = gate.userData.logicGraph = createLogicGraph();
removeNode( mechanism, 'logic.start' );
const receiveOpen = logicNode( mechanism, 'logic.receive', 24, 36, { name: 'gate.open' } );
const receiveClose = logicNode( mechanism, 'logic.receive', 24, 238, { name: 'gate.close' } );
const lift = logicNode( mechanism, 'logic.setPosition', 278, 36, { x: 1.45, y: .97 } );
const lower = logicNode( mechanism, 'logic.setPosition', 278, 238, { x: 1.45, y: - .42 } );
wire( mechanism, LOGIC_DOMAIN, receiveOpen, 'then', lift, 'run' );
wire( mechanism, LOGIC_DOMAIN, receiveClose, 'then', lower, 'run' );
await save( '09-keyboard-gate', 'A keyboard-controlled gate', [ runner, gate ],
	'Play Scene and hold the left or right arrow to move the Runner. Walk into the Gate to open it, and press Space to reset. Open Logic Nodes on each object to trace the keyboard triggers, overlap sensor, and gate.open and gate.close events.',
	[ 3.7, 2.8, 6.1 ] );

const wave = createGeometryGraph();
const grid = addNode( wave, 'geometry.grid', 24, 32 );
Object.assign( grid.values, { width: 4.8, depth: 3.1, xSegments: 46, zSegments: 12 } );
const coordinates = addNode( wave, 'field.position', 24, 237 );
const frequency = addNode( wave, 'field.multiply', 267, 237 );
frequency.values.b = 3.6;
const sine = addNode( wave, 'field.sine', 510, 237 );
const amplitude = addNode( wave, 'field.multiply', 753, 32 );
amplitude.values.b = .33;
const normalize = addNode( wave, 'field.multiply', 753, 237 );
normalize.values.b = .5;
const shift = addNode( wave, 'field.add', 996, 237 );
shift.values.b = .5;
const moveWave = addNode( wave, 'geometry.setPosition', 996, 32 );
const storeWave = addNode( wave, 'geometry.storeAttribute', 1239, 32 );
storeWave.values.name = 'ridge';
wave.nodes.find( node => node.type === 'geometry.output' ).x = 1482;
removeNode( wave, 'geometry.input' );
for ( const [ from, output, to, input ] of [
	[ coordinates.id, 'x', frequency.id, 'a' ], [ frequency.id, 'value', sine.id, 'value' ],
	[ sine.id, 'value', amplitude.id, 'a' ], [ sine.id, 'value', normalize.id, 'a' ],
	[ normalize.id, 'value', shift.id, 'a' ], [ shift.id, 'value', storeWave.id, 'value' ],
	[ grid.id, 'geometry', moveWave.id, 'geometry' ], [ amplitude.id, 'value', moveWave.id, 'y' ],
	[ moveWave.id, 'geometry', storeWave.id, 'geometry' ], [ storeWave.id, 'geometry', 'geometry.output', 'geometry' ]
] ) wire( wave, GEOMETRY_DOMAIN, from, output, to, input );
const waveShader = createShaderGraph();
removeNode( waveShader, 'shader.color' );
const ridges = addNode( waveShader, 'shader.attribute', 24, 32 );
ridges.values.name = 'ridge';
const shade = addNode( waveShader, 'shader.mixColor', 267, 32 );
Object.assign( shade.values, { a: '#1a4581', b: '#efb16b' } );
waveShader.nodes.find( node => node.type === 'shader.output' ).x = 510;
wire( waveShader, SHADER_DOMAIN, ridges.id, 'value', shade.id, 'factor' );
wire( waveShader, SHADER_DOMAIN, shade.id, 'color', 'shader.output', 'color' );
const waveMaterial = new THREE.MeshStandardMaterial( { color: 0x6190ba, roughness: .5, side: THREE.DoubleSide } );
waveMaterial.name = 'Ridge colors';
waveMaterial.userData.shaderGraph = waveShader;
const waveMesh = geometryMesh( 'Wave surface', new THREE.PlaneGeometry( 4.8, 3.1 ).rotateX( - Math.PI / 2 ), wave, waveMaterial );
await save( '10-field-colored-wave', 'A field-colored wave', waveMesh,
	'Use Geometry Nodes to change the frequency and height of the wave. Store Named Attribute writes ridge onto the mesh. Open Shader Graph to see how Named Attribute reads ridge and uses it to mix two colors on the surface.',
	[ 3.9, 3.5, 5.2 ], 'WebGPURenderer' );

const garden = createGeometryGraph();
const scatter = addNode( garden, 'geometry.distribute', 270, 32 );
Object.assign( scatter.values, { count: 150, seed: 28 } );
const center = addNode( garden, 'geometry.sphere', 24, 247 );
Object.assign( center.values, { radius: .46, segments: 16, rings: 12 } );
const proximity = addNode( garden, 'geometry.proximity', 270, 247 );
const falloff = addNode( garden, 'field.expression', 516, 247 );
falloff.values.expression = '0.18 + 1.1 * exp(-2.8 * x)';
const stem = addNode( garden, 'geometry.cone', 516, 32 );
Object.assign( stem.values, { radius: .17, height: 1.05, segments: 5 } );
const grow = addNode( garden, 'geometry.onPoints', 762, 32 );
const realized = addNode( garden, 'geometry.realize', 1008, 32 );
garden.nodes.find( node => node.type === 'geometry.output' ).x = 1254;
for ( const [ from, output, to, input ] of [
	[ 'geometry.input', 'geometry', scatter.id, 'geometry' ],
	[ center.id, 'geometry', proximity.id, 'target' ],
	[ proximity.id, 'distance', falloff.id, 'x' ],
	[ scatter.id, 'points', grow.id, 'points' ],
	[ stem.id, 'geometry', grow.id, 'mesh' ],
	[ falloff.id, 'value', grow.id, 'scale' ],
	[ grow.id, 'instances', realized.id, 'instances' ],
	[ realized.id, 'geometry', 'geometry.output', 'geometry' ]
] ) wire( garden, GEOMETRY_DOMAIN, from, output, to, input );
const gardenMesh = geometryMesh( 'Proximity garden', new THREE.PlaneGeometry( 4.6, 4.6 ).rotateX( - Math.PI / 2 ),
	garden, new THREE.MeshStandardMaterial( { color: 0x80d7a2, roughness: .52 } ) );
await save( '11-proximity-garden', 'A proximity garden', gardenMesh,
	'Open Geometry Nodes on Proximity garden. Distribute Points on Faces scatters the planting positions. Geometry Proximity measures their distance to a sphere. Math Expression Field converts that distance into instance scale. Try changing the radius or the falloff in the expression.',
	[ 4.4, 3.6, 5.6 ] );

const sculpture = new THREE.Mesh( new THREE.TorusKnotGeometry( .8, .18, 110, 18 ), new THREE.MeshStandardMaterial( { color: 0xf9bb6e, roughness: .28 } ) );
sculpture.name = 'Stream sculpture';
sculpture.castShadow = true;
const pulse = sculpture.userData.logicGraph = createLogicGraph();
removeNode( pulse, 'logic.start' );
const update = logicNode( pulse, 'logic.update', 24, 35 );
const timeValue = logicNode( pulse, 'logic.clock', 24, 178 );
const oscillator = logicNode( pulse, 'math.expression', 270, 178, { expression: '0.5 + 0.4 * sin(x * 2)' } );
const sendPulse = logicNode( pulse, 'logic.publishStream', 516, 178, { topic: 'map.pulse' } );
const received = logicNode( pulse, 'logic.streamSample', 24, 373, { topic: 'map.pulse' } );
const payload = logicNode( pulse, 'logic.eventValue', 24, 522 );
const remap = logicNode( pulse, 'math.maprange', 270, 495, { b: 0, c: 1, d: .55, e: 1.5 } );
const scale = logicNode( pulse, 'logic.setScale', 516, 385 );
for ( const [ from, output, to, input ] of [
	[ update, 'then', sendPulse, 'run' ],
	[ timeValue, 'elapsed', oscillator, 'x' ],
	[ oscillator, 'value', sendPulse, 'value' ],
	[ received, 'then', scale, 'run' ],
	[ payload, 'value', remap, 'a' ],
	[ remap, 'value', scale, 'y' ]
] ) wire( pulse, LOGIC_DOMAIN, from, output, to, input );
await save( '12-stream-pulse', 'A stream-reactive sculpture', sculpture,
	'Play Scene to pulse the sculpture through a stream topic. Open Logic Nodes and follow On Stream Sample to Event Value, Map Range, and Set Scale. Use Browse stream topics to substitute a live MIDI control, serial signal, or tracked landmark coordinate.',
	[ 3.1, 2.3, 4.1 ] );

const spring = createGeometryGraph();
removeNode( spring, 'geometry.input' );
const spiral = addNode( spring, 'curve.spiral', 24, 32 );
Object.assign( spiral.values, { startRadius: 1.3, endRadius: .35, height: 2.8, turns: 2.5, resolution: 96 } );
const evenlySpaced = addNode( spring, 'curve.resample', 270, 32 );
evenlySpaced.values.count = 94;
const profile = addNode( spring, 'curve.circle', 270, 276 );
Object.assign( profile.values, { radius: .16, resolution: 12 } );
const pathIndex = addNode( spring, 'field.index', 24, 408 );
const taper = addNode( spring, 'field.expression', 270, 454 );
taper.values.expression = '1 - x * 0.78';
const sweep = addNode( spring, 'curve.mesh', 516, 32 );
const lowerSpring = addNode( spring, 'geometry.transform', 762, 32 );
lowerSpring.values.y = - .7;
spring.nodes.find( node => node.type === 'geometry.output' ).x = 1008;
for ( const [ from, output, to, input ] of [
	[ spiral.id, 'curve', evenlySpaced.id, 'curve' ], [ evenlySpaced.id, 'curve', sweep.id, 'curve' ],
	[ profile.id, 'curve', sweep.id, 'profile' ], [ pathIndex.id, 'fraction', taper.id, 'x' ],
	[ taper.id, 'value', sweep.id, 'scale' ], [ sweep.id, 'geometry', lowerSpring.id, 'geometry' ],
	[ lowerSpring.id, 'geometry', 'geometry.output', 'geometry' ]
] ) wire( spring, GEOMETRY_DOMAIN, from, output, to, input );
const springMesh = geometryMesh( 'Tapered spring', new THREE.CylinderGeometry( .4, .4, 2 ), spring,
	new THREE.MeshStandardMaterial( { color: 0xfab47e, roughness: .33, metalness: .18 } ) );
await save( '13-tapered-curve', 'A tapered curve sweep', springMesh,
	'Open Geometry Nodes on Tapered spring. Spiral describes the path, and Curve Circle supplies the cross section. Resample Curve spaces the rings by length. Try changing the rotations, profile radius, or the taper expression connected to Curve to Mesh.',
	[ 3.9, 2.7, 5.2 ] );

const pad = new THREE.Mesh( new THREE.BoxGeometry( 1.5, .32, 1.35 ), new THREE.MeshStandardMaterial( { color: 0x265ca3, roughness: .46 } ) );
pad.name = 'Beacon switch';
pad.position.set( - 1.6, - .35, .35 );
pad.castShadow = true;
const beacon = new THREE.Mesh( new THREE.IcosahedronGeometry( .33, 1 ),
	new THREE.MeshStandardMaterial( { color: 0xffc66f, emissive: 0x682604, roughness: .24 } ) );
beacon.name = 'Beacon';
beacon.position.set( - 1.6, .1, - .92 );
beacon.castShadow = true;
const padGraph = pad.userData.logicGraph = createLogicGraph();
removeNode( padGraph, 'logic.start' );
const hover = logicNode( padGraph, 'logic.pointerOver', 24, 32 );
const highlight = logicNode( padGraph, 'logic.setColor', 282, 32, { color: '#53bae9' } );
const unhighlight = logicNode( padGraph, 'logic.setColor', 282, 190, { color: '#265ca3' } );
const click = logicNode( padGraph, 'logic.objectPress', 24, 320 );
const controllerButton = logicNode( padGraph, 'logic.gamepadButton', 24, 466 );
const either = logicNode( padGraph, 'logic.merge', 282, 345 );
const toggle = logicNode( padGraph, 'logic.toggleVisibility', 540, 345, { target: beacon.uuid } );
for ( const [ from, output, to, input ] of [
	[ hover, 'enter', highlight, 'run' ], [ hover, 'exit', unhighlight, 'run' ],
	[ click, 'then', either, 'a' ], [ controllerButton, 'then', either, 'b' ],
	[ either, 'then', toggle, 'run' ]
] ) wire( padGraph, LOGIC_DOMAIN, from, output, to, input );

const deck = new THREE.Mesh( new THREE.BoxGeometry( 2.5, .19, 2.2 ),
	new THREE.MeshStandardMaterial( { color: 0x265b51, roughness: .65 } ) );
deck.name = 'Navigation deck';
deck.position.set( 1.15, - .55, 0 );
deck.receiveShadow = true;
const marker = new THREE.Mesh( new THREE.SphereGeometry( .17, 18, 12 ),
	new THREE.MeshStandardMaterial( { color: 0xb3f7ca, roughness: .32 } ) );
marker.name = 'Deck marker';
marker.position.set( 1.15, - .27, 0 );
marker.castShadow = true;
const deckGraph = deck.userData.logicGraph = createLogicGraph();
removeNode( deckGraph, 'logic.start' );
const deckClick = logicNode( deckGraph, 'logic.objectPress', 24, 33 );
const pick = logicNode( deckGraph, 'logic.pointerRay', 24, 193 );
const placeMarker = logicNode( deckGraph, 'logic.setPositionVector', 282, 33, { target: marker.uuid } );
const liftMarker = logicNode( deckGraph, 'logic.move', 540, 33, { target: marker.uuid, y: .185 } );
for ( const [ from, output, to, input ] of [
	[ deckClick, 'then', placeMarker, 'run' ], [ pick, 'point', placeMarker, 'vector' ],
	[ placeMarker, 'then', liftMarker, 'run' ]
] ) wire( deckGraph, LOGIC_DOMAIN, from, output, to, input );

const markerGraph = marker.userData.logicGraph = createLogicGraph();
removeNode( markerGraph, 'logic.start' );
const moveFrame = logicNode( markerGraph, 'logic.update', 24, 32 );
const frameTime = logicNode( markerGraph, 'logic.clock', 24, 182 );
const markerPosition = logicNode( markerGraph, 'logic.position', 24, 317 );
const controllerStick = logicNode( markerGraph, 'logic.gamepadStick', 24, 502 );
const stepX = logicNode( markerGraph, 'math.expression', 282, 220, { expression: 'clamp(x + y*z*2.2, 0, 2.3)' } );
const stepZ = logicNode( markerGraph, 'math.expression', 282, 468, { expression: 'clamp(x + y*z*2.2, -1, 1)' } );
const moveMarker = logicNode( markerGraph, 'logic.setPosition', 540, 60, { y: - .27 } );
for ( const [ from, output, to, input ] of [
	[ moveFrame, 'then', moveMarker, 'run' ],
	[ markerPosition, 'x', stepX, 'x' ], [ markerPosition, 'z', stepZ, 'x' ],
	[ frameTime, 'delta', stepX, 'y' ], [ frameTime, 'delta', stepZ, 'y' ],
	[ controllerStick, 'x', stepX, 'z' ], [ controllerStick, 'y', stepZ, 'z' ],
	[ stepX, 'value', moveMarker, 'x' ], [ stepZ, 'value', moveMarker, 'z' ]
] ) wire( markerGraph, LOGIC_DOMAIN, from, output, to, input );
await save( '14-interactive-control-deck', 'A pointer and gamepad control deck', [ pad, beacon, deck, marker ],
	'Play Scene and hover the blue Beacon switch. Click it to toggle the beacon. Click the green Navigation deck to move the marker to the pointer hit. On a standard controller, use the bottom face button to toggle the beacon and the left stick to move the marker. Inspect Logic Nodes on each surface.',
	[ 2.7, 4.3, 6.6 ] );
