import { isImageAsset, isImportAsset, isTextureAsset } from './ProjectAssets.js';

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

function openAssetBrowser( editor, { kind, onPick, onUpload } ) {

	if ( document.querySelector( '.asset-browser[open]' ) ) return;
	const textures = kind === 'texture';
	const filter = textures ? isTextureAsset : isImportAsset;
	const entries = [];
	const urls = [];
	for ( const [ path, { file } ] of editor.sourceFiles || [] ) {

		if ( ! filter( file ) ) continue;
		const preview = isImageAsset( file ) ? URL.createObjectURL( file ) : null;
		if ( preview ) urls.push( preview );
		entries.push( { name: path.split( '/' ).pop(), detail: path, file, path, preview } );

	}
	if ( textures ) entries.push( ...textureEntries( editor ) );
	entries.sort( ( a, b ) => a.name.localeCompare( b.name ) );

	const dialog = document.createElement( 'dialog' );
	dialog.className = 'asset-browser';
	const title = document.createElement( 'h2' );
	title.textContent = textures ? 'Choose texture' : 'Import asset';
	dialog.setAttribute( 'aria-label', title.textContent );

	const search = document.createElement( 'input' );
	search.type = 'search';
	search.className = 'Input';
	search.placeholder = 'Search assets…';
	search.setAttribute( 'aria-label', 'Search assets' );
	search.autofocus = true;

	const input = document.createElement( 'input' );
	input.type = 'file';
	input.hidden = true;
	input.multiple = ! textures;
	if ( textures ) input.accept = 'image/*,.hdr,.pic,.exr,.tga,.ktx2';

	const button = ( label, action ) => {

		const element = document.createElement( 'button' );
		element.className = 'Button';
		element.type = 'button';
		element.textContent = label;
		element.addEventListener( 'click', action );
		return element;

	};

	const toolbar = document.createElement( 'div' );
	toolbar.className = 'asset-browser-toolbar';
	const upload = button( 'Upload…', () => input.click() );
	const cancel = button( 'Cancel', () => dialog.close() );
	toolbar.append( search, upload, cancel );

	const list = document.createElement( 'div' );
	list.className = 'asset-browser-list';
	const empty = document.createElement( 'p' );
	const status = document.createElement( 'p' );
	status.setAttribute( 'role', 'status' );
	status.hidden = true;
	let busy = false;

	async function choose( action ) {

		if ( busy ) return;
		busy = true;
		cancel.disabled = upload.disabled = true;
		status.hidden = true;
		try {

			await action();
			if ( dialog.open ) dialog.close();

		} catch ( error ) {

			status.textContent = error.message || String( error );
			status.hidden = false;

		} finally {

			busy = false;
			cancel.disabled = upload.disabled = false;

		}

	}

	const rows = entries.map( entry => {

		const row = button( '', () => choose( () => onPick( entry ) ) );
		row.classList.add( 'asset-browser-item' );
		row.title = entry.detail;
		const thumb = document.createElement( 'span' );
		thumb.className = 'asset-browser-thumb';
		if ( entry.preview ) {

			const img = document.createElement( 'img' );
			img.alt = '';
			img.loading = 'lazy';
			img.src = entry.preview;
			img.addEventListener( 'error', () => img.remove() );
			thumb.append( img );

		}
		const name = document.createElement( 'span' );
		name.textContent = entry.name;
		const detail = document.createElement( 'small' );
		detail.textContent = entry.detail;
		const label = document.createElement( 'span' );
		label.append( name, detail );
		row.append( thumb, label );
		list.append( row );
		return row;

	} );

	function updateSearch() {

		const query = search.value.trim().toLowerCase();
		rows.forEach( ( row, index ) => {

			const { name, detail } = entries[ index ];
			row.hidden = ! ( name + ' ' + detail ).toLowerCase().includes( query );

		} );
		empty.hidden = rows.some( row => ! row.hidden );
		empty.textContent = query ? 'No matching assets.' : 'No assets of this type yet. Use Upload to add files.';

	}

	search.addEventListener( 'input', updateSearch );
	input.addEventListener( 'change', () => {

		const files = Array.from( input.files );
		input.value = '';
		if ( files.length ) choose( () => onUpload( files ) );

	} );
	dialog.addEventListener( 'keydown', event => event.stopPropagation() );
	dialog.addEventListener( 'cancel', event => { if ( busy ) event.preventDefault(); } );
	dialog.addEventListener( 'close', () => {

		for ( const url of urls ) URL.revokeObjectURL( url );
		dialog.remove();

	}, { once: true } );
	dialog.append( title, toolbar, list, empty, status, input );
	updateSearch();
	document.body.append( dialog );
	dialog.showModal();

}

export { openAssetBrowser };
