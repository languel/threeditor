import { lightViewCamera } from './LightView.js';

function addOpticsBody( THREE, helper, projector ) {

	const vertices = [];
	const line = ( a, b ) => vertices.push( ...a, ...b );
	const loop = points => points.forEach( ( point, i ) => line( point, points[ ( i + 1 ) % points.length ] ) );
	const rectangle = ( halfWidth, bottom, top, z ) => [
		[ - halfWidth, bottom, z ], [ halfWidth, bottom, z ], [ halfWidth, top, z ], [ - halfWidth, top, z ]
	];

	const width = projector ? .19 : .125;
	const height = projector ? .085 : .10;
	const depth = projector ? .30 : .22;
	// The lens is at the optical origin. The housing extends toward +Z,
	// behind the image plane of the camera or projector.
	const face = rectangle( width, - height, height, .06 );
	const back = rectangle( width, - height, height, depth );
	loop( face );
	loop( back );
	face.forEach( ( point, i ) => line( point, back[ i ] ) );

	const radius = projector ? .062 : .075;
	const ring = z => Array.from( { length: 8 }, ( _, i ) => {
		const angle = i * Math.PI / 4;
		return [ Math.cos( angle ) * radius, Math.sin( angle ) * radius, z ];
	} );
	const lens = ring( 0 ), mount = ring( .06 );
	loop( lens );
	loop( mount );
	for ( const i of [ 0, 2, 4, 6 ] ) line( lens[ i ], mount[ i ] );

	if ( projector ) {

		for ( const y of [ - .035, 0, .035 ] ) line( [ width, y, .13 ], [ width, y, .24 ] );

	} else {

		const front = rectangle( .052, height, height + .042, .10 );
		const rear = rectangle( .052, height, height + .042, .20 );
		loop( front );
		loop( rear );
		front.forEach( ( point, i ) => line( point, rear[ i ] ) );

	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
	const material = new THREE.LineBasicMaterial( { color: 0xff9d3d, toneMapped: false } );
	const body = new THREE.LineSegments( geometry, material );
	body.name = projector ? 'Projector body' : 'Camera body';
	helper.add( body );

	const dispose = helper.dispose.bind( helper );
	helper.dispose = () => {

		dispose();
		geometry.dispose();
		material.dispose();

	};

}

export function createCameraHelper( THREE, camera ) {

	const helper = new THREE.CameraHelper( camera );
	addOpticsBody( THREE, helper, false );
	return helper;

}

export function createProjectorHelper( THREE, object ) {

	const camera = lightViewCamera( THREE, object );
	const helper = new THREE.CameraHelper( camera );
	helper.type = 'ProjectorHelper';
	helper.frustumCulled = false;
	const amber = new THREE.Color( 0xffa044 );
	helper.setColors( amber, amber, amber, amber, amber );
	helper.material.transparent = true;
	helper.material.opacity = .55;
	helper.material.depthWrite = false;

	const update = helper.update.bind( helper );
	let previousFrame = object.projectorFrame;
	helper.update = function () {

		const frame = object.projectorFrame;
		lightViewCamera( THREE, object, camera );
		this.material.visible = !! frame;
		if ( frame !== previousFrame ) {

			previousFrame = frame;
			update();

		}

	};
	const updateMatrixWorld = helper.updateMatrixWorld.bind( helper );
	helper.updateMatrixWorld = function ( force ) {

		this.update();
		updateMatrixWorld( force );

	};
	helper.update();
	addOpticsBody( THREE, helper, true );
	return helper;

}
