import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from '../build/three.module.js';
import { GEOMETRY_DOMAIN, GEOMETRY_MODIFIER, planGeometryGraph } from '../editor/js/nodes/GeometryNodes.js';
import { addNode, connectNodes, disconnectInput } from '../editor/js/nodes/NodeGraph.js';
let source = await readFile( new URL( '../editor/js/modeling/Modifiers.js', import.meta.url ), 'utf8' );
source = source.replace( "from 'three'", `from '${ new URL( '../build/three.module.js', import.meta.url ).href }'` )
	.replace( /^import .* from '\.\.\/commands\/.*';\n/gm, '' )
	.replace( /from '(\.\.\/nodes\/[^']+)'/g, ( _, path ) => `from '${ new URL( path, new URL( '../editor/js/modeling/Modifiers.js', import.meta.url ) ).href }'` );
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

test( 'Geometry Nodes evaluates typed links in modifier order and round-trips with the mesh', () => {

	const source = new THREE.BoxGeometry();
	const before = JSON.stringify( source.toJSON() );
	const graphModifier = createModifier( GEOMETRY_MODIFIER );
	const graph = graphModifier.params.graph;
	const transform = addNode( graph, 'geometry.transform', 120, 120 );
	const number = addNode( graph, 'value.number', 24, 120 );
	number.values.value = 3;
	const connect = ( from, output, to, input ) => connectNodes( graph, GEOMETRY_DOMAIN, { node: from, socket: output }, { node: to, socket: input } );
	connect( 'geometry.input', 'geometry', transform.id, 'geometry' );
	connect( number.id, 'value', transform.id, 'x' );
	connect( transform.id, 'geometry', 'geometry.output', 'geometry' );

	const array = createModifier( 'ARRAY' );
	const result = evaluateModifiers( source, [ graphModifier, array ] );
	assert.equal( result.boundingBox.min.x, 2.5 );
	assert.equal( result.boundingBox.max.x, 5.5 );
	assert.equal( JSON.stringify( source.toJSON() ), before );

	const mesh = new THREE.Mesh( result, new THREE.MeshStandardMaterial() );
	mesh.userData.modifiers = [ graphModifier, array ];
	const restored = new THREE.ObjectLoader().parse( JSON.parse( JSON.stringify( mesh.toJSON() ) ) );
	assert.deepEqual( restored.userData.modifiers, mesh.userData.modifiers );
	assert.deepEqual( Array.from( restored.geometry.attributes.position.array ), Array.from( result.attributes.position.array ) );
	assert.equal( evaluateModifiers( source, restored.userData.modifiers ).boundingBox.max.x, 5.5 );

} );

test( 'Geometry Nodes rejects incompatible links, cycles and invalid linked values', () => {

	const source = new THREE.BoxGeometry();
	const modifier = createModifier( GEOMETRY_MODIFIER );
	const graph = modifier.params.graph;
	const a = addNode( graph, 'geometry.transform', 120, 120 );
	const b = addNode( graph, 'geometry.transform', 240, 120 );
	const number = addNode( graph, 'value.number', 24, 120 );
	const connect = ( from, output, to, input ) => connectNodes( graph, GEOMETRY_DOMAIN, { node: from, socket: output }, { node: to, socket: input } );
	connect( 'geometry.input', 'geometry', a.id, 'geometry' );
	connect( a.id, 'geometry', b.id, 'geometry' );
	const links = structuredClone( graph.links );
	assert.throws( () => connect( b.id, 'geometry', a.id, 'geometry' ), /cycle/ );
	assert.throws( () => connect( number.id, 'value', a.id, 'geometry' ), /same type/ );
	assert.deepEqual( graph.links, links );

	connect( number.id, 'value', a.id, 'scale' );
	assert.equal( evaluateModifiers( source, [ modifier ] ).boundingBox.max.x, .5 );
	connect( b.id, 'geometry', 'geometry.output', 'geometry' );
	assert.throws( () => evaluateModifiers( source, [ modifier ] ), /Scale must be between/ );

	disconnectInput( graph, { node: a.id, socket: 'geometry' } );
	assert.match( planGeometryGraph( graph ).missing, /Connect Geometry/ );
	assert.equal( evaluateModifiers( source, [ modifier ] ).boundingBox.max.x, .5 );

} );

test( 'Geometry Nodes primitive output preserves renderable groups across save and reload', () => {

	const source = new THREE.BoxGeometry();
	const modifier = createModifier( GEOMETRY_MODIFIER );
	const graph = modifier.params.graph;
	const box = addNode( graph, 'geometry.box', 120, 120 );
	box.values.width = 4;
	connectNodes( graph, GEOMETRY_DOMAIN, { node: box.id, socket: 'geometry' }, { node: 'geometry.output', socket: 'geometry' } );
	const result = evaluateModifiers( source, [ modifier ] );
	const json = JSON.parse( JSON.stringify( result.toJSON() ) );
	const restored = new THREE.ObjectLoader().parseGeometries( [ json ] )[ json.uuid ];
	assert.deepEqual( restored.groups, [ { start: 0, count: result.index.count, materialIndex: 0 } ] );
	assert.equal( result.boundingBox.max.x, 2 );

} );
