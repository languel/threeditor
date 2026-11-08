// TypeScript language service adapted from Artist Model Studio. Source stays local.
function createCodeLanguageService( editor ) {

	let workerPromise;
	let serial = 0;
	const pending = new Map();
	async function worker() {

		if ( ! workerPromise ) workerPromise = ( async () => {

			const path = 'js/libs/language-worker.js';
			const sourceUrl = editor.portable ? editor.portable.url( path ) : new URL( path, document.baseURI ).href;
			const response = await fetch( sourceUrl );
			if ( ! response.ok ) throw new Error( 'Language service unavailable' );
			const blobUrl = URL.createObjectURL( new Blob( [ await response.text() ], { type: 'text/javascript' } ) );
			// Classic blob workers also work from file:// editable exports in Chrome.
			const instance = new Worker( blobUrl );
			window.addEventListener( 'unload', () => URL.revokeObjectURL( blobUrl ), { once: true } );
			instance.onmessage = ( { data } ) => {

				const request = pending.get( data.id );
				if ( ! request ) return;
				pending.delete( data.id ); clearTimeout( request.timer );
				if ( data.error ) request.reject( new Error( data.error ) ); else request.resolve( data.result );

			};
			instance.onerror = ( event ) => {

				for ( const request of pending.values() ) { clearTimeout( request.timer ); request.reject( new Error( 'Language service failed: ' + ( event.message || 'worker error' ) ) ); }
				pending.clear();

			};
			return instance;

		} )();
		return workerPromise;

	}
	return async function ask( source, operation, pos = 0 ) {

		const instance = await worker();
		const typesUrl = editor.portable ? editor.portable.url( 'js/libs/language-types.json' ) : new URL( 'js/libs/language-types.json', document.baseURI ).href;
		return new Promise( ( resolve, reject ) => {

			const id = ++ serial;
			const timer = setTimeout( () => { pending.delete( id ); reject( new Error( 'Language service timed out' ) ); }, 30000 );
			pending.set( id, { resolve, reject, timer } );
			instance.postMessage( { id, mode: 'three', source, operation, pos, typesUrl } );

		} );

	};

}

export { createCodeLanguageService };
