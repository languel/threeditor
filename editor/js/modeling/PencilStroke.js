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

const isometricAxes = [ Math.PI / 6, Math.PI / 2, 5 * Math.PI / 6 ];

// Drawing guides constrain the screen point before placement into the scene.
export function guidePencilPoint( point, start, center, type, angle = 0 ) {

	if ( ! type || type === 'off' ) return point;
	if ( type === 'circle' || type === 'radial' ) {

		const reference = start.map( ( value, i ) => value - center[ i ] );
		const delta = point.map( ( value, i ) => value - center[ i ] );
		const radius = Math.hypot( ...reference );
		if ( radius < 1e-6 ) return start;
		if ( type === 'circle' ) {

			const length = Math.hypot( ...delta );
			return length < 1e-6 ? start : center.map( ( value, i ) => value + delta[ i ] * radius / length );

		}
		const projection = ( delta[ 0 ] * reference[ 0 ] + delta[ 1 ] * reference[ 1 ] ) / ( radius * radius );
		return center.map( ( value, i ) => value + reference[ i ] * projection );

	}
	const dx = point[ 0 ] - start[ 0 ], dy = point[ 1 ] - start[ 1 ];
	if ( type === 'grid' ) return Math.abs( dx ) > Math.abs( dy ) ? [ point[ 0 ], start[ 1 ] ] : [ start[ 0 ], point[ 1 ] ];
	let offset = [ 0, 0 ], distance = -1;
	for ( const heading of type === 'iso' ? isometricAxes : [ angle ] ) {

		const x = Math.cos( heading ), y = Math.sin( heading );
		const along = dx * x + dy * y;
		if ( Math.abs( along ) <= distance ) continue;
		distance = Math.abs( along );
		offset = [ along * x, along * y ];

	}
	return [ start[ 0 ] + offset[ 0 ], start[ 1 ] + offset[ 1 ] ];

}
