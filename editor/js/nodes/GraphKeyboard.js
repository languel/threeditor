const editors = new WeakMap();

export function registerGraphKeyboard( element, handler ) {

	editors.set( element, handler );

}

export function handleGraphShortcut( event, pointerTarget ) {

	const focused = event.target.closest?.( '.node-graph' );
	const hovered = pointerTarget?.closest( '.node-graph' );
	if ( event.target.closest?.( 'input, select, textarea, [contenteditable="true"]' ) ) return false;
	// Tab focus works without a pointer. When the pointer is over a pane,
	// route shortcuts by pane just like the viewport keymap.
	const editor = hovered || ( ! pointerTarget || ! pointerTarget.closest( '.workspace-editor-slot' ) ? focused : undefined );
	if ( ! editors.get( editor )?.( event ) ) return false;
	event.preventDefault();
	event.stopPropagation();
	return true;

}
