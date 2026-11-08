import { scriptParams, scriptParamValue } from './ScriptParams.js';

const controllerSource = `// Camera controller for Play and playable exports. Edit this script freely.
// @param mode = "orbit"
// @param follow = ""
// @param movementSpeed = 4 (0.1..100)
// @param lookSpeed = 0.08 (0.001..1)
// @param rotateSpeed = 1 (0.1..10)
// @param zoomSpeed = 1 (0.1..10)
// @param panSpeed = 1 (0.1..10)
// @param enablePan = true
// @param enableZoom = true

function start() {
	// Only the active playback camera receives input.
	player.setCameraController(this, {
		...params,
		follow: scene.getObjectByProperty('uuid', params.follow)
	});
}
`;

function cameraControllerScript( editor, camera ) {

	return editor.scripts[ camera.uuid ]?.find( script => script.cameraController === true );

}

function cameraControllerSettings( editor, camera ) {

	const script = cameraControllerScript( editor, camera );
	if ( script ) {

		const settings = Object.fromEntries( scriptParams( script.source ).map( field => [ field.name, scriptParamValue( script, field ) ] ) );
		if ( script.enabled === false ) settings.mode = 'none';
		return settings;

	}
	const settings = camera.userData.threeditor;
	return { mode: settings?.cameraController || ( camera === editor.camera ? 'orbit' : 'none' ), follow: settings?.cameraFollow || '' };

}

function createCameraControllerScript( settings ) {

	return { name: 'Camera controller', cameraController: true, enabled: true, source: controllerSource, paramValues: { ...settings } };

}

export { cameraControllerScript, cameraControllerSettings, createCameraControllerScript };
