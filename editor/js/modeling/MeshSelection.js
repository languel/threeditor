import { contourClosed, contourEdgeCount, projectToSegment } from './Contour.js';

// Adapted to ordered face loops from ThreeGrease core/polyedit and meshedit:
// independent element selections flush to a vertex union for transforms.
export const elementKey = ids => ids.slice().sort( ( a, b ) => a - b ).join( ':' );
export function meshEdges( data ) {

	const edges = new Map();
	for ( const face of data.faces || [] ) for ( let i = 0; i < face.length; i ++ ) {

		const edge = [ face[ i ], face[ ( i + 1 ) % face.length ] ];
		edges.set( elementKey( edge ), edge );

	}
	if ( ! data.faces || data.profile ) {

		for ( let i = 0, count = contourEdgeCount( data.points, contourClosed( data ) ); i < count; i ++ ) {

			const edge = [ i, ( i + 1 ) % data.points.length ];
			edges.set( elementKey( edge ), edge );

		}

	}
	return [ ...edges.values() ];

}
export function selectionCandidates( data, mode ) {

	return mode === 'vertex' ? data.points.map( ( _, i ) => [ i ] ) : mode === 'edge' ? meshEdges( data ) : data.faces || ( data.kind === 'shape' && contourClosed( data ) && data.points.length >= 3 ? [ data.points.map( ( _, i ) => i ) ] : [] );

}
export function applySelection( current, hits, operation = 'set' ) {

	return combineSelection( current, new Map( hits.map( ids => [ elementKey( ids ), ids ] ) ), operation );

}

export function combineSelection( current, incoming, operation = 'set' ) {

	const result = operation === 'set' ? new Map() : new Map( current );
	if ( operation === 'intersect' ) return new Map( [ ...result ].filter( ( [ key ] ) => incoming.has( key ) ) );
	for ( const [ key, ids ] of incoming ) {

		if ( operation === 'subtract' || operation === 'toggle' && result.has( key ) ) result.delete( key );
		else result.set( key, ids );

	}
	return result;

}

export function selectionRegionContains( { tool, polygon, start, end }, point, radius ) {

	if ( ! point ) return false;
	if ( tool === 'lasso' ) return pointInPolygon( point, polygon );
	if ( tool === 'circle' ) {

		if ( Math.hypot( point[ 0 ] - start[ 0 ], point[ 1 ] - start[ 1 ] ) <= radius ) return true;
		return polygon.some( ( p, i ) => i > 0 && projectToSegment( point, polygon[ i - 1 ], p ).distance <= radius );

	}
	return point[ 0 ] >= Math.min( start[ 0 ], end[ 0 ] ) && point[ 0 ] <= Math.max( start[ 0 ], end[ 0 ] ) &&
		point[ 1 ] >= Math.min( start[ 1 ], end[ 1 ] ) && point[ 1 ] <= Math.max( start[ 1 ], end[ 1 ] );

}
export function edgeLoop( data, start, ring = false ) {

	const edges = meshEdges( data ), result = new Map( [ [ elementKey( start ), start ] ] );
	const adjacent = edge => ( data.faces || [] ).filter( face => face.some( ( a, i ) => elementKey( [ a, face[ ( i + 1 ) % face.length ] ] ) === elementKey( edge ) ) );
	const pending = [ start ];
	while ( pending.length && result.size < 4096 ) {

		const edge = pending.pop();
		const faces = adjacent( edge );
		const next = [];
		if ( ring ) for ( const face of faces ) {

			if ( face.length !== 4 ) continue;
			const i = face.findIndex( ( a, i ) => elementKey( [ a, face[ ( i + 1 ) % 4 ] ] ) === elementKey( edge ) );
			next.push( [ face[ ( i + 2 ) % 4 ], face[ ( i + 3 ) % 4 ] ] );

		} else for ( const vertex of edge ) {

			const incident = edges.filter( candidate => candidate.includes( vertex ) && elementKey( candidate ) !== elementKey( edge ) );
			const continuations = incident.filter( candidate => ! faces.some( face => face.includes( candidate[ 0 ] ) && face.includes( candidate[ 1 ] ) ) );
			if ( incident.length === 1 ) next.push( incident[ 0 ] );
			else if ( continuations.length === 1 ) next.push( continuations[ 0 ] );

		}
		for ( const candidate of next ) if ( ! result.has( elementKey( candidate ) ) ) { result.set( elementKey( candidate ), candidate ); pending.push( candidate ); }

	}
	return [ ...result.values() ];

}
export function pointInPolygon( point, polygon ) {

	let inside = false;
	for ( let i = 0, j = polygon.length - 1; i < polygon.length; j = i ++ ) {

		const a = polygon[ i ], b = polygon[ j ];
		if ( ( a[ 1 ] > point[ 1 ] ) !== ( b[ 1 ] > point[ 1 ] ) && point[ 0 ] < ( b[ 0 ] - a[ 0 ] ) * ( point[ 1 ] - a[ 1 ] ) / ( b[ 1 ] - a[ 1 ] ) + a[ 0 ] ) inside = ! inside;

	}
	return inside;

}
