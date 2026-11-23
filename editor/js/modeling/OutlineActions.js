import * as THREE from 'three';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { canEditLightMask, addLightMaskShape } from './LightMask.js?v=mask-editor';
import { lightViewCamera } from './LightView.js';
import { isClosedOutline, meshFromOutline, faceNormal, modelGeometry, modelObject, outlinePoints } from './ModelGeometry.js?v=texture-projection';
import { maskFromOutline } from './ProjectionMask.js';

export function outlineActions( editor, object ) {

	const data = object?.geometry?.userData.modeling;
	if ( ! data || ! [ 'path', 'shape' ].includes( data.kind ) || hasRestriction( object, 'disabled' ) ) return [];
	const closed = isClosedOutline( data );
	const actions = [];
	const add = ( label, run ) => actions.push( { label, section: 'Outline', run: () => editor.viewTools.run( run ) } );
	if ( ! closed && data.points.length >= 3 && ! hasRestriction( object, 'locked' ) ) {

		add( 'Close outline', () => editor.execute( new SetGeometryCommand( editor, object,
			modelGeometry( THREE, { ...data, closed: true } ) ), 'Close outline' ) );

	}
	if ( closed && data.points.length >= 3 ) {

		if ( data.kind === 'path' ) {

			const origin = new THREE.Vector3( ...data.points[ 0 ] ).multiply( object.scale );
			const vertices = data.points.map( point => new THREE.Vector3( ...point ).multiply( object.scale ).sub( origin ) );
			const normal = faceNormal( THREE, { points: vertices.map( point => point.toArray() ) }, data.points.map( ( _, i ) => i ) );
			const extent = vertices.reduce( ( max, point ) => Math.max( max, point.length() ), 0 );
			if ( normal && vertices.every( point => Math.abs( normal.dot( point ) ) <= extent * 1e-4 ) ) add( 'Convert path to shape', () => {

				const rotation = new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 0, 1 ), normal );
				const inverse = rotation.clone().invert();
				const points = vertices.map( point => point.applyQuaternion( inverse ).setZ( 0 ).toArray() );
				const output = modelObject( THREE, { ...data, kind: 'shape', points, closed: true, planar: true, depth: 0 }, object.name + ' shape' );
				output.position.copy( origin ).applyQuaternion( object.quaternion ).add( object.position );
				output.quaternion.copy( object.quaternion ).multiply( rotation );
				editor.execute( new AddObjectCommand( editor, output, object.parent ), 'Convert outline to shape' );

			} );

		} else add( 'Convert shape to path', () => {

			const output = modelObject( THREE, { ...data, kind: 'path', closed: true, planar: true, depth: 0 }, object.name + ' path' );
			output.position.copy( object.position );
			output.quaternion.copy( object.quaternion );
			output.scale.copy( object.scale );
			editor.execute( new AddObjectCommand( editor, output, object.parent ), 'Convert outline to path' );

		} );
		add( 'Convert outline to mesh', () => {

			const output = modelObject( THREE, meshFromOutline( THREE, data ), object.name + ' mesh' );
			output.position.copy( object.position );
			output.quaternion.copy( object.quaternion );
			output.scale.copy( object.scale );
			editor.execute( new AddObjectCommand( editor, output, object.parent ), 'Convert outline to mesh' );

		} );
		const lights = [];
		editor.scene.traverse( light => { if ( canEditLightMask( light ) ) lights.push( light ); } );
		const active = editor.viewportSource;
		if ( lights.includes( active ) ) {

			add( 'Project outline as mask', () => {

				const camera = lightViewCamera( THREE, active );
				const points = outlinePoints( THREE, data ).map( point => {

					object.localToWorld( point );
					if ( point.clone().applyMatrix4( camera.matrixWorldInverse ).z >= 0 ) throw new Error( 'Place the outline in front of the light.' );
					point.project( camera );
					return [ ( point.x + 1 ) / 2, ( 1 - point.y ) / 2 ];

				} );
				addLightMaskShape( editor, active, { name: object.name, mode: 'inside', points } );

			} );

		}
		for ( const light of lights ) add( 'Fit outline to mask · ' + ( light.name || light.type ), () => {

			const mask = maskFromOutline( outlinePoints( THREE, data ).map( point => point.toArray() ) );
			addLightMaskShape( editor, light, { ...mask, name: object.name } );

		} );

	}
	return actions;

}
