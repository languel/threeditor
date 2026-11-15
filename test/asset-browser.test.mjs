import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve, search, facet, assetURL } from '../editor/js/assets/Mediatheque.js';
import { gltfDocument, gltfResourceURIs } from '../editor/js/assets/GLTFAssets.js';
import { fileKind, folderPath } from '../editor/js/assets/AssetLibrary.js';
import { isGaussianSplatFile, splatBytesToPLY, splatFileType, splatScript } from '../editor/js/assets/SplatObjects.js';
import { scanFileKind } from '../editor/js/assets/ScanFiles.js';

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
	for ( const name of [ 'fox.glb', 'scene.gltf', 'mesh.obj', 'model.fbx', 'mesh.ply' ] ) assert.equal( fileKind( { name, type: '' } ), 'model' );
	for ( const name of [ 'scene.spz', 'scene.sog', 'scene.rad' ] ) assert.equal( fileKind( { name, type: '' } ), 'splat' );
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

test( 'Gaussian splat detector distinguishes 3DGS PLY from ordinary mesh PLY and produces splat script', async () => {

	const gsPly = new File( [ 'ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty float x\nproperty float f_dc_0\nproperty float opacity\nproperty float scale_0\nproperty float rot_0\nend_header\n' ], 'scan.ply' );
	const geometryHeader = 'ply\nformat ascii 1.0\ncomment property float f_dc_0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\n';
	const pointsPly = new File( [ geometryHeader + 'end_header\n' ], 'points.ply' );
	const meshPly = new File( [ geometryHeader + 'element face 1\nproperty list uchar int vertex_indices\nend_header\n' ], 'mesh.ply' );
	const packedPly = new File( [ 'ply\nformat binary_little_endian 1.0\nelement chunk 1\nelement vertex 1\nproperty uint packed_position\nproperty uint packed_rotation\nproperty uint packed_scale\nproperty uint packed_color\nend_header\n' ], 'packed.ply' );
	assert.equal( await isGaussianSplatFile( gsPly ), true );
	assert.equal( await isGaussianSplatFile( meshPly ), false );
	assert.equal( await scanFileKind( meshPly ), 'model' );
	assert.equal( await scanFileKind( pointsPly ), 'point-cloud' );
	assert.equal( await scanFileKind( packedPly ), 'splat' );
	assert.equal( await scanFileKind( new File( [], 'cloud.XYZ' ) ), 'point-cloud' );
	assert.equal( await isGaussianSplatFile( new File( [ '' ], 'room.sog' ) ), true );
	assert.equal( splatFileType( 'assets/room.rad' ), 'rad' );
	const script = splatScript( 'assets/scan.spz', 'spz' );
	assert.equal( script.assetBehavior, 'splat' );
	assert.ok( script.source.includes( 'gaussian-splat-lite' ) );

} );

test( 'Raw splat records convert to Gaussian PLY for the existing decoder', () => {

	const record = new ArrayBuffer( 32 );
	const input = new DataView( record );
	input.setFloat32( 0, 2, true );
	input.setFloat32( 12, 0.5, true );
	new Uint8Array( record ).set( [ 255, 0, 127, 128, 255, 128, 128, 128 ], 24 );
	const ply = splatBytesToPLY( record );
	const marker = 'end_header\n';
	const offset = new TextDecoder().decode( ply ).indexOf( marker ) + marker.length;
	const vertex = new DataView( ply, offset );
	assert.equal( vertex.getFloat32( 0, true ), 2 );
	assert.ok( Math.abs( Math.exp( vertex.getFloat32( 12, true ) ) - 0.5 ) < 1e-6 );
	assert.equal( vertex.getFloat32( 48, true ), 0 );
	assert.throws( () => splatBytesToPLY( new ArrayBuffer( 31 ) ), /record length/ );

} );
