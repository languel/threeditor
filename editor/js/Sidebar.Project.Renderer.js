import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

import { UINumber, UIPanel, UIRow, UISelect, UIText } from './libs/ui.js';
import { UIBoolean } from './libs/ui.three.js';

function SidebarProjectRenderer( editor ) {

	const config = editor.config;
	const signals = editor.signals;
	const strings = editor.strings;

	let currentRenderer = null;
	let rendererRequest = 0;
	let appliedRendererType = config.getKey( 'project/renderer/type' );
	let appliedAntialias = config.getKey( 'project/renderer/antialias' );

	const container = new UIPanel();
	container.setBorderTop( '0px' );

	// Camera

	const cameraRow = new UIRow();
	container.add( cameraRow );

	cameraRow.add( new UIText( strings.getKey( 'sidebar/project/camera' ) ).setClass( 'Label' ) );

	const cameraTypeSelect = new UISelect().setOptions( {
		'perspective': 'Perspective',
		'orthographic': 'Orthographic'
	} ).setWidth( '150px' ).onChange( function () {

		editor.setCameraType( this.getValue() );

	} );
	cameraTypeSelect.setValue( config.getKey( 'project/camera' ) );
	cameraRow.add( cameraTypeSelect );

	if ( config.getKey( 'project/camera' ) === 'orthographic' ) {

		editor.setCameraType( 'orthographic' );

	}

	// Renderer

	const rendererRow = new UIRow();
	container.add( rendererRow );

	rendererRow.add( new UIText( strings.getKey( 'sidebar/project/renderer' ) ).setClass( 'Label' ) );

	const rendererTypeSelect = new UISelect().setOptions( {
		'WebGLRenderer': 'WebGL',
		'WebGPURenderer': 'WebGPU'
	} ).setWidth( '150px' ).onChange( createRenderer );
	rendererTypeSelect.setValue( config.getKey( 'project/renderer/type' ) );
	rendererRow.add( rendererTypeSelect );

	// Antialias

	const antialiasRow = new UIRow();
	container.add( antialiasRow );

	antialiasRow.add( new UIText( strings.getKey( 'sidebar/project/antialias' ) ).setClass( 'Label' ) );

	const antialiasBoolean = new UIBoolean( config.getKey( 'project/renderer/antialias' ) ).onChange( createRenderer );
	antialiasRow.add( antialiasBoolean );

	// Shadows

	const shadowsRow = new UIRow();
	container.add( shadowsRow );

	shadowsRow.add( new UIText( strings.getKey( 'sidebar/project/shadows' ) ).setClass( 'Label' ) );

	const shadowsBoolean = new UIBoolean( config.getKey( 'project/renderer/shadows' ) ).onChange( updateShadows );
	shadowsRow.add( shadowsBoolean );

	const shadowTypeSelect = new UISelect().setOptions( {
		0: 'Basic',
		1: 'PCF',
		3: 'VSM'
	} ).setWidth( '125px' ).onChange( updateShadows );
	shadowTypeSelect.setValue( config.getKey( 'project/renderer/shadowType' ) );
	shadowsRow.add( shadowTypeSelect );

	function updateShadows() {

		if ( currentRenderer === null ) return;
		currentRenderer.shadowMap.enabled = shadowsBoolean.getValue();
		currentRenderer.shadowMap.type = parseFloat( shadowTypeSelect.getValue() );

		signals.rendererUpdated.dispatch();

	}

	// Tonemapping

	const toneMappingRow = new UIRow();
	container.add( toneMappingRow );

	toneMappingRow.add( new UIText( strings.getKey( 'sidebar/project/toneMapping' ) ).setClass( 'Label' ) );

	const toneMappingSelect = new UISelect().setOptions( {
		0: 'No',
		1: 'Linear',
		2: 'Reinhard',
		3: 'Cineon',
		4: 'ACESFilmic',
		6: 'AgX',
		7: 'Neutral'
	} ).setWidth( '120px' ).onChange( updateToneMapping );
	toneMappingSelect.setValue( config.getKey( 'project/renderer/toneMapping' ) );
	toneMappingRow.add( toneMappingSelect );

	const toneMappingExposure = new UINumber( config.getKey( 'project/renderer/toneMappingExposure' ) );
	toneMappingExposure.setDisplay( toneMappingSelect.getValue() === '0' ? 'none' : '' );
	toneMappingExposure.setWidth( '30px' ).setMarginLeft( '10px' );
	toneMappingExposure.setRange( 0, 10 );
	toneMappingExposure.onChange( updateToneMapping );
	toneMappingRow.add( toneMappingExposure );

	function updateToneMapping() {

		toneMappingExposure.setDisplay( toneMappingSelect.getValue() === '0' ? 'none' : '' );

		if ( currentRenderer === null ) return;
		currentRenderer.toneMapping = parseFloat( toneMappingSelect.getValue() );
		currentRenderer.toneMappingExposure = toneMappingExposure.getValue();
		signals.rendererUpdated.dispatch();

	}

	//

	async function createRenderer() {

		const request = ++ rendererRequest;
		const rendererType = rendererTypeSelect.getValue();
		const antialias = antialiasBoolean.getValue();
		const options = { antialias, reversedDepthBuffer: true };
		let nextRenderer;

		try {

			nextRenderer = rendererType === 'WebGPURenderer' ? new WebGPURenderer( options ) : new THREE.WebGLRenderer( options );
			if ( nextRenderer.isWebGPURenderer ) await nextRenderer.init();

		} catch ( error ) {

			if ( request !== rendererRequest ) return;
			rendererTypeSelect.setValue( appliedRendererType );
			antialiasBoolean.setValue( appliedAntialias );
			console.error( 'Could not switch renderer.', error );
			return;

		}

		if ( request !== rendererRequest ) {

			nextRenderer.dispose();
			return;

		}

		currentRenderer = nextRenderer;
		appliedRendererType = rendererType;
		appliedAntialias = antialias;
		applySettings( currentRenderer );

		signals.rendererCreated.dispatch( currentRenderer );
		signals.rendererUpdated.dispatch();

	}

	function applySettings( renderer ) {

		renderer.shadowMap.enabled = shadowsBoolean.getValue();
		renderer.shadowMap.type = parseFloat( shadowTypeSelect.getValue() );
		renderer.toneMapping = parseFloat( toneMappingSelect.getValue() );
		renderer.toneMappingExposure = toneMappingExposure.getValue();

	}

	createRenderer();


	// Signals

	signals.cameraResetted.add( function () {

		const type = editor.camera.isOrthographicCamera ? 'orthographic' : 'perspective';

		cameraTypeSelect.setValue( type );
		config.setKey( 'project/camera', type );

	} );

	signals.editorCleared.add( function () {

		shadowsBoolean.setValue( true );
		shadowTypeSelect.setValue( THREE.PCFShadowMap );
		toneMappingSelect.setValue( THREE.NeutralToneMapping );
		toneMappingExposure.setValue( 1 );
		toneMappingExposure.setDisplay( '' );

		if ( currentRenderer === null ) return;
		applySettings( currentRenderer );
		signals.rendererUpdated.dispatch();

	} );

	signals.rendererUpdated.add( function () {

		config.setKey(
			'project/renderer/type', appliedRendererType,
			'project/renderer/antialias', appliedAntialias,
			'project/renderer/shadows', shadowsBoolean.getValue(),
			'project/renderer/shadowType', parseFloat( shadowTypeSelect.getValue() ),
			'project/renderer/toneMapping', parseFloat( toneMappingSelect.getValue() ),
			'project/renderer/toneMappingExposure', toneMappingExposure.getValue()
		);

	} );

	return container;

}

export { SidebarProjectRenderer };
