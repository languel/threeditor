import { UIPanel } from './libs/ui.js';

import { ViewHelper as ViewHelperBase } from 'three/addons/helpers/ViewHelper.js';

class ViewHelper extends ViewHelperBase {

	constructor( editorCamera, container, orbit ) {

		super( editorCamera, container.dom );

		this.location.top = 30;

		const panel = new UIPanel();
		panel.setId( 'viewHelper' );
		panel.setPosition( 'absolute' );
		panel.setRight( '0px' );
		panel.setTop( '30px' );
		panel.setHeight( '128px' );
		panel.setWidth( '128px' );

		this.panel = panel.dom;
		this.panel.title = 'Drag to orbit. Click an axis to align.';
		let drag = null;
		this.panel.addEventListener( 'pointerdown', event => {

			if ( event.button !== 0 || this.animating ) return;
			event.stopPropagation();
			drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
			this.panel.setPointerCapture( event.pointerId );

		} );
		this.panel.addEventListener( 'pointermove', event => {

			if ( drag?.id !== event.pointerId ) return;
			const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
			if ( ! drag.moved && Math.hypot( dx, dy ) < 3 ) return;
			Object.assign( drag, { x: event.clientX, y: event.clientY, moved: true } );
			orbit( -dx, -dy );

		} );
		this.panel.addEventListener( 'pointerup', event => {

			if ( drag?.id !== event.pointerId ) return;
			event.stopPropagation();
			if ( ! drag.moved ) this.handleClick( event );
			drag = null;

		} );
		this.panel.addEventListener( 'lostpointercapture', () => { drag = null; } );

		container.add( panel );

	}

}

export { ViewHelper };
