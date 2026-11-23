import { ACTIVE_OUTLINE, SELECTED_OUTLINE, SelectionOutline, hasSelectionSurface } from './Viewport.SelectionOutline.js?v=unified-sync';
import { createEditWorkspace } from './modeling/EditWorkspace.js?v=transform-gizmos';
import { transformSnapStep } from './TransformSettings.js?v=editor-glyphs';
import { cleanShading, usesSceneEffects, withViewportShading } from './ViewportShading.js?v=pencil-ribbon';
import { isProjector } from './assets/Projector.js?v=projector-shadows';
import * as THREE from 'three';
import { PMREMGenerator } from 'three/webgpu';

import { TransformControls } from 'three/addons/controls/TransformControls.js?v=transform-gizmos';

import { UIPanel } from './libs/ui.js';

import { EditorControls } from './EditorControls.js?v=unified-sync';

import { ViewportLabels } from './Viewport.Labels.js?v=unified-sync';
import { ViewportControls } from './Viewport.Controls.js?v=split-areas';
import { FlyControls } from './FlyControls.js?v=ortho-fly';
import { hasRestriction, isVisible, withEnabledObjects, withViewportObjects } from './ObjectRestrictions.js';
import { ViewportInfo } from './Viewport.Info.js?v=unified-sync';
import { ViewportSidebar } from './Viewport.Sidebar.js?v=texture-projection';

import { ViewHelper } from './Viewport.ViewHelper.js?v=viewport-tools';
import { XR } from './Viewport.XR.js';

import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import { SetScaleCommand } from './commands/SetScaleCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';

import { ColorEnvironment } from 'three/addons/environments/ColorEnvironment.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ViewportPathtracer } from './Viewport.Pathtracer.js?v=unified-sync';
import { ViewportAccumulation } from './Viewport.Accumulation.js';
import { SplatHost } from './assets/SplatHost.js';
import { ViewportTools } from './modeling/ViewportTools.js?v=texture-projection';
import { ProjectorCoverageOverlay } from './modeling/ProjectorCoverageOverlay.js';
import { ViewLayout } from './modeling/ViewLayout.js?v=split-areas';
import { ModelViewport } from './modeling/ModelViewport.js?v=transform-gizmos';
import { PostProcessingHost } from './PostProcessing.js';

function Viewport( editor ) {

	const selector = editor.selector;
	const signals = editor.signals;

	const container = new UIPanel();
	container.setId( 'viewport' );
	container.setPosition( 'absolute' );

	const header = document.createElement( 'div' );
	header.className = 'viewport-header';
	// Use the available viewport width, including when side panels are resized.
	new ResizeObserver( ( [ entry ] ) => {

		header.classList.toggle( 'narrow', entry.contentRect.width < 760 );

	} ).observe( header );
	const toolbarRow = document.createElement( 'div' );
	toolbarRow.className = 'viewport-toolbar-row';
	toolbarRow.append( new ViewportControls( editor ).dom );
	header.append( toolbarRow );
	container.dom.append( header );
	editor.viewportToolbar = toolbarRow;
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
	const coverage = new ProjectorCoverageOverlay( editor, container.dom );
	// Route shortcuts and pointer tools to the Director area under the mouse
	// before the modeling and transform controls process the event.
	for ( const type of [ 'pointerdown', 'pointermove', 'wheel' ] ) container.dom.addEventListener( type, event => {

		if ( ! editor.viewportSplit || event.target !== renderer?.domElement || editor.modeling.drag ||
			editor.modeling.gesture || editor.modalTransform?.active || editor.viewTools.pointer || ( type === 'pointermove' && event.buttons ) ) return;
		const frame = layout.at( event.clientX, event.clientY );
		if ( frame?.director && frame.key !== layout.activeKey ) {

			layout.activeKey = frame.key;
			render();

		}

	}, true );
	container.dom.addEventListener( 'pointerdown', event => startGizmoDrag( event,
		editor.modeling.editMode || editor.modeling.selectionTool !== 'select' ), true );
	const labels = new ViewportLabels( editor, container.dom );
	signals.viewportLabelsChanged.add( render );
	signals.viewportOverlaysChanged.add( render );
	signals.selectionAppearanceChanged.add( render );
	signals.cursorChanged.add( render );
	editor.modeling = new ModelViewport( editor, container.dom, render );
	signals.viewportVisibilityChanged.add( () => { initPT(); updateHelperVisibility(); syncTransformTarget(); render(); } );
	signals.timelineFrameChanged.add( () => { initPT(); render(); } );
	editor.viewTools = new ViewportTools( editor, container.dom, layout, render );
	editor.editWorkspace = createEditWorkspace( editor );
	editor.viewportSidebar = new ViewportSidebar( editor, container.dom, header, layout, render );
	const splatHost = new SplatHost();
	let secondarySplats = null;
	const postHost = new PostProcessingHost();
	let splatRenderQueued = false;
	const queueSplatRender = () => {

		if ( splatRenderQueued ) return;
		splatRenderQueued = true;
		requestAnimationFrame( () => {

			splatRenderQueued = false;
			accumulation?.reset();
			if ( editor.viewportShading !== 'realistic' || editor.viewportSplit || editor.viewportSource ) render();

		} );

	};
	let contextRetries = 0;
	let pmremGenerator = null;
	let environmentTarget = null;
	let pathtracer = null;
	let accumulation = null;
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
	grid.scale.setScalar( editor.config.getKey( 'settings/gridStep' ) );
	grid.visible = editor.config.getKey( 'settings/gridVisible' );

	const viewHelper = new ViewHelper( camera, container, ( dx, dy ) => controls.rotate( new THREE.Vector3( dx, dy, 0 ) ) );
	const viewHelperPanel = viewHelper.panel ?? container.dom.querySelector( '#viewHelper' );

	//

	const box = new THREE.Box3();

	let selectionOutline = new SelectionOutline();
	const selectionBox = new THREE.Box3Helper( box, SELECTED_OUTLINE );
	const activeSelectionBox = new THREE.Box3Helper( new THREE.Box3(), ACTIVE_OUTLINE );
	for ( const helper of [ selectionBox, activeSelectionBox ] ) {

		helper.material.depthTest = false;
		helper.material.toneMapped = false;
		helper.material.transparent = true;
		helper.visible = false;
		sceneHelpers.add( helper );

	}

	let objectStatesOnDown = [];

	const transformControls = new TransformControls( camera );
	const model = editor.modeling;
	sceneHelpers.add( model.proxy );
	let gizmoDrag, cancelGizmoDrag = false;
	const gizmoAllowed = () => editor.config.getKey( 'settings/showTransformGizmo' ) !== false &&
		editor.viewportShading !== 'preview' && ! editor.viewTools.mode && ! editor.modalTransform.active &&
		! editor.flyControls?.active && ! editor.editWorkspace.exclusive && ! model.gesture?.modal && ! model.pen && ! model.knife;

	function syncTransformTarget() {

		if ( transformControls.dragging ) return;
		const selected = selector.selection;
		const available = selected.length > 0 && selected.every( object => object !== scene && object !== camera &&
			isVisible( object ) && ! hasRestriction( object, 'locked' ) );
		const candidate = model.editMode ? ( model.canEdit() && model.indices.length && ! model.adding && ! model.brush && ! model.drag ? model.proxy : null ) :
			available ? ( selector.usesGroupPivot() ? selector.group : selected[ 0 ] ) : null;
		if ( candidate && transformControls.object !== candidate ) transformControls.attach( candidate );
		else if ( ! candidate && transformControls.object ) transformControls.detach();
		transformControls.enabled = Boolean( candidate ) && gizmoAllowed();
		transformControls.getHelper().visible = transformControls.enabled;
		transformControls.setSpace( model.object || editor.config.getKey( 'settings/transformOrientation' ) === 'local' ? 'local' : 'world' );
		setControlSnap( false );

	}

	model.onSelectionChange = syncTransformTarget;
	const controlPointer = ( event, rect ) => ( {
		x: 2 * ( event.clientX - rect.left ) / rect.width - 1,
		y: 1 - 2 * ( event.clientY - rect.top ) / rect.height,
		button: event.button
	} );
	function startGizmoDrag( event, precise ) {

		if ( event.button !== 0 || event.altKey || event.metaKey || event.shiftKey && ! event.ctrlKey || event.target !== renderer?.domElement ||
			gizmoDrag || ! gizmoAllowed() || ! transformControls.enabled || model.drag ) return false;
		const frame = layout.navigation;
		if ( ! frame || layout.at( event.clientX, event.clientY ) !== frame ) return false;
		const rect = layout.clientRect( frame );
		const pointer = controlPointer( event, rect );
		const hit = transformControls.pickHandle( pointer, precise );
		if ( ! hit ) return false;
		transformControls.mode = hit.mode;
		transformControls.axis = hit.axis;
		model.lastPointer = event;
		setControlSnap( event.ctrlKey, event.shiftKey );
		transformControls.pointerDown( pointer );
		if ( ! transformControls.dragging ) return false;
		gizmoDrag = { id: event.pointerId, target: event.target, rect };
		event.target.setPointerCapture( event.pointerId );
		event.preventDefault();
		event.stopImmediatePropagation();
		return true;

	}
	model.gizmoUnderPointer = event => startGizmoDrag( event, false );
	function endGizmoDrag( cancel ) {

		if ( ! gizmoDrag ) return;
		const { target, id } = gizmoDrag;
		gizmoDrag = null;
		cancelGizmoDrag = cancel;
		transformControls.pointerUp( null );
		cancelGizmoDrag = false;
		if ( target.hasPointerCapture( id ) ) target.releasePointerCapture( id );
		syncTransformTarget();
		render();

	}
	model.cancelGizmo = () => endGizmoDrag( true );
	container.dom.addEventListener( 'pointermove', event => {

		if ( gizmoDrag?.id === event.pointerId ) {

			model.lastPointer = event;
			transformControls.pointerMove( controlPointer( event, gizmoDrag.rect ) );
			event.stopImmediatePropagation();
			return;

		}
		const frame = layout.navigation;
		if ( ! transformControls.enabled || ! gizmoAllowed() || event.buttons || event.target !== renderer?.domElement ||
			! frame || layout.at( event.clientX, event.clientY ) !== frame ) transformControls.axis = null;
		else transformControls.pointerHover( controlPointer( event, layout.clientRect( frame ) ) );

	}, true );
	for ( const type of [ 'pointerup', 'pointercancel', 'lostpointercapture' ] ) container.dom.addEventListener( type, event => {

		if ( gizmoDrag?.id !== event.pointerId || type === 'pointerup' && event.button !== 0 ) return;
		endGizmoDrag( type !== 'pointerup' );
		event.stopImmediatePropagation();

	}, true );
	window.addEventListener( 'keydown', event => {

		if ( event.key !== 'Escape' || ! gizmoDrag ) return;
		endGizmoDrag( true );
		event.preventDefault();
		event.stopImmediatePropagation();

	}, true );
	window.addEventListener( 'blur', () => endGizmoDrag( true ) );
	transformControls.setSize( editor.config.getKey( 'settings/transformGizmoSize' ) );
	signals.transformGizmoSizeChanged.add( () => {

		transformControls.setSize( editor.config.getKey( 'settings/transformGizmoSize' ) );
		render();

	} );
	let translationSnap = null;
	let snapHeld = false, groundHeld = false;
	// Ctrl snaps to the grid; Ctrl+Shift drops the lowest point onto the ground plane (y = 0) instead.
	function setControlSnap( held, ground = false ) {

		snapHeld = held && ( !! model.object || ! ground );
		groundHeld = ! model.object && held && ground;
		const step = transformSnapStep( editor.config, snapHeld ) ?? translationSnap;
		transformControls.setTranslationSnap( model.object || groundHeld ? null : step );
		transformControls.setRotationSnap( step && ! groundHeld ? Math.PI / 12 : null );
		transformControls.setScaleSnap( step && ! groundHeld ? 0.1 : null );

	}

	setControlSnap( false );
	signals.transformSettingsChanged.add( key => {

		grid.scale.setScalar( editor.config.getKey( 'settings/gridStep' ) );
		setControlSnap( false );
		if ( ! transformControls.dragging ) syncTransformTarget();
		if ( key !== 'transformPivot' || model.object ) render();

	} );

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

		if ( transformControls.object === model.proxy ) model.updateTransform( transformControls.axis );
		else {

			dropToGround();
			signals.objectChanged.dispatch( transformControls.object );

		}

	} );
	transformControls.addEventListener( 'mouseDown', function () {

		const object = transformControls.object;
		if ( object === model.proxy ) {

			if ( model.beginTransform( transformControls.mode ) ) controls.enabled = false;
			return;

		}
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
		if ( transformControls.object === model.proxy ) {

			model.finishTransform( ! cancelGizmoDrag );
			controls.enabled = true;
			return;

		}
		if ( transformControls.object !== undefined ) {

			const commands = [];

			for ( let i = 0; i < objectStatesOnDown.length; i ++ ) {

				const state = objectStatesOnDown[ i ];
				const object = state.object;

				if ( cancelGizmoDrag ) {

					object.position.copy( state.position );
					object.rotation.copy( state.rotation );
					object.scale.copy( state.scale );
					object.updateMatrixWorld( true );
					signals.objectChanged.dispatch( object );
					continue;

				}
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

		const width = container.dom.offsetWidth, height = container.dom.offsetHeight;
		if ( ! width || ! height ) return;
		const areas = layout.areas( width, height );
		for ( const uuid in editor.cameras ) {

			const camera = editor.cameras[ uuid ];

			const area = camera === editor.camera ? areas[ 0 ] : areas.at( -1 );
			const aspect = Math.max( 1, area.width ) / Math.max( 1, area.height );

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
		if ( ! view ) return;
		onDoubleClickPosition.fromArray( pointerPosition( view, event.clientX, event.clientY ) );
		const intersects = selector.getPointerIntersects( onDoubleClickPosition, view.camera );
		if ( intersects.length ) {

			const object = intersects[ 0 ].object.userData.object || intersects[ 0 ].object;
			editor.select( object );
			signals.objectFocused.dispatch( object );

		}

	}

	container.dom.addEventListener( 'mousedown', onMouseDown );
	container.dom.addEventListener( 'touchstart', onTouchStart, { passive: false } );
	container.dom.addEventListener( 'dblclick', onDoubleClick );

	// controls need to be added *after* main logic,
	// otherwise controls.enabled doesn't work.

	const controls = new EditorControls( camera );
	controls.navigationMode = () => editor.config.getKey( 'settings/mouseNavigation' ) || 'blender';
	controls.canNavigate = () => !! layout.navigation && ! hasRestriction( layout.navigation.camera, 'locked' );
	controls.canStartNavigation = event => event.pointerType === 'touch' || event.button !== 0 || event.altKey || ! ( model.editMode || editor.viewTools.mode );
	controls.emulateThreeButton = () => editor.config.getKey( 'settings/emulateThreeButtonMouse' );
	controls.addEventListener( 'change', function () {

		const active = editor.viewportSplit ? editor.camera : editor.viewportCamera;
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

		endGizmoDrag( true );
		editor.transformGizmoMode = mode;
		transformControls.combined = mode === 'combined';
		transformControls.setMode( transformControls.combined ? 'translate' : mode );

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

		endGizmoDrag( true );
		const environment = scene.environment;
		selectionOutline.dispose();
		selectionOutline = new SelectionOutline();
		if ( renderer !== null ) {

			renderer.setAnimationLoop( null );
			environmentTarget?.dispose();
			environmentTarget = null;

			try {

				pmremGenerator.dispose();

			} catch ( e ) {

				console.warn( 'PMREMGenerator dispose error:', e );

			}

			pathtracer?.dispose();
			accumulation?.dispose();
			accumulation = null;
			renderer.dispose();

			container.dom.removeChild( renderer.domElement );

		}

		controls.connect( newRenderer.domElement );

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
		accumulation?.reset();
		if ( model.object && model.indices.length && ! model.gesture && ! model.drag &&
			editor.config.getKey( 'settings/transformOrientation' ) === 'view' ) model.updateProxy();
		render();

	} );

	signals.objectSelected.add( function ( object ) {

		endGizmoDrag( true );
		selectionBox.visible = false;
		transformControls.detach();

		if ( selector.selection.length > 1 ) {

			selector.getSelectionBox( box );

			selectionBox.visible = selector.selection.some( isVisible );

		} else if ( object !== null && object !== scene && object !== camera ) {

			box.setFromObject( object, true );

			if ( box.isEmpty() === false && isVisible( object ) ) {

				selectionBox.visible = true;

			}


		}

		syncTransformTarget();
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
		if ( ! model.object ) syncTransformTarget();
		selectionBox.visible = selected.some( item => item !== scene && item !== camera && isVisible( item ) ) && ! selectionBox.box.isEmpty();
		updateHelperVisibility();

		if ( editor.selected === object ) {

			box.setFromObject( object, true );

		} else if ( selector.selection.length > 1 && ( object === selector.group || selector.selection.indexOf( object ) !== - 1 ) ) {

			selector.getSelectionBox( box );

		}

		if ( object.isPerspectiveCamera || object.isOrthographicCamera ) {

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

		if ( ! signals.sceneGraphChanged.active ) return;
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

		initPT();
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

		syncTransformTarget();
		initPT();
		render();

	} );

	//

	signals.windowResize.add( function () {

		const overlay = container.dom.parentElement?.id === 'workspace-viewport' &&
			document.body.classList.contains( 'translucent-panels' ) && ! editor.viewportSplit;
		const sidebar = document.getElementById( 'sidebar' );
		const right = overlay && sidebar?.dataset.dock === 'open' && window.innerWidth > 600 ? sidebar.offsetWidth : 0;
		const top = overlay ? parseFloat( getComputedStyle( document.body ).getPropertyValue( '--menubar-height' ) ) || 0 : 0;
		viewHelper.location.right = right;
		viewHelper.location.top = top + 30;
		updateAspectRatio();

		if ( renderer === null || ! container.dom.offsetWidth || ! container.dom.offsetHeight ) return;

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
		initPT();
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

		const liveScene = editor.timeline?.tick( delta ) || needsUpdate;
		if ( liveScene ) render();

		updatePT( liveScene );

	}

	function initPT() {

		pathtracer?.invalidate();
		accumulation?.reset();
		renderedFallback = undefined;

	}

	function updatePTBackground() {

		accumulation?.reset();
		if ( pathtracer && editor.viewportShading === 'realistic' && ! editor.viewportSource && ! layout.optical && layout.frames.length < 2 ) {

			pathtracer.setBackground( scene.background, scene.backgroundBlurriness );

		}

	}

	function updatePTEnvironment() {

		accumulation?.reset();
		if ( pathtracer && editor.viewportShading === 'realistic' && ! editor.viewportSource && ! layout.optical && layout.frames.length < 2 ) {

			pathtracer.setEnvironment( scene.environment );

		}

	}

	function updatePTMaterials() {

		initPT();

	}

	function drawSelection( view, show = view === camera, host = splatHost ) {

		if ( ! show || model.editMode && model.object || cleanShading( editor.viewportShading ) || ! sceneHelpers.visible ||
			editor.config.getKey( 'settings/selectionHighlight' ) === 'bounds' ) return;
		const roots = selector.selection.filter( object => object !== scene && object !== camera && isVisible( object ) && hasSelectionSurface( object ) );
		const active = editor.selected;
		const mask = () => host.render( renderer, scene,
			() => withViewportShading( scene, editor.viewportShading, () => model.withPreview( () => renderer.render( scene, view ) ) ), queueSplatRender );
		withViewportObjects( scene, () => {

			selectionOutline.draw( renderer, scene, view, roots.filter( object => object !== active ), mask );
			if ( roots.includes( active ) ) selectionOutline.draw( renderer, scene, view, [ active ], mask, ACTIVE_OUTLINE );

		} );

	}

	let renderedFallback, renderedStatus;
	function updatePT( liveScene ) {

		if ( editor.viewportShading !== 'realistic' || renderer.xr.isPresenting || ! container.dom.offsetWidth ) { renderedStatus = undefined; return; }
		let status = 'Raster · split or source view';
		if ( liveScene ) {

			pathtracer?.invalidate();
			accumulation?.reset();
			status = 'Raster · scene in motion';

		} else if ( layout.frames.length === 1 && ! layout.optical && ( ! editor.viewportSplit || layout.maximizedPane ) ) {

			if ( renderedFallback === undefined ) {

				const effects = scene.userData.postprocessing;
				renderedFallback = Boolean( effects?.bloom || effects?.dof || scene.fog );
				scene.traverseVisible( object => {

					if ( renderedFallback || ! isVisible( object ) || object.userData.annotation === true ) return;
					if ( object.splats || object.isPoints || isProjector( object ) ) renderedFallback = true;
					else if ( object.isLine || object.isSprite ||
						[ object.material ].flat().some( material => material?.isShaderMaterial ) ) renderedFallback = true;

				} );

			}
			if ( ! pathtracer ) status = 'Raster · progressive rendering requires WebGL';
			else {

				const view = layout.frames[ 0 ].camera;
				const samples = renderedFallback ? null : pathtracer.update( scene, view );
				if ( samples === null ) {

					accumulation ||= new ViewportAccumulation( renderer );
					const width = container.dom.offsetWidth, height = container.dom.offsetHeight;
					const count = accumulation.update( view, () => drawScene( view, splatHost, width, height, true ) );
					status = 'Raster · ' + count + ( count === 1 ? ' sample' : ' samples' );

				} else status = samples;

			}

		}
		if ( status === renderedStatus ) return;
		renderedStatus = status;
		editor.signals.pathTracerUpdated.dispatch( status );

	}

	//

	let startTime = 0;
	let endTime = 0;
	let viewToolMode;

	function drawScene( view, host, width, height, post, editorView = true ) {

		const visibility = editorView ? withViewportObjects : withEnabledObjects;
		const shading = editorView && editor.viewportXRay ? 'xray' : editor.viewportShading;
		visibility( scene, () => host.render( renderer, scene, () => withViewportShading( scene, shading, () => {

			const raster = () => model.withPreview( () => renderer.render( scene, view ) );
			if ( post ) postHost.render( renderer, scene, view, width, height, raster, queueSplatRender );
			else raster();

		} ), queueSplatRender ), editorView && editor.viewportOverlays && ! cleanShading( editor.viewportShading ) );

	}

	function render() {

		if ( renderer === null ) return;
		if ( viewToolMode !== editor.viewTools.mode ) {

			viewToolMode = editor.viewTools.mode;
			syncTransformTarget();

		}

		startTime = performance.now();

		const width = container.dom.offsetWidth, height = container.dom.offsetHeight;
		if ( ! width || ! height ) return;
		const frames = layout.update( width, height );
		const tiled = frames.length > 1 || !! layout.optical;
		const clean = cleanShading( editor.viewportShading );
		const overlays = editor.viewportOverlays;
		coverage.update( layout.optical, overlays && ! clean );
		container.dom.dataset.cleanView = String( clean );
		container.dom.dataset.overlays = String( overlays );
		container.dom.dataset.shading = editor.viewportShading;
		const showViewHelper = ! tiled && ( width >= 600 || ! editor.viewportSidebar.open ) && document.body.dataset.maximizedArea !== 'viewport' &&
			frames[ 0 ].camera === camera && ! clean && ! renderer.xr.isPresenting;
		if ( viewHelperPanel ) viewHelperPanel.hidden = ! showViewHelper;
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
		const selectionStyle = editor.config.getKey( 'settings/selectionHighlight' ) || 'outline';
		const selected = selector.selection.filter( object => object !== scene && object !== camera && isVisible( object ) );
		const outlineSupported = renderer.isWebGLRenderer && ! renderer.xr.isPresenting;
		const surfaces = selected.filter( hasSelectionSurface );
		const bounds = selectionStyle !== 'outline' || ! outlineSupported ? selected : selected.filter( object => ! surfaces.includes( object ) );
		box.makeEmpty();
		activeSelectionBox.box.makeEmpty();
		for ( const object of bounds ) {

			const target = object === editor.selected ? activeSelectionBox.box : box;
			target.expandByObject( object, true );

		}
		const boundGuides = ! ( model.editMode && model.object );
		selectionBox.visible = boundGuides && ! box.isEmpty();
		activeSelectionBox.visible = boundGuides && ! activeSelectionBox.box.isEmpty();
		const drawGuides = frame => {

			if ( mode === 'preview' ) return;
			const view = frame.camera;
			const gizmo = transformControls.getHelper();
			const showGizmo = frame === nav && gizmo.visible && gizmoAllowed();
			const showModelGizmo = showGizmo && transformControls.object === model.proxy;
			if ( ! overlays && ! clean ) {

				if ( showGizmo ) {

					renderer.autoClear = false;
					renderer.render( gizmo, view );

				}
				return;

			}
			drawSelection( view, frame.director || frames.length > 1, frame.key === 'source' && secondarySplats ? secondarySplats : splatHost );
			if ( ! frame.director || clean ) {

				if ( frames.length > 1 && ! clean && sceneHelpers.visible && ( selectionBox.visible || activeSelectionBox.visible ) ) {

					renderer.autoClear = false;
					if ( selectionBox.visible ) renderer.render( selectionBox, view );
					if ( activeSelectionBox.visible ) renderer.render( activeSelectionBox, view );

				}
				if ( showModelGizmo && mode !== 'realistic' ) {

					renderer.autoClear = false;
					renderer.render( gizmo, view );

				}
				return;

			}
			renderer.autoClear = false;
			if ( grid.visible ) renderer.render( grid, view );
			if ( sceneHelpers.visible ) {

				const visible = gizmo.visible;
				gizmo.visible = showGizmo;
				renderer.render( sceneHelpers, view );
				gizmo.visible = visible;

			} else if ( showModelGizmo ) renderer.render( gizmo, view );

		};

		renderer.setViewport( 0, 0, width, height );
		if ( ! tiled ) {

			const view = frames[ 0 ].camera;
			drawScene( view, splatHost, width, height, usesSceneEffects( mode ) );
			drawGuides( frames[ 0 ] );
			if ( showViewHelper ) viewHelper.render( renderer );
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

				for ( const frame of frames ) {

					const { rect, camera: view, key } = frame;
					if ( ! rect.width || ! rect.height || layout.isViewportPane?.( key ) === false ) continue;

					const y = renderer.isWebGPURenderer ? rect.y : height - rect.y - rect.height;
					renderer.setViewport( rect.x, y, rect.width, rect.height );
					renderer.setScissor( rect.x, y, rect.width, rect.height );
					drawScene( view, key === 'source' && secondarySplats ? secondarySplats : splatHost, width, height, false, frame.director );
					drawGuides( frame );

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
