// Device adapters publish samples. Routes run once per frame on the current scene.
const objectChannels = {
	'position.x': ( object, value ) => { object.position.x = value; },
	'position.y': ( object, value ) => { object.position.y = value; },
	'position.z': ( object, value ) => { object.position.z = value; },
	'rotation.x': ( object, value ) => { object.rotation.x = value; },
	'rotation.y': ( object, value ) => { object.rotation.y = value; },
	'rotation.z': ( object, value ) => { object.rotation.z = value; },
	'scale': ( object, value ) => object.scale.setScalar( value ),
	'visible': ( object, value ) => { object.visible = value >= .5; },
	'intensity': ( object, value ) => { if ( object.isLight ) object.intensity = value; }
};

function mapValue( value, route ) {

	if ( ! Number.isFinite( value ) ) return undefined;
	const [ a, b ] = route.input || [ 0, 1 ];
	const [ c, d ] = route.output || [ 0, 1 ];
	if ( ! [ a, b, c, d ].every( Number.isFinite ) || a === b ) return undefined;
	let fraction = ( value - a ) / ( b - a );
	if ( route.clamp !== false ) fraction = Math.min( 1, Math.max( 0, fraction ) );
	const mapped = c + ( d - c ) * fraction;
	return Number.isFinite( mapped ) ? mapped : undefined;

}

class StreamRouter extends EventTarget {

	#samples = new Map();
	#scenes = new WeakMap();
	#sequence = 0;
	#publishing = false;
	outputs = new Map();

	publish( topic, value, preview = typeof topic === 'string' && topic.startsWith( 'demo.' ), origin = topic ) {

		if ( typeof topic !== 'string' || ! topic || this.#publishing ) return;
		const sample = { topic, value, preview, origin, sequence: ++ this.#sequence, time: performance.now() };
		this.#samples.set( topic, sample );
		// One synchronous notification per sample. Routes never recursively dispatch.
		this.#publishing = true;
		try { this.dispatchEvent( new CustomEvent( 'sample', { detail: sample } ) ); }
		finally { this.#publishing = false; }

	}

	get( topic ) { return this.#samples.get( topic )?.value; }
	topics() { return [ ...this.#samples.keys() ].sort(); }

	subscribe( topic, handler ) {

		const listener = event => { if ( event.detail.topic === topic ) handler( event.detail.value, event.detail ); };
		this.addEventListener( 'sample', listener );
		return () => this.removeEventListener( 'sample', listener );

	}

	clear( prefix ) {

		for ( const [ topic, sample ] of this.#samples ) if ( topic.startsWith( prefix ) || sample.origin.startsWith( prefix ) ) this.#samples.delete( topic );

	}

	tick( scene ) {

		const routes = scene.userData.streamRoutes;
		if ( ! Array.isArray( routes ) ) return false;
		let cache = this.#scenes.get( scene );
		if ( cache?.routes !== routes ) {

			const ordered = [ ...routes ].sort( ( a, b ) => Number( b?.target?.kind === 'topic' ) - Number( a?.target?.kind === 'topic' ) );
			cache = { routes, ordered, applied: new Map(), sent: new Map() };
			this.#scenes.set( scene, cache );

		}
		let changed = false;
		for ( const route of cache.ordered ) {

			if ( ! route || route.enabled === false || ! route.target || typeof route.source !== 'string' ) continue;
			const sample = this.#samples.get( route.source ) || this.#samples.get( route.fallback );
			if ( ! sample || cache.applied.get( route ) === sample.sequence ) continue;
			const value = mapValue( sample.value, route );
			if ( value === undefined ) continue;
			const { kind, uuid, property } = route.target;
			if ( kind === 'object' ) {

				const object = scene.getObjectByProperty( 'uuid', uuid );
				if ( ! object || ! Object.hasOwn( objectChannels, property ) ) continue;
				let disabled = false;
				for ( let node = object; node; node = node.parent ) disabled ||= node.userData.threeditor?.disabled === true;
				if ( disabled ) continue;
				objectChannels[ property ]( object, value );
				changed = true;

			} else if ( kind === 'topic' ) {

				if ( typeof route.target.topic !== 'string' || ! route.target.topic.startsWith( 'map.' ) ||
					route.source.startsWith( 'map.' ) || route.fallback?.startsWith( 'map.' ) ) continue;
				this.publish( route.target.topic, value, sample.preview || sample.topic === route.fallback, sample.origin );

			} else {

				const send = this.outputs.get( kind );
				if ( ! send ) continue;
				// Preview fallback samples never drive physical output.
				if ( sample.preview || sample.topic === route.fallback || cache.sent.get( route ) === value ) continue;
				try { if ( send( route.target, value ) !== false ) cache.sent.set( route, value ); }
				catch ( error ) { this.dispatchEvent( new CustomEvent( 'outputerror', { detail: error } ) ); }

			}
			cache.applied.set( route, sample.sequence );

		}
		return changed;

	}

}

export { StreamRouter, mapValue, objectChannels };
