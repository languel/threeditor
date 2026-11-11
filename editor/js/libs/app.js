import { StreamRouter } from '../streams/StreamRouter.js';
import { SplatHost } from '../assets/SplatHost.js';
import { PostProcessingHost } from '../PostProcessing.js';
/* global THREE, __THREEEDITOR_RENDERER__ */
import { createCameraController } from 'three/addons/controls/CameraController.js';
import { hasRestriction, withEnabledObjects } from '../ObjectRestrictions.js';
import { scriptSourceForExecution } from '../ScriptParams.js';
import { createP5Sketch } from '../P5Sketch.js';

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
		let camera, scene;

		let events = {};
		const splatHost = new SplatHost();
		const postHost = new PostProcessingHost();
		const scriptParameters = new Map();
		let playing = false;

		const dom = document.createElement( 'div' );

		this.dom = dom;
		this.streams = streams;
		this.canvas = null;

		this.width = 500;
		this.height = 500;

		this.load = async function ( json ) {

			const project = json.project;

			// Create renderer based on project settings

			if ( renderer !== undefined ) {

				controller?.dispose();
				controller = undefined;
				renderer.dispose();
				dom.removeChild( renderer.domElement );
				this.canvas = null;

			}

			// A single-file player knows its renderer at build time.
			if ( typeof __THREEEDITOR_RENDERER__ === 'undefined'
				? project.renderer === 'WebGPURenderer'
				: __THREEEDITOR_RENDERER__ === 'WebGPURenderer' ) {

				const { WebGPURenderer } = await import( 'three/webgpu' );
				renderer = new WebGPURenderer( { antialias: true, reversedDepthBuffer: true } );
				await renderer.init();

			} else {

				renderer = new THREE.WebGLRenderer( { antialias: true, reversedDepthBuffer: true } );

			}

			renderer.setPixelRatio( window.devicePixelRatio );

			if ( project.shadows !== undefined ) renderer.shadowMap.enabled = project.shadows;
			if ( project.shadowType !== undefined ) renderer.shadowMap.type = project.shadowType;
			if ( project.toneMapping !== undefined ) renderer.toneMapping = project.toneMapping;
			if ( project.toneMappingExposure !== undefined ) renderer.toneMappingExposure = project.toneMappingExposure;

			dom.appendChild( renderer.domElement );
			this.canvas = renderer.domElement;

			this.setScene( loader.parse( json.scene ) );
			const sceneCamera = scene.getObjectByProperty( 'uuid', json.mainCamera || json.viewportCamera || json.camera.object.uuid );
			this.setCamera( sceneCamera?.isCamera && ! hasRestriction( sceneCamera, 'disabled' ) ? sceneCamera : loader.parse( json.camera ) );
			const hasControllerScript = json.scripts?.[ camera.uuid ]?.some( script => script.cameraController === true );
			const mode = hasControllerScript ? 'none' : project.cameraController || camera.userData.threeditor?.cameraController;
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
			setCameraAspect( camera, this.width / this.height );

		};

		this.setScene = function ( value ) {

			scene = value;

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

		this.setClearColor = function ( color ) {

			renderer.setClearColor( color );

		};

		this.setSize = function ( width, height ) {

			this.width = width;
			this.height = height;

			if ( camera ) {

				setCameraAspect( camera, this.width / this.height );

			}

			if ( renderer ) {

				renderer.setSize( width, height );
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

		let time, startTime, prevTime;

		function animate() {

			time = performance.now();

			try {

				dispatch( events.update, { time: time - startTime, delta: time - prevTime } );

			} catch ( e ) {

				console.error( ( e.message || e ), ( e.stack || '' ) );

			}

			streams.tick( scene );
			controller?.update( ( time - prevTime ) / 1000 );
			postHost.render( renderer, scene, camera, this.width, this.height, () => splatHost.render( renderer, scene, () => withEnabledObjects( scene, () => renderer.render( scene, camera ) ) ) );

			prevTime = time;

		}

		this.play = function () {

			playing = true;
			startTime = prevTime = performance.now();

			document.addEventListener( 'keydown', onKeyDown );
			document.addEventListener( 'keyup', onKeyUp );
			document.addEventListener( 'pointerdown', onPointerDown );
			document.addEventListener( 'pointerup', onPointerUp );
			document.addEventListener( 'pointermove', onPointerMove );

			dispatch( events.start, arguments );
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

			renderer.setAnimationLoop( null );
			controller?.dispose();
			controller = undefined;
			dispatch( events.stop, arguments );

		};

		this.render = function ( time ) {

			dispatch( events.update, { time: time * 1000, delta: 0 /* TODO */ } );
			streams.tick( scene );

			postHost.render( renderer, scene, camera, this.width, this.height, () => splatHost.render( renderer, scene, () => withEnabledObjects( scene, () => renderer.render( scene, camera ) ) ) );

		};

		this.dispose = function () {

			postHost.dispose();
			splatHost.dispose();
			controller?.dispose();
			controller = undefined;
			if ( renderer ) {

				renderer.dispose();

			}

			scriptParameters.clear();
			streams.getParam = streams.setParam = null;
			camera = undefined;
			scene = undefined;

		};

		//

		function onKeyDown( event ) {

			streams.publish( 'input.key.' + event.code, 1 );
			streams.emit( 'keydown', { key: event.key, code: event.code } );
			dispatch( events.keydown, event );

		}

		function onKeyUp( event ) {

			streams.publish( 'input.key.' + event.code, 0 );
			streams.emit( 'keyup', { key: event.key, code: event.code } );
			dispatch( events.keyup, event );

		}

		function onPointerDown( event ) {

			streams.publish( 'input.pointer', 1 );
			streams.emit( 'pointerdown', { button: event.button } );
			dispatch( events.pointerdown, event );

		}

		function onPointerUp( event ) {

			streams.publish( 'input.pointer', 0 );
			streams.emit( 'pointerup', { button: event.button } );
			dispatch( events.pointerup, event );

		}

		function onPointerMove( event ) {

			dispatch( events.pointermove, event );

		}

	}

};

export { APP };
