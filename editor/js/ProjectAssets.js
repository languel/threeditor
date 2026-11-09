const imageExtensions = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;
const textureExtensions = /\.(exr|hdr|ktx2|pic|tga)$/i;
const importExtensions = /\.(3dm|3ds|3mf|amf|dae|drc|fbx|glb|gltf|js|json|kmz|ldr|md2|mpd|obj|pcd|ply|stl|svg|usd|usda|usdc|usdz|vox|vrm|wrl|xyz|zip)$/i;

function isImageAsset( file ) {

	return file.type.startsWith( 'image/' ) || imageExtensions.test( file.name );

}

function isTextureAsset( file ) {

	return isImageAsset( file ) || textureExtensions.test( file.name );

}

function isImportAsset( file ) {

	return importExtensions.test( file.name );

}

function storeSourceFiles( editor, filesMap ) {

	editor.sourceFiles ||= new Map();
	const keys = Object.keys( filesMap );
	let prefix = '', suffix = 2;
	while ( keys.some( key => editor.sourceFiles.has( prefix + key ) ) ) prefix = 'import-' + suffix ++ + '/';
	const batch = keys.map( key => prefix + key );
	const sourcePaths = new Map();
	for ( const key of keys ) {

		const path = prefix + key;
		const file = filesMap[ key ];
		editor.sourceFiles.set( path, { file, batch } );
		sourcePaths.set( file, path );

	}
	editor.signals.assetsChanged.dispatch();
	return sourcePaths;

}

export { isImageAsset, isTextureAsset, isImportAsset, storeSourceFiles };
