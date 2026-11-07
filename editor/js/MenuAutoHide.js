function MenuAutoHide( editor, menu ) {

	const edge = document.createElement( 'div' );
	edge.className = 'menubar-edge';
	edge.setAttribute( 'aria-hidden', 'true' );
	document.body.appendChild( edge );
	let timer;

	function reveal() {

		clearTimeout( timer );
		menu.classList.add( 'revealed' );

	}

	function scheduleHide() {

		clearTimeout( timer );
		timer = setTimeout( () => {

			if ( ! menu.matches( ':hover, :focus-within' ) ) menu.classList.remove( 'revealed' );

		}, 180 );

	}

	edge.addEventListener( 'pointerenter', event => { if ( event.pointerType !== 'touch' ) reveal(); } );
	edge.addEventListener( 'pointerleave', scheduleHide );
	edge.addEventListener( 'click', reveal );
	menu.addEventListener( 'pointerenter', () => clearTimeout( timer ) );
	menu.addEventListener( 'pointerleave', scheduleHide );
	menu.addEventListener( 'focusout', scheduleHide );
	document.addEventListener( 'pointerdown', event => {

		if ( ! menu.contains( event.target ) && event.target !== edge ) scheduleHide();

	} );

	function update() {

		clearTimeout( timer );
		menu.classList.remove( 'revealed' );
		document.body.classList.toggle( 'menubar-auto-hide', editor.config.getKey( 'settings/autoHideMenubar' ) );
		editor.signals.windowResize.dispatch();

	}

	editor.signals.menuAutoHideChanged.add( update );
	update();

}

export { MenuAutoHide };
