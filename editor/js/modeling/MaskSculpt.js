import { sculptNeighbors, sculptPoints } from './SculptBrush.js';

export function sculptMask( points, cursor, delta, radius, tool, strength = 1 ) {

	const refined = points.flatMap( ( a, i ) => {

		const b = points[ ( i + 1 ) % points.length ];
		const dx = b[ 0 ] - a[ 0 ], dy = b[ 1 ] - a[ 1 ], length = Math.hypot( dx, dy );
		const t = Math.max( 0, Math.min( 1, ( ( cursor[ 0 ] - a[ 0 ] ) * dx + ( cursor[ 1 ] - a[ 1 ] ) * dy ) / ( length ** 2 || 1 ) ) );
		const distance = Math.hypot( cursor[ 0 ] - a[ 0 ] - dx * t, cursor[ 1 ] - a[ 1 ] - dy * t );
		const splits = distance < radius ? Math.min( 24, Math.ceil( length / ( radius / 3 ) ) ) : 1;
		return [ a, ...Array.from( { length: Math.max( 0, splits - 1 ) }, ( _, k ) => [ a[ 0 ] + dx * ( k + 1 ) / splits, a[ 1 ] + dy * ( k + 1 ) / splits ] ) ];

	} );
	const smooth = tool === 'smooth';
	const neighbors = smooth ? sculptNeighbors( { points: refined, closed: true } ) : null;
	const move = smooth ? null : ( point, pixel, weight ) => point.map( ( value, axis ) => value + delta[ axis ] * weight );
	return sculptPoints( refined, refined, cursor, radius, Math.max( 0, Math.min( 1, strength ) ) * ( smooth ? .5 : 1 ),
		{ tool, neighbors, move } );

}
