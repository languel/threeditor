import { potpack } from '../libs/potpack.module.js';

export function packUVRectangles( charts, settings ) {

	if ( charts.length === 0 ) return 0;
	// Half a pixel beyond the requested gutter protects the texel-center boundary.
	const border = settings.padding + 0.5;
	function pack( density ) {

		const boxes = charts.map( chart => ( {
			chart, w: Math.max( 1, Math.ceil( chart.width * density + border * 2 ) ),
			h: Math.max( 1, Math.ceil( chart.height * density + border * 2 ) )
		} ) );
		const result = potpack( boxes );
		if ( result.w > settings.resolution || result.h > settings.resolution ) return packShelves( boxes, settings.resolution );
		return boxes;

	}

	let density = settings.texelsPerUnit, boxes = density > 0 ? pack( density ) : null;
	if ( density > 0 && ! boxes ) console.warn( 'THREE.unwrapUVs(): Charts do not fit at the requested texelsPerUnit. Fitting the atlas instead.' );

	if ( ! boxes ) {

		const area = charts.reduce( ( sum, chart ) => sum + chart.width * chart.height, 0 );
		const extent = charts.reduce( ( max, chart ) => Math.max( max, chart.width, chart.height ), 0 );
		const minBounds = Math.max( Math.sqrt( area ), extent );
		let low = 0, high = minBounds > 0 ? settings.resolution / minBounds : 1;
		for ( let iteration = 0; iteration < 24; iteration ++ ) {

			const middle = ( low + high ) * 0.5, trial = pack( middle );
			if ( trial ) {

				low = middle; boxes = trial;

			} else {

				high = middle;

			}

		}

		density = low;
		if ( ! boxes ) return null;

	}

	for ( const box of boxes ) box.chart.box = { x: box.x, y: box.y, w: box.w, h: box.h };
	return density;

}

// A fixed-width fallback avoids potpack's unconstrained container-width heuristic.
function packShelves( boxes, resolution ) {

	const shelves = [];
	let height = 0;
	for ( const box of boxes ) {

		if ( box.w > resolution || box.h > resolution ) return null;
		let best = null;
		for ( const shelf of shelves ) {

			if ( shelf.h >= box.h && shelf.x + box.w <= resolution && ( best === null || shelf.x > best.x ) ) best = shelf;

		}

		if ( best === null ) {

			if ( height + box.h > resolution ) return null;
			best = { x: 0, y: height, h: box.h };
			shelves.push( best );
			height += box.h;

		}

		box.x = best.x;
		box.y = best.y;
		best.x += box.w;

	}

	return boxes;

}
