import { Box3, Vector3 } from 'three';

import { UIPanel, UIRow, UIHorizontalRule, UIText } from './libs/ui.js';

import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { formatCombo } from './Keymap.js';
import { hasRestriction } from './ObjectRestrictions.js';

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
	undo.setClass( 'option' );
	undo.setTextContent( strings.getKey( 'menubar/edit/undo' ) );
	undo.add( new UIText( 'CTRL+Z' ).setClass( 'key' ) );
	undo.onClick( function () {

		editor.undo();

	} );
	options.add( undo );

	// Redo

	const redo = new UIRow();
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
	const adjustLast = new UIRow().setTextContent( 'Adjust Last Operation…' ).onClick( () => editor.keymap.run( 'adjustLastOperation' ) );
	const adjustKey = new UIText().setClass( 'key' );
	adjustLast.dom.dataset.keymapAction = 'adjustLastOperation';
	adjustLast.add( adjustKey );
	options.add( adjustLast );
	const updateAdjust = () => adjustLast.setClass( editor.keymap.actionAvailable( 'adjustLastOperation' ) ? 'option' : 'inactive' );
	editor.signals.historyChanged.add( updateAdjust );
	title.onMouseOver( updateAdjust );
	updateAdjust();

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

	const duplicate = new UIRow().setTextContent( 'Duplicate Objects' ).onClick( () => editor.keymap.run( 'duplicate' ) );
	duplicate.dom.dataset.keymapAction = 'duplicate';
	options.add( duplicate );
	const updateDuplicate = () => duplicate.setClass( editor.keymap.actionAvailable( 'duplicate' ) ? 'option' : 'inactive' );
	editor.signals.objectSelected.add( updateDuplicate );
	title.onMouseOver( updateDuplicate );
	updateDuplicate();

	const join = new UIRow().setTextContent( 'Join' ).onClick( () => editor.keymap.run( 'joinMeshes' ) );
	const joinKey = new UIText().setClass( 'key' );
	join.add( joinKey );
	options.add( join );
	const updateJoin = () => join.setClass( editor.keymap.actionAvailable( 'joinMeshes' ) ? 'option' : 'inactive' );
	editor.signals.objectSelected.add( updateJoin );
	title.onMouseOver( updateJoin );
	updateJoin();
	const hierarchy = [
		[ 'renameObject', 'Rename Object' ], [ 'parentObject', 'Set Parent' ], [ 'clearParent', 'Clear Parent' ]
	].map( ( [ action, label ] ) => {

		const row = new UIRow().setTextContent( label ).onClick( () => editor.keymap.run( action ) );
		const key = new UIText().setClass( 'key' );
		row.dom.dataset.keymapAction = action;
		row.add( key );
		options.add( row );
		return { action, row, key };

	} );
	const updateHierarchy = () => {

		for ( const { action, row } of hierarchy ) row.setClass( editor.keymap.actionAvailable( action ) ? 'option' : 'inactive' );

	};
	editor.signals.objectSelected.add( updateHierarchy );
	title.onMouseOver( updateHierarchy );
	updateHierarchy();

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/edit/delete' ) );
	option.add( new UIText( 'DEL' ).setClass( 'key' ) );
	option.onClick( () => editor.keymap.run( 'delete' ) );
	options.add( option );
	const deleteOption = option;
	const updateKeys = () => {

		undo.dom.querySelector( '.key' ).textContent = formatCombo( editor.keymap.combo( 'undo' ) );
		redo.dom.querySelector( '.key' ).textContent = formatCombo( editor.keymap.combo( 'redo' ) );
		deleteOption.dom.querySelector( '.key' ).textContent = formatCombo( editor.keymap.combo( 'delete' ) );
		const adjust = editor.keymap.combo( 'adjustLastOperation' );
		adjustKey.setValue( adjust ? formatCombo( adjust ) : '' );
		joinKey.setValue( formatCombo( editor.keymap.combo( 'joinMeshes' ) ) );
		for ( const { action, key } of hierarchy ) {

			const shortcut = editor.keymap.combo( action );
			key.setValue( shortcut ? formatCombo( shortcut ) : '' );

		}

	};
	editor.keymap.listeners.add( updateKeys );
	updateKeys();

	return container;

}

export { MenubarEdit };
