import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { projectPath, projectRecord, projectTree } from '../editor/js/ProjectLibrary.js';
import { exampleCatalog, exampleResources } from '../editor/js/ExampleCatalog.js';

test( 'Project names support nested folders without empty or traversal segments', () => {

	assert.equal( projectPath( ' Studies / Fox.json ' ), 'Studies/Fox' );
	assert.equal( projectPath( 'Sketches\\Cube' ), 'Sketches/Cube' );
	for ( const path of [ '', '/Fox', 'Fox/', 'A//B', '../Fox', 'A/../B', './Fox', 'A\u0000B' ] ) assert.throws( () => projectPath( path ) );

} );

test( 'Named snapshots detach project and original asset files from future editor changes', async () => {

	const state = { project: {}, scene: { object: { name: 'Fox' } }, camera: {} };
	const file = new File( [ 'model bytes' ], 'fox.glb', { type: 'model/gltf-binary' } );
	const editor = { toJSON: () => state, sourceFiles: new Map( [ [ 'fox.glb', { file, batch: [ 'fox.glb' ] } ] ] ), viewportShading: 'preview' };
	const record = projectRecord( editor, 'Studies/Fox' );
	state.scene.object.name = 'Changed';
	editor.sourceFiles.get( 'fox.glb' ).batch.push( 'changed' );
	assert.equal( record.project.scene.object.name, 'Fox' );
	assert.equal( record.project.project.title, 'Fox' );
	assert.equal( record.project.project.libraryPath, 'Studies/Fox' );
	assert.equal( await record.sourceFiles[ 0 ][ 1 ].file.text(), 'model bytes' );
	assert.deepEqual( record.sourceFiles[ 0 ][ 1 ].batch, [ 'fox.glb' ] );
	assert.equal( record.shading, 'preview' );

} );

test( 'User projects become a nested tree with folders and same-named leaf projects', () => {

	const tree = projectTree( [ { path: 'Studies' }, { path: 'Studies/Fox' }, { path: 'Studies/Light/Cube' } ] );
	assert.equal( tree[ 0 ].path, 'Studies' );
	assert.equal( tree[ 1 ].title, 'Studies' );
	assert.equal( tree[ 1 ].children[ 0 ].path, 'Studies/Fox' );
	assert.equal( tree[ 1 ].children[ 1 ].children[ 0 ].path, 'Studies/Light/Cube' );

} );

test( 'Catalog retains threejs demos, ordered lessons and Fox last; scenes round-trip', async () => {

	assert.equal( exampleCatalog[ 0 ].title, 'threejs' );
	assert.equal( exampleCatalog[ 0 ].children.length, 5 );
	const lessons = exampleCatalog.find( entry => entry.title === 'lessons' ).children;
	assert.equal( lessons.length, 6 );
	assert.match( lessons.at( -1 ).title, /Fox/ );
	for ( const entry of exampleCatalog.flatMap( folder => folder.children ) ) {

		const url = new URL( '../editor/' + entry.file, import.meta.url );
		const json = JSON.parse( await readFile( url ) );
		if ( entry.file.includes( 'examples/lessons/' ) ) {

			const camera = await new THREE.ObjectLoader().parseAsync( json.camera );
			assert.ok( camera.getWorldDirection( new THREE.Vector3() ).dot( camera.position.clone().negate().normalize() ) > .99, entry.title + ' must frame the lesson origin' );

		}
		// Embedded image decoding is exercised by the browser playback check.
		if ( json.scene.images?.length ) { assert.ok( json.scene.object ); continue; }
		const scene = await new THREE.ObjectLoader().parseAsync( json.scene );
		assert.ok( scene.isScene, entry.title );
		if ( entry.title.includes( 'Recorded body' ) || entry.title.includes( 'Triadic' ) ) {

			let animated = 0;
			scene.traverse( object => {

				if ( ! object.animations.length ) return;
				animated ++;
				const mixer = new THREE.AnimationMixer( object );
				const first = object.children[ 0 ].position.clone();
				mixer.clipAction( object.animations[ 0 ] ).play();
				mixer.update( 1 );
				assert.ok( object.children[ 0 ].position.distanceTo( first ) > 0.001 );

			} );
			assert.ok( animated > 0 );

		}

	}

} );

test( 'Editable HTML resources follow nested examples and include lesson source assets', async () => {
	const resources = exampleResources();
	assert.equal( resources.filter( path => path.endsWith( '.json' ) ).length, 11 );
	assert.ok( resources.includes( '../demos/fox-follow/assets/fox.glb' ) );
	assert.ok( resources.includes( 'examples/threejs/arkanoid.app.json' ) );
	for ( const path of resources ) assert.ok( ( await readFile( new URL( '../editor/' + path, import.meta.url ) ) ).length > 0 );
	assert.deepEqual( exampleResources( [ { children: [ { children: [ { file: 'deep/scene.json', assets: [ { file: 'deep/model.glb' } ] } ] } ] } ] ), [ 'deep/scene.json', 'deep/model.glb' ] );
} );
