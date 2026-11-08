import { Quaternion, Vector3 } from 'three';
import { OrbitControls } from './OrbitControls.js';
import { FlyControls } from './FlyControls.js';
import { FirstPersonControls } from './FirstPersonControls.js';

function createCameraController( camera, element, { mode, target, follow } ) {

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

		controls = new FlyControls( view, element );
		controls.dragToLook = true;
		controls.movementSpeed = 4;

	} else if ( mode === 'firstPerson' ) {

		controls = new FirstPersonControls( view, element );
		controls.movementSpeed = 4;
		controls.lookSpeed = 0.08;
		controls.lookAt( position.clone().add( direction ) );

	} else {

		view.up.set( 0, 1, 0 ).applyQuaternion( rotation );
		controls = new OrbitControls( view, element );
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
