import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from '../build/three.module.js';
let source = await readFile( new URL( '../editor/js/modeling/Modifiers.js', import.meta.url ), 'utf8' );
source = source.replace( "from 'three'", `from '${ new URL( '../build/three.module.js', import.meta.url ).href }'` ).replace( /^import .* from '\.\.\/commands\/.*';\n/gm, '' );
const { evaluateModifiers, createModifier } = await import( 'data:text/javascript;base64,' + Buffer.from( source ).toString( 'base64' ) );

test( 'Modifier order is deterministic and preserves its source and UVs', () => {

	const source = new THREE.BoxGeometry( 1, 1, 1 );
	const before = JSON.stringify( source.toJSON() );
	const offset = createModifier( 'OFFSET' ); offset.params.x = 3;
	const mirror = createModifier( 'MIRROR' );
	const result = evaluateModifiers( source, [ offset, mirror ] );
	assert.equal( result.boundingBox.min.x, - 3.5 );
	assert.equal( result.boundingBox.max.x, 3.5 );
	assert.equal( result.attributes.uv.count, result.attributes.position.count );
	assert.equal( result.groups.length, 12 );
	assert.equal( JSON.stringify( source.toJSON() ), before );
	const reversed = evaluateModifiers( source, [ mirror, offset ] );
	assert.equal( reversed.boundingBox.min.x, 2.5 );
	mirror.enabled = false;
	assert.equal( evaluateModifiers( source, [ offset, mirror ] ).attributes.position.count, source.attributes.position.count );

} );

test( 'Subdivision keeps material groups and triangle area; noise does not split UV seams', () => {

	const source = new THREE.BoxGeometry();
	const result = evaluateModifiers( source, [ createModifier( 'SUBDIVIDE' ) ] );
	assert.equal( result.attributes.position.count, 36 * 4 );
	assert.equal( result.groups.length, 6 );
	assert.equal( result.boundingBox.getSize( new THREE.Vector3() ).x, 1 );
	const noise = evaluateModifiers( source, [ createModifier( 'NOISE' ) ] );
	const values = new Map();
	for ( let i = 0; i < source.attributes.position.count; i ++ ) {

		const key = new THREE.Vector3().fromBufferAttribute( source.attributes.position, i ).toArray().join();
		const point = new THREE.Vector3().fromBufferAttribute( noise.attributes.position, i ).toArray();
		if ( values.has( key ) ) assert.deepEqual( values.get( key ), point );
		values.set( key, point );

	}

} );

test( 'Curve subdivision, simplification, smoothing and wave retain finite geometry', () => {

	const curve = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3(), new THREE.Vector3( 1, 1, 0 ), new THREE.Vector3( 2, 0, 0 ) ] );
	const subdivided = evaluateModifiers( curve, [ createModifier( 'SUBDIVIDE' ) ], false );
	assert.equal( subdivided.attributes.position.count, 5 );
	const simplify = createModifier( 'SIMPLIFY' ); simplify.params.factor = 10;
	assert.equal( evaluateModifiers( subdivided, [ simplify ], false ).attributes.position.count, 2 );
	const smooth = evaluateModifiers( curve, [ createModifier( 'SMOOTH' ), createModifier( 'WAVE' ) ], false );
	assert.ok( Array.from( smooth.attributes.position.array ).every( Number.isFinite ) );
	assert.equal( curve.attributes.position.getY( 1 ), 1 );
	const array = createModifier( 'ARRAY' ); array.params.count = 2;
	assert.equal( evaluateModifiers( curve, [ array ], false ).attributes.position.count, 3 );

} );
