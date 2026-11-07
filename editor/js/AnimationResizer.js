import { UIElement } from './libs/ui.js';

function AnimationResizer( editor ) {

	const dom = document.createElement( 'div' );
	dom.id = 'animation-resizer';

	let startY;
	let startHeight;

	dom.addEventListener( 'pointerdown', ( event ) => {

		if ( event.isPrimary === false || event.button !== 0 ) return;
		startY = event.clientY;
		startHeight = parseFloat( getComputedStyle( document.getElementById( 'animation' ) ).height );
		dom.setPointerCapture( event.pointerId );

	} );

	dom.addEventListener( 'pointermove', ( event ) => {

		if ( ! dom.hasPointerCapture( event.pointerId ) ) return;

		const height = Math.max( 36, Math.min( window.innerHeight / 2, startHeight + startY - event.clientY ) );
		editor.signals.animationPanelResized.dispatch( height );

	} );

	return new UIElement( dom );

}

export { AnimationResizer };
