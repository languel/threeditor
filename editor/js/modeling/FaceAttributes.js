// Editing metadata follows each face and its ordered corners. Buffer attributes
// and material groups are the serialized source of truth.
export function readFaceAttributes( geometry, data, authored ) {

	const { attributes, groups, index } = geometry;
	const names = Object.keys( attributes ).filter( name => /^uv[0-9]*$/.test( name ) || name === 'color' );
	if ( ! groups.length && ! names.length ) return data;
	const position = attributes.position;
	const count = Math.floor( ( index?.count ?? position.count ) / 3 );
	const slots = new Int32Array( count ).fill( -1 );
	for ( const group of groups ) {

		slots.fill( group.materialIndex, Math.floor( group.start / 3 ), Math.floor( ( group.start + group.count ) / 3 ) );

	}
	const cornerMaps = authored ? data.faces.map( face => new Map( face.map( ( point, corner ) =>
		[ data.points[ point ].map( Math.fround ).join( ',' ), corner ] ) ) ) : null;
	for ( const face of data.faces ) delete face.surface;
	for ( let triangle = 0; triangle < count; triangle ++ ) {

		const faceIndex = authored ? geometry.userData.triangleFaces?.[ triangle ] : triangle;
		const face = data.faces[ faceIndex ];
		if ( ! face ) continue;
		const surface = face.surface ||= { slot: groups.length ? slots[ triangle ] : undefined, channels: {} };
		for ( let j = 0; j < 3; j ++ ) {

			const vertex = index ? index.getX( triangle * 3 + j ) : triangle * 3 + j;
			const corner = authored ? cornerMaps[ faceIndex ].get( [ position.getX( vertex ), position.getY( vertex ), position.getZ( vertex ) ].join( ',' ) ) : j;
			if ( corner === undefined ) continue;
			for ( const name of names ) {

				const channel = surface.channels[ name ] ||= [];
				const attribute = attributes[ name ];
				channel[ corner ] ??= Array.from( { length: attribute.itemSize }, ( _, axis ) => attribute.isFloat16BufferAttribute ?
					attribute[ [ 'getX', 'getY', 'getZ', 'getW' ][ axis ] ]( vertex ) : attribute.getComponent( vertex, axis ) );

			}

		}

	}
	return data;

}

export function faceCorners( target, source, corners = target.map( point => source.indexOf( point ) ) ) {

	if ( source.surface ) target.surface = {
		slot: source.surface.slot,
		channels: Object.fromEntries( Object.entries( source.surface.channels ).map( ( [ name, values ] ) =>
			[ name, corners.map( corner => values[ corner ]?.slice() ) ] ) )
	};
	return target;

}

export function inheritMaterial( face, source ) {

	if ( source?.surface?.slot !== undefined ) face.surface = { slot: source.surface.slot, channels: {} };
	return face;

}

export function interpolateFaceCorner( face, corner, weights ) {

	for ( const channel of Object.values( face.surface?.channels || {} ) ) {

		const values = weights.map( ( [ index ] ) => channel[ index ] );
		const value = values.every( Boolean ) ? values[ 0 ].map( ( _, axis ) =>
			values.reduce( ( sum, value, i ) => sum + value[ axis ] * weights[ i ][ 1 ], 0 ) ) : undefined;
		channel.splice( corner, 0, value );

	}

}

export function mergeFaceCorners( target, a, b ) {

	const first = a.surface, second = b.surface;
	if ( ! first && ! second ) return target;
	if ( first?.slot !== second?.slot ) throw new Error( 'This edge separates two material slots.' );
	const channels = {};
	for ( const name of new Set( [ ...Object.keys( first?.channels || {} ), ...Object.keys( second?.channels || {} ) ] ) ) {

		channels[ name ] = target.map( point => {

			const left = first?.channels[ name ]?.[ a.indexOf( point ) ];
			const right = second?.channels[ name ]?.[ b.indexOf( point ) ];
			if ( left && right && ( left.length !== right.length || left.some( ( value, i ) => Math.abs( value - right[ i ] ) > 1e-6 ) ) ) {

				throw new Error( 'This edge separates two UV or color seams.' );

			}
			return ( left || right )?.slice();

		} );

	}
	target.surface = { slot: first?.slot, channels };
	return target;

}
