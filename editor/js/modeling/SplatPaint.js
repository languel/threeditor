import * as THREE from 'three';
import { splatScript } from '../assets/SplatObjects.js';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { AddScriptCommand } from '../commands/AddScriptCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';

const recordSize = 32;
const batchBytes = 2048 * recordSize;
const defaultScript = splatScript( null, 'splat' );

function strokeRecords( mark, color, opacity ) {

	const count = mark.radii.length;
	const bytes = new Uint8Array( count * recordSize );
	const data = new DataView( bytes.buffer );
	const rgb = new THREE.Color( color );
	const scale = mark.receiver.getWorldScale( new THREE.Vector3() ).toArray();
	for ( let i = 0; i < count; i ++ ) {

		const offset = i * recordSize;
		for ( let axis = 0; axis < 3; axis ++ ) {

			data.setFloat32( offset + axis * 4, mark.positions[ i * 3 + axis ], true );
			data.setFloat32( offset + 12 + axis * 4, mark.radii[ i ] / Math.max( 1e-6, Math.abs( scale[ axis ] ) ), true );

		}
		bytes.set( [ Math.round( rgb.r * 255 ), Math.round( rgb.g * 255 ), Math.round( rgb.b * 255 ), Math.round( opacity * 255 ), 255, 128, 128, 128 ], offset + 24 );

	}
	return bytes;

}

function recordsToString( bytes ) {

	let result = '';
	for ( let offset = 0; offset < bytes.length; offset += 8192 ) result += String.fromCharCode( ...bytes.subarray( offset, offset + 8192 ) );
	return result;

}

function canAppend( editor, object ) {

	const data = object.userData.assetObject;
	if ( ! data?.paintBatch || typeof data.splatData !== 'string' || ! isVisible( object ) || hasRestriction( object, 'locked' ) ) return false;
	const { position, quaternion, scale } = object;
	if ( ! object.matrixAutoUpdate || position.lengthSq() || quaternion.x || quaternion.y || quaternion.z ||
		scale.x !== 1 || scale.y !== 1 || scale.z !== 1 ) return false;
	const scripts = editor.scripts[ object.uuid ];
	return scripts?.length === 1 && scripts[ 0 ].assetBehavior === 'splat' && scripts[ 0 ].enabled !== false &&
		scripts[ 0 ].source === defaultScript.source && Object.keys( scripts[ 0 ].paramValues || {} ).length === 0;

}

// Use embedded .splat records for the same loader in the editor, Play and export.
// Bound the batches so appending and undoing only rebuild the end of a cloud.
export function splatStrokeCommands( editor, mark, color, opacity ) {

	const bytes = strokeRecords( mark, color, opacity );
	const commands = [];
	const batch = mark.receiver.children.findLast( object => canAppend( editor, object ) );
	let offset = 0;
	if ( batch ) {

		const data = batch.userData.assetObject;
		const existing = atob( data.splatData );
		offset = Math.min( bytes.length, Math.max( 0, batchBytes - existing.length ) );
		if ( offset ) {

			const assetObject = { ...data, splatData: btoa( existing + recordsToString( bytes.subarray( 0, offset ) ) ) };
			const append = new SetValueCommand( editor, batch, 'userData', { ...batch.userData, assetObject } );
			append.updatable = false;
			commands.push( append );

		}

	}
	for ( ; offset < bytes.length; offset += batchBytes ) {

		const object = new THREE.Group();
		object.name = 'Splat paint';
		object.userData.surfaceMark = true;
		object.userData.assetObject = { type: 'gaussian-splat', paintBatch: true, splatData: btoa( recordsToString( bytes.subarray( offset, offset + batchBytes ) ) ) };
		commands.push( new AddObjectCommand( editor, object, mark.receiver, false ), new AddScriptCommand( editor, object, { ...defaultScript } ) );

	}
	return commands;

}
