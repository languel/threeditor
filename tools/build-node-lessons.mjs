import { writeFile } from 'node:fs/promises';
import * as THREE from '../build/three.module.js';
import { evaluateModifierStack } from '../editor/js/modeling/ModifierEvaluation.js';
import { createGeometryGraph, GEOMETRY_DOMAIN, GEOMETRY_MODIFIER } from '../editor/js/nodes/GeometryNodes.js';
import { joinGeometry } from '../editor/js/nodes/GeometryOperations.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';

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

async function save( filename, title, mesh, instructions, position ) {

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
	scene.add( floor, key, fill, mesh );
	scene.updateMatrixWorld( true );
	camera.updateMatrixWorld( true );
	const project = { title, renderer: 'WebGLRenderer', shadows: true, shadowType: 1, toneMapping: 7, toneMappingExposure: 1, cameraController: 'orbit' };
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
