import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { addFace, extrudeFace, modelData, modelGeometry, modelObject, outlinePoints, removePoints, splitEdge } from '../editor/js/modeling/ModelGeometry.js';
import { applyProjectionMask, maskFromOutline } from '../editor/js/modeling/ProjectionMask.js';
import { projectorScript, upgradeProjectorScript } from '../editor/js/assets/Projector.js';
import { generateThreeCode } from '../editor/js/ThreeCodeExporter.js';

test( 'Authored polygon topology persists through split, extrusion, serialization and deletion', () => {

	const data = modelData( 'mesh' );
	const midpoint = splitEdge( data, 0, 1 );
	assert.deepEqual( data.faces[ 0 ], [ 0, midpoint, 1, 2, 3 ] );
	assert.throws( () => addFace( THREE, data, [ 0, midpoint, 1 ] ), /area/ );
	assert.throws( () => splitEdge( data, 0, 2 ), /existing edge/ );
	const cap = extrudeFace( THREE, data, 0, .5 );
	assert.equal( data.faces.length, 6 );
	assert.equal( data.points[ cap[ 0 ] ][ 2 ], .5 );
	const object = modelObject( THREE, data, 'Mesh' );
	const restored = new THREE.ObjectLoader().parse( object.toJSON() );
	assert.deepEqual( restored.geometry.userData.modeling, data );
	assert.ok( restored.geometry.attributes.position.count >= 30 );
	assert.equal( restored.geometry.attributes.position.count, restored.geometry.attributes.uv.count );
	removePoints( data, cap );
	assert.ok( data.faces.every( face => face.every( index => index < data.points.length ) ) );

} );

test( 'A closed curve can become an extruded receiver or a normalized projector aperture', () => {

	const shape = modelData( 'shape' );
	shape.smooth = true;
	shape.depth = .45;
	const outline = outlinePoints( THREE, shape );
	assert.ok( outline.length > shape.points.length );
	const geometry = modelGeometry( THREE, shape );
	geometry.computeBoundingBox();
	assert.ok( Math.abs( geometry.boundingBox.max.z - .45 ) < 1e-6 );
	const mask = maskFromOutline( outline.map( point => point.toArray() ) );
	assert.equal( mask.mode, 'inside' );
	assert.ok( mask.points.flat().every( value => value >= .1 && value <= .9 ) );

} );

test( 'Projector masking uses the optical rectangle and survives source export and legacy upgrade', () => {

	const mask = { mode: 'inside', points: [ [ .2, .3 ], [ .8, .3 ], [ .5, .7 ] ] };
	const calls = [];
	const context = new Proxy( {}, { get: ( target, key ) => ( ...args ) => calls.push( [ key, ...args ] ) } );
	applyProjectionMask( context, mask, 10, 20, 100, 50 );
	assert.deepEqual( calls.find( call => call[ 0 ] === 'rect' ), [ 'rect', 10, 20, 100, 50 ] );
	assert.deepEqual( calls.find( call => call[ 0 ] === 'moveTo' ), [ 'moveTo', 30, 35 ] );
	assert.deepEqual( calls.find( call => call[ 0 ] === 'fill' ), [ 'fill', 'evenodd' ] );
	calls.length = 0;
	applyProjectionMask( context, { ...mask, mode: 'cutout' }, 10, 20, 100, 50 );
	assert.ok( ! calls.some( call => call[ 0 ] === 'rect' ) );

	const scene = new THREE.Scene(), rig = new THREE.Group();
	rig.userData = { assetObject: { type: 'projector' }, projectionMask: mask };
	scene.add( rig, modelObject( THREE, modelData( 'path' ), 'Curve' ) );
	const script = projectorScript();
	const { code } = generateThreeCode( {
		scene, camera: new THREE.PerspectiveCamera(), scripts: { [ rig.uuid ]: [ script ] }, config: { getKey() {} }
	} );
	assert.match( code, /\.userData\.projectionMask =/ );
	assert.match( code, /g\.userData\.modeling =/ );
	assert.match( code, /applyProjectionMask\( ctx, root\.userData\.projectionMask/ );
	const legacy = { assetBehavior: 'projector', source: 'function projectorRuntime( THREE, root, player ) {\n\t\ttexture.needsUpdate = true;\n}' };
	upgradeProjectorScript( legacy );
	const upgraded = legacy.source;
	assert.match( upgraded, /applyProjectionMask\( ctx, root\.userData\.projectionMask/ );
	upgradeProjectorScript( legacy );
	assert.equal( legacy.source, upgraded );

} );
