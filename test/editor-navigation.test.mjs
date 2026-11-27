import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { applyFlyLightPose, captureLightView, lightViewCamera, restoreLightView } from '../editor/js/modeling/LightView.js';

// Resolve the browser's import-map alias without installing dependencies.
const source = await readFile( new URL( '../editor/js/EditorControls.js', import.meta.url ), 'utf8' );
const moduleSource = source.replace( "from 'three'", `from '${ new URL( '../build/three.module.js', import.meta.url ).href }'` );
const { EditorControls } = await import( 'data:text/javascript;base64,' + Buffer.from( moduleSource ).toString( 'base64' ) );

function setup( mode = 'basic', emulate = false ) {

	const camera = new THREE.PerspectiveCamera();
	camera.position.set( 0, 5, 10 );
	camera.lookAt( 0, 0, 0 );
	const controls = new EditorControls( camera );
	controls.navigationMode = () => mode;
	controls.emulateThreeButton = () => emulate;
	const document = new EventTarget();
	const canvas = new EventTarget();
	canvas.ownerDocument = document;
	canvas.setPointerCapture = canvas.releasePointerCapture = () => {};
	canvas.hasPointerCapture = () => true;
	controls.connect( canvas );
	function dispatch( target, type, properties ) {

		target.dispatchEvent( Object.assign( new Event( type, { cancelable: true } ), properties ) );

	}
	function drag( properties = {} ) {

		const pointer = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0, ...properties };
		dispatch( canvas, 'pointerdown', pointer );
		dispatch( document, 'pointermove', { ...pointer, clientX: 40, clientY: 20 } );
		dispatch( document, 'pointerup', pointer );

	}
	return { camera, controls, drag, wheel: () => dispatch( canvas, 'wheel', { deltaY: - 100 } ) };

}

test( 'Standard mouse orbits, pans and zooms the editor camera', () => {

	const { camera, controls, drag, wheel } = setup();
	const start = camera.position.clone();
	const distance = start.distanceTo( controls.center );
	drag();
	assert.ok( camera.position.distanceTo( start ) > 0.1 );
	assert.ok( Math.abs( camera.position.distanceTo( controls.center ) - distance ) < 1e-8 );
	for ( const gesture of [ { shiftKey: true }, { button: 2 } ] ) {

		const center = controls.center.clone();
		const position = camera.position.clone();
		drag( gesture );
		assert.ok( controls.center.distanceTo( center ) > 0.1 );
		assert.ok( camera.position.clone().sub( position ).distanceTo( controls.center.clone().sub( center ) ) < 1e-8 );

	}
	wheel();
	assert.ok( camera.position.distanceTo( controls.center ) < distance );

} );

test( 'Blender mouse mode retains middle-drag and emulated Alt-drag', () => {

	for ( const emulate of [ false, true ] ) {

		const { camera, drag } = setup( 'blender', emulate );
		const start = camera.position.clone();
		drag();
		assert.deepEqual( camera.position.toArray(), start.toArray() );
		drag( emulate ? { altKey: true } : { button: 1 } );
		assert.ok( camera.position.distanceTo( start ) > 0.1 );

	}

} );

test( 'Edit tools can reserve the left button without blocking explicit camera navigation', () => {

	const { camera, controls, drag, wheel } = setup();
	controls.canStartNavigation = event => event.button !== 0 || event.altKey;
	const start = camera.position.clone();
	drag();
	assert.deepEqual( camera.position.toArray(), start.toArray() );
	drag( { shiftKey: true } );
	assert.deepEqual( camera.position.toArray(), start.toArray() );
	drag( { altKey: true } );
	assert.ok( camera.position.distanceTo( start ) > .1 );
	const beforeWheel = camera.position.clone();
	wheel();
	assert.ok( camera.position.distanceTo( beforeWheel ) > .01 );
	const beforeMiddle = camera.position.clone();
	controls.navigationMode = () => 'blender';
	drag( { button: 1 } );
	assert.ok( camera.position.distanceTo( beforeMiddle ) > .01 );

} );

test( 'Selection-first mouse navigation reserves left drag and keeps orbit, pan, and zoom available', () => {

	for ( const mode of [ 'basic', 'blender' ] ) {

		const { camera, controls, drag } = setup( mode, true );
		controls.emptySpaceDrag = () => 'select';
		const start = camera.position.clone();
		drag();
		assert.ok( camera.position.equals( start ) );
		drag( { button: 1 } );
		assert.ok( camera.position.distanceTo( start ) > .1 );
		const center = controls.center.clone();
		drag( { altKey: true, shiftKey: true } );
		assert.ok( controls.center.distanceTo( center ) > .1 );
		const distance = camera.position.distanceTo( controls.center );
		drag( { button: 1, ctrlKey: true } );
		assert.notEqual( camera.position.distanceTo( controls.center ), distance );

	}

} );

test( 'An accepted optical fly pose moves the light and target in world space and restores its lens state', () => {

	const scene = new THREE.Scene(), parent = new THREE.Group();
	parent.position.set( 1, 2, 3 );
	parent.rotation.z = .4;
	scene.add( parent );
	const light = new THREE.DirectionalLight();
	parent.add( light );
	scene.add( light.target );
	const before = captureLightView( light );
	const camera = lightViewCamera( THREE, light );
	camera.position.set( 3, 4, 5 );
	camera.lookAt( 1, 1, 0 );
	camera.zoom = 2.5;
	applyFlyLightPose( THREE, light, camera, 4 );
	const next = lightViewCamera( THREE, light );
	assert.ok( next.position.distanceTo( camera.position ) < 1e-8 );
	assert.ok( next.getWorldDirection( new THREE.Vector3() ).distanceTo( camera.getWorldDirection( new THREE.Vector3() ) ) < 1e-8 );
	assert.equal( next.zoom, 2.5 );
	restoreLightView( light, before );
	assert.deepEqual( captureLightView( light ), before );

} );
