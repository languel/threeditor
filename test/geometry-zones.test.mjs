import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { evaluateModifierStack } from '../editor/js/modeling/ModifierEvaluation.js';
import { createGeometryGraph, evaluateGeometryGraph, GEOMETRY_DOMAIN, GEOMETRY_MODIFIER } from '../editor/js/nodes/GeometryNodes.js';
import { GeometrySimulation } from '../editor/js/nodes/GeometrySimulation.js';
import { joinGeometry } from '../editor/js/nodes/GeometryOperations.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';

function wire( graph, domain, from, output, to, input ) {

	connectNodes( graph, domain, { node: from, socket: output }, { node: to, socket: input } );

}

test( 'Repeat carries the mesh and numeric value and uses a zero-based iteration', () => {

	const graph = createGeometryGraph();
	const repeat = addNode( graph, 'geometry.repeat', 0, 0, GEOMETRY_DOMAIN );
	const outer = addNode( graph, 'geometry.transform', 0, 0 );
	wire( graph, GEOMETRY_DOMAIN, 'geometry.input', 'geometry', repeat.id, 'geometry' );
	wire( graph, GEOMETRY_DOMAIN, repeat.id, 'geometry', outer.id, 'geometry' );
	wire( graph, GEOMETRY_DOMAIN, repeat.id, 'value', outer.id, 'y' );
	wire( graph, GEOMETRY_DOMAIN, outer.id, 'geometry', 'geometry.output', 'geometry' );

	const domain = GEOMETRY_DOMAIN.nodes.get( repeat.type ).bodyDomain();
	const move = addNode( repeat.body, 'geometry.transform', 0, 0 );
	const sum = addNode( repeat.body, 'math.add', 0, 0 );
	const input = 'geometry.repeat.input', output = 'geometry.repeat.output';
	wire( repeat.body, domain, input, 'geometry', move.id, 'geometry' );
	wire( repeat.body, domain, input, 'iteration', move.id, 'x' );
	wire( repeat.body, domain, move.id, 'geometry', output, 'geometry' );
	wire( repeat.body, domain, input, 'value', sum.id, 'a' );
	wire( repeat.body, domain, input, 'iteration', sum.id, 'b' );
	wire( repeat.body, domain, sum.id, 'value', output, 'value' );

	const source = new THREE.BoxGeometry();
	repeat.values.count = 4;
	const result = evaluateGeometryGraph( THREE, JSON.parse( JSON.stringify( graph ) ), source );
	assert.deepEqual( result.boundingBox.min.toArray(), [ 5.5, 5.5, - .5 ] );
	repeat.values.count = 0;
	repeat.values.value = 2;
	assert.deepEqual( evaluateGeometryGraph( THREE, graph, source ).boundingBox.min.toArray(), [ - .5, 1.5, - .5 ] );

} );

test( 'Join Geometry retains material assignments and fills absent color with white', () => {

	const a = new THREE.BoxGeometry();
	a.clearGroups();
	a.addGroup( 0, a.index.count, 2 );
	const b = new THREE.PlaneGeometry().toNonIndexed();
	b.setAttribute( 'color', new THREE.Float32BufferAttribute( new Float32Array( b.attributes.position.count * 3 ).fill( .25 ), 3 ) );
	const joined = joinGeometry( THREE, [ a, b ] );
	assert.equal( joined.index.count, 42 );
	assert.deepEqual( joined.groups, [ { start: 0, count: 36, materialIndex: 2 }, { start: 36, count: 6, materialIndex: 0 } ] );
	assert.deepEqual( joined.attributes.color.array.slice( 0, 3 ), new Float32Array( [ 1, 1, 1 ] ) );
	assert.equal( joined.attributes.color.getX( a.attributes.position.count ), .25 );

} );

test( 'Simulation uses fixed steps and rewinds deterministically on a reloaded project', () => {

	const graph = createGeometryGraph();
	const sim = addNode( graph, 'geometry.simulation', 0, 0, GEOMETRY_DOMAIN );
	wire( graph, GEOMETRY_DOMAIN, 'geometry.input', 'geometry', sim.id, 'geometry' );
	wire( graph, GEOMETRY_DOMAIN, sim.id, 'geometry', 'geometry.output', 'geometry' );
	const domain = GEOMETRY_DOMAIN.nodes.get( sim.type ).bodyDomain();
	const move = addNode( sim.body, 'geometry.transform', 0, 0 );
	const increment = addNode( sim.body, 'math.add', 0, 0 );
	increment.values.b = 1;
	const input = 'geometry.simulation.input', output = 'geometry.simulation.output';
	wire( sim.body, domain, input, 'geometry', move.id, 'geometry' );
	wire( sim.body, domain, input, 'value', increment.id, 'a' );
	wire( sim.body, domain, increment.id, 'value', move.id, 'x' );
	wire( sim.body, domain, increment.id, 'value', output, 'value' );
	wire( sim.body, domain, move.id, 'geometry', output, 'geometry' );
	const base = new THREE.BoxGeometry();
	const offset = { id: 'offset', type: 'OFFSET', enabled: true, params: { x: 2 } };
	const modifiers = [ { id: 'sim', type: GEOMETRY_MODIFIER, enabled: true, params: { graph } }, offset ];
	const mesh = new THREE.Mesh( evaluateModifierStack( THREE, base, modifiers ) );
	mesh.userData = { modifiers, modifierBase: base.toJSON() };
	const scene = new THREE.Scene();
	scene.add( mesh );
	const parsed = new THREE.ObjectLoader().parse( JSON.parse( JSON.stringify( scene.toJSON() ) ) );
	const outputMesh = parsed.children[ 0 ];
	const original = outputMesh.geometry;
	const runtime = new GeometrySimulation( THREE, parsed, error => { throw error; } );

	runtime.advanceTo( 3 / 60, 2 );
	assert.equal( outputMesh.geometry.boundingBox.max.x, 5.5 );
	runtime.advanceTo( 3 / 60, 2 );
	assert.equal( outputMesh.geometry.boundingBox.max.x, 8.5 );
	runtime.advanceTo( 1 / 60 );
	assert.equal( outputMesh.geometry.boundingBox.max.x, 3.5 );
	runtime.dispose();
	assert.equal( outputMesh.geometry, original );
	assert.equal( mesh.geometry.boundingBox.max.x, 2.5 );

} );
