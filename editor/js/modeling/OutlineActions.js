import * as THREE from 'three';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { canEditLightMask, setLightMask } from './LightMask.js';
import { lightViewCamera } from './LightView.js';
import { isClosedOutline, modelGeometry, modelObject, outlinePoints } from './ModelGeometry.js?v=top-toolbar';
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

		if ( data.kind === 'shape' || data.points.every( point => Math.abs( point[ 2 ] ) < 1e-6 ) ) {

			const kind = data.kind === 'path' ? 'shape' : 'path';
			add( kind === 'shape' ? 'Convert path to shape' : 'Convert shape to path', () => {

				const output = modelObject( THREE, { ...data, kind, closed: true, planar: true, depth: 0 }, object.name + ' ' + kind );
				output.position.copy( object.position );
				output.quaternion.copy( object.quaternion );
				output.scale.copy( object.scale );
				editor.execute( new AddObjectCommand( editor, output, object.parent ), 'Convert outline to ' + kind );

			} );

		}
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
				setLightMask( editor, active, { mode: active.userData.projectionMask?.mode || 'inside', points } );

			} );

		}
		for ( const light of lights ) add( 'Fit outline to mask · ' + ( light.name || light.type ), () => {

			const mask = maskFromOutline( outlinePoints( THREE, data ).map( point => point.toArray() ) );
			mask.mode = light.userData.projectionMask?.mode || 'inside';
			setLightMask( editor, light, mask );

		} );

	}
	return actions;

}
