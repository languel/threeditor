// Manually tracked windows in the bundled Mediatheque proxies.
// Each entry is [video seconds, [center X, center Y, radius X, radius Y]…] in source UVs.
export const fragments = [
	{
		clip: 'edison-fred-otts-sneeze-1894', seed: 11, roles: [ 'head', 'hand', 'hand' ],
		keys: [
			[ 17.05, [ .47,.32,.17,.25 ], [ .11,.64,.10,.17 ], [ .68,.30,.12,.13 ] ],
			[ 17.5, [ .47,.32,.17,.25 ], [ .12,.63,.10,.17 ], [ .72,.42,.12,.13 ] ],
			[ 17.75, [ .46,.33,.16,.24 ], [ .12,.64,.10,.17 ], [ .78,.69,.12,.11 ] ],
			[ 18, [ .46,.32,.17,.24 ], [ .12,.67,.10,.17 ], null ],
			[ 18.5, [ .48,.34,.17,.25 ], [ .10,.66,.09,.17 ], null ],
			[ 18.75, [ .42,.41,.17,.26 ], [ .10,.69,.09,.16 ], null ],
			[ 19, [ .40,.56,.17,.25 ], [ .09,.76,.08,.14 ], null ],
			[ 19.25, [ .41,.50,.17,.27 ], [ .09,.80,.08,.13 ], null ],
			[ 19.48, [ .51,.44,.17,.25 ], [ .09,.76,.08,.14 ], null ]
		]
	},
	{
		clip: 'edison-may-irwin-kiss-1896', seed: 41, roles: [ 'head', 'head', 'hand' ],
		keys: [
			[ 11, [ .085,.18,.085,.19 ], [ .69,.27,.17,.24 ], [ .23,.30,.11,.14 ] ],
			[ 11.25, [ .083,.16,.08,.19 ], [ .72,.25,.17,.23 ], [ .27,.28,.10,.13 ] ],
			[ 11.5, [ .09,.16,.08,.17 ], [ .77,.22,.16,.21 ], [ .26,.26,.10,.12 ] ],
			[ 11.75, [ .09,.12,.08,.15 ], [ .80,.22,.16,.21 ], [ .24,.24,.10,.13 ] ],
			[ 12, [ .10,.10,.09,.13 ], [ .83,.23,.14,.20 ], [ .25,.13,.10,.10 ] ],
			[ 12.25, [ .19,.13,.12,.17 ], [ .77,.22,.17,.21 ], [ .60,.34,.15,.14 ] ],
			[ 12.5, [ .26,.17,.13,.19 ], [ .73,.28,.16,.20 ], [ .57,.39,.12,.15 ] ],
			[ 12.75, [ .35,.20,.13,.22 ], [ .69,.31,.15,.21 ], [ .51,.44,.10,.14 ] ],
			[ 13.25, [ .43,.22,.14,.22 ], [ .65,.32,.14,.21 ], [ .50,.47,.10,.14 ] ],
			[ 13.85, [ .47,.22,.14,.22 ], [ .66,.32,.14,.20 ], [ .51,.46,.10,.14 ] ]
		]
	},
	{
		clip: 'edison-may-irwin-kiss-1896', seed: 83, roles: [ 'head', 'head' ],
		keys: [
			[ 1, [ .38,.37,.15,.21 ], [ .62,.43,.14,.21 ] ],
			[ 2, [ .38,.37,.15,.21 ], [ .62,.42,.14,.20 ] ],
			[ 3, [ .40,.38,.15,.22 ], [ .61,.42,.14,.20 ] ],
			[ 4, [ .41,.36,.15,.21 ], [ .60,.42,.14,.20 ] ]
		]
	}
];

export function createFragmentFeed( params, path, keys, seed, roles ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 512;
	const ctx = canvas.getContext( '2d' );
	const video = document.createElement( 'video' );
	video.muted = true;
	video.playsInline = true;
	video.preload = 'auto';
	let tracker, loading = false, disposed = false, liveCrops = [], lastDetection = - Infinity;
	async function loadTracker() {

		loading = true;
		try {

			const { FilesetResolver, FaceLandmarker, HandLandmarker } = await import( 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/vision_bundle.mjs' );
			const files = await FilesetResolver.forVisionTasks( 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm' );
			const models = 'https://storage.googleapis.com/mediapipe-models/';
			const specs = [
				[ FaceLandmarker, 'face_landmarker/face_landmarker/float16/1/face_landmarker.task', { numFaces: 2, minFaceDetectionConfidence: .25 } ],
				[ HandLandmarker, 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', { numHands: 2, minHandDetectionConfidence: .25 } ]
			];
			const results = await Promise.allSettled( specs.map( ( [ Type, path, options ] ) =>
				Type.createFromOptions( files, { baseOptions: { modelAssetPath: models + path }, runningMode: 'VIDEO', ...options } ) ) );
			const detectors = results.map( result => result.status === 'fulfilled' ? result.value : null );
			if ( disposed ) detectors.forEach( detector => detector?.close() );
			else if ( detectors.some( Boolean ) ) tracker = detectors;
			else throw results[ 0 ].reason;

		} catch ( error ) { console.warn( 'Gallery live tracking could not start; using authored masks.', error ); }

	}
	function box( result, head = false ) {

		const points = Array.isArray( result?.[ 0 ] ) ? result[ 0 ] : result;
		if ( ! points?.length ) return null;
		const x = points.map( point => point.x ), y = points.map( point => point.y );
		const l = Math.min( ...x ), r = Math.max( ...x ), t = Math.min( ...y ), b = Math.max( ...y );
		if ( ! [ l, r, t, b ].every( Number.isFinite ) ) return null;
		return [ ( l + r ) / 2, ( t + b ) / 2 - ( head ? ( b - t ) * .08 : 0 ),
			Math.max( .02, ( r - l ) * .56 ), Math.max( .025, ( b - t ) * ( head ? .68 : .57 ) ) ];

	}
	const start = keys[ 0 ][ 0 ], end = keys.at( -1 )[ 0 ];
	const random = n => { const v = Math.sin( n * 127.1 + seed * 311.7 ) * 43758.5453; return v - Math.floor( v ); };
	const reset = () => { liveCrops = []; video.currentTime = start; video.play().catch( () => {} ); };
	video.addEventListener( 'loadedmetadata', reset, { once: true } );
	video.src = path;

	return {
		canvas,
		update( time, settings ) {

			if ( video.readyState < 2 || video.seeking ) return;
			const at = video.currentTime;
			if ( settings.liveTracking ) {

				if ( ! loading ) void loadTracker();
				const now = performance.now();
				if ( tracker && now - lastDetection > 180 ) {

					lastDetection = now;
					try {

						const byX = ( a, b ) => a[ 0 ] - b[ 0 ];
						const heads = ( tracker[ 0 ]?.detectForVideo( video, now ).faceLandmarks || [] ).map( face => box( face, true ) ).filter( Boolean ).sort( byX );
						const hands = ( tracker[ 1 ]?.detectForVideo( video, now ).landmarks || [] ).map( hand => box( hand ) ).filter( Boolean ).sort( byX );
						liveCrops = roles.map( role => ( role === 'head' ? heads : hands ).shift() );

					} catch ( error ) {

						console.warn( 'Gallery tracking stopped; using authored masks.', error );
						tracker.forEach( detector => detector?.close() );
						tracker = null;
						liveCrops = [];

					}

				}

			}
			if ( at > end || at < start - 0.05 ) { reset(); return; }
			ctx.fillStyle = '#000';
			ctx.fillRect( 0, 0, 512, 512 );
			const following = keys.findIndex( row => row[ 0 ] > at );
			const a = keys[ Math.max( 0, following < 0 ? keys.length - 1 : following - 1 ) ];
			const b = keys[ following ] || a;
			const u = a === b ? 0 : Math.max( 0, ( at - a[ 0 ] ) / ( b[ 0 ] - a[ 0 ] ) );
			const drift = time * settings.drift;
			const beat = Math.floor( drift );
			const phase = drift - beat;
			const blend = phase * phase * ( 3 - 2 * phase );
			const live = settings.liveTracking && liveCrops.some( Boolean );
			canvas.dataset.tracking = ! settings.liveTracking ? 'authored' : live ? 'live' : tracker ? 'fallback' : 'loading-or-fallback';
			canvas.dataset.trackingHeads = live ? roles.filter( ( role, index ) => role === 'head' && liveCrops[ index ] ).length : 0;
			canvas.dataset.trackingHands = live ? roles.filter( ( role, index ) => role === 'hand' && liveCrops[ index ] ).length : 0;
			for ( let i = 1; i <= ( live ? liveCrops.length : a.length - 1 ); i ++ ) {

				const crop = ( live ? liveCrops[ i - 1 ] : null ) ??
					a[ i ]?.map( ( value, k ) => value + ( ( b[ i ]?.[ k ] ?? value ) - value ) * u );
				if ( ! crop ) continue;
				const [ x, y, rx, ry ] = crop;
				const randomAt = j => random( beat * 19 + i * 7 + j ) * ( 1 - blend ) + random( ( beat + 1 ) * 19 + i * 7 + j ) * blend;
				const px = 157 + randomAt( 0 ) * 198, py = 157 + randomAt( 1 ) * 198;
				const size = ( i === 1 ? 82 : 55 ) * settings.fragmentSize;
				ctx.save();
				ctx.beginPath();
				ctx.ellipse( px, py, size * .82, size, 0, 0, Math.PI * 2 );
				ctx.clip();
				ctx.drawImage( video, ( x - rx ) * video.videoWidth, ( y - ry ) * video.videoHeight,
					2 * rx * video.videoWidth, 2 * ry * video.videoHeight, px - size * .82, py - size, size * 1.64, size * 2 );
				ctx.restore();

			}

		},
		dispose() { disposed = true; tracker?.forEach( detector => detector?.close() ); video.pause(); video.removeAttribute( 'src' ); video.load(); }
	};

}

export function createPlateFeed( params, path, start, end ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 480;
	canvas.height = 360;
	const ctx = canvas.getContext( '2d' );
	const video = document.createElement( 'video' );
	video.muted = true;
	video.playsInline = true;
	video.addEventListener( 'loadedmetadata', () => { video.currentTime = start; video.play().catch( () => {} ); }, { once: true } );
	video.src = path;
	return {
		canvas,
		update() {

			if ( video.readyState < 2 || video.seeking ) return;
			if ( video.currentTime < start || video.currentTime > end ) { video.currentTime = start; return; }
			ctx.drawImage( video, 0, 0, canvas.width, canvas.height );

		},
		dispose() { video.pause(); video.removeAttribute( 'src' ); video.load(); }
	};

}
