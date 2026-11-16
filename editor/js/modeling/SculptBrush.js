// Screen-space falloff and topology-aware smoothing adapted from the ThreeGrease and AMS brushes.
export function sculptPoints( points, pixels, cursor, radius, strength, delta, neighbors ) {

	return points.map( ( point, index ) => {

		const pixel = pixels[ index ];
		if ( ! pixel ) return point;
		const t = Math.max( 0, 1 - Math.hypot( cursor[ 0 ] - pixel[ 0 ], cursor[ 1 ] - pixel[ 1 ] ) / radius );
		const weight = strength * t * t * ( 3 - 2 * t );
		if ( ! weight ) return point;
		const adjacent = neighbors?.[ index ];
		if ( ! delta && !( adjacent?.size >= 2 ) ) return point;
		return point.map( ( value, axis ) => {

			if ( delta ) return value + delta[ axis ] * weight;
			let sum = 0;
			for ( const neighbor of adjacent ) sum += points[ neighbor ][ axis ];
			return value + ( sum / adjacent.size - value ) * weight;

		} );

	} );

}

export function sculptNeighbors( data, geometry ) {

	const neighbors = data.points.map( () => new Set() );
	function link( a, b ) {

		if ( a === b || a === undefined || b === undefined ) return;
		neighbors[ a ].add( b );
		neighbors[ b ].add( a );

	}
	if ( data.faces ) {

		for ( const face of data.faces ) face.forEach( ( index, i ) => link( index, face[ ( i + 1 ) % face.length ] ) );

	} else {

		const welded = [];
		data.vertices.forEach( ( vertices, index ) => vertices.forEach( vertex => { welded[ vertex ] = index; } ) );
		const index = geometry.index;
		const vertex = i => welded[ index ? index.getX( i ) : i ];
		for ( let i = 0; i + 2 < ( index?.count ?? welded.length ); i += 3 ) {

			link( vertex( i ), vertex( i + 1 ) );
			link( vertex( i + 1 ), vertex( i + 2 ) );
			link( vertex( i + 2 ), vertex( i ) );

		}

	}
	return neighbors;

}
