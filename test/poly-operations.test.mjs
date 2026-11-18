import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cutAcrossMesh, splitFace, loopCut, dissolveEdge, autoQuad } from '../editor/js/modeling/PolyOperations.js';
import * as THREE from '../build/three.module.js';
import { addFace, extrudeFace, modelGeometry, readModelGeometry } from '../editor/js/modeling/ModelGeometry.js';
const quad = () => ( { kind: 'mesh', points: [ [ 0, 0, 0 ], [ 2, 0, 0 ], [ 2, 2, 0 ], [ 0, 2, 0 ] ], faces: [ [ 0, 1, 2, 3 ] ] } );
const project = p => [ p[ 0 ] * 100, p[ 1 ] * 100 ];

test( 'Knife and extrusion preserve assigned face materials and interpolate atlas UVs', () => {

	const data = quad();
	data.faces[ 0 ].surface = { slot: 2, channels: {
		uv: [ [ .25, .25 ], [ .75, .25 ], [ .75, .75 ], [ .25, .75 ] ],
		uv1: [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ]
	} };
	const restored = new THREE.ObjectLoader().parseGeometries( [ modelGeometry( THREE, data ).toJSON() ] );
	const draft = readModelGeometry( Object.values( restored )[ 0 ] );
	const cut = cutAcrossMesh( draft, [ -10, 100 ], [ 210, 100 ], project );
	assert.equal( draft.faces.length, 2 );
	for ( const face of draft.faces ) {

		assert.equal( face.surface.slot, 2 );
		for ( const point of cut ) assert.equal( face.surface.channels.uv[ face.indexOf( point ) ][ 1 ], .5 );

	}
	const uv = draft.faces[ 0 ].surface.channels.uv.map( point => point.slice() );
	extrudeFace( THREE, draft, 0, .5 );
	assert.deepEqual( draft.faces[ 0 ].surface.channels.uv, uv );
	assert.ok( modelGeometry( THREE, draft ).groups.every( group => group.materialIndex === 2 ) );

} );

test( 'Dissolving a material boundary leaves the mesh unchanged', () => {

	const data = quad();
	splitFace( data, 0, 0, 2 );
	data.faces[ 0 ].surface = { slot: 0, channels: {} };
	data.faces[ 1 ].surface = { slot: 1, channels: {} };
	const before = structuredClone( data );
	assert.throws( () => dissolveEdge( data, [ 0, 2 ] ), /material slots/ );
	assert.deepEqual( data, before );

} );

test( 'Knife cuts a polygon with shared edge vertices and preserves undo input isolation', () => {

	const original = quad(), data = structuredClone( original );
	const ids = cutAcrossMesh( data, [ - 10, 100 ], [ 210, 100 ], project );
	assert.equal( ids.length, 2 ); assert.equal( data.faces.length, 2 );
	assert.ok( data.faces.every( f => ids.every( i => f.includes( i ) ) ) );
	assert.equal( original.points.length, 4 );
	assert.equal( original.faces.length, 1 );
	assert.ok( dissolveEdge( data, ids ) );
	assert.equal( data.faces.length, 1 );

} );

test( 'Knife seeded with existing vertices makes a diagonal instead of coincident geometry', () => {

	const data = quad();
	const ids = cutAcrossMesh( data, project( data.points[ 0 ] ), project( data.points[ 2 ] ), project, undefined, [ 0, 2 ] );
	assert.equal( data.points.length, 4 ); assert.equal( data.faces.length, 2 ); assert.equal( ids.length, 2 );
	assert.ok( data.faces.every( f => f.length === 3 ) );
	assert.equal( splitFace( data, 0, 0, 1 ), false );

} );

test( 'Loop cuts traverse connected quads with aligned fractional positions', () => {

	const data = { points: [ [ 0, 0, 0 ], [ 1, 0, 0 ], [ 2, 0, 0 ], [ 0, 1, 0 ], [ 1, 1, 0 ], [ 2, 1, 0 ] ], faces: [ [ 0, 1, 4, 3 ], [ 1, 2, 5, 4 ] ] };
	const ids = loopCut( data, [ 1, 4 ], .25 );
	assert.equal( ids.length, 3 ); assert.equal( data.faces.length, 4 );
	for ( const id of ids ) assert.equal( data.points[ id ][ 1 ], .25 );
	assert.ok( data.faces.every( f => f.length === 4 ) );

} );


test( 'AutoQuad closes a missing patch from nearby open boundaries without duplicate faces', () => {

	const data = { kind: 'mesh', points: [ [ 0, 0, 0 ], [ 1, 0, 0 ], [ 2, 0, 0 ], [ 0, 1, 0 ], [ 1, 1, 0 ], [ 2, 1, 0 ] ], faces: [ [ 0, 1, 4, 3 ], [ 1, 2, 5 ] ] };
	assert.equal( autoQuad( THREE, data, [ 150, 60 ], project, addFace, 200 ), true );
	assert.equal( data.faces.length, 3 );
	assert.ok( data.faces.every( face => new Set( face ).size === face.length ) );

} );
