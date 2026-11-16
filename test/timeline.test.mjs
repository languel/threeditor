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
