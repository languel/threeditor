import { Box3, Vector3 } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

import { UIPanel, UIRow, UIHorizontalRule, UIText } from './libs/ui.js';

import { AddScriptCommand } from './commands/AddScriptCommand.js';
import { AddObjectCommand } from './commands/AddObjectCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { RemoveObjectCommand } from './commands/RemoveObjectCommand.js';
import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { formatCombo } from './Keymap.js';
import { hasRestriction, withoutRuntimeChildren } from './ObjectRestrictions.js';

function MenubarEdit( editor ) {

	const strings = editor.strings;

	const container = new UIPanel();
	container.setClass( 'menu' );

	const title = new UIPanel();
	title.setClass( 'title' );
	title.setTextContent( strings.getKey( 'menubar/edit' ) );
	title.dom.dataset.glyphKey = 'menubar/edit';
	container.add( title );

	const options = new UIPanel();
	options.setClass( 'options' );
	container.add( options );

	// Undo

	const undo = new UIRow();
	undo.dom.dataset.shortcutScope = 'global';
	undo.setClass( 'option' );
	undo.setTextContent( strings.getKey( 'menubar/edit/undo' ) );
	undo.add( new UIText( 'CTRL+Z' ).setClass( 'key' ) );
	undo.onClick( function () {

		editor.undo();

	} );
	options.add( undo );

	// Redo

	const redo = new UIRow();
	redo.dom.dataset.shortcutScope = 'global';
	redo.setClass( 'option' );
	redo.setTextContent( strings.getKey( 'menubar/edit/redo' ) );
	redo.add( new UIText( 'CTRL+SHIFT+Z' ).setClass( 'key' ) );
	redo.onClick( function () {

		editor.redo();

	} );
	options.add( redo );

	function onHistoryChanged() {

		const history = editor.history;

		undo.setClass( 'option' );
		redo.setClass( 'option' );

		if ( history.undos.length == 0 ) {

			undo.setClass( 'inactive' );

		}

		if ( history.redos.length == 0 ) {

			redo.setClass( 'inactive' );

		}

	}

	editor.signals.historyChanged.add( onHistoryChanged );
	onHistoryChanged();

	// ---

	options.add( new UIHorizontalRule() );

	// Center

	let option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/edit/center' ) );
	option.onClick( function () {

		const object = editor.selected;

		if ( object === null || object.parent === null || hasRestriction( object, 'locked' ) ) return; // avoid centering the camera, scene, or locked objects

		const aabb = new Box3().setFromObject( object );
		const center = aabb.getCenter( new Vector3() );
		const newPosition = new Vector3();

		newPosition.x = object.position.x - center.x;
		newPosition.y = object.position.y - center.y;
		newPosition.z = object.position.z - center.z;

		editor.execute( new SetPositionCommand( editor, object, newPosition ) );

	} );
	options.add( option );

	// Clone

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/edit/clone' ) );
	option.onClick( function () {

		let object = editor.selected;

		if ( object === null || object.parent === null ) return; // avoid cloning the camera or scene

		const commands = withoutRuntimeChildren( object, () => {

			const copy = clone( object );
			const commands = [ new AddObjectCommand( editor, copy ) ];
			const copyScanAndProjectorScripts = ( source, target ) => {
				for ( const script of editor.scripts[ source.uuid ] || [] ) {
					if ( [ 'splat', 'projector' ].includes( script.assetBehavior ) ) commands.push( new AddScriptCommand( editor, target, structuredClone( script ) ) );
				}
				source.children.forEach( ( child, index ) => copyScanAndProjectorScripts( child, target.children[ index ] ) );
			};
			copyScanAndProjectorScripts( object, copy );
			return commands;

		} );
		editor.execute( commands.length === 1 ? commands[ 0 ] : new MultiCmdsCommand( editor, commands ) );

	} );
	options.add( option );

	// Delete
	const cloneOption = option;
	editor.shortcutDuplicate = () => cloneOption.dom.click();

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/edit/delete' ) );
	option.add( new UIText( 'DEL' ).setClass( 'key' ) );
	option.onClick( function () {

		const object = editor.selected;

		if ( object === null || object.parent === null ) return;

		if ( object.isSpotLight || object.isDirectionalLight ) {

			editor.execute( new MultiCmdsCommand( editor, [
				new RemoveObjectCommand( editor, object ),
				new RemoveObjectCommand( editor, object.target )
			] ) );

		} else {

			editor.execute( new RemoveObjectCommand( editor, object ) );

		}

	} );
	options.add( option );
	const deleteOption = option;
	const updateKeys = () => {

		undo.dom.querySelector( '.key' ).textContent = formatCombo( editor.keymap.combo( 'undo' ) );
		redo.dom.querySelector( '.key' ).textContent = formatCombo( editor.keymap.combo( 'redo' ) );
		deleteOption.dom.querySelector( '.key' ).textContent = formatCombo( editor.keymap.combo( 'delete' ) );

	};
	editor.keymap.listeners.add( updateKeys );
	updateKeys();

	return container;

}

export { MenubarEdit };
