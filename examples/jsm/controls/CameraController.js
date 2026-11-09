import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import { OrbitControls } from './OrbitControls.js';
import { FirstPersonControls } from './FirstPersonControls.js';

// Match the director's fly axes, sensitivity and speed wheel while keeping
// pointer capture local to the canvas and requiring a drag for mouse look.
function dragFly( view, element, movementSpeed, lookSpeed ) {

	const keys = new Set();
	const euler = new Euler().setFromQuaternion( view.quaternion, 'YXZ' );
	const right = new Vector3(), forward = new Vector3();
	const win = element.ownerDocument.defaultView;
	const listeners = new AbortController();
	const { signal } = listeners;
	let pointer = null;
	let speed = movementSpeed;
	const tracked = [ 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight' ];

	element.addEventListener( 'pointerdown', event => {

		if ( event.button !== 0 || pointer !== null ) return;
		pointer = event.pointerId;
		element.setPointerCapture( pointer );
		event.preventDefault();

	}, { signal } );
	element.addEventListener( 'pointermove', event => {

		if ( event.pointerId !== pointer ) return;
		const sensitivity = .002 * lookSpeed / .08;
		euler.y -= event.movementX * sensitivity;
		euler.x = MathUtils.clamp( euler.x - event.movementY * sensitivity, - Math.PI / 2 + .01, Math.PI / 2 - .01 );
		view.quaternion.setFromEuler( euler );

	}, { signal } );
	for ( const type of [ 'pointerup', 'pointercancel', 'lostpointercapture' ] ) {

		element.addEventListener( type, event => { if ( event.pointerId === pointer ) pointer = null; }, { signal } );

	}
	element.addEventListener( 'wheel', event => {

		event.preventDefault();
		speed = MathUtils.clamp( speed * Math.exp( - event.deltaY * .001 ), .05, 100 );

	}, { signal, passive: false } );
	win.addEventListener( 'keydown', event => {

		if ( ! tracked.includes( event.code ) || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey ||
			event.target?.closest?.( 'input, textarea, select, button, [contenteditable]' ) ) return;
		event.preventDefault();
		event.stopPropagation();
		keys.add( event.code );

	}, { signal, capture: true } );
	win.addEventListener( 'keyup', event => keys.delete( event.code ), { signal } );
	win.addEventListener( 'blur', () => keys.clear(), { signal } );

	return {
		update( delta ) {

			const step = speed * ( keys.has( 'ShiftLeft' ) || keys.has( 'ShiftRight' ) ? 3 : 1 ) * delta;
			forward.set( 0, 0, -1 ).applyQuaternion( view.quaternion );
			right.set( 1, 0, 0 ).applyQuaternion( view.quaternion );
			view.position.addScaledVector( forward, step * ( Number( keys.has( 'KeyW' ) ) - Number( keys.has( 'KeyS' ) ) ) );
			view.position.addScaledVector( right, step * ( Number( keys.has( 'KeyD' ) ) - Number( keys.has( 'KeyA' ) ) ) );
			view.position.y += step * ( Number( keys.has( 'KeyE' ) ) - Number( keys.has( 'KeyQ' ) ) );

		},
		dispose() {

			listeners.abort();
			if ( pointer !== null && element.hasPointerCapture( pointer ) ) element.releasePointerCapture( pointer );

		}
	};

}

function createCameraController( camera, element, { mode, target, follow, movementSpeed = 4, lookSpeed = 0.08, rotateSpeed = 1, zoomSpeed = 1, panSpeed = 1, enablePan = true, enableZoom = true } ) {

	// The stock controls operate in world coordinates. Use an unparented
	// camera for input when the actual camera belongs to a scene or rig.
	const view = camera.parent ? camera.clone( false ) : camera;
	const position = camera.getWorldPosition( new Vector3() );
	const rotation = camera.getWorldQuaternion( new Quaternion() );
	const parentRotation = new Quaternion();
	view.position.copy( position );
	view.quaternion.copy( rotation );
	const direction = new Vector3( 0, 0, - 1 ).applyQuaternion( rotation );
	let controls;
	let followPosition;
	const offset = new Vector3();

	function sync() {

		if ( view === camera ) return;
		camera.position.copy( view.position );
		camera.parent.worldToLocal( camera.position );
		camera.parent.getWorldQuaternion( parentRotation ).invert();
		camera.quaternion.copy( view.quaternion ).premultiply( parentRotation );
		if ( camera.zoom !== view.zoom ) {

			camera.zoom = view.zoom;
			camera.updateProjectionMatrix();

		}

	}

	if ( mode === 'fly' ) {

		controls = dragFly( view, element, movementSpeed, lookSpeed );

	} else if ( mode === 'firstPerson' ) {

		controls = new FirstPersonControls( view, element );
		controls.movementSpeed = movementSpeed;
		controls.lookSpeed = lookSpeed;
		controls.lookAt( position.clone().add( direction ) );

	} else {

		view.up.set( 0, 1, 0 );
		controls = new OrbitControls( view, element );
		controls.rotateSpeed = rotateSpeed;
		controls.zoomSpeed = zoomSpeed;
		controls.panSpeed = panSpeed;
		controls.enablePan = enablePan;
		controls.enableZoom = enableZoom;
		view.position.copy( position );
		if ( mode === 'thirdPerson' && follow ) followPosition = follow.getWorldPosition( new Vector3() );
		const distance = target ? Math.max( 0.01, position.distanceTo( new Vector3().fromArray( target ) ) ) : 4;
		const pivot = followPosition || position.clone().addScaledVector( direction, distance );
		controls.target.copy( pivot );
		controls.update();

	}

	return {
		update( delta ) {

			if ( followPosition ) {

				follow.getWorldPosition( offset ).sub( followPosition );
				view.position.add( offset );
				controls.target.add( offset );
				followPosition.add( offset );

			}
			controls.update( Math.min( Math.max( delta, 0 ), 0.1 ) );
			sync();

		},
		resize() {

			if ( view !== camera && camera.isOrthographicCamera ) {

				view.left = camera.left;
				view.right = camera.right;
				view.top = camera.top;
				view.bottom = camera.bottom;
				view.updateProjectionMatrix();

			}

		},
		dispose() { controls.dispose(); }
	};

}

export { createCameraController };
