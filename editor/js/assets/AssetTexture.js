import * as THREE from 'three';
import { isImageAsset, isTextureAsset, storeSourceFiles } from '../ProjectAssets.js';
const cache = new WeakMap();
export async function loadAssetTexture( editor, file, path ) {
	if ( ! isTextureAsset( file ) ) throw new Error( 'Choose a supported image or texture file.' );
	let texture = cache.get( file );
	if ( ! texture ) {

		const extension = file.name.split( '.' ).pop().toLowerCase();
		const url = URL.createObjectURL( file );
		let loader;
		try {

			if ( extension === 'hdr' || extension === 'pic' ) {

				const { HDRLoader } = await import( 'three/addons/loaders/HDRLoader.js' );
				loader = new HDRLoader();

			} else if ( extension === 'tga' ) {

				const { TGALoader } = await import( 'three/addons/loaders/TGALoader.js' );
				loader = new TGALoader();

			} else if ( extension === 'ktx2' ) {

				const { KTX2Loader } = await import( 'three/addons/loaders/KTX2Loader.js' );
				loader = new KTX2Loader().setTranscoderPath( '../examples/jsm/libs/basis/' );
				editor.signals.rendererDetectKTX2Support.dispatch( loader );

			} else if ( extension === 'exr' ) {

				const { EXRLoader } = await import( 'three/addons/loaders/EXRLoader.js' );
				loader = new EXRLoader();

			} else if ( isImageAsset( file ) ) {

				loader = new THREE.TextureLoader();

			}

			texture = await loader.loadAsync( url );
			if ( extension === 'tga' || extension === 'ktx2' ) texture.colorSpace = THREE.SRGBColorSpace;
			texture.sourceFile = file.name;
			cache.set( file, texture );

		} catch ( error ) {

			throw new Error( 'Could not open texture: ' + file.name, { cause: error } );

		} finally {

			loader?.dispose?.();
			URL.revokeObjectURL( url );

		}

	}

	path ||= storeSourceFiles( editor, { [ file.name ]: file } ).get( file );
	const clone = texture.clone();
	clone.sourceFile = texture.sourceFile;
	clone.userData.sourceAssetPath = path;
	return clone;
}
