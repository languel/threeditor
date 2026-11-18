import { UIHorizontalRule, UIPanel, UIRow } from './libs/ui.js';

function MenubarView( editor ) {

	const signals = editor.signals;
	const strings = editor.strings;

	const container = new UIPanel();
	container.setClass( 'menu' );

	const title = new UIPanel();
	title.setClass( 'title' );
	title.setTextContent( strings.getKey( 'menubar/view' ) );
	title.dom.dataset.glyphKey = 'menubar/view';
	container.add( title );

	const options = new UIPanel();
	options.setClass( 'options' );
	container.add( options );

	// Helpers

	const states = {

		gridHelper: editor.config.getKey( 'settings/gridVisible' ),
		cameraHelpers: true,
		lightHelpers: true,
		skeletonHelpers: true

	};

	// Grid Helper

	let option = new UIRow().addClass( 'option' ).addClass( 'toggle' ).setTextContent( strings.getKey( 'menubar/view/gridHelper' ) ).onClick( function () {

		editor.config.setKey( 'settings/gridVisible', ! states.gridHelper );
		signals.transformSettingsChanged.dispatch( 'gridVisible' );

	} ).toggleClass( 'toggle-on', states.gridHelper );

	options.add( option );
	const gridOption = option;
	signals.transformSettingsChanged.add( key => {

		if ( key !== 'gridVisible' && key !== 'gridStep' ) return;
		states.gridHelper = editor.config.getKey( 'settings/gridVisible' );
		gridOption.toggleClass( 'toggle-on', states.gridHelper );
		signals.showHelpersChanged.dispatch( states );

	} );

	// Camera Helpers

	option = new UIRow().addClass( 'option' ).addClass( 'toggle' ).setTextContent( strings.getKey( 'menubar/view/cameraHelpers' ) ).onClick( function () {

		states.cameraHelpers = ! states.cameraHelpers;

		this.toggleClass( 'toggle-on', states.cameraHelpers );

		signals.showHelpersChanged.dispatch( states );

	} ).toggleClass( 'toggle-on', states.cameraHelpers );

	options.add( option );

	// Light Helpers

	option = new UIRow().addClass( 'option' ).addClass( 'toggle' ).setTextContent( strings.getKey( 'menubar/view/lightHelpers' ) ).onClick( function () {

		states.lightHelpers = ! states.lightHelpers;

		this.toggleClass( 'toggle-on', states.lightHelpers );

		signals.showHelpersChanged.dispatch( states );

	} ).toggleClass( 'toggle-on', states.lightHelpers );

	options.add( option );

	// Skeleton Helpers

	option = new UIRow().addClass( 'option' ).addClass( 'toggle' ).setTextContent( strings.getKey( 'menubar/view/skeletonHelpers' ) ).onClick( function () {

		states.skeletonHelpers = ! states.skeletonHelpers;

		this.toggleClass( 'toggle-on', states.skeletonHelpers );

		signals.showHelpersChanged.dispatch( states );

	} ).toggleClass( 'toggle-on', states.skeletonHelpers );

	options.add( option );

	// new helpers are visible by default, the global visibility state
	const helperOptions = [ ...options.dom.querySelectorAll( '.option' ) ];
	editor.shortcutToggleHelper = id => helperOptions[ { grid: 0, cameraHelpers: 1, lightHelpers: 2, skeletonHelpers: 3 }[ id ] ]?.click();
	options.add( new UIHorizontalRule() );
	options.add( new UIRow().addClass( 'option' ).setTextContent( 'Toggle Maximize Area' ).onClick( () => editor.keymap.run( 'maximizeArea' ) ) );
	options.add( new UIRow().addClass( 'option' ).setTextContent( 'Toggle Viewport Sidebar' ).onClick( () => editor.keymap.run( 'viewportSidebar' ) ) );
	options.add( new UIRow().addClass( 'option' ).setTextContent( 'Toggle Viewport Toolbar' ).onClick( () => editor.keymap.run( 'viewportToolbar' ) ) );
	options.add( new UIRow().addClass( 'option' ).setTextContent( 'Toggle Viewport Overlays' ).onClick( () => editor.keymap.run( 'viewportOverlays' ) ) );
	options.add( new UIRow().addClass( 'option' ).setTextContent( 'View Navigation…' ).onClick( () => editor.keymap.run( 'navigationPie' ) ) );
	for ( const [ label, action ] of [
		[ 'Toggle Local View', 'localView' ], [ 'Hide Selected in Viewport', 'hideSelection' ],
		[ 'Hide Unselected in Viewport', 'hideUnselected' ], [ 'Reveal Hidden in Viewport', 'revealHidden' ],
		[ 'Interaction Mode…', 'modePie' ]
	] ) options.add( new UIRow().addClass( 'option' ).setTextContent( label ).onClick( () => editor.keymap.run( action ) ) );
	options.add( new UIRow().addClass( 'option' ).setTextContent( 'Toggle Perspective / Orthographic' ).onClick( () => editor.keymap.run( 'projection' ) ) );
	options.add( new UIRow().addClass( 'option' ).setTextContent( 'Toggle X-Ray' ).onClick( () => editor.keymap.run( 'toggleXRay' ) ) );
	options.add( new UIRow().addClass( 'option' ).setTextContent( 'Snap Selection and 3D Cursor…' ).onClick( () => editor.keymap.run( 'cursorSnapPie' ) ) );
	options.add( new UIRow().addClass( 'option' ).setTextContent( 'Align Active Camera to View' ).onClick( () => editor.keymap.run( 'alignActiveCamera' ) ) );
	const activeCamera = new UIRow().setTextContent( 'Set Selected Camera as Active' ).onClick( () => editor.keymap.run( 'setActiveCamera' ) );
	const updateActiveCamera = () => activeCamera.setClass( editor.keymap?.actionAvailable( 'setActiveCamera' ) ? 'option' : 'inactive' );
	signals.objectSelected.add( updateActiveCamera );
	updateActiveCamera();
	options.add( activeCamera );
	options.add( new UIRow().addClass( 'option' ).setTextContent( 'Fly Camera' ).onClick( () => editor.keymap.run( 'fly' ) ) );
	// of helpers is managed in this component. every time a helper is added,
	// we request a viewport updated by firing the showHelpersChanged signal.

	signals.helperAdded.add( function () {

		signals.showHelpersChanged.dispatch( states );

	} );

	//

	options.add( new UIHorizontalRule() );

	options.add( new UIRow().setClass( 'option' ).setTextContent( 'Toggle tool shelf' )
		.onClick( () => editor.viewTools.toggleShelf() ) );

	// Fullscreen

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/view/fullscreen' ) );
	option.onClick( function () {

		if ( document.fullscreenElement === null ) {

			document.documentElement.requestFullscreen();

		} else if ( document.exitFullscreen ) {

			document.exitFullscreen();

		}

		// Safari

		if ( document.webkitFullscreenElement === null ) {

			document.documentElement.webkitRequestFullscreen();

		} else if ( document.webkitExitFullscreen ) {

			document.webkitExitFullscreen();

		}

	} );
	options.add( option );

	// XR (Work in progress)

	if ( 'xr' in navigator ) {

		if ( 'offerSession' in navigator.xr ) {

			signals.offerXR.dispatch( 'immersive-ar' );

		} else {

			navigator.xr.isSessionSupported( 'immersive-ar' )
				.then( function ( supported ) {

					if ( supported ) {

						const option = new UIRow();
						option.setClass( 'option' );
						option.setTextContent( 'AR' );
						option.onClick( function () {

							signals.enterXR.dispatch( 'immersive-ar' );

						} );
						options.add( option );

					} else {

						navigator.xr.isSessionSupported( 'immersive-vr' )
							.then( function ( supported ) {

								if ( supported ) {

									const option = new UIRow();
									option.setClass( 'option' );
									option.setTextContent( 'VR' );
									option.onClick( function () {

										signals.enterXR.dispatch( 'immersive-vr' );

									} );
									options.add( option );

								}

							} );

					}

				} );

		}

	}

	//

	return container;

}

export { MenubarView };
