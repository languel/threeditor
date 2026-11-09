import { hasRestriction } from './ObjectRestrictions.js';
import { UIPanel, UISelect } from './libs/ui.js';
import { ViewportParameters } from './Viewport.Parameters.js';

function ViewportControls( editor ) {

	const signals = editor.signals;

	const container = new UIPanel();
	container.dom.classList.add( 'viewport-controls' );
	container.setPosition( 'absolute' );
	container.setRight( '10px' );
	container.setTop( '10px' );

	// camera

	const cameraSelect = new UISelect();
	cameraSelect.setMarginRight( '10px' );
	cameraSelect.onChange( function () {

		editor.setViewportCamera( this.getValue() );

	} );
	container.add( cameraSelect );

	signals.cameraAdded.add( update );
	signals.cameraRemoved.add( update );
	signals.viewportCameraChanged.add( () => cameraSelect.setValue( editor.viewportCamera.uuid ) );
	signals.objectChanged.add( function ( object, attribute ) {

		if ( attribute === 'userData' ) {

			updateCameraList();
			if ( hasRestriction( editor.viewportCamera, 'disabled' ) ) editor.setViewportCamera( editor.camera.uuid );
			return;

		}

		if ( object.isCamera ) {

			updateCameraList();

		}

	} );

	// shading

	const shadingSelect = new UISelect();
	shadingSelect.setOptions( { 'realistic': 'realistic', 'preview': 'preview', 'solid': 'solid', 'normals': 'normals', 'wireframe': 'wireframe' } );
	shadingSelect.setValue( 'solid' );
	shadingSelect.onChange( function () {

		editor.setViewportShading( this.getValue() );

	} );
	const parameters = new ViewportParameters( editor );
	editor.viewportParameters = parameters;
	container.add( shadingSelect, parameters );
	signals.viewportShadingChanged.add( () => shadingSelect.setValue( editor.viewportShading ) );

	signals.editorCleared.add( function () {

		editor.setViewportCamera( editor.camera.uuid );

		shadingSelect.setValue( 'solid' );
		editor.setViewportShading( shadingSelect.getValue() );

	} );

	signals.cameraResetted.add( update );

	update();

	//

	function updateCameraList() {

		const options = {};

		const cameras = editor.cameras;

		for ( const key in cameras ) {

			const camera = cameras[ key ];
			if ( ! hasRestriction( camera, 'disabled' ) ) options[ camera.uuid ] = camera.name;

		}

		cameraSelect.setOptions( options );

		const selectedCamera = ( editor.viewportCamera.uuid in options )
			? editor.viewportCamera
			: editor.camera;

		cameraSelect.setValue( selectedCamera.uuid );

		return selectedCamera;

	}

	function update() {

		const selectedCamera = updateCameraList();
		editor.setViewportCamera( selectedCamera.uuid );

	}

	return container;

}

export { ViewportControls };
