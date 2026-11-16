import { lightViewCamera } from './LightView.js';

export function layoutUV( THREE, object, mode, projector ) {

	object.updateWorldMatrix( true, false );
	const geometry = object.geometry;
	const next = new THREE.BufferGeometry();
	const split = mode === 'box' && geometry.index ? geometry.toNonIndexed() : null;
	next.copy( split || geometry );
	split?.dispose();
	const positions = next.attributes.position;
	const uv = new THREE.Float32BufferAttribute( new Float32Array( positions.count * 2 ), 2 );
	next.computeBoundingBox();
	const bounds = next.boundingBox;
	const extent = bounds.getSize( new THREE.Vector3() );
	const camera = projector && lightViewCamera( THREE, projector );
	for ( let i = 0; i < positions.count; i ++ ) {

		const p = new THREE.Vector3().fromBufferAttribute( positions, i );
		if ( camera ) {

			p.applyMatrix4( object.matrixWorld );
			if ( p.clone().applyMatrix4( camera.matrixWorldInverse ).z >= -camera.near ) throw new Error( 'The mesh must be in front of the projector.' );
			p.project( camera );
			uv.setXY( i, ( p.x + 1 ) / 2, ( p.y + 1 ) / 2 );
			continue;

		}
		let axes = mode === 'xz' ? [ 0, 2 ] : mode === 'yz' ? [ 2, 1 ] : [ 0, 1 ];
		if ( mode === 'box' ) {

			const first = Math.floor( i / 3 ) * 3;
			if ( first + 2 < positions.count ) {

				const points = [ 0, 1, 2 ].map( index => new THREE.Vector3().fromBufferAttribute( positions, first + index ) );
				const n = points[ 1 ].sub( points[ 0 ] ).cross( points[ 2 ].sub( points[ 0 ] ) );
				if ( Math.abs( n.x ) > Math.max( Math.abs( n.y ), Math.abs( n.z ) ) ) axes = [ 2, 1 ];
				else if ( Math.abs( n.y ) > Math.abs( n.z ) ) axes = [ 0, 2 ];

			}

		}
		uv.setXY( i, ...axes.map( axis => ( p.getComponent( axis ) - bounds.min.getComponent( axis ) ) / ( extent.getComponent( axis ) || 1 ) ) );

	}
	next.setAttribute( 'uv', uv );
	return next;

}
