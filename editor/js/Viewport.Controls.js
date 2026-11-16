import { icon } from './Glyphs.js';
import { hasRestriction } from './ObjectRestrictions.js';
import { hasLightView } from './modeling/LightView.js';
import { UISpan, UIPanel, UISelect, UIButton } from './libs/ui.js';
import { ViewportParameters } from './Viewport.Parameters.js';

function ViewportControls( editor ) {

	const signals = editor.signals;

	const container = new UIPanel();
	container.dom.classList.add( 'viewport-controls' );
	container.setPosition( 'absolute' );
	container.setRight( '10px' );
	container.setTop( '10px' );

	function glyphSelect( select, glyph ) {

		const wrapper = new UISpan().addClass( 'viewport-glyph-select' );
		const symbol = new UISpan().addClass( 'viewport-select-symbol' );
		wrapper.add( symbol, select );
		const sync = ( name = glyph ) => {

			symbol.dom.innerHTML = icon( name );
			wrapper.dom.title = select.dom.selectedOptions[ 0 ]?.textContent || select.dom.getAttribute( 'aria-label' );

		};
		container.add( wrapper );
		return sync;

	}

	// camera

	const cameraSelect = new UISelect();
	cameraSelect.dom.setAttribute( 'aria-label', 'Viewport view' );
	cameraSelect.setMarginRight( '10px' );
	cameraSelect.onChange( function () {

		const value = this.getValue();
		if ( value.startsWith( 'light:' ) ) editor.setViewportSource( editor.objectByUuid( value.slice( 6 ) ) );
		else editor.setViewportCamera( value );

	} );
	const syncCameraGlyph = glyphSelect( cameraSelect, 'camera' );

	const split = new UIButton( 'Split view' ).onClick( () => {

		if ( ! editor.viewportSplit && ! editor.viewportSource && editor.viewportCamera === editor.camera ) {

			if ( hasLightView( editor.selected ) ) editor.setViewportSource( editor.selected );
			else if ( editor.activeSceneCamera ) editor.setViewportCamera( editor.activeSceneCamera.uuid );
			else return;

		}
		editor.setViewportSplit( ! editor.viewportSplit );

	} );
	split.dom.classList.add( 'viewport-split-button' );
	split.dom.setAttribute( 'aria-label', 'Split view' );
	split.dom.title = 'Split view';
	split.dom.innerHTML = '<span class="viewport-select-symbol">' + icon( 'viewportSplit' ) + '</span><span class="viewport-split-label">Split view</span>';
	container.add( split );
	signals.cameraAdded.add( update );
	signals.cameraRemoved.add( update );
	signals.sceneGraphChanged.add( update );
	signals.viewportCameraChanged.add( updateCameraList );
	signals.objectChanged.add( function ( object, attribute ) {

		if ( attribute === 'userData' ) {

			update();
			return;

		}

		if ( object.isCamera || hasLightView( object ) ) {

			updateCameraList();

		}

	} );

	// shading

	const shadingSelect = new UISelect();
	shadingSelect.dom.setAttribute( 'aria-label', 'Viewport shading' );
	shadingSelect.setOptions( { 'realistic': 'realistic', 'preview': 'preview', 'materials': 'materials', 'solid': 'solid', 'normals': 'normals', 'wireframe': 'wireframe' } );
	shadingSelect.setValue( 'solid' );
	shadingSelect.onChange( function () {

		editor.setViewportShading( this.getValue() );

	} );
	const parameters = new ViewportParameters( editor );
	editor.viewportParameters = parameters;
	const syncShadingGlyph = glyphSelect( shadingSelect, 'shadingSolid' );
	container.add( parameters );
	function syncShading() {

		const mode = editor.viewportShading;
		shadingSelect.setValue( mode );
		const glyph = { realistic: 'environment', preview: 'preview', materials: 'color', solid: 'shadingSolid', normals: 'shadingNormals', wireframe: 'shadingWire' }[ mode ];
		syncShadingGlyph( glyph );

	}
	signals.viewportShadingChanged.add( syncShading );
	syncShading();

	signals.editorCleared.add( function () {

		editor.viewportSplit = false;
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
			if ( ! hasRestriction( camera, 'disabled' ) ) options[ camera.uuid ] = camera.name || ( camera === editor.camera ? 'Director' : camera.type );

		}

		editor.scene.traverse( object => {

			if ( hasLightView( object ) && ! object.userData.runtimeOnly && ! hasRestriction( object, 'disabled' ) ) {
				options[ 'light:' + object.uuid ] = ( object.name || object.type ) + ' view';
			}

		} );
		cameraSelect.setOptions( options );
		const value = editor.viewportSource ? 'light:' + editor.viewportSource.uuid : editor.viewportCamera.uuid;
		cameraSelect.setValue( value in options ? value : editor.camera.uuid );
		syncCameraGlyph();
		split.dom.setAttribute( 'aria-pressed', String( editor.viewportSplit ) );
		return value in options;

	}

	function update() {

		if ( ! updateCameraList() ) editor.setViewportCamera( editor.camera.uuid );

	}

	return container;

}

export { ViewportControls };
