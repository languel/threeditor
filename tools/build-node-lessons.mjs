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
