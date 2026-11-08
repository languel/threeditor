function projectPath( value ) {

	const path = String( value || '' ).trim().replace( /\\/g, '/' ).replace( /\.json$/i, '' );
	const parts = path.split( '/' ).map( part => part.trim() );
	if ( ! path || parts.some( part => ! part || part === '.' || part === '..' || /[\u0000-\u001f]/.test( part ) ) ) {

		throw new Error( 'Use a project name, optionally with folders such as Studies/Fox.' );

	}
	return parts.join( '/' );

}

function projectRecord( editor, value ) {

	const path = projectPath( value );
	const project = structuredClone( editor.toJSON() );
	project.project.title = path.split( '/' ).at( - 1 );
	project.project.libraryPath = path;
	return { path, title: project.project.title, updatedAt: Date.now(), project,
		sourceFiles: structuredClone( [ ...( editor.sourceFiles || [] ) ] ), shading: editor.viewportShading };

}

function projectTree( entries ) {

	const root = { children: [] };
	for ( const entry of entries ) {

		const parts = entry.path.split( '/' );
		let parent = root;
		for ( const title of parts.slice( 0, - 1 ) ) {

			let folder = parent.children.find( child => child.children && child.title === title );
			if ( ! folder ) parent.children.push( folder = { title, children: [] } );
			parent = folder;

		}
		parent.children.push( { ...entry, title: parts.at( - 1 ) } );

	}
	return root.children;

}

class ProjectLibrary {

	constructor( indexedDB = globalThis.indexedDB ) {

		this.indexedDB = indexedDB;
		this.database = null;

	}

	open() {

		if ( ! this.database ) this.database = new Promise( ( resolve, reject ) => {

			if ( ! this.indexedDB ) { reject( new Error( 'Browser project storage is unavailable.' ) ); return; }
			const request = this.indexedDB.open( 'threeditor-projects', 1 );
			request.onupgradeneeded = () => {

				for ( const name of [ 'projects', 'entries' ] ) request.result.createObjectStore( name, { keyPath: 'path' } );

			};
			request.onsuccess = () => resolve( request.result );
			request.onerror = () => reject( request.error );
			request.onblocked = () => reject( new Error( 'Close other editor tabs to unlock browser project storage.' ) );

		} );
		return this.database;

	}

	async list() {

		const database = await this.open();
		return new Promise( ( resolve, reject ) => {

			const request = database.transaction( 'entries', 'readonly' ).objectStore( 'entries' ).getAll();
			request.onsuccess = () => resolve( request.result.sort( ( a, b ) => a.path.localeCompare( b.path, undefined, { numeric: true } ) ) );
			request.onerror = () => reject( request.error );

		} );

	}

	async get( path ) {

		const database = await this.open();
		return new Promise( ( resolve, reject ) => {

			const request = database.transaction( 'projects', 'readonly' ).objectStore( 'projects' ).get( projectPath( path ) );
			request.onsuccess = () => resolve( request.result );
			request.onerror = () => reject( request.error );

		} );

	}

	async save( record ) {

		const database = await this.open();
		return new Promise( ( resolve, reject ) => {

			const transaction = database.transaction( [ 'projects', 'entries' ], 'readwrite' );
			transaction.oncomplete = () => resolve( record );
			transaction.onabort = transaction.onerror = () => reject( transaction.error || new Error( 'Could not save the project in browser storage.' ) );
			transaction.objectStore( 'projects' ).put( record );
			const { path, title, updatedAt } = record;
			transaction.objectStore( 'entries' ).put( { path, title, updatedAt } );

		} );

	}

}

export { ProjectLibrary, projectPath, projectRecord, projectTree };
