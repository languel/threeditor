// AMS-inspired asset browsing: folders, facets, metadata, references and local copies.
// Catalog search/URL resolution is shared with the adapted AMS Mediatheque module.
import { AssetPreview } from './assets/AssetPreview.js';
import { SetValueCommand } from './commands/SetValueCommand.js';
import { UISpan } from './libs/ui.js';
import { isImageAsset } from './ProjectAssets.js';
import { AssetLibrary, ASSET_MIME, fileKind, folderPath } from './assets/AssetLibrary.js';
import { AssetController, isInputAsset, isMapAsset, isMovingAsset } from './assets/AssetController.js';
import { loadCatalog, mediathequeBase, search, facet, creditLine, state } from './assets/Mediatheque.js';
import { textureEntries } from './AssetBrowser.js';

// Devices first, then moving media, audio, and still images.
function inputRank( r ) { return r.kind === 'webcam' ? 0 : r.kind === 'microphone' ? 1 : isMovingAsset( r ) ? 2 : r.kind === 'audio' ? 3 : 4; }

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
	const panel = new UISpan(); panel.dom.className = 'assets-panel'; panel.dom.tabIndex = 0;
	const library = new AssetLibrary();
	const controller = new AssetController( editor, library ); editor.assetBrowser = controller;
	const preview = new AssetPreview( editor, library );
	const previewCache = new Map();
	const thumbnailWorker = new AssetPreview( editor, library ), queuedThumbnails = new Set();
	let thumbnailJobs = Promise.resolve();
	function queueThumbnail( record ) {
		if ( queuedThumbnails.has( record.id ) || previewCache.has( record.id ) ) return;
		queuedThumbnails.add( record.id );
		const epoch = controller.epoch;
		thumbnailJobs = thumbnailJobs.then( async () => {
			try { if ( record.projectPath && epoch !== controller.epoch ) return; const url = await thumbnailWorker.thumbnail( record ); if ( ! url || record.projectPath && epoch !== controller.epoch ) return; previewCache.set( record.id, url );
				const card = [ ...grid.children ].find( node => node.dataset.assetId === record.id ); if ( card ) { const thumb = card.querySelector( '.asset-thumb' ); thumb.replaceChildren(); const image = el( 'img' ); image.src = url; image.alt = ''; thumb.append( image ); }
			} catch { /* unsupported/invalid files retain an explicit type icon */ }
		} );
	}
	editor.signals.startPlayer.add( () => preview.clear() );
	for ( const signal of [ editor.signals.editorCleared, editor.signals.projectLoaded ] ) signal.add( () => { for ( const key of previewCache.keys() ) if ( key.startsWith( 'project:' ) ) previewCache.delete( key ); for ( const key of queuedThumbnails ) if ( key.startsWith( 'project:' ) ) queuedThumbnails.delete( key ); } );
	let merged = false, source = 'project', folder = '', tag = '', collection = '', records = [], catalog = [], local = [], selection = new Set(), generation = 0;
	const urls = [];
	const tabs = el( 'div', undefined, 'asset-sources' ); panel.dom.append( tabs );
	const sourceButtons = new Map();
	for ( const [ id, title ] of [ [ 'project', 'Project' ], [ 'mine', 'My assets' ], [ 'catalog', 'Mediatheque' ] ] ) {
		sourceButtons.set( id, button( title, () => { source = id; folder = ''; tag = ''; selection.clear(); refresh(); }, tabs ) );
	}
	for ( const destination of [ 'project', 'mine' ] ) {
		const target = sourceButtons.get( destination );
		target.addEventListener( 'dragover', event => {
			if ( event.dataTransfer.types.includes( ASSET_MIME ) ) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
		} );
		target.addEventListener( 'drop', event => {
			const id = event.dataTransfer.getData( ASSET_MIME );
			if ( ! id ) return;
			event.preventDefault(); event.stopPropagation();
			controller.run( async () => {
				const record = await controller.record( id );
				if ( destination === 'project' ) {
					const entry = await controller.materialize( id );
					if ( ! entry.file && ! entry.path ) throw new Error( 'This asset cannot be copied to the project.' );
				} else if ( source !== 'mine' ) await keep( record, true, '' );
				source = destination; folder = ''; selection.clear(); await refresh();
			} );
		} );
	}
	const picker = el( 'div', undefined, 'asset-picker' ); picker.hidden = true; panel.dom.append( picker );
	const pickerLabel = el( 'span' ); picker.append( pickerLabel );
	controller.cancelPicker = () => { controller.picker = null; picker.hidden = true; draw(); };
	button( 'Cancel', controller.cancelPicker, picker );
	controller.open = options => {
		controller.picker = options; picker.hidden = false;
		pickerLabel.textContent = options.kind === 'texture' ? 'Choose a texture' : options.kind === 'input' ? 'Choose a media input asset' : 'Choose an asset to import';
		if ( options.kind === 'input' ) { kind.value = 'all'; query.value = ''; }
		controller.reveal?.(); refresh(); query.focus();
	};
	const tools = el( 'div', undefined, 'asset-tools' ); panel.dom.append( tools );
	const query = el( 'input' ); query.type = 'search'; query.placeholder = 'Search assets or #tag…'; query.setAttribute( 'aria-label', 'Search assets' ); tools.append( query );
	query.addEventListener( 'input', draw );
	const kind = select( 'Asset type', [ [ 'all', 'All types' ], [ 'inputs', 'Input streams' ], [ 'model', 'Models' ], [ 'texture', 'Images / textures' ], [ 'animation', 'Animations' ], [ 'video', 'Video' ], [ 'audio', 'Audio' ], [ 'webcam', 'Webcams' ], [ 'microphone', 'Microphones' ], [ 'sdf', 'SDF' ], [ 'splat', 'Splats' ], [ 'landmark', 'Landmarks' ], [ 'landmark-texture', 'Landmark textures' ], [ 'file', 'Other files' ] ], tools, draw );
	const actions = el( 'div', undefined, 'asset-actions' ); panel.dom.append( actions );
	const input = el( 'input' ); input.type = 'file'; input.multiple = true; input.hidden = true;
	const directory = el( 'input' ); directory.type = 'file'; directory.multiple = true; directory.webkitdirectory = true; directory.hidden = true;
	panel.dom.append( input, directory );
	button( 'Upload…', () => input.click(), actions ); button( 'Folder…', () => directory.click(), actions );
	button( 'New folder', () => controller.run( async () => { const path = prompt( 'Folder path', folder ? folder + '/' : '' ); if ( path ) { library.addFolder( path ); source = 'mine'; folder = folderPath( path ); await refresh(); } } ), actions );
	async function addDevice( kind ) {

		if ( ! navigator.mediaDevices ) throw new Error( 'Device access requires HTTPS or localhost.' );
		const microphone = kind === 'microphone';
		const title = microphone ? 'Microphone' : 'Webcam';
		const devices = ( await navigator.mediaDevices.enumerateDevices() ).filter( device =>
			device.kind === ( microphone ? 'audioinput' : 'videoinput' ) && device.deviceId );
		const dialog = el( 'dialog', undefined, 'project-save-dialog' );
		dialog.setAttribute( 'aria-label', 'Add ' + title.toLowerCase() );
		dialog.append( el( 'h2', 'Add ' + title.toLowerCase() ) );
		const chosen = await new Promise( resolve => {
			const finish = device => { dialog.close(); dialog.remove(); resolve( device ); };
			button( 'Default ' + title.toLowerCase(), () => finish( { label: title } ), dialog );
			for ( const [ index, device ] of devices.entries() ) button( device.label || title + ' ' + ( index + 1 ), () => finish( device ), dialog );
			button( 'Cancel', () => finish(), dialog );
			dialog.addEventListener( 'cancel', event => { event.preventDefault(); finish(); } );
			document.body.append( dialog );
			dialog.showModal();
		} );
		if ( ! chosen ) return;
		const record = { id: kind + ':' + crypto.randomUUID(), kind, title: chosen.label || title, deviceId: chosen.deviceId, folder: '', tags: [] };
		await library.put( record );
		source = 'mine'; folder = ''; selection.clear(); selection.add( record.id ); await refresh();

	}
	button( 'Add webcam…', () => controller.run( () => addDevice( 'webcam' ) ), actions );
	button( 'Add microphone…', () => controller.run( () => addDevice( 'microphone' ) ), actions );
	button( 'New landmark asset', () => controller.run( async () => {
		const id = crypto.randomUUID();
		await library.put( { id, kind: 'landmark', title: 'Landmark visualization', file: null, path: '', folder, tags: [], rating: 0, created: Date.now() } );
		source = 'mine'; folder = ''; selection.clear(); selection.add( id ); await refresh();
	} ), actions );
	button( 'New landmark texture', () => controller.run( async () => {
		const id = crypto.randomUUID();
		await library.put( { id, kind: 'landmark-texture', title: 'Landmark texture', file: null, path: '', folder, tags: [], rating: 0, created: Date.now() } );
		source = 'mine'; folder = ''; selection.clear(); selection.add( id ); await refresh();
	} ), actions );
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
	const zoomRow = el( 'label', 'Zoom', 'asset-zoom' ); const zoom = el( 'input' ); zoom.type = 'range'; zoom.min = 70; zoom.max = 300; zoom.step = 10; zoom.setAttribute( 'aria-label', 'Thumbnail size' );
	const setZoom = value => { panel.dom.style.setProperty( '--asset-zoom', value + 'px' ); try { localStorage.setItem( 'threeditor/assetZoom', value ); } catch { /* storage unavailable */ } };
	zoom.value = ( () => { try { return localStorage.getItem( 'threeditor/assetZoom' ) || 110; } catch { return 110; } } )(); panel.dom.style.setProperty( '--asset-zoom', zoom.value + 'px' );
	zoom.addEventListener( 'input', () => setZoom( zoom.value ) ); zoomRow.append( zoom ); panel.dom.append( zoomRow );
	const grid = el( 'div', undefined, 'asset-grid' ); grid.setAttribute( 'role', 'list' ); grid.setAttribute( 'aria-label', 'Assets' ); panel.dom.append( grid );
	const detail = el( 'div', undefined, 'asset-detail' ); panel.dom.append( detail );
	const status = el( 'p', 'Drag images onto objects to choose a map, or hold Option/Alt to add a plane. Drop assets on Project or My assets to copy them.', 'asset-status' ); status.setAttribute( 'role', 'status' ); panel.dom.append( status );
	controller.status = ( message, error = false ) => { status.textContent = message; status.classList.toggle( 'error', error ); };
	document.addEventListener( 'keydown', event => { if ( event.key === 'Escape' ) { if ( detail.children.length > 1 ) { detailMinimized = ! detailMinimized; detail.classList.toggle( 'asset-detail-minimized', detailMinimized ); const btn = detail.querySelector( '.asset-detail-header button' ); if ( btn ) btn.classList.toggle( 'collapsed', detailMinimized ); } else if ( controller.picker ) controller.cancelPicker(); } } );
	panel.dom.addEventListener( 'drop', event => {
		event.preventDefault(); event.stopPropagation();
		if ( event.dataTransfer.files.length ) controller.run( async () => { await library.importFiles( event.dataTransfer.files, folder ); source = 'mine'; await refresh(); } );
	} );
	panel.dom.addEventListener( 'dragover', event => event.preventDefault() );
	library.onChange( () => refresh() ); editor.signals.assetsChanged.add( () => { if ( source === 'project' ) refresh(); } );
	editor.signals.projectLoaded.add( refresh ); editor.signals.editorCleared.add( refresh );
	editor.signals.objectSelected.add( () => { if ( controller.picker ) controller.cancelPicker(); } );
	let activeRename;
	let projectLabels = editor.scene.userData.assetLabels;
	function refreshProjectLabels() {

		const labels = editor.scene.userData.assetLabels;
		if ( labels === projectLabels ) return;
		projectLabels = labels;
		if ( source === 'project' ) refresh();

	}
	editor.signals.objectChanged.add( ( object, attribute ) => {
		if ( object === editor.scene && attribute === 'userData' ) refreshProjectLabels();
	} );
	for ( const signal of [ editor.signals.projectLoaded, editor.signals.editorCleared ] ) signal.add( () => {
		activeRename?.( false );
		refreshProjectLabels();
	} );

	function renameInline( label, focusTarget, value, save ) {

		function begin( event ) {

			event.preventDefault();
			event.stopImmediatePropagation();
			activeRename?.( false );
			const field = el( 'input', undefined, 'asset-inline-name' );
			field.type = 'text';
			field.value = value;
			field.setAttribute( 'aria-label', 'Rename ' + value );

			function finish( commit ) {

				if ( activeRename !== finish ) return;
				activeRename = undefined;
				const next = field.value.trim();
				field.replaceWith( label );
				if ( document.activeElement === document.body ) focusTarget.focus();
				if ( commit && next && next !== value ) controller.run( () => save( next ) );

			}

			activeRename = finish;
			field.addEventListener( 'keydown', key => {

				key.stopPropagation();
				if ( key.key !== 'Enter' && key.key !== 'Escape' ) return;
				key.preventDefault();
				finish( key.key === 'Enter' );

			} );
			field.addEventListener( 'click', click => click.stopPropagation() );
			field.addEventListener( 'blur', () => finish( true ) );
			label.replaceWith( field );
			field.focus();
			field.select();

		}

		label.title = 'Shift-click or F2 to rename';
		label.addEventListener( 'click', event => { if ( event.shiftKey ) begin( event ); }, true );
		focusTarget.addEventListener( 'keydown', event => { if ( event.key === 'F2' ) begin( event ); } );

	}

	function setProjectLabel( type, key, label ) {

		const scene = editor.scene;
		const aliases = scene.userData.assetLabels || {};
		const command = new SetValueCommand( editor, scene, 'userData', {
			...scene.userData, assetLabels: { ...aliases, [ type ]: { ...aliases[ type ], [ key ]: label } }
		} );
		command.updatable = false;
		editor.execute( command );

	}

	function folderName( path, mine ) {

		const alias = ! mine && editor.scene.userData.assetLabels?.folders?.[ path ];
		return typeof alias === 'string' ? alias : path.split( '/' ).at( -1 );

	}

	function renameFolderLabel( node, path, mine ) {

		renameInline( node, node, folderName( path, mine ), async label => {

			if ( /[\/\\]/.test( label ) || label === '.' || label === '..' ) throw new Error( 'Enter a folder name without slashes.' );
			const parent = path.split( '/' ).slice( 0, -1 ).join( '/' );
			const prefix = parent ? parent + '/' : '';
			const paths = [ ...( mine ? library.folders() : [] ), ...records.map( record => record.folder ) ];
			const siblings = paths.filter( item => item?.startsWith( prefix ) ).map( item => prefix + item.slice( prefix.length ).split( '/' )[ 0 ] );
			if ( siblings.some( item => item !== path && folderName( item, mine ) === label ) ) throw new Error( 'A folder with that name already exists here.' );
			if ( ! mine ) { setProjectLabel( 'folders', path, label ); return; }
			const next = folderPath( prefix + label );
			await library.renameFolder( path, next );
			if ( folder === path || folder.startsWith( path + '/' ) ) folder = next + folder.slice( path.length );
			await refresh();

		} );

	}

	function renameAssetLabel( node, focusTarget, record ) {

		if ( source === 'mine' ) renameInline( node, focusTarget, record.title, title => library.update( record.id, { title } ) );
		else if ( source === 'project' ) renameInline( node, focusTarget, record.title, title =>
			setProjectLabel( 'files', record.projectPath || record.texture.uuid, title ) );

	}

	function projectRecords() {
		return [ ...editor.sourceFiles || [] ].map( ( [ path, entry ] ) => ( { ...entry.asset, id: 'project:' + path, projectPath: path, title: editor.scene.userData.assetLabels?.files?.[ path ] || entry.file.name, kind: entry.asset?.kind || fileKind( entry.file ), folder: path.split( '/' ).slice( 0, -1 ).join( '/' ), file: entry.file, tags: [] } ) ).concat( textureEntries( editor ).map( ( entry, i ) => ( { ...entry, id: 'scene-texture:' + i, title: editor.scene.userData.assetLabels?.files?.[ entry.texture.uuid ] || entry.name, kind: 'texture', folder: '', tags: [] } ) ) );
	}
	async function refresh() {
		const current = ++ generation;
		try {
			try { local = await library.all(); } catch ( error ) { local = []; controller.status( 'Local asset storage unavailable: ' + error.message, true ); }
			if ( current !== generation ) return;
			const catalogRecords = () => catalog.map( r => ( { ...r, ...local.find( item => item.id === 'mediatheque:' + r.id ), id: 'mediatheque:' + r.id, catalogId: r.id, url: r.kind === 'animation' && r.abs.video ? r.abs.video : r.abs.url, preview: r.abs.thumb, page: r.abs.page, credit: creditLine( r ), kind: r.kind === 'image' ? 'texture' : r.kind } ) );
			merged = controller.picker?.kind === 'input';
			records = merged ? [ ...projectRecords(), ...local.filter( r => ! String( r.id ).startsWith( 'mediatheque:' ) ), ...catalogRecords() ] : source === 'project' ? projectRecords() : source === 'mine' ? local : catalogRecords();

			for ( const record of records ) controller.records.set( record.id, record );
			draw();
		} catch ( error ) { controller.status( 'Local asset storage unavailable: ' + error.message, true ); }
	}
	function draw() {
		if ( ! grid || activeRename ) return;
		for ( const url of urls.splice( 0 ) ) URL.revokeObjectURL( url );
		for ( const [ id, node ] of sourceButtons ) node.setAttribute( 'aria-pressed', String( id === source ) );
		archiveTools.hidden = facets.hidden = source !== 'catalog';
		preview.clear(); crumbs.replaceChildren(); folders.replaceChildren(); grid.replaceChildren(); detail.replaceChildren();
		if ( source !== 'catalog' ) {
			button( source === 'mine' ? 'My assets' : 'Project', () => { folder = ''; draw(); }, crumbs );
			const segments = folder.split( '/' ).filter( Boolean );
			const mine = source === 'mine';
			segments.forEach( ( _, i ) => {
				const path = segments.slice( 0, i + 1 ).join( '/' );
				const node = button( folderName( path, mine ), () => { folder = path; draw(); }, crumbs );
				renameFolderLabel( node, path, mine );
			} );
			const paths = new Set( source === 'mine' ? library.folders() : [] );
			for ( const r of records ) if ( r.folder ) paths.add( r.folder );
			const children = new Set();
			for ( const path of paths ) {
				if ( folder && ! path.startsWith( folder + '/' ) ) continue;
				const child = path.slice( folder ? folder.length + 1 : 0 ).split( '/' )[ 0 ]; if ( child ) children.add( child );
			}
			for ( const child of [ ...children ].sort() ) {
				const path = [ folder, child ].filter( Boolean ).join( '/' );
				const node = button( '› ' + folderName( path, mine ), () => { folder = path; selection.clear(); draw(); }, folders );
				renameFolderLabel( node, path, mine );
				node.addEventListener( 'drop', event => {
					const id = event.dataTransfer.getData( ASSET_MIME );
					if ( source !== 'mine' || ! id ) return;
					event.preventDefault(); event.stopPropagation();
					controller.run( async () => {
						const record = await controller.record( id );
						if ( await library.get( id ) ) await library.update( id, { folder: path } );
						else await keep( record, true, path );
					} );
				} );
			}
		}
		if ( source === 'mine' && folder ) {
			button( 'Remove folder', () => controller.run( async () => { const old = folder; folder = folder.split( '/' ).slice( 0, -1 ).join( '/' ); await library.removeFolder( old ); await refresh(); } ), folders ).title = 'Remove this folder and move its assets to the parent folder';
		}
		const visible = search( records, query.value, { kind: kind.value === 'inputs' ? 'all' : kind.value, tags: tag ? [ tag ] : [], collection: source === 'catalog' ? collection : '' } ).filter( r => {
			if ( kind.value === 'inputs' && ! isInputAsset( r ) ) return false;
			if ( merged || kind.value === 'inputs' && ! folder ) return true;
			if ( source !== 'catalog' && ! query.value && ( r.folder || '' ) !== folder ) return false;
			if ( source !== 'catalog' && query.value && folder && r.folder !== folder && ! r.folder?.startsWith( folder + '/' ) ) return false;
			if ( controller.picker?.kind === 'texture' && r.kind !== 'texture' && ! ( controller.picker.moving && isMovingAsset( r ) ) ) return false;
			if ( controller.picker?.kind === 'input' && ! isInputAsset( r ) ) return false;
			if ( controller.picker?.kind === 'import' && r.kind !== 'model' ) return false;
			return true;
		} ).sort( ( a, b ) => ( merged || kind.value === 'inputs' ? inputRank( a ) - inputRank( b ) : 0 ) || a.title.localeCompare( b.title ) );
		if ( ! visible.length ) grid.append( el( 'p', source === 'catalog' && state.status === 'loading' ? 'Loading catalog…' : 'No matching assets. Upload files, add a URL, or browse Mediatheque.' ) );
		for ( const record of visible ) {
			const card = el( 'div', undefined, 'asset-card' ); card.dataset.assetId = record.id; card.tabIndex = 0; card.draggable = true; card.setAttribute( 'role', 'listitem' ); card.setAttribute( 'aria-label', record.title ); card.classList.toggle( 'selected', selection.has( record.id ) );
			const thumb = el( 'div', undefined, 'asset-thumb' ); let preview = record.preview || record.abs?.poster || previewCache.get( record.id ) || record.texture?.image?.src;
			if ( ! preview && record.file && isImageAsset( record.file ) ) { preview = URL.createObjectURL( record.file ); urls.push( preview ); }
			if ( preview ) { const img = el( 'img' ); img.src = preview; img.alt = ''; img.loading = 'lazy'; img.addEventListener( 'error', () => { if ( record.abs?.poster && img.src !== record.abs.poster ) img.src = record.abs.poster; else { img.remove(); thumb.textContent = record.kind === 'sdf' ? 'ƒ' : record.kind === 'model' ? '◇' : record.kind === 'audio' ? '♫' : '▧'; } } ); thumb.append( img ); } else thumb.textContent = record.kind === 'model' ? '◇' : record.kind === 'sdf' ? 'ƒ' : record.kind === 'texture' ? '▧' : record.kind === 'audio' ? '♫' : '▷';
			const title = el( 'span', record.title, 'asset-title' ); card.title = [ record.title, record.summary, record.credit ].filter( Boolean ).join( '\n' );
			card.append( thumb, title, el( 'small', record.kind + ( record.file ? ' · local' : record.texture ? ' · scene' : ' · link' ) ) );
			if ( ! controller.picker ) renameAssetLabel( title, card, record );
			let pickedFromSlot = false;
			const choose = event => {
				if ( [ 'texture', 'input' ].includes( controller.picker?.kind ) ) {
					pickedFromSlot = true;
					if ( event.detail <= 1 ) use( record );
					return;
				}
				if ( ! event.ctrlKey && ! event.metaKey && ! event.shiftKey ) selection.clear();
				if ( selection.has( record.id ) ) selection.delete( record.id ); else selection.add( record.id );
				for ( const node of grid.children ) node.classList.toggle( 'selected', selection.has( node.dataset.assetId ) );
				showDetail( record );
			};
			card.addEventListener( 'click', choose ); card.addEventListener( 'keydown', event => { if ( event.key === 'Enter' ) use( record ); else if ( event.key === ' ' ) { event.preventDefault(); choose( event ); } } );
			card.addEventListener( 'dblclick', () => { if ( ! pickedFromSlot ) use( record, 'auto' ); } );
			card.addEventListener( 'contextmenu', event => {
				event.preventDefault();
				selection.clear(); selection.add( record.id );
				for ( const node of grid.children ) node.classList.toggle( 'selected', node.dataset.assetId === record.id );
				showDetail( record );
				const actions = [ ...detail.querySelectorAll( '.asset-actions button' ) ].filter( node => ! node.disabled ).map( node => ( { label: node.textContent, run: () => node.click() } ) );
				if ( controller.picker && ! actions.some( action => action.label === 'Choose' ) ) actions.unshift( { label: 'Choose', run: () => use( record ) } );
				if ( ! controller.picker && source !== 'project' && ! [ 'webcam', 'microphone' ].includes( record.kind ) ) actions.push( {
					label: 'Copy to project assets', run: () => controller.run( () => controller.materialize( record.id ) )
				} );
				editor.contextMenu.show( record.title, actions, { x: event.clientX, y: event.clientY } );
			} );
			card.addEventListener( 'dragstart', event => { event.dataTransfer.setData( ASSET_MIME, record.id ); event.dataTransfer.effectAllowed = 'copy'; } );
			grid.append( card );
			if ( ! preview ) queueThumbnail( record );
		}
		const selected = records.find( r => selection.has( r.id ) ); if ( selected ) showDetail( selected );
	}
	function use( record, mode = 'plane' ) {
		controller.run( () => controller.use( record.id, { mode } ) );
	}

	let detailMinimized = false;
	function showDetail( record ) {
		panel.dom.focus();
		preview.clear();
		const heading = el( 'strong', selection.size > 1 ? `${ selection.size } selected` : record.title );
		const minimize = el( 'button', undefined, 'chevron-button' ); minimize.classList.toggle( 'collapsed', detailMinimized ); minimize.type = 'button'; minimize.setAttribute( 'aria-label', 'Minimize preview' );
		minimize.addEventListener( 'click', () => { detailMinimized = ! detailMinimized; detail.classList.toggle( 'asset-detail-minimized', detailMinimized ); minimize.classList.toggle( 'collapsed', detailMinimized ); } );
		const header = el( 'div', undefined, 'asset-detail-header' ); header.append( heading, minimize ); detail.replaceChildren( header );
		if ( selection.size <= 1 && source !== 'catalog' && ! controller.picker ) {
			heading.tabIndex = 0;
			renameAssetLabel( heading, heading, record );
		}
		if ( record.summary ) detail.append( el( 'p', record.summary ) );

		if ( record.credit ) detail.append( el( 'p', record.credit, 'asset-credit' ) );
		if ( record.rights?.license ) detail.append( el( 'p', record.rights.license ) );
		const row = el( 'div', undefined, 'asset-actions' ); detail.insertBefore( row, detail.children[ 1 ] || null );
		const labels = { model: 'Add model', texture: 'Add image plane', image: 'Add image plane', animation: 'Add animated plane', video: 'Add video plane', webcam: 'Add webcam plane', sdf: 'Add code object', audio: 'Add audio object', splat: 'Add point cloud', landmark: 'Add landmark visualization', 'landmark-texture': 'Add landmark texture' };
		if ( ! [ 'texture', 'input' ].includes( controller.picker?.kind ) && ( labels[ record.kind ] || controller.picker ) ) button( controller.picker ? 'Choose' : labels[ record.kind ], () => use( record ), row );
		if ( isMapAsset( record ) && ! controller.picker && editor.selected?.material ) button( 'Apply to selection…', () => controller.run( () => controller.applyToObject( record.id, editor.selected ) ), row );
		if ( ! controller.picker && isInputAsset( record ) ) button( 'Use as input stream', () => controller.run( async () => {
			const entry = await controller.materialize( record.id );
			await editor.assignMediaAsset( entry );
			if ( selection.has( record.id ) ) showDetail( record );
		} ), row );
		const previewHost = el( 'div', undefined, 'asset-preview-stage' ); previewHost.setAttribute( 'aria-label', record.title + ' preview' ); detail.insertBefore( previewHost, row );
		const sourcePath = controller.paths.get( record.id ) || record.projectPath;
		if ( record.kind === 'webcam' ) {
			const canvas = el( 'canvas' ); previewHost.append( canvas );
			const note = el( 'span', 'Use as input stream to see the live preview.' ); previewHost.append( note );
			const draw = () => {
				if ( ! canvas.isConnected ) return;
				const frame = editor.getMediaFrame?.( record.id ), w = frame?.videoWidth || frame?.width, h = frame?.videoHeight || frame?.height;
				note.hidden = !! w; canvas.hidden = ! w;
				if ( w && h && ( frame.readyState === undefined || frame.readyState >= 2 ) ) { if ( canvas.width !== 320 || canvas.height !== Math.round( 320 * h / w ) ) { canvas.width = 320; canvas.height = Math.round( 320 * h / w ); } canvas.getContext( '2d' )?.drawImage( frame, 0, 0, canvas.width, canvas.height ); }
				requestAnimationFrame( draw );
			};
			draw();
			// Input settings: shared with Streams → Audio and video → Input settings (same saved values).
			let saved = {}; try { saved = JSON.parse( localStorage.getItem( 'threeditor/inputSettings/' + record.id ) || '{}' ); } catch { /* ignore */ }
			const current = { flipX: false, flipY: false, rotate: 0, left: 0, top: 0, right: 0, bottom: 0, ...saved };
			const box = el( 'details', undefined, 'asset-input-settings' ); box.open = true; box.append( el( 'summary', 'Input settings' ) );
			const push = patch => { Object.assign( current, patch ); editor.setMediaInputSettings?.( record.id, { ...current } ); };
			const row = ( label, control ) => { const l = el( 'label', label ); l.append( control ); box.append( l ); return control; };
			const check = ( label, key ) => { const c = el( 'input' ); c.type = 'checkbox'; c.checked = current[ key ]; c.addEventListener( 'change', () => push( { [ key ]: c.checked } ) ); return row( label, c ); };
			check( 'Flip horizontal', 'flipX' ); check( 'Flip vertical', 'flipY' );
			const rot = el( 'select' ); for ( const d of [ 0, 90, 180, 270 ] ) rot.add( new Option( d + '°', d ) ); rot.value = current.rotate; rot.addEventListener( 'change', () => push( { rotate: Number( rot.value ) } ) ); row( 'Rotate', rot );
			for ( const edge of [ 'left', 'top', 'right', 'bottom' ] ) { const r = el( 'input' ); r.type = 'range'; r.min = 0; r.max = 90; r.value = Math.round( current[ edge ] * 100 ); r.addEventListener( 'input', () => push( { [ edge ]: r.value / 100 } ) ); row( 'Crop ' + edge, r ); }
			detail.append( box );
		} else preview.show( { ...record, file: editor.sourceFiles.get( sourcePath )?.file || record.file, projectPath: sourcePath }, previewHost );
		let owner = editor.selected;
		while ( owner && ! editor.scripts[ owner.uuid ]?.some( script => script.assetBehavior ) ) owner = owner.parent;
		const behavior = owner && editor.scripts[ owner.uuid ]?.find( script => script.assetBehavior );
		if ( behavior ) button( 'Edit attached behavior', () => editor.signals.editScript.dispatch( owner, behavior ), row );

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
			button( 'Keep link', () => controller.run( () => keep( record, false ) ), row ).disabled = ! record.url;
			button( 'Save local copy', () => controller.run( () => keep( record, true ) ), row );
		}
		if ( source === 'mine' ) {
			if ( selection.size > 1 ) button( 'Move selected…', () => controller.run( async () => { const path = prompt( 'Move selected assets to folder', folder ); if ( path === null ) return; const next = folderPath( path ); for ( const id of selection ) await library.update( id, { folder: next } ); selection.clear(); await refresh(); } ), row );
			for ( const [ label, value, apply ] of [
				[ 'Folder', record.folder || '', value => ( { folder: folderPath( value ) } ) ],
				[ 'Tags', ( record.tags || [] ).join( ', ' ), value => ( { tags: value.split( ',' ).map( x => x.trim() ).filter( Boolean ) } ) ]
			] ) {
				const line = el( 'label', label ); const field = el( 'input' ); field.value = value; field.setAttribute( 'aria-label', 'Asset ' + label.toLowerCase() );
				field.addEventListener( 'change', () => controller.run( () => library.update( record.id, apply( field.value ) ) ) ); line.append( field ); detail.append( line );
			}
			const rating = select( 'Asset rating', [ 0, 1, 2, 3, 4, 5 ].map( n => [ n, n ? '★'.repeat( n ) : 'Unrated' ] ), detail, () => controller.run( () => library.update( record.id, { rating: Number( rating.value ) } ) ) ); rating.value = record.rating || 0;
			if ( ! record.file && ! [ 'webcam', 'microphone' ].includes( record.kind ) ) button( 'Download local copy', () => controller.run( () => keep( record, true ) ), row );
			button( 'Delete selected', () => controller.run( async () => {
				if ( ! confirm( `Delete ${ selection.size || 1 } asset(s) from My assets? Copies already used in projects are retained.` ) ) return;
				for ( const id of selection.size ? selection : [ record.id ] ) await library.remove( id ); selection.clear(); await refresh();
			} ), row );
		}
		if ( record.url ) { const address = el( 'input' ); address.readOnly = true; address.value = record.url; address.setAttribute( 'aria-label', 'Asset URL' ); detail.append( address ); }
	}
	async function keep( record, copy, destinationFolder ) {
		const id = record.catalogId ? 'mediatheque:' + record.catalogId : record.id.startsWith( 'project:' ) ? crypto.randomUUID() : record.id;
		const existing = await library.get( id );
		if ( ! copy && existing?.file ) { controller.status( 'A local copy is already saved.' ); return; }
		const saved = { ...record, id, projectPath: undefined, folder: destinationFolder ?? ( existing?.folder || ( record.catalogId ? 'Mediatheque/' + ( record.collections?.[ 0 ] || record.kind ) : folder ) ), created: existing?.created || Date.now() };
		if ( copy ) {
			if ( ! record.file && ! record.url && ! record.projectPath ) throw new Error( 'This asset has no file to save locally.' );
			const { file, fileMap, key } = await controller.filesFor( record ); saved.file = file;
			// Save the model and companions as a batch, so reusing it works offline.
			const batch = crypto.randomUUID(); saved.batch = batch;
			saved.path = key;
			for ( const [ path, companion ] of Object.entries( fileMap ) ) {
				if ( path === key ) continue;
				await library.put( { id: crypto.randomUUID(), title: companion.name, file: companion, path, batch, kind: fileKind( companion ), folder: saved.folder, tags: [] } );
			}
		}
		await library.put( saved ); controller.records.set( id, saved ); await refresh();
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
