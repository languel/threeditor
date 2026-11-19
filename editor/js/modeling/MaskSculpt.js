import { sculptNeighbors, sculptPoints } from './SculptBrush.js';
import { closestPointOnSegment, interpolatePoint, segmentCount } from './Contour.js';

export function sculptMask( points, cursor, delta, radius, tool, strength = 1, closed = true ) {

	const count = segmentCount( points, closed );
	const refined = points.flatMap( ( start, i ) => {

		if ( i >= count ) return [ start ];
		const end = points[ ( i + 1 ) % points.length ];
		const length = Math.hypot( end[ 0 ] - start[ 0 ], end[ 1 ] - start[ 1 ] );
		const { distance } = closestPointOnSegment( cursor, start, end );
		const splits = distance < radius ? Math.min( 24, Math.ceil( length / ( radius / 3 ) ) ) : 1;
		return [ start, ...Array.from( { length: Math.max( 0, splits - 1 ) }, ( _, k ) => interpolatePoint( start, end, ( k + 1 ) / splits ) ) ];

	} );
	const smooth = tool === 'smooth';
	const neighbors = smooth ? sculptNeighbors( { points: refined, closed } ) : null;
	const move = smooth ? null : ( point, pixel, weight ) => point.map( ( value, axis ) => value +
		( tool === 'pinch' ? ( cursor[ axis ] - value ) * .25 : delta[ axis ] ) * weight );
	return sculptPoints( refined, refined, cursor, radius, Math.max( 0, Math.min( 1, strength ) ) * ( smooth ? .5 : 1 ),
		{ tool, neighbors, move } );

}
