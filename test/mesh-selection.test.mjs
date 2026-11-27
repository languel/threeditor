import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectionRegionContains, selectionRegionIntersectsPolygon, selectionRegionIntersectsSegment, meshEdges, edgeLoop, applySelection, connectedSelection, elementKey } from '../editor/js/modeling/MeshSelection.js';
const grid = { points: Array.from( { length: 12 }, ( _, i ) => [ i % 4, Math.floor( i / 4 ), 0 ] ), faces: [] };
for ( let y = 0; y < 2; y ++ ) for ( let x = 0; x < 3; x ++ ) { const a = y * 4 + x; grid.faces.push( [ a, a + 1, a + 5, a + 4 ] ); }

test( 'Linked selection stays on its island in every element mode', () => {

	const data = { points: [ ...grid.points, [ 0, 0, 1 ], [ 1, 0, 1 ], [ 0, 1, 1 ] ], faces: [ ...grid.faces, [ 12, 13, 14 ] ] };
	assert.equal( connectedSelection( data, 'vertex', [ [ 0 ] ], 'linked' ).length, 12 );
	assert.deepEqual( connectedSelection( data, 'edge', [ [ 12, 13 ] ], 'linked' ).map( elementKey ).sort(), [ '12:13', '12:14', '13:14' ] );
	assert.deepEqual( connectedSelection( data, 'face', [ [ 12, 13, 14 ] ], 'linked' ), [ [ 12, 13, 14 ] ] );

} );

test( 'More and less use one step along mesh edges and curve segments', () => {

	const seed = grid.faces[ 0 ];
	const grown = connectedSelection( grid, 'face', [ seed ], 'more' );
	assert.deepEqual( new Set( grown ), new Set( [ grid.faces[ 0 ], grid.faces[ 1 ], grid.faces[ 3 ] ] ) );
	assert.deepEqual( connectedSelection( grid, 'face', grown, 'less' ), [ seed ] );
	const path = { kind: 'path', points: grid.points.slice( 0, 5 ) };
	assert.deepEqual( connectedSelection( path, 'vertex', [ [ 2 ] ], 'more' ).flat().sort(), [ 1, 2, 3 ] );
	assert.deepEqual( connectedSelection( path, 'vertex', [ [ 1 ], [ 2 ], [ 3 ] ], 'less' ), [ [ 2 ] ] );

} );

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

test( 'Partial selection catches crossing edges and faces that surround a selection region', () => {

	const face = [ [ -8, -8 ], [ 14, -8 ], [ 14, 14 ], [ -8, 14 ] ];
	const box = { tool: 'box', start: [ 0, 0 ], end: [ 2, 2 ], polygon: [] };
	assert.equal( selectionRegionIntersectsPolygon( box, face, 0 ), true );
	assert.equal( selectionRegionIntersectsSegment( box, [ -5, 1 ], [ 6, 1 ], 0 ), true );
	assert.equal( selectionRegionIntersectsSegment( box, [ -5, 3 ], [ 6, 3 ], 0 ), false );

	const lasso = { ...box, tool: 'lasso', polygon: [ [ 0, 0 ], [ 3, 3 ], [ 3, 0 ] ] };
	assert.equal( selectionRegionIntersectsSegment( lasso, [ -5, 1 ], [ 6, 1 ], 0 ), true );
	assert.equal( selectionRegionIntersectsPolygon( lasso, face, 0 ), true );
	const circle = { ...box, tool: 'circle', end: [ 12, 0 ], polygon: [ [ 0, 0 ], [ 12, 0 ] ] };
	assert.equal( selectionRegionIntersectsSegment( circle, [ 6, -.5 ], [ 6, 1 ], 1 ), true );
	assert.equal( selectionRegionIntersectsSegment( circle, [ 6, 2 ], [ 6, 3 ], 1 ), false );

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
