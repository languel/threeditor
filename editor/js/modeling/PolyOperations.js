import { splitEdge, faceNormal } from './ModelGeometry.js?v=surface-tools';
import { meshEdges, elementKey, edgeLoop } from './MeshSelection.js?v=shape-selection';
import { faceCorners, mergeFaceCorners } from './FaceAttributes.js';

// Ordered-face adaptation of ThreeGrease polytool.cutAcrossMesh. Existing
// vertices near the cut are seeds; each crossed shared edge is split once.
export function splitFace( data, index, a, b ) {

	const face = data.faces[ index ], ia = face.indexOf( a ), ib = face.indexOf( b );
	if ( ia < 0 || ib < 0 || ia === ib ) return false;
	const lo = Math.min( ia, ib ), hi = Math.max( ia, ib );
	const first = face.slice( lo, hi + 1 ), second = [ ...face.slice( hi ), ...face.slice( 0, lo + 1 ) ];
	if ( first.length < 3 || second.length < 3 ) return false;
	data.faces.splice( index, 1, faceCorners( first, face ), faceCorners( second, face ) );
	return true;

}
export function cutAcrossMesh( data, a, b, project, fraction = ( edge, t ) => t, seeds = [] ) {

	const delta = [ b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ], length = delta[ 0 ] ** 2 + delta[ 1 ] ** 2;
	if ( length < 1 ) return [];
	const ids = new Set( seeds );
	for ( let i = 0; i < data.points.length; i ++ ) {

		const p = project( data.points[ i ] ); if ( ! p ) continue;
		const t = ( ( p[ 0 ] - a[ 0 ] ) * delta[ 0 ] + ( p[ 1 ] - a[ 1 ] ) * delta[ 1 ] ) / length;
		if ( t > .02 && t < .98 && Math.hypot( p[ 0 ] - a[ 0 ] - t * delta[ 0 ], p[ 1 ] - a[ 1 ] - t * delta[ 1 ] ) < 10 ) ids.add( i );

	}
	const cross = ( x, y ) => x[ 0 ] * y[ 1 ] - x[ 1 ] * y[ 0 ];
	for ( const edge of meshEdges( data ) ) {

		if ( edge.some( i => ids.has( i ) ) ) continue;
		const p = project( data.points[ edge[ 0 ] ] ), q = project( data.points[ edge[ 1 ] ] ); if ( ! p || ! q ) continue;
		const d = [ q[ 0 ] - p[ 0 ], q[ 1 ] - p[ 1 ] ], gap = [ a[ 0 ] - p[ 0 ], a[ 1 ] - p[ 1 ] ];
		const denominator = cross( d, delta ); if ( Math.abs( denominator ) < 1e-10 ) continue;
		const t = cross( gap, delta ) / denominator, u = cross( gap, d ) / denominator;
		if ( t > .02 && t < .98 && u >= 0 && u <= 1 ) ids.add( splitEdge( data, ...edge, fraction( edge, t ) ) );

	}
	let split = false;
	for ( let i = data.faces.length - 1; i >= 0; i -- ) {

		const found = data.faces[ i ].filter( id => ids.has( id ) );
		if ( found.length === 2 ) split = splitFace( data, i, ...found ) || split;

	}
	return split ? [ ...ids ] : [];

}

// Opposite-edge quad walking from ThreeGrease polyops.walkQuadLoop.
export function loopCut( data, edge, t = .5 ) {

	const ring = edgeLoop( data, edge, true );
	const values = new Map( [ [ elementKey( edge ), { edge, t } ] ] );
	let changed = true;
	while ( changed ) {

		changed = false;
		for ( const face of data.faces ) {

			if ( face.length !== 4 ) continue;
			for ( let i = 0; i < 4; i ++ ) {

				const entry = [ face[ i ], face[ ( i + 1 ) % 4 ] ], key = elementKey( entry ), source = values.get( key );
				if ( ! source ) continue;
				const opposite = [ face[ ( i + 3 ) % 4 ], face[ ( i + 2 ) % 4 ] ], other = elementKey( opposite );
				if ( ! values.has( other ) ) { values.set( other, { edge: opposite, t: source.edge[ 0 ] === entry[ 0 ] ? source.t : 1 - source.t } ); changed = true; }

			}

		}

	}
	if ( ring.length < 2 ) return [];
	const ids = new Set();
	for ( const { edge, t } of values.values() ) ids.add( splitEdge( data, ...edge, t ) );
	for ( let i = data.faces.length - 1; i >= 0; i -- ) { const found = data.faces[ i ].filter( id => ids.has( id ) ); if ( found.length === 2 ) splitFace( data, i, ...found ); }
	return [ ...ids ];

}

export function dissolveEdge( data, edge ) {

	const key = elementKey( edge );
	const adjacent = data.faces.map( ( face, index ) => ( { face, index } ) ).filter( ( { face } ) => face.some( ( a, i ) => elementKey( [ a, face[ ( i + 1 ) % face.length ] ] ) === key ) );
	if ( adjacent.length !== 2 ) return false;
	const perimeter = [];
	for ( const { face } of adjacent ) for ( let i = 0; i < face.length; i ++ ) { const e = [ face[ i ], face[ ( i + 1 ) % face.length ] ]; if ( elementKey( e ) !== key ) perimeter.push( e ); }
	const loop = [ perimeter[ 0 ][ 0 ] ];
	while ( loop.length < perimeter.length ) {

		const e = perimeter.find( e => e[ 0 ] === loop.at( -1 ) && ! loop.includes( e[ 1 ] ) );
		if ( ! e ) return false;
		loop.push( e[ 1 ] );

	}
	const merged = mergeFaceCorners( loop, adjacent[ 0 ].face, adjacent[ 1 ].face );
	data.faces.splice( adjacent[ 1 ].index, 1 ); data.faces.splice( adjacent[ 0 ].index, 1, merged );
	return true;

}

// ThreeGrease polyops.autoQuad priorities: U/triangle, bridge, L-corner.
export function autoQuad( THREE, data, cursor, project, addFace, radius = 90 ) {

	const screen = data.points.map( project );
	const distance = ( a, b ) => Math.hypot( a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ] );
	const open = meshEdges( data ).filter( edge => data.faces.filter( face => face.some( ( a, i ) => elementKey( [ a, face[ ( i + 1 ) % face.length ] ] ) === elementKey( edge ) ) ).length < 2 )
		.map( edge => ( { edge, d: screen[ edge[ 0 ] ] && screen[ edge[ 1 ] ] ? distance( screen[ edge[ 0 ] ].map( ( v, i ) => ( v + screen[ edge[ 1 ] ][ i ] ) / 2 ), cursor ) : Infinity } ) )
		.filter( entry => entry.d < radius ).sort( ( a, b ) => a.d - b.d );
	if ( ! open.length ) return false;
	const [ a, b ] = open[ 0 ].edge;
	const neighbors = vertex => open.slice( 1 ).filter( entry => entry.edge.includes( vertex ) ).map( entry => entry.edge.find( i => i !== vertex ) );
	const attempt = ids => { try { addFace( THREE, data, ids ); return true; } catch { return false; } };
	const aExt = neighbors( a ), bExt = neighbors( b );
	for ( const c of aExt ) if ( bExt.includes( c ) && attempt( [ a, b, c ] ) ) return true;
	const quads = aExt.flatMap( c => bExt.filter( d => c !== d && c !== b && d !== a ).map( d => ( { ids: [ c, a, b, d ], score: distance( screen[ c ], cursor ) + distance( screen[ d ], cursor ) } ) ) ).sort( ( a, b ) => a.score - b.score );
	for ( const { ids } of quads ) if ( attempt( ids ) ) return true;
	for ( const { edge: [ c, d ] } of open.slice( 1 ) ) {

		if ( [ c, d ].some( i => i === a || i === b ) ) continue;
		const straight = distance( screen[ b ], screen[ c ] ) + distance( screen[ a ], screen[ d ] );
		const crossed = distance( screen[ b ], screen[ d ] ) + distance( screen[ a ], screen[ c ] );
		if ( attempt( straight <= crossed ? [ a, b, c, d ] : [ a, b, d, c ] ) ) return true;

	}
	for ( const { edge } of open.slice( 1 ) ) {

		const shared = edge.find( i => i === a || i === b ); if ( shared === undefined ) continue;
		const p1 = shared === a ? b : a, p2 = edge.find( i => i !== shared ); if ( p1 === p2 ) continue;
		const point = data.points[ p1 ].map( ( value, axis ) => value + data.points[ p2 ][ axis ] - data.points[ shared ][ axis ] );
		const id = data.points.push( point ) - 1;
		if ( attempt( [ p1, shared, p2, id ] ) ) return true;
		data.points.pop();

	}
	return false;

}
