import { exampleCatalog } from './ExampleCatalog.js';
import { ProjectLibrary, projectPath, projectRecord, projectTree } from './ProjectLibrary.js';

function createExampleLibrary( editor ) {

	const library = new ProjectLibrary();
	const container = document.createElement( 'div' );
	container.className = 'example-library';
	const search = document.createElement( 'input' );
	search.type = 'search';
	search.placeholder = 'Search examples…';
	search.setAttribute( 'aria-label', 'Search examples' );
	const tree = document.createElement( 'div' );
	const status = document.createElement( 'p' );
	status.className = 'example-library-status';
	status.setAttribute( 'role', 'status' );
	container.append( search, tree, status );
	const openFolders = new Set();
	let userEntries = [];
	let storageError = '';
	let busy = false;

	function confirmOpen( title ) {

		return new Promise( resolve => {

			const dialog = document.createElement( 'dialog' );
			dialog.className = 'project-save-dialog';
			dialog.setAttribute( 'aria-label', 'Open project' );
			const heading = document.createElement( 'h2' );
			heading.textContent = 'Open ' + title + '?';
			const message = document.createElement( 'p' );
			message.textContent = editor.strings.getKey( 'prompt/file/open' );
			const actions = document.createElement( 'div' );
			actions.className = 'project-save-actions';
			for ( const [ label, value ] of [ [ 'Cancel', '' ], [ 'Open', 'open' ] ] ) {

				const button = document.createElement( 'button' );
				button.textContent = label;
				button.addEventListener( 'click', () => dialog.close( value ) );
				actions.append( button );

			}
			dialog.addEventListener( 'keydown', event => event.stopPropagation() );
			dialog.addEventListener( 'close', () => { resolve( dialog.returnValue === 'open' ); dialog.remove(); }, { once: true } );
			dialog.append( heading, message, actions );
			document.body.append( dialog );
			dialog.showModal();

		} );

	}

	async function open( entry ) {

		if ( busy ) return;
		busy = true;
		if ( ! await confirmOpen( entry.title ) ) { busy = false; return; }
		status.textContent = 'Opening ' + entry.title + '…';
		try {

			let record;
			if ( entry.path ) {

				record = await library.get( entry.path );
				if ( ! record ) throw new Error( 'This saved project is no longer available.' );

			} else {

				const response = await fetch( entry.file );
				if ( ! response.ok ) throw new Error( 'Could not load ' + entry.title );
				const project = await response.json();
				project.project ||= {};
				project.project.title ||= entry.title.replace( /^\d+\s*·\s*/, '' );
				const sourceFiles = await Promise.all( ( entry.assets || [] ).map( async asset => {

					const response = await fetch( asset.file );
					if ( ! response.ok ) throw new Error( 'Could not load ' + asset.path );
					const blob = await response.blob();
					const file = new File( [ blob ], asset.path.split( '/' ).at( - 1 ), { type: blob.type || 'application/octet-stream' } );
					return [ asset.path, { file, batch: ( entry.assets || [] ).map( asset => asset.path ) } ];

				} ) );
				record = { project, sourceFiles, shading: 'preview' };

			}
			if ( ! record.project?.scene || ! record.project?.camera ) throw new Error( 'This file is not an editor project.' );
			editor.signals.stopPlayer.dispatch();
			editor.clear();
			editor.sourceFiles = new Map( record.sourceFiles || [] );
			await editor.fromJSON( record.project );
			editor.userProjectPath = entry.path || '';
			if ( record.shading ) editor.setViewportShading( record.shading );
			editor.signals.assetsChanged.dispatch();
			status.textContent = 'Opened ' + entry.title;

		} catch ( error ) {

			status.textContent = error.message;
			console.error( error );

		} finally {

			busy = false;

		}

	}

	function render() {

		tree.replaceChildren();
		const query = search.value.trim().toLocaleLowerCase();
		let matches = 0;
		function add( entries, parent, prefix = '' ) {

			for ( const entry of entries ) {

				const path = prefix ? prefix + '/' + entry.title : entry.title;
				if ( entry.children ) {

					const folder = document.createElement( 'details' );
					folder.className = 'example-folder';
					const summary = document.createElement( 'summary' );
					summary.textContent = entry.title;
					summary.setAttribute( 'aria-label', path + ' examples' );
					const children = document.createElement( 'div' );
					folder.append( summary, children );
					add( entry.children, children, path );
					if ( query && ! children.childElementCount ) continue;
					folder.open = !! query || openFolders.has( path );
					folder.addEventListener( 'toggle', () => {

						if ( search.value.trim() ) return;
						if ( folder.open ) openFolders.add( path );
						else openFolders.delete( path );

					} );
					parent.append( folder );
					if ( ! entry.children.length ) {

						const empty = document.createElement( 'p' );
						empty.className = 'example-library-status';
						empty.textContent = 'File → Save adds projects here.';
						children.append( empty );

					}

				} else {

					if ( query && ! query.split( /\s+/ ).every( word => path.toLocaleLowerCase().includes( word ) ) ) continue;
					const button = document.createElement( 'button' );
					button.type = 'button';
					button.textContent = entry.title;
					button.title = path;
					button.addEventListener( 'click', () => open( entry ) );
					parent.append( button );
					matches ++;

				}

			}

		}
		add( [ ...exampleCatalog, { title: 'User', children: projectTree( userEntries ) } ], tree );
		status.textContent = storageError || ( query && matches === 0 ? 'No matching examples.' : '' );

	}

	async function refresh() {

		try { userEntries = await library.list(); storageError = ''; }
		catch ( error ) { storageError = error.message; }
		render();

	}
	search.addEventListener( 'input', render );
	search.addEventListener( 'keydown', event => event.stopPropagation() );
	render();
	refresh();

	function save() {

		if ( document.querySelector( '.project-save-dialog' ) ) return;
		const dialog = document.createElement( 'dialog' );
		dialog.className = 'project-save-dialog';
		dialog.setAttribute( 'aria-label', 'Save project' );
		const form = document.createElement( 'form' );
		const heading = document.createElement( 'h2' );
		heading.textContent = 'Save project';
		const label = document.createElement( 'label' );
		label.textContent = 'Project name';
		const input = document.createElement( 'input' );
		input.required = true;
		input.autofocus = true;
		input.value = editor.userProjectPath || editor.config.getKey( 'project/title' ) || 'Untitled';
		label.append( input );
		const note = document.createElement( 'p' );
		note.textContent = 'Downloads JSON and saves a copy in Examples → User. Use a name such as Studies/Fox for subfolders. Saving the same name updates that copy.';
		const result = document.createElement( 'p' );
		result.setAttribute( 'role', 'status' );
		const actions = document.createElement( 'div' );
		actions.className = 'project-save-actions';
		const cancel = document.createElement( 'button' );
		cancel.type = 'button'; cancel.textContent = 'Cancel';
		cancel.addEventListener( 'click', () => dialog.close() );
		const submit = document.createElement( 'button' );
		submit.type = 'submit'; submit.textContent = 'Save';
		actions.append( cancel, submit );
		form.append( heading, label, note, result, actions );
		form.addEventListener( 'submit', async event => {

			event.preventDefault();
			if ( submit.disabled ) return;
			let record;
			try { record = projectRecord( editor, projectPath( input.value ) ); }
			catch ( error ) { result.textContent = error.message; return; }
			submit.disabled = cancel.disabled = true;
			result.textContent = 'Saving…';
			let failure;
			try { await library.save( record ); }
			catch ( error ) { failure = error; }
			const blob = new Blob( [ JSON.stringify( record.project ) ], { type: 'application/json' } );
			editor.utils.save( blob, record.title + '.json' );
			if ( failure ) {

				result.textContent = 'JSON downloaded. Browser copy could not be saved: ' + failure.message;
				submit.disabled = cancel.disabled = false;
				return;

			}
			editor.userProjectPath = record.path;
			editor.config.setKey( 'project/title', record.title );
			editor.signals.projectLoaded.dispatch( record.project );
			await refresh();
			dialog.close();

		} );
		dialog.addEventListener( 'keydown', event => event.stopPropagation() );
		dialog.addEventListener( 'cancel', event => { if ( submit.disabled ) event.preventDefault(); } );
		dialog.addEventListener( 'close', () => dialog.remove(), { once: true } );
		dialog.append( form );
		document.body.append( dialog );
		dialog.showModal();
		input.select();

	}

	return { dom: container, refresh, save };

}

export { createExampleLibrary };
