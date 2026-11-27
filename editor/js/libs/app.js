import { TimelineRuntime } from '../animation/TimelineRuntime.js?v=timeline-keying';
import { timelineData } from '../animation/TimelineData.js?v=timeline-keying';
import { isProjector } from '../assets/Projector.js';
import { fitView, lightViewCamera } from '../modeling/LightView.js';
import { drawProjectorOutput, renderFittedView } from '../modeling/ProjectorOutput.js';
import { StreamRouter } from '../streams/StreamRouter.js';
import { SplatHost } from '../assets/SplatHost.js';
import { PostProcessingHost } from '../PostProcessing.js';
/* global THREE, __THREEEDITOR_RENDERER__ */
import { createCameraController } from 'three/addons/controls/CameraController.js';
import { hasRestriction, withEnabledObjects } from '../ObjectRestrictions.js';
import { scriptSourceForExecution } from '../ScriptParams.js';
import { createP5Sketch } from '../P5Sketch.js';
import { GeometrySimulation } from '../nodes/GeometrySimulation.js';
import { LogicRuntime } from '../nodes/LogicRuntime.js';
import { NodeComponentRuntime } from '../nodes/NodeComponents.js';
import { releaseArmatureGeometry, withArmatureDeformation } from '../rigging/ArmatureDeformation.js';
import { prepareArmaturePhysics } from '../rigging/ArmaturePhysics.js';
import { withArmatureIK } from '../rigging/ArmatureIK.js';
import { readGamepads } from '../nodes/LogicInput.js';
import { installShaderGraphs, withShaderGraphs } from '../nodes/ShaderGraphRuntime.js';

// Body for p5 sketch scripts: runs the student's global-mode source in a p5
// instance and projects its canvas onto the host mesh as a live texture.
// Loading is async, so update() simply no-ops until the texture exists.
function p5ScriptBody( script, source ) {

	return `
const __p5target = this;
let __p5api = null;
let __p5texture = null;
let __p5prevMap = null;
let __p5material = null;
createP5Sketch( ${ JSON.stringify( source ) } ).then( ( api ) => {

	__p5api = api;
	const canvas = api.canvas;
	if ( ! canvas ) return;
	__p5texture = new THREE.CanvasTexture( canvas );
	__p5texture.colorSpace = THREE.SRGBColorSpace;
	if ( __p5target.isMesh && __p5target.material ) {

		__p5material = __p5target.material;
		__p5prevMap = __p5material.map || null;
		__p5material.map = __p5texture;
		__p5material.needsUpdate = true;

	}

} ).catch( ( error ) => console.error( 'p5 sketch failed:', error ) );
function update( event ) {

	if ( __p5texture ) __p5texture.needsUpdate = true;

}
function stop() {

	try { __p5api?.remove(); } catch ( error ) { console.warn( 'p5 cleanup:', error ); }
	__p5api = null;
	__p5texture = null;
	if ( __p5material ) {

		__p5material.map = __p5prevMap;
		__p5material.needsUpdate = true;
		__p5material = null;

	}

}
return { events: { update, stop }, setParameters: null };`;

}

const APP = {

	Player: function ( importScriptModule, prepareScript, streams = new StreamRouter() ) {

		let renderer;
		let controller, controllerOptions, cameraTarget;

		const loader = new THREE.ObjectLoader();
		const nodeComponents = new NodeComponentRuntime( THREE );
		let camera, scene, projector, projectorContext, timeline, geometrySimulation, logic, rigPhysics;

		let events = {};
		let splatHost;
		const postHost = new PostProcessingHost();
		const scriptParameters = new Map();
		const pressedKeys = new Set();
		const pressedButtons = new Set();
		let playing = false;
		let pointer;

		const dom = document.createElement( 'div' );

		this.dom = dom;
		this.streams = streams;
		this.canvas = null;

		this.width = 500;
		this.height = 500;

		this.load = async function ( json ) {

			const project = json.project;
			timeline?.clear();
			splatHost?.dispose();
			splatHost = new SplatHost();

			// Create renderer based on project settings

			if ( renderer !== undefined ) {

				controller?.dispose();
				controller = undefined;
				renderer.dispose();
				this.canvas?.remove();
				this.canvas = null;

			}

			// A single-file player knows its renderer at build time.
			if ( typeof __THREEEDITOR_RENDERER__ === 'undefined'
				? project.renderer === 'WebGPURenderer'
				: __THREEEDITOR_RENDERER__ === 'WebGPURenderer' ) {

				const { TSL, WebGPURenderer } = await import( 'three/webgpu' );
				renderer = new WebGPURenderer( { antialias: true, reversedDepthBuffer: true } );
				await renderer.init();
				installShaderGraphs( renderer, TSL );

			} else {

				renderer = new THREE.WebGLRenderer( { antialias: true, reversedDepthBuffer: true } );

			}

			renderer.setPixelRatio( window.devicePixelRatio );

			if ( project.shadows !== undefined ) renderer.shadowMap.enabled = project.shadows;
			if ( project.shadowType !== undefined ) renderer.shadowMap.type = project.shadowType;
			if ( project.toneMapping !== undefined ) renderer.toneMapping = project.toneMapping;
			if ( project.toneMappingExposure !== undefined ) renderer.toneMappingExposure = project.toneMappingExposure;

			this.setScene( loader.parse( json.scene ) );
			const loadedScene = scene;
			const preparedPhysics = await prepareArmaturePhysics( THREE, loadedScene );
			if ( scene !== loadedScene ) {

				preparedPhysics?.dispose();
				return;

			}
			rigPhysics = logic.physics = preparedPhysics;
			if ( rigPhysics ) rigPhysics.onContact = ( first, second, entered ) =>
				streams.emit( 'bonecontact', { first: first.uuid, second: second.uuid, entered } );
			const mainUuid = json.mainCamera || scene.userData.mainCamera;
			const sceneCamera = scene.getObjectByProperty( 'uuid', mainUuid || json.viewportCamera || json.camera.object.uuid );
			const mainSource = sceneCamera && ! hasRestriction( sceneCamera, 'disabled' ) ? sceneCamera : null;
			projector = mainUuid && isProjector( mainSource ) ? mainSource : null;
			const textureOutput = projector && ( json.mainCameraOutput || scene.userData.mainCameraOutput ) === 'texture';
			this.canvas = textureOutput ? document.createElement( 'canvas' ) : renderer.domElement;
			projectorContext = textureOutput ? this.canvas.getContext( '2d', { alpha: false } ) : null;
			dom.appendChild( this.canvas );
			this.setCamera( projector ? lightViewCamera( THREE, projector ) : mainSource?.isCamera ? mainSource : loader.parse( json.camera ) );
			const hasControllerScript = json.scripts?.[ camera.uuid ]?.some( script => script.cameraController === true );
			const mode = projector || hasControllerScript ? 'none' : project.cameraController || camera.userData.threeditor?.cameraController;
			cameraTarget = json.mainCameraTarget || json.viewportTarget || json.controls?.center;
			controllerOptions = mode && mode !== 'none' ? {
				mode,
				target: cameraTarget,
				follow: scene.getObjectByProperty( 'uuid', camera.userData.threeditor?.cameraFollow )
			} : null;

			scriptParameters.clear();
			const scriptParamObjects = new Map();
			streams.getParam = ( uuid, scriptIndex, param ) => scriptParamObjects.get( uuid + ':' + scriptIndex )?.[ param ];
			streams.setParam = ( uuid, scriptIndex, param, value ) => {
				const key = uuid + ':' + scriptIndex;
				const obj = scriptParamObjects.get( key ), fn = scriptParameters.get( key );
				if ( ! obj || ! fn ) return false;
				fn( { ...obj, [ param ]: value } );
				return true;
			};
			timeline = new TimelineRuntime( {
				scene, scripts: json.scripts || {},
				object: uuid => camera.uuid === uuid ? camera : scene.getObjectByProperty( 'uuid', uuid ),
				getParam: streams.getParam,
				setParam: streams.setParam
			} );

			events = {
				init: [],
				start: [],
				stop: [],
				keydown: [],
				keyup: [],
				pointerdown: [],
				pointerup: [],
				pointermove: [],
				update: []
			};

			let scriptWrapParams = 'player,renderer,scene,camera';
			const scriptArgs = [ this, renderer, scene, camera ];
			if ( importScriptModule ) {

				scriptWrapParams += ',__publishImport';
				scriptArgs.push( importScriptModule );

			}

			const scriptWrapResultObj = {};
			const eventParams = [];

			for ( var eventKey in events ) {

				eventParams.push( eventKey );
				scriptWrapResultObj[ eventKey ] = eventKey;

			}

			const scriptWrapResult = JSON.stringify( scriptWrapResultObj ).replace( /\"/g, '' );

			for ( const uuid in json.scripts ) {

				const object = scene.getObjectByProperty( 'uuid', uuid, true );

				if ( object === undefined ) {

					console.warn( 'APP.Player: Script without object.', uuid );
					continue;

				}

				const scripts = json.scripts[ uuid ];

				for ( let i = 0; i < scripts.length; i ++ ) {

					const script = scripts[ i ];

					if ( script.generated || script.enabled === false || hasRestriction( object, 'disabled' ) ) continue;

					const source = prepareScript ? prepareScript( script.source ) : script.source;
					const isP5 = script.type === 'p5';
					const body = isP5
						? p5ScriptBody( script, scriptSourceForExecution( script, source ) )
						: scriptSourceForExecution( script, source ) + '\nreturn { events: ' + scriptWrapResult + ', setParameters: typeof setParameters === "function" ? setParameters : null };';
					const signature = isP5
						? [ scriptWrapParams, 'createP5Sketch', ...( script.parameters ? [ 'params' ] : [] ), ...eventParams ].join( ',' )
						: [ scriptWrapParams, ...( script.parameters ? [ 'params' ] : [] ), ...eventParams ].join( ',' );
					const params = script.parameters && { ...script.parameters };
					const args = params ? [ ...scriptArgs, ...( isP5 ? [ createP5Sketch ] : [] ), params ] : [ ...scriptArgs, ...( isP5 ? [ createP5Sketch ] : [] ) ];
					const { events: functions, setParameters } = new Function( signature, body ).call( object, ...args );
					if ( params ) {
						scriptParamObjects.set( uuid + ':' + i, params );
						scriptParameters.set( uuid + ':' + i, next => {

							if ( setParameters ) setParameters.call( object, next );
							Object.assign( params, next );

						} );
					}

					for ( const name in functions ) {

						if ( functions[ name ] === undefined ) continue;

						if ( events[ name ] === undefined ) {

							console.warn( 'APP.Player: Event type not supported (', name, ')' );
							continue;

						}

						events[ name ].push( functions[ name ].bind( object ) );

					}

				}

			}

			dispatch( events.init, arguments );

		};

		this.setScriptParameters = function ( uuid, index, parameters ) {

			scriptParameters.get( uuid + ':' + index )?.( parameters );

		};

		// Controller scripts share the player's update, resize and disposal lifecycle.
		this.setCameraController = function ( object, options ) {

			if ( object !== camera ) return;
			controller?.dispose();
			controller = undefined;
			if ( options.mode && options.mode !== 'none' ) {

				controller = createCameraController( camera, renderer.domElement, {
					target: cameraTarget, ...options
				} );

			}

		};

		this.setCamera = function ( value ) {

			camera = value;
			if ( ! projector ) setCameraAspect( camera, this.width / this.height );

		};

		this.setScene = function ( value ) {

			geometrySimulation?.dispose();
			logic?.stop();
			rigPhysics?.dispose();
			rigPhysics = undefined;
			scene?.traverse( releaseArmatureGeometry );
			nodeComponents.removeTree( scene );
			scene = value;
			nodeComponents.syncTree( scene );
			geometrySimulation = new GeometrySimulation( THREE, scene );
			logic = new LogicRuntime( THREE, scene, streams );

		};

		this.setPixelRatio = function ( pixelRatio ) {

			renderer.setPixelRatio( pixelRatio );

		};

		this.getRenderer = function () {

			return renderer;

		};

		this.getScene = function () {

			return scene;

		};

		this.withArmaturePose = function ( evaluate ) {

			return scene ? withArmatureIK( THREE, scene, evaluate ) : evaluate();

		};

		this.setClearColor = function ( color ) {

			renderer.setClearColor( color );

		};

		this.setSize = function ( width, height ) {

			this.width = width;
			this.height = height;

			if ( camera && ! projector ) {

				setCameraAspect( camera, this.width / this.height );

			}

			if ( renderer ) {

				renderer.setSize( width, height );
				if ( projectorContext ) {

					this.canvas.width = renderer.domElement.width;
					this.canvas.height = renderer.domElement.height;
					this.canvas.style.width = width + 'px';
					this.canvas.style.height = height + 'px';

				}
				controller?.resize();

			}

		};

		function setCameraAspect( camera, aspect ) {

			if ( camera.isPerspectiveCamera ) {

				camera.aspect = aspect;

			} else {

				const frustumHeight = camera.top - camera.bottom;

				camera.left = - frustumHeight * aspect / 2;
				camera.right = frustumHeight * aspect / 2;

			}

			camera.updateProjectionMatrix();

		}

		function dispatch( array, event ) {

			for ( let i = 0, l = array.length; i < l; i ++ ) {

				array[ i ]( event );

			}

		}

		let time, startTime, prevTime, focusBeforePlay;

		const animate = () => {

			time = performance.now();
			const elapsed = ( time - startTime ) / 1000;

			try {

				timeline.apply( timelineData( scene ), elapsed );
				rigPhysics?.applyPose();
				geometrySimulation.advanceTo( elapsed, 8 );
				dispatch( events.update, { time: time - startTime, delta: time - prevTime } );
				logic.tick( elapsed, ( time - prevTime ) / 1000, {
					pointer: pointerPosition( pointer ), camera: pointerCamera(),
					gamepads: logic.usesGamepads && document.hasFocus() ? readGamepads() : undefined
				} );

			} catch ( e ) {

				console.error( ( e.message || e ), ( e.stack || '' ) );

			}

			streams.tick( scene );
			rigPhysics?.advanceTo( elapsed, 8 );
			controller?.update( ( time - prevTime ) / 1000 );
			renderFrame();

			prevTime = time;

		};

		const renderFrame = () => {

			if ( ! this.width || ! this.height ) return;
			if ( projectorContext ) {

				withArmatureDeformation( THREE, scene, () => drawProjectorOutput( projectorContext, projector ) );
				return;

			}
			splatHost.render( renderer, scene, () => withEnabledObjects( scene, () => withArmatureDeformation( THREE, scene, () => withShaderGraphs( renderer, scene, () => {

				const draw = () => renderer.render( scene, camera );
				if ( projector ) {

					lightViewCamera( THREE, projector, camera );
					renderFittedView( THREE, renderer, scene, camera, this.width, this.height, draw );

				} else {

					postHost.render( renderer, scene, camera, this.width, this.height, draw );

				}

			} ) ) ) );
		};

		this.play = function () {

			playing = true;
			startTime = prevTime = performance.now();
			focusBeforePlay = document.activeElement;
			this.canvas.tabIndex = - 1;
			this.canvas.focus( { preventScroll: true } );

			document.addEventListener( 'keydown', onKeyDown );
			document.addEventListener( 'keyup', onKeyUp );
			document.addEventListener( 'pointerdown', onPointerDown );
			document.addEventListener( 'pointerup', onPointerUp );
			document.addEventListener( 'pointermove', onPointerMove );
			document.addEventListener( 'pointerout', onPointerOut );
			document.addEventListener( 'pointercancel', onPointerCancel );
			window.addEventListener( 'blur', onBlur );

			rigPhysics?.initialize();
			dispatch( events.start, arguments );
			logic.start();
			if ( controllerOptions && ! controller ) controller = createCameraController( camera, renderer.domElement, controllerOptions );

			renderer.setAnimationLoop( animate );

		};

		this.stop = function () {

			if ( ! playing ) return;
			playing = false;
			document.removeEventListener( 'keydown', onKeyDown );
			document.removeEventListener( 'keyup', onKeyUp );
			document.removeEventListener( 'pointerdown', onPointerDown );
			document.removeEventListener( 'pointerup', onPointerUp );
			document.removeEventListener( 'pointermove', onPointerMove );
			document.removeEventListener( 'pointerout', onPointerOut );
			document.removeEventListener( 'pointercancel', onPointerCancel );
			window.removeEventListener( 'blur', onBlur );
			pressedKeys.clear();
			pressedButtons.clear();
			pointer = undefined;

			renderer.setAnimationLoop( null );
			controller?.dispose();
			controller = undefined;
			timeline?.clear();
			try {

				dispatch( events.stop, arguments );

			} finally {

				geometrySimulation?.reset();
				rigPhysics?.dispose();
				logic?.stop();
				if ( focusBeforePlay?.isConnected ) focusBeforePlay.focus( { preventScroll: true } );
				focusBeforePlay = null;

			}

		};

		let lastRender = 0;
		this.render = function ( time ) {

			rigPhysics?.initialize();
			rigPhysics?.rewindIfNeeded( time );
			timeline.apply( timelineData( scene ), time );
			rigPhysics?.applyPose();
			geometrySimulation.advanceTo( time );
			dispatch( events.update, { time: time * 1000, delta: 0 /* TODO */ } );
			logic.tick( time, Math.max( 0, time - lastRender ) );
			lastRender = time;
			streams.tick( scene );
			rigPhysics?.advanceTo( time );

			renderFrame();

		};

		this.dispose = function () {

			timeline?.clear();
			timeline = null;
			geometrySimulation?.dispose();
			geometrySimulation = null;
			rigPhysics?.dispose();
			rigPhysics = undefined;
			scene?.traverse( releaseArmatureGeometry );
			nodeComponents.removeTree( scene );
			logic?.stop();
			logic = null;
			lastRender = 0;
			postHost.dispose();
			splatHost?.dispose();
			splatHost = null;
			controller?.dispose();
			controller = undefined;
			if ( renderer ) {

				renderer.dispose();

			}

			scriptParameters.clear();
			streams.getParam = streams.setParam = null;
			camera = undefined;
			scene = undefined;
			projector = projectorContext = null;

		};

		//

		function isPlayerControl( event ) {

			return event.target?.closest?.( '[data-player-controls]' );

		}

		function onKeyDown( event ) {

			if ( isPlayerControl( event ) ) return;
			pressedKeys.add( event.code );
			streams.publish( 'input.key.' + event.code, 1 );
			streams.emit( 'keydown', { key: event.key, code: event.code, repeat: event.repeat } );
			dispatch( events.keydown, event );

		}

		function onKeyUp( event ) {

			const wasPressed = pressedKeys.delete( event.code );
			if ( isPlayerControl( event ) && ! wasPressed ) return;
			streams.publish( 'input.key.' + event.code, 0 );
			streams.emit( 'keyup', { key: event.key, code: event.code } );
			dispatch( events.keyup, event );

		}

		function onBlur() {

			pressedKeys.clear();
			pressedButtons.clear();
			pointer = undefined;
			logic?.releaseInput();

		}

		function pointerPosition( event ) {

			if ( ! event || ! logic.usesPointer || event.target !== renderer.domElement || projectorContext ) return;
			let { left: x, top: y, width, height } = renderer.domElement.getBoundingClientRect();
			if ( ! width || ! height ) return;
			if ( projector ) ( { x, y, width, height } = fitView( { x, y, width, height }, camera.aspect ) );
			const u = ( event.clientX - x ) / width;
			const v = ( event.clientY - y ) / height;
			if ( u >= 0 && u <= 1 && v >= 0 && v <= 1 ) return { x: u, y: v };

		}

		function pointerCamera() {

			if ( logic.usesPointer && ! projectorContext ) return projector ? lightViewCamera( THREE, projector, camera ) : camera;

		}

		function onPointerDown( event ) {

			pointer = event;
			if ( isPlayerControl( event ) ) return;
			pressedButtons.add( event.button );
			streams.publish( 'input.pointer', 1 );
			streams.emit( 'pointerdown', logic.pointerDetail( event.button, pointerPosition( event ), pointerCamera() ) );
			dispatch( events.pointerdown, event );

		}

		function onPointerUp( event ) {

			pointer = event.pointerType === 'touch' ? undefined : event;
			const wasPressed = pressedButtons.delete( event.button );
			if ( isPlayerControl( event ) && ! wasPressed ) return;
			streams.publish( 'input.pointer', 0 );
			streams.emit( 'pointerup', logic.pointerDetail( event.button, pointerPosition( event ), pointerCamera() ) );
			dispatch( events.pointerup, event );

		}

		function onPointerMove( event ) {

			pointer = event;
			if ( isPlayerControl( event ) ) return;
			dispatch( events.pointermove, event );

		}

		function onPointerOut( event ) {

			if ( ! event.relatedTarget || event.target === renderer.domElement ) pointer = undefined;

		}

		function onPointerCancel() {

			pointer = undefined;
			pressedButtons.clear();
			streams.publish( 'input.pointer', 0 );

		}

	}

};

export { APP };
