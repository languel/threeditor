function WorkspaceArea( editor, menubar, ...areas ) {

	const body = document.body;
	const layout = editor.viewLayout;
	let current, previousFocus, lastPointerArea, lastPane;
	for ( const area of areas ) area.dataset.workspaceArea = area.id.replace( 'workspace-', '' );
	const restoreButton = document.createElement( 'button' );
	restoreButton.type = 'button';
	restoreButton.className = 'workspace-area-restore';
	restoreButton.textContent = 'Back to Previous';
	restoreButton.title = 'Restore Area (Ctrl+Space)';
	restoreButton.hidden = true;
	restoreButton.addEventListener( 'click', restore );
	menubar.querySelector( '.panel-toggles' ).prepend( restoreButton );

	function containingArea( target ) {

		if ( target?.closest?.( '.workspace-split-pane' ) ) return layout.viewport.closest( '[data-workspace-area]' );
		return target?.closest?.( '[data-workspace-area]' );

	}

	function trackArea( event ) {

		const area = containingArea( event.target );
		if ( ! area ) return;
		lastPointerArea = area;
		lastPane = event.target.closest( '#viewport' ) ? layout.at( event.clientX, event.clientY, 'area' )?.key : undefined;

	}

	document.addEventListener( 'pointermove', trackArea, true );
	document.addEventListener( 'pointerdown', trackArea, true );

	function restore() {

		if ( ! current ) return;
		const returnFocus = document.activeElement === restoreButton;
		const changedPane = !! layout.maximizedPane;
		current = null;
		delete body.dataset.maximizedArea;
		layout.maximizedPane = undefined;
		restoreButton.hidden = true;
		if ( changedPane ) editor.signals.viewportCameraChanged.dispatch();
		editor.signals.windowResize.dispatch();
		if ( returnFocus && previousFocus?.isConnected ) previousFocus.focus( { preventScroll: true } );
		previousFocus = null;

	}

	function toggle() {

		if ( current ) { restore(); return; }
		if ( editor.modeling.gesture || editor.modeling.drag || editor.viewTools.pointer ||
			editor.modalTransform.active || editor.flyControls.active || body.classList.contains( 'presenting' ) ) return;
		const visible = area => area && area.getClientRects().length > 0;
		const area = [ lastPointerArea, containingArea( document.activeElement ), areas[ 0 ] ].find( visible );
		if ( ! area ) return;
		previousFocus = document.activeElement;
		current = area;
		body.dataset.maximizedArea = area.dataset.workspaceArea;
		if ( area.dataset.workspaceArea === 'viewport' && area.contains( layout.viewport ) && editor.viewportSplit ) {

			layout.maximizedPane = lastPointerArea === area && lastPane || layout.activeKey;

		}
		restoreButton.hidden = false;
		if ( layout.maximizedPane ) editor.signals.viewportCameraChanged.dispatch();
		editor.signals.windowResize.dispatch();

	}

	editor.signals.windowResize.add( () => { if ( current && ( current.hidden || current.dataset.dock === 'closed' ) ) restore(); } );
	editor.signals.startPlayer.add( restore );
	editor.signals.projectLoaded.add( restore );
	editor.signals.editorCleared.add( restore );
	return { toggle, reveal: area => { if ( current && current !== area ) restore(); } };

}

export { WorkspaceArea };
