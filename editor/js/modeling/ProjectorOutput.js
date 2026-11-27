import { fitView } from './LightView.js';

// Use the aperture of the same masked texture that feeds the simulated light.
export function drawProjectorOutput( context, projector ) {

	const { width, height } = context.canvas;
	const aperture = projector.projectorOutput;
	context.fillStyle = '#000';
	context.fillRect( 0, 0, width, height );
	if ( ! aperture ) return;
	for ( let object = projector; object; object = object.parent ) {

		if ( ! object.visible || object.userData.threeditor?.disabled ) return;

	}
	const rect = fitView( { x: 0, y: 0, width, height }, aperture.width / aperture.height );
	context.drawImage( aperture.canvas, aperture.x, aperture.y, aperture.width, aperture.height, rect.x, rect.y, rect.width, rect.height );

}

// Match the editor's optical pane, including its fixed lens aspect.
export function renderFittedView( THREE, renderer, scene, camera, width, height, draw ) {

	const aspect = camera.isOrthographicCamera ? ( camera.right - camera.left ) / ( camera.top - camera.bottom ) : camera.aspect;
	const rect = fitView( { x: 0, y: 0, width, height }, aspect );
	if ( rect.width === width && rect.height === height ) return draw();

	const background = scene.background;
	const clearColor = renderer.getClearColor( new THREE.Color() );
	const clearAlpha = renderer.getClearAlpha();
	const autoClear = renderer.autoClear;
	const y = renderer.isWebGPURenderer ? rect.y : height - rect.y - rect.height;
	try {

		if ( background?.isColor ) renderer.setClearColor( background, 1 );
		renderer.clear();
		if ( background?.isColor ) scene.background = null;
		renderer.autoClear = false;
		renderer.setViewport( rect.x, y, rect.width, rect.height );
		renderer.setScissor( rect.x, y, rect.width, rect.height );
		renderer.setScissorTest( true );
		draw();

	} finally {

		scene.background = background;
		renderer.setClearColor( clearColor, clearAlpha );
		renderer.setScissorTest( false );
		renderer.setViewport( 0, 0, width, height );
		renderer.autoClear = autoClear;

	}

}

const windowSources = new WeakMap();

export function openProjectorOutput( projector ) {

	const output = window.open( '', 'projector-output-' + projector.uuid, 'popup,width=960,height=540' );
	if ( ! output ) {

		alert( 'Allow pop-up windows to open the projector output.' );
		return;

	}
	const { document } = output;
	if ( windowSources.get( output ) === projector && document.querySelector( 'canvas' ) ) {

		output.focus();
		return;

	}
	windowSources.set( output, projector );
	document.title = projector.name || 'Projector output';
	document.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
	const canvas = document.createElement( 'canvas' );
	canvas.style.cssText = 'display:block;width:100vw;height:100vh';
	canvas.title = 'Double-click for fullscreen';
	document.body.replaceChildren( canvas );
	const context = canvas.getContext( '2d', { alpha: false } );
	canvas.addEventListener( 'dblclick', () => {

		if ( document.fullscreenElement ) document.exitFullscreen();
		else canvas.requestFullscreen?.().catch( () => {} );

	} );

	function frame() {

		if ( output.closed || ! canvas.isConnected ) return;
		const width = Math.round( output.innerWidth * output.devicePixelRatio );
		const height = Math.round( output.innerHeight * output.devicePixelRatio );
		if ( canvas.width !== width ) canvas.width = width;
		if ( canvas.height !== height ) canvas.height = height;
		drawProjectorOutput( context, projector );
		output.requestAnimationFrame( frame );

	}

	output.requestAnimationFrame( frame );

}
