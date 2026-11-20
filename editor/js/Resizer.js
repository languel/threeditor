import { UIElement } from './libs/ui.js';

function Resizer( editor ) {

	const dom = document.createElement( 'div' );
	dom.id = 'resizer';
	dom.tabIndex = 0;
	dom.setAttribute( 'role', 'separator' );
	dom.setAttribute( 'aria-label', 'Resize right sidebar' );
	dom.setAttribute( 'aria-orientation', 'vertical' );
	dom.setAttribute( 'aria-controls', 'sidebar' );

	dom.addEventListener( 'pointerdown', ( event ) => {

		if ( event.isPrimary === false || event.button !== 0 ) return;
		dom.setPointerCapture( event.pointerId );

	} );

	dom.addEventListener( 'pointermove', ( event ) => {

		if ( ! dom.hasPointerCapture( event.pointerId ) ) return;

		const max = Math.max( 335, window.innerWidth - 100 );
		const width = Math.min( max, Math.max( 335, window.innerWidth - event.clientX ) );
		document.body.style.setProperty( '--sidebar-width', width + 'px' );
		editor.signals.windowResize.dispatch();

	} );

	return new UIElement( dom );

}

export { Resizer };
