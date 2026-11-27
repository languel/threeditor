import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { readFile } from 'node:fs/promises';
import { ViewportVisibility } from '../editor/js/modeling/ViewportVisibility.js';

const source = ( await readFile( new URL( '../editor/js/Viewport.SelectionOutline.js', import.meta.url ), 'utf8' ) )
	.replace( "from 'three'", `from '${ new URL( '../build/three.module.js', import.meta.url ).href }'` )
	.replace( "from 'three/webgpu'", `from '${ new URL( '../build/three.webgpu.js', import.meta.url ).href }'` )
	.replace( "from 'three/tsl'", `from '${ new URL( '../build/three.tsl.js', import.meta.url ).href }'` )
	.replace( "from './ObjectRestrictions.js'", `from '${ new URL( '../editor/js/ObjectRestrictions.js', import.meta.url ).href }'` );
const { hasSelectionSurface, withSelectionOnly } = await import( 'data:text/javascript;base64,' + Buffer.from( source ).toString( 'base64' ) );

test( 'Local View restores temporary layers and visibility when a Director render fails', () => {

	const scene = new THREE.Scene();
	const parent = new THREE.Mesh();
	const child = new THREE.Mesh();
	const sibling = new THREE.Mesh();
	const light = new THREE.PointLight();
	parent.layers.set( 3 );
	parent.add( child, sibling );
	scene.add( parent, light );
	const signal = { add() {} };
	const signals = { editorCleared: signal, projectLoaded: signal, sceneGraphChanged: signal, objectAdded: signal };
	const visibility = new ViewportVisibility( { scene, signals, helpers: {}, selector: { selection: [ child ] } }, () => {} );
	const before = JSON.stringify( scene.toJSON() );
	visibility.toggleLocal();
	assert.throws( () => visibility.draw( { director: true }, () => {

		assert.equal( parent.layers.mask, 0 );
		assert.equal( child.visible, true );
		assert.equal( sibling.visible, false );
		assert.equal( light.visible, false );
		throw new Error( 'Render failure' );

	} ), /Render failure/ );
	visibility.draw( { director: false }, () => assert.equal( JSON.stringify( scene.toJSON() ), before ) );

} );

test( 'Selection isolation preserves child geometry and restores hierarchy after a failed render', () => {

	const scene = new THREE.Scene();
	const parent = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshBasicMaterial() );
	const selected = new THREE.Mesh( new THREE.SphereGeometry(), new THREE.MeshBasicMaterial() );
	const sibling = new THREE.Mesh( new THREE.BoxGeometry(), selected.material );
	const hidden = new THREE.Group();
	hidden.visible = false;
	parent.layers.set( 3 );
	parent.add( selected, sibling );
	scene.add( parent, hidden );
	const before = JSON.stringify( scene.toJSON() );
	assert.throws( () => withSelectionOnly( scene, [ selected ], () => {

		assert.equal( parent.visible, true );
		assert.equal( parent.layers.mask, 0 );
		assert.equal( selected.visible, true );
		assert.equal( sibling.visible, false );
		throw new Error( 'Render failure' );

	} ), /Render failure/ );
	assert.equal( JSON.stringify( scene.toJSON() ), before );

} );

test( 'Group outlines include drawable descendants while respecting hidden and disabled objects', () => {

	const scene = new THREE.Scene();
	const group = new THREE.Group();
	const points = new THREE.Points( new THREE.BufferGeometry(), new THREE.PointsMaterial() );
	const disabled = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshBasicMaterial() );
	disabled.userData.threeditor = { disabled: true };
	group.add( points, disabled );
	scene.add( group );
	assert.equal( hasSelectionSurface( group ), true );
	withSelectionOnly( scene, [ group ], () => {

		assert.equal( points.visible, true );
		assert.equal( disabled.visible, false );

	} );
	assert.equal( disabled.visible, true );
	points.visible = false;
	assert.equal( hasSelectionSurface( group ), false );
	const scan = new THREE.Group();
	scan.userData.hasSplat = true;
	group.add( scan );
	assert.equal( hasSelectionSurface( group ), true );

} );
