import { UIButton, UIPanel, UIRow, UIText } from './libs/ui.js';
import { scriptParams, scriptParamValue } from './ScriptParams.js';
import { scriptParameterControl } from './ScriptParameterControl.js';

function ViewportParameters( editor ) {

	const container = new UIPanel().setClass( 'viewport-parameters' );
	const button = new UIButton( '★' ).setClass( 'viewport-parameter-trigger' );
	button.dom.title = 'Favorite script parameters';
	button.dom.setAttribute( 'aria-label', button.dom.title );
	button.dom.setAttribute( 'aria-controls', 'viewport-parameter-list' );
	const panel = new UIPanel().setId( 'viewport-parameter-list' ).setClass( 'viewport-parameter-list' );
	container.add( button, panel );
	let pinned = false;
	let controls = [];

	function show( visible ) {

		panel.dom.hidden = ! visible;
		button.dom.setAttribute( 'aria-expanded', String( visible ) );

	}

	function toggle() {

		if ( container.dom.hidden ) return;
		pinned = ! pinned;
		show( pinned );

	}

	function rebuild() {

		panel.clear();
		controls = [];
		editor.scene.traverse( object => {

			let group;
			for ( const script of editor.scripts[ object.uuid ] || [] ) {

				if ( script.generated || script.enabled === false || ! script.favoriteParams?.length ) continue;
				const favorites = new Set( script.favoriteParams );
				const fields = scriptParams( script.source ).filter( field => favorites.has( field.name ) );
				if ( ! fields.length ) continue;
				if ( ! group ) {

					const name = object.name || object.type;
					const title = new UIText( name.replace( /\s+\([^)]*\)$/, '' ) ).setClass( 'viewport-parameter-title' );
					title.dom.title = name;
					group = new UIPanel().setClass( 'viewport-parameter-group' ).add( title );
					panel.add( group );

				}
				for ( const field of fields ) {

					const control = scriptParameterControl( editor, object, script, field );
					const label = field.label || field.name;
					const caption = script.assetBehavior === 'model' && /^mix_\d+$/.test( field.name ) ? label.replace( / mix$/, '' ) : label;
					const text = new UIText( caption ).setClass( 'viewport-parameter-label' );
					text.dom.title = [ label, script.name ].filter( Boolean ).join( ' · ' );
					group.add( new UIRow().add( text, control ) );
					controls.push( { script, field, control } );

				}

			}

		} );
		container.dom.hidden = controls.length === 0;
		if ( container.dom.hidden ) {

			pinned = false;
			show( false );

		}

	}

	button.onClick( toggle );
	container.dom.addEventListener( 'pointerenter', event => { if ( event.pointerType !== 'touch' ) show( true ); } );
	container.dom.addEventListener( 'pointerleave', () => {

		if ( ! pinned && ! panel.dom.contains( document.activeElement ) ) show( false );

	} );
	container.dom.addEventListener( 'focusout', event => {

		if ( ! pinned && ! container.dom.matches( ':hover' ) && ! container.dom.contains( event.relatedTarget ) ) show( false );

	} );
	container.dom.addEventListener( 'keydown', event => {

		if ( event.key !== 'Escape' ) return;
		event.stopPropagation();
		pinned = false;
		show( false );
		button.dom.focus();

	}, true );
	for ( const type of [ 'pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick', 'contextmenu', 'keydown', 'keyup' ] ) {

		container.dom.addEventListener( type, event => event.stopPropagation() );

	}

	const signals = editor.signals;
	for ( const name of [ 'sceneGraphChanged', 'editorCleared', 'projectLoaded', 'scriptAdded', 'scriptRemoved' ] ) signals[ name ].add( rebuild );
	signals.scriptChanged.add( ( script, attribute ) => {

		if ( attribute !== 'paramValues' ) {

			rebuild();
			return;

		}

		for ( const entry of controls ) {

			if ( entry.script === script ) entry.control.setValue( scriptParamValue( script, entry.field ) );

		}

	} );
	editor.keymap.register( {
		id: 'favoriteScriptParameters', label: 'Toggle favorite script parameters', category: 'View',
		defaults: { basic: 'shift+p', blender: 'shift+p' }, run: toggle
	} );
	container.close = () => {

		pinned = false;
		show( false );

	};
	container.isOpen = () => ! panel.dom.hidden;
	show( false );
	rebuild();
	return container;

}

export { ViewportParameters };
