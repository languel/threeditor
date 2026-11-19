// Unfold a box into a cross, with a common scale and padding around the net.
export function cubeNetUV( [ x, y, z ], axis, positive, [ width, height, depth ] ) {

	const u = axis === 0 ? positive ? depth + width + ( 1 - z ) * depth : z * depth :
		axis === 2 && ! positive ? depth * 2 + width + ( 1 - x ) * width : depth + x * width;
	const v = axis === 1 ? positive ? depth + height + ( 1 - z ) * depth : z * depth :
		depth + y * height;
	const span = Math.max( 2 * ( width + depth ), height + 2 * depth );
	const margin = 1 / 256;
	const scale = ( 1 - 2 * margin ) / span;
	return [ .5 + ( u - width - depth ) * scale, .5 + ( v - height / 2 - depth ) * scale ];

}
