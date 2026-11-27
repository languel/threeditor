import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { TSL } from '../build/three.webgpu.js';
import { createGeometryGraph, evaluateGeometryGraph, GEOMETRY_DOMAIN } from '../editor/js/nodes/GeometryNodes.js';
import { createProximity } from '../editor/js/nodes/GeometryProximity.js';
import { addNode, bypassNodes, connectNodes } from '../editor/js/nodes/NodeGraph.js';
import { copyNodes, cutsWire, makeLinks, pasteNodes, swapNode } from '../editor/js/nodes/NodeGraphEdits.js';
import { compileExpression } from '../editor/js/nodes/MathExpression.js';
import { expressionMath } from '../editor/js/nodes/ValueNodes.js';
import { compileShaderGraph, createShaderGraph, SHADER_DOMAIN } from '../editor/js/nodes/ShaderNodes.js';

function wire( graph, domain, from, output, to, input ) {

	connectNodes( graph, domain, { node: from, socket: output }, { node: to, socket: input } );

}

test( 'Expressions evaluate on the CPU and in TSL with typed inputs and restricted syntax', () => {

	const math = expressionMath();
	assert.equal( compileExpression( '(x + 2) * clamp(y, 0, 1) + cos(pi)', math )( { x: 4, y: 2 } ), 5 );
	assert.equal( compileExpression( 'x % 3 + 2 ** z', math )( { x: - 4, z: 2 } ), 6 );
	assert.throws( () => compileExpression( 'x.constructor(1)', math ), /supports numeric/ );
	assert.throws( () => compileExpression( 'x, y', math ), /supports numeric/ );
	const graph = createShaderGraph();
	const node = addNode( graph, 'math.expression', 0, 0 );
	node.values.expression = 'maprange(sin(x), -1, 1, 0, 1)';
	wire( graph, SHADER_DOMAIN, node.id, 'value', 'shader.output', 'roughness' );
	assert.ok( compileShaderGraph( TSL, graph, new THREE.MeshStandardMaterial() ).properties.roughnessNode.isNode );

} );

test( 'Geometry Proximity distinguishes triangle interiors, edges, and vertices', () => {

	const target = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3(), new THREE.Vector3( 2, 0, 0 ), new THREE.Vector3( 0, 2, 0 ) ] );
	target.setIndex( [ 0, 1, 2 ] );
	const query = { index: 0, position: new THREE.Vector3( .5, .5, 1 ) };
	const faces = createProximity( THREE, target, 'Faces' );
	assert.equal( faces.distance( query ), 1 );
	assert.deepEqual( [ faces.x( query ), faces.y( query ), faces.z( query ) ], [ .5, .5, 0 ] );
	assert.equal( createProximity( THREE, target, 'Edges' ).distance( query ), Math.sqrt( 1.25 ) );
	assert.equal( createProximity( THREE, target, 'Points' ).distance( query ), Math.sqrt( 1.5 ) );

} );

test( 'Seeded surface distribution and instance realization preserve local bounds and UVs', () => {

	const domain = GEOMETRY_DOMAIN;
	const graph = createGeometryGraph();
	const scatter = addNode( graph, 'geometry.distribute', 0, 0 );
	const sphere = addNode( graph, 'geometry.box', 0, 0 );
	const instance = addNode( graph, 'geometry.onPoints', 0, 0 );
	const realize = addNode( graph, 'geometry.realize', 0, 0 );
	scatter.values.count = 30;
	instance.values.scale = .1;
	wire( graph, domain, 'geometry.input', 'geometry', scatter.id, 'geometry' );
	wire( graph, domain, scatter.id, 'points', instance.id, 'points' );
	wire( graph, domain, sphere.id, 'geometry', instance.id, 'mesh' );
	wire( graph, domain, instance.id, 'instances', realize.id, 'instances' );
	wire( graph, domain, realize.id, 'geometry', 'geometry.output', 'geometry' );
	const input = new THREE.PlaneGeometry( 2, 2 ).rotateX( - Math.PI / 2 );
	const output = evaluateGeometryGraph( THREE, graph, input );
	assert.equal( output.attributes.position.count, 30 * 24 );
	assert.equal( output.attributes.uv.count, output.attributes.position.count );
	assert.ok( output.boundingBox.max.y < .051 && output.boundingBox.max.x <= 1.05 );
	assert.deepEqual( output.attributes.position.array, evaluateGeometryGraph( THREE, graph, input ).attributes.position.array );
	scatter.values.count = 0;
	assert.equal( evaluateGeometryGraph( THREE, graph, input ).attributes.position.count, 0 );

} );

test( 'Graph editing preserves compatible wires when duplicating, muting, or reconnecting', () => {

	const graph = createGeometryGraph();
	const domain = GEOMETRY_DOMAIN;
	const a = addNode( graph, 'geometry.transform', 100, 0 );
	const b = addNode( graph, 'geometry.transform', 200, 0 );
	a.values.x = 2;
	const ids = new Set( graph.nodes.map( node => node.id ) );
	assert.equal( makeLinks( graph, domain, ids, true ), 3 );
	assert.equal( graph.links.length, 3 );
	const copies = pasteNodes( graph, domain, copyNodes( graph, new Set( [ a.id, b.id ] ) ), 0, 80 );
	assert.equal( copies.size, 2 );
	assert.equal( graph.links.filter( link => copies.has( link.from.node ) && copies.has( link.to.node ) ).length, 1 );
	const source = new THREE.BoxGeometry();
	assert.notEqual( evaluateGeometryGraph( THREE, graph, source ), source );
	swapNode( graph, domain, b.id, 'geometry.setPosition' );
	assert.equal( graph.nodes.find( node => node.id === b.id ).type, 'geometry.setPosition' );
	assert.ok( graph.links.some( link => link.from.node === a.id && link.to.node === b.id ) );
	assert.ok( graph.links.some( link => link.from.node === b.id && link.to.node === 'geometry.output' ) );
	a.muted = true;
	graph.nodes.find( node => node.id === b.id ).muted = true;
	assert.equal( evaluateGeometryGraph( THREE, graph, source ), source );
	const reconnected = bypassNodes( graph, domain, new Set( [ a.id, b.id ] ) );
	assert.ok( reconnected.links.some( link => link.from.node === 'geometry.input' && link.to.node === 'geometry.output' ) );
	assert.ok( cutsWire( [ { x: 50, y: - 5 }, { x: 50, y: 5 } ], { x: 0, y: 0 }, { x: 100, y: 0 } ) );
	assert.ok( ! cutsWire( [ { x: 50, y: 20 }, { x: 50, y: 30 } ], { x: 0, y: 0 }, { x: 100, y: 0 } ) );

} );
