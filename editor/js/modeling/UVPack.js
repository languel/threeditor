import { packUVRectangles } from '../../../examples/jsm/utils/UVAtlasPacking.js';

// Fit the existing islands with a shared scale, keeping their UV orientation
// and internal shape. Reserve a gutter around each island's bounding box.
export function packExistingUVs( points, islands, padding ) {

	const resolution = 1024;
	const charts = islands.map( vertices => {

		const min = [ Infinity, Infinity ], max = [ - Infinity, - Infinity ];
		for ( const i of vertices ) for ( let axis = 0; axis < 2; axis ++ ) {

			const value = points[ i ][ axis ];
			min[ axis ] = Math.min( min[ axis ], value );
			max[ axis ] = Math.max( max[ axis ], value );

		}
		const width = max[ 0 ] - min[ 0 ], height = max[ 1 ] - min[ 1 ];
		if ( ! Number.isFinite( width + height ) ) throw new Error( 'The UV layout contains invalid coordinates.' );
		return { vertices, min, width, height };

	} );
	const density = packUVRectangles( charts, { resolution, padding, texelsPerUnit: 0 } );
	if ( density === null ) throw new Error( 'The islands do not fit. Reduce the packing margin.' );
	const result = points.slice();
	for ( const chart of charts ) {

		const origin = [ chart.box.x, chart.box.y ];
		for ( const i of chart.vertices ) result[ i ] = points[ i ].map( ( value, axis ) =>
			( origin[ axis ] + padding + .5 + ( value - chart.min[ axis ] ) * density ) / resolution );

	}
	return result;

}
