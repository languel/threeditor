// Store the brush as a regular mesh so the editable stroke also works in Play and exports.
export function pencilRibbon( THREE, points, closed, brush ) {

	const geometry = new THREE.BufferGeometry();
	const positions = [], colors = [], indices = [], uv = [];
	const samples = brush.samples;
	const color = new THREE.Color( brush.color );
	const fade = Math.max( .005, 1 - brush.hardness );
	const rings = [ [ -1, 0 ], [ -1 + fade, 1 ], [ 1 - fade, 1 ], [ 1, 0 ] ];
	const grainFrequency = ( brush.grainScale || 6 ) / 8;
	const add = ( point, alpha, u, across ) => {

		positions.push( point.x, point.y, point.z );
		colors.push( color.r, color.g, color.b, alpha * brush.strength );
		uv.push( u * grainFrequency, across * grainFrequency );
		return positions.length / 3 - 1;

	};
	const frameAt = ( point, index ) => {

		const from = points[ index - 1 ] || ( closed ? points.at( -1 ) : point );
		const to = points[ index + 1 ] || ( closed ? points[ 0 ] : point );
		const tangent = to.clone().sub( from ).normalize();
		const sample = samples[ Math.round( index * ( samples.length - 1 ) / Math.max( 1, points.length - 1 ) ) ];
		const normal = new THREE.Vector3().fromArray( sample.normal ).normalize();
		const side = new THREE.Vector3().crossVectors( normal, tangent );
		if ( side.lengthSq() < 1e-8 ) side.crossVectors( Math.abs( tangent.x ) > .9 ? new THREE.Vector3( 0, 1, 0 ) : new THREE.Vector3( 1, 0, 0 ), tangent );
		side.normalize();
		const nibAngle = brush.angle || 0;
		const aspect = brush.aspect || 1;
		const nibWidth = Math.hypot( side.dot( new THREE.Vector3().fromArray( sample.right ).applyAxisAngle( normal, nibAngle ) ),
			aspect * side.dot( new THREE.Vector3().fromArray( sample.up ).applyAxisAngle( normal, nibAngle ) ) );
		return { tangent, side, radius: sample.radius * Math.max( .18, nibWidth ) };

	};
	if ( points.length > 1 ) {

		const frames = points.map( frameAt );
		let distance = 0;
		const ringCount = points.length + ( closed ? 1 : 0 );
		for ( let i = 0; i < ringCount; i ++ ) {

			const next = i % points.length;
			const point = points[ next ];
			const { side, radius } = frames[ next ];
			if ( i ) {

				const previous = ( i - 1 ) % points.length;
				distance += point.distanceTo( points[ previous ] ) / Math.max( 1e-6, radius + frames[ previous ].radius );

			}
			for ( const [ u, alpha ] of rings ) add( point.clone().addScaledVector( side, u * radius ), alpha, distance, ( u + 1 ) / 2 );

		}
		const count = rings.length;
		for ( let i = 0; i < ringCount - 1; i ++ ) {

			const a = i * count, b = ( i + 1 ) * count;
			for ( let j = 0; j < count - 1; j ++ ) indices.push( a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j );

		}
		if ( ! closed ) for ( const end of [ 0, points.length - 1 ] ) {

			const point = points[ end ], { tangent, side, radius } = frames[ end ];
			const along = end ? distance : 0;
			const directionSign = end ? 1 : -1;
			const center = add( point, 1, along, .5 );
			let previous;
			for ( let i = 0; i <= 10; i ++ ) {

				const angle = i * Math.PI / 10;
				const x = Math.cos( angle ), y = directionSign * Math.sin( angle );
				const direction = side.clone().multiplyScalar( x ).addScaledVector( tangent, y );
				const core = 1 - fade;
				const inner = add( point.clone().addScaledVector( direction, radius * core ), 1, along + y * core / 2, ( x * core + 1 ) / 2 );
				const outer = add( point.clone().addScaledVector( direction, radius ), 0, along + y / 2, ( x + 1 ) / 2 );
				if ( previous ) indices.push( center, previous[ 0 ], inner, previous[ 0 ], previous[ 1 ], inner, inner, previous[ 1 ], outer );
				previous = [ inner, outer ];

			}

		}

	}
	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 4 ) );
	geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	geometry.setIndex( indices );
	geometry.computeVertexNormals();
	return geometry;

}
