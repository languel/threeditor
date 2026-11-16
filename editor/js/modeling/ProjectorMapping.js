// These two functions also run inside serialized projector scripts.
export function drawTargetAperture( THREE, ctx, scratch, root, target, frame, x, y, width, height ) {

	root.updateWorldMatrix( true, false );
	target?.updateWorldMatrix( true, true );
	const meshes = [];
	const signature = [ target?.uuid, ...root.matrixWorld.elements, frame.aspect, frame.height, frame.range, x, y, width, height ];
	target?.traverseVisible( object => {

		if ( ! object.isMesh || object.isInstancedMesh || object.userData.runtimeOnly || ! object.geometry.attributes.position ) return;
		for ( let parent = object; parent; parent = parent.parent ) if ( parent.userData.threeditor?.disabled || ! parent.visible ) return;
		meshes.push( object );
		const geometry = object.geometry;
		const position = geometry.attributes.position;
		signature.push( geometry.uuid, position.version ?? position.data?.version, geometry.index?.version, ...object.matrixWorld.elements,
			...( object.morphTargetInfluences || [] ) );

	} );
	const key = signature.join( ',' );
	if ( scratch.apertureKey !== key || meshes.some( mesh => mesh.isSkinnedMesh ) ) {

		rasterize( scratch.getContext( '2d' ) );
		scratch.apertureKey = key;

	}
	ctx.save();
	ctx.globalCompositeOperation = 'destination-in';
	ctx.drawImage( scratch, 0, 0 );
	ctx.globalCompositeOperation = 'destination-over';
	ctx.fillStyle = '#000';
	ctx.fillRect( 0, 0, scratch.width, scratch.height );
	ctx.restore();

	function rasterize( ctx ) {
		ctx.clearRect( 0, 0, scratch.width, scratch.height );
		const camera = new THREE.PerspectiveCamera( THREE.MathUtils.radToDeg( 2 * Math.atan( frame.height ) ), frame.aspect, .01, frame.range );
		root.matrixWorld.decompose( camera.position, camera.quaternion, new THREE.Vector3() );
		camera.updateMatrixWorld( true );
		const matrix = new THREE.Matrix4(), vertex = new THREE.Vector4();
		function clip( polygon, distance ) {

			const output = [];
			for ( let i = 0; i < polygon.length; i ++ ) {

				const a = polygon[ i ], b = polygon[ ( i + 1 ) % polygon.length ];
				const da = distance( a ), db = distance( b );
				if ( da >= 0 ) output.push( a );
				if ( ( da >= 0 ) !== ( db >= 0 ) ) output.push( a.clone().lerp( b, da / ( da - db ) ) );

			}
			return output;

		}

		ctx.save();
		ctx.beginPath();
		ctx.rect( x, y, width, height );
		ctx.clip();
		ctx.beginPath();
		for ( const object of meshes ) {

			const geometry = object.geometry;
			const positions = geometry.attributes.position;
			const indices = geometry.index;
			matrix.copy( camera.projectionMatrix ).multiply( camera.matrixWorldInverse ).multiply( object.matrixWorld );
			for ( let i = 0, count = indices?.count ?? positions.count; i + 2 < count; i += 3 ) {

				let polygon = [ 0, 1, 2 ].map( offset => {

					const index = indices ? indices.getX( i + offset ) : i + offset;
					const point = object.getVertexPosition( index, new THREE.Vector3() );
					return vertex.set( point.x, point.y, point.z, 1 ).applyMatrix4( matrix ).clone();

				} );
				polygon = clip( clip( polygon, p => p.w + p.z ), p => p.w - p.z );
				if ( polygon.length < 3 ) continue;
				const points = polygon.map( p => [ x + ( 1 + p.x / p.w ) * width / 2, y + ( 1 - p.y / p.w ) * height / 2 ] );
				const area = points.reduce( ( sum, p, j ) => {

					const q = points[ ( j + 1 ) % points.length ];
					return sum + p[ 0 ] * q[ 1 ] - p[ 1 ] * q[ 0 ];

				}, 0 );
				if ( ! Number.isFinite( area ) || Math.abs( area ) < 1e-8 ) continue;
				if ( area < 0 ) points.reverse();
				ctx.moveTo( ...points[ 0 ] );
				for ( const point of points.slice( 1 ) ) ctx.lineTo( ...point );
				ctx.closePath();

			}

		}
		ctx.fillStyle = '#fff';
		ctx.fill( 'nonzero' );
		ctx.restore();

	}

}

export function warpProjection( ctx, scratch, warp, x, y, width, height ) {

	const { size, points } = warp;
	if ( size < 2 || points.length !== size * size ) return;
	const source = scratch.getContext( '2d' );
	source.clearRect( 0, 0, scratch.width, scratch.height );
	source.drawImage( ctx.canvas, 0, 0 );
	const step = 1 / ( size - 1 );
	ctx.save();
	ctx.beginPath();
	ctx.rect( x, y, width, height );
	ctx.clip();
	ctx.fillStyle = '#000';
	ctx.fillRect( x, y, width, height );
	function triangle( indices ) {

		const output = indices.map( i => [ x + i % size * step * width, y + Math.floor( i / size ) * step * height ] );
		const input = indices.map( i => [ x + points[ i ][ 0 ] * width, y + points[ i ][ 1 ] * height ] );
		const [ [ x0, y0 ], [ x1, y1 ], [ x2, y2 ] ] = input;
		const det = ( x1 - x0 ) * ( y2 - y0 ) - ( y1 - y0 ) * ( x2 - x0 );
		if ( Math.abs( det ) < 1e-8 ) return;
		const coefficients = axis => {

			const [ a, b, c ] = output.map( vertex => vertex[ axis ] );
			const m = ( ( b - a ) * ( y2 - y0 ) - ( c - a ) * ( y1 - y0 ) ) / det;
			const n = ( ( c - a ) * ( x1 - x0 ) - ( b - a ) * ( x2 - x0 ) ) / det;
			return [ m, n, a - m * x0 - n * y0 ];

		};
		const [ a, c, e ] = coefficients( 0 ), [ b, d, f ] = coefficients( 1 );
		const center = [ 0, 1 ].map( axis => output.reduce( ( sum, vertex ) => sum + vertex[ axis ], 0 ) / 3 );
		ctx.save();
		ctx.beginPath();
		output.forEach( ( [ u, v ], index ) => {

			const angle = Math.atan2( v - center[ 1 ], u - center[ 0 ] );
			ctx[ index ? 'lineTo' : 'moveTo' ]( u + .75 * Math.cos( angle ), v + .75 * Math.sin( angle ) );

		} );
		ctx.closePath();
		ctx.clip();
		ctx.transform( a, b, c, d, e, f );
		ctx.drawImage( scratch, 0, 0 );
		ctx.restore();

	}
	for ( let row = 0; row < size - 1; row ++ ) for ( let column = 0; column < size - 1; column ++ ) {

		const a = row * size + column, b = a + 1, c = a + size, d = c + 1;
		triangle( [ a, b, d ] );
		triangle( [ a, d, c ] );

	}
	ctx.restore();

}
