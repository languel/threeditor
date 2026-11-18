import { addTimelineKey } from './animation/TimelineKeyControl.js';
import { UIPanel, UIButton, UIRow, UIInput, UICheckbox, UIText } from './libs/ui.js';
import { MathUtils } from 'three';

import { AddScriptCommand } from './commands/AddScriptCommand.js';
import { SetScriptValueCommand } from './commands/SetScriptValueCommand.js';
import { RemoveScriptCommand } from './commands/RemoveScriptCommand.js';
import { P5_TEMPLATE } from './P5Sketch.js';
import { scriptParams, scriptParamValue } from './ScriptParams.js';
import { scriptParameterControl } from './ScriptParameterControl.js';
import { modelButton } from './modeling/ModelControls.js';

const spinSource = `// @param speed = 45 (-360..360)
// @label speed = "Degrees per second"
function update( { delta } ) {
	this.rotateY( THREE.MathUtils.degToRad( params.speed ) * delta / 1000 );
}
`;

function SidebarScript( editor ) {

	const strings = editor.strings;

	const signals = editor.signals;

	const container = new UIPanel();
	container.setBorderTop( '0' );
	container.addClass( 'script-components' );
	container.setDisplay( 'none' );

	//

	const scriptsContainer = new UIPanel();
	let parameterControls = [];
	let trackingStatus;
	container.add( scriptsContainer );

	const addComponent = modelButton( container.dom, 'Add Component', 'add', openComponentPicker );
	addComponent.classList.add( 'script-add-component' );
	addComponent.setAttribute( 'aria-haspopup', 'dialog' );
	container.openComponentPicker = openComponentPicker;

	function openComponentPicker() {

		const object = editor.selected;
		if ( ! object ) return;
		const actions = [
			{ label: strings.getKey( 'sidebar/script/new' ), section: 'New', run: () => attach( { name: 'Script', source: 'function update( event ) {\n\n}' }, true ) },
			{ label: 'New p5 sketch', section: 'New', run: () => attach( { name: 'sketch', type: 'p5', source: P5_TEMPLATE, preview: true } ) },
			{ label: 'Spin', section: 'Behaviors', run: () => attach( { name: 'Spin', source: spinSource } ) }
		];
		editor.scene.traverse( source => {

			for ( const script of editor.scripts[ source.uuid ] || [] ) {

				if ( script.generated || script.assetBehavior || script.cameraController || ! script.source ) continue;
				const name = script.name || 'Script';
				actions.push( { label: name + ' · ' + ( source.name || source.type ), section: 'Copy from scene', run: () => attach( script ) } );

			}

		} );
		addComponent.focus();
		const bounds = addComponent.getBoundingClientRect();
		editor.contextMenu.show( 'Add Component', actions, [ bounds.left, bounds.bottom + 4 ] );

		function attach( template, edit = false ) {

			if ( editor.selected !== object || ( ! object.parent && object !== editor.scene ) ) return;
			const names = new Set( ( editor.scripts[ object.uuid ] || [] ).map( script => script.name ) );
			const baseName = template.name || 'Script';
			let name = baseName;
			for ( let suffix = 1; names.has( name ); suffix ++ ) name = baseName + '.' + String( suffix ).padStart( 3, '0' );
			const script = { enabled: true, ...structuredClone( template ), name, timelineId: MathUtils.generateUUID() };
			delete script.parameters;
			editor.execute( new AddScriptCommand( editor, object, script ), 'Add Component' );
			if ( edit ) signals.editScript.dispatch( object, script );
			else addComponent.focus();

		}

	}

	//

	function update() {

		scriptsContainer.clear();
		parameterControls = [];
		trackingStatus = null;
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

					const component = new UIPanel().addClass( 'script-component' );
					component.dom.setAttribute( 'role', 'group' );
					component.dom.setAttribute( 'aria-label', script.name || 'Script ' + ( i + 1 ) );
					const header = new UIRow().addClass( 'script-component-header' );
					component.add( header );
					scriptsContainer.add( component );
					const name = new UIInput( script.name ).setWidth( '130px' ).setFontSize( '12px' );
					name.dom.setAttribute( 'aria-label', 'Component name' );
					if ( script.generated ) name.dom.disabled = true;
					name.onChange( function () {

						editor.execute( new SetScriptValueCommand( editor, editor.selected, script, 'name', this.getValue() ) );

					} );

					if ( ! script.generated ) {

						const enabled = new UICheckbox( script.enabled !== false ).setMarginLeft( '6px' );
						enabled.dom.title = 'Enable script in Play';
						enabled.dom.setAttribute( 'aria-label', 'Enable ' + ( script.name || 'script ' + ( i + 1 ) ) );
						enabled.onChange( function () {

							const command = new SetScriptValueCommand( editor, object, script, 'enabled', this.getValue() );
							command.updatable = false;
							editor.execute( command );

						} );
						header.add( enabled );

					}

					header.add( name );
					const edit = new UIButton( strings.getKey( 'sidebar/script/edit' ) );
					edit.setMarginLeft( '4px' );
					edit.onClick( function () {

						signals.editScript.dispatch( object, script );

					} );
					header.add( edit );

					const remove = new UIButton( strings.getKey( 'sidebar/script/remove' ) );
					remove.setMarginLeft( '4px' );
					remove.onClick( function () {

						if ( confirm( strings.getKey( 'prompt/script/remove' ) ) ) {

							editor.execute( new RemoveScriptCommand( editor, editor.selected, script ) );

						}

					} );
					if ( ! script.generated ) header.add( remove );

					if ( script.type === 'p5' && ! script.generated ) {

						const preview = new UICheckbox( script.preview === true );
						preview.setMarginLeft( '4px' );
						preview.dom.title = strings.getKey( 'sidebar/script/preview' );
						preview.dom.setAttribute( 'aria-label', strings.getKey( 'sidebar/script/preview' ) );
						preview.onChange( function () {

							const command = new SetScriptValueCommand( editor, object, script, 'preview', this.getValue() );
							command.updatable = false;
							editor.execute( command );

						} );
						component.add( preview );

						const pause = new UIButton( script.paused === true ? strings.getKey( 'sidebar/script/resume' ) : strings.getKey( 'sidebar/script/pause' ) );
						pause.setMarginLeft( '4px' );
						pause.onClick( function () {

							const command = new SetScriptValueCommand( editor, object, script, 'paused', script.paused !== true );
							command.updatable = false;
							editor.execute( command );

						} );
						component.add( pause );

					}

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
						component.add( new UIRow().addClass( 'script-parameter-row' ).add( favorite, caption, control ) );
						if ( script.assetBehavior === 'projector' && field.name === 'liveTracking' ) {

							trackingStatus = new UIText().setDisplay( 'none' );
							component.add( new UIRow().add( trackingStatus ) );

						}
						if ( ! field.initializer ) addTimelineKey( editor, caption, field.label || field.name, () => ( {
							kind: 'script', object: object.uuid, index: editor.scripts[ object.uuid ]?.indexOf( script ),
							scriptId: script.timelineId, property: field.name, label: script.name + ' · ' + ( field.label || field.name )
						} ), { field: control, display: value => control.setValue( value ) } );

					}

				} )( object, scripts[ i ] );

			}

		}

		editor.timeline?.refreshKeyControls();

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

	signals.sceneRendered.add( () => {

		if ( ! trackingStatus ) return;
		const output = editor.selected?.projectorOutput;
		const mode = output?.tracking;
		const status = mode === 'live' ? `Live · ${ output.trackingHeads } heads, ${ output.trackingHands } hands` :
			mode === 'fallback' ? 'Authored fallback · no landmarks' :
				mode === 'loading-or-fallback' ? 'Authored fallback · waiting for tracker' : 'Authored masks';
		if ( trackingStatus.getValue() !== status ) trackingStatus.setValue( status ).setDisplay( '' );

	} );

	return container;

}

export { SidebarScript };
