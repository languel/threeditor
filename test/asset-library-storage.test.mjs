import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AssetLibrary } from '../editor/js/assets/AssetLibrary.js';

test( 'asset files round-trip when IndexedDB cannot store File or Blob values', async () => {

	const stored = new Map();
	const library = new AssetLibrary();
	library.transaction = async ( mode, action ) => action( {
		put( value ) {

			assert.ok( ! ( value.file instanceof Blob ), 'storage must not receive a File or Blob' );
			stored.set( value.id, structuredClone( value ) );

		},
		get( id ) { return structuredClone( stored.get( id ) ); },
		getAll() { return structuredClone( [ ...stored.values() ] ); }
	} );
	const file = new File( [ 'video bytes' ], 'clip.webm', { type: 'video/webm', lastModified: 1234 } );
	await library.put( { id: 'clip', title: 'Clip', file } );
	for ( const record of [ await library.get( 'clip' ), ...( await library.all() ) ] ) {

		assert.ok( record.file instanceof File );
		assert.equal( await record.file.text(), 'video bytes' );
		assert.equal( record.file.name, 'clip.webm' );
		assert.equal( record.file.type, 'video/webm' );
		assert.equal( record.file.lastModified, 1234 );

	}
	assert.equal( library.decode( { id: 'legacy', file } ).file, file, 'existing File records remain readable' );

} );
