import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cameraControllerSettings, createCameraControllerScript } from '../editor/js/CameraControllerScript.js';
import { serializeScript } from '../editor/js/ScriptParams.js';
import { generateThreeCode } from '../editor/js/ThreeCodeExporter.js';
import * as THREE from '../build/three.module.js';

test( 'Director defaults to orbit and scene cameras require an attached controller', () => {

	const camera = { uuid: 'director', userData: {} };
	const sceneCamera = { uuid: 'scene-camera', userData: {} };
	const editor = { camera, scripts: {} };
	assert.equal( cameraControllerSettings( editor, camera ).mode, 'orbit' );
	assert.equal( cameraControllerSettings( editor, sceneCamera ).mode, 'none' );
	// Existing projects retain their metadata presets until explicitly changed.
	sceneCamera.userData.threeditor = { cameraController: 'thirdPerson', cameraFollow: 'fox' };
	assert.deepEqual( cameraControllerSettings( editor, sceneCamera ), { mode: 'thirdPerson', follow: 'fox' } );

} );

test( 'Controller parameters preserve overrides and drive the editable start handler', () => {

	const camera = { uuid: 'camera', userData: {} };
	const script = createCameraControllerScript( { mode: 'thirdPerson', follow: 'fox', movementSpeed: 200, enablePan: false } );
	const editor = { scripts: { camera: [ script ] } };
	const settings = cameraControllerSettings( editor, camera );
	assert.equal( settings.movementSpeed, 200 );
	assert.equal( settings.enablePan, false );
	const saved = serializeScript( script );
	assert.deepEqual( saved.parameters, settings );
	const fox = {};
	let attached;
	const player = { setCameraController( object, options ) { attached = { object, options }; } };
	const scene = { getObjectByProperty( property, uuid ) { assert.equal( property, 'uuid' ); return uuid === 'fox' ? fox : undefined; } };
	const start = new Function( 'player', 'scene', 'params', script.source + '\nreturn start;' )( player, scene, saved.parameters );
	start.call( camera );
	assert.equal( attached.object, camera );
	assert.equal( attached.options.follow, fox );
	assert.equal( attached.options.movementSpeed, 200 );
	script.enabled = false;
	assert.equal( cameraControllerSettings( editor, camera ).mode, 'none' );

} );

test( 'User edits to controller parameter declarations remain authoritative', () => {

	const camera = { uuid: 'camera', userData: {} };
	const script = createCameraControllerScript( { mode: 'fly' } );
	script.source = script.source.replace( 'movementSpeed = 4', 'movementSpeed = 12' );
	assert.equal( cameraControllerSettings( { scripts: { camera: [ script ] } }, camera ).movementSpeed, 12 );

} );

test( 'Source export preserves an attached follow controller and its parameter overrides', () => {

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera();
	const fox = new THREE.Group();
	fox.name = 'Fox';
	scene.add( fox, camera );
	const script = createCameraControllerScript( { mode: 'thirdPerson', follow: fox.uuid, rotateSpeed: 2, enableZoom: false } );
	const editor = { scene, camera: new THREE.PerspectiveCamera(), viewportCamera: camera, cameras: { [ camera.uuid ]: camera }, scripts: { [ camera.uuid ]: [ script ] }, config: { getKey() {} } };
	const { code } = generateThreeCode( editor );
	assert.ok( code.includes( '"mode":"thirdPerson"' ) );
	assert.ok( code.includes( '"rotateSpeed":2' ) );
	assert.ok( code.includes( '"enableZoom":false' ) );
	assert.ok( code.includes( `follow: scene.getObjectByProperty('uuid', "${ fox.uuid }")` ) );
	assert.ok( code.includes( `.uuid = "${ fox.uuid }"` ) );
	script.enabled = false;
	assert.ok( ! generateThreeCode( editor ).code.includes( 'const controls = createCameraController(' ) );

} );
