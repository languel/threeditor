import * as THREE from 'three';
import { APP } from '../../editor/js/libs/app.js';

window.THREE = THREE;
const player = new APP.Player();
const pause = document.querySelector( '#pause' );
let playing = false;

try {

	const response = await fetch( './scene.json' );
	if ( ! response.ok ) throw new Error( 'Could not load the fox scene.' );
	await player.load( await response.json() );
	document.body.prepend( player.dom );
	const resize = () => player.setSize( innerWidth, innerHeight );
	addEventListener( 'resize', resize );
	resize();
	player.play();
	playing = true;
	pause.disabled = false;
	pause.addEventListener( 'click', () => {

		if ( playing ) player.stop();
		else player.play();
		playing = ! playing;
		pause.textContent = playing ? 'Pause' : 'Resume';

	} );

} catch ( error ) {

	console.error( error );
	const message = document.querySelector( '#error' );
	message.textContent = error.message;
	message.hidden = false;

}
