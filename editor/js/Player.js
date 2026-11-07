import { UIPanel } from './libs/ui.js';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { APP } from './libs/app.js';

function Player( editor ) {

	const signals = editor.signals;

	const container = new UIPanel();
	container.setId( 'player' );
	container.setPosition( 'absolute' );
	container.setDisplay( 'none' );

	//

	const player = new APP.Player( editor.portable?.importModule, editor.portable?.prepareScript );
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

		player.setSize( container.dom.clientWidth, container.dom.clientHeight );

	} );

	signals.windowResize.add( function () {

		player.setSize( container.dom.clientWidth, container.dom.clientHeight );

	} );

	signals.startPlayer.add( async function () {

		container.setDisplay( '' );

		const json = editor.toJSON();
		await player.load( json );
		if ( container.dom.style.display === 'none' ) return;

		// Match the editor's look: neutral clear colour and the "Default" room environment (the player has its own GL context)
		const renderer = player.getRenderer();
		const scene = player.getScene();
		renderer.setClearColor( 0xaaaaaa );
		if ( json.environmentType === 'Default' && ! scene.environment && renderer.isWebGLRenderer ) {

			const pmrem = new THREE.PMREMGenerator( renderer );
			scene.environment = pmrem.fromScene( new RoomEnvironment(), 0.04 ).texture;
			pmrem.dispose();

		}

		applyShading();
		player.setSize( container.dom.clientWidth, container.dom.clientHeight );
		player.play();

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

	// Alt+Cmd+P: presentation mode (fullscreen, no editor UI)
	let presenting = false;

	function present( fullscreen = true ) {

		if ( presenting ) {

			signals.stopPlayer.dispatch();
			return;

		}

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

		container.setDisplay( 'none' );

		player.stop();
		player.dispose();

	} );

	return { dom: container.dom, present };

}

export { Player };
