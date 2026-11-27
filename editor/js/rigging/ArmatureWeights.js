export function weightPointKey( position, vertex ) {

	return [ position.getX( vertex ), position.getY( vertex ), position.getZ( vertex ) ]
		.map( value => Math.round( value * 1e6 ) ).join( ',' );

}

export function normalizeBoneWeights( weights, boneIds, count ) {

	const order = new Map( boneIds.map( ( id, index ) => [ id, index ] ) );
	const entries = Object.entries( weights || {} )
		.filter( ( [ bone, weight ] ) => order.has( bone ) && Number.isFinite( weight ) && weight > 0 )
		.sort( ( a, b ) => b[ 1 ] - a[ 1 ] || order.get( a[ 0 ] ) - order.get( b[ 0 ] ) )
		.slice( 0, count );
	const sum = entries.reduce( ( total, entry ) => total + entry[ 1 ], 0 );
	return sum > 0 ? Object.fromEntries( entries.map( ( [ bone, weight ] ) => [ bone, weight / sum ] ) ) : null;

}

// Keep the active bone's requested share and distribute the rest to the
// remaining influences in their previous proportions.
export function paintBoneWeight( current, bone, value, boneIds, count ) {

	const others = { ...current };
	delete others[ bone ];
	const fallback = boneIds.find( id => id !== bone );
	if ( ! fallback ) return { [ bone ]: 1 };
	if ( count === 1 ) {

		const other = normalizeBoneWeights( others, boneIds, 1 );
		return value >= .5 ? { [ bone ]: 1 } : other || { [ fallback ]: 1 };

	}
	const available = count - Number( value > 0 );
	const normalized = normalizeBoneWeights( others, boneIds, available ) || { [ fallback ]: 1 };
	const result = {};
	if ( value > 0 ) result[ bone ] = value;
	if ( value < 1 ) for ( const [ id, weight ] of Object.entries( normalized ) ) result[ id ] = weight * ( 1 - value );
	return result;

}

export function weightNeighbors( object, position ) {

	const geometry = object.geometry;
	const index = geometry.index;
	const count = index?.count ?? position.count;
	const pointKeys = Array.from( { length: position.count }, ( _, vertex ) => weightPointKey( position, vertex ) );
	const result = new Map();
	const adjacent = vertex => index ? index.getX( vertex ) : vertex;
	function add( from, to ) {

		const a = pointKeys[ from ], b = pointKeys[ to ];
		if ( a === undefined || b === undefined || a === b ) return;
		if ( ! result.has( a ) ) result.set( a, new Map() );
		result.get( a ).set( b, to );
		if ( ! result.has( b ) ) result.set( b, new Map() );
		result.get( b ).set( a, from );

	}
	if ( object.isMesh ) for ( let i = 0; i + 2 < count; i += 3 ) {

		const a = adjacent( i ), b = adjacent( i + 1 ), c = adjacent( i + 2 );
		add( a, b );
		add( b, c );
		add( c, a );

	}
	else if ( object.isLine ) {

		for ( let i = 0; i + 1 < count; i += object.isLineSegments ? 2 : 1 ) add( adjacent( i ), adjacent( i + 1 ) );
		if ( object.isLineLoop && count > 2 ) add( adjacent( count - 1 ), adjacent( 0 ) );

	}
	return result;

}
