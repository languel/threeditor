// Measure taper along the path so uneven point spacing does not change its shape.
export function pencilProfile( points, brush, closed = false ) {

	const start = Math.max( 0, Math.min( .5, brush.taperStart || 0 ) );
	const end = Math.max( 0, Math.min( .5, brush.taperEnd || 0 ) );
	if ( closed || points.length < 2 || !( start || end ) ) return;

	const lengths = [ 0 ];
	for ( let i = 1; i < points.length; i ++ ) lengths.push( lengths[ i - 1 ] + points[ i ].distanceTo( points[ i - 1 ] ) );
	const total = lengths.at( -1 );
	if ( total < 1e-8 ) return;

	const ramp = value => {

		const t = Math.max( 0, Math.min( 1, value ) );
		return .12 + .88 * t * t * ( 3 - 2 * t );

	};
	const stops = [];
	for ( let i = 1; i <= 4; i ++ ) {

		if ( start ) stops.push( start * total * i / 4 );
		if ( end ) stops.push( total - end * total * i / 4 );

	}
	stops.sort( ( a, b ) => a - b );
	return {
		lengths, stops: [ ...new Set( stops ) ],
		factor: length => Math.min( start ? ramp( length / ( start * total ) ) : 1,
			end ? ramp( ( total - length ) / ( end * total ) ) : 1 )
	};

}
