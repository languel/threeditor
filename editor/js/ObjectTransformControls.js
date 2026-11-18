import { MathUtils } from 'three';
import { UINumber, UIRow, UISpan, UIText } from './libs/ui.js';
import { addTimelineKey } from './animation/TimelineKeyControl.js';
import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import { SetScaleCommand } from './commands/SetScaleCommand.js';
import { hasRestriction } from './ObjectRestrictions.js';

export function TransformAxis( axis, control ) {

	return new UISpan().addClass( 'transform-axis' ).add( new UIText( axis ), control );

}

export function ObjectTransformControls( editor, locationLabel ) {

	const groups = [
		[ 'position', SetPositionCommand ], [ 'rotation', SetRotationCommand ], [ 'scale', SetScaleCommand ]
	].map( ( [ property, Command ] ) => {

		const label = property === 'position' && locationLabel || editor.strings.getKey( 'sidebar/object/' + property );
		const row = new UIRow();
		const caption = new UIText( label ).setClass( 'Label' );
		const rotation = property === 'rotation';
		const multiplier = rotation ? MathUtils.RAD2DEG : 1;
		const controls = [ 'x', 'y', 'z' ].map( axis => {

			const control = new UINumber( property === 'scale' ? 1 : 0 ).setWidth( '50px' );
			if ( rotation ) control.setStep( 10 ).setNudge( 0.1 ).setUnit( '°' );
			else control.setPrecision( 3 );
			control.dom.setAttribute( 'aria-label', label + ' ' + axis.toUpperCase() );
			control.onChange( () => {

				const object = editor.selected;
				if ( ! object || hasRestriction( object, 'locked' ) ) return;
				const value = control.getValue() / multiplier;
				if ( ! Number.isFinite( value ) || Math.abs( value - object[ property ][ axis ] ) < 1e-9 ) return;
				const next = object[ property ].clone();
				next[ axis ] = value;
				editor.execute( new Command( editor, object, next ) );

			} );
			return control;

		} );
		row.add( caption, ...controls.map( ( control, index ) => locationLabel ? TransformAxis( 'XYZ'[ index ], control ) : control ) );
		const display = values => controls.forEach( ( control, index ) => control.setValue( values[ index ] * multiplier ) );
		addTimelineKey( editor, caption, label, () => editor.selected && ( {
			object: editor.selected.uuid, kind: 'object', property, label: property
		} ), { field: row, display } );
		return { row, property, controls, display };

	} );

	function update( object ) {

		const locked = hasRestriction( object, 'locked' );
		for ( const { row, property, controls, display } of groups ) {

			row.setDisplay( object.isLight && property !== 'position' ? 'none' : '' );
			for ( const control of controls ) control.setDisabled( locked );
			row.dom.style.opacity = locked ? '0.5' : '';
			display( object[ property ].toArray() );

		}

	}

	return { rows: groups.map( group => group.row ), update };

}
