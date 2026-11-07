// Keep docked, hidden, and temporary overlay states separate from the panel's size.
function PanelDock( editor, panel, handle, side, initiallyOpen = true, onReveal ) {

	const edge = document.createElement( 'div' );
	edge.className = 'panel-edge ' + side;
	edge.setAttribute( 'aria-hidden', 'true' );
	document.body.appendChild( edge );

	let state;
	let timer;
	let button;

	function setState( next ) {

		clearTimeout( timer );
		if ( next === state ) return;
		const revealing = state === 'closed' && next !== 'closed';
		state = next;
		panel.dataset.dock = next;
		handle.dataset.dock = next;
		edge.hidden = next !== 'closed';
		button?.setAttribute( 'aria-pressed', String( next === 'open' ) );

		if ( revealing ) onReveal?.();
		editor.signals.windowResize.dispatch();

	}

	function toggle( open = state !== 'open' ) {

		setState( open ? 'open' : 'closed' );

	}

	function enter() {

		clearTimeout( timer );

	}

	function leave( event ) {

		if ( state !== 'peek' || panel.contains( event.relatedTarget ) || handle.contains( event.relatedTarget ) ) return;
		timer = setTimeout( () => setState( 'closed' ), 160 );

	}

	edge.addEventListener( 'pointerenter', ( event ) => {

		if ( event.pointerType === 'touch' || document.body.classList.contains( 'presenting' ) ) return;
		timer = setTimeout( () => setState( 'peek' ), 160 );

	} );
	edge.addEventListener( 'pointerleave', enter );

	for ( const element of [ panel, handle ] ) {

		element.addEventListener( 'pointerenter', enter );
		element.addEventListener( 'pointerleave', leave );

	}

	handle.title = 'Drag to resize · double-click to collapse or reopen';
	handle.addEventListener( 'dblclick', () => toggle() );
	setState( initiallyOpen ? 'open' : 'closed' );

	return {
		toggle,
		isVisible: () => state !== 'closed',
		bindToggle( element ) {

			button = element;
			button.setAttribute( 'aria-controls', panel.id );
			button.setAttribute( 'aria-pressed', String( state === 'open' ) );
			button.addEventListener( 'click', () => toggle() );

		}
	};

}

export { PanelDock };
