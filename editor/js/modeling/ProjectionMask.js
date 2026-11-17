export function maskFromOutline( points ) {

	if ( points.length < 3 ) throw new Error( 'A mask needs at least three points.' );
	const bounds = points.reduce( ( b, [ x, y ] ) => [
		Math.min( b[ 0 ], x ), Math.min( b[ 1 ], y ), Math.max( b[ 2 ], x ), Math.max( b[ 3 ], y )
	], [ Infinity, Infinity, - Infinity, - Infinity ] );
	const width = bounds[ 2 ] - bounds[ 0 ], height = bounds[ 3 ] - bounds[ 1 ];
	if ( ! width || ! height ) throw new Error( 'The outline needs both width and height.' );
	return { mode: 'inside', points: points.map( ( [ x, y ] ) => [ .1 + .8 * ( x - bounds[ 0 ] ) / width, .1 + .8 * ( bounds[ 3 ] - y ) / height ] ) };

}

// Keep black outside an aperture (inside) or black out the polygon (cutout).
// top-left UVs match both the image editor and the projector canvas.
export function applyProjectionMask( ctx, mask, x, y, width, height ) {

	if ( mask?.shapes ) {

		const shapes = mask.shapes.filter( shape => shape.points?.length >= 3 );
		if ( ! shapes.length || width <= 0 || height <= 0 ) return;
		const scratch = ctx.projectionMaskScratch ||= ctx.canvas.ownerDocument.createElement( 'canvas' );
		const w = Math.ceil( width ), h = Math.ceil( height );
		if ( scratch.width !== w ) scratch.width = w;
		if ( scratch.height !== h ) scratch.height = h;
		const matte = scratch.getContext( '2d' );
		matte.clearRect( 0, 0, w, h );
		matte.fillStyle = '#000';
		const apertures = shapes.filter( shape => shape.mode !== 'cutout' );
		if ( ! apertures.length ) matte.fillRect( 0, 0, w, h );
		for ( const mode of [ 'inside', 'cutout' ] ) {

			matte.globalCompositeOperation = mode === 'inside' ? 'source-over' : 'destination-out';
			for ( const { points } of mode === 'inside' ? apertures : shapes.filter( shape => shape.mode === 'cutout' ) ) {

				matte.beginPath();
				points.forEach( ( [ u, v ], i ) => matte[ i ? 'lineTo' : 'moveTo' ]( u * w, v * h ) );
				matte.closePath();
				matte.fill( 'evenodd' );

			}

		}
		matte.globalCompositeOperation = 'source-over';
		ctx.save();
		ctx.beginPath();
		ctx.rect( x, y, width, height );
		ctx.clip();
		ctx.globalCompositeOperation = 'destination-in';
		ctx.drawImage( scratch, x, y, width, height );
		ctx.globalCompositeOperation = 'destination-over';
		ctx.fillStyle = '#000';
		ctx.fillRect( x, y, width, height );
		ctx.restore();
		return;

	}

	if ( ! mask || mask.points?.length < 3 ) return;
	ctx.save();
	ctx.beginPath();
	if ( mask.mode === 'inside' ) ctx.rect( x, y, width, height );
	mask.points.forEach( ( [ u, v ], i ) => {

		const px = x + u * width, py = y + v * height;
		if ( i === 0 ) ctx.moveTo( px, py );
		else ctx.lineTo( px, py );

	} );
	ctx.closePath();
	ctx.fillStyle = '#000';
	ctx.fill( 'evenodd' );
	ctx.restore();

}

export function maskShapes( mask ) {

	return structuredClone( mask?.shapes || ( mask?.points?.length >= 3 ? [ { name: 'Mask 1', mode: mask.mode, points: mask.points } ] : [] ) );

}

export function appendMaskShape( mask, shape ) {

	const shapes = maskShapes( mask );
	shapes.push( { ...shape, name: shape.name || 'Mask ' + ( shapes.length + 1 ) } );
	return { shapes };

}
