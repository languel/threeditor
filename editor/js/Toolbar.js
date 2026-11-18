import { addTransformSettings } from './TransformSettings.js?v=live-preview';
import { UIPanel, UIButton } from './libs/ui.js';

function Toolbar( editor ) {

	const signals = editor.signals;
	const strings = editor.strings;

	const container = new UIPanel();
	container.setId( 'toolbar' );

	const tools = editor.viewTools.transformTools;

	const translateIcon = document.createElement( 'img' );
	translateIcon.title = strings.getKey( 'toolbar/translate' );
	translateIcon.src = editor.portable?.url( 'images/translate.svg' ) || 'images/translate.svg';

	const translate = new UIButton();
	translate.dom.className = 'Button selected';
	translate.dom.setAttribute( 'aria-label', translateIcon.title );
	translate.dom.appendChild( translateIcon );
	translate.onClick( function () {

		signals.transformModeChanged.dispatch( 'translate' );

	} );
	tools.append( translate.dom );
	translate.dom.setAttribute( 'aria-pressed', 'true' );

	const rotateIcon = document.createElement( 'img' );
	rotateIcon.title = strings.getKey( 'toolbar/rotate' );
	rotateIcon.src = editor.portable?.url( 'images/rotate.svg' ) || 'images/rotate.svg';

	const rotate = new UIButton();
	rotate.dom.setAttribute( 'aria-label', rotateIcon.title );
	rotate.dom.appendChild( rotateIcon );
	rotate.onClick( function () {

		signals.transformModeChanged.dispatch( 'rotate' );

	} );
	tools.append( rotate.dom );
	rotate.dom.setAttribute( 'aria-pressed', 'false' );

	const scaleIcon = document.createElement( 'img' );
	scaleIcon.title = strings.getKey( 'toolbar/scale' );
	scaleIcon.src = editor.portable?.url( 'images/scale.svg' ) || 'images/scale.svg';

	const scale = new UIButton();
	scale.dom.setAttribute( 'aria-label', scaleIcon.title );
	scale.dom.appendChild( scaleIcon );
	scale.onClick( function () {

		signals.transformModeChanged.dispatch( 'scale' );

	} );
	tools.append( scale.dom );
	scale.dom.setAttribute( 'aria-pressed', 'false' );

	//

	signals.transformModeChanged.add( function ( mode ) {

		for ( const [ id, button ] of [ [ 'translate', translate ], [ 'rotate', rotate ], [ 'scale', scale ] ] ) {

			button.dom.classList.toggle( 'selected', id === mode );
			button.dom.setAttribute( 'aria-pressed', String( id === mode ) );

		}

	} );

	addTransformSettings( editor, container.dom );
	return container;

}

export { Toolbar };
