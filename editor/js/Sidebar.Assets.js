// AMS-inspired asset browsing: folders, facets, metadata, references and local copies.
// Catalog search/URL resolution is shared with the adapted AMS Mediatheque module.
import { UISpan } from './libs/ui.js';
import { isImageAsset } from './ProjectAssets.js';
import { AssetLibrary, ASSET_MIME, fileKind, folderPath } from './assets/AssetLibrary.js';
import { AssetController } from './assets/AssetController.js';
import { loadCatalog, mediathequeBase, search, facet, creditLine, state } from './assets/Mediatheque.js';
import { textureEntries } from './AssetBrowser.js';

function el( tag, text, className ) {
	const node = document.createElement( tag );
	if ( text !== undefined ) node.textContent = text;
	if ( className ) node.className = className;
	return node;
}
function button( label, action, parent ) {
	const node = el( 'button', label ); node.type = 'button'; node.addEventListener( 'click', action ); parent?.append( node ); return node;
}
function select( label, values, parent, change ) {
	const node = el( 'select' ); node.setAttribute( 'aria-label', label );
	for ( const [ value, title ] of values ) { const option = el( 'option', title ); option.value = value; node.append( option ); }
	node.addEventListener( 'change', change ); parent.append( node ); return node;
}
export function SidebarAssets( editor ) {
	const panel = new UISpan(); panel.dom.className = 'assets-panel';
	const library = new AssetLibrary();
	const controller = new AssetController( editor, library ); editor.assetBrowser = controller;
	let source = 'project', folder = '', tag = '', collection = '', records = [], catalog = [], local = [], selection = new Set(), generation = 0;
	const urls = [];
	const tabs = el( 'div', undefined, 'asset-sources' ); panel.dom.append( tabs );
	const sourceButtons = new Map();
	for ( const [ id, title ] of [ [ 'project', 'Project' ], [ 'mine', 'My assets' ], [ 'catalog', 'Mediatheque' ] ] ) {
		sourceButtons.set( id, button( title, () => { source = id; folder = ''; tag = ''; selection.clear(); refresh(); }, tabs ) );
	}
	const picker = el( 'div', undefined, 'asset-picker' ); picker.hidden = true; panel.dom.append( picker );
	const pickerLabel = el( 'span' ); picker.append( pickerLabel );
	controller.cancelPicker = () => { controller.picker = null; picker.hidden = true; draw(); };
	button( 'Cancel', controller.cancelPicker, picker );
	controller.open = options => {
		controller.picker = options; picker.hidden = false;
		pickerLabel.textContent = options.kind === 'texture' ? 'Choose a texture' : 'Choose an asset to import';
		controller.reveal?.(); refresh(); query.focus();
	};
	const tools = el( 'div', undefined, 'asset-tools' ); panel.dom.append( tools );
	const query = el( 'input' ); query.type = 'search'; query.placeholder = 'Search assets or #tag…'; query.setAttribute( 'aria-label', 'Search assets' ); tools.append( query );
	query.addEventListener( 'input', draw );
	const kind = select( 'Asset type', [ [ 'all', 'All types' ], [ 'model', 'Models' ], [ 'texture', 'Images / textures' ], [ 'animation', 'Animations' ], [ 'video', 'Video' ], [ 'audio', 'Audio' ], [ 'sdf', 'SDF' ], [ 'splat', 'Splats' ], [ 'file', 'Other files' ] ], tools, draw );
	const actions = el( 'div', undefined, 'asset-actions' ); panel.dom.append( actions );
	const input = el( 'input' ); input.type = 'file'; input.multiple = true; input.hidden = true;
	const directory = el( 'input' ); directory.type = 'file'; directory.multiple = true; directory.webkitdirectory = true; directory.hidden = true;
	panel.dom.append( input, directory );
	button( 'Upload…', () => input.click(), actions ); button( 'Folder…', () => directory.click(), actions );
	button( 'New folder', () => controller.run( async () => { const path = prompt( 'Folder path', folder ? folder + '/' : '' ); if ( path ) { library.addFolder( path ); source = 'mine'; folder = folderPath( path ); await refresh(); } } ), actions );
	button( 'Link URL…', () => controller.run( async () => {
		const address = prompt( 'Asset URL (CORS-enabled HTTP or HTTPS)' ); if ( ! address ) return;
		const url = new URL( address ); if ( ! [ 'http:', 'https:' ].includes( url.protocol ) ) throw new Error( 'Use an HTTP(S) asset URL.' );
		const name = decodeURIComponent( url.pathname.split( '/' ).pop() ) || 'Asset';
		await library.put( { id: crypto.randomUUID(), title: name, url: url.href, kind: fileKind( { name, type: '' } ), folder, tags: [], rating: 0, created: Date.now() } );
		source = 'mine'; await refresh();
	} ), actions );
	for ( const node of [ input, directory ] ) node.addEventListener( 'change', () => controller.run( async () => {
		if ( ! node.files.length ) return;
		await library.importFiles( node.files, source === 'mine' ? folder : '' ); node.value = ''; source = 'mine'; await refresh();
	} ) );
	const archiveTools = el( 'details', undefined, 'asset-catalog-settings' ); archiveTools.append( el( 'summary', 'Catalog connection' ) );
	const base = el( 'input' ); base.type = 'url'; base.value = mediathequeBase(); base.setAttribute( 'aria-label', 'Mediatheque catalog base URL' ); archiveTools.append( base );
	button( 'Connect / refresh', () => controller.run( async () => {
		const url = new URL( base.value ); if ( ! [ 'https:', 'http:' ].includes( url.protocol ) ) throw new Error( 'Use an HTTP(S) catalog URL.' );
		localStorage.setItem( 'threeditor_mediatheque_base', url.href.replace( /\/?$/, '/' ) );
		catalog = await loadCatalog( { force: true } ); updateFacets(); source = 'catalog'; await refresh();
		if ( state.error ) throw new Error( state.error );
	} ), archiveTools ); panel.dom.append( archiveTools );
	const facets = el( 'details', undefined, 'asset-facets' ); facets.append( el( 'summary', 'Tags and collections' ) ); panel.dom.append( facets );
	const collections = select( 'Catalog collection', [ [ '', 'All collections' ] ], facets, () => { collection = collections.value; draw(); } );
	const tags = el( 'div', undefined, 'asset-tags' ); facets.append( tags );
	const crumbs = el( 'nav', undefined, 'asset-crumbs' ); crumbs.setAttribute( 'aria-label', 'Asset folders' ); panel.dom.append( crumbs );
	const folders = el( 'div', undefined, 'asset-folders' ); panel.dom.append( folders );
	const grid = el( 'div', undefined, 'asset-grid' ); grid.setAttribute( 'role', 'list' ); grid.setAttribute( 'aria-label', 'Assets' ); panel.dom.append( grid );
	const detail = el( 'div', undefined, 'asset-detail' ); panel.dom.append( detail );
	const status = el( 'p', 'Drag models into the viewport; drag textures onto meshes or texture slots.', 'asset-status' ); status.setAttribute( 'role', 'status' ); panel.dom.append( status );
	controller.status = ( message, error = false ) => { status.textContent = message; status.classList.toggle( 'error', error ); };
	panel.dom.addEventListener( 'keydown', event => { event.stopPropagation(); if ( event.key === 'Escape' ) controller.cancelPicker(); } );
	panel.dom.addEventListener( 'drop', event => {
		event.preventDefault(); event.stopPropagation();
		if ( event.dataTransfer.files.length ) controller.run( async () => { await library.importFiles( event.dataTransfer.files, folder ); source = 'mine'; await refresh(); } );
	} );
	panel.dom.addEventListener( 'dragover', event => event.preventDefault() );
	library.onChange( () => refresh() ); editor.signals.assetsChanged.add( () => { if ( source === 'project' ) refresh(); } );
	editor.signals.projectLoaded.add( refresh ); editor.signals.editorCleared.add( refresh );
	editor.signals.objectSelected.add( () => { if ( controller.picker ) controller.cancelPicker(); } );
	function projectRecords() {
		return [ ...editor.sourceFiles || [] ].map( ( [ path, entry ] ) => ( { ...entry.asset, id: 'project:' + path, projectPath: path, title: entry.file.name, kind: fileKind( entry.file ), folder: path.split( '/' ).slice( 0, -1 ).join( '/' ), file: entry.file, tags: [] } ) ).concat( textureEntries( editor ).map( ( entry, i ) => ( { ...entry, id: 'scene-texture:' + i, title: entry.name, kind: 'texture', folder: '', tags: [] } ) ) );
	}
	async function refresh() {
		const current = ++ generation;
		try {
			try { local = await library.all(); } catch ( error ) { local = []; controller.status( 'Local asset storage unavailable: ' + error.message, true ); }
			if ( current !== generation ) return;
			records = source === 'project' ? projectRecords() : source === 'mine' ? local : catalog.map( r => ( { ...r, ...local.find( item => item.id === 'mediatheque:' + r.id ), id: 'mediatheque:' + r.id, catalogId: r.id, url: r.abs.url, preview: r.abs.thumb, page: r.abs.page, credit: creditLine( r ), kind: r.kind === 'image' ? 'texture' : r.kind } ) );
			for ( const record of records ) controller.records.set( record.id, record );
			draw();
		} catch ( error ) { controller.status( 'Local asset storage unavailable: ' + error.message, true ); }
	}
	function draw() {
		if ( ! grid ) return;
		for ( const url of urls.splice( 0 ) ) URL.revokeObjectURL( url );
		for ( const [ id, node ] of sourceButtons ) node.setAttribute( 'aria-pressed', String( id === source ) );
		archiveTools.hidden = facets.hidden = source !== 'catalog';
		crumbs.replaceChildren(); folders.replaceChildren(); grid.replaceChildren(); detail.replaceChildren();
		if ( source !== 'catalog' ) {
			button( source === 'mine' ? 'My assets' : 'Project', () => { folder = ''; draw(); }, crumbs );
			const segments = folder.split( '/' ).filter( Boolean );
			segments.forEach( ( part, i ) => button( part, () => { folder = segments.slice( 0, i + 1 ).join( '/' ); draw(); }, crumbs ) );
			const paths = new Set( source === 'mine' ? library.folders() : [] );
			for ( const r of records ) if ( r.folder ) paths.add( r.folder );
			const children = new Set();
			for ( const path of paths ) {
				if ( folder && ! path.startsWith( folder + '/' ) ) continue;
				const child = path.slice( folder ? folder.length + 1 : 0 ).split( '/' )[ 0 ]; if ( child ) children.add( child );
			}
			for ( const child of [ ...children ].sort() ) {
				const path = [ folder, child ].filter( Boolean ).join( '/' );
				const node = button( '▸ ' + child, () => { folder = path; selection.clear(); draw(); }, folders );
				node.addEventListener( 'drop', event => { const id = event.dataTransfer.getData( ASSET_MIME ); if ( source === 'mine' && id ) { event.preventDefault(); event.stopPropagation(); controller.run( () => library.update( id, { folder: path } ) ); } } );
			}
		}
		if ( source === 'mine' && folder ) {
			button( 'Rename folder', () => controller.run( async () => { const next = prompt( 'Folder path', folder ); if ( next ) { await library.renameFolder( folder, next ); folder = folderPath( next ); await refresh(); } } ), folders );
			button( 'Remove folder', () => controller.run( async () => { const old = folder; folder = folder.split( '/' ).slice( 0, -1 ).join( '/' ); await library.removeFolder( old ); await refresh(); } ), folders ).title = 'Remove this folder and move its assets to the parent folder';
		}
		const visible = search( records, query.value, { kind: kind.value, tags: tag ? [ tag ] : [], collection: source === 'catalog' ? collection : '' } ).filter( r => {
			if ( source !== 'catalog' && ! query.value && ( r.folder || '' ) !== folder ) return false;
			if ( source !== 'catalog' && query.value && folder && r.folder !== folder && ! r.folder?.startsWith( folder + '/' ) ) return false;
			if ( controller.picker?.kind === 'texture' && r.kind !== 'texture' ) return false;
			if ( controller.picker?.kind === 'import' && r.kind !== 'model' ) return false;
			return true;
		} ).sort( ( a, b ) => a.title.localeCompare( b.title ) );
		if ( ! visible.length ) grid.append( el( 'p', source === 'catalog' && state.status === 'loading' ? 'Loading catalog…' : 'No matching assets. Upload files, add a URL, or browse Mediatheque.' ) );
		for ( const record of visible ) {
			const card = el( 'div', undefined, 'asset-card' ); card.dataset.assetId = record.id; card.tabIndex = 0; card.draggable = true; card.setAttribute( 'role', 'listitem' ); card.setAttribute( 'aria-label', record.title ); card.classList.toggle( 'selected', selection.has( record.id ) );
			const thumb = el( 'div', undefined, 'asset-thumb' ); let preview = record.preview;
			if ( ! preview && record.file && isImageAsset( record.file ) ) { preview = URL.createObjectURL( record.file ); urls.push( preview ); }
			if ( preview ) { const img = el( 'img' ); img.src = preview; img.alt = ''; img.loading = 'lazy'; img.addEventListener( 'error', () => img.remove() ); thumb.append( img ); } else thumb.textContent = record.kind === 'model' ? '◇' : record.kind === 'texture' ? '▧' : '▷';
			const title = el( 'span', record.title, 'asset-title' ); card.title = [ record.title, record.summary, record.credit ].filter( Boolean ).join( '\n' );
			card.append( thumb, title, el( 'small', record.kind + ( record.file ? ' · local' : record.texture ? ' · scene' : ' · link' ) ) );
			const choose = event => { if ( ! event.ctrlKey && ! event.metaKey && ! event.shiftKey ) selection.clear(); if ( selection.has( record.id ) ) selection.delete( record.id ); else selection.add( record.id ); for ( const node of grid.children ) node.classList.toggle( 'selected', selection.has( node.dataset.assetId ) ); showDetail( record ); };
			card.addEventListener( 'click', choose ); card.addEventListener( 'keydown', event => { if ( event.key === 'Enter' ) use( record ); else if ( event.key === ' ' ) { event.preventDefault(); choose( event ); } } );
			card.addEventListener( 'dblclick', () => use( record ) );
			card.addEventListener( 'dragstart', event => { event.dataTransfer.setData( ASSET_MIME, record.id ); event.dataTransfer.effectAllowed = 'copy'; } );
			grid.append( card );
		}
		const selected = records.find( r => selection.has( r.id ) ); if ( selected ) showDetail( selected );
	}
	function use( record ) {
		controller.run( () => controller.use( record.id, { map: map.value, materialSlot: Number( slot.value ) } ) );
	}

	const mapTools = el( 'div', undefined, 'asset-map-tools' );
	const map = select( 'Texture target slot', [ 'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'envMap', 'clearcoatMap', 'transmissionMap', 'sheenColorMap', 'specularColorMap' ].map( name => [ name, name ] ), mapTools, () => {} );
	const slot = el( 'input' ); slot.type = 'number'; slot.min = 0; slot.value = 0; slot.setAttribute( 'aria-label', 'Material index' ); slot.title = 'Material index (for multi-material meshes)'; mapTools.append( slot );
	function showDetail( record ) {
		detail.replaceChildren( el( 'strong', selection.size > 1 ? `${ selection.size } selected` : record.title ) );
		if ( record.summary ) detail.append( el( 'p', record.summary ) );
		if ( record.preview ) { const preview = el( 'img' ); preview.src = record.preview; preview.alt = record.title; preview.className = 'asset-detail-preview'; detail.append( preview ); }
		if ( record.credit ) detail.append( el( 'p', record.credit, 'asset-credit' ) );
		if ( record.rights?.license ) detail.append( el( 'p', record.rights.license ) );
		if ( [ 'texture', 'animation' ].includes( record.kind ) && ! controller.picker ) detail.append( mapTools );
		const row = el( 'div', undefined, 'asset-actions' ); detail.insertBefore( row, detail.children[ 1 ] || null );
		if ( [ 'model', 'texture', 'animation' ].includes( record.kind ) ) button( controller.picker ? 'Choose' : record.kind === 'texture' || record.kind === 'animation' ? 'Apply to selected mesh' : 'Add to scene', () => use( record ), row );
		else detail.append( el( 'p', 'Available as a link or download. This format has no scene importer.' ) );
		if ( record.url ) {
			button( 'Copy URL', () => controller.run( () => navigator.clipboard.writeText( record.url ) ), row );
			const link = el( 'a', 'Open asset ↗' ); link.href = record.url; link.target = '_blank'; link.rel = 'noopener'; row.append( link );
		}
		for ( const [ key, title ] of [ [ 'original', 'Original file ↗' ], [ 'bvh', 'BVH motion ↗' ], [ 'proxy', 'Preview video ↗' ] ] ) {
			if ( ! record.abs?.[ key ] || record.abs[ key ] === record.url ) continue;
			const link = el( 'a', title ); link.href = record.abs[ key ]; link.target = '_blank'; link.rel = 'noopener'; row.append( link );
		}
		if ( record.page ) { const page = el( 'a', 'Catalog details ↗' ); page.href = record.page; page.target = '_blank'; page.rel = 'noopener'; detail.append( page ); }
		if ( source !== 'mine' && ! record.texture ) {
			button( 'Keep link', () => keep( record, false ), row ).disabled = ! record.url;
			button( 'Save local copy', () => keep( record, true ), row );
		}
		if ( source === 'mine' ) {
			if ( selection.size > 1 ) button( 'Move selected…', () => controller.run( async () => { const path = prompt( 'Move selected assets to folder', folder ); if ( path === null ) return; const next = folderPath( path ); for ( const id of selection ) await library.update( id, { folder: next } ); selection.clear(); await refresh(); } ), row );
			for ( const [ label, value, apply ] of [
				[ 'Title', record.title, title => ( { title } ) ],
				[ 'Folder', record.folder || '', value => ( { folder: folderPath( value ) } ) ],
				[ 'Tags', ( record.tags || [] ).join( ', ' ), value => ( { tags: value.split( ',' ).map( x => x.trim() ).filter( Boolean ) } ) ]
			] ) {
				const line = el( 'label', label ); const field = el( 'input' ); field.value = value; field.setAttribute( 'aria-label', 'Asset ' + label.toLowerCase() );
				field.addEventListener( 'change', () => controller.run( () => library.update( record.id, apply( field.value ) ) ) ); line.append( field ); detail.append( line );
			}
			const rating = select( 'Asset rating', [ 0, 1, 2, 3, 4, 5 ].map( n => [ n, n ? '★'.repeat( n ) : 'Unrated' ] ), detail, () => controller.run( () => library.update( record.id, { rating: Number( rating.value ) } ) ) ); rating.value = record.rating || 0;
			if ( ! record.file ) button( 'Download local copy', () => keep( record, true ), row );
			button( 'Delete selected', () => controller.run( async () => {
				if ( ! confirm( `Delete ${ selection.size || 1 } asset(s) from My assets? Copies already used in projects are retained.` ) ) return;
				for ( const id of selection.size ? selection : [ record.id ] ) await library.remove( id ); selection.clear(); await refresh();
			} ), row );
		}
		if ( record.url ) { const address = el( 'input' ); address.readOnly = true; address.value = record.url; address.setAttribute( 'aria-label', 'Asset URL' ); detail.append( address ); }
	}
	async function keep( record, copy ) {
		return controller.run( async () => {
			const id = record.catalogId ? 'mediatheque:' + record.catalogId : record.id.startsWith( 'project:' ) ? crypto.randomUUID() : record.id;
			const existing = await library.get( id );
			if ( ! copy && existing?.file ) { controller.status( 'A local copy is already saved.' ); return; }
			const saved = { ...record, id, projectPath: undefined, folder: existing?.folder || ( record.catalogId ? 'Mediatheque/' + ( record.collections?.[ 0 ] || record.kind ) : folder ), created: existing?.created || Date.now() };
			if ( copy ) {
				const entry = await controller.materialize( record.id ); saved.file = entry.file;
				// Save the model and companions as a batch, so reusing it works offline.
				const batch = crypto.randomUUID(); saved.batch = batch;
				const sourceEntry = editor.sourceFiles.get( entry.path );
				saved.path = entry.path;
				for ( const path of sourceEntry.batch || [] ) {
					if ( path === entry.path ) continue;
					const file = editor.sourceFiles.get( path ).file;
					await library.put( { id: crypto.randomUUID(), title: file.name, file, path, batch, kind: fileKind( file ), folder: saved.folder, tags: [] } );
				}
			}
			await library.put( saved ); controller.records.set( id, saved ); await refresh();
		} );
	}
	function updateFacets() {
		collections.replaceChildren( new Option( 'All collections', '' ), ...facet( catalog, 'collections', 100 ).map( ( [ value, count ] ) => new Option( `${ value } (${ count })`, value ) ) );
		collection = ''; tag = '';
		tags.replaceChildren();
		for ( const [ value ] of facet( catalog, 'tags', 12 ) ) button( '#' + value, () => { tag = tag === value ? '' : value; for ( const b of tags.children ) b.setAttribute( 'aria-pressed', String( b.textContent === '#' + tag ) ); draw(); }, tags );
	}
	// Fetching a public catalog does not download its media; copies are opt-in.
	loadCatalog().then( result => {
		catalog = result; updateFacets();
		if ( state.error ) controller.status( 'Catalog unavailable. Check Catalog connection to retry. ' + state.error, true );
		refresh();
	} );
	refresh();
	return panel;
}
