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

// A port joins elements that can be reached in one step. Vertices share
// an edge, edges share a vertex, and faces share an edge.
export function connectedSelection( data, mode, seeds, operation ) {

	const elements = selectionCandidates( data, mode );
	const indices = new Map( elements.map( ( ids, i ) => [ elementKey( ids ), i ] ) );
	const ports = elements.map( () => [] );
	const members = new Map();
	const connect = ( index, port ) => {

		ports[ index ].push( port );
		if ( ! members.has( port ) ) members.set( port, [] );
		members.get( port ).push( index );

	};
	if ( mode === 'vertex' ) {

		for ( const edge of meshEdges( data ) ) {

			const port = elementKey( edge );
			for ( const index of edge ) connect( index, port );

		}

	} else elements.forEach( ( ids, i ) => {

		if ( mode === 'edge' ) for ( const vertex of ids ) connect( i, vertex );
		else for ( let j = 0; j < ids.length; j ++ ) connect( i, elementKey( [ ids[ j ], ids[ ( j + 1 ) % ids.length ] ] ) );

	} );

	const selected = new Set( seeds.map( ids => indices.get( elementKey( ids ) ) ).filter( i => i !== undefined ) );
	if ( operation === 'less' ) {

		const boundary = new Set();
		for ( const [ port, adjacent ] of members ) if ( adjacent.some( index => ! selected.has( index ) ) ) boundary.add( port );
		return [ ...selected ].filter( index => ! ports[ index ].some( port => boundary.has( port ) ) ).map( index => elements[ index ] );

	}
	const queue = [ ...selected ], originalCount = queue.length;
	const visited = new Set();
	for ( let i = 0; i < ( operation === 'more' ? originalCount : queue.length ); i ++ ) {

		for ( const port of ports[ queue[ i ] ] ) {

			if ( visited.has( port ) ) continue;
			visited.add( port );
			for ( const index of members.get( port ) ) if ( ! selected.has( index ) ) {

				selected.add( index );
				queue.push( index );

			}

		}

	}
	return queue.map( index => elements[ index ] );

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
export function selectionRegionIntersectsSegment( region, a, b, radius ) {

	if ( selectionRegionContains( region, a, radius ) || selectionRegionContains( region, b, radius ) ) return true;
	const { tool, polygon, start, end } = region;
	const cross = ( p, q, r ) => ( q[ 0 ] - p[ 0 ] ) * ( r[ 1 ] - p[ 1 ] ) - ( q[ 1 ] - p[ 1 ] ) * ( r[ 0 ] - p[ 0 ] );
	const intersects = ( c, d ) => [ 0, 1 ].every( i => Math.max( a[ i ], b[ i ] ) >= Math.min( c[ i ], d[ i ] ) &&
		Math.max( c[ i ], d[ i ] ) >= Math.min( a[ i ], b[ i ] ) ) &&
		cross( a, b, c ) * cross( a, b, d ) <= 0 && cross( c, d, a ) * cross( c, d, b ) <= 0;
	if ( tool === 'circle' ) {

		return projectToSegment( start, a, b ).distance <= radius || polygon.some( ( point, i ) =>
			projectToSegment( point, a, b ).distance <= radius || i > 0 && intersects( polygon[ i - 1 ], point ) );

	}
	const boundary = tool === 'lasso' ? polygon : [ start, [ end[ 0 ], start[ 1 ] ], end, [ start[ 0 ], end[ 1 ] ] ];
	return boundary.some( ( point, i ) => intersects( point, boundary[ ( i + 1 ) % boundary.length ] ) );

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
