import { closestPointOnSegment } from './Contour.js';

// The pointer pulls the sample forward only after leaving the dead zone.
export function stabilizePointer( position, x, y, radius ) {

	const dx = x - position[ 0 ], dy = y - position[ 1 ];
	const distance = Math.hypot( dx, dy );
	if ( distance > radius ) {

		const factor = .6 * ( distance - radius ) / distance;
		position[ 0 ] += dx * factor;
		position[ 1 ] += dy * factor;

	}
	return position;

}

export function smoothPencilStroke( points, strength, passes = 2 ) {

	let smoothed = points;
	if ( strength <= 0 || points.length < 3 ) return smoothed;
	for ( let pass = 0; pass < passes; pass ++ ) smoothed = smoothed.map( ( point, index, input ) => {

		if ( index === 0 || index === input.length - 1 ) return point;
		return point.map( ( value, axis ) => value + strength * ( ( input[ index - 1 ][ axis ] + input[ index + 1 ][ axis ] ) / 2 - value ) );

	} );
	return smoothed;

}

// Work in screen pixels so the requested error is independent of camera zoom.
export function simplifyPencilStroke( points, project, tolerance, closed = false ) {

	if ( tolerance <= 0 || points.length <= ( closed ? 3 : 2 ) ) return points;
	const projected = points.map( project );
	if ( projected.some( point => ! point ) ) return points;
	const keep = new Set( [ 0, points.length - 1 ] );
	const spans = [ [ 0, points.length - 1 ] ];
	while ( spans.length ) {

		const [ start, end ] = spans.pop();
		let farthest = tolerance, pivot = -1;
		for ( let i = start + 1; i < end; i ++ ) {

			const { distance } = closestPointOnSegment( projected[ i ], projected[ start ], projected[ end ] );
			if ( distance > farthest ) { farthest = distance; pivot = i; }

		}
		if ( pivot < 0 ) continue;
		keep.add( pivot );
		spans.push( [ start, pivot ], [ pivot, end ] );

	}
	return closed && keep.size < 3 ? points : points.filter( ( _, index ) => keep.has( index ) );

}
