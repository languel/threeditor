import { projectorOptics, isProjector } from '../assets/Projector.js';

export function hasLightView( object ) {

	return isProjector( object ) || object?.isSpotLight || object?.isDirectionalLight ||
		object?.isPointLight || object?.isRectAreaLight || object?.isHemisphereLight;

}

export function fitView( rect, aspect ) {

	if ( ! Number.isFinite( aspect ) || aspect <= 0 ) aspect = 1;
	const width = Math.max( 1, Math.floor( Math.min( rect.width, rect.height * aspect ) ) );
	const height = Math.max( 1, Math.floor( Math.min( rect.height, width / aspect ) ) );
	return { x: rect.x + Math.floor( ( rect.width - width ) / 2 ), y: rect.y + Math.floor( ( rect.height - height ) / 2 ), width, height };

}

export function syncProjectorView( THREE, object, camera ) {

	const frame = object.projectorFrame || { ...projectorOptics( 1.2, 16 / 9 ), range: 20 };
	object.getWorldPosition( camera.position );
	camera.fov = THREE.MathUtils.radToDeg( 2 * Math.atan( frame.height ) );
	camera.aspect = frame.width / frame.height;
	camera.near = .01;
	camera.far = Math.max( camera.near + .01, frame.range );
	camera.up.setFromMatrixColumn( object.matrixWorld, 1 ).normalize();
	const target = new THREE.Vector3().setFromMatrixColumn( object.matrixWorld, 2 ).normalize().negate().add( camera.position );
	camera.lookAt( target );
	camera.updateProjectionMatrix();
	camera.updateMatrixWorld( true );
	return camera;

}

export function lightViewCamera( THREE, object, camera ) {

	const ortho = object.isDirectionalLight === true;
	if ( ! camera || ortho !== ( camera.isOrthographicCamera === true ) ) camera = ortho ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera();
	if ( isProjector( object ) ) return syncProjectorView( THREE, object, camera );
	object.getWorldPosition( camera.position );
	const target = new THREE.Vector3();
	camera.up.copy( object.up );

	if ( object.isSpotLight || ortho ) {

		const shadow = object.shadow;
		const optics = shadow.camera;
		camera.up.copy( optics.up );
		camera.near = optics.near;
		camera.far = object.distance || optics.far;
		if ( ortho ) {

			camera.left = optics.left;
			camera.right = optics.right;
			camera.top = optics.top;
			camera.bottom = optics.bottom;

		} else {

			camera.fov = THREE.MathUtils.clamp( THREE.MathUtils.radToDeg( object.angle * 2 * shadow.focus ), .01, 179 );
			camera.aspect = shadow.aspect * shadow.mapSize.x / shadow.mapSize.y;

		}
		object.target.getWorldPosition( target );

	} else {

		camera.fov = 90;
		camera.aspect = 1;
		camera.near = .05;
		camera.far = object.distance > .05 ? object.distance : 1000;
		camera.up.setFromMatrixColumn( object.matrixWorld, 1 ).normalize();
		if ( ! object.isHemisphereLight ) target.setFromMatrixColumn( object.matrixWorld, 2 ).normalize().negate().add( camera.position );

	}
	camera.far = Math.max( camera.near + .01, camera.far );
	camera.lookAt( target );
	camera.updateProjectionMatrix();
	camera.updateMatrixWorld( true );
	return camera;

}
