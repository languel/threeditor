function textureEntries( editor ) {

	const entries = [];
	const seen = new Set();
	function add( texture, label ) {

		if ( ! texture?.isTexture || texture.isRenderTargetTexture || ! texture.image?.width || seen.has( texture.source ) ) return;
		seen.add( texture.source );
		const path = texture.userData.sourceAssetPath || texture.userData.assetPath?.replace( /^assets\//, '' );
		if ( path && editor.sourceFiles?.has( path ) ) return;
		const name = texture.name || texture.sourceFile || label;
		entries.push( { name, detail: 'Scene texture', texture, preview: texture.image.src } );

	}

	add( editor.scene.background, 'Background' );
	add( editor.scene.environment, 'Environment' );
	editor.scene.traverse( object => {

		for ( const material of [ object.material ].flat() ) {

			if ( ! material ) continue;
			for ( const [ key, texture ] of Object.entries( material ) ) add( texture, ( object.name || object.type ) + ' · ' + key );

		}

	} );
	return entries;

}

function openAssetBrowser( editor, options ) {
	editor.assetBrowser.open( options );
}

export { openAssetBrowser, textureEntries };
