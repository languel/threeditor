import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { ShaderChunk } from 'three';
import { withViewportObjects } from './ObjectRestrictions.js';
import cubeUVReflection from './libs/cube_uv_reflection_fragment.js';

// WebGL path tracer still references the pre-r187 cube-UV shader chunk.
if ( ! ShaderChunk.cube_uv_reflection_fragment ) ShaderChunk.cube_uv_reflection_fragment = cubeUVReflection;

function ViewportPathtracer( renderer ) {

	let pathTracer = null;
	let dirty = true;
	let stopped = false;

	function init( scene, camera ) {

		if ( ! dirty || stopped ) return;
		if ( pathTracer === null ) {

			pathTracer = new WebGLPathTracer( renderer );
			pathTracer.filterGlossyFactor = 0.5;
			pathTracer.tiles.set( 1, 1 );
			pathTracer.minSamples = 1;
			pathTracer.fadeDuration = 0;

		}

		withViewportObjects( scene, () => pathTracer.setScene( scene, camera ) );
		dirty = false;

	}

	function invalidate() {

		dirty = true;
		stopped = false;

	}

	function setSize( /* width, height */ ) {

		if ( pathTracer === null ) return;

		// path tracer size automatically updates based on the canvas
		pathTracer.updateCamera();

	}

	function setBackground( /* background, blurriness */ ) {

		if ( pathTracer === null ) return;

		// update environment settings based on initialized scene fields
		pathTracer.updateEnvironment();

	}

	function updateMaterials() {

		if ( pathTracer === null ) return;

		pathTracer.updateMaterials();

	}

	function setEnvironment( /* environment */ ) {

		if ( pathTracer === null ) return;

		pathTracer.updateEnvironment();

	}

	function update( scene, camera ) {

		if ( stopped ) return null;
		try {

			init( scene, camera );
			pathTracer.pausePathTracing = pathTracer.samples >= 128;
			withViewportObjects( scene, () => pathTracer.renderSample() );
			return Math.floor( pathTracer.samples );

		} catch ( error ) {

			console.warn( 'Viewport path tracing paused:', error );
			stopped = true;
			return null;

		}

	}

	function reset() {

		if ( pathTracer && ! dirty ) pathTracer.updateCamera();

	}

	function dispose() {

		pathTracer?.dispose();
		pathTracer = null;
		invalidate();
	}

	return {
		invalidate,
		dispose,
		setSize: setSize,
		setBackground: setBackground,
		setEnvironment: setEnvironment,
		updateMaterials: updateMaterials,
		update: update,
		reset: reset
	};

}

export { ViewportPathtracer };
