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
