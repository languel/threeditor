import { UIInput, UICheckbox, UINumber, UISelect, UIElement, UISpan } from './libs/ui.js';
import { scriptParamValue } from './ScriptParams.js';
import { SetScriptValueCommand } from './commands/SetScriptValueCommand.js';

function scriptParameterControl( editor, object, script, field ) {

	const value = scriptParamValue( script, field );
	let control;
	if ( field.options?.length ) {

		control = new UISelect().setOptions( Object.fromEntries( field.options.map( option => [ option, option ] ) ) ).setValue( value );

	} else if ( typeof value === 'boolean' ) {

		control = new UICheckbox( value );

	} else if ( typeof value === 'number' ) {

		control = new UINumber().setPrecision( 3 ).setScrubDefault( field.value ).setWidth( '80px' );
		if ( field.min !== undefined ) control.setScrubRange( field.min, field.max );
		control.setValue( value );

	} else {

		control = new UIInput( value );

	}

	control.dom.setAttribute( 'aria-label', field.label || field.name );
	function change( next, updatable = false ) {

		if ( Object.is( scriptParamValue( script, field ), next ) ) return;
		const command = new SetScriptValueCommand( editor, object, script, 'paramValues', {
			...script.paramValues, [ field.name ]: next
		} );
		command.updatable = updatable;
		editor.execute( command );
		return command;

	}
	control.onChange( () => change( control.getValue() ) );
	if ( ! field.slider || ! ( control instanceof UINumber ) ) return control;

	const slider = new UIElement( document.createElement( 'input' ) ).setClass( 'script-param-slider' );
	slider.dom.type = 'range';
	slider.dom.min = field.min;
	slider.dom.max = field.max;
	slider.dom.step = 'any';
	slider.dom.value = value;
	slider.dom.setAttribute( 'aria-label', ( field.label || field.name ) + ' slider' );
	let gesture;
	const finish = () => {

		if ( gesture ) gesture.updatable = false;
		gesture = undefined;

	};
	slider.onInput( () => {

		const command = change( Number( slider.dom.value ), true );
		gesture ||= command;

	} );
	slider.onChange( finish );
	slider.dom.addEventListener( 'pointercancel', finish );
	slider.dom.addEventListener( 'blur', finish );
	const row = new UISpan().setClass( 'script-param-slider-group' ).add( slider, control );
	row.setValue = next => {

		control.setValue( next );
		slider.dom.value = next;

	};
	return row;

}

export { scriptParameterControl };
