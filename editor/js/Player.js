import { UIPanel } from './libs/ui.js';
import * as THREE from 'three';
import { APP } from './libs/app.js?v=timeline-keying';
import { resolvePlaybackAssets } from './assets/AssetRuntime.js?v=scene-timeline';
import { serializeScript } from './ScriptParams.js';
import { setupRenderEnvironment } from './RenderEnvironment.js';

function Player( editor ) {

	const signals = editor.signals;

	const container = new UIPanel();
	container.setId( 'player' );
	container.setPosition( 'absolute' );
	container.setDisplay( 'none' );

	//

	const player = new APP.Player( editor.portable?.importModule, editor.portable?.prepareScript, editor.streams );
	const parameters = editor.viewportParameters;
	const parameterHome = parameters.dom.parentElement;
	signals.scriptChanged.add( ( script, attribute ) => {

		if ( attribute !== 'paramValues' || ! player.getScene() ) return;
		for ( const [ uuid, scripts ] of Object.entries( editor.scripts ) ) {

			const index = scripts.indexOf( script );
			if ( index === -1 ) continue;
			player.setScriptParameters( uuid, index, serializeScript( script ).parameters || {} );
			break;

		}

	} );
	let environmentTarget = null;
	let playRequest = 0;
	let playPane = null;
	let disposeMediaURLs = () => {};
	signals.stopPlayer.add( () => { disposeMediaURLs(); disposeMediaURLs = () => {}; } );
	container.dom.appendChild( player.dom );
	const exit = editor.portable ? document.createElement( 'button' ) : null;
	if ( exit ) {

		exit.type = 'button';
		exit.className = 'presentation-exit';
		const label = editor.strings.getKey( 'sidebar/project/app/edit-scene' );
		exit.title = label + ' (Esc)';
		exit.setAttribute( 'aria-label', label );
		exit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/></svg>';
		exit.addEventListener( 'click', ( event ) => {

			// Touch has no hover. A tap on the corner reveals the button first.
			if ( event.pointerType === 'touch' && ! exit.classList.contains( 'always-visible' ) && ! exit.classList.contains( 'touch-revealed' ) ) {

				exit.classList.add( 'touch-revealed' );
				return;

			}

			signals.stopPlayer.dispatch();

		} );
		container.dom.appendChild( exit );

	}

	window.addEventListener( 'resize', function () {

		updatePane();
		player.setSize( container.dom.clientWidth, container.dom.clientHeight );

	} );

	signals.windowResize.add( function () {

		updatePane();
		player.setSize( container.dom.clientWidth, container.dom.clientHeight );

	} );

	function updatePane() {

		const layout = editor.viewLayout;
		const frame = playPane && layout.frames.length > 1 && layout.frames.find( frame => frame.key === playPane );
		if ( ! frame ) {

			delete container.dom.dataset.playPane;
			return;

		}
		const { left, top } = editor.renderer.domElement.getBoundingClientRect();
		const { x, y, width, height } = frame.area;
		const style = container.dom.style;
		const sizeChanged = style.getPropertyValue( '--play-width' ) !== width + 'px' || style.getPropertyValue( '--play-height' ) !== height + 'px';
		container.dom.dataset.playPane = frame.key;
		style.setProperty( '--play-x', left + x + 'px' );
		style.setProperty( '--play-y', top + y + 'px' );
		style.setProperty( '--play-width', width + 'px' );
		style.setProperty( '--play-height', height + 'px' );
		if ( sizeChanged ) player.setSize( width, height );

	}
	signals.sceneRendered.add( () => { if ( playPane ) updatePane(); } );

	signals.startPlayer.add( async function ( frameKey ) {

		const request = ++ playRequest;
		const layout = editor.viewLayout;
		const panes = layout.frames.filter( frame => layout.isViewportPane?.( frame.key ) !== false );
		const frame = ! presenting && layout.frames.length > 1 && ( panes.find( item => item.key === frameKey ) || layout.navigation || panes[ 0 ] );
		playPane = frame?.key || null;
		layout.playbackPane = playPane;
		updatePane();
		container.setDisplay( '' );
		parameters.close();
		container.add( parameters );

		try {

			const json = editor.toJSON();
			disposeMediaURLs(); disposeMediaURLs = resolvePlaybackAssets( json, editor.sourceFiles );
			const view = frame ? {
				source: frame.source?.uuid || ( frame.director ? undefined : frame.camera.uuid ),
				camera: frame.camera.toJSON(),
				target: editor.controls.getCenter( frame.camera ).toArray()
			} : undefined;
			await player.load( json, view );
			if ( request !== playRequest ) return;

			// Match the editor's look in the player's separate renderer.
			const renderer = player.getRenderer();
			const scene = player.getScene();
			renderer.setClearColor( editor.viewportColor );
			const target = await setupRenderEnvironment( scene, renderer, json.environmentType );
			if ( request !== playRequest || renderer !== player.getRenderer() ) {

				target?.dispose();
				return;

			}
			environmentTarget = target;

			applyShading();
			player.setSize( container.dom.clientWidth, container.dom.clientHeight );
			editor.streams.playing = true;
			player.play();

		} catch ( error ) {

			if ( request !== playRequest ) return;
			console.error( 'Could not start Play:', error );
			signals.stopPlayer.dispatch();
			alert( 'Could not start Play: ' + error.message );

		}

	} );

	// Z / Shift+Z (handled by the viewport controls) also change the shading while playing
	function applyShading() {

		const scene = player.getScene();
		if ( ! scene ) return;

		switch ( editor.viewportShading ) {

			case 'wireframe':
				scene.overrideMaterial = new THREE.MeshBasicMaterial( { color: 0x000000, wireframe: true } );
				break;
			case 'normals':
				scene.overrideMaterial = new THREE.MeshNormalMaterial();
				break;
			default:
				scene.overrideMaterial = null;

		}

	}

	signals.viewportShadingChanged.add( applyShading );

	function updateClearColor() {

		if ( player.getScene() ) player.setClearColor( editor.viewportColor );

	}

	signals.themeChanged.add( updateClearColor );
	signals.themePreviewChanged.add( updateClearColor );

	// Alt+Cmd+P: presentation mode (fullscreen, no editor UI)
	let presenting = false;

	function present( fullscreen = true ) {

		if ( presenting ) {

			signals.stopPlayer.dispatch();
			return;

		}

		if ( playPane ) signals.stopPlayer.dispatch();
		presenting = true;
		if ( document.activeElement ) document.activeElement.blur();
		if ( exit ) {

			exit.classList.remove( 'touch-revealed' );
			exit.classList.toggle( 'always-visible', editor.config.getKey( 'project/presentationEditVisible' ) === true );

		}
		document.body.classList.add( 'presenting' );
		if ( fullscreen && document.fullscreenElement === null && document.documentElement.requestFullscreen ) document.documentElement.requestFullscreen().catch( function () {} );
		if ( container.dom.style.display === 'none' ) signals.startPlayer.dispatch();
		else signals.windowResize.dispatch();

	}

	document.addEventListener( 'keydown', function ( event ) {

		if ( presenting && event.key === 'Escape' && parameters.isOpen() ) {

			event.preventDefault();
			event.stopPropagation();
			parameters.close();
			return;

		}

		if ( presenting && event.key === 'Escape' && ! document.fullscreenElement ) {

			event.preventDefault();
			signals.stopPlayer.dispatch();
			return;

		}

	}, true );

	document.addEventListener( 'fullscreenchange', function () {

		if ( presenting && ! document.fullscreenElement ) signals.stopPlayer.dispatch();
		else if ( presenting ) player.setSize( container.dom.clientWidth, container.dom.clientHeight );

	} );

	signals.stopPlayer.add( function () {

		if ( ! presenting ) return;
		presenting = false;
		document.body.classList.remove( 'presenting' );
		if ( document.fullscreenElement ) document.exitFullscreen().catch( function () {} );

	} );

	signals.stopPlayer.add( function () {

		playRequest ++;
		playPane = editor.viewLayout.playbackPane = null;
		updatePane();
		container.setDisplay( 'none' );
		editor.streams.playing = false;
		parameters.close();
		parameterHome.appendChild( parameters.dom );

		try {

			player.stop();

		} catch ( error ) {

			console.error( 'Could not stop Play cleanly:', error );

		} finally {

			environmentTarget?.dispose();
			environmentTarget = null;
			player.dispose();

		}

	} );

	return { dom: container.dom, present };

}

export { Player };
