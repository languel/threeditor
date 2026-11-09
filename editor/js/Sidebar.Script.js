import { UIPanel, UIBreak, UIButton, UIRow, UIInput, UICheckbox, UIText } from './libs/ui.js';

import { AddScriptCommand } from './commands/AddScriptCommand.js';
import { SetScriptValueCommand } from './commands/SetScriptValueCommand.js';
import { RemoveScriptCommand } from './commands/RemoveScriptCommand.js';
import { scriptParams, scriptParamValue } from './ScriptParams.js';
import { scriptParameterControl } from './ScriptParameterControl.js';

function SidebarScript( editor ) {

	const strings = editor.strings;

	const signals = editor.signals;

	const container = new UIPanel();
	container.setBorderTop( '0' );
	container.setPaddingTop( '20px' );
	container.setDisplay( 'none' );

	//

	const scriptsContainer = new UIRow();
	let parameterControls = [];
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
		parameterControls = [];
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

						const favorites = new Set( script.favoriteParams || [] );
						const favorite = new UIButton( favorites.has( field.name ) ? '★' : '☆' ).setClass( 'script-param-favorite' );
						const label = 'Favorite ' + ( field.label || field.name );
						favorite.dom.title = label;
						favorite.dom.setAttribute( 'aria-label', label );
						favorite.dom.setAttribute( 'aria-pressed', String( favorites.has( field.name ) ) );
						favorite.onClick( () => {

							if ( favorites.has( field.name ) ) favorites.delete( field.name );
							else favorites.add( field.name );
							const command = new SetScriptValueCommand( editor, object, script, 'favoriteParams', [ ...favorites ] );
							command.updatable = false;
							editor.execute( command );

						} );
						const control = scriptParameterControl( editor, object, script, field );
						const caption = new UIText( field.label || field.name ).setClass( 'Label' );
						caption.dom.title = caption.dom.textContent;
						parameterControls.push( { script, field, control } );
						scriptsContainer.add( new UIRow().addClass( 'script-parameter-row' ).add( favorite, caption, control ) );

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
	signals.scriptChanged.add( ( script, attribute ) => {

		if ( attribute !== 'paramValues' ) {

			update();
			return;

		}

		for ( const entry of parameterControls ) {

			if ( entry.script === script ) entry.control.setValue( scriptParamValue( script, entry.field ) );

		}

	} );

	return container;

}

export { SidebarScript };
