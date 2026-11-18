export function segmentCount( points, closed ) {

	return points.length < 2 ? 0 : points.length - ( closed ? 0 : 1 );

}

export function interpolatePoint( start, end, fraction ) {

	return start.map( ( value, axis ) => value + fraction * ( end[ axis ] - value ) );

}

export function closestPointOnSegment( point, start, end ) {

	const direction = end.map( ( value, axis ) => value - start[ axis ] );
	const lengthSquared = direction.reduce( ( sum, value ) => sum + value * value, 0 );
	const projection = direction.reduce( ( sum, value, axis ) => sum + value * ( point[ axis ] - start[ axis ] ), 0 );
	const fraction = lengthSquared ? Math.max( 0, Math.min( 1, projection / lengthSquared ) ) : 0;
	const closest = interpolatePoint( start, end, fraction );
	return { fraction, distance: Math.hypot( ...closest.map( ( value, axis ) => value - point[ axis ] ) ) };

}

export function insertContourPoint( points, after, fraction ) {

	const index = after + 1;
	points.splice( index, 0, interpolatePoint( points[ after ], points[ index % points.length ], fraction ) );
	return index;

}

export function fitDrawingContour( points ) {

	const bounds = points.reduce( ( [ left, bottom, right, top ], [ x, y ] ) => [
		Math.min( left, x ), Math.min( bottom, y ), Math.max( right, x ), Math.max( top, y )
	], [ Infinity, Infinity, - Infinity, - Infinity ] );
	const [ left, bottom, right, top ] = bounds;
	const size = Math.max( right - left, top - bottom );
	if ( ! ( size > 0 ) ) throw new Error( 'The contour needs at least two distinct points.' );
	return points.map( ( [ x, y ] ) => [
		.5 + .8 * ( x - ( left + right ) / 2 ) / size,
		.5 - .8 * ( y - ( bottom + top ) / 2 ) / size
	] );

}

export function contourClosed( contour ) {

	return contour.kind === 'shape' ? contour.closed !== false : contour.closed === true;

}

export { segmentCount as contourEdgeCount };

export function projectToSegment( point, start, end ) {

	return { ...closestPointOnSegment( point, start, end ), length: Math.hypot( ...end.map( ( value, axis ) => value - start[ axis ] ) ) };

}
