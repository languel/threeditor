// Screen-space falloff and topology-aware smoothing adapted from the ThreeGrease and AMS brushes.
export const meshBrushes = [
	[ 'grab', 'Grab', 'move' ], [ 'push', 'Push', 'toolPaint' ], [ 'smooth', 'Smooth', 'toolPath' ],
	[ 'relax', 'Relax', 'snapEdge' ], [ 'pinch', 'Pinch', 'snapMidpoint' ], [ 'twist', 'Twist', 'rotate' ]
];

export function sculptPoints( points, pixels, cursor, radius, strength, { tool, move, neighbors, normals } ) {

	return points.map( ( point, index ) => {

		const pixel = pixels[ index ];
		if ( ! pixel ) return point;
		const t = Math.max( 0, 1 - Math.hypot( cursor[ 0 ] - pixel[ 0 ], cursor[ 1 ] - pixel[ 1 ] ) / radius );
		const weight = strength * t * t * ( 3 - 2 * t );
		if ( ! weight ) return point;
		if ( move ) return move( point, pixel, weight );
		const adjacent = neighbors[ index ];
		if ( adjacent.size < 2 ) return point;
		const delta = [ 0, 0, 0 ];
		for ( const neighbor of adjacent ) points[ neighbor ].forEach( ( value, axis ) => { delta[ axis ] += ( value - point[ axis ] ) / adjacent.size; } );
		if ( tool === 'relax' ) {

			const normal = normals?.[ index ];
			if ( normal?.lengthSq() ) {

				const alongNormal = normal.toArray().reduce( ( dot, value, axis ) => dot + value * delta[ axis ], 0 );
				normal.toArray().forEach( ( value, axis ) => { delta[ axis ] -= alongNormal * value; } );

			} else if ( adjacent.size === 2 ) {

				const [ a, b ] = [ ...adjacent ].map( index => points[ index ] );
				const chord = b.map( ( value, axis ) => value - a[ axis ] );
				const scale = chord.reduce( ( dot, value, axis ) => dot + value * delta[ axis ], 0 ) / ( Math.hypot( ...chord ) ** 2 || 1 );
				chord.forEach( ( value, axis ) => { delta[ axis ] = value * scale; } );

			}

		}
		return point.map( ( value, axis ) => value + delta[ axis ] * weight );

	} );

}

export function sculptNeighbors( data, geometry ) {

	const neighbors = data.points.map( () => new Set() );
	function link( a, b ) {

		if ( a === b || ! neighbors[ a ] || ! neighbors[ b ] ) return;
		neighbors[ a ].add( b );
		neighbors[ b ].add( a );

	}
	if ( data.faces ) {

		for ( const face of data.faces ) face.forEach( ( index, i ) => link( index, face[ ( i + 1 ) % face.length ] ) );

	} else if ( ! data.vertices ) {

		for ( let i = 1; i < data.points.length; i ++ ) link( i - 1, i );
		if ( data.closed || data.kind === 'shape' && data.closed !== false ) link( 0, data.points.length - 1 );

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
