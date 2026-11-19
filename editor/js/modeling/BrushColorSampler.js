import { pencilBrush } from './PencilBrush.js?v=pencil-placement';

export function createBrushColorSampler( editor ) {

	let context;
	return ( image, u, v, fallback ) => {

		let color = fallback;
		if ( image ) {

			const width = image.videoWidth || image.naturalWidth || image.width;
			const height = image.videoHeight || image.naturalHeight || image.height;
			if ( ! width || ! height || u < 0 || u > 1 || v < 0 || v > 1 ) return;
			if ( ! context ) {

				const canvas = document.createElement( 'canvas' );
				canvas.width = canvas.height = 1;
				context = canvas.getContext( '2d', { willReadFrequently: true } );

			}
			context.clearRect( 0, 0, 1, 1 );
			try {

				const x = Math.min( width - 1, Math.floor( u * width ) );
				const y = Math.min( height - 1, Math.floor( v * height ) );
				context.drawImage( image, x, y, 1, 1, 0, 0, 1, 1 );
				const [ r, g, b, a ] = context.getImageData( 0, 0, 1, 1 ).data;
				if ( ! a ) return;
				color = '#' + [ r, g, b ].map( channel => channel.toString( 16 ).padStart( 2, '0' ) ).join( '' );

			} catch {

				// Reset the scratch canvas after an unreadable or cross-origin source.
				context.canvas.width = 1;
				return;

			}

		}
		if ( color ) pencilBrush( editor ).color = color;
		return color;

	};

}
