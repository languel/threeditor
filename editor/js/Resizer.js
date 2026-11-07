import { UIElement } from './libs/ui.js';

function Resizer( editor ) {

	const dom = document.createElement( 'div' );
	dom.id = 'resizer';

	dom.addEventListener( 'pointerdown', ( event ) => {

		if ( event.isPrimary === false || event.button !== 0 ) return;
		dom.setPointerCapture( event.pointerId );

	} );

	dom.addEventListener( 'pointermove', ( event ) => {

		if ( ! dom.hasPointerCapture( event.pointerId ) ) return;

		const left = parseFloat( getComputedStyle( document.getElementById( 'viewport' ) ).left ) || 0;
		const max = Math.max( 335, window.innerWidth - left - 100 );
		const width = Math.min( max, Math.max( 335, window.innerWidth - event.clientX ) );
		document.body.style.setProperty( '--sidebar-width', width + 'px' );
		editor.signals.windowResize.dispatch();

	} );

	return new UIElement( dom );

}

export { Resizer };
