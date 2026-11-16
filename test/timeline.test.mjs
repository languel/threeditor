import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { availableTargets, timelineBinding } from '../editor/js/animation/TimelineBindings.js';
import { putKey, targetId, timelineEnd, valueAt } from '../editor/js/animation/TimelineData.js';

test( 'Timeline keys interpolate and hold exact values at clip boundaries', () => {

	const track = { keys: [] };
	putKey( track, 2, [ 8, 4, 0 ] );
	putKey( track, 0, [ 0, 0, 2 ], 'ease' );
	assert.deepEqual( valueAt( track.keys, 1 ), [ 4, 2, 1 ] );
	putKey( track, 0, [ 4, 0, 2 ] );
	assert.equal( track.keys.length, 2 );
	assert.equal( track.keys[ 0 ].interpolation, 'ease' );
	assert.deepEqual( valueAt( track.keys, 3 ), [ 8, 4, 0 ] );
	assert.equal( valueAt( [ { time: 0, value: '#000000' }, { time: 2, value: '#ffffff' } ], 1 ), '#808080' );
	assert.equal( valueAt( [ { time: 0, value: false, interpolation: 'hold' }, { time: 2, value: true } ], 1.5 ), false );
	assert.equal( timelineEnd( { clips: [ { start: 3, duration: 2 }, { start: 8, duration: 1 } ] } ), 9 );

} );

test( 'Timeline bindings update the serialized transform and retain script addressing after reordering', () => {

	const scene = new THREE.Scene();
	const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshBasicMaterial() );
	scene.add( mesh );
	const script = { timelineId: 'drive', source: '// @param speed = 1', name: 'Motion' };
	const scripts = { [ mesh.uuid ]: [ script ] };
	let written;
	const context = { scripts, object: uuid => scene.getObjectByProperty( 'uuid', uuid ), getParam: () => 1,
		setParam: ( ...args ) => { written = args; } };
	const targets = availableTargets( mesh, scripts );
	const position = timelineBinding( context, targets.find( entry => entry.property === 'position' ) );
	position.write( [ 4, 1, 0 ] );
	assert.deepEqual( mesh.toJSON().object.matrix.slice( 12, 15 ), [ 4, 1, 0 ] );
	const target = targets.find( entry => entry.kind === 'script' );
	scripts[ mesh.uuid ].unshift( { name: 'Unrelated' } );
	assert.equal( targetId( target ), targetId( { ...target, index: 1 } ) );
	timelineBinding( context, target ).write( 2 );
	assert.deepEqual( written, [ mesh.uuid, 1, 'speed', 2 ] );

} );

test( 'The picker exposes shadow, fog, inherited material and per-map texture values', () => {

	const scene = new THREE.Scene();
	scene.fog = new THREE.Fog( '#000000', 1, 10 );
	const light = new THREE.SpotLight();
	const material = new THREE.MeshPhysicalMaterial( { map: new THREE.Texture(), normalMap: new THREE.Texture() } );
	const mesh = new THREE.Mesh( new THREE.BoxGeometry(), material );
	scene.add( light, mesh );
	const context = { scripts: {}, object: uuid => scene.getObjectByProperty( 'uuid', uuid ) };
	const find = ( object, kind, property ) => availableTargets( object, {} ).find( target => target.kind === kind && target.property === property );

	timelineBinding( context, find( light, 'shadow', 'bias' ) ).write( 0.1 );
	assert.equal( light.shadow.bias, 0.1 );
	timelineBinding( context, find( scene, 'fog', 'color' ) ).write( '#ff0000' );
	assert.equal( scene.fog.color.getHexString(), 'ff0000' );
	timelineBinding( context, find( mesh, 'material', 'clearcoat' ) ).write( 0.7 );
	assert.equal( material.clearcoat, 0.7 );

	const distance = timelineBinding( context, find( mesh, 'material', 'attenuationDistance' ) );
	assert.equal( distance.read(), 'Infinity' );
	distance.write( 3 );
	assert.equal( material.attenuationDistance, 3 );
	distance.write( 'Infinity' );
	assert.equal( material.attenuationDistance, Infinity );

	const offsets = availableTargets( mesh, {} ).filter( target => target.kind === 'texture' && target.property === 'offset' );
	assert.equal( offsets.length, 2 );
	assert.notEqual( targetId( offsets[ 0 ] ), targetId( offsets[ 1 ] ) );
	timelineBinding( context, offsets.find( target => target.map === 'map' ) ).write( [ 0.2, 0.3 ] );
	assert.deepEqual( material.map.offset.toArray(), [ 0.2, 0.3 ] );
	assert.deepEqual( material.normalMap.offset.toArray(), [ 0, 0 ] );

} );
