import * as THREE from 'three';
import { splatScript } from '../assets/SplatObjects.js';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { AddScriptCommand } from '../commands/AddScriptCommand.js';

// Store the same Gaussian records as an imported .splat, embedded so a stroke
// participates in scene undo, duplication, saving and publishing as one object.
export function splatStrokeCommands( editor, mark, color, opacity ) {

	const count = mark.radii.length;
	const bytes = new Uint8Array( count * 32 );
	const data = new DataView( bytes.buffer );
	const rgb = new THREE.Color( color );
	const scale = mark.receiver.getWorldScale( new THREE.Vector3() ).toArray();
	for ( let i = 0; i < count; i ++ ) {

		const offset = i * 32;
		for ( let axis = 0; axis < 3; axis ++ ) {

			data.setFloat32( offset + axis * 4, mark.positions[ i * 3 + axis ], true );
			data.setFloat32( offset + 12 + axis * 4, mark.radii[ i ] / Math.max( 1e-6, Math.abs( scale[ axis ] ) ), true );

		}
		bytes.set( [ Math.round( rgb.r * 255 ), Math.round( rgb.g * 255 ), Math.round( rgb.b * 255 ), Math.round( opacity * 255 ), 255, 128, 128, 128 ], offset + 24 );

	}
	const chunks = [];
	for ( let start = 0; start < bytes.length; start += 8192 ) chunks.push( String.fromCharCode( ...bytes.subarray( start, start + 8192 ) ) );
	const source = btoa( chunks.join( '' ) );
	const object = new THREE.Group();
	object.name = 'Splat stroke';
	object.userData.surfaceMark = true;
	object.userData.assetObject = { type: 'gaussian-splat', splatData: source };
	return [ new AddObjectCommand( editor, object, mark.receiver, false ), new AddScriptCommand( editor, object, splatScript( null, 'splat' ) ) ];

}
