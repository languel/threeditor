import { UIPanel, UIBreak, UIButton, UIRow, UIInput, UICheckbox, UIText, UINumber } from './libs/ui.js';

import { AddScriptCommand } from './commands/AddScriptCommand.js';
import { SetScriptValueCommand } from './commands/SetScriptValueCommand.js';
import { RemoveScriptCommand } from './commands/RemoveScriptCommand.js';
import { scriptParams, scriptParamValue } from './ScriptParams.js';

function SidebarScript( editor ) {

	const strings = editor.strings;

	const signals = editor.signals;

	const container = new UIPanel();
	container.setBorderTop( '0' );
	container.setPaddingTop( '20px' );
	container.setDisplay( 'none' );

	//

	const scriptsContainer = new UIRow();
	container.add( scriptsContainer );

	const newScript = new UIButton( strings.getKey( 'sidebar/script/new' ) );
	newScript.onClick( function () {

		const script = { name: '', source: 'function update( event ) {}', enabled: true };
		editor.execute( new AddScriptCommand( editor, editor.selected, script ) );

	} );
	container.add( newScript );

	/*
	let loadScript = new UI.Button( 'Load' );
	loadScript.setMarginLeft( '4px' );
	container.add( loadScript );
	*/

	//

	function update() {

		scriptsContainer.clear();
		scriptsContainer.setDisplay( 'none' );

		const object = editor.selected;

		if ( object === null ) {

			return;

		}

		const scripts = editor.scripts[ object.uuid ];

		if ( scripts !== undefined && scripts.length > 0 ) {

			scriptsContainer.setDisplay( 'block' );

			for ( let i = 0; i < scripts.length; i ++ ) {

				( function ( object, script ) {

					const name = new UIInput( script.name ).setWidth( '130px' ).setFontSize( '12px' );
					if ( script.generated ) name.dom.disabled = true;
					name.onChange( function () {

						editor.execute( new SetScriptValueCommand( editor, editor.selected, script, 'name', this.getValue() ) );

					} );
					scriptsContainer.add( name );

					if ( ! script.generated ) {

						const enabled = new UICheckbox( script.enabled !== false ).setMarginLeft( '6px' );
						enabled.dom.title = 'Enable script in Play';
						enabled.dom.setAttribute( 'aria-label', 'Enable ' + ( script.name || 'script ' + ( i + 1 ) ) );
						enabled.onChange( function () {

							const command = new SetScriptValueCommand( editor, object, script, 'enabled', this.getValue() );
							command.updatable = false;
							editor.execute( command );

						} );
						scriptsContainer.add( enabled );

					}

					const edit = new UIButton( strings.getKey( 'sidebar/script/edit' ) );
					edit.setMarginLeft( '4px' );
					edit.onClick( function () {

						signals.editScript.dispatch( object, script );

					} );
					scriptsContainer.add( edit );

					const remove = new UIButton( strings.getKey( 'sidebar/script/remove' ) );
					remove.setMarginLeft( '4px' );
					remove.onClick( function () {

						if ( confirm( strings.getKey( 'prompt/script/remove' ) ) ) {

							editor.execute( new RemoveScriptCommand( editor, editor.selected, script ) );

						}

					} );
					if ( ! script.generated ) scriptsContainer.add( remove );

					scriptsContainer.add( new UIBreak() );

					if ( ! script.generated ) for ( const field of scriptParams( script.source ) ) {

						const value = scriptParamValue( script, field );
						let control;
						if ( typeof value === 'boolean' ) control = new UICheckbox( value );
						else if ( typeof value === 'number' ) {

							control = new UINumber( value ).setWidth( '80px' );
							if ( field.min !== undefined ) control.setRange( field.min, field.max );

						} else control = new UIInput( value );
						control.dom.setAttribute( 'aria-label', field.name );
						control.onChange( () => {

							const command = new SetScriptValueCommand( editor, object, script, 'paramValues', {
								...script.paramValues, [ field.name ]: control.getValue()
							} );
							command.updatable = false;
							editor.execute( command );

						} );
						scriptsContainer.add( new UIRow().add( new UIText( field.name ).setClass( 'Label' ), control ) );

					}

				} )( object, scripts[ i ] );

			}

		}

	}

	// signals

	signals.objectSelected.add( function ( object ) {

		if ( object !== null && editor.camera !== object ) {

			container.setDisplay( 'block' );

			update();

		} else {

			container.setDisplay( 'none' );

		}

	} );

	signals.scriptAdded.add( update );
	signals.scriptRemoved.add( update );
	signals.scriptChanged.add( update );

	return container;

}

export { SidebarScript };
