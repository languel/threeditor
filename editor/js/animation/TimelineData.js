// Timing and interpolation model adapted from ArtistModelStudio's parameter lanes.
export function timelineData( scene ) {

	return scene.userData.timeline || { fps: 30, clips: [] };

}

export function timelineEnd( data ) {

	return Math.max( 0, ...data.clips.map( clip => clip.start + clip.duration ) );

}

export function targetId( target ) {

	const { kind, object, property, slot, scriptId, index, map } = target;
	return JSON.stringify( [ kind, object, property, slot, scriptId || index, ...( map ? [ map ] : [] ) ] );

}

function mix( a, b, u ) {

	if ( typeof a === 'number' && typeof b === 'number' ) return a + ( b - a ) * u;
	if ( Array.isArray( a ) && Array.isArray( b ) && a.length === b.length ) return a.map( ( value, i ) => mix( value, b[ i ], u ) );
	if ( /^#[\da-f]{6}$/i.test( a ) && /^#[\da-f]{6}$/i.test( b ) ) {

		const channels = [ 1, 3, 5 ].map( i => Math.round( mix( parseInt( a.slice( i, i + 2 ), 16 ), parseInt( b.slice( i, i + 2 ), 16 ), u ) ) );
		return '#' + channels.map( value => value.toString( 16 ).padStart( 2, '0' ) ).join( '' );

	}
	return a;

}

export function valueAt( keys, time ) {

	if ( ! keys.length ) return undefined;
	if ( time <= keys[ 0 ].time ) return keys[ 0 ].value;
	if ( time >= keys.at( -1 ).time ) return keys.at( -1 ).value;
	let lo = 0, hi = keys.length - 1;
	while ( hi - lo > 1 ) {

		const middle = ( lo + hi ) >> 1;
		if ( keys[ middle ].time <= time ) lo = middle;
		else hi = middle;

	}
	const a = keys[ lo ], b = keys[ hi ];
	if ( a.interpolation === 'hold' ) return a.value;
	const t = ( time - a.time ) / ( b.time - a.time );
	return mix( a.value, b.value, a.interpolation === 'ease' ? t * t * ( 3 - 2 * t ) : t );

}

export function putKey( track, time, value, interpolation = 'linear' ) {

	const key = track.keys.find( key => Math.abs( key.time - time ) < 1e-6 );
	if ( key ) key.value = value;
	else track.keys.push( { time, value, interpolation } );
	track.keys.sort( ( a, b ) => a.time - b.time );

}
