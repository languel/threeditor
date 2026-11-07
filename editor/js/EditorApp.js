import * as THREE from 'three';

import { Editor } from './Editor.js';
import { Viewport } from './Viewport.js';
import { Toolbar } from './Toolbar.js';
import { Player } from './Player.js';
import { Sidebar } from './Sidebar.js';
import { Menubar } from './Menubar.js';
import { Resizer } from './Resizer.js';
import { PanelDock } from './PanelDock.js';
import { CodePanel } from './CodePanel.js';
import { AnimationResizer } from './AnimationResizer.js';
import { Animation } from './Animation.js';

import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

async function startEditor( portable = null ) {

	window.URL = window.URL || window.webkitURL;
	window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;

	//

	let isLoadingFromHash = false;
	const editor = new Editor( portable !== null );
	editor.portable = portable;
	if ( portable ) {

		portable.install( THREE );
		const project = portable.scene.project;
		const config = { ...portable.config, autosave: false,
			'project/renderer/type': project.renderer,
			'project/renderer/shadows': project.shadows,
			'project/renderer/shadowType': project.shadowType,
			'project/renderer/toneMapping': project.toneMapping,
			'project/renderer/toneMappingExposure': project.toneMappingExposure
		};
		editor.config.setKey( ...Object.entries( config ).flat() );

	}
	const systemTheme = window.matchMedia( '(prefers-color-scheme: dark)' );

	function applyTheme() {

		const theme = editor.config.getKey( 'settings/theme' );
		const dark = theme === 'dark' || ( theme === 'system' && systemTheme.matches );
		document.documentElement.dataset.theme = dark ? 'dark' : 'light';

	}

	editor.signals.themeChanged.add( applyTheme );
	systemTheme.addEventListener( 'change', function () {

		if ( editor.config.getKey( 'settings/theme' ) === 'system' ) editor.signals.themeChanged.dispatch();

	} );
	applyTheme();

	window.editor = editor; // Expose editor to Console
	window.THREE = THREE; // Expose THREE to APP Scripts and Console

	THREE.ObjectLoader.registerGeometry( 'TextGeometry', TextGeometry );

	const viewport = new Viewport( editor );
	document.body.appendChild( viewport.dom );

	const toolbar = new Toolbar( editor );
	document.body.appendChild( toolbar.dom );

	const player = new Player( editor );
	document.body.appendChild( player.dom );

	const sidebar = new Sidebar( editor );
	document.body.appendChild( sidebar.dom );

	const codePanel = new CodePanel( editor );
	document.body.appendChild( codePanel.dom );
	editor.codePanel = codePanel;

	const resizer = new Resizer( editor );
	document.body.appendChild( resizer.dom );

	const animation = new Animation( editor );
	document.body.appendChild( animation.dom );

	const animationResizer = new AnimationResizer( editor );
	document.body.appendChild( animationResizer.dom );

	const sidebarDock = new PanelDock( editor, sidebar.dom, resizer.dom, 'right' );
	const timelineDock = new PanelDock( editor, animation.dom, animationResizer.dom, 'bottom' );
	editor.signals.animationPanelChanged.add( () => editor.signals.windowResize.dispatch() );

	const menubar = new Menubar( editor, { sidebar, sidebarDock, timelineDock, toolbar: toolbar.dom } );
	document.body.appendChild( menubar.dom );

	//

	if ( ! portable ) {

		editor.storage.init( function () {

			editor.storage.get( async function ( state ) {

				if ( isLoadingFromHash ) return;

				if ( state !== undefined ) {

					editor.sourceFiles = new Map( state.sourceFiles );
					await editor.fromJSON( state );

				} else {

					editor.signals.sceneEnvironmentChanged.dispatch( 'Default' );

				}

				const selected = editor.config.getKey( 'selected' );

				if ( selected !== undefined ) {

					editor.selectByUuid( selected );

				}

			} );

			//

			let timeout;

			function saveState() {

				if ( editor.config.getKey( 'autosave' ) === false ) {

					return;

				}

				clearTimeout( timeout );

				timeout = setTimeout( function () {

					editor.signals.savingStarted.dispatch();

					timeout = setTimeout( function () {

						if ( editor.config.getKey( 'autosave' ) !== false ) {

							editor.storage.set( { ...editor.toJSON(), sourceFiles: editor.sourceFiles } );

						}

						editor.signals.savingFinished.dispatch();

					}, 100 );

				}, 1000 );

			}

			const signals = editor.signals;

			signals.cameraResetted.add( saveState );
			signals.viewportCameraChanged.add( saveState );
			signals.geometryChanged.add( saveState );
			signals.objectAdded.add( saveState );
			signals.objectChanged.add( saveState );
			signals.objectRemoved.add( saveState );
			signals.materialChanged.add( saveState );
			signals.sceneBackgroundChanged.add( saveState );
			signals.sceneEnvironmentChanged.add( saveState );
			signals.sceneFogChanged.add( saveState );
			signals.sceneGraphChanged.add( saveState );
			signals.scriptChanged.add( saveState );
			signals.historyChanged.add( saveState );

		} );

	}

	//

	document.addEventListener( 'dragover', function ( event ) {

		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';

	} );

	document.addEventListener( 'drop', function ( event ) {

		event.preventDefault();

		if ( event.dataTransfer.types[ 0 ] === 'text/plain' ) return; // Outliner drop

		if ( event.dataTransfer.items ) {

			// DataTransferItemList supports folders

			editor.loader.loadItemList( event.dataTransfer.items );

		} else {

			editor.loader.loadFiles( event.dataTransfer.files );

		}

	} );

	function onWindowResize() {

		editor.signals.windowResize.dispatch();

	}

	window.addEventListener( 'resize', onWindowResize );

	onWindowResize();

	//

	if ( portable ) {

		editor.sourceFiles = portable.sourceFiles;
		await editor.fromJSON( portable.scene );
		player.present( false );
		return editor;

	}

	const hash = window.location.hash;

	if ( hash.slice( 1, 6 ) === 'file=' ) {

		const file = hash.slice( 6 );

		if ( confirm( editor.strings.getKey( 'prompt/file/open' ) ) ) {

			const loader = new THREE.FileLoader();
			loader.crossOrigin = '';
			loader.load( file, function ( text ) {

				editor.clear();
				editor.fromJSON( JSON.parse( text ) );

			} );

			isLoadingFromHash = true;

		}

	}

	// @deprecated, r183

	if ( 'serviceWorker' in navigator ) {

		try {

			navigator.serviceWorker.register( 'sw.js' ).catch( console.warn );

		} catch ( error ) {

		}

	}

	return editor;

}

export { startEditor };
