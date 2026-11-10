// Load Tasks Vision only when tracking is requested. Keep model/WASM URLs pinned.
const tasks = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0';
const models = 'https://storage.googleapis.com/mediapipe-models/';
const trackers = {
	pose: [ 'PoseLandmarker', 'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' ],
	hand: [ 'HandLandmarker', 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' ],
	holistic: [ 'HolisticLandmarker', 'holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task' ],
	face: [ 'FaceLandmarker', 'face_landmarker/face_landmarker/float16/1/face_landmarker.task' ]
};

class MediaStreams {

	constructor( bus, id, primary = () => true ) {

		this.bus = bus;
		this.prefix = id ? 'input.' + id + '.' : '';
		this.primary = primary;

	}

	publish( topic, value ) {

		if ( this.prefix ) this.bus.publish( this.prefix + topic, value );
		if ( topic.startsWith( 'vision.' ) || this.primary() ) this.bus.publish( topic, value );

	}

	clear( topic ) {

		if ( this.prefix ) this.bus.clear( this.prefix + topic );
		if ( topic.startsWith( 'vision.' ) || this.primary() ) this.bus.clear( topic );

	}

	refreshFrame() { this.#lastFrame = -1; }

	// Input settings: mirror, rotate and crop (fractions trimmed from each edge) applied before routing and tracking.
	settings = { flipX: false, flipY: false, rotate: 0, left: 0, top: 0, right: 0, bottom: 0 };
	#canvas = null;

	get transformed() {

		const t = this.settings;
		return t.flipX || t.flipY || t.rotate || t.left || t.top || t.right || t.bottom;

	}

	setSettings( values ) { Object.assign( this.settings, values ); this.refreshFrame(); }

	// The frame consumers should read: the raw element, or a canvas with the settings applied.
	get frame() { return this.transformed && this.#canvas ? this.#canvas : this.element; }

	#process( source ) {

		const t = this.settings;
		const sw = source.videoWidth || source.naturalWidth || source.width, sh = source.videoHeight || source.naturalHeight || source.height;
		const sx = Math.min( t.left, .9 ) * sw, sy = Math.min( t.top, .9 ) * sh;
		const cw = Math.max( 1, sw - sx - Math.min( t.right, .9 ) * sw ), ch = Math.max( 1, sh - sy - Math.min( t.bottom, .9 ) * sh );
		const quarter = t.rotate === 90 || t.rotate === 270;
		const canvas = this.#canvas ||= document.createElement( 'canvas' );
		const w = Math.round( quarter ? ch : cw ), h = Math.round( quarter ? cw : ch );
		if ( canvas.width !== w || canvas.height !== h ) { canvas.width = w; canvas.height = h; }
		const ctx = canvas.getContext( '2d' );
		if ( ! ctx ) return source;
		ctx.save();
		ctx.translate( w / 2, h / 2 );
		ctx.rotate( t.rotate * Math.PI / 180 );
		ctx.scale( t.flipX ? - 1 : 1, t.flipY ? - 1 : 1 );
		ctx.drawImage( source, sx, sy, cw, ch, - cw / 2, - ch / 2, cw, ch );
		ctx.restore();
		return canvas;

	}

	#epoch = 0;
	#trackerEpoch = 0;
	#lastFrame = - 1;
	#lastSample = 0;

	async start( element, { file, image, still, camera, microphone, deviceId } ) {

		this.stop();
		this.paused = false;
		this.element = element;
		const epoch = this.#epoch;
		this.still = !! still;
		if ( still ) {

			if ( image ) this.element = image;
			else {

				this.url = URL.createObjectURL( file );
				element.src = this.url;
				await element.decode();

			}
			return;

		}
		if ( file ) {

			this.url = URL.createObjectURL( file );
			element.src = this.url;

		} else {

			const stream = await navigator.mediaDevices.getUserMedia( { video: camera && deviceId ? { deviceId: { exact: deviceId } } : !! camera, audio: microphone && deviceId ? { deviceId: { exact: deviceId } } : !! microphone } );
			if ( epoch !== this.#epoch ) { stream.getTracks().forEach( track => track.stop() ); return; }
			this.stream = stream;
			element.srcObject = stream;

		}
		element.muted = !! this.stream;
		try {

			await element.play();
			if ( epoch !== this.#epoch ) return;
			if ( file || microphone ) {

				this.context = new AudioContext();
				const source = file ? this.context.createMediaElementSource( element ) : this.context.createMediaStreamSource( this.stream );
				this.analyser = this.context.createAnalyser();
				this.wave = new Float32Array( this.analyser.fftSize );
				source.connect( this.analyser );
				if ( file ) this.analyser.connect( this.context.destination );
				await this.context.resume();

			}

		} catch ( error ) {

			if ( epoch !== this.#epoch ) return;
			this.stop();
			throw error;

		}

	}

	async track( mode ) {

		const epoch = ++ this.#trackerEpoch;
		this.tracker?.close();
		this.tracker = null;
		if ( this.mode || mode ) this.clear( 'vision.' );
		this.mode = mode;
		this.#lastFrame = - 1;
		if ( ! mode ) return;
		const vision = await import( tasks + '/vision_bundle.mjs' );
		const resolver = await vision.FilesetResolver.forVisionTasks( tasks + '/wasm' );
		const [ type, model ] = trackers[ mode ];
		const tracker = await vision[ type ].createFromOptions( resolver, {
			baseOptions: { modelAssetPath: models + model }, runningMode: 'VIDEO',
			...( [ 'holistic', 'face' ].includes( mode ) ? { outputFaceBlendshapes: true } : {} )
		} );
		if ( epoch !== this.#trackerEpoch ) { tracker.close(); return; }
		this.tracker = tracker;
		this.refreshFrame();

	}

	pause() {

		if ( this.stream ) this.stop();
		else this.element?.pause?.();
		this.paused = true;
		for ( const prefix of [ 'audio.', 'video.' ] ) this.clear( prefix );
		if ( this.mode ) this.clear( 'vision.' );

	}

	async resume( element, options ) {

		if ( options.still ) { this.paused = false; this.refreshFrame(); return; }
		if ( ! options.file ) {

			try { await this.start( element, options ); }
			catch ( error ) { this.stop(); this.paused = true; throw error; }
			return;

		}
		await element.play();
		this.paused = false;
		this.refreshFrame();

	}

	stop() {

		this.#epoch ++;
		this.stream?.getTracks().forEach( track => track.stop() );
		if ( this.element ) {

			this.element.pause?.();
			if ( ! this.still ) {
				this.element.srcObject = null;
				this.element.removeAttribute( 'src' );
				this.element.load();
			} else if ( this.url ) this.element.removeAttribute( 'src' );

		}
		if ( this.url ) URL.revokeObjectURL( this.url );
		if ( this.context ) void this.context.close().catch( () => {} );
		this.element = this.url = this.stream = this.context = this.analyser = this.wave = null;
		this.#lastFrame = - 1;
		for ( const prefix of [ 'audio.', 'video.' ] ) this.clear( prefix );
		if ( this.mode ) this.clear( 'vision.' );

	}

	tick( now ) {

		if ( this.paused || now - this.#lastSample < 50 ) return;
		this.#lastSample = now;
		const video = this.element;
		if ( ! video || ( ! this.still && video.readyState < 2 ) ) return;
		if ( this.analyser ) {

			this.analyser.getFloatTimeDomainData( this.wave );
			const energy = this.wave.reduce( ( sum, value ) => sum + value * value, 0 );
			this.publish( 'audio.rms', Math.sqrt( energy / this.wave.length ) );

		}
		const frameTime = this.still ? 0 : video.currentTime;
		if ( ! ( this.still ? video.naturalWidth || video.width : video.videoWidth ) || frameTime === this.#lastFrame ) return;
		this.#lastFrame = frameTime;
		const frame = this.transformed ? this.#process( video ) : video;
		this.publish( 'video.time', frameTime );
		this.publish( 'video.frame', frame );
		if ( ! this.tracker ) return;
		const result = this.tracker.detectForVideo( frame, now );
		const first = points => Array.isArray( points?.[ 0 ] ) ? points[ 0 ] : points;
		if ( this.mode === 'holistic' ) {

			this.landmarks( 'pose', first( result.poseLandmarks ), first( result.poseWorldLandmarks ) );
			this.landmarks( 'leftHand', first( result.leftHandLandmarks ), first( result.leftHandWorldLandmarks ) );
			this.landmarks( 'rightHand', first( result.rightHandLandmarks ), first( result.rightHandWorldLandmarks ) );
			this.landmarks( 'hand', first( result.rightHandLandmarks )?.length ? first( result.rightHandLandmarks ) : first( result.leftHandLandmarks ) );

		} else if ( this.mode !== 'face' ) {

			this.landmarks( this.mode, result.landmarks?.[ 0 ], result.worldLandmarks?.[ 0 ] );

		}
		if ( this.mode === 'face' || this.mode === 'holistic' ) {

			const face = first( result.faceLandmarks );
			this.landmarks( 'face', face );
			this.landmarks( 'iris.right', face?.slice( 468, 473 ) );
			this.landmarks( 'iris.left', face?.slice( 473, 478 ) );
			for ( const shape of result.faceBlendshapes?.[ 0 ]?.categories || [] ) this.publish( 'vision.face.blendshape.' + shape.categoryName, shape.score );

		}

	}

	landmarks( name, points, world ) {

		const prefix = 'vision.' + name + '.';
		if ( ! points?.length ) { this.clear( prefix ); return; }
		this.publish( prefix + 'landmarks', points );
		if ( world?.length ) this.publish( prefix + 'world', world );
		for ( const [ index, point ] of points.entries() ) {

			this.publish( prefix + index + '.x', point.x );
			this.publish( prefix + index + '.y', point.y );
			this.publish( prefix + index + '.z', point.z );

		}

	}

}

export { MediaStreams };
