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

test( 'asset cleanup enforces one device asset per camera and deduplicates default landmarks', async () => {

	const stored = new Map();
	const library = new AssetLibrary();
	library.transaction = async ( mode, action ) => action( {
		put( value ) { stored.set( value.id, structuredClone( value ) ); },
		get( id ) { return structuredClone( stored.get( id ) ); },
		getAll() { return structuredClone( [ ...stored.values() ] ); },
		delete( id ) { stored.delete( id ); }
	} );

	await library.put( { id: 'cam-generic', kind: 'webcam', title: 'Webcam', created: 50 } );
	await library.put( { id: 'cam-old', kind: 'webcam', title: 'MacBook Pro Camera', deviceId: 'stale-id', created: 100 } );
	await library.put( { id: 'cam-active', kind: 'webcam', title: 'MacBook Pro Camera', deviceId: 'active-1', created: 250 } );
	await library.put( { id: 'cam-dup', kind: 'webcam', title: 'MacBook Pro Camera', deviceId: 'active-1', created: 150 } );
	await library.put( { id: 'cam-other', kind: 'webcam', title: 'USB Camera', deviceId: 'active-2', created: 200 } );
	await library.put( { id: 'cam-other-2', kind: 'webcam', title: 'USB Camera', deviceId: 'active-3', created: 210 } );
	await library.put( { id: 'lm-1', kind: 'landmark', title: 'Landmark visualization', folder: '', tags: [], rating: 0, created: 100 } );
	await library.put( { id: 'lm-2', kind: 'landmark', title: 'Landmark visualization', folder: '', tags: [], rating: 0, created: 200 } );
	await library.put( { id: 'lm-custom', kind: 'landmark', title: 'Custom Pose', folder: '', tags: [], rating: 0, created: 300 } );

	const merged = [];
	const removed = await library.cleanup( {
		activeDeviceIds: [ 'active-1', 'active-2', 'active-3' ],
		onMerge: ( keeper, dup ) => merged.push( [ keeper.id, dup.id ] )
	} );

	assert.equal( removed, 4 );
	const ids = ( await library.all() ).map( r => r.id ).sort();
	assert.deepEqual( ids, [ 'cam-active', 'cam-other', 'cam-other-2', 'lm-2', 'lm-custom' ] );
	assert.deepEqual( merged.sort(), [ [ 'cam-active', 'cam-dup' ], [ 'cam-active', 'cam-generic' ], [ 'cam-active', 'cam-old' ], [ 'lm-2', 'lm-1' ] ] );

} );
