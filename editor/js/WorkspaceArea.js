function WorkspaceArea( editor, menubar, ...areas ) {

	const body = document.body;
	const layout = editor.viewLayout;
	let current, previousFocus, lastPointerArea, lastPane;
	for ( const area of areas ) area.dataset.workspaceArea = area.id;
	const restoreButton = document.createElement( 'button' );
	restoreButton.type = 'button';
	restoreButton.className = 'workspace-area-restore';
	restoreButton.textContent = 'Back to Previous';
	restoreButton.title = 'Restore Area (Ctrl+Space)';
	restoreButton.hidden = true;
	restoreButton.addEventListener( 'click', restore );
	menubar.querySelector( '.panel-toggles' ).prepend( restoreButton );

	function trackArea( event ) {

		const area = event.target.closest?.( '[data-workspace-area]' );
		if ( ! area ) return;
		lastPointerArea = area;
		lastPane = area.id === 'viewport' ? layout.at( event.clientX, event.clientY, 'area' )?.key : undefined;

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
		const area = [ lastPointerArea, document.activeElement?.closest( '[data-workspace-area]' ), areas[ 0 ] ].find( visible );
		if ( ! area ) return;
		previousFocus = document.activeElement;
		current = area;
		body.dataset.maximizedArea = area.id;
		if ( area.id === 'viewport' && editor.viewportSplit && ! editor.editWorkspace.mode ) {

			layout.maximizedPane = lastPointerArea === area && lastPane || 'director';

		}
		restoreButton.hidden = false;
		if ( layout.maximizedPane ) editor.signals.viewportCameraChanged.dispatch();
		editor.signals.windowResize.dispatch();

	}

	editor.signals.windowResize.add( () => { if ( current?.dataset.dock === 'closed' ) restore(); } );
	editor.signals.startPlayer.add( restore );
	editor.signals.projectLoaded.add( restore );
	editor.signals.editorCleared.add( restore );
	return { toggle, reveal: area => { if ( current && current !== area ) restore(); } };

}

export { WorkspaceArea };
