import * as THREE from 'three';

import { Editor } from './Editor.js';
import { Keymap } from './Keymap.js';
import { ModalTransform } from './ModalTransform.js';
import { applyTheme } from './Theme.js';
import { Viewport } from './Viewport.js?v=camera-playback';
import { Toolbar } from './Toolbar.js';
import { Player } from './Player.js?v=preview-color';
import { Sidebar } from './Sidebar.js';
import { Menubar } from './Menubar.js';
import { MenuAutoHide } from './MenuAutoHide.js';
import { ContextMenu } from './ContextMenu.js';
import { AgentAPI } from './AgentAPI.js';
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
	let finishStartup;
	editor.startupReady = new Promise( resolve => { finishStartup = resolve; } );
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

	const updateTheme = () => applyTheme( editor.config, systemTheme.matches );
	editor.signals.themeChanged.add( updateTheme );
	systemTheme.addEventListener( 'change', function () {

		if ( editor.config.getKey( 'settings/theme' ) === 'system' ) editor.signals.themeChanged.dispatch();

	} );
	updateTheme();

	window.editor = editor; // Expose editor to Console
	window.THREE = THREE; // Expose THREE to APP Scripts and Console

	THREE.ObjectLoader.registerGeometry( 'TextGeometry', TextGeometry );

	editor.keymap = new Keymap( editor );
	editor.modalTransform = new ModalTransform( editor );
	const viewport = new Viewport( editor );
	document.body.appendChild( viewport.dom );

	const toolbar = new Toolbar( editor );
	document.body.appendChild( toolbar.dom );

	const player = new Player( editor );
	editor.player = player;
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
	MenuAutoHide( editor, menubar.dom );
	editor.keymap.registerMenu( menubar.dom );
	editor.contextMenu = new ContextMenu( editor, viewport.dom );
	window.threeditor = AgentAPI( editor );

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

				finishStartup();

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
			signals.assetsChanged.add( saveState );

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
		finishStartup();
		player.present( false );
		return editor;

	}

	const hash = window.location.hash;

	if ( hash.slice( 1, 6 ) === 'file=' ) {

		const file = hash.slice( 6 );

		if ( confirm( editor.strings.getKey( 'prompt/file/open' ) ) ) {

			const loader = new THREE.FileLoader();
			loader.crossOrigin = '';
			loader.load( file, async function ( text ) {

				editor.clear();
				try { await editor.fromJSON( JSON.parse( text ) ); } finally { finishStartup(); }

			}, undefined, () => finishStartup() );

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
