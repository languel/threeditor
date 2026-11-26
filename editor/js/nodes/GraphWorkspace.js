import { comboFromEvent } from '../Keymap.js?v=transform-gizmos';

export function bindGraphHistory( editor, panel ) {

	panel.addEventListener( 'keydown', event => {

		if ( event.defaultPrevented || event.repeat || event.isComposing || event.target.closest( 'input, select' ) ) return;
		const combo = comboFromEvent( event );
		if ( ! combo ) return;
		if ( combo === editor.keymap.combo( 'undo' ) ) editor.undo();
		else if ( combo === editor.keymap.combo( 'redo' ) ) editor.redo();
		else return;
		event.preventDefault();

	} );

}
