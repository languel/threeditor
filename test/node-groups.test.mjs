import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { TSL } from '../build/three.webgpu.js';
import { createGeometryGraph, evaluateGeometryGraph, GEOMETRY_DOMAIN } from '../editor/js/nodes/GeometryNodes.js';
import { createLogicGraph, LOGIC_DOMAIN, planLogicGraph, remapLogicObjects } from '../editor/js/nodes/LogicNodes.js';
import { LogicRuntime } from '../editor/js/nodes/LogicRuntime.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';
import { copyNodes, pasteNodes } from '../editor/js/nodes/NodeGraphEdits.js';
import { exposeGroupSocket, expandNodeGroups, groupNodes, nodeGroupsDomain, removeGroupSocket, ungroupNode } from '../editor/js/nodes/NodeGroups.js';
import { compileShaderGraph, createShaderGraph, SHADER_DOMAIN } from '../editor/js/nodes/ShaderNodes.js';
import { playerStreamNeeds } from '../editor/js/streams/PlayerStreams.js';
import { StreamRouter } from '../editor/js/streams/StreamRouter.js';

const json = graph => JSON.parse( JSON.stringify( graph ) );

function wire( graph, domain, from, output, to, input ) {

	connectNodes( graph, domain, { node: from, socket: output }, { node: to, socket: input } );

}

test( 'Geometry instances share the same group, expose independent controls, and survive ungrouping', () => {

	const graph = createGeometryGraph();
	const move = addNode( graph, 'geometry.transform', 210, 0 );
	const lift = addNode( graph, 'geometry.transform', 430, 0 );
	move.values.x = 2;
	lift.values.y = 3;
	wire( graph, GEOMETRY_DOMAIN, 'geometry.input', 'geometry', move.id, 'geometry' );
	wire( graph, GEOMETRY_DOMAIN, move.id, 'geometry', lift.id, 'geometry' );
	wire( graph, GEOMETRY_DOMAIN, lift.id, 'geometry', 'geometry.output', 'geometry' );
	const instance = groupNodes( graph, graph, GEOMETRY_DOMAIN, new Set( [ move.id, lift.id ] ) );
	const definition = graph.groups[ 0 ];
	exposeGroupSocket( definition, definition.body, nodeGroupsDomain( GEOMETRY_DOMAIN, graph.groups, definition ), {
		node: move.id, socket: 'x', direction: 'input'
	} );
	const next = addNode( graph, definition.id, 420, 200 );
	const domain = nodeGroupsDomain( GEOMETRY_DOMAIN, graph.groups );
	wire( graph, domain, instance.id, 'out1', next.id, 'in1' );
	wire( graph, domain, next.id, 'out1', 'geometry.output', 'geometry' );
	next.values.in2 = 1;
	lift.values.y = 4;
	const source = new THREE.BoxGeometry();
	const bounds = () => evaluateGeometryGraph( THREE, json( graph ), source ).boundingBox.max.toArray();
	assert.deepEqual( bounds(), [ 3.5, 8.5, .5 ] );
	ungroupNode( graph, domain, next );
	assert.deepEqual( bounds(), [ 3.5, 8.5, .5 ] );
	assert.equal( graph.groups.length, 1 );
	assert.equal( graph.nodes.filter( node => node.type === definition.id ).length, 1 );

	const destination = createGeometryGraph();
	const clipboard = copyNodes( graph, new Set( [ instance.id ] ) );
	const [ duplicate ] = pasteNodes( destination, GEOMETRY_DOMAIN, clipboard, 20, 20 );
	const imported = nodeGroupsDomain( GEOMETRY_DOMAIN, destination.groups );
	wire( destination, imported, 'geometry.input', 'geometry', duplicate, 'in1' );
	wire( destination, imported, duplicate, 'out1', 'geometry.output', 'geometry' );
	assert.deepEqual( evaluateGeometryGraph( THREE, destination, source ).boundingBox.max.toArray(), [ 2.5, 4.5, .5 ] );
	removeGroupSocket( destination, destination.groups[ 0 ], 'inputs', 'in2' );
	assert.deepEqual( evaluateGeometryGraph( THREE, destination, source ).boundingBox.max.toArray(), [ 2.5, 4.5, .5 ] );
	const [ restored ] = pasteNodes( destination, GEOMETRY_DOMAIN, clipboard, 20, 20 );
	const pasted = destination.nodes.find( node => node.id === restored );
	const restoredGroup = destination.groups.find( group => group.id === pasted.type );
	assert.notEqual( pasted.type, duplicate );
	assert.ok( restoredGroup.inputs.in2 );

} );

test( 'Groups can be used in Repeat bodies and their expansion rejects recursive definitions', () => {

	const graph = createGeometryGraph();
	const repeat = addNode( graph, 'geometry.repeat', 245, 0, GEOMETRY_DOMAIN );
	repeat.values.count = 3;
	const domain = GEOMETRY_DOMAIN.nodes.get( repeat.type ).bodyDomain();
	const move = addNode( repeat.body, 'geometry.transform', 245, 0 );
	move.values.x = 1;
	wire( repeat.body, domain, 'geometry.repeat.input', 'geometry', move.id, 'geometry' );
	wire( repeat.body, domain, move.id, 'geometry', 'geometry.repeat.output', 'geometry' );
	const instance = groupNodes( graph, repeat.body, domain, new Set( [ move.id ] ) );
	wire( graph, GEOMETRY_DOMAIN, 'geometry.input', 'geometry', repeat.id, 'geometry' );
	wire( graph, GEOMETRY_DOMAIN, repeat.id, 'geometry', 'geometry.output', 'geometry' );
	assert.equal( evaluateGeometryGraph( THREE, json( graph ), new THREE.BoxGeometry() ).boundingBox.max.x, 3.5 );
	const group = graph.groups[ 0 ];
	addNode( group.body, instance.type, 390, 0 );
	assert.throws( () => expandNodeGroups( graph, GEOMETRY_DOMAIN ), /cannot contain itself/ );

} );

test( 'TSL group boundaries retain optional sockets and compile animated expressions from a saved graph', () => {

	const graph = createShaderGraph();
	const time = addNode( graph, 'shader.time', 0, 30 );
	const uv = addNode( graph, 'shader.uvTransform', 210, 30 );
	const checker = addNode( graph, 'shader.checker', 430, 30 );
	wire( graph, SHADER_DOMAIN, time.id, 'value', uv.id, 'offsetX' );
	wire( graph, SHADER_DOMAIN, uv.id, 'uv', checker.id, 'uv' );
	wire( graph, SHADER_DOMAIN, checker.id, 'value', 'shader.output', 'roughness' );
	groupNodes( graph, graph, SHADER_DOMAIN, new Set( [ uv.id, checker.id ] ) );
	const shader = compileShaderGraph( TSL, json( graph ), new THREE.MeshStandardMaterial() );
	assert.equal( shader.animated, true );
	assert.equal( shader.properties.colorNode.isNode, true );
	assert.equal( shader.properties.roughnessNode.isNode, true );

	const group = graph.groups[ 0 ];
	const domain = nodeGroupsDomain( SHADER_DOMAIN, graph.groups, group );
	exposeGroupSocket( group, group.body, domain, { node: checker.id, socket: 'scale', direction: 'input' } );
	wire( group.body, nodeGroupsDomain( SHADER_DOMAIN, graph.groups, group ), 'group.input', 'in2', 'group.output', 'out1' );
	const literal = compileShaderGraph( TSL, json( graph ), new THREE.MeshStandardMaterial() );
	assert.equal( literal.animated, false );
	assert.equal( literal.properties.roughnessNode.isNode, true );

} );

test( 'Logic state is independent per group instance and Delay still breaks feedback across the group boundary', () => {

	const scene = new THREE.Scene();
	const owner = new THREE.Object3D();
	scene.add( owner );
	const graph = owner.userData.logicGraph = createLogicGraph();
	const once = addNode( graph, 'logic.once', 200, 20 );
	const move = addNode( graph, 'logic.move', 400, 20 );
	move.values.x = 1;
	wire( graph, LOGIC_DOMAIN, 'logic.start', 'then', once.id, 'run' );
	wire( graph, LOGIC_DOMAIN, once.id, 'then', move.id, 'run' );
	const instance = groupNodes( graph, graph, LOGIC_DOMAIN, new Set( [ once.id, move.id ] ) );
	const next = addNode( graph, instance.type, 400, 220 );
	const domain = nodeGroupsDomain( LOGIC_DOMAIN, graph.groups );
	wire( graph, domain, 'logic.start', 'then', next.id, 'in1' );

	const delay = addNode( graph, 'logic.delay', 200, 320 );
	delay.values.seconds = 0;
	const merge = addNode( graph, 'logic.merge', 0, 320 );
	const step = addNode( graph, 'logic.move', 500, 320 );
	step.values.z = 1;
	wire( graph, domain, 'logic.start', 'then', merge.id, 'a' );
	wire( graph, domain, merge.id, 'then', delay.id, 'run' );
	wire( graph, domain, delay.id, 'then', merge.id, 'b' );
	wire( graph, domain, delay.id, 'then', step.id, 'run' );
	const delayGroup = groupNodes( graph, graph, domain, new Set( [ delay.id ] ) );
	const nested = nodeGroupsDomain( LOGIC_DOMAIN, graph.groups );
	groupNodes( graph, graph, nested, new Set( [ merge.id, delayGroup.id ] ) );
	const runtime = new LogicRuntime( THREE, scene, new StreamRouter() );
	runtime.start();
	assert.equal( owner.position.x, 2 );
	runtime.tick( .1, .1 );
	runtime.tick( .2, .1 );
	assert.deepEqual( owner.position.toArray(), [ 2, 0, 2 ] );

} );

test( 'Grouping preserves the order of outgoing logic actions on the same event socket', () => {

	const scene = new THREE.Scene();
	const object = new THREE.Object3D();
	scene.add( object );
	const graph = object.userData.logicGraph = createLogicGraph();
	const move = addNode( graph, 'logic.setPosition', 200, 20 );
	move.values.x = 2;
	const nudge = addNode( graph, 'logic.move', 440, 20 );
	nudge.values.x = 3;
	wire( graph, LOGIC_DOMAIN, 'logic.start', 'then', move.id, 'run' );
	wire( graph, LOGIC_DOMAIN, 'logic.start', 'then', nudge.id, 'run' );
	groupNodes( graph, graph, LOGIC_DOMAIN, new Set( [ move.id ] ) );
	const runtime = new LogicRuntime( THREE, scene, new StreamRouter() );
	runtime.start();
	assert.equal( object.position.x, 5 );

} );

test( 'A grouped logic event preserves target remapping, port wiring and published device discovery', () => {

	const scene = new THREE.Scene();
	const original = new THREE.Object3D();
	const copy = new THREE.Object3D();
	const graph = scene.userData.logicGraph = createLogicGraph();
	scene.add( original, copy );
	const object = addNode( graph, 'logic.object', 0, 160 );
	const move = addNode( graph, 'logic.move', 240, 20 );
	move.values.target = original.uuid;
	move.values.y = 1;
	const input = addNode( graph, 'logic.streamSample', 0, 20 );
	input.values.topic = 'serial.A0';
	wire( graph, LOGIC_DOMAIN, input.id, 'then', move.id, 'run' );
	wire( graph, LOGIC_DOMAIN, object.id, 'object', move.id, 'target' );
	const instance = groupNodes( graph, graph, LOGIC_DOMAIN, new Set( [ input.id, move.id ] ) );
	const socket = graph.groups[ 0 ].inputs.in1;
	assert.equal( socket.default, original.uuid );
	graph.links = graph.links.filter( link => link.to.node !== instance.id );
	remapLogicObjects( graph, uid => uid === original.uuid ? copy.uuid : uid );
	assert.equal( socket.default, copy.uuid );
	assert.ok( planLogicGraph( json( graph ) ).triggers.has( 'sample' ) );
	assert.equal( playerStreamNeeds( scene ).serial, true );
	const router = new StreamRouter();
	const runtime = new LogicRuntime( THREE, scene, router );
	runtime.start();
	router.publish( 'serial.A0', 1 );
	runtime.tick( .1, .1 );
	assert.equal( original.position.y, 0 );
	assert.equal( copy.position.y, 1 );

} );
