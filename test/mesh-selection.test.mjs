import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meshEdges, edgeLoop, applySelection, elementKey, selectionRegionContains } from '../editor/js/modeling/MeshSelection.js';
const grid = { points: Array.from( { length: 12 }, ( _, i ) => [ i % 4, Math.floor( i / 4 ), 0 ] ), faces: [] };
for ( let y = 0; y < 2; y ++ ) for ( let x = 0; x < 3; x ++ ) { const a = y * 4 + x; grid.faces.push( [ a, a + 1, a + 5, a + 4 ] ); }

test( 'Edge selections remain independent when sharing vertices and support subtract/toggle/intersection', () => {

	let selected = applySelection( new Map(), [ [ 0, 1 ], [ 1, 2 ] ] );
	selected = applySelection( selected, [ [ 1, 0 ] ], 'toggle' );
	assert.deepEqual( [ ...selected.values() ], [ [ 1, 2 ] ] );
	selected = applySelection( selected, [ [ 2, 3 ] ], 'extend' );
	selected = applySelection( selected, [ [ 1, 2 ] ], 'intersect' );
	assert.equal( selected.size, 1 );
	assert.equal( applySelection( selected, [ [ 2, 1 ] ], 'subtract' ).size, 0 );

} );

test( 'Quad edge rings walk opposite edges across a strip and stop at boundaries', () => {

	assert.equal( meshEdges( grid ).length, 17 );
	const ring = edgeLoop( grid, [ 1, 5 ], true ).map( elementKey );
	assert.deepEqual( new Set( ring ), new Set( [ '0:4', '1:5', '2:6', '3:7' ] ) );
	const loop = edgeLoop( grid, [ 1, 5 ] ).map( elementKey );
	assert.ok( loop.includes( '5:9' ) );
	assert.ok( ! loop.includes( '1:2' ) );

} );

test( 'Circle selection covers the path between widely spaced pointer samples', () => {

	const start = [ 4, 10 ], end = [ 96, 10 ];
	const drag = { tool: 'circle', start, end, polygon: [ start, end ] };
	assert.equal( selectionRegionContains( drag, [ 50, 12 ], 3 ), true );
	assert.equal( selectionRegionContains( drag, [ 50, 14 ], 3 ), false );

} );

test( 'Shapes and paths expose selectable outline edges without mesh face data', async () => {

	const { selectionCandidates } = await import( '../editor/js/modeling/MeshSelection.js' );
	const shape = { kind: 'shape', points: [ [ 0, 0, 0 ], [ 1, 0, 0 ], [ 1, 1, 0 ], [ 0, 1, 0 ] ], closed: true };
	assert.equal( meshEdges( shape ).length, 4 );
	assert.deepEqual( selectionCandidates( shape, 'face' ), [ [ 0, 1, 2, 3 ] ] );
	const path = { ...shape, kind: 'path', closed: false };
	assert.equal( meshEdges( path ).length, 3 );
	assert.deepEqual( selectionCandidates( path, 'face' ), [] );
	assert.equal( meshEdges( { ...path, closed: true } ).length, 4 );
	assert.equal( meshEdges( { kind: 'mesh', profile: true, points: shape.points, faces: [] } ).length, 3 );

} );
