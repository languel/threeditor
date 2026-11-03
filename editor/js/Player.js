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

	const player = new APP.Player();
	container.dom.appendChild( player.dom );

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

	function present() {

		if ( presenting ) {

			signals.stopPlayer.dispatch();
			return;

		}

		presenting = true;
		if ( document.activeElement ) document.activeElement.blur();
		document.body.classList.add( 'presenting' );
		if ( document.fullscreenElement === null && document.documentElement.requestFullscreen ) document.documentElement.requestFullscreen().catch( function () {} );
		signals.startPlayer.dispatch();

	}

	document.addEventListener( 'keydown', function ( event ) {

		if ( event.code !== 'KeyP' || ! event.altKey || ! event.metaKey || event.ctrlKey ) return;
		event.preventDefault();
		present();

	} );

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

	return container;

}

export { Player };
