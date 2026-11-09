// Load Tasks Vision only when tracking is requested. Keep model/WASM URLs pinned.
const tasks = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0';
const models = 'https://storage.googleapis.com/mediapipe-models/';
const trackers = {
	pose: [ 'PoseLandmarker', 'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' ],
	hand: [ 'HandLandmarker', 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' ],
	face: [ 'FaceLandmarker', 'face_landmarker/face_landmarker/float16/1/face_landmarker.task' ]
};

class MediaStreams {

	constructor( bus ) { this.bus = bus; }
	#epoch = 0;
	#trackerEpoch = 0;
	#lastFrame = - 1;
	#lastSample = 0;

	async start( element, { file, camera, microphone } ) {

		this.stop();
		this.element = element;
		const epoch = this.#epoch;
		if ( file ) {

			this.url = URL.createObjectURL( file );
			element.src = this.url;

		} else {

			const stream = await navigator.mediaDevices.getUserMedia( { video: !! camera, audio: !! microphone } );
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
		this.mode = mode;
		this.#lastFrame = - 1;
		this.bus.clear( 'vision.' );
		if ( ! mode ) return;
		const vision = await import( tasks + '/vision_bundle.mjs' );
		const resolver = await vision.FilesetResolver.forVisionTasks( tasks + '/wasm' );
		const [ type, model ] = trackers[ mode ];
		const tracker = await vision[ type ].createFromOptions( resolver, {
			baseOptions: { modelAssetPath: models + model }, runningMode: 'VIDEO'
		} );
		if ( epoch !== this.#trackerEpoch ) { tracker.close(); return; }
		this.tracker = tracker;

	}

	stop() {

		this.#epoch ++;
		this.stream?.getTracks().forEach( track => track.stop() );
		if ( this.element ) {

			this.element.pause();
			this.element.srcObject = null;
			this.element.removeAttribute( 'src' );
			this.element.load();

		}
		if ( this.url ) URL.revokeObjectURL( this.url );
		if ( this.context ) void this.context.close().catch( () => {} );
		this.element = this.url = this.stream = this.context = this.analyser = this.wave = null;
		this.#lastFrame = - 1;
		for ( const prefix of [ 'audio.', 'video.', 'vision.' ] ) this.bus.clear( prefix );

	}

	tick( now ) {

		if ( now - this.#lastSample < 50 ) return;
		this.#lastSample = now;
		const video = this.element;
		if ( ! video || video.readyState < 2 ) return;
		if ( this.analyser ) {

			this.analyser.getFloatTimeDomainData( this.wave );
			const energy = this.wave.reduce( ( sum, value ) => sum + value * value, 0 );
			this.bus.publish( 'audio.rms', Math.sqrt( energy / this.wave.length ) );

		}
		if ( ! video.videoWidth || video.currentTime === this.#lastFrame ) return;
		this.#lastFrame = video.currentTime;
		this.bus.publish( 'video.time', video.currentTime );
		this.bus.publish( 'video.frame', video );
		if ( ! this.tracker ) return;
		const result = this.tracker.detectForVideo( video, now );
		const landmarks = result.landmarks?.[ 0 ];
		const prefix = 'vision.' + this.mode + '.';
		if ( ! landmarks ) { this.bus.clear( prefix ); return; }
		this.bus.publish( prefix + 'landmarks', landmarks );
		if ( result.worldLandmarks?.[ 0 ] ) this.bus.publish( prefix + 'world', result.worldLandmarks[ 0 ] );
		for ( const [ index, point ] of landmarks.entries() ) {

			this.bus.publish( prefix + index + '.x', point.x );
			this.bus.publish( prefix + index + '.y', point.y );
			this.bus.publish( prefix + index + '.z', point.z );

		}

	}

}

export { MediaStreams };
