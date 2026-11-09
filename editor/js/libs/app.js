/* global THREE, __THREEEDITOR_RENDERER__ */
import { createCameraController } from 'three/addons/controls/CameraController.js';
import { scriptSourceForExecution } from '../ScriptParams.js';

const APP = {

	Player: function ( importScriptModule, prepareScript ) {

		let renderer;
		let controller, controllerOptions, cameraTarget;

		const loader = new THREE.ObjectLoader();
		let camera, scene;

		let events = {};
		let playing = false;

		const dom = document.createElement( 'div' );

		this.dom = dom;
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
			const sceneCamera = scene.getObjectByProperty( 'uuid', json.viewportCamera || json.camera.object.uuid );
			this.setCamera( sceneCamera?.isCamera ? sceneCamera : loader.parse( json.camera ) );
			const hasControllerScript = json.scripts?.[ camera.uuid ]?.some( script => script.cameraController === true );
			const mode = hasControllerScript ? 'none' : project.cameraController || camera.userData.threeditor?.cameraController;
			cameraTarget = json.viewportTarget || json.controls?.center;
			controllerOptions = mode && mode !== 'none' ? {
				mode,
				target: cameraTarget,
				follow: scene.getObjectByProperty( 'uuid', camera.userData.threeditor?.cameraFollow )
			} : null;

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

					if ( script.generated || script.enabled === false ) continue;

					const source = prepareScript ? prepareScript( script.source ) : script.source;
					const body = scriptSourceForExecution( script, source ) + '\nreturn ' + scriptWrapResult + ';';
					const signature = [ scriptWrapParams, ...( script.parameters ? [ 'params' ] : [] ), ...eventParams ].join( ',' );
					const args = script.parameters ? [ ...scriptArgs, { ...script.parameters } ] : scriptArgs;
					const functions = new Function( signature, body ).call( object, ...args );

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

			controller?.update( ( time - prevTime ) / 1000 );
			renderer.render( scene, camera );

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

			renderer.render( scene, camera );

		};

		this.dispose = function () {

			controller?.dispose();
			controller = undefined;
			if ( renderer ) {

				renderer.dispose();

			}

			camera = undefined;
			scene = undefined;

		};

		//

		function onKeyDown( event ) {

			dispatch( events.keydown, event );

		}

		function onKeyUp( event ) {

			dispatch( events.keyup, event );

		}

		function onPointerDown( event ) {

			dispatch( events.pointerdown, event );

		}

		function onPointerUp( event ) {

			dispatch( events.pointerup, event );

		}

		function onPointerMove( event ) {

			dispatch( events.pointermove, event );

		}

	}

};

export { APP };
