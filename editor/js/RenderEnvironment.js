import * as THREE from 'three';
import { ColorEnvironment } from 'three/addons/environments/ColorEnvironment.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// PMREM render targets belong to the renderer that created them; rebuild the
// editor's procedural environment for each independent render context.
async function setupRenderEnvironment( scene, renderer, type ) {

	if ( type !== 'Default' ) return null;
	if ( scene.background?.isTexture ) {

		scene.environment = scene.background;
		scene.environment.mapping = THREE.EquirectangularReflectionMapping;
		scene.environmentRotation.y = scene.backgroundRotation.y;
		return null;

	}

	const Generator = renderer.isWebGPURenderer ? ( await import( 'three/webgpu' ) ).PMREMGenerator : THREE.PMREMGenerator;
	const generator = new Generator( renderer );
	const environment = scene.background?.isColor ? new ColorEnvironment( scene.background ) : new RoomEnvironment();
	try {

		const target = generator.fromScene( environment, 0.04 );
		scene.environment = target.texture;
		return target;

	} finally {

		environment.dispose();
		generator.dispose();

	}

}

async function setupPathTracingEnvironment( scene, type ) {

	if ( type !== 'Default' ) return null;
	if ( scene.background?.isTexture ) { scene.environment = scene.background; return null; }
	const renderer = new THREE.WebGLRenderer();
	const target = new THREE.WebGLCubeRenderTarget( 128, { type: THREE.HalfFloatType } );
	const environment = scene.background?.isColor ? new ColorEnvironment( scene.background ) : new RoomEnvironment();
	const { CubeToEquirectGenerator } = await import( 'three-gpu-pathtracer/cubemap' );
	const converter = new CubeToEquirectGenerator( renderer );
	try {

		new THREE.CubeCamera( 0.1, 100, target ).update( renderer, environment );
		const texture = converter.generate( target.texture );
		scene.environment = texture;
		return texture;

	} finally {

		converter.dispose();
		environment.dispose();
		target.dispose();
		renderer.dispose();

	}

}

export { setupRenderEnvironment, setupPathTracingEnvironment };
