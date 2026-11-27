import { forEachVertex, randomAt, sampleField } from './GeometryFields.js';
import { joinGeometry } from './GeometryOperations.js';

function pointCloud( THREE, positions, normals ) {

	return new THREE.BufferGeometry()
		.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) )
		.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );

}

export function verticesToPoints( THREE, geometry, merge, selection ) {

	const positions = [], normals = [];
	const seen = new Set();
	forEachVertex( THREE, geometry, element => {

		if ( sampleField( selection, element ) <= 0 ) return;
		const point = element.position.toArray();
		if ( merge ) {

			const key = point.join( ',' );
			if ( seen.has( key ) ) return;
			seen.add( key );

		}
		positions.push( ...point );
		normals.push( ...element.normal.toArray() );

	} );
	return pointCloud( THREE, positions, normals );

}

export function distributeOnFaces( THREE, geometry, count, seed ) {

	const position = geometry.getAttribute( 'position' );
	const normal = geometry.getAttribute( 'normal' );
	const index = geometry.index;
	const indices = i => index ? index.getX( i ) : i;
	const triangle = new THREE.Triangle();
	const point = new THREE.Vector3(), direction = new THREE.Vector3(), temp = new THREE.Vector3();
	const offsets = [], areas = [];
	const size = index?.count ?? position.count;
	let total = 0;
	function readTriangle( i ) {

		triangle.a.fromBufferAttribute( position, indices( i ) );
		triangle.b.fromBufferAttribute( position, indices( i + 1 ) );
		triangle.c.fromBufferAttribute( position, indices( i + 2 ) );

	}
	for ( let i = 0; i + 2 < size; i += 3 ) {

		readTriangle( i );
		const area = triangle.getArea();
		if ( area <= 0 ) continue;
		total += area;
		offsets.push( i );
		areas.push( total );

	}
	if ( ! Number.isFinite( total ) ) throw new Error( 'Cannot distribute points on non-finite faces.' );
	if ( ! total ) count = 0;
	const positions = new Float32Array( count * 3 ), normals = new Float32Array( count * 3 );
	for ( let i = 0; i < count; i ++ ) {

		const area = randomAt( seed, i * 3 ) * total;
		let lo = 0, hi = areas.length - 1;
		while ( lo < hi ) {

			const mid = ( lo + hi ) >>> 1;
			if ( area < areas[ mid ] ) hi = mid;
			else lo = mid + 1;

		}
		const offset = offsets[ lo ];
		readTriangle( offset );
		const u = Math.sqrt( randomAt( seed, i * 3 + 1 ) ), v = randomAt( seed, i * 3 + 2 );
		const weights = [ 1 - u, u * ( 1 - v ), u * v ];
		point.copy( triangle.a ).multiplyScalar( weights[ 0 ] ).addScaledVector( triangle.b, weights[ 1 ] ).addScaledVector( triangle.c, weights[ 2 ] );
		if ( normal ) {

			direction.set( 0, 0, 0 );
			for ( let k = 0; k < 3; k ++ ) direction.addScaledVector( temp.fromBufferAttribute( normal, indices( offset + k ) ), weights[ k ] );
			direction.normalize();

		} else triangle.getNormal( direction );
		point.toArray( positions, i * 3 );
		direction.toArray( normals, i * 3 );

	}
	return pointCloud( THREE, positions, normals );

}

export function realizeInstances( THREE, instances, checkVertices ) {

	const { points, mesh, align, scale, rotation, selection } = instances;
	const size = mesh.attributes.position.count;
	const copies = [];
	const up = new THREE.Vector3( 0, 1, 0 ), vector = new THREE.Vector3(), normal = new THREE.Vector3();
	const orientation = new THREE.Quaternion(), yaw = new THREE.Quaternion(), matrix = new THREE.Matrix4();
	try {

		forEachVertex( THREE, points, element => {

			if ( sampleField( selection, element ) <= 0 ) return;
			const factor = sampleField( scale, element );
			const angle = sampleField( rotation, element ) * Math.PI / 180;
			if ( ! Number.isFinite( factor ) || ! Number.isFinite( angle ) || factor < 0 ) throw new Error( 'Instance scale and rotation must be finite, with a nonnegative scale.' );
			if ( ! factor ) return;
			if ( copies.length >= 20000 || ( copies.length + 1 ) * size > 1e6 ) throw new Error( 'Realize Instances exceeds the mesh budget.' );
			checkVertices( ( copies.length + 1 ) * size );
			orientation.identity();
			if ( align && element.normal.lengthSq() ) orientation.setFromUnitVectors( up, normal.copy( element.normal ).normalize() );
			orientation.multiply( yaw.setFromAxisAngle( up, angle ) );
			matrix.compose( element.position, orientation, vector.setScalar( factor ) );
			copies.push( new THREE.BufferGeometry().copy( mesh ).applyMatrix4( matrix ) );

		} );
		if ( copies.length ) return joinGeometry( THREE, copies );
		return new THREE.BufferGeometry().setAttribute( 'position', new THREE.Float32BufferAttribute( [], 3 ) );

	} finally {

		for ( const copy of copies ) copy.dispose();

	}

}
