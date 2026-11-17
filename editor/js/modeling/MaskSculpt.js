// Adapted from Artist–Model Studio's src/process/sculpt.js for closed, 2D contours.
function falloff( distance, radius ) {

	const t = Math.max( 0, 1 - distance / radius );
	return t * t * ( 3 - 2 * t );

}

export function sculptMask( points, cursor, delta, radius, tool ) {

	const refined = points.flatMap( ( a, i ) => {

		const b = points[ ( i + 1 ) % points.length ];
		const dx = b[ 0 ] - a[ 0 ], dy = b[ 1 ] - a[ 1 ], length = Math.hypot( dx, dy );
		const t = Math.max( 0, Math.min( 1, ( ( cursor[ 0 ] - a[ 0 ] ) * dx + ( cursor[ 1 ] - a[ 1 ] ) * dy ) / ( length ** 2 || 1 ) ) );
		const distance = Math.hypot( cursor[ 0 ] - a[ 0 ] - dx * t, cursor[ 1 ] - a[ 1 ] - dy * t );
		const splits = distance < radius ? Math.min( 24, Math.ceil( length / ( radius / 3 ) ) ) : 1;
		return [ a, ...Array.from( { length: Math.max( 0, splits - 1 ) }, ( _, k ) => [ a[ 0 ] + dx * ( k + 1 ) / splits, a[ 1 ] + dy * ( k + 1 ) / splits ] ) ];

	} );
	return refined.map( ( point, i ) => {

		const w = falloff( Math.hypot( point[ 0 ] - cursor[ 0 ], point[ 1 ] - cursor[ 1 ] ), radius );
		const a = refined[ ( i + refined.length - 1 ) % refined.length ], b = refined[ ( i + 1 ) % refined.length ];
		return point.map( ( value, axis ) => value + w * ( tool === 'smooth' ? .5 * ( ( a[ axis ] + b[ axis ] ) / 2 - value ) : delta[ axis ] ) );

	} );

}
