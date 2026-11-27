import { hasLightView, lightViewCamera } from './modeling/LightView.js';
import { StreamRouter } from './streams/StreamRouter.js?v=drivers';
import { isProjector, upgradeProjectorScript } from './assets/Projector.js?v=projector-shadows';
import { createCameraHelper, createProjectorHelper } from './modeling/OpticsHelpers.js';
import { upgradeMediaScript } from './assets/MediaObjects.js';
import { hasRestriction, withoutRuntimeChildren } from './ObjectRestrictions.js';
import { ViewportVisibility } from './ViewportVisibility.js?v=local-lighting';
import { upgradeMathScript } from './assets/MathObjects.js';
import { upgradeSplatScript } from './assets/SplatObjects.js?v=splat-filters';
import { upgradeModelScript } from './assets/ModelBehavior.js';
import * as THREE from 'three';
import { cameraControllerSettings } from './CameraControllerScript.js';

import { Config } from './Config.js?v=transform-gizmos';
import { Loader } from './Loader.js?v=splat-filters';
import { createEmptyHelper } from './modeling/ReferenceObjects.js';
import { History as _History } from './History.js?v=unified-sync';
import { Strings } from './Strings.js';
import { Storage as _Storage } from './Storage.js';
import { Selector } from './Selector.js?v=pencil-selection';
import { serializeScript } from './ScriptParams.js';

var _DEFAULT_CAMERA = new THREE.PerspectiveCamera( 50, 1, 0.001, 1e10 );
_DEFAULT_CAMERA.name = 'Director';
_DEFAULT_CAMERA.position.set( 0, 5, 10 );
_DEFAULT_CAMERA.lookAt( new THREE.Vector3() );
const _ORTHOGRAPHIC_FRUSTUM_SIZE = 100;

function Editor( portable = false ) {

	const Signal = signals.Signal; // eslint-disable-line no-undef

	this.signals = {
		projectLoaded: new Signal(),

		// script

		editScript: new Signal(),

		// player

		startPlayer: new Signal(),
		stopPlayer: new Signal(),

		// xr

		enterXR: new Signal(),
		offerXR: new Signal(),
		leaveXR: new Signal(),

		// notifications

		editorCleared: new Signal(),

		savingStarted: new Signal(),
		savingFinished: new Signal(),
		assetsChanged: new Signal(),

		transformModeChanged: new Signal(),
		transformGizmoSizeChanged: new Signal(),
		viewportLabelsChanged: new Signal(),
		selectionAppearanceChanged: new Signal(),
		snapChanged: new Signal(),
		timelineFrameChanged: new Signal(),
		timelinePlaybackStarted: new Signal(),
		transformSettingsChanged: new Signal(),
		spaceChanged: new Signal(),
		rendererCreated: new Signal(),
		rendererReset: new Signal(),
		rendererUpdated: new Signal(),
		rendererDetectKTX2Support: new Signal(),

		sceneBackgroundChanged: new Signal(),
		sceneEnvironmentChanged: new Signal(),
		sceneFogChanged: new Signal(),
		sceneFogSettingsChanged: new Signal(),
		sceneGraphChanged: new Signal(),
		sceneRendered: new Signal(),

		cameraChanged: new Signal(),
		cameraResetted: new Signal(),

		geometryChanged: new Signal(),
		modelingSelectionChanged: new Signal(),

		objectSelected: new Signal(),
		objectFocused: new Signal(),

		objectAdded: new Signal(),
		objectChanged: new Signal(),
		objectRemoved: new Signal(),

		cameraAdded: new Signal(),
		cameraRemoved: new Signal(),

		helperAdded: new Signal(),
		helperRemoved: new Signal(),

		materialAdded: new Signal(),
		materialChanged: new Signal(),
		materialRemoved: new Signal(),

		scriptAdded: new Signal(),
		scriptChanged: new Signal(),
		scriptRemoved: new Signal(),

		windowResize: new Signal(),
		menuAutoHideChanged: new Signal(),
		themeChanged: new Signal(),
		themePreviewChanged: new Signal(),
		uiStyleChanged: new Signal(),

		showHelpersChanged: new Signal(),
		refreshSidebarObject3D: new Signal(),
		historyChanged: new Signal(),

		viewportCameraChanged: new Signal(),
		viewportShadingChanged: new Signal(),
		viewportOverlaysChanged: new Signal(),
		cursorChanged: new Signal(),
		viewportVisibilityChanged: new Signal(),

		intersectionsDetected: new Signal(),

		pathTracerUpdated: new Signal(),

		animationPanelChanged: new Signal(),
		animationPanelResized: new Signal(),

		morphTargetsUpdated: new Signal()

	};

	this.config = new Config( ! portable );
	this.history = new _History( this );
	this.selector = new Selector( this );
	this.storage = new _Storage();
	this.strings = new Strings( this.config );

	this.loader = new Loader( this );

	this.camera = _DEFAULT_CAMERA.clone();

	this.streams = new StreamRouter();
	this.scene = new THREE.Scene();
	this.viewportVisibility = new ViewportVisibility( this );
	this.scene.name = 'Scene';

	this.sceneHelpers = new THREE.Scene();
	this.sceneHelpers.add( new THREE.HemisphereLight( 0xffffff, 0x888888, 2 ) );

	this.backgroundType = 'Default';
	this.environmentType = 'Default';

	this.object = {};
	this.geometries = {};
	this.materials = {};
	this.textures = {};
	this.scripts = {};
	this.sourceFiles = new Map();

	this.materialsRefCounter = new Map(); // tracks how often is a material used by a 3D object

	this.mixer = new THREE.AnimationMixer( this.scene );

	this.selected = null;
	this.helpers = {};

	this.cameras = {};

	this.viewportCamera = this.camera;
	this.viewportSource = null;
	this.viewportSplit = false;
	this.viewportSplitAxis = 'vertical';
	this.viewportSplitRatio = .5;
	this.activeSceneCameraUuid = null;
	this.viewportShading = 'solid';
	this.viewportColor = new THREE.Color();
	this.cursor = new THREE.Vector3();

	this.addCamera( this.camera );

}

Editor.prototype = {

	setCursor: function ( position ) {

		if ( ! [ position.x, position.y, position.z ].every( Number.isFinite ) || this.cursor.equals( position ) ) return;
		this.cursor.copy( position );
		this.signals.cursorChanged.dispatch();

	},

	setScene: function ( scene ) {

		this.scene.uuid = scene.uuid;
		this.scene.name = scene.name;

		this.scene.animations = scene.animations;
		this.scene.background = scene.background;
		this.scene.environment = scene.environment;
		this.scene.fog = scene.fog;
		this.scene.backgroundBlurriness = scene.backgroundBlurriness;
		this.scene.backgroundIntensity = scene.backgroundIntensity;

		this.scene.userData = JSON.parse( JSON.stringify( scene.userData ) );

		// avoid render per object

		this.signals.sceneGraphChanged.active = false;

		while ( scene.children.length > 0 ) {

			this.addObject( scene.children[ 0 ] );

		}

		this.signals.sceneGraphChanged.active = true;
		this.signals.sceneGraphChanged.dispatch();

		this.signals.sceneEnvironmentChanged.dispatch( this.environmentType, scene.environment );

	},

	//

	addObject: function ( object, parent, index ) {

		var scope = this;

		object.traverse( function ( child ) {

			if ( child.userData.runtimeOnly ) return;
			if ( child.geometry !== undefined ) scope.addGeometry( child.geometry );
			if ( child.material !== undefined ) scope.addMaterial( child.material );

			scope.addCamera( child );
			scope.addHelper( child );

		} );

		if ( parent === undefined ) {

			this.scene.add( object );

		} else {

			parent.children.splice( index, 0, object );
			object.parent = parent;

		}

		this.signals.objectAdded.dispatch( object );
		this.signals.sceneGraphChanged.dispatch();

	},

	nameObject: function ( object, name ) {

		object.name = name;
		this.signals.sceneGraphChanged.dispatch();

	},

	removeObject: function ( object ) {

		if ( object.parent === null ) return; // avoid deleting the camera or scene

		var scope = this;

		object.traverse( function ( child ) {

			if ( child.userData.runtimeOnly ) return;
			scope.removeCamera( child );
			scope.removeHelper( child );

			if ( child.material !== undefined ) scope.removeMaterial( child.material );

		} );

		object.parent.remove( object );

		this.signals.objectRemoved.dispatch( object );
		this.signals.sceneGraphChanged.dispatch();

	},

	addGeometry: function ( geometry ) {

		this.geometries[ geometry.uuid ] = geometry;

	},

	setGeometryName: function ( geometry, name ) {

		geometry.name = name;
		this.signals.sceneGraphChanged.dispatch();

	},

	addMaterial: function ( material ) {

		if ( Array.isArray( material ) ) {

			for ( var i = 0, l = material.length; i < l; i ++ ) {

				this.addMaterialToRefCounter( material[ i ] );

			}

		} else {

			this.addMaterialToRefCounter( material );

		}

		this.signals.materialAdded.dispatch();

	},

	addMaterialToRefCounter: function ( material ) {

		var materialsRefCounter = this.materialsRefCounter;

		var count = materialsRefCounter.get( material );

		if ( count === undefined ) {

			materialsRefCounter.set( material, 1 );
			this.materials[ material.uuid ] = material;

		} else {

			count ++;
			materialsRefCounter.set( material, count );

		}

	},

	removeMaterial: function ( material ) {

		if ( Array.isArray( material ) ) {

			for ( var i = 0, l = material.length; i < l; i ++ ) {

				this.removeMaterialFromRefCounter( material[ i ] );

			}

		} else {

			this.removeMaterialFromRefCounter( material );

		}

		this.signals.materialRemoved.dispatch();

	},

	removeMaterialFromRefCounter: function ( material ) {

		var materialsRefCounter = this.materialsRefCounter;

		var count = materialsRefCounter.get( material );
		count --;

		if ( count === 0 ) {

			materialsRefCounter.delete( material );
			delete this.materials[ material.uuid ];

		} else {

			materialsRefCounter.set( material, count );

		}

	},

	getMaterialById: function ( id ) {

		var material;
		var materials = Object.values( this.materials );

		for ( var i = 0; i < materials.length; i ++ ) {

			if ( materials[ i ].id === id ) {

				material = materials[ i ];
				break;

			}

		}

		return material;

	},

	setMaterialName: function ( material, name ) {

		material.name = name;
		this.signals.sceneGraphChanged.dispatch();

	},

	addTexture: function ( texture ) {

		this.textures[ texture.uuid ] = texture;

	},

	//

	addCamera: function ( camera ) {

		if ( camera.isCamera ) {

			this.cameras[ camera.uuid ] = camera;

			this.signals.cameraAdded.dispatch( camera );

		}

	},

	removeCamera: function ( camera ) {

		if ( this.cameras[ camera.uuid ] !== undefined ) {

			delete this.cameras[ camera.uuid ];

			this.signals.cameraRemoved.dispatch( camera );

		}

	},

	//

	addHelper: function () {

		var geometry = new THREE.SphereGeometry( 2, 4, 2 );
		var material = new THREE.MeshBasicMaterial( { color: 0xff0000, visible: false } );

		return function ( object, helper ) {

			if ( helper === undefined ) {

				if ( object.userData.emptyDisplay ) {

					helper = createEmptyHelper( object );

				} else if ( object.isCamera ) {

					helper = createCameraHelper( THREE, object );

				} else if ( isProjector( object ) ) {

					helper = createProjectorHelper( THREE, object );

				} else if ( object.isPointLight ) {

					helper = new THREE.PointLightHelper( object, 1 );

					helper.matrix = new THREE.Matrix4();
					helper.matrixAutoUpdate = true;

					const light = object;
					const editor = this;

					helper.updateMatrixWorld = function () {

						light.getWorldPosition( this.position );

						const distance = editor.viewportCamera.position.distanceTo( this.position );
						this.scale.setScalar( distance / 30 );

						this.updateMatrix();
						this.matrixWorld.copy( this.matrix );

						const children = this.children;

						for ( let i = 0, l = children.length; i < l; i ++ ) {

							children[ i ].updateMatrixWorld();

						}

					};

				} else if ( object.isDirectionalLight ) {

					helper = new THREE.DirectionalLightHelper( object, 1 );

				} else if ( object.isSpotLight ) {

					helper = new THREE.SpotLightHelper( object );

				} else if ( object.isHemisphereLight ) {

					helper = new THREE.HemisphereLightHelper( object, 1 );

				} else if ( object.isSkinnedMesh ) {

					helper = new THREE.SkeletonHelper( object.skeleton.bones[ 0 ] );
					helper.userData.object = object;

				} else if ( object.isBone === true && object.parent && object.parent.isBone !== true ) {

					helper = new THREE.SkeletonHelper( object );
					helper.userData.object = object;

				} else {

					// no helper for this object type
					return;

				}

				if ( helper.isSkeletonHelper !== true ) {

					const picker = new THREE.Mesh( geometry, material );
					picker.name = 'picker';
					picker.userData.object = object;
					if ( object.isCamera || isProjector( object ) ) {

						picker.scale.setScalar( .115 );
						picker.position.z = .13;

					}
					helper.add( picker );

				}

			}

			this.sceneHelpers.add( helper );
			this.helpers[ object.id ] = helper;

			this.signals.helperAdded.dispatch( helper );

		};

	}(),

	removeHelper: function ( object ) {

		if ( this.helpers[ object.id ] !== undefined ) {

			var helper = this.helpers[ object.id ];
			helper.parent.remove( helper );
			helper.dispose();

			delete this.helpers[ object.id ];

			this.signals.helperRemoved.dispatch( helper );

		}

	},

	//

	addScript: function ( object, script ) {

		if ( this.scripts[ object.uuid ] === undefined ) {

			this.scripts[ object.uuid ] = [];

		}

		this.scripts[ object.uuid ].push( script );

		this.signals.scriptAdded.dispatch( script );

	},

	removeScript: function ( object, script ) {

		if ( this.scripts[ object.uuid ] === undefined ) return;

		var index = this.scripts[ object.uuid ].indexOf( script );

		if ( index !== - 1 ) {

			this.scripts[ object.uuid ].splice( index, 1 );

		}

		this.signals.scriptRemoved.dispatch( script );

	},

	getObjectMaterial: function ( object, slot ) {

		var material = object.material;

		if ( Array.isArray( material ) && slot !== undefined ) {

			material = material[ slot ];

		}

		return material;

	},

	setObjectMaterial: function ( object, slot, newMaterial ) {

		const oldMaterial = this.getObjectMaterial( object, slot );
		if ( oldMaterial === newMaterial ) return;
		if ( oldMaterial ) this.removeMaterial( oldMaterial );

		if ( Array.isArray( object.material ) && slot !== undefined ) {

			object.material[ slot ] = newMaterial;

		} else {

			object.material = newMaterial;

		}

		if ( newMaterial ) this.addMaterial( newMaterial );

	},

	setCameraType: function ( type ) {

		const oldCamera = this.camera;

		const isOrthographic = oldCamera.isOrthographicCamera === true;

		if ( ( type === 'orthographic' && isOrthographic ) || ( type === 'perspective' && ! isOrthographic ) ) return;

		// the orbit point the framing should be preserved around

		const center = this.controls ? this.controls.getCenter( oldCamera ) : new THREE.Vector3();
		const distance = oldCamera.position.distanceTo( center );

		let newCamera;

		if ( type === 'orthographic' ) {

			const halfSize = _ORTHOGRAPHIC_FRUSTUM_SIZE / 2;
			newCamera = new THREE.OrthographicCamera( - halfSize, halfSize, halfSize, - halfSize, 0, 10000 );
			newCamera.position.copy( oldCamera.position );
			newCamera.quaternion.copy( oldCamera.quaternion );

			// derive the zoom so the orthographic framing matches the perspective view at the orbit center

			const halfFOV = THREE.MathUtils.DEG2RAD * oldCamera.fov / 2;
			newCamera.zoom = ( newCamera.top - newCamera.bottom ) / ( 2 * Math.max( distance, 0.0001 ) * Math.tan( halfFOV ) );

		} else {

			newCamera = new THREE.PerspectiveCamera( 50, 1, 0.001, 1e10 );
			newCamera.quaternion.copy( oldCamera.quaternion );

			// reposition along the view direction so the perspective framing matches the orthographic view

			const halfFOV = THREE.MathUtils.DEG2RAD * newCamera.fov / 2;
			const targetDistance = ( oldCamera.top - oldCamera.bottom ) / ( 2 * oldCamera.zoom * Math.tan( halfFOV ) );

			const offset = new THREE.Vector3().subVectors( oldCamera.position, center );
			if ( offset.lengthSq() === 0 ) offset.set( 0, 0, 1 ).applyQuaternion( oldCamera.quaternion );
			offset.normalize().multiplyScalar( targetDistance );

			newCamera.position.copy( center ).add( offset );

		}

		newCamera.name = oldCamera.name;
		newCamera.uuid = oldCamera.uuid;
		newCamera.userData = structuredClone( oldCamera.userData );
		newCamera.updateProjectionMatrix();

		this.camera = newCamera;
		this.cameras[ newCamera.uuid ] = newCamera;
		this.controls?.getCenter( newCamera ).copy( center );

		if ( this.viewportCamera === oldCamera ) this.viewportCamera = newCamera;

		this.signals.cameraResetted.dispatch();

		// keep the selection (and thus the sidebar) in sync with the new camera instance

		if ( this.selected === oldCamera ) this.select( newCamera );

	},

	setViewportCamera: function ( uuid ) {

		this.viewportSource = null;
		const requested = this.cameras[ uuid ];
		this.viewportCamera = requested && ! hasRestriction( requested, 'disabled' ) ? requested : this.camera;
		if ( this.viewportCamera !== this.camera ) this.activeSceneCameraUuid = this.viewportCamera.uuid;
		this.signals.viewportCameraChanged.dispatch();

	},

	setViewportSource: function ( object ) {

		if ( ! hasLightView( object ) || hasRestriction( object, 'disabled' ) ) return;
		this.viewportSource = object;
		this.viewportCamera = this.camera;
		this.signals.viewportCameraChanged.dispatch();

	},

	setViewportSplit: function ( enabled, axis = this.viewportSplitAxis, ratio = this.viewportSplitRatio ) {

		this.viewportSplit = Boolean( enabled );
		this.viewportSplitAxis = axis === 'horizontal' ? 'horizontal' : 'vertical';
		this.viewportSplitRatio = Number.isFinite( ratio ) ? THREE.MathUtils.clamp( ratio, .15, .85 ) : .5;
		this.signals.viewportCameraChanged.dispatch();

	},

	get mainCameraSource() {

		const uuid = this.scene.userData.mainCamera;
		const source = this.cameras[ uuid ] || ( uuid && this.scene.getObjectByProperty( 'uuid', uuid ) );
		return ( source?.isCamera || isProjector( source ) ) && ! hasRestriction( source, 'disabled' ) ? source : this.camera;

	},

	get mainCamera() {

		const source = this.mainCameraSource;
		if ( ! isProjector( source ) ) return source;
		this.projectorMainView = lightViewCamera( THREE, source, this.projectorMainView );
		return this.projectorMainView;

	},

	get mainCameraOutput() {

		if ( ! isProjector( this.mainCameraSource ) ) return undefined;
		return this.scene.userData.mainCameraOutput === 'texture' ? 'texture' : 'view';

	},

	get activeSceneCamera() {

		const active = this.cameras[ this.activeSceneCameraUuid ];
		if ( active && active !== this.camera && ! hasRestriction( active, 'disabled' ) ) return active;
		if ( this.selected?.isCamera && this.selected !== this.camera && this.cameras[ this.selected.uuid ] === this.selected && ! hasRestriction( this.selected, 'disabled' ) ) return this.selected;
		return Object.values( this.cameras ).find( camera => camera !== this.camera && ! hasRestriction( camera, 'disabled' ) );

	},

	setViewportObjectNames: function ( enabled ) {

		this.config.setKey( 'settings/showObjectNames', enabled );
		this.signals.viewportLabelsChanged.dispatch();

	},

	setViewportShading: function ( value ) {

		this.viewportShading = value === 'default' ? 'preview' : value;
		this.signals.viewportShadingChanged.dispatch();

	},

	get viewportXRay() {

		return this.viewportShading === 'solid' && this.config.getKey( 'settings/viewportXRay' ) === true;

	},

	get viewportOverlays() {

		return this.config.getKey( 'settings/viewportOverlays' ) !== false;

	},

	toggleViewportOverlays: function () {

		this.config.setKey( 'settings/viewportOverlays', ! this.viewportOverlays );
		this.signals.viewportOverlaysChanged.dispatch();

	},

	toggleViewportXRay: function () {

		if ( this.viewportShading !== 'solid' ) return;
		this.config.setKey( 'settings/viewportXRay', ! this.viewportXRay );
		this.signals.viewportShadingChanged.dispatch();

	},

	//

	select: function ( object ) {

		this.selector.select( object );

	},

	selectById: function ( id ) {

		if ( id === this.camera.id ) {

			this.select( this.camera );
			return;

		}

		this.select( this.scene.getObjectById( id ) );

	},

	selectByUuid: function ( uuid ) {

		var scope = this;

		this.scene.traverse( function ( child ) {

			if ( child.uuid === uuid ) {

				scope.select( child );

			}

		} );

	},

	deselect: function () {

		this.selector.deselect();

	},

	focus: function ( object ) {

		if ( object !== undefined ) {

			this.signals.objectFocused.dispatch( object );

		}

	},

	focusById: function ( id ) {

		this.focus( this.scene.getObjectById( id ) );

	},

	clear: function () {

		this.userProjectPath = '';
		this.cursor.set( 0, 0, 0 );
		this.viewportVisibility.hidden.clear();
		this.viewportVisibility.local = null;
		this.activeSceneCameraUuid = null;
		this.history.clear();
		this.storage.clear();
		this.sourceFiles = new Map();

		this.setCameraType( 'perspective' );
		this.camera.copy( _DEFAULT_CAMERA );
		this.signals.cameraResetted.dispatch();

		this.scene.name = 'Scene';
		this.scene.userData = {};
		this.scene.animations = [];
		this.scene.background = null;
		this.scene.environment = null;
		this.scene.fog = null;

		var objects = this.scene.children;

		this.signals.sceneGraphChanged.active = false;

		while ( objects.length > 0 ) {

			this.removeObject( objects[ 0 ] );

		}

		this.signals.sceneGraphChanged.active = true;

		this.geometries = {};
		this.materials = {};
		this.textures = {};
		this.scripts = {};

		this.materialsRefCounter.clear();

		this.animations = {};
		this.mixer.stopAllAction();

		this.deselect();

		this.backgroundType = 'Default';
		this.environmentType = 'Default';

		this.signals.editorCleared.dispatch();

	},

	//

	fromJSON: async function ( json ) {

		const loader = new THREE.ObjectLoader();
		const scene = await loader.parseAsync( json.scene );
		const savedCamera = await loader.parseAsync( json.camera );
		const sceneCamera = scene.getObjectByProperty( 'uuid', savedCamera.uuid );
		// Older saves wrote the active scene camera into the main camera slot.
		const camera = sceneCamera?.isCamera ? _DEFAULT_CAMERA.clone() : savedCamera;

		this.setCameraType( camera.isOrthographicCamera ? 'orthographic' : 'perspective' );

		const existingUuid = this.camera.uuid;
		const incomingUuid = camera.uuid;

		// copy all properties, including uuid
		this.camera.copy( camera );
		if ( typeof this.camera.name !== 'string' || ! this.camera.name.trim() ) this.camera.name = _DEFAULT_CAMERA.name;
		this.camera.uuid = incomingUuid;

		delete this.cameras[ existingUuid ]; // remove old entry [existingUuid, this.camera]
		this.cameras[ incomingUuid ] = this.camera; // add new entry [incomingUuid, this.camera]

		if ( json.controls !== undefined ) {

			this.controls.fromJSON( json.controls, this.camera );

		}

		this.signals.cameraResetted.dispatch();

		this.history.fromJSON( json.history );
		this.scripts = json.scripts || {};
		for ( const [ uuid, scripts ] of Object.entries( this.scripts ) ) {

			const object = scene.getObjectByProperty( 'uuid', uuid );
			const asset = object?.userData.assetObject;
			for ( const script of scripts ) {

				upgradeModelScript( script, object );
				upgradeMediaScript( script, asset );
				upgradeProjectorScript( script );
				upgradeSplatScript( script );
				if ( asset?.type === 'math' ) upgradeMathScript( script, asset.definition );

			}

		}

		this.backgroundType = json.backgroundType || 'Default';
		this.environmentType = json.environmentType || 'Default';

		const cursor = [ json.cursor, json.cursor3D ].find( value => Array.isArray( value ) && value.length === 3 && value.every( Number.isFinite ) );
		this.cursor.fromArray( cursor || [ 0, 0, 0 ] );
		this.viewportVisibility.local = null;
		this.viewportVisibility.hidden = new Set( Array.isArray( json.viewportHidden ) ? json.viewportHidden : [] );
		this.setScene( scene );
		this.activeSceneCameraUuid = json.activeSceneCamera || null;
		if ( ! Object.hasOwn( this.scene.userData, 'mainCamera' ) ) {
			const uuid = json.mainCamera || json.viewportCamera || savedCamera.uuid;
			const legacy = this.cameras[ uuid ] || ( json.mainCamera && this.scene.getObjectByProperty( 'uuid', uuid ) );
			this.scene.userData.mainCamera = legacy && legacy !== this.camera && ( legacy.isCamera || isProjector( legacy ) ) ? legacy.uuid : null;
		}
		this.setViewportSplit( json.viewportSplit, json.viewportSplitAxis || 'vertical', json.viewportSplitRatio ?? .5 );
		this.setViewportCamera( json.viewportCamera || savedCamera.uuid );
		const viewportSource = this.objectByUuid( json.viewportSource );
		if ( hasLightView( viewportSource ) && ! hasRestriction( viewportSource, 'disabled' ) ) {

			this.setViewportSource( viewportSource );

		}
		if ( json.mainCameraOutput && ! Object.hasOwn( this.scene.userData, 'mainCameraOutput' ) ) this.scene.userData.mainCameraOutput = json.mainCameraOutput;
		if ( json.mainCameraTarget && this.mainCameraSource.isCamera ) this.controls.getCenter( this.mainCameraSource ).fromArray( json.mainCameraTarget );
		if ( json.viewportTarget ) this.controls.getCenter( this.viewportCamera ).fromArray( json.viewportTarget );
		this.config.setKey( 'project/title', json.project?.title || '' );
		this.userProjectPath = json.project?.libraryPath || '';
		this.signals.projectLoaded.dispatch( json );

	},

	toJSON: function () {

		return this.timeline ? this.timeline.withBase( () => this.serializeScene() ) : this.serializeScene();

	},

	serializeScene: function () {

		// scripts clean up

		var scene = this.scene;
		var scripts = this.scripts;

		for ( var key in scripts ) {

			var script = scripts[ key ];

			if ( script.length === 0 || scene.getObjectByProperty( 'uuid', key ) === undefined ) {

				delete scripts[ key ];

			}

		}

		const mainCameraSource = this.mainCameraSource;
		const local = this.viewportVisibility.local;
		const viewportCamera = local?.viewportCamera || this.viewportCamera;
		const director = local?.camera || this.camera;
		const directorTarget = local?.center || this.controls.getCenter?.( this.camera ) || this.controls.center;
		const viewTarget = viewportCamera.uuid === director.uuid ? directorTarget : this.controls.getCenter?.( viewportCamera ) || this.controls.center;
		return {

			metadata: {},
			project: {
				title: this.config.getKey( 'project/title' ),
				libraryPath: this.userProjectPath || '',
				renderer: this.config.getKey( 'project/renderer/type' ),
				shadows: this.config.getKey( 'project/renderer/shadows' ),
				shadowType: this.config.getKey( 'project/renderer/shadowType' ),
				toneMapping: this.config.getKey( 'project/renderer/toneMapping' ),
				cameraController: cameraControllerSettings( this, mainCameraSource ).mode || 'none',
				toneMappingExposure: this.config.getKey( 'project/renderer/toneMappingExposure' )
			},
			camera: director.toJSON(),
			cursor: ( local?.cursor || this.cursor ).toArray(),
			viewportHidden: [ ...this.viewportVisibility.hidden ],
			viewportCamera: viewportCamera.uuid,
			viewportSource: ( local ? local.viewportSource : this.viewportSource )?.uuid,
			viewportSplit: this.viewportSplit,
			viewportSplitAxis: this.viewportSplitAxis,
			viewportSplitRatio: this.viewportSplitRatio,
			mainCamera: mainCameraSource.uuid,
			mainCameraOutput: this.mainCameraOutput,
			mainCameraTarget: mainCameraSource.isCamera ? ( mainCameraSource === this.camera ? directorTarget :
				this.controls.getCenter?.( mainCameraSource ) || this.controls.center ).toArray() : undefined,
			activeSceneCamera: this.activeSceneCameraUuid,
			viewportTarget: viewTarget.toArray(),
			controls: local ? { ...this.controls.toJSON( this.camera ), center: directorTarget.toArray() } : this.controls.toJSON( this.camera ),
			scene: withoutRuntimeChildren( scene, () => scene.toJSON() ),
			scripts: Object.fromEntries( Object.entries( scripts ).map( ( [ uuid, list ] ) => [ uuid, list.map( serializeScript ) ] ) ),
			history: this.history.toJSON(),
			backgroundType: this.backgroundType,
			environmentType: this.environmentType

		};

	},

	objectByUuid: function ( uuid ) {

		return this.scene.getObjectByProperty( 'uuid', uuid, true );

	},

	execute: function ( cmd, optionalName ) {

		this.history.execute( this.timeline?.autoKeyCommand?.( cmd ) ?? cmd, optionalName );

	},

	undo: function () {

		this.history.undo();

	},

	redo: function () {

		this.history.redo();

	},

	utils: {

		save: save,
		saveArrayBuffer: saveArrayBuffer,
		saveString: saveString,
		formatNumber: formatNumber

	}

};

const link = document.createElement( 'a' );

function save( blob, filename ) {

	if ( link.href ) {

		URL.revokeObjectURL( link.href );

	}

	link.href = URL.createObjectURL( blob );
	link.download = filename || 'data.json';
	link.dispatchEvent( new MouseEvent( 'click' ) );

}

function saveArrayBuffer( buffer, filename ) {

	save( new Blob( [ buffer ], { type: 'application/octet-stream' } ), filename );

}

function saveString( text, filename ) {

	save( new Blob( [ text ], { type: 'text/plain' } ), filename );

}

function formatNumber( number ) {

	return new Intl.NumberFormat( 'en-us', { useGrouping: true } ).format( number );

}

export { Editor };
