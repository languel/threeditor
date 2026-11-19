import { closestPointOnSegment } from './Contour.js';

function contains( point, a, b, c ) {

	const cross = ( p, q, r ) => ( q[ 0 ] - p[ 0 ] ) * ( r[ 1 ] - p[ 1 ] ) - ( q[ 1 ] - p[ 1 ] ) * ( r[ 0 ] - p[ 0 ] );
	const area = cross( a, b, c );
	if ( Math.abs( area ) < 1e-14 ) return false;
	return [ cross( a, b, point ), cross( b, c, point ), cross( c, a, point ) ].every( value => value * Math.sign( area ) >= -1e-12 );

}

export function uvFaceAt( point, triangles, points, tolerance ) {

	let nearest = -1;
	let best = tolerance;
	for ( let i = triangles.length - 1; i >= 0; i -- ) {

		const [ a, b, c ] = triangles[ i ].map( j => points[ j ] );
		const [ x, y ] = point;
		if ( x < Math.min( a[ 0 ], b[ 0 ], c[ 0 ] ) - tolerance || x > Math.max( a[ 0 ], b[ 0 ], c[ 0 ] ) + tolerance ||
			y < Math.min( a[ 1 ], b[ 1 ], c[ 1 ] ) - tolerance || y > Math.max( a[ 1 ], b[ 1 ], c[ 1 ] ) + tolerance ) continue;
		if ( contains( point, a, b, c ) ) return i;
		const distance = Math.min( closestPointOnSegment( point, a, b ).distance,
			closestPointOnSegment( point, b, c ).distance, closestPointOnSegment( point, c, a ).distance );
		if ( distance < best ) { nearest = i; best = distance; }

	}
	return nearest;

}

// Join faces across matching UV edges, and keep faces that share an
// actual buffer vertex together so moving one cannot stretch its neighbor.
export function linkedUVVertices( triangles, pointKey, seeds ) {

	const edges = new Map(), vertices = new Map(), vertexFaces = new Map();
	const faceEdges = triangles.map( ( face, index ) => {

		const keys = face.map( vertex => {

			if ( ! vertices.has( vertex ) ) vertices.set( vertex, pointKey( vertex ) );
			if ( ! vertexFaces.has( vertex ) ) vertexFaces.set( vertex, [] );
			vertexFaces.get( vertex ).push( index );
			return vertices.get( vertex );

		} );
		return keys.map( ( start, i ) => {

			const end = keys[ ( i + 1 ) % keys.length ];
			const edge = start < end ? start + ';' + end : end + ';' + start;
			if ( start === end ) return null;
			if ( ! edges.has( edge ) ) edges.set( edge, [] );
			edges.get( edge ).push( index );
			return edge;

		} );

	} );
	const queue = [ ...seeds ], reached = new Set( queue ), selected = new Set();
	function addAdjacent( connections, key ) {

		const adjacent = connections.get( key );
		if ( ! adjacent ) return;
		connections.delete( key );
		for ( const next of adjacent ) {

			if ( reached.has( next ) ) continue;
			reached.add( next );
			queue.push( next );

		}

	}
	for ( let i = 0; i < queue.length; i ++ ) {

		const face = queue[ i ];
		for ( const vertex of triangles[ face ] ) {

			selected.add( vertex );
			addAdjacent( vertexFaces, vertex );

		}
		for ( const edge of faceEdges[ face ] ) addAdjacent( edges, edge );

	}
	return [ ...selected ];

}
