import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { ColorEnvironment } from 'three/addons/environments/ColorEnvironment.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { APP } from './app.js';

async function playApp( json, importScriptModule ) {

	window.THREE = THREE;
	THREE.ObjectLoader.registerGeometry( 'TextGeometry', TextGeometry );

	const player = new APP.Player( importScriptModule );
	await player.load( json );
	const scene = player.getScene();
	const renderer = player.getRenderer();
	renderer.setClearColor( 0xaaaaaa );
	if ( json.environmentType === 'Default' && ! scene.environment && renderer.isWebGLRenderer ) {

		const pmrem = new THREE.PMREMGenerator( renderer );
		const environment = scene.background?.isColor ? new ColorEnvironment( scene.background ) : new RoomEnvironment();
		scene.environment = pmrem.fromScene( environment, 0.04 ).texture;
		environment.dispose();
		pmrem.dispose();

	}

	player.setSize( window.innerWidth, window.innerHeight );
	player.play();
	document.body.appendChild( player.dom );
	window.addEventListener( 'resize', () => player.setSize( window.innerWidth, window.innerHeight ) );

}

export { playApp };
