import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve, search, facet, assetURL } from '../editor/js/assets/Mediatheque.js';
import { gltfDocument, gltfResourceURIs } from '../editor/js/assets/GLTFAssets.js';
import { fileKind, folderPath } from '../editor/js/assets/AssetLibrary.js';

test( 'Catalog URLs honor a CORS host override, preserve originals, and reject executable URLs', () => {
	const result = resolve( 'https://media.example/archive/', { id: 'fox', kind: 'model', media: 'items/fox/media.glb', thumb: 'items/fox/thumb.webp', original: 'items/fox/original.glb' } );
	assert.equal( result.url, 'https://media.example/archive/items/fox/media.glb' );
	assert.equal( result.original, 'https://media.example/archive/items/fox/original.glb' );
	assert.equal( resolve( 'https://media.example/', { id: 'remote', url: 'https://other.example/model.glb' } ).url, 'https://other.example/model.glb' );
	assert.throws( () => assetURL( 'https://media.example/', 'javascript:alert(1)' ) );
} );
test( 'Catalog searches combine model kinds, exact tags, collections and all query words', () => {
	const records = [ { title: 'Fox', kind: 'model', tags: [ 'animated', 'animal' ], collections: [ '3d' ], creators: [ 'PixelMannen' ] }, { title: 'Fox photo', kind: 'texture', tags: [ 'animal' ], collections: [ 'photo' ] } ];
	assert.deepEqual( search( records, '#animated pixelmannen', { kind: 'model', collection: '3d' } ), [ records[ 0 ] ] );
	assert.equal( search( records, 'fox missing' ).length, 0 );
	assert.equal( search( records, '#anim' ).length, 0 );
	assert.deepEqual( facet( records, 'tags' ), [ [ 'animal', 2 ], [ 'animated', 1 ] ] );
} );
test( 'Imports retain model, texture and companion formats with safe folder paths', () => {
	for ( const name of [ 'fox.glb', 'scene.gltf', 'mesh.obj', 'model.fbx' ] ) assert.equal( fileKind( { name, type: '' } ), 'model' );
	for ( const name of [ 'color.png', 'light.exr', 'sky.hdr', 'normal.ktx2' ] ) assert.equal( fileKind( { name, type: '' } ), 'texture' );
	assert.equal( fileKind( { name: 'geometry.bin', type: '' } ), 'file' );
	assert.equal( folderPath( ' Models\\Animals / Fox ' ), 'Models/Animals/Fox' );
	assert.throws( () => folderPath( '../Models' ) );
} );

test( 'GLB and JSON glTF expose external resources, deduplicating embedded data', async () => {
	const document = { asset: { version: '2.0' }, buffers: [ { uri: 'geometry.bin' } ], images: [ { uri: 'color.png' }, { uri: 'color.png' }, { uri: 'data:image/png;base64,AAA' } ] };
	const json = new TextEncoder().encode( JSON.stringify( document ).padEnd( Math.ceil( JSON.stringify( document ).length / 4 ) * 4, ' ' ) );
	const bytes = new Uint8Array( json.length + 20 ), view = new DataView( bytes.buffer );
	view.setUint32( 0, 0x46546c67, true ); view.setUint32( 4, 2, true ); view.setUint32( 8, bytes.length, true ); view.setUint32( 12, json.length, true ); view.setUint32( 16, 0x4e4f534a, true ); bytes.set( json, 20 );
	for ( const file of [ new File( [ bytes ], 'model.glb' ), new File( [ JSON.stringify( document ) ], 'model.gltf' ) ] ) {
		assert.deepEqual( gltfResourceURIs( await gltfDocument( file ) ), [ 'geometry.bin', 'color.png' ] );
	}
	await assert.rejects( () => gltfDocument( new File( [ 'broken' ], 'model.glb' ) ) );
} );
