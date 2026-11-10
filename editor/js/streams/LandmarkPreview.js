const poseLinks = [ [11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32] ];
const handLinks = Array.from( { length: 5 }, ( _, i ) => {

	const a = 1 + i * 4;
	return [ [ 0, a ], [ a, a + 1 ], [ a + 1, a + 2 ], [ a + 2, a + 3 ] ];

} ).flat();

export function drawStreamPreview( canvas, frame, get = () => undefined ) {

	const width = frame?.videoWidth || frame?.naturalWidth || frame?.width;
	const height = frame?.videoHeight || frame?.naturalHeight || frame?.height;
	if ( ! width || ! height || ( frame.readyState !== undefined && frame.readyState < 2 ) ) return false;
	const w = 480, h = Math.max( 1, Math.round( w * height / width ) );
	if ( canvas.width !== w || canvas.height !== h ) { canvas.width = w; canvas.height = h; }
	const ctx = canvas.getContext( '2d' );
	if ( ! ctx ) return false;
	ctx.drawImage( frame, 0, 0, w, h );
	function draw( name, color, links = [], radius = 1.5 ) {

		const points = get( 'vision.' + name + '.landmarks' );
		if ( ! points?.length ) return;
		const visible = point => point && ( name !== 'pose' || ( point.visibility ?? 1 ) > .3 );
		ctx.strokeStyle = ctx.fillStyle = color;
		ctx.lineWidth = 2;
		ctx.beginPath();
		for ( const [ i, j ] of links ) {

			const a = points[ i ], b = points[ j ];
			if ( ! visible( a ) || ! visible( b ) ) continue;
			ctx.moveTo( a.x * w, a.y * h );
			ctx.lineTo( b.x * w, b.y * h );

		}
		ctx.stroke();
		ctx.beginPath();
		for ( const point of points ) {

			if ( ! visible( point ) ) continue;
			const x = point.x * w, y = point.y * h;
			ctx.moveTo( x + radius, y );
			ctx.arc( x, y, radius, 0, Math.PI * 2 );

		}
		ctx.fill();

	}
	draw( 'pose', '#75f9b5', poseLinks, 2.5 );
	draw( 'face', '#d4b8ff', [], 1 );
	if ( get( 'vision.leftHand.landmarks' ) || get( 'vision.rightHand.landmarks' ) ) {

		draw( 'leftHand', '#6ce5ff', handLinks );
		draw( 'rightHand', '#ffa46c', handLinks );

	} else draw( 'hand', '#6ce5ff', handLinks );
	draw( 'iris.left', '#ffee73', [], 2 );
	draw( 'iris.right', '#ffee73', [], 2 );
	return true;

}
