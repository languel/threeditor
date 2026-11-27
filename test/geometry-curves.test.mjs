import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { createGeometryGraph, evaluateGeometryGraph, GEOMETRY_DOMAIN } from '../editor/js/nodes/GeometryNodes.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';

function node( graph, type, values = {} ) {

	const entry = addNode( graph, type, 0, 0 );
	Object.assign( entry.values, values );
	return entry.id;

}

function wire( graph, from, output, to, input ) {

	connectNodes( graph, GEOMETRY_DOMAIN, { node: from, socket: output }, { node: to, socket: input } );

}

test( 'Curve to Mesh sweeps a cyclic profile, tapers it, and gives cap and UV seams consistent normals', () => {

	const graph = createGeometryGraph();
	const path = node( graph, 'curve.line', { end: [ 0, 4, 0 ] } );
	const resample = node( graph, 'curve.resample', { count: 3 } );
	const profile = node( graph, 'curve.circle', { radius: 1, resolution: 8 } );
	const index = node( graph, 'field.index' );
	const taper = node( graph, 'field.expression', { expression: '1 - 0.5 * x' } );
	const sweep = node( graph, 'curve.mesh' );
	wire( graph, path, 'curve', resample, 'curve' );
	wire( graph, resample, 'curve', sweep, 'curve' );
	wire( graph, profile, 'curve', sweep, 'profile' );
	wire( graph, index, 'fraction', taper, 'x' );
	wire( graph, taper, 'value', sweep, 'scale' );
	wire( graph, sweep, 'geometry', 'geometry.output', 'geometry' );

	const mesh = evaluateGeometryGraph( THREE, JSON.parse( JSON.stringify( graph ) ), new THREE.BoxGeometry() );
	const { position, normal, uv } = mesh.attributes;
	assert.equal( position.count, 43 );
	assert.equal( mesh.index.count, 132 );
	assert.equal( position.getX( 0 ), 1 );
	assert.equal( position.getX( 9 ), .75 );
	assert.equal( position.getX( 18 ), .5 );
	assert.equal( position.getY( 18 ), 4 );
	assert.ok( normal.getX( 0 ) > .9 );
	assert.equal( normal.getX( 0 ), normal.getX( 8 ) );
	assert.equal( normal.getY( 27 ), - 1 );
	assert.equal( normal.getY( 35 ), 1 );
	assert.equal( uv.getY( 0 ), 0 );
	assert.equal( uv.getY( 8 ), 1 );

} );

test( 'Trim, reverse, join, sample and resample feed an instanced mesh through ordinary graph sockets', () => {

	const graph = createGeometryGraph();
	const line = node( graph, 'curve.line', { end: [ 0, 4, 0 ] } );
	const trim = node( graph, 'curve.trim', { mode: 'Length', start: 1, end: 3 } );
	const reverse = node( graph, 'curve.reverse' );
	const other = node( graph, 'curve.line', { start: [ 0, 7, 0 ], end: [ 0, 9, 0 ] } );
	const join = node( graph, 'curve.join' );
	const sample = node( graph, 'curve.sample', { at: .125 } );
	const length = node( graph, 'curve.length' );
	const split = node( graph, 'vector.separate' );
	const points = node( graph, 'curve.points', { mode: 'Count', count: 3 } );
	const box = node( graph, 'geometry.box' );
	const scatter = node( graph, 'geometry.onPoints', { align: false } );
	const realize = node( graph, 'geometry.realize' );
	const move = node( graph, 'geometry.transform' );
	for ( const connection of [
		[ line, 'curve', trim, 'curve' ], [ trim, 'curve', reverse, 'curve' ],
		[ reverse, 'curve', join, 'curve' ], [ other, 'curve', join, 'other' ],
		[ join, 'curve', points, 'curve' ], [ join, 'curve', sample, 'curve' ],
		[ join, 'curve', length, 'curve' ], [ sample, 'position', split, 'vector' ],
		[ split, 'y', move, 'z' ], [ length, 'length', move, 'x' ],
		[ box, 'geometry', scatter, 'mesh' ], [ points, 'points', scatter, 'points' ],
		[ scatter, 'instances', realize, 'instances' ], [ realize, 'geometry', move, 'geometry' ],
		[ move, 'geometry', 'geometry.output', 'geometry' ]
	] ) wire( graph, ...connection );

	const mesh = evaluateGeometryGraph( THREE, graph, new THREE.BoxGeometry() );
	assert.equal( mesh.attributes.position.count, 6 * 24 );
	assert.deepEqual( mesh.boundingBox.min.toArray(), [ 3.5, .5, 2 ] );
	assert.deepEqual( mesh.boundingBox.max.toArray(), [ 4.5, 9.5, 3 ] );

} );
