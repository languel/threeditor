// A contour stores ordered control points. Closed contours have an implicit
// final edge to the first point, so the closing point is never stored twice.
export function contourClosed( contour ) {

	return contour.kind === 'shape' ? contour.closed !== false : contour.closed === true;

}

export function contourEdgeCount( points, closed ) {

	return points.length < 2 ? 0 : points.length - ( closed ? 0 : 1 );

}

export function interpolatePoint( a, b, fraction ) {

	return a.map( ( value, axis ) => value + ( b[ axis ] - value ) * fraction );

}

export function projectToSegment( point, a, b ) {

	const x = b[ 0 ] - a[ 0 ], y = b[ 1 ] - a[ 1 ];
	const lengthSquared = x * x + y * y;
	const fraction = lengthSquared ? Math.max( 0, Math.min( 1,
		( ( point[ 0 ] - a[ 0 ] ) * x + ( point[ 1 ] - a[ 1 ] ) * y ) / lengthSquared ) ) : 0;
	const distance = Math.hypot( point[ 0 ] - a[ 0 ] - x * fraction, point[ 1 ] - a[ 1 ] - y * fraction );
	return { fraction, distance, length: Math.sqrt( lengthSquared ) };

}

export function nearestContourEdge( pixels, closed, cursor, tolerance ) {

	let best;
	for ( let index = 0, count = contourEdgeCount( pixels, closed ); index < count; index ++ ) {

		const next = ( index + 1 ) % pixels.length;
		if ( ! pixels[ index ] || ! pixels[ next ] ) continue;
		const { fraction, distance, length } = projectToSegment( cursor, pixels[ index ], pixels[ next ] );
		if ( ! length || distance >= tolerance ) continue;
		tolerance = distance;
		best = { index, next, fraction };

	}
	return best;

}

export function insertContourPoint( points, after, point ) {

	points.splice( after + 1, 0, point );
	return after + 1;

}
