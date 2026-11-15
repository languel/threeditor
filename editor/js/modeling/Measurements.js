// Distance, units and oriented polygon area adapted from Threegrease.
export const lengthUnits = { m: 1, cm: .01, mm: .001, ft: .3048, in: .0254 };

export function measurementLength( points, closed = false ) {

	let total = 0;
	for ( let i = 1; i < points.length; i ++ ) total += points[ i - 1 ].distanceTo( points[ i ] );
	if ( closed && points.length > 2 ) total += points[ points.length - 1 ].distanceTo( points[ 0 ] );
	return total;

}

export function measurementArea( THREE, points ) {

	if ( points.length < 3 ) return 0;
	const area = new THREE.Vector3();
	for ( let i = 0; i < points.length; i ++ ) {

		const a = points[ i ], b = points[ ( i + 1 ) % points.length ];
		area.x += ( a.y - b.y ) * ( a.z + b.z );
		area.y += ( a.z - b.z ) * ( a.x + b.x );
		area.z += ( a.x - b.x ) * ( a.y + b.y );

	}
	return area.length() / 2;

}

export function worldMeasurePoints( THREE, scene, object, points ) {

	return points.map( data => {

		const target = data.target && scene.getObjectByProperty( 'uuid', data.target );
		if ( target ) return target.localToWorld( new THREE.Vector3( ...data.local ) );
		const world = new THREE.Vector3( ...data.position );
		return object ? object.localToWorld( world ) : world;

	} );

}

export function makeMeasurePoint( point, target, ruler ) {

	const position = point.clone();
	const local = target?.worldToLocal( point.clone() );
	if ( ruler ) ruler.worldToLocal( position );
	return { position: position.toArray(), ...( local ? { target: target.uuid, local: local.toArray() } : {} ) };

}

export function formatMeasurement( value, unit, metersPerUnit, area = false ) {

	const factor = metersPerUnit / ( lengthUnits[ unit ] || 1 );
	return ( value * ( area ? factor ** 2 : factor ) ).toFixed( unit === 'mm' ? 0 : 2 ) + ' ' + unit + ( area ? '²' : '' );

}
