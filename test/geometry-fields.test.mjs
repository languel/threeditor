import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { createGeometryGraph, evaluateGeometryGraph, GEOMETRY_DOMAIN } from '../editor/js/nodes/GeometryNodes.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';

function wire( graph, from, output, to, input ) {

	connectNodes( graph, GEOMETRY_DOMAIN, { node: from, socket: output }, { node: to, socket: input } );

}

test( 'Fields evaluate per vertex and stored attributes survive reload without changing the source', () => {

	const source = new THREE.BoxGeometry();
	const graph = createGeometryGraph();
	const position = addNode( graph, 'field.position', 0, 0 );
	const select = addNode( graph, 'field.compare', 0, 0 );
	const store = addNode( graph, 'geometry.storeAttribute', 0, 0 );
	const read = addNode( graph, 'field.attribute', 0, 0 );
	const deform = addNode( graph, 'geometry.setPosition', 0, 0 );
	wire( graph, position.id, 'x', select.id, 'a' );
	wire( graph, position.id, 'x', store.id, 'value' );
	wire( graph, 'geometry.input', 'geometry', store.id, 'geometry' );
	wire( graph, store.id, 'geometry', deform.id, 'geometry' );
	wire( graph, select.id, 'value', deform.id, 'selection' );
	wire( graph, read.id, 'value', deform.id, 'y' );
	wire( graph, deform.id, 'geometry', 'geometry.output', 'geometry' );

	const result = evaluateGeometryGraph( THREE, graph, source );
	const positions = source.getAttribute( 'position' );
	const deformed = result.getAttribute( 'position' );
	const weights = result.getAttribute( 'weight' );
	assert.equal( source.hasAttribute( 'weight' ), false );
	assert.equal( deformed.count, positions.count );
	for ( let i = 0; i < positions.count; i ++ ) {

		const x = positions.getX( i );
		assert.equal( weights.getX( i ), x );
		assert.equal( deformed.getY( i ), positions.getY( i ) + Math.max( 0, x ) );

	}
	const loaded = new THREE.ObjectLoader().parse( JSON.parse( JSON.stringify( new THREE.Mesh( result ).toJSON() ) ) );
	assert.deepEqual( loaded.geometry.getAttribute( 'weight' ).array, weights.array );

	store.values.name = 'position';
	assert.throws( () => evaluateGeometryGraph( THREE, graph, source ), /custom scalar attribute/ );

} );

test( 'Seeded per-vertex random fields produce reproducible, bounded values', () => {

	const source = new THREE.BoxGeometry();
	const graph = createGeometryGraph();
	const random = addNode( graph, 'field.random', 0, 0 );
	const store = addNode( graph, 'geometry.storeAttribute', 0, 0 );
	Object.assign( random.values, { seed: 42, min: 2, max: 5 } );
	wire( graph, 'geometry.input', 'geometry', store.id, 'geometry' );
	wire( graph, random.id, 'value', store.id, 'value' );
	wire( graph, store.id, 'geometry', 'geometry.output', 'geometry' );
	const evaluate = () => evaluateGeometryGraph( THREE, graph, source ).getAttribute( 'weight' ).array;
	const first = evaluate();
	assert.deepEqual( first, evaluate() );
	assert.ok( first.every( value => value >= 2 && value <= 5 ) );
	random.values.seed++;
	assert.notDeepEqual( first, evaluate() );

} );
