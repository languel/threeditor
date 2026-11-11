// Device adapters publish samples and events. Drivers and event rules run once per frame on the current scene.
function hueToRgb( h ) {

	const t = ( ( h % 1 ) + 1 ) % 1 * 6;
	const i = Math.floor( t ), f = t - i, q = 1 - f;
	if ( i === 0 ) return [ 1, f, 0 ];
	if ( i === 1 ) return [ q, 1, 0 ];
	if ( i === 2 ) return [ 0, 1, f ];
	if ( i === 3 ) return [ 0, q, 1 ];
	if ( i === 4 ) return [ f, 0, 1 ];
	return [ 1, 0, q ];

}

function targetColor( object ) {

	if ( object.isLight ) return object.color;
	const mat = Array.isArray( object.material ) ? object.material[ 0 ] : object.material;
	return mat?.color || null;

}

function firstMaterial( object ) {

	return Array.isArray( object.material ) ? object.material[ 0 ] : object.material;

}

const objectChannels = {
	'position.x': ( object, value ) => { object.position.x = value; },
	'position.y': ( object, value ) => { object.position.y = value; },
	'position.z': ( object, value ) => { object.position.z = value; },
	'rotation.x': ( object, value ) => { object.rotation.x = value; },
	'rotation.y': ( object, value ) => { object.rotation.y = value; },
	'rotation.z': ( object, value ) => { object.rotation.z = value; },
	'scale': ( object, value ) => object.scale.setScalar( value ),
	'scale.x': ( object, value ) => { object.scale.x = value; },
	'scale.y': ( object, value ) => { object.scale.y = value; },
	'scale.z': ( object, value ) => { object.scale.z = value; },
	'visible': ( object, value ) => { object.visible = value >= .5; },
	'intensity': ( object, value ) => { if ( object.isLight ) object.intensity = value; },
	'color.r': ( object, value ) => { const c = targetColor( object ); if ( c ) c.r = Math.min( 1, Math.max( 0, value ) ); },
	'color.g': ( object, value ) => { const c = targetColor( object ); if ( c ) c.g = Math.min( 1, Math.max( 0, value ) ); },
	'color.b': ( object, value ) => { const c = targetColor( object ); if ( c ) c.b = Math.min( 1, Math.max( 0, value ) ); },
	'color.hue': ( object, value ) => { const c = targetColor( object ); if ( c ) c.setRGB( ...hueToRgb( value ) ); },
	'material.opacity': ( object, value ) => {
		const m = firstMaterial( object );
		if ( ! m ) return;
		m.opacity = Math.min( 1, Math.max( 0, value ) );
		if ( m.opacity < 1 && ! m.transparent ) { m.transparent = true; m.needsUpdate = true; }
	},
	'material.emissiveIntensity': ( object, value ) => { const m = firstMaterial( object ); if ( m && 'emissiveIntensity' in m ) m.emissiveIntensity = value; },
	'material.roughness': ( object, value ) => { const m = firstMaterial( object ); if ( m && 'roughness' in m ) m.roughness = Math.min( 1, Math.max( 0, value ) ); },
	'material.metalness': ( object, value ) => { const m = firstMaterial( object ); if ( m && 'metalness' in m ) m.metalness = Math.min( 1, Math.max( 0, value ) ); },
	'material.wireframe': ( object, value ) => { const m = firstMaterial( object ); if ( m && 'wireframe' in m ) m.wireframe = value >= .5; },
	'camera.fov': ( object, value ) => { if ( object.isPerspectiveCamera ) { object.fov = Math.min( 170, Math.max( 5, value ) ); object.updateProjectionMatrix(); } },
	'camera.zoom': ( object, value ) => { if ( object.isCamera ) { object.zoom = Math.max( 0.05, value ); object.updateProjectionMatrix(); } }
};

function readObjectChannel( object, property ) {

	switch ( property ) {

		case 'position.x': return object.position.x;
		case 'position.y': return object.position.y;
		case 'position.z': return object.position.z;
		case 'rotation.x': return object.rotation.x;
		case 'rotation.y': return object.rotation.y;
		case 'rotation.z': return object.rotation.z;
		case 'scale': return object.scale.x;
		case 'scale.x': return object.scale.x;
		case 'scale.y': return object.scale.y;
		case 'scale.z': return object.scale.z;
		case 'visible': return object.visible ? 1 : 0;
		case 'intensity': return object.isLight ? object.intensity : 0;
		case 'color.r': return targetColor( object )?.r ?? 0;
		case 'color.g': return targetColor( object )?.g ?? 0;
		case 'color.b': return targetColor( object )?.b ?? 0;
		case 'material.opacity': return firstMaterial( object )?.opacity ?? 1;
		case 'material.emissiveIntensity': return firstMaterial( object )?.emissiveIntensity ?? 0;
		case 'material.roughness': return firstMaterial( object )?.roughness ?? 0;
		case 'material.metalness': return firstMaterial( object )?.metalness ?? 0;
		case 'material.wireframe': return firstMaterial( object )?.wireframe ? 1 : 0;
		case 'camera.fov': return object.isPerspectiveCamera ? object.fov : 50;
		case 'camera.zoom': return object.isCamera ? object.zoom : 1;
		default: return 0;

	}

}

function isObjectEnabled( object ) {

	for ( let node = object; node; node = node.parent ) if ( node.userData.threeditor?.disabled === true ) return false;
	return true;

}

function shapeFraction( fraction, curve = 'linear' ) {

	if ( curve === 'linear' || ! curve ) return fraction;
	const t = Math.min( 1, Math.max( 0, fraction ) );
	if ( curve === 'smoothstep' ) return t * t * ( 3 - 2 * t );
	if ( curve === 'easeIn' ) return t * t;
	if ( curve === 'easeOut' ) return 1 - ( 1 - t ) * ( 1 - t );
	if ( curve === 'abs' ) return Math.abs( fraction );
	if ( curve === 'step' ) return fraction >= .5 ? 1 : 0;
	return fraction;

}

function mapValue( value, route ) {

	if ( ! Number.isFinite( value ) ) return undefined;
	const [ a, b ] = route.input || [ 0, 1 ];
	const [ c, d ] = route.output || [ 0, 1 ];
	if ( ! [ a, b, c, d ].every( Number.isFinite ) || a === b ) return undefined;
	let fraction = ( value - a ) / ( b - a );
	if ( route.clamp !== false ) fraction = Math.min( 1, Math.max( 0, fraction ) );
	fraction = shapeFraction( fraction, route.curve );
	const mapped = c + ( d - c ) * fraction;
	return Number.isFinite( mapped ) ? mapped : undefined;

}

function setMorphInfluence( object, morph, value ) {

	if ( ! object?.morphTargetInfluences ) return false;
	const idx = typeof morph === 'number' ? morph : ( object.morphTargetDictionary?.[ morph ] ?? Number( morph ) );
	if ( ! Number.isInteger( idx ) || idx < 0 || idx >= object.morphTargetInfluences.length ) return false;
	object.morphTargetInfluences[ idx ] = value;
	return true;

}

function applySceneChannel( scene, property, value ) {

	if ( property === 'fog.density' && scene.fog && 'density' in scene.fog ) { scene.fog.density = Math.max( 0, value ); return true; }
	if ( property === 'fog.near' && scene.fog && 'near' in scene.fog ) { scene.fog.near = value; return true; }
	if ( property === 'fog.far' && scene.fog && 'far' in scene.fog ) { scene.fog.far = value; return true; }
	if ( property === 'environmentIntensity' && 'environmentIntensity' in scene ) { scene.environmentIntensity = Math.max( 0, value ); return true; }
	if ( property === 'background.hue' && scene.background?.isColor ) { scene.background.setRGB( ...hueToRgb( value ) ); return true; }
	if ( property.startsWith( 'postprocessing.' ) ) {

		const cfg = scene.userData.postprocessing ||= {};
		const key = property.slice( 'postprocessing.'.length );
		if ( key === 'bloomStrength' || key === 'bloomRadius' || key === 'bloomThreshold' ) { cfg[ key ] = Math.max( 0, value ); return true; }
		if ( key === 'focus' ) { cfg.focus = Math.max( 0.1, value ); return true; }
		if ( key === 'aperture' ) { cfg.aperture = Math.max( 0, value ); return true; }

	}
	return false;

}

class StreamRouter extends EventTarget {

	#samples = new Map();
	#scenes = new WeakMap();
	#sequence = 0;
	#publishing = false;
	#pendingEvents = [];
	outputs = new Map();
	getParam = null;
	setParam = null;

	publish( topic, value, preview = typeof topic === 'string' && topic.startsWith( 'demo.' ), origin = topic ) {

		if ( typeof topic !== 'string' || ! topic || this.#publishing ) return;
		const sample = { topic, value, preview, origin, sequence: ++ this.#sequence, time: performance.now() };
		this.#samples.set( topic, sample );
		// One synchronous notification per sample. Routes never recursively dispatch.
		this.#publishing = true;
		try { this.dispatchEvent( new CustomEvent( 'sample', { detail: sample } ) ); }
		finally { this.#publishing = false; }

	}

	emit( name, detail = {}, preview = false ) {

		if ( typeof name !== 'string' || ! name ) return;
		const eventName = name.startsWith( 'event.' ) ? name.slice( 6 ) : name;
		const payload = { name: eventName, detail, preview, sequence: ++ this.#sequence, time: performance.now() };
		this.#pendingEvents.push( payload );
		if ( this.#pendingEvents.length > 64 ) this.#pendingEvents.shift();
		const numeric = typeof detail === 'number' ? detail : ( typeof detail?.value === 'number' ? detail.value : 1 );
		this.publish( 'event.' + eventName, numeric, preview, 'event.' + eventName );
		this.dispatchEvent( new CustomEvent( 'event', { detail: payload } ) );

	}

	on( name, handler ) {

		const target = name?.startsWith?.( 'event.' ) ? name.slice( 6 ) : name;
		const listener = event => {

			if ( target === '*' || event.detail.name === target ) handler( event.detail.detail, event.detail );

		};
		this.addEventListener( 'event', listener );
		return () => this.removeEventListener( 'event', listener );

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

	#applyAction( action, triggerValue, isPreview, scene ) {

		if ( ! action?.kind ) return false;
		const kind = action.kind;
		if ( kind === 'emit' ) {

			if ( action.name ) this.emit( action.name, { value: action.value ?? triggerValue }, isPreview );
			return false;

		}
		if ( kind === 'topic' ) {

			if ( typeof action.topic === 'string' && action.topic.startsWith( 'map.' ) ) {

				this.publish( action.topic, action.value ?? triggerValue, isPreview, action.topic );

			}
			return false;

		}
		if ( kind === 'toggleVisible' || kind === 'setProperty' || kind === 'addProperty' ) {

			const object = scene.getObjectByProperty( 'uuid', action.uuid );
			if ( ! object || ! isObjectEnabled( object ) ) return false;
			if ( kind === 'toggleVisible' ) { object.visible = ! object.visible; return true; }
			if ( ! Object.hasOwn( objectChannels, action.property ) ) return false;
			const next = kind === 'addProperty' ? readObjectChannel( object, action.property ) + Number( action.value ?? 0 ) : Number( action.value ?? 0 );
			if ( ! Number.isFinite( next ) ) return false;
			objectChannels[ action.property ]( object, next );
			return true;

		}
		if ( kind === 'setParam' ) {

			if ( ! this.setParam ) return false;
			let val = action.value;
			if ( action.toggle ) {

				const cur = this.getParam?.( action.uuid, Number( action.scriptIndex || 0 ), action.param );
				val = ! cur;

			}
			return !! this.setParam( action.uuid, Number( action.scriptIndex || 0 ), action.param, val );

		}
		const send = this.outputs.get( kind );
		if ( send && ! isPreview ) {

			try { send( action, Number( action.value ?? triggerValue ?? 0 ) ); }
			catch ( error ) { this.dispatchEvent( new CustomEvent( 'outputerror', { detail: error } ) ); }

		}
		return false;

	}

	tick( scene ) {

		let changed = false;
		const routes = scene.userData.streamRoutes;
		const events = scene.userData.streamEvents;
		if ( ! Array.isArray( routes ) && ! Array.isArray( events ) ) {

			this.#pendingEvents.length = 0;
			return false;

		}

		let cache = this.#scenes.get( scene );
		if ( ! cache || cache.routes !== routes || cache.events !== events ) {

			const ordered = Array.isArray( routes )
				? [ ...routes ].sort( ( a, b ) => Number( b?.target?.kind === 'topic' ) - Number( a?.target?.kind === 'topic' ) )
				: [];
			cache = {
				routes,
				events,
				ordered,
				applied: new Map(),
				sent: new Map(),
				smoothed: new Map(),
				eventState: new Map()
			};
			this.#scenes.set( scene, cache );

		}

		for ( const route of cache.ordered ) {

			if ( ! route || route.enabled === false || ! route.target || typeof route.source !== 'string' ) continue;
			const sample = this.#samples.get( route.source ) || this.#samples.get( route.fallback );
			if ( ! sample ) continue;
			const smooth = Math.min( 0.98, Math.max( 0, Number( route.smooth ) || 0 ) );
			const mapped = mapValue( sample.value, route );
			if ( mapped === undefined ) continue;
			let value = mapped;
			if ( smooth > 0 ) {

				const prev = cache.smoothed.get( route );
				value = prev === undefined ? mapped : prev + ( mapped - prev ) * ( 1 - smooth );
				cache.smoothed.set( route, value );
				if ( cache.applied.get( route ) === sample.sequence && Math.abs( mapped - value ) < 1e-4 ) continue;

			} else if ( cache.applied.get( route ) === sample.sequence ) {

				continue;

			}

			const { kind, uuid, property } = route.target;
			if ( kind === 'object' ) {

				const object = scene.getObjectByProperty( 'uuid', uuid );
				if ( ! object || ! Object.hasOwn( objectChannels, property ) || ! isObjectEnabled( object ) ) continue;
				objectChannels[ property ]( object, value );
				changed = true;

			} else if ( kind === 'morph' ) {

				const object = scene.getObjectByProperty( 'uuid', uuid );
				if ( ! object || ! isObjectEnabled( object ) ) continue;
				if ( setMorphInfluence( object, route.target.morph, value ) ) changed = true;

			} else if ( kind === 'param' ) {

				if ( this.setParam?.( uuid, Number( route.target.scriptIndex || 0 ), route.target.param, value ) ) changed = true;

			} else if ( kind === 'scene' ) {

				if ( applySceneChannel( scene, property, value ) ) changed = true;

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

		if ( Array.isArray( events ) && events.length ) {

			const now = performance.now();
			const runEventRules = ( onlyEventTriggers, pendingList ) => {

				for ( const rule of events ) {

					if ( ! rule || rule.enabled === false || ! rule.action || typeof rule.source !== 'string' ) continue;
					const isEventTrigger = rule.trigger === 'event';
					if ( isEventTrigger !== onlyEventTriggers ) continue;
					let state = cache.eventState.get( rule );
					if ( ! state ) { state = { lastSeq: 0, prevValue: undefined, hasPrev: false, lastFired: 0 }; cache.eventState.set( rule, state ); }

					if ( isEventTrigger ) {

						const targetName = rule.source.startsWith( 'event.' ) ? rule.source.slice( 6 ) : rule.source;
						for ( const ev of pendingList ) {

							if ( ev.name !== targetName ) continue;
							if ( rule.cooldown && now - state.lastFired < Number( rule.cooldown ) ) continue;
							state.lastFired = now;
							if ( this.#applyAction( rule.action, ev.detail?.value ?? 1, ev.preview, scene ) ) changed = true;

						}
						continue;

					}

					const sample = this.#samples.get( rule.source ) || ( rule.fallback ? this.#samples.get( rule.fallback ) : undefined );
					if ( ! sample || state.lastSeq === sample.sequence ) continue;
					state.lastSeq = sample.sequence;

					const val = sample.value;
					const prev = state.prevValue;
					const hasPrev = state.hasPrev;
					state.prevValue = val;
					state.hasPrev = true;

					let fired = false;
					const t = Number( rule.threshold ?? .5 );
					const hi = Number( rule.high ?? 1 );
					if ( rule.trigger === 'change' ) fired = hasPrev ? val !== prev : true;
					else if ( rule.trigger === 'rising' ) fired = Number.isFinite( val ) && val >= t && ( hasPrev ? Number( prev ) < t : true );
					else if ( rule.trigger === 'falling' ) fired = Number.isFinite( val ) && val < t && ( hasPrev ? Number( prev ) >= t : false );
					else if ( rule.trigger === 'enter' || rule.trigger === 'exit' ) {

						const lo = Math.min( t, hi ), top = Math.max( t, hi );
						const inside = Number.isFinite( val ) && val >= lo && val <= top;
						const wasInside = hasPrev && Number.isFinite( prev ) && prev >= lo && prev <= top;
						fired = rule.trigger === 'enter' ? ( inside && ! wasInside ) : ( ! inside && wasInside );

					} else if ( rule.trigger === 'match' ) {

						fired = String( val ) === String( rule.match ?? '' );

					}

					if ( ! fired ) continue;
					if ( rule.cooldown && now - state.lastFired < Number( rule.cooldown ) ) continue;
					state.lastFired = now;
					const isPreview = sample.preview || sample.topic === rule.fallback;
					if ( this.#applyAction( rule.action, val, isPreview, scene ) ) changed = true;

				}

			};
			// Run sample triggers first so any emitted events can drive downstream event rules in the same tick.
			runEventRules( false, [] );
			const pending = this.#pendingEvents.splice( 0 );
			if ( pending.length ) runEventRules( true, pending );

		} else {

			this.#pendingEvents.length = 0;

		}

		return changed;

	}

}

export { StreamRouter, mapValue, objectChannels };
