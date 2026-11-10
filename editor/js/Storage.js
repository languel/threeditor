import { encodeSourceFiles, decodeSourceFiles } from './assets/StoredFile.js';

function Storage() {

	const indexedDB = window.indexedDB;

	if ( indexedDB === undefined ) {

		console.warn( 'Storage: IndexedDB not available.' );
		return { init: function () {}, get: function () {}, set: function () {}, clear: function () {} };

	}

	const name = 'threejs-editor';
	const version = 1;

	let database;
	let pendingWrites = Promise.resolve();

	return {

		init: function ( callback ) {

			const request = indexedDB.open( name, version );
			request.onupgradeneeded = function ( event ) {

				const db = event.target.result;

				if ( db.objectStoreNames.contains( 'states' ) === false ) {

					db.createObjectStore( 'states' );

				}

			};

			request.onsuccess = function ( event ) {

				database = event.target.result;

				callback();

			};

			request.onerror = function ( event ) {

				console.error( 'Storage: IndexedDB', event );

			};


		},

		get: function ( callback ) {

			const retrievalStart = performance.now();

			const transaction = database.transaction( [ 'states' ], 'readonly' );
			const objectStore = transaction.objectStore( 'states' );

			transaction.onerror = function ( event ) {

				console.error( 'Storage: IndexedDB get failed:', event.target.error );

			};

			const request = objectStore.get( 0 );
			request.onsuccess = function ( event ) {

				const retrievalDuration = performance.now() - retrievalStart;

				const hydrationStart = performance.now();

				const state = event.target.result;
				if ( state?.sourceFiles ) state.sourceFiles = new Map( decodeSourceFiles( state.sourceFiles ) );
				callback( state );

				const hydrationDuration = performance.now() - hydrationStart;

				const restorationDuration = retrievalDuration + hydrationDuration;

				console.log(

					'[' + /\d\d\:\d\d\:\d\d/.exec( new Date() )[ 0 ] + ']',

					`Restored state. ${ restorationDuration.toFixed( 2 ) } ms. ( Retrieval: ${ retrievalDuration.toFixed( 2 ) } ms, Hydration: ${ hydrationDuration.toFixed( 2 ) } ms )`

				);

			};

		},

		set: function ( data ) {

			const start = performance.now();
			const sourceFiles = data.sourceFiles ? [ ...data.sourceFiles ] : null;

			pendingWrites = pendingWrites.then( async () => {

				const stored = sourceFiles ? { ...data, sourceFiles: await encodeSourceFiles( sourceFiles ) } : data;
				await new Promise( ( resolve, reject ) => {
					const transaction = database.transaction( [ 'states' ], 'readwrite' );
					transaction.oncomplete = resolve;
					transaction.onabort = transaction.onerror = () => reject( transaction.error || new Error( 'Autosave failed.' ) );
					transaction.objectStore( 'states' ).put( stored, 0 );
				} );

				console.log( '[' + /\d\d\:\d\d\:\d\d/.exec( new Date() )[ 0 ] + ']', 'Saved state to IndexedDB. ' + ( performance.now() - start ).toFixed( 2 ) + 'ms' );

			} ).catch( error => console.error( 'Storage: IndexedDB put failed:', error ) );

		},

		clear: function () {

			if ( database === undefined ) return;

			pendingWrites = pendingWrites.then( () => new Promise( ( resolve, reject ) => {
				const transaction = database.transaction( [ 'states' ], 'readwrite' );
				transaction.oncomplete = resolve;
				transaction.onabort = transaction.onerror = () => reject( transaction.error || new Error( 'Autosave clear failed.' ) );
				transaction.objectStore( 'states' ).clear();
			} ) ).then( () => console.log( '[' + /\d\d\:\d\d\:\d\d/.exec( new Date() )[ 0 ] + ']', 'Cleared IndexedDB.' ) )
				.catch( error => console.error( 'Storage: IndexedDB clear failed:', error ) );

		}

	};

}

export { Storage };
