import { lightViewCamera } from './LightView.js';

export function layoutUV( THREE, object, mode, projector, view, geometry = object.geometry ) {

	object.updateWorldMatrix( true, false );
	const box = mode === 'box';
	const cylinder = mode === 'cylinder';
	const radial = cylinder || mode === 'sphere';
	const next = ( box || radial ) && geometry.index ? geometry.toNonIndexed() : new THREE.BufferGeometry().copy( geometry );
	next.name = geometry.name;
	next.userData = structuredClone( geometry.userData );
	next.setDrawRange( geometry.drawRange.start, geometry.drawRange.count );
	const positions = next.attributes.position;
	const uv = new THREE.Float32BufferAttribute( new Float32Array( positions.count * 2 ), 2 );
	next.computeBoundingBox();
	const bounds = next.boundingBox;
	const extent = bounds.getSize( new THREE.Vector3() );
	const center = bounds.getCenter( new THREE.Vector3() );
	const camera = projector ? lightViewCamera( THREE, projector ) : view;
	camera?.updateWorldMatrix( true, false );
	const normalized = ( p, axis ) => ( p.getComponent( axis ) - bounds.min.getComponent( axis ) ) / ( extent.getComponent( axis ) || 1 );
	const point = new THREE.Vector3();
	try {

		if ( box || radial ) {

			const triangle = [ new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3() ];
			const normal = new THREE.Vector3(), edge = new THREE.Vector3();
			const sideRows = [];
			for ( let first = 0; first + 2 < positions.count; first += 3 ) {

				triangle.forEach( ( p, i ) => p.fromBufferAttribute( positions, first + i ) );
				if ( box ) {

					normal.subVectors( triangle[ 1 ], triangle[ 0 ] ).cross( edge.subVectors( triangle[ 2 ], triangle[ 0 ] ) );
					const x = Math.abs( normal.x ), y = Math.abs( normal.y ), z = Math.abs( normal.z );
					const axis = x > Math.max( y, z ) ? 0 : y > z ? 1 : 2;
					const sign = normal.getComponent( axis ) < 0;
					const [ u, v ] = axis === 0 ? [ 2, 1 ] : axis === 1 ? [ 0, 2 ] : [ 0, 1 ];
					triangle.forEach( ( p, i ) => {

						const s = normalized( p, u );
						uv.setXY( first + i, ( axis + .04 + .92 * ( sign ? 1 - s : s ) ) / 3,
							( Number( sign ) + .04 + .92 * normalized( p, v ) ) / 2 );

					} );

				} else {

					const cap = cylinder && extent.y > 0 && triangle.every( p => Math.abs( p.y - triangle[ 0 ].y ) <= extent.y * 1e-6 );
					if ( cap ) {

						const top = triangle[ 0 ].y >= center.y;
						triangle.forEach( ( p, i ) => uv.setXY( first + i, ( top ? .51 : .01 ) + .48 * normalized( p, 0 ), .77 + .22 * normalized( p, 2 ) ) );
						continue;

					}
					sideRows.push( first );
					const longitude = triangle.map( p => Math.hypot( p.x - center.x, p.z - center.z ) < 1e-8 ? null :
						Math.atan2( p.z - center.z, p.x - center.x ) / ( 2 * Math.PI ) + .5 );
					const angles = longitude.filter( value => value !== null );
					const seam = Math.max( ...angles ) - Math.min( ...angles ) > .5;
					const active = angles.map( value => seam && value < .5 ? value + 1 : value );
					const pole = active.length ? active.reduce( ( sum, value ) => sum + value, 0 ) / active.length : .5;
					triangle.forEach( ( p, i ) => {

						const u = longitude[ i ];
						const v = mode === 'sphere' ? Math.atan2( p.y - center.y, Math.hypot( p.x - center.x, p.z - center.z ) ) / Math.PI + .5 : normalized( p, 1 );
						uv.setXY( first + i, u === null ? pole : seam && u < .5 ? u + 1 : u, cylinder ? .01 + .73 * v : v );

					} );

				}

			}
			if ( radial ) {

				let max = 1;
				for ( const first of sideRows ) for ( let i = first; i < first + 3; i ++ ) max = Math.max( max, uv.getX( i ) );
				for ( const first of sideRows ) for ( let i = first; i < first + 3; i ++ ) uv.setX( i, uv.getX( i ) / max );

			}

		} else for ( let i = 0; i < positions.count; i ++ ) {

			point.fromBufferAttribute( positions, i );
			if ( camera ) {

				point.applyMatrix4( object.matrixWorld );
				if ( point.clone().applyMatrix4( camera.matrixWorldInverse ).z >= -camera.near ) throw new Error( 'The mesh must be in front of the ' + ( projector ? 'projector.' : 'view camera.' ) );
				point.project( camera );
				uv.setXY( i, ( point.x + 1 ) / 2, ( point.y + 1 ) / 2 );

			} else {

				const [ u, v ] = mode === 'xz' ? [ 0, 2 ] : mode === 'yz' ? [ 2, 1 ] : [ 0, 1 ];
				uv.setXY( i, normalized( point, u ), normalized( point, v ) );

			}

		}

	} catch ( error ) {

		next.dispose();
		throw error;

	}
	next.setAttribute( 'uv', uv );
	return next;

}
