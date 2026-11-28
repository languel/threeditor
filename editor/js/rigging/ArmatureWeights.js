import { mirroredBoneName } from './Armature.js';
import { hasRestriction } from '../ObjectRestrictions.js';

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

export function paintMirrorCenter( current, bone, other, value, boneIds, count ) {

	if ( bone === other || count === 1 ) return paintBoneWeight( current, bone, value, boneIds, count );
	const others = boneIds.filter( id => id !== bone && id !== other );
	const normalized = normalizeBoneWeights( current, others, count - ( value > 0 ? 2 : 0 ) );
	if ( ! normalized && ( ! others.length || count === 2 && value > 0 ) ) return { [ bone ]: .5, [ other ]: .5 };
	const share = Math.min( .5, value );
	const result = {};
	if ( share > 0 ) Object.assign( result, { [ bone ]: share, [ other ]: share } );
	if ( share < .5 ) for ( const [ id, weight ] of Object.entries( normalized || { [ others[ 0 ] ]: 1 } ) ) result[ id ] = weight * ( 1 - share * 2 );
	return result;

}

const mirrorGeometryCache = new WeakMap();

// Pair coincident seams once, in the armature's bind coordinates. A mutual
// nearest match keeps unrelated points on imperfect assets from sharing paint.
function mirrorVertices( THREE, position, objectToRig ) {

	if ( ! mirrorGeometryCache.has( position ) ) mirrorGeometryCache.set( position, new WeakMap() );
	const entries = mirrorGeometryCache.get( position );
	const version = position.data?.version ?? position.version;
	const existing = entries.get( objectToRig );
	if ( existing?.version === version ) return existing.pairedVertex;
	const matrix = new THREE.Matrix4().fromArray( objectToRig );
	const points = new Float64Array( position.count * 3 );
	const representatives = new Int32Array( position.count ).fill( -1 );
	const unique = new Map();
	const min = new THREE.Vector3( Infinity, Infinity, Infinity ), max = new THREE.Vector3( - Infinity, - Infinity, - Infinity );
	const point = new THREE.Vector3();
	for ( let vertex = 0; vertex < position.count; vertex ++ ) {

		const key = weightPointKey( position, vertex );
		if ( ! unique.has( key ) ) {

			point.fromBufferAttribute( position, vertex ).applyMatrix4( matrix );
			if ( ! [ point.x, point.y, point.z ].every( Number.isFinite ) ) continue;
			point.toArray( points, vertex * 3 );
			min.min( point );
			max.max( point );
			unique.set( key, vertex );

		}
		representatives[ vertex ] = unique.get( key );

	}
	const extent = max.sub( min );
	const tolerance = Math.max( 1e-6, Math.max( extent.x, extent.y, extent.z ) * 1e-5 );
	const bins = new Map();
	const bin = value => Math.floor( value / tolerance );
	for ( const vertex of unique.values() ) {

		const i = vertex * 3;
		const key = bin( points[ i ] ) + ',' + bin( points[ i + 1 ] ) + ',' + bin( points[ i + 2 ] );
		if ( ! bins.has( key ) ) bins.set( key, [] );
		bins.get( key ).push( vertex );

	}
	const caches = new Map();
	function nearest( vertex ) {

		if ( caches.has( vertex ) ) return caches.get( vertex );
		const i = 3 * vertex;
		const x = - points[ i ], y = points[ i + 1 ], z = points[ i + 2 ];
		const bx = bin( x ), by = bin( y ), bz = bin( z );
		let closest, distance = tolerance * tolerance;
		for ( let a = - 1; a <= 1; a ++ ) for ( let b = - 1; b <= 1; b ++ ) for ( let c = - 1; c <= 1; c ++ ) {

			const bin = bins.get( ( bx + a ) + ',' + ( by + b ) + ',' + ( bz + c ) );
			if ( ! bin ) continue;
			for ( const candidate of bin ) {

				const j = 3 * candidate;
				const delta = ( x - points[ j ] ) ** 2 + ( y - points[ j + 1 ] ) ** 2 + ( z - points[ j + 2 ] ) ** 2;
				if ( delta < distance || delta === distance && ( closest === undefined || candidate < closest ) ) {

					distance = delta;
					closest = candidate;

				}

			}

		}
		caches.set( vertex, closest );
		return closest;

	}
	function pairedVertex( index ) {

		const vertex = representatives[ index ];
		if ( vertex === undefined || vertex === - 1 ) return;
		const mirror = nearest( vertex );
		return mirror !== undefined && nearest( mirror ) === vertex ? mirror : undefined;

	}
	entries.set( objectToRig, { version, pairedVertex } );
	return pairedVertex;

}

export function createWeightMirror( THREE, weights, objectToRig, bone ) {

	const selected = weights.bones.find( candidate => candidate.uuid === bone );
	if ( ! selected ) return null;
	const name = mirroredBoneName( selected.name )?.name;
	const counterparts = name ? weights.bones.filter( candidate => candidate.name === name ) : [];
	if ( counterparts.length > 1 || hasRestriction( counterparts[ 0 ], 'disabled' ) ||
		name && weights.bones.filter( candidate => candidate.name === selected.name ).length !== 1 ) return null;
	return { bone: counterparts[ 0 ]?.uuid ?? bone, pairedVertex: mirrorVertices( THREE, weights.position, objectToRig ) };

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
