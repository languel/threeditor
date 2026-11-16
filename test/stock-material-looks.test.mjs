import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';

const editorPath = new URL( '../editor/js/', import.meta.url );
const source = await readFile( new URL( 'StockMaterialLooks.js', editorPath ), 'utf8' );
const moduleSource = source.replace( "from 'three'", `from '${ new URL( '../build/three.module.js', import.meta.url ).href }'` )
	.replace( "from './ObjectRestrictions.js'", `from '${ new URL( 'ObjectRestrictions.js', editorPath ).href }'` );
const { createStockMaterialLook, loadStockLookBase, stockLookFields, stockMaterialLooks } =
	await import( 'data:text/javascript;base64,' + Buffer.from( moduleSource ).toString( 'base64' ) );

test( 'Stock parameters match shader uniforms and survive a material JSON round trip', () => {

	const loader = new THREE.MaterialLoader();
	for ( const look of Object.keys( stockMaterialLooks ) ) {

		const material = createStockMaterialLook( look, new THREE.MeshStandardMaterial() );
		for ( const [ key, field ] of Object.entries( stockLookFields( look ) ) ) {

			assert.ok( material.fragmentShader.includes( 'uniform ' + field.type + ' ' + key + ';' ) );
			assert.ok( material.uniforms[ key ] );

		}
		material.uniforms.ink.value.set( '#127fd0' );
		material.uniforms.outlineWidth.value = 0.42;
		const loaded = loader.parse( JSON.parse( JSON.stringify( material.toJSON() ) ) );
		assert.equal( loaded.uniforms.ink.value.getHexString(), '127fd0' );
		assert.equal( loaded.uniforms.outlineWidth.value, 0.42 );

	}

} );

test( 'Changing a stock look retains the original textured material for disabling after reload', async () => {

	const texture = new THREE.DataTexture( new Uint8Array( [ 41, 72, 35, 255 ] ), 1, 1 );
	const original = new THREE.MeshStandardMaterial( { color: 0x2f6b81, map: texture, roughness: 0.35, side: THREE.DoubleSide } );
	const first = createStockMaterialLook( 'sketch', original );
	const second = createStockMaterialLook( 'blueprint', first );
	assert.equal( await loadStockLookBase( second, {}, new Map() ), original );
	const loaded = new THREE.MaterialLoader().parse( JSON.parse( JSON.stringify( second.toJSON() ) ) );
	const pending = new Map();
	const restored = await loadStockLookBase( loaded, {}, pending );
	assert.equal( restored.uuid, original.uuid );
	assert.equal( restored.color.getHex(), original.color.getHex() );
	assert.equal( restored.roughness, original.roughness );
	assert.equal( restored.side, original.side );
	assert.deepEqual( restored.map.image.data, texture.image.data );
	assert.equal( await loadStockLookBase( loaded, {}, pending ), restored );

} );
