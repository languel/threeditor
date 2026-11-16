import { withViewportShading } from './ViewportShading.js';
import * as THREE from 'three';
import { PMREMGenerator } from 'three/webgpu';

import { TransformControls } from 'three/addons/controls/TransformControls.js';

import { UIPanel } from './libs/ui.js';

import { EditorControls } from './EditorControls.js?v=camera-playback';

import { ViewportLabels } from './Viewport.Labels.js';
import { ViewportControls } from './Viewport.Controls.js';
import { FlyControls } from './FlyControls.js';
import { hasRestriction, isVisible, withEnabledObjects } from './ObjectRestrictions.js';
import { ViewportInfo } from './Viewport.Info.js';

import { ViewHelper } from './Viewport.ViewHelper.js';
import { XR } from './Viewport.XR.js';

import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import { SetScaleCommand } from './commands/SetScaleCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';

import { ColorEnvironment } from 'three/addons/environments/ColorEnvironment.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ViewportPathtracer } from './Viewport.Pathtracer.js';
import { SplatHost } from './assets/SplatHost.js';
import { ViewportTools } from './modeling/ViewportTools.js';
import { ViewLayout } from './modeling/ViewLayout.js';
import { ModelViewport } from './modeling/ModelViewport.js';
import { PostProcessingHost } from './PostProcessing.js';

function Viewport( editor ) {

	const selector = editor.selector;
	const signals = editor.signals;

	const container = new UIPanel();
	container.setId( 'viewport' );
	container.setPosition( 'absolute' );

	container.add( new ViewportControls( editor ) );
	container.add( new ViewportInfo( editor ) );

	// Shown when the GPU drops the WebGL context so the viewport
	// never fails silently with a dark screen.

	const contextNotice = document.createElement( 'div' );
	contextNotice.className = 'viewport-context-notice';
	contextNotice.hidden = true;
	const contextText = document.createElement( 'span' );
	contextText.textContent = 'Graphics context lost.';
	contextNotice.appendChild( contextText );
	const contextReload = document.createElement( 'button' );
	contextReload.type = 'button';
	contextReload.className = 'Button';
	contextReload.textContent = 'Restore';
	contextReload.addEventListener( 'click', () => signals.rendererReset.dispatch() );
	contextNotice.appendChild( contextReload );
	container.dom.appendChild( contextNotice );

	//

	let renderer = null;
	const layout = editor.viewLayout = new ViewLayout( editor, container.dom );
	const labels = new ViewportLabels( editor, container.dom );
	signals.viewportLabelsChanged.add( render );
	editor.modeling = new ModelViewport( editor, container.dom, render );
	editor.viewTools = new ViewportTools( editor, container.dom, layout, render );
	const splatHost = new SplatHost();
	let secondarySplats = null;
	const postHost = new PostProcessingHost();
	let splatRenderQueued = false;
	const queueSplatRender = () => {

		if ( splatRenderQueued ) return;
		splatRenderQueued = true;
		requestAnimationFrame( () => {

			splatRenderQueued = false;
			if ( editor.viewportShading !== 'realistic' || editor.viewportSplit || editor.viewportSource ) render();

		} );

	};
	let contextRetries = 0;
	let pmremGenerator = null;
	let environmentTarget = null;
	let pathtracer = null;
	let helperAppearance = { cameraHelpers: true, lightHelpers: true, skeletonHelpers: true };

	function updateHelperVisibility() {

		for ( const id in editor.helpers ) {

			const helper = editor.helpers[ id ];
			const object = editor.scene.getObjectById( Number( id ) );
			if ( ! object ) continue;
			const enabled = helper.type === 'CameraHelper' ? helperAppearance.cameraHelpers : helper.isSkeletonHelper ? helperAppearance.skeletonHelpers : helperAppearance.lightHelpers;
			helper.visible = enabled && isVisible( object );

		}

	}

	let camera = editor.camera;
	const scene = editor.scene;
	const sceneHelpers = editor.sceneHelpers;

	// helpers

	const GRID_COLORS_LIGHT = [ 0x999999, 0x777777 ];
	const GRID_COLORS_DARK = [ 0x555555, 0x888888 ];

	const grid = new THREE.Group();

	const grid1 = new THREE.GridHelper( 30, 30 );
	grid1.material.color.setHex( GRID_COLORS_LIGHT[ 0 ] );
	grid1.material.vertexColors = false;
	grid.add( grid1 );

	const grid2 = new THREE.GridHelper( 30, 6 );
	grid2.material.color.setHex( GRID_COLORS_LIGHT[ 1 ] );
	grid2.material.vertexColors = false;
	grid.add( grid2 );

	const viewHelper = new ViewHelper( camera, container );

	//

	const box = new THREE.Box3();

	const selectionBox = new THREE.Box3Helper( box );
	selectionBox.material.depthTest = false;
	selectionBox.material.transparent = true;
	selectionBox.visible = false;
	sceneHelpers.add( selectionBox );

	let objectStatesOnDown = [];

	const transformControls = new TransformControls( camera );
	transformControls.setSize( editor.config.getKey( 'settings/transformGizmoSize' ) );
	signals.transformGizmoSizeChanged.add( () => {

		transformControls.setSize( editor.config.getKey( 'settings/transformGizmoSize' ) );
		render();

	} );
	let translationSnap = null;
	let snapHeld = false, groundHeld = false;
	// Ctrl snaps to the grid; Ctrl+Shift drops the lowest point onto the ground plane (y = 0) instead.
	function setControlSnap( held, ground = false ) {

		snapHeld = held && ! ground;
		groundHeld = held && ground;
		transformControls.setTranslationSnap( snapHeld ? translationSnap ?? 1 : translationSnap );
		transformControls.setRotationSnap( snapHeld ? Math.PI / 12 : null );
		transformControls.setScaleSnap( snapHeld ? 0.1 : null );

	}

	const groundBox = new THREE.Box3(), groundDelta = new THREE.Vector3();
	function dropToGround() {

		const object = transformControls.object;
		if ( ! groundHeld || ! object || transformControls.mode !== 'translate' ) return;
		if ( object === selector.group ) selector.getSelectionBox( groundBox ); else groundBox.setFromObject( object );
		if ( groundBox.isEmpty() || ! Number.isFinite( groundBox.min.y ) ) return;
		groundDelta.set( 0, - groundBox.min.y, 0 );
		if ( object.parent ) {

			object.parent.updateWorldMatrix( true, false );
			const world = object.getWorldPosition( new THREE.Vector3() ).add( groundDelta );
			object.position.copy( object.parent.worldToLocal( world ) );

		} else object.position.add( groundDelta );
		object.updateMatrixWorld( true );

	}

	// Track modifiers from the window so Ctrl works even when pressed mid-drag, without pointer movement, or outside the viewport.
	const updateSnap = event => { if ( transformControls.dragging ) setControlSnap( event.ctrlKey, event.shiftKey ); };
	container.dom.addEventListener( 'pointerdown', event => {

		if ( event.button === 0 || event.ctrlKey ) setControlSnap( event.ctrlKey, event.shiftKey );

	}, true );
	window.addEventListener( 'pointermove', updateSnap, true );
	window.addEventListener( 'keydown', updateSnap, true );
	window.addEventListener( 'keyup', updateSnap, true );
	window.addEventListener( 'blur', () => setControlSnap( false ) );
	container.dom.addEventListener( 'pointercancel', () => setControlSnap( false ), true );
	container.dom.addEventListener( 'contextmenu', event => {

		if ( ! transformControls.dragging ) return;
		event.preventDefault();
		event.stopPropagation();

	}, true );
	transformControls.addEventListener( 'axis-changed', function () {

		if ( editor.viewportShading !== 'realistic' || editor.viewportSplit || editor.viewportSource ) render();

	} );
	transformControls.addEventListener( 'objectChange', function () {

		dropToGround();
		signals.objectChanged.dispatch( transformControls.object );

	} );
	transformControls.addEventListener( 'mouseDown', function () {

		const object = transformControls.object;

		const objects = ( object === selector.group ) ? selector.selection : [ object ];

		objectStatesOnDown = objects.map( ( object ) => ( {
			object: object,
			position: object.position.clone(),
			rotation: object.rotation.clone(),
			scale: object.scale.clone()
		} ) );

		controls.enabled = false;

	} );
	transformControls.addEventListener( 'mouseUp', function () {

		setControlSnap( false );
		if ( transformControls.object !== undefined ) {

			const commands = [];

			for ( let i = 0; i < objectStatesOnDown.length; i ++ ) {

				const state = objectStatesOnDown[ i ];
				const object = state.object;

				if ( ! state.position.equals( object.position ) ) {

					commands.push( new SetPositionCommand( editor, object, object.position, state.position ) );

				}

				if ( ! state.rotation.equals( object.rotation ) ) {

					commands.push( new SetRotationCommand( editor, object, object.rotation, state.rotation ) );

				}

				if ( ! state.scale.equals( object.scale ) ) {

					commands.push( new SetScaleCommand( editor, object, object.scale, state.scale ) );

				}

			}

			if ( commands.length === 1 ) {

				editor.execute( commands[ 0 ] );

			} else if ( commands.length > 1 ) {

				editor.execute( new MultiCmdsCommand( editor, commands ) );

			}

		}

		controls.enabled = true;

	} );

	sceneHelpers.add( transformControls.getHelper() );

	//

	const xr = new XR( editor, transformControls ); // eslint-disable-line no-unused-vars

	// events

	function updateAspectRatio() {

		for ( const uuid in editor.cameras ) {

			const camera = editor.cameras[ uuid ];

			const width = container.dom.offsetWidth;
			const split = editor.viewportSplit && ( editor.viewportSource || editor.viewportCamera !== editor.camera );
			const aspect = ( split ? Math.floor( width / 2 ) : width ) / Math.max( 1, container.dom.offsetHeight );

			if ( camera.isPerspectiveCamera ) {

				camera.aspect = aspect;

			} else {

				const frustumHeight = camera.top - camera.bottom;

				camera.left = - frustumHeight * aspect / 2;
				camera.right = frustumHeight * aspect / 2;

			}

			camera.updateProjectionMatrix();

			const cameraHelper = editor.helpers[ camera.id ];
			if ( cameraHelper ) cameraHelper.update();

		}

	}

	const onDownPosition = new THREE.Vector2();
	const onUpPosition = new THREE.Vector2();
	const onDoubleClickPosition = new THREE.Vector2();

	let downView;

	function pointerPosition( view, x, y ) {

		const rect = layout.clientRect( view );
		return [ ( x - rect.left ) / rect.width, ( y - rect.top ) / rect.height ];

	}

	function handleClick( view, x, y, shift ) {

		if ( ! downView || view?.key !== downView.key ) return;
		onUpPosition.fromArray( pointerPosition( view, x, y ) );
		if ( onDownPosition.distanceTo( onUpPosition ) !== 0 ) return;
		const intersects = selector.getPointerIntersects( onUpPosition, view.camera );
		signals.intersectionsDetected.dispatch( intersects, shift );
		render();

	}

	function onMouseDown( event ) {

		if ( event.button !== 0 || event.target !== renderer?.domElement || ( controls.navigationMode() === 'blender' && editor.config.getKey( 'settings/emulateThreeButtonMouse' ) && event.altKey ) ) return;
		downView = layout.at( event.clientX, event.clientY );
		if ( ! downView ) return;
		onDownPosition.fromArray( pointerPosition( downView, event.clientX, event.clientY ) );
		document.addEventListener( 'mouseup', onMouseUp, { once: true } );

	}

	function onMouseUp( event ) {

		handleClick( layout.at( event.clientX, event.clientY ), event.clientX, event.clientY, event.shiftKey );

	}

	function onTouchStart( event ) {

		const touch = event.changedTouches[ 0 ];
		downView = layout.at( touch.clientX, touch.clientY );
		if ( ! downView ) return;
		onDownPosition.fromArray( pointerPosition( downView, touch.clientX, touch.clientY ) );
		document.addEventListener( 'touchend', onTouchEnd, { once: true } );

	}

	function onTouchEnd( event ) {

		const touch = event.changedTouches[ 0 ];
		handleClick( layout.at( touch.clientX, touch.clientY ), touch.clientX, touch.clientY, event.shiftKey );

	}

	function onDoubleClick( event ) {

		const view = layout.at( event.clientX, event.clientY );
		if ( ! view || view !== layout.navigation ) return;
		onDoubleClickPosition.fromArray( pointerPosition( view, event.clientX, event.clientY ) );
		const intersects = selector.getPointerIntersects( onDoubleClickPosition, view.camera );
		if ( intersects.length ) signals.objectFocused.dispatch( intersects[ 0 ].object );

	}

	container.dom.addEventListener( 'mousedown', onMouseDown );
	container.dom.addEventListener( 'touchstart', onTouchStart, { passive: false } );
	container.dom.addEventListener( 'dblclick', onDoubleClick );

	// controls need to be added *after* main logic,
	// otherwise controls.enabled doesn't work.

	const controls = new EditorControls( camera );
	controls.navigationMode = () => editor.config.getKey( 'settings/mouseNavigation' ) || 'basic';
	controls.canNavigate = () => !! layout.navigation && ! hasRestriction( layout.navigation.camera, 'locked' );
	controls.emulateThreeButton = () => editor.config.getKey( 'settings/emulateThreeButtonMouse' );
	controls.addEventListener( 'change', function () {

		const active = layout.navigation?.camera || editor.camera;
		if ( active !== editor.camera ) signals.objectChanged.dispatch( active );
		signals.cameraChanged.dispatch( active );
		signals.refreshSidebarObject3D.dispatch( active );

	} );
	for ( const type of [ 'pointerdown', 'wheel' ] ) container.dom.addEventListener( type, event => {

		if ( event.target === renderer?.domElement && layout.at( event.clientX, event.clientY ) !== layout.navigation ) event.stopImmediatePropagation();

	}, true );
	viewHelper.center = controls.center;

	editor.controls = controls;
	editor.flyControls = new FlyControls( editor, container.dom );

	// signals

	signals.editorCleared.add( function () {

		controls.getCenter( editor.camera ).set( 0, 0, 0 );
		if ( pathtracer ) pathtracer.reset();

		initPT();

		signals.sceneEnvironmentChanged.dispatch( editor.environmentType );

	} );

	signals.transformModeChanged.add( function ( mode ) {

		transformControls.setMode( mode );

		render();

	} );

	signals.snapChanged.add( function ( dist ) {

		translationSnap = dist;
		setControlSnap( false );

	} );

	signals.spaceChanged.add( function ( space ) {

		transformControls.setSpace( space );

		render();

	} );

	signals.rendererUpdated.add( function () {

		scene.traverse( function ( child ) {

			if ( child.material !== undefined ) {

				child.material.needsUpdate = true;

			}

		} );

		render();

	} );

	function updateTheme() {

		const dark = document.documentElement.dataset.theme === 'dark';
		const background = getComputedStyle( document.documentElement ).getPropertyValue( '--theme-background' ).trim();
		const translucent = /^#[\da-f]{8}$/i.test( background ) && parseInt( background.slice( 7 ), 16 ) < 255;
		const changed = document.body.classList.contains( 'translucent-panels' ) !== translucent;
		document.body.classList.toggle( 'translucent-panels', translucent );
		const value = getComputedStyle( document.documentElement ).getPropertyValue( '--theme-viewport' ).trim();
		const fallback = dark ? 0x333333 : 0xaaaaaa;
		// Renderer clear colors are opaque; blend a translucent theme color over the default viewport.
		if ( /^#[\da-f]{8}$/i.test( value ) ) {

			const color = new THREE.Color( value.slice( 0, 7 ) );
			const base = new THREE.Color( fallback );
			base.lerp( color, parseInt( value.slice( 7 ), 16 ) / 255 );
			renderer.setClearColor( base );

		} else {

			renderer.setClearColor( value || fallback );

		}
		renderer.getClearColor( editor.viewportColor );
		updateGridColors( grid1, grid2, dark ? GRID_COLORS_DARK : GRID_COLORS_LIGHT );
		return changed;

	}

	signals.themePreviewChanged.add( function () {

		if ( renderer === null ) return;
		if ( updateTheme() ) signals.windowResize.dispatch();
		render();

	} );

	signals.themeChanged.add( function () {

		if ( renderer === null ) return;
		if ( updateTheme() ) signals.windowResize.dispatch();
		render();

	} );

	signals.rendererCreated.add( function ( newRenderer ) {

		const environment = scene.environment;
		if ( renderer !== null ) {

			renderer.setAnimationLoop( null );
			environmentTarget?.dispose();
			environmentTarget = null;

			try {

				pmremGenerator.dispose();

			} catch ( e ) {

				console.warn( 'PMREMGenerator dispose error:', e );

			}

			renderer.dispose();

			container.dom.removeChild( renderer.domElement );

		}

		controls.connect( newRenderer.domElement );
		newRenderer.domElement.addEventListener( 'pointerdown', function ( event ) {

			if ( controls.navigationMode() !== 'blender' || ! editor.config.getKey( 'settings/emulateThreeButtonMouse' ) || ! event.altKey || event.button !== 0 ) return;
			transformControls.enabled = false;
			const restore = () => { transformControls.enabled = ! editor.modeling.object && ! editor.viewTools.mode; window.removeEventListener( 'pointerup', restore ); window.removeEventListener( 'pointercancel', restore ); };
			window.addEventListener( 'pointerup', restore, { once: true } );
			window.addEventListener( 'pointercancel', restore, { once: true } );

		}, true );
		transformControls.connect( newRenderer.domElement );

		contextNotice.hidden = true;
		renderer = newRenderer;
		editor.renderer = newRenderer;

		renderer.setAnimationLoop( animate );
		updateTheme();

		renderer.setPixelRatio( window.devicePixelRatio );
		renderer.setSize( container.dom.offsetWidth, container.dom.offsetHeight );

		if ( renderer.isWebGLRenderer ) {

			pmremGenerator = new THREE.PMREMGenerator( renderer );
			pmremGenerator.compileEquirectangularShader();

			pathtracer = new ViewportPathtracer( renderer );

		} else {

			pmremGenerator = new PMREMGenerator( renderer );

			pathtracer = null;

		}

		container.dom.appendChild( renderer.domElement );

		if ( renderer.isWebGLRenderer ) {

			const lostRenderer = renderer;
			renderer.domElement.addEventListener( 'webglcontextlost', function ( event ) {

				event.preventDefault();
				console.warn( 'Viewport: WebGL context lost.' );
				contextNotice.hidden = false;
				// Recreate the renderer automatically (limited, so a failing GPU cannot loop).
				if ( contextRetries ++ < 3 ) setTimeout( () => { if ( renderer === lostRenderer ) signals.rendererReset.dispatch(); }, 300 );

			} );
			renderer.domElement.addEventListener( 'webglcontextrestored', function () {

				contextNotice.hidden = true;
				contextRetries = 0;
				render();

			} );

		}

		signals.sceneEnvironmentChanged.dispatch( editor.environmentType, environment );

		render();

	} );

	signals.rendererDetectKTX2Support.add( function ( ktx2Loader ) {

		ktx2Loader.detectSupport( renderer );

	} );

	signals.sceneGraphChanged.add( function () {

		initPT();
		render();

	} );

	signals.cameraChanged.add( function () {

		if ( pathtracer ) pathtracer.reset();

		render();

	} );

	signals.objectSelected.add( function ( object ) {

		selectionBox.visible = false;
		transformControls.detach();

		if ( selector.selection.length > 1 ) {

			selector.getSelectionBox( box );

			selectionBox.visible = selector.selection.some( isVisible );
			if ( selector.selection.every( item => isVisible( item ) && ! hasRestriction( item, 'locked' ) ) ) transformControls.attach( selector.group );

		} else if ( object !== null && object !== scene && object !== camera ) {

			box.setFromObject( object, true );

			if ( box.isEmpty() === false && isVisible( object ) ) {

				selectionBox.visible = true;

			}

			if ( isVisible( object ) && ! hasRestriction( object, 'locked' ) ) transformControls.attach( object );

		}

		render();

	} );

	signals.objectFocused.add( function ( object ) {

		controls.focus( object );

	} );

	signals.geometryChanged.add( function ( object ) {

		if ( object !== undefined ) {

			box.setFromObject( object, true );

		}

		initPT();
		render();

	} );

	signals.objectChanged.add( function ( object ) {

		const selected = selector.selection;
		const candidate = selected.length > 1 ? selector.group : selected[ 0 ];
		const canTransform = selected.length > 0 && selected.every( item => item !== scene && item !== camera && isVisible( item ) && ! hasRestriction( item, 'locked' ) );
		if ( canTransform && transformControls.object !== candidate ) transformControls.attach( candidate );
		else if ( ! canTransform && transformControls.object ) transformControls.detach();
		selectionBox.visible = selected.some( item => item !== scene && item !== camera && isVisible( item ) ) && ! selectionBox.box.isEmpty();
		updateHelperVisibility();

		if ( editor.selected === object ) {

			box.setFromObject( object, true );

		} else if ( selector.selection.length > 1 && ( object === selector.group || selector.selection.indexOf( object ) !== - 1 ) ) {

			selector.getSelectionBox( box );

		}

		if ( object.isPerspectiveCamera ) {

			object.updateProjectionMatrix();

		}

		const helper = editor.helpers[ object.id ];

		if ( helper !== undefined && helper.isSkeletonHelper !== true ) {

			helper.update();

		}

		// update light helper when light target is changed

		for ( const id in editor.helpers ) {

			const helper = editor.helpers[ id ];

			if ( helper.light && helper.light.target === object ) {

				helper.update();

			}

		}

		initPT();
		render();

	} );

	signals.objectRemoved.add( function ( object ) {

		controls.enabled = true; // see #14180

		if ( object === transformControls.object ) {

			transformControls.detach();

		}

	} );

	signals.materialChanged.add( function () {

		updatePTMaterials();
		render();

	} );

	// background

	signals.sceneBackgroundChanged.add( function ( backgroundType, backgroundColor, backgroundTexture, backgroundEquirectangularTexture, backgroundColorSpace, backgroundBlurriness, backgroundIntensity, backgroundRotation ) {

		editor.backgroundType = backgroundType;

		scene.background = null;

		switch ( backgroundType ) {

			case 'Color':

				scene.background = new THREE.Color( backgroundColor );

				break;

			case 'Texture':

				if ( backgroundTexture ) {

					backgroundTexture.colorSpace = backgroundColorSpace;
					backgroundTexture.needsUpdate = true;

					scene.background = backgroundTexture;

				}

				break;

			case 'Equirectangular':

				if ( backgroundEquirectangularTexture ) {

					backgroundEquirectangularTexture.mapping = THREE.EquirectangularReflectionMapping;
					backgroundEquirectangularTexture.colorSpace = backgroundColorSpace;
					backgroundEquirectangularTexture.needsUpdate = true;

					scene.background = backgroundEquirectangularTexture;
					scene.backgroundBlurriness = backgroundBlurriness;
					scene.backgroundIntensity = backgroundIntensity;
					scene.backgroundRotation.y = backgroundRotation * THREE.MathUtils.DEG2RAD;

				}

				break;

		}

		if ( useBackgroundAsEnvironment ) {

			signals.sceneEnvironmentChanged.dispatch( editor.environmentType );

		}

		updatePTBackground();
		render();

	} );

	// environment

	let useBackgroundAsEnvironment = false;

	signals.sceneEnvironmentChanged.add( function ( environmentType, environmentEquirectangularTexture ) {

		editor.environmentType = environmentType;

		environmentTarget?.dispose();
		environmentTarget = null;
		scene.environment = null;

		useBackgroundAsEnvironment = false;

		switch ( environmentType ) {

			case 'Equirectangular':

				if ( environmentEquirectangularTexture ) {

					scene.environment = environmentEquirectangularTexture;
					scene.environment.mapping = THREE.EquirectangularReflectionMapping;

				}

				break;

			case 'Default':

				useBackgroundAsEnvironment = true;

				if ( scene.background?.isTexture ) {

					scene.environment = scene.background;
					scene.environment.mapping = THREE.EquirectangularReflectionMapping;
					scene.environmentRotation.y = scene.backgroundRotation.y;

				} else if ( pmremGenerator && ( scene.background === null || scene.background.isColor ) ) {

					const environmentScene = scene.background ? new ColorEnvironment( scene.background ) : new RoomEnvironment();
					try {

						environmentTarget = pmremGenerator.fromScene( environmentScene, 0.04 );
						scene.environment = environmentTarget.texture;

					} finally {

						environmentScene.dispose();

					}

				}

				break;

		}

		updatePTEnvironment();
		render();

	} );

	// fog

	signals.sceneFogChanged.add( function ( fogType, fogColor, fogNear, fogFar, fogDensity ) {

		switch ( fogType ) {

			case 'None':
				scene.fog = null;
				break;
			case 'Fog':
				scene.fog = new THREE.Fog( fogColor, fogNear, fogFar );
				break;
			case 'FogExp2':
				scene.fog = new THREE.FogExp2( fogColor, fogDensity );
				break;

		}

		render();

	} );

	signals.sceneFogSettingsChanged.add( function ( fogType, fogColor, fogNear, fogFar, fogDensity ) {

		switch ( fogType ) {

			case 'Fog':
				scene.fog.color.setHex( fogColor );
				scene.fog.near = fogNear;
				scene.fog.far = fogFar;
				break;
			case 'FogExp2':
				scene.fog.color.setHex( fogColor );
				scene.fog.density = fogDensity;
				break;

		}

		render();

	} );

	signals.viewportCameraChanged.add( function () {

		const viewportCamera = editor.viewportCamera;

		if ( viewportCamera.isPerspectiveCamera || viewportCamera.isOrthographicCamera ) {

			updateAspectRatio();

		}

		controls.setCamera( editor.viewportSplit ? editor.camera : viewportCamera );
		controls.enabled = ! editor.modalTransform?.active && ! editor.flyControls?.active;

		initPT();
		render();

	} );

	signals.viewportShadingChanged.add( function () {

		initPT();
		render();

	} );

	//

	signals.windowResize.add( function () {

		const overlay = document.body.classList.contains( 'translucent-panels' );
		const sidebar = document.getElementById( 'sidebar' );
		const right = overlay && sidebar?.dataset.dock === 'open' && window.innerWidth > 600 ? sidebar.offsetWidth : 0;
		const top = overlay ? parseFloat( getComputedStyle( document.body ).getPropertyValue( '--menubar-height' ) ) || 0 : 0;
		viewHelper.location.right = right;
		viewHelper.location.top = top + 30;
		updateAspectRatio();

		if ( renderer === null ) return;

		renderer.setSize( container.dom.offsetWidth, container.dom.offsetHeight );
		if ( pathtracer ) pathtracer.setSize( container.dom.offsetWidth, container.dom.offsetHeight );

		render();

	} );

	signals.showHelpersChanged.add( function ( appearanceStates ) {

		helperAppearance = appearanceStates;
		grid.visible = appearanceStates.gridHelper;

		sceneHelpers.traverse( function ( object ) {

			switch ( object.type ) {

				case 'CameraHelper':

				{

					object.visible = appearanceStates.cameraHelpers;
					break;

				}

				case 'PointLightHelper':
				case 'DirectionalLightHelper':
				case 'SpotLightHelper':
				case 'HemisphereLightHelper':

				{

					object.visible = appearanceStates.lightHelpers;
					break;

				}

				case 'SkeletonHelper':

				{

					object.visible = appearanceStates.skeletonHelpers;
					break;

				}

				default:

				{

					// not a helper, skip.

				}

			}

		} );


		updateHelperVisibility();
		render();

	} );

	signals.cameraResetted.add( function () {

		if ( camera !== editor.camera ) {

			camera = editor.camera;

			controls.setCamera( editor.viewportSplit ? editor.camera : editor.viewportCamera );
			transformControls.camera = camera;
			viewHelper.camera = camera;
			viewHelper.center = controls.getCenter( camera );

		}

		updateAspectRatio();
		render();

	} );

	// animations

	let prevActionsInUse = 0;

	const timer = new THREE.Timer(); // only used for animations

	function animate() {

		timer.update();

		const mixer = editor.mixer;
		const delta = timer.getDelta();

		const streamsChanged = ! editor.streams.playing && editor.streams.tick( scene );
		let needsUpdate = ( editor.assetBrowser?.runtime?.update( delta ) || false ) || streamsChanged;

		// Animations

		const actions = mixer.stats.actions;

		if ( ( actions.inUse > 0 || prevActionsInUse > 0 ) && editor.animationCommands?.isEnabled() !== false ) {

			prevActionsInUse = actions.inUse;

			mixer.update( delta );
			needsUpdate = true;

			if ( editor.selected !== null ) {

				editor.selected.updateWorldMatrix( false, true ); // avoid frame late effect for certain skinned meshes (e.g. Michelle.glb)
				selectionBox.box.setFromObject( editor.selected, true ); // selection box should reflect current animation state

			}

			signals.morphTargetsUpdated.dispatch();

		}

		// View Helper

		if ( viewHelper.animating === true ) {

			viewHelper.update( delta );
			needsUpdate = true;

		}

		if ( renderer.xr.isPresenting === true ) {

			needsUpdate = true;

		}

		if ( needsUpdate === true ) render();

		updatePT();

	}

	function initPT() {

		if ( pathtracer && editor.viewportShading === 'realistic' && ! editor.viewportSource && ! layout.optical && layout.frames.length < 2 ) {

			pathtracer.init( scene, editor.viewportCamera );

		}

	}

	function updatePTBackground() {

		if ( pathtracer && editor.viewportShading === 'realistic' && ! editor.viewportSource && ! layout.optical && layout.frames.length < 2 ) {

			pathtracer.setBackground( scene.background, scene.backgroundBlurriness );

		}

	}

	function updatePTEnvironment() {

		if ( pathtracer && editor.viewportShading === 'realistic' && ! editor.viewportSource && ! layout.optical && layout.frames.length < 2 ) {

			pathtracer.setEnvironment( scene.environment );

		}

	}

	function updatePTMaterials() {

		if ( pathtracer && editor.viewportShading === 'realistic' && ! editor.viewportSource && ! layout.optical && layout.frames.length < 2 ) {

			pathtracer.updateMaterials();

		}

	}

	function updatePT() {

		if ( pathtracer && editor.viewportShading === 'realistic' && ! editor.viewportSource && ! layout.optical && layout.frames.length < 2 ) {

			pathtracer.update();
			editor.signals.pathTracerUpdated.dispatch( pathtracer.getSamples() );

		}

	}

	//

	let startTime = 0;
	let endTime = 0;
	let editingPoints = false;

	function render() {

		if ( renderer === null ) return;
		const editing = Boolean( editor.modeling.object || editor.viewTools.mode );
		if ( editingPoints !== editing ) {

			editingPoints = editing;
			transformControls.enabled = ! editingPoints;

		}

		startTime = performance.now();

		const width = container.dom.offsetWidth, height = container.dom.offsetHeight;
		if ( ! width || ! height ) return;
		const frames = layout.update( width, height );
		const tiled = frames.length > 1 || !! layout.optical;
		// Each eye needs its own asynchronous Gaussian depth order.
		if ( frames.length > 1 ) secondarySplats ||= new SplatHost();
		else if ( secondarySplats ) {

			secondarySplats.dispose();
			secondarySplats = null;

		}
		const nav = layout.navigation;
		const navRect = nav?.rect;
		transformControls.camera = nav?.camera || editor.camera;
		transformControls.viewport = tiled && navRect ?
			new THREE.Vector4( navRect.x, height - navRect.y - navRect.height, navRect.width, navRect.height ) : null;

		const mode = editor.viewportShading;
		const draw = ( view, host = splatHost, post = false ) => host.render( renderer, scene, () => {

			withEnabledObjects( scene, () => withViewportShading( scene, mode, () => {

				const raster = () => renderer.render( scene, view );
				if ( post ) postHost.render( renderer, scene, view, width, height, raster, queueSplatRender );
				else raster();

			} ) );

		}, queueSplatRender );
		const drawGuides = view => {

			if ( view !== camera || editor.viewportShading === 'preview' ) return;
			renderer.autoClear = false;
			if ( grid.visible ) renderer.render( grid, view );
			if ( sceneHelpers.visible ) {

				const gizmo = transformControls.getHelper();
				const visible = gizmo.visible;
				if ( editor.modeling.object || editor.viewTools?.mode ) gizmo.visible = false;
				renderer.render( sceneHelpers, view );
				gizmo.visible = visible;

			}

		};
		renderer.setViewport( 0, 0, width, height );
		if ( ! tiled ) {

			const view = frames[ 0 ].camera;
			draw( view, splatHost, mode === 'preview' || mode === 'realistic' );
			drawGuides( view );
			if ( view === camera && editor.viewportShading !== 'preview' && ! renderer.xr.isPresenting ) viewHelper.render( renderer );
			renderer.autoClear = true;

		} else {

			// A single clear supplies both panes, including on WebGPU where clears
			// use the whole render attachment. The render passes load that result.
			const background = scene.background;
			const clearColor = renderer.getClearColor( new THREE.Color() );
			const clearAlpha = renderer.getClearAlpha();
			if ( background?.isColor ) renderer.setClearColor( background, 1 );
			renderer.clear();
			if ( background?.isColor ) scene.background = null;
			renderer.autoClear = false;
			renderer.setScissorTest( true );
			try {

				for ( const { rect, camera: view, key } of frames ) {

					const y = renderer.isWebGPURenderer ? rect.y : height - rect.y - rect.height;
					renderer.setViewport( rect.x, y, rect.width, rect.height );
					renderer.setScissor( rect.x, y, rect.width, rect.height );
					draw( view, key === 'source' && secondarySplats ? secondarySplats : splatHost );
					drawGuides( view );

				}

			} finally {

				scene.background = background;
				renderer.setClearColor( clearColor, clearAlpha );
				renderer.setScissorTest( false );
				renderer.setViewport( 0, 0, width, height );
				renderer.autoClear = true;

			}

		}

		labels.draw( frames, width, height );
		endTime = performance.now();
		editor.signals.sceneRendered.dispatch( endTime - startTime );

	}

	return container;

}

function updateGridColors( grid1, grid2, colors ) {

	grid1.material.color.setHex( colors[ 0 ] );
	grid2.material.color.setHex( colors[ 1 ] );

}

export { Viewport };
