import { addTimelineKey } from './animation/TimelineKeyControl.js';
import * as THREE from 'three';

import { UIPanel, UIRow, UIColor, UISelect, UIText, UINumber, UICheckbox } from './libs/ui.js';
import { UIOutliner, UITexture } from './libs/ui.three.js';
import { SetValueCommand } from './commands/SetValueCommand.js';
import { AddObjectCommand } from './commands/AddObjectCommand.js';
import { changeParent, canParentSelection } from './ObjectParenting.js?v=editor-panes';
import { isProjector } from './assets/Projector.js';
import { ASSET_MIME } from './assets/AssetLibrary.js';
import { DEFAULT_POSTPROCESSING } from './PostProcessing.js';
import { icon } from './Glyphs.js';

const outlinerGlyphs = {
	Scene: 'M2 12l4-7 3 4 2-3 3 6zM10.5 3.5h.01',
	Light: 'M6 13h4M7 15h2M5.5 10c0-2-2-2-2-4.5a4.5 4.5 0 019 0c0 2.5-2 2.5-2 4.5z',
	Projector: 'M2 5h9v6H2zM11 6l3-2v8l-3-2M4 8h2',
	Group: 'M1.5 2.5h13v4h-13zm1 4v7h11v-7M6 9h4',
	Object3D: 'M7 2v7h7M7 9l-5 5',
	Mesh: 'M2 3h12L8 13z',
	Model: 'M2 5l6-3 6 3-6 3zM2 5v6l6 3 6-3V5M8 8v6',
	Line: 'M6 2.5c10 0 11 11-3 11',
	Shape: 'M2 12l2-8 6-2 4 6-4 5z',
	Points: 'M3 4h.01M8 2h.01M13 5h.01M7 7h.01M3 11h.01M12 11h.01M7 14h.01',
	Scan: 'M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3M5 6h.01M10 5h.01M8 8h.01M5 11h.01M11 10h.01',
	Geometry: 'M4 4h8M3.5 5l3.8 6m5.2-6-3.8 6M1.5 2.5h3v3h-3zm10 0h3v3h-3zm-5 9h3v3h-3z',
	Script: 'M6 4L2 8l4 4M10 4l4 4-4 4'
};

function glyph( type ) {

	if ( type === 'Camera' ) return icon( 'camera' );
	if ( type === 'Material' ) return icon( 'shadingMaterial' );
	return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ outlinerGlyphs[ type ] }"/></svg>`;

}

function SidebarScene( editor, revealScene ) {

	const signals = editor.signals;
	const strings = editor.strings;

	const container = new UIPanel();
	container.dom.classList.add( 'scene-properties' );
	const outlinerArea = document.createElement( 'section' );
	outlinerArea.className = 'sidebar-outliner';
	outlinerArea.setAttribute( 'aria-label', 'Outliner' );
	const header = document.createElement( 'div' );
	header.className = 'sidebar-area-header';
	const title = document.createElement( 'span' );
	title.textContent = 'Outliner';
	const search = document.createElement( 'input' );
	search.type = 'search';
	search.className = 'Input';
	search.placeholder = 'Search';
	search.setAttribute( 'aria-label', 'Search Outliner' );
	header.append( title, search );
	outlinerArea.append( header );

	// outliner

	const nodeStates = new WeakMap();

	function buildOption( object, draggable, filtering = false ) {

		const option = document.createElement( 'div' );
		option.draggable = draggable;
		option.innerHTML = buildHTML( object );
		addRestrictions( option, object );
		option.value = object.id;
		option.setAttribute( 'aria-level', '1' );
		if ( object.material || isProjector( object ) ) {

			option.addEventListener( 'dragover', event => {

				if ( ! event.dataTransfer.types.includes( ASSET_MIME ) ) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				event.dataTransfer.dropEffect = 'copy';

			} );
			option.addEventListener( 'drop', event => {

				const id = event.dataTransfer.getData( ASSET_MIME );
				if ( ! id ) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				const browser = editor.assetBrowser;
				browser.cancelPicker();
				browser.run( () => event.altKey ? browser.use( id, { mode: 'plane' } ) : browser.applyToObject( id, object ) );

			} );

		}
		option.addEventListener( 'click', event => {

			if ( ! event.target.closest( '.Script' ) ) return;
			event.stopPropagation();
			const scripts = editor.scripts[ object.uuid ] || [];
			const script = scripts.find( item => ! item.generated ) || scripts[ 0 ];
			if ( ! script ) return;
			editor.codePanel.toggleScript( object, script );

		} );
		option.addEventListener( 'contextmenu', event => {

			event.preventDefault();
			event.stopPropagation();
			if ( ! editor.selector.selection.includes( object ) ) editor.select( object );
			openOutlinerMenu( event, object );

		} );

		// opener

		if ( nodeStates.has( object ) ) {

			const state = filtering || nodeStates.get( object );

			const opener = document.createElement( 'span' );
			opener.classList.add( 'opener' );

			if ( object.children.some( child => ! child.userData?.runtimeOnly ) ) {

				option.setAttribute( 'aria-expanded', String( state ) );
				opener.classList.add( state ? 'open' : 'closed' );
				if ( ! filtering ) opener.addEventListener( 'click', function ( event ) {

					event.stopPropagation();
					nodeStates.set( object, ! state );
					refreshOutliner();

				} );

			}

			option.insertBefore( opener, option.firstChild );

		}

		return option;

	}


	function addRestrictions( option, object ) {

		const controls = document.createElement( 'span' );
		controls.className = 'outliner-restrictions';
		const name = object.name || getObjectType( object );
		const flags = object.userData?.threeditor || {};
		const viewport = editor.viewportVisibility;
		const hiddenHere = viewport.hidden.has( object.uuid );
		option.classList.toggle( 'viewport-hidden', ! viewport.allows( object ) );
		const items = [
			...( object === editor.camera ? [] : [ { key: 'disabled', on: ! flags.disabled, label: flags.disabled ? 'Enable' : 'Disable', svg: '<path d="M8 1v7M5 3a5.5 5.5 0 106 0"/>' } ] ),
			{ key: 'visible', on: object.visible && ! hiddenHere, label: hiddenHere ? 'Show in viewport' : object.visible ? 'Hide' : 'Show',
				svg: object.visible && ! hiddenHere ? '<path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/>' : '<path d="M1 6c4 5 10 5 14 0M4 9l-1 2m5-1v3m4-4 1 2"/>' },
			{ key: 'unselectable', on: ! flags.unselectable, label: flags.unselectable ? 'Enable viewport selection for' : 'Disable viewport selection for', svg: '<path d="M3 2l9 7-4 1-2 4z"/>' },
			{ key: 'locked', on: ! flags.locked, label: flags.locked ? 'Unlock transforms for' : 'Lock transforms for', svg: flags.locked ? '<rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 016 0v2"/>' : '<rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 015-2"/>' }
		];
		for ( const item of items ) {

			const button = document.createElement( 'button' );
			button.type = 'button';
			button.className = 'outliner-restriction';
			button.title = item.label + ' ' + name;
			button.setAttribute( 'aria-label', button.title );
			button.setAttribute( 'aria-pressed', String( item.on ) );
			button.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4">${ item.svg }</svg>`;
			button.addEventListener( 'pointerdown', event => event.stopPropagation() );
			button.addEventListener( 'dblclick', event => event.stopPropagation() );
			button.addEventListener( 'click', event => {

				event.stopPropagation();
				let command;
				if ( item.key === 'visible' && hiddenHere ) {

					const hidden = new Set( viewport.hidden );
					hidden.delete( object.uuid );
					viewport.changeHidden( 'Show in viewport', hidden );
					return;

				}
				if ( item.key === 'visible' ) command = new SetValueCommand( editor, object, 'visible', ! object.visible );
				else {

					const data = { ...object.userData, threeditor: { ...object.userData?.threeditor, [ item.key ]: ! object.userData?.threeditor?.[ item.key ] } };
					command = new SetValueCommand( editor, object, 'userData', data );

				}
				command.updatable = false;
				editor.execute( command );

			} );
			controls.appendChild( button );

		}
		option.appendChild( controls );

	}

	function getMaterialName( material ) {

		if ( Array.isArray( material ) ) {

			const array = [];

			for ( let i = 0; i < material.length; i ++ ) {

				array.push( material[ i ].name );

			}

			return array.join( ',' );

		}

		return material.name;

	}

	function escapeHTML( html ) {

		return html
			.replace( /&/g, '&amp;' )
			.replace( /"/g, '&quot;' )
			.replace( /'/g, '&#39;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' );

	}

	function getObjectType( object ) {

		const assetType = object.userData.assetObject?.type;
		const kind = object.geometry?.userData.modeling?.kind;
		if ( isProjector( object ) ) return 'Projector';
		if ( assetType === 'gaussian-splat' ) return 'Scan';
		if ( assetType === 'model' ) return 'Model';
		if ( object.isScene ) return 'Scene';
		if ( object.isCamera ) return 'Camera';
		if ( object.isLight ) return 'Light';
		if ( kind === 'shape' ) return 'Shape';
		if ( object.isMesh ) return 'Mesh';
		if ( object.isLine ) return 'Line';
		if ( object.isPoints ) return 'Points';
		if ( object.isGroup ) return 'Group';

		return 'Object3D';

	}

	function buildHTML( object ) {

		const type = getObjectType( object );
		let html = `<span class="type ${ type }" title="${ type === 'Line' ? 'Line or curve' : type }">${ glyph( type ) }</span> ${ escapeHTML( object.name ) }`;

		if ( object.isMesh ) {

			const geometry = object.geometry;
			const material = object.material;

			const materialName = getMaterialName( material );
			if ( geometry.name ) html += ` <span class="type Geometry" title="Geometry">${ glyph( 'Geometry' ) }</span> ${ escapeHTML( geometry.name ) }`;
			if ( materialName ) html += ` <span class="type Material" title="Material">${ glyph( 'Material' ) }</span> ${ escapeHTML( materialName ) }`;

		}

		if ( object === editor.mainCameraSource ) html += ' <span class="main-camera-glyph" title="Main camera for Play and export" aria-label="Main camera">★</span>';
		html += getScript( object.uuid );

		return html;

	}

	function getScript( uuid ) {

		if ( editor.scripts[ uuid ] === undefined ) return '';

		if ( editor.scripts[ uuid ].length === 0 ) return '';

		return ` <button type="button" class="type Script" aria-label="Toggle script" title="Toggle Script Window" aria-controls="editor-2d">${ glyph( 'Script' ) }</button>`;

	}

	let ignoreObjectSelectedSignal = false;

	const outliner = new UIOutliner( editor );
	outliner.setId( 'outliner' );
	function openOutlinerMenu( event, object = editor.scene ) {

		const parent = object?.isGroup || object === editor.scene ? object : object?.parent || editor.scene;
		const add = collection => {

			const child = collection ? new THREE.Group() : new THREE.Object3D();
			child.name = collection ? 'Collection' : 'Empty';
			editor.execute( new AddObjectCommand( editor, child, parent ) );

		};
		editor.contextMenu?.show( 'Outliner', [
			{ label: 'New Collection', section: 'Add', run: () => add( true ) },
			{ label: 'New Empty', section: 'Add', run: () => add( false ) },
			{ label: 'Set Parent · Keep Transform', section: 'Hierarchy', disabled: ! canParentSelection( editor, false ), run: () => changeParent( editor, false, 'keepWorld' ) },
			{ label: 'Clear Parent · Keep Transform', section: 'Hierarchy', disabled: ! canParentSelection( editor, true ), run: () => changeParent( editor, true, 'keepWorld' ) }
		], { x: event.clientX, y: event.clientY } );

	}
	outliner.dom.addEventListener( 'contextmenu', event => {

		if ( event.target.closest( '.option' ) ) return;
		event.preventDefault();
		openOutlinerMenu( event );

	} );
	outliner.onChange( function ( event ) {

		const id = parseInt( outliner.getValue() );
		if ( id === editor.scene.id ) revealScene();

		if ( event.shiftKey === true && editor.selector.selection.length > 0 && editor.selected !== editor.scene && editor.selected !== editor.camera ) {

			const object = ( id === editor.camera.id ) ? editor.camera : editor.scene.getObjectById( id );

			// scene and main camera can't be part of a group selection

			if ( object && object !== editor.scene && object !== editor.camera ) {

				editor.selector.toggle( object, editor.keymap.preset === 'blender' );
				return;

			}

		}

		ignoreObjectSelectedSignal = true;

		editor.selectById( id );

		ignoreObjectSelectedSignal = false;

	} );
	outliner.onDblClick( function () {

		editor.focusById( parseInt( outliner.getValue() ) );

	} );
	outlinerArea.append( outliner.dom );
	search.addEventListener( 'input', refreshOutliner );

	// background

	const backgroundRow = new UIRow();

	const backgroundType = new UISelect().setOptions( {

		'Default': 'Default',
		'Color': 'Color',
		'Texture': 'Texture',
		'Equirectangular': 'Equirect'

	} ).setWidth( '150px' );
	backgroundType.setValue( 'Default' );
	backgroundType.onChange( function () {

		onBackgroundChanged();
		refreshBackgroundUI();

	} );

	const backgroundLabel = strings.getKey( 'sidebar/scene/background' );
	backgroundType.dom.setAttribute( 'aria-label', backgroundLabel );
	backgroundRow.add( new UIText( backgroundLabel ).setClass( 'Label' ) );
	backgroundRow.add( backgroundType );

	const backgroundColor = new UIColor().setValue( '#000000' ).setMarginLeft( '8px' ).onInput( onBackgroundChanged );
	backgroundRow.add( backgroundColor );

	const backgroundTexture = new UITexture( editor ).setMarginLeft( '8px' ).onChange( onBackgroundChanged );
	backgroundTexture.setDisplay( 'none' );
	backgroundRow.add( backgroundTexture );

	const backgroundEquirectangularTexture = new UITexture( editor ).setMarginLeft( '8px' ).onChange( onBackgroundChanged );
	backgroundEquirectangularTexture.setDisplay( 'none' );
	backgroundRow.add( backgroundEquirectangularTexture );

	const backgroundColorSpaceRow = new UIRow();
	backgroundColorSpaceRow.setDisplay( 'none' );
	backgroundColorSpaceRow.setMarginLeft( '120px' );

	const backgroundColorSpace = new UISelect().setOptions( {

		[ THREE.NoColorSpace ]: 'No Color Space',
		[ THREE.LinearSRGBColorSpace ]: 'srgb-linear',
		[ THREE.SRGBColorSpace ]: 'srgb',

	} ).setWidth( '150px' );
	backgroundColorSpace.setValue( THREE.NoColorSpace );
	backgroundColorSpace.onChange( onBackgroundChanged );
	backgroundColorSpaceRow.add( backgroundColorSpace );

	container.add( backgroundRow );
	container.add( backgroundColorSpaceRow );

	const backgroundEquirectRow = new UIRow();
	backgroundEquirectRow.setDisplay( 'none' );
	backgroundEquirectRow.setMarginLeft( '120px' );

	const backgroundBlurriness = new UINumber( 0 ).setWidth( '40px' ).setRange( 0, 1 ).onChange( onBackgroundChanged );
	backgroundEquirectRow.add( backgroundBlurriness );

	const backgroundIntensity = new UINumber( 1 ).setWidth( '40px' ).setRange( 0, Infinity ).onChange( onBackgroundChanged );
	backgroundEquirectRow.add( backgroundIntensity );

	const backgroundRotation = new UINumber( 0 ).setWidth( '40px' ).setRange( - 180, 180 ).setStep( 10 ).setNudge( 0.1 ).setUnit( '°' ).onChange( onBackgroundChanged );
	backgroundEquirectRow.add( backgroundRotation );

	container.add( backgroundEquirectRow );

	function onBackgroundChanged() {

		signals.sceneBackgroundChanged.dispatch(
			backgroundType.getValue(),
			backgroundColor.getHexValue(),
			backgroundTexture.getValue(),
			backgroundEquirectangularTexture.getValue(),
			backgroundColorSpace.getValue(),
			backgroundBlurriness.getValue(),
			backgroundIntensity.getValue(),
			backgroundRotation.getValue()
		);

	}

	function refreshBackgroundUI() {

		const type = backgroundType.getValue();

		backgroundType.setWidth( type === 'Default' ? '150px' : '110px' );
		backgroundColor.setDisplay( type === 'Color' ? '' : 'none' );
		backgroundTexture.setDisplay( type === 'Texture' ? '' : 'none' );
		backgroundEquirectangularTexture.setDisplay( type === 'Equirectangular' ? '' : 'none' );
		backgroundEquirectRow.setDisplay( type === 'Equirectangular' ? '' : 'none' );

		if ( type === 'Texture' || type === 'Equirectangular' ) {

			backgroundColorSpaceRow.setDisplay( '' );

		} else {

			backgroundColorSpaceRow.setDisplay( 'none' );

		}

	}

	// environment

	const environmentRow = new UIRow();

	const environmentType = new UISelect().setOptions( {

		'Default': 'Default',
		'Equirectangular': 'Equirect',
		'None': 'None'

	} ).setWidth( '150px' );
	environmentType.setValue( 'Default' );
	environmentType.onChange( function () {

		onEnvironmentChanged();
		refreshEnvironmentUI();

	} );

	const environmentLabel = strings.getKey( 'sidebar/scene/environment' );
	environmentType.dom.setAttribute( 'aria-label', environmentLabel );
	environmentRow.add( new UIText( environmentLabel ).setClass( 'Label' ) );
	environmentRow.add( environmentType );

	const environmentEquirectangularTexture = new UITexture( editor ).setMarginLeft( '8px' ).onChange( onEnvironmentChanged );
	environmentEquirectangularTexture.setDisplay( 'none' );
	environmentRow.add( environmentEquirectangularTexture );

	container.add( environmentRow );

	function onEnvironmentChanged() {

		signals.sceneEnvironmentChanged.dispatch(
			environmentType.getValue(),
			environmentEquirectangularTexture.getValue()
		);

	}

	function refreshEnvironmentUI() {

		const type = environmentType.getValue();

		environmentType.setWidth( type !== 'Equirectangular' ? '150px' : '110px' );
		environmentEquirectangularTexture.setDisplay( type === 'Equirectangular' ? '' : 'none' );

	}

	// fog

	function onFogChanged() {

		signals.sceneFogChanged.dispatch(
			fogType.getValue(),
			fogColor.getHexValue(),
			fogNear.getValue(),
			fogFar.getValue(),
			fogDensity.getValue()
		);

	}

	function onFogSettingsChanged() {

		signals.sceneFogSettingsChanged.dispatch(
			fogType.getValue(),
			fogColor.getHexValue(),
			fogNear.getValue(),
			fogFar.getValue(),
			fogDensity.getValue()
		);

	}

	const fogTypeRow = new UIRow();
	const fogType = new UISelect().setOptions( {

		'None': 'None',
		'Fog': 'Linear',
		'FogExp2': 'Exponential'

	} ).setWidth( '150px' );
	fogType.onChange( function () {

		onFogChanged();
		refreshFogUI();

	} );

	const fogLabel = strings.getKey( 'sidebar/scene/fog' );
	fogType.dom.setAttribute( 'aria-label', fogLabel );
	fogTypeRow.add( new UIText( fogLabel ).setClass( 'Label' ) );
	fogTypeRow.add( fogType );

	container.add( fogTypeRow );

	// fog color

	const fogPropertiesRow = new UIRow();
	fogPropertiesRow.setDisplay( 'none' );
	fogPropertiesRow.setMarginLeft( '120px' );
	container.add( fogPropertiesRow );

	const fogColor = new UIColor().setValue( '#aaaaaa' );
	fogColor.onInput( onFogSettingsChanged );
	fogPropertiesRow.add( fogColor );

	// fog near

	const fogNear = new UINumber( 0.1 ).setWidth( '40px' ).setRange( 0, Infinity ).onChange( onFogSettingsChanged );
	fogPropertiesRow.add( fogNear );

	// fog far

	const fogFar = new UINumber( 50 ).setWidth( '40px' ).setRange( 0, Infinity ).onChange( onFogSettingsChanged );
	fogPropertiesRow.add( fogFar );

	// fog density

	const fogDensity = new UINumber( 0.05 ).setWidth( '40px' ).setRange( 0, 0.1 ).setStep( 0.001 ).setPrecision( 3 ).onChange( onFogSettingsChanged );
	fogPropertiesRow.add( fogDensity );

	// post-processing: bloom & focus (depth of field)

	function updatePostProcessing() {

		const next = {
			...DEFAULT_POSTPROCESSING,
			...( editor.scene.userData.postprocessing || {} ),
			bloom: bloomEnabled.getValue(),
			bloomStrength: bloomStrength.getValue(),
			bloomRadius: bloomRadius.getValue(),
			bloomThreshold: bloomThreshold.getValue(),
			dof: dofEnabled.getValue(),
			focus: dofFocus.getValue(),
			aperture: dofAperture.getValue(),
			maxblur: dofMaxBlur.getValue()
		};
		const command = new SetValueCommand( editor, editor.scene, 'userData', { ...editor.scene.userData, postprocessing: next } );
		command.updatable = false;
		editor.execute( command );

	}

	const bloomRow = new UIRow();
	bloomRow.add( new UIText( 'Bloom' ).setClass( 'Label' ) );
	const bloomEnabled = new UICheckbox( false ).onChange( updatePostProcessing );
	bloomEnabled.dom.setAttribute( 'aria-label', 'Bloom' );
	bloomRow.add( bloomEnabled );
	const bloomStrength = new UINumber( DEFAULT_POSTPROCESSING.bloomStrength ).setWidth( '40px' ).setRange( 0, 5 ).setStep( 0.05 ).onChange( updatePostProcessing );
	const bloomRadius = new UINumber( DEFAULT_POSTPROCESSING.bloomRadius ).setWidth( '40px' ).setRange( 0, 2 ).setStep( 0.05 ).onChange( updatePostProcessing );
	const bloomThreshold = new UINumber( DEFAULT_POSTPROCESSING.bloomThreshold ).setWidth( '40px' ).setRange( 0, 2 ).setStep( 0.05 ).onChange( updatePostProcessing );
	bloomStrength.dom.title = 'Bloom strength'; bloomRadius.dom.title = 'Bloom radius'; bloomThreshold.dom.title = 'Bloom threshold';
	bloomRow.add( bloomStrength, bloomRadius, bloomThreshold );
	container.add( bloomRow );

	const dofRow = new UIRow();
	dofRow.add( new UIText( 'Focus' ).setClass( 'Label' ) );
	const dofEnabled = new UICheckbox( false ).onChange( updatePostProcessing );
	dofEnabled.dom.setAttribute( 'aria-label', 'Focus' );
	dofRow.add( dofEnabled );
	const dofFocus = new UINumber( DEFAULT_POSTPROCESSING.focus ).setWidth( '40px' ).setRange( 0.1, 1000 ).setStep( 0.1 ).onChange( updatePostProcessing );
	const dofAperture = new UINumber( DEFAULT_POSTPROCESSING.aperture ).setWidth( '48px' ).setRange( 0, 0.05 ).setStep( 0.0005 ).setPrecision( 4 ).onChange( updatePostProcessing );
	const dofMaxBlur = new UINumber( DEFAULT_POSTPROCESSING.maxblur ).setWidth( '44px' ).setRange( 0, 0.05 ).setStep( 0.001 ).setPrecision( 3 ).onChange( updatePostProcessing );
	dofFocus.dom.title = 'Focus distance'; dofAperture.dom.title = 'Aperture'; dofMaxBlur.dom.title = 'Max blur';
	dofRow.add( dofFocus, dofAperture, dofMaxBlur );
	container.add( dofRow );

	//

	for ( const [ field, kind, property, title, anchor = field ] of [
		[ backgroundColor, 'object', 'background', 'Background color' ],
		[ backgroundBlurriness, 'object', 'backgroundBlurriness', 'Background blur' ],
		[ backgroundIntensity, 'object', 'backgroundIntensity', 'Background intensity' ],
		[ fogColor, 'fog', 'color', 'Fog color' ], [ fogNear, 'fog', 'near', 'Fog near' ],
		[ fogFar, 'fog', 'far', 'Fog far' ], [ fogDensity, 'fog', 'density', 'Fog density' ],
		[ bloomEnabled, 'effect', 'bloom', 'Bloom', { dom: bloomRow.dom.firstElementChild } ],
		[ bloomStrength, 'effect', 'bloomStrength', 'Bloom strength' ],
		[ bloomRadius, 'effect', 'bloomRadius', 'Bloom radius' ], [ bloomThreshold, 'effect', 'bloomThreshold', 'Bloom threshold' ],
		[ dofEnabled, 'effect', 'dof', 'Focus', { dom: dofRow.dom.firstElementChild } ],
		[ dofFocus, 'effect', 'focus', 'Focus distance' ], [ dofAperture, 'effect', 'aperture', 'Aperture' ],
		[ dofMaxBlur, 'effect', 'maxblur', 'Maximum blur' ]
	] ) addTimelineKey( editor, anchor, title, () => ( { object: editor.scene.uuid, kind, property, label: title } ),
		{ field, display: value => field.setValue( value ) } );

	addTimelineKey( editor, backgroundRotation, 'Background rotation', () => ( {
		object: editor.scene.uuid, kind: 'object', property: 'backgroundRotation', label: 'Background rotation'
	} ), { display: value => backgroundRotation.setValue( value[ 1 ] * THREE.MathUtils.RAD2DEG ) } );

	function refreshOutliner() {

		const camera = editor.camera;
		const scene = editor.scene;
		const query = search.value.trim().toLowerCase();
		const matches = new Set();
		function match( object ) {

			if ( object.userData?.runtimeOnly ) return false;
			const childMatches = object.children.map( match ).some( Boolean );
			if ( ! childMatches && ! [ object.name, getObjectType( object ) ].some( name => name.toLowerCase().includes( query ) ) ) return false;
			matches.add( object );
			return true;

		}
		if ( query ) { match( camera ); match( scene ); }
		if ( ! nodeStates.has( scene ) ) nodeStates.set( scene, true );
		const options = [ camera, scene ].filter( object => ! query || matches.has( object ) ).map( object => buildOption( object, false, Boolean( query ) ) );

		( function addObjects( objects, pad ) {

			for ( let i = 0, l = objects.length; i < l; i ++ ) {

				const object = objects[ i ];
				if ( object.userData?.runtimeOnly || query && ! matches.has( object ) ) continue;

				if ( nodeStates.has( object ) === false ) {

					nodeStates.set( object, false );

				}

				const option = buildOption( object, true, Boolean( query ) );
				option.style.paddingLeft = ( pad * 18 ) + 'px';
				option.setAttribute( 'aria-level', String( pad + 2 ) );
				options.push( option );

				if ( query || nodeStates.get( object ) === true ) {

					addObjects( object.children, pad + 1 );

				}

			}

		} )( query || nodeStates.get( scene ) ? scene.children : [], 0 );

		outliner.setOptions( options );

		outliner.setValues( editor.selector.selection.map( object => object.id ), editor.selected?.id );

	}

	function refreshUI() {

		refreshOutliner();
		const scene = editor.scene;
		backgroundType.setValue( editor.backgroundType );

		switch ( editor.backgroundType ) {

			case 'Color':
				backgroundColor.setHexValue( scene.background.getHex() );
				break;

			case 'Texture':
				backgroundTexture.setValue( scene.background );
				backgroundColorSpace.setValue( scene.background.colorSpace );
				break;

			case 'Equirectangular':
				backgroundEquirectangularTexture.setValue( scene.background );
				backgroundBlurriness.setValue( scene.backgroundBlurriness );
				backgroundIntensity.setValue( scene.backgroundIntensity );
				backgroundColorSpace.setValue( scene.background.colorSpace );
				break;

			default:
				backgroundTexture.setValue( null );
				backgroundEquirectangularTexture.setValue( null );
				backgroundColorSpace.setValue( THREE.NoColorSpace );

		}

		environmentType.setValue( editor.environmentType );

		if ( editor.environmentType === 'Equirectangular' ) {

			environmentEquirectangularTexture.setValue( scene.environment );

		} else {

			environmentEquirectangularTexture.setValue( null );

		}

		if ( scene.fog ) {

			fogColor.setHexValue( scene.fog.color.getHex() );

			if ( scene.fog.isFog ) {

				fogType.setValue( 'Fog' );
				fogNear.setValue( scene.fog.near );
				fogFar.setValue( scene.fog.far );

			} else if ( scene.fog.isFogExp2 ) {

				fogType.setValue( 'FogExp2' );
				fogDensity.setValue( scene.fog.density );

			}

		} else {

			fogType.setValue( 'None' );

		}

		refreshBackgroundUI();
		refreshEnvironmentUI();
		refreshFogUI();

		const pp = { ...DEFAULT_POSTPROCESSING, ...( scene.userData.postprocessing || {} ) };
		bloomEnabled.setValue( Boolean( pp.bloom ) );
		bloomStrength.setValue( pp.bloomStrength );
		bloomRadius.setValue( pp.bloomRadius );
		bloomThreshold.setValue( pp.bloomThreshold );
		bloomStrength.setDisplay( pp.bloom ? '' : 'none' );
		bloomRadius.setDisplay( pp.bloom ? '' : 'none' );
		bloomThreshold.setDisplay( pp.bloom ? '' : 'none' );
		dofEnabled.setValue( Boolean( pp.dof ) );
		dofFocus.setValue( pp.focus );
		dofAperture.setValue( pp.aperture );
		dofMaxBlur.setValue( pp.maxblur );
		dofFocus.setDisplay( pp.dof ? '' : 'none' );
		dofAperture.setDisplay( pp.dof ? '' : 'none' );
		dofMaxBlur.setDisplay( pp.dof ? '' : 'none' );

	}

	function refreshFogUI() {

		const type = fogType.getValue();

		fogPropertiesRow.setDisplay( type === 'None' ? 'none' : '' );
		fogNear.setDisplay( type === 'Fog' ? '' : 'none' );
		fogFar.setDisplay( type === 'Fog' ? '' : 'none' );
		fogDensity.setDisplay( type === 'FogExp2' ? '' : 'none' );

	}

	refreshUI();

	// events

	signals.editorCleared.add( refreshUI );

	signals.sceneGraphChanged.add( refreshUI );

	signals.cameraResetted.add( refreshUI );
	signals.projectLoaded.add( refreshUI );
	signals.viewportVisibilityChanged.add( refreshUI );

	signals.objectChanged.add( function ( object, attribute ) {

		if ( attribute === 'userData' ) {

			refreshUI();
			return;

		}
		const options = outliner.options;

		for ( let i = 0; i < options.length; i ++ ) {

			const option = options[ i ];

			if ( option.value === object.id ) {

				const openerElement = option.querySelector( ':scope > .opener' );

				option.innerHTML = buildHTML( object );
				addRestrictions( option, object );

				if ( openerElement !== null ) option.insertBefore( openerElement, option.firstChild );

				return;

			}

		}

	} );

	signals.scriptAdded.add( function () {

		if ( editor.selected !== null ) signals.objectChanged.dispatch( editor.selected );

	} );

	signals.scriptRemoved.add( function () {

		if ( editor.selected !== null ) signals.objectChanged.dispatch( editor.selected );

	} );


	function expandAncestors( object ) {

		let needsRefresh = false;
		let parent = object.parent;

		while ( parent && parent !== editor.scene ) {

			if ( nodeStates.get( parent ) !== true ) {

				nodeStates.set( parent, true );
				needsRefresh = true;

			}

			parent = parent.parent;

		}

		return needsRefresh;

	}

	signals.objectSelected.add( function ( object ) {

		if ( ignoreObjectSelectedSignal === true ) return;

		const selection = editor.selector.selection;

		if ( selection.length > 1 ) {

			// highlight all members of a group selection

			let needsRefresh = false;

			const values = [];

			for ( let i = 0; i < selection.length; i ++ ) {

				values.push( selection[ i ].id );
				needsRefresh = expandAncestors( selection[ i ] ) || needsRefresh;

			}

			if ( needsRefresh ) refreshUI();

			outliner.setValues( values );

		} else if ( object !== null && object.parent !== null ) {

			if ( expandAncestors( object ) ) refreshUI();

			outliner.setValue( object.id );

		} else {

			outliner.setValue( null );

		}

	} );

	signals.sceneBackgroundChanged.add( function () {

		if ( environmentType.getValue() === 'Background' ) {

			onEnvironmentChanged();
			refreshEnvironmentUI();

		}

	} );

	return { outlinerArea, settings: container };

}

export { SidebarScene };
