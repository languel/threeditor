import { fieldInput, sampleField } from './GeometryFields.js';
import { numberInput } from './ValueNodes.js';

const curve = { curve: { label: 'Curve', type: 'curve' } };
const vector = ( label, value ) => ( { label, type: 'vec3', ...( value ? { default: value } : {} ) } );
const modes = ( options, value = options[ 0 ] ) => ( { label: 'Mode', type: 'string', default: value, options } );
const resolution = ( value, min = 2 ) => numberInput( 'Resolution', value, min, 4096 );
const radius = ( label, value ) => numberInput( label, value, .0001, 1e6 );
const distance = ( label, value ) => numberInput( label, value, 0, 1e12 );
const sampleMode = modes( [ 'Factor', 'Length' ] );
const spacing = {
	count: numberInput( 'Count', 32, 1, 4096 ),
	length: numberInput( 'Length', .25, .0001, 1e6 )
};

export const CURVE_NODES = [
	[ 'curve.line', 'Curve Line', { start: vector( 'Start', [ 0, 0, 0 ] ), end: vector( 'End', [ 0, 2, 0 ] ) } ],
	[ 'curve.circle', 'Curve Circle', { radius: radius( 'Radius', 1 ), resolution: resolution( 32, 3 ) } ],
	[ 'curve.bezier', 'Bézier Segment', {
		start: vector( 'Start', [ 0, 0, 0 ] ), startHandle: vector( 'Start Handle', [ 1, 0, 0 ] ),
		endHandle: vector( 'End Handle', [ 1, 2, 0 ] ), end: vector( 'End', [ 0, 2, 0 ] ), resolution: resolution( 32 )
	} ],
	[ 'curve.spiral', 'Spiral', {
		startRadius: radius( 'Start Radius', 1 ), endRadius: radius( 'End Radius', .5 ),
		height: numberInput( 'Height', 2 ), turns: numberInput( 'Rotations', 2, - 256, 256 ), resolution: resolution( 80 )
	} ],
	[ 'curve.join', 'Join Curves', { ...curve, other: { label: 'Other Curve', type: 'curve' } } ],
	[ 'curve.reverse', 'Reverse Curve', curve ],
	[ 'curve.resample', 'Resample Curve', { ...curve, mode: modes( [ 'Count', 'Length', 'Evaluated' ] ), ...spacing } ],
	[ 'curve.trim', 'Trim Curve', {
		...curve, mode: sampleMode, start: distance( 'Start', 0 ), end: distance( 'End', 1 )
	} ],
	[ 'curve.length', 'Curve Length', curve, { length: { label: 'Length', type: 'number' } } ],
	[ 'curve.sample', 'Sample Curve', { ...curve, mode: sampleMode, at: distance( 'Factor or Length', .5 ) }, {
		position: vector( 'Position' ), tangent: vector( 'Tangent' ), normal: vector( 'Normal' )
	} ],
	[ 'curve.points', 'Curve to Points', {
		...curve, mode: modes( [ 'Evaluated', 'Count', 'Length' ] ), ...spacing,
		align: { label: 'Point Orientation', type: 'string', default: 'Tangent', options: [ 'Normal', 'Tangent' ] }
	}, { points: { label: 'Points', type: 'points' } } ],
	[ 'curve.mesh', 'Curve to Mesh', {
		...curve, profile: { label: 'Profile Curve', type: 'curve' }, scale: fieldInput( 'Scale', 1 ),
		caps: { label: 'Fill Caps', type: 'boolean', default: true }
	}, { geometry: { label: 'Geometry', type: 'geometry' } } ]
].map( ( [ type, label, inputs, outputs = curve ] ) => [ type, { label, category: 'Curves', inputs, outputs } ] );

function spline( input, cyclic = false ) {

	const points = input.filter( ( point, index ) => ! index || ! point.equals( input[ index - 1 ] ) );
	if ( points.some( point => ! finitePosition( point ) ) ) {

		throw new Error( 'Curve positions are outside the supported range.' );

	}
	if ( cyclic && points.length > 1 && points[ 0 ].equals( points.at( - 1 ) ) ) points.pop();
	cyclic &&= points.length > 2;
	const distances = [ 0 ];
	for ( let i = 1; i < points.length; i ++ ) distances.push( distances.at( - 1 ) + points[ i ].distanceTo( points[ i - 1 ] ) );
	if ( cyclic ) distances.push( distances.at( - 1 ) + points[ 0 ].distanceTo( points.at( - 1 ) ) );
	return { points, distances, length: distances.at( - 1 ), cyclic };

}

function finitePosition( { x, y, z } ) {

	return Number.isFinite( Math.fround( x ) ) && Number.isFinite( Math.fround( y ) ) && Number.isFinite( Math.fround( z ) );

}

function frames( THREE, path ) {

	if ( path.frames ) return path.frames;
	const { points, cyclic, distances, length } = path;
	const count = points.length;
	const difference = new THREE.Vector3();
	const tangents = points.map( ( point, i ) => {

		const prev = cyclic ? ( i - 1 + count ) % count : Math.max( 0, i - 1 );
		const next = cyclic ? ( i + 1 ) % count : Math.min( count - 1, i + 1 );
		const out = new THREE.Vector3().subVectors( points[ next ], point ).normalize();
		const tangent = difference.subVectors( point, points[ prev ] ).normalize().add( out ).clone();
		if ( ! tangent.lengthSq() ) return out.lengthSq() ? out : out.set( 0, 1, 0 );
		return tangent.normalize();

	} );

	const rotation = new THREE.Quaternion();
	const first = tangents[ 0 ];
	const up = new THREE.Vector3( 0, 1, 0 );
	if ( Math.abs( first.dot( up ) ) > .99 ) up.set( 1, 0, 0 );
	const normals = [ up.addScaledVector( first, - first.dot( up ) ).normalize() ];
	for ( let i = 1; i < count; i ++ ) {

		rotation.setFromUnitVectors( tangents[ i - 1 ], tangents[ i ] );
		normals.push( normals[ i - 1 ].clone().applyQuaternion( rotation ) );

	}

	// Distribute the residual rotation around closed paths to align the seam.
	if ( cyclic ) {

		rotation.setFromUnitVectors( tangents.at( - 1 ), first );
		const last = normals.at( - 1 ).clone().applyQuaternion( rotation );
		const angle = Math.atan2( difference.crossVectors( last, normals[ 0 ] ).dot( first ), last.dot( normals[ 0 ] ) );
		for ( let i = 1; i < count; i ++ ) normals[ i ].applyAxisAngle( tangents[ i ], angle * distances[ i ] / length );

	}

	return path.frames = { tangents, normals };

}

function sample( path, at, orientation ) {

	const { points, distances, length } = path;
	at = Math.min( length, Math.max( 0, at ) );
	let left = 0, right = distances.length - 1;
	while ( right - left > 1 ) {

		const mid = ( left + right ) >>> 1;
		if ( distances[ mid ] <= at ) left = mid;
		else right = mid;

	}
	const next = right % points.length;
	const factor = right > left ? ( at - distances[ left ] ) / ( distances[ right ] - distances[ left ] ) : 0;
	const position = points[ left ].clone().lerp( points[ next ], factor );
	if ( ! orientation ) return position;
	const { tangents, normals } = orientation;
	const tangent = tangents[ left ].clone().lerp( tangents[ next ], factor ).normalize();
	if ( ! tangent.lengthSq() ) tangent.copy( tangents[ left ] );
	const normal = normals[ left ].clone().lerp( normals[ next ], factor );
	normal.addScaledVector( tangent, - normal.dot( tangent ) ).normalize();
	if ( ! normal.lengthSq() ) normal.copy( normals[ left ] );
	return { position: position.toArray(), tangent: tangent.toArray(), normal: normal.toArray() };

}

function resample( paths, { mode, count, length }, reserve ) {

	if ( mode === 'Evaluated' ) return paths;
	return paths.map( path => {

		const size = mode === 'Count' ? Math.round( count ) :
			Math.min( 4096, Math.max( 1, Math.floor( path.length / length ) ) + ( path.cyclic ? 0 : 1 ) );
		reserve( size );
		const step = path.length / Math.max( 1, path.cyclic ? size : size - 1 );
		return spline( Array.from( { length: size }, ( _, i ) => sample( path, i * step ) ), path.cyclic );

	} );

}

function trim( path, start, end, mode, reserve ) {

	const { points, distances, length } = path;
	const unit = mode === 'Factor' ? length : 1;
	const from = Math.min( length, start * unit );
	const to = Math.min( length, Math.max( from, end * unit ) );
	if ( from === 0 && to === length ) return path;
	reserve( points.length + 2 );
	const trimmed = [ sample( path, from ) ];
	for ( let i = 1; i < points.length; i ++ ) if ( distances[ i ] > from && distances[ i ] < to ) trimmed.push( points[ i ] );
	if ( to > from ) trimmed.push( sample( path, to ) );
	return spline( trimmed );

}

function toPoints( THREE, paths, align, checkVertices ) {

	const total = paths.reduce( ( sum, path ) => sum + path.points.length, 0 );
	checkVertices( total );
	const positions = new Float32Array( total * 3 ), normals = new Float32Array( total * 3 );
	let offset = 0;
	for ( const path of paths ) {

		const frame = frames( THREE, path );
		const axes = align === 'Tangent' ? frame.tangents : frame.normals;
		for ( const [ i, point ] of path.points.entries() ) {

			point.toArray( positions, offset );
			axes[ i ].toArray( normals, offset );
			offset += 3;

		}

	}
	return new THREE.BufferGeometry().setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) )
		.setAttribute( 'normal', new THREE.BufferAttribute( normals, 3 ) );

}

function sweep( THREE, paths, profiles, scale, caps, checkVertices ) {

	const positions = [], uv = [], indices = [], seams = [];
	const binormal = new THREE.Vector3();
	const geometry = { attributes: {} };
	const project = new THREE.Vector3();
	const sweepable = paths.filter( path => path.points.length > 1 );
	for ( const profile of profiles ) {

		if ( profile.points.length < 2 ) continue;
		const projected = profile.points.map( point => new THREE.Vector2( point.x, point.z ) );
		const outline = projected.filter( ( point, index ) => ! index || ! point.equals( projected[ index - 1 ] ) );
		if ( profile.cyclic && outline.length > 1 && outline[ 0 ].equals( outline.at( - 1 ) ) ) outline.pop();
		if ( outline.length < 2 ) continue;
		const cyclic = profile.cyclic && outline.length > 2;
		if ( cyclic && THREE.ShapeUtils.isClockWise( outline ) ) outline.reverse();
		const columns = outline.length + Number( cyclic );
		const faces = caps && cyclic ? THREE.ShapeUtils.triangulateShape( outline, [] ) : [];
		for ( const path of sweepable ) {

			const count = path.points.length;
			const rings = count + Number( path.cyclic );
			const base = positions.length / 3;
			const capSize = path.cyclic || ! faces.length ? 0 : outline.length;
			const total = base + rings * columns + 2 * capSize;
			if ( total > 1e6 ) throw new Error( 'Curve to Mesh exceeds one million vertices.' );
			checkVertices( total );
			const { tangents, normals } = frames( THREE, path );
			const element = { geometry, count, index: 0, position: null, normal: null };
			for ( let row = 0; row < rings; row ++ ) {

				const i = row % count;
				element.index = i;
				element.position = path.points[ i ];
				element.normal = normals[ i ];
				const size = sampleField( scale, element );
				if ( ! Number.isFinite( size ) || size < 0 ) throw new Error( 'Curve to Mesh needs a finite, nonnegative scale.' );
				binormal.crossVectors( tangents[ i ], normals[ i ] );
				for ( let col = 0; col < columns; col ++ ) {

					const vertex = outline[ col % outline.length ];
					project.copy( element.position ).addScaledVector( normals[ i ], size * vertex.x ).addScaledVector( binormal, size * vertex.y );
					if ( ! finitePosition( project ) ) throw new Error( 'Curve to Mesh produced positions outside the supported range.' );
					positions.push( project.x, project.y, project.z );
					uv.push( path.distances[ row ] / path.length, col / ( columns - 1 ) );
					if ( row === 0 || col === 0 ) continue;
					const d = base + row * columns + col;
					const a = d - columns - 1;
					indices.push( a, a + 1, d - 1, a + 1, d, d - 1 );

				}

			}
			if ( cyclic ) for ( let row = 0; row < rings; row ++ ) {

				const first = base + row * columns;
				seams.push( [ first, first + columns - 1 ] );

			}
			if ( path.cyclic ) for ( let col = 0; col < columns; col ++ ) {

				seams.push( [ base + col, base + ( rings - 1 ) * columns + col ] );

			}
			if ( capSize ) for ( const end of [ false, true ] ) {

				const rim = base + ( end ? rings - 1 : 0 ) * columns;
				const cap = positions.length / 3;
				for ( let i = 0; i < capSize; i ++ ) {

					const start = ( rim + i ) * 3;
					positions.push( positions[ start ], positions[ start + 1 ], positions[ start + 2 ] );
					uv.push( outline[ i ].x, outline[ i ].y );

				}
				for ( const [ a, b, c ] of faces ) indices.push( cap + a, cap + ( end ? b : c ), cap + ( end ? c : b ) );

			}

		}

	}
	const mesh = new THREE.BufferGeometry()
		.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) )
		.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) ).setIndex( indices );
	mesh.computeVertexNormals();
	const normal = mesh.getAttribute( 'normal' );
	for ( const [ a, b ] of seams ) {

		project.fromBufferAttribute( normal, a ).add( binormal.fromBufferAttribute( normal, b ) ).normalize();
		for ( const index of [ a, b ] ) normal.setXYZ( index, project.x, project.y, project.z );

	}
	mesh.addGroup( 0, indices.length, 0 );
	return mesh;

}

export function curveOperations( THREE, own, checkVertices, reserve ) {

	const vectorFrom = value => new THREE.Vector3().fromArray( value );
	const sizeOf = paths => paths.reduce( ( sum, path ) => sum + path.points.length, 0 );
	function generated( count, position, cyclic ) {

		reserve( count );
		return { curve: [ spline( Array.from( { length: count }, ( _, i ) => position( i / ( cyclic ? count : count - 1 ) ) ), cyclic ) ] };

	}

	return [
		[ 'curve.line', ( { start, end } ) => {

			reserve( 2 );
			return { curve: [ spline( [ vectorFrom( start ), vectorFrom( end ) ] ) ] };

		} ],
		[ 'curve.circle', ( inputs ) => generated( Math.round( inputs.resolution ), t => {

			const angle = Math.PI * 2 * t;
			return new THREE.Vector3( inputs.radius * Math.cos( angle ), 0, inputs.radius * Math.sin( angle ) );

		}, true ) ],
		[ 'curve.bezier', ( inputs ) => {

			const bezier = new THREE.CubicBezierCurve3( ...[ inputs.start, inputs.startHandle, inputs.endHandle, inputs.end ].map( vectorFrom ) );
			return generated( Math.round( inputs.resolution ), t => bezier.getPoint( t ) );

		} ],
		[ 'curve.spiral', ( { resolution, startRadius, endRadius, height, turns } ) => generated( Math.round( resolution ), t => {

			const angle = Math.PI * 2 * turns * t;
			const radius = THREE.MathUtils.lerp( startRadius, endRadius, t );
			return new THREE.Vector3( radius * Math.cos( angle ), t * height, radius * Math.sin( angle ) );

		} ) ],
		[ 'curve.join', ( { curve, other } ) => {

			reserve( sizeOf( curve ) + sizeOf( other ) );
			return { curve: [ ...curve, ...other ] };

		} ],
		[ 'curve.reverse', ( { curve } ) => {

			reserve( sizeOf( curve ) );
			return { curve: curve.map( path => spline( path.points.slice().reverse(), path.cyclic ) ) };

		} ],
		[ 'curve.resample', inputs => ( { curve: resample( inputs.curve, inputs, reserve ) } ) ],
		[ 'curve.trim', ( { curve, start, end, mode } ) => ( { curve: curve.map( path => trim( path, start, end, mode, reserve ) ) } ) ],
		[ 'curve.length', ( { curve } ) => ( { length: curve.reduce( ( sum, path ) => sum + path.length, 0 ) } ) ],
		[ 'curve.sample', ( { curve, mode, at } ) => {

			let remaining = mode === 'Factor' ? Math.min( 1, at ) * curve.reduce( ( sum, path ) => sum + path.length, 0 ) : at;
			for ( const path of curve ) {

				if ( remaining <= path.length || path === curve.at( - 1 ) ) return sample( path, remaining, frames( THREE, path ) );
				remaining -= path.length;

			}

		} ],
		[ 'curve.points', inputs => ( { points: own( toPoints( THREE, resample( inputs.curve, inputs, reserve ), inputs.align, checkVertices ) ) } ) ],
		[ 'curve.mesh', ( { curve, profile, scale, caps } ) => ( { geometry: own( sweep( THREE, curve, profile, scale, caps, checkVertices ) ) } ) ]
	];

}
