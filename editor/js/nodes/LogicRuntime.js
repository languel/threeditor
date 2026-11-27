import { hasRestriction } from '../ObjectRestrictions.js';
import { LogicInput } from './LogicInput.js';
import { LOGIC_DOMAIN, planLogicGraph } from './LogicNodes.js';
import { validateSocketValue } from './NodeGraph.js';
import { VALUE_OPERATIONS } from './ValueNodes.js';

const then = [ 'then' ];
const empty = [];
const degrees = Math.PI / 180;
const MAX_EVENTS = 1024;
const MAX_ACTIONS = 4096;
const inputEvents = new Set( [ 'keydown', 'keyup', 'pointerdown', 'pointerup' ] );

function numeric( value, fallback ) {

	return Number.isFinite( value ) ? value : fallback;

}

const toText = ( value, fallback ) => typeof value === 'string' ? value.slice( 0, 128 ) : fallback;

export class LogicRuntime {

	constructor( THREE, scene, streams, onError = ( error, object ) => console.warn( 'Logic Nodes on ' + ( object.name || object.uuid ), error ) ) {

		this.scene = scene;
		this.streams = streams;
		this.onError = onError;
		this.instances = [];
		this.input = new LogicInput( THREE, scene );
		this.devices = new Set();
		this.pending = [];
		this.timers = [];
		this.held = new Set();
		this.time = this.delta = this.frame = 0;
		this.bounds = [ new THREE.Box3(), new THREE.Box3() ];
		this.motion = new THREE.Vector3();
		this.rotation = new THREE.Quaternion();
		this.euler = new THREE.Euler();
		scene.traverse( object => {

			if ( ! object.userData?.logicGraph ) return;
			try {

				const plan = planLogicGraph( object.userData.logicGraph );
				this.instances.push( { ...plan, owner: object, state: new Map(), variables: new Map() } );
				for ( const node of plan.nodes.values() ) {

					const device = LOGIC_DOMAIN.nodes.get( node.type ).device;
					if ( device ) this.devices.add( device );

				}

			} catch ( error ) {

				onError( error, object );

			}

		} );

	}

	get usesPointer() { return this.devices.has( 'pointer' ) || this.devices.has( 'pointer-ray' ); }
	get usesGamepads() { return this.devices.has( 'gamepad' ); }

	pointerDetail( button, position, camera ) {

		const detail = { button };
		if ( position ) detail.position = position;
		if ( this.devices.has( 'pointer-ray' ) ) detail.hit = this.input.pointerHit( position, camera );
		return detail;

	}

	target( instance, uuid ) {

		const object = uuid ? this.scene.getObjectByProperty( 'uuid', uuid ) : instance.owner;
		return object && ! hasRestriction( object, 'disabled' ) ? object : undefined;

	}

	inputs( instance, node, context, cache = new Map() ) {

		const definition = LOGIC_DOMAIN.nodes.get( node.type );
		const links = instance.inputs.get( node.id );
		return Object.fromEntries( Object.entries( definition.inputs || {} ).filter( ( [ , spec ] ) => spec.type !== 'event' ).map( ( [ name, spec ] ) => {

			const from = links.get( name );
			let value = node.values[ name ] ?? spec.default;
			if ( from ) {

				const source = instance.nodes.get( from.node );
				if ( ! cache.has( source.id ) ) {

					const inputs = this.inputs( instance, source, context, cache );
					cache.set( source.id, this.value( instance, source.type, inputs, context ) );

				}
				value = cache.get( source.id )[ from.socket ];
				validateSocketValue( value, spec );

			}
			return [ name, value ];

		} ) );

	}

	value( instance, type, inputs, context ) {

		if ( VALUE_OPERATIONS.has( type ) ) return VALUE_OPERATIONS.get( type )( inputs );
		switch ( type ) {

			case 'logic.clock': return { elapsed: this.time, delta: this.delta };
			case 'logic.object': return { object: inputs.object };
			case 'logic.boolean': return { value: inputs.value };
			case 'logic.string': return { value: inputs.value };
			case 'logic.eventValue': return { value: numeric( context.detail?.value ?? context.detail, inputs.fallback ) };
			case 'logic.eventText': return { value: toText( context.detail?.value ?? context.detail, inputs.fallback ) };
			case 'logic.keyboardState': return { pressed: this.held.has( inputs.key ) };
			case 'logic.pointerPosition': {

				const position = context.pointerEvent ? context.detail?.position : this.input.pointer;
				return { x: position?.x ?? 0, y: position?.y ?? 0, inside: !! position };

			}
			case 'logic.pointerRay': return context.pointerHit ?? this.input.hoverHit();
			case 'logic.raycast': return this.input.raycast( inputs,
				inputs.scope ? this.target( instance, inputs.scope ) : this.scene,
				inputs.ignore ? this.target( instance, inputs.ignore ) : undefined );
			case 'logic.gamepadButtonValue': return this.input.button( inputs.gamepad, inputs.button );
			case 'logic.gamepadActive': return { active: !! this.input.pad( inputs.gamepad ) };
			case 'logic.gamepadAxis': return { value: this.input.axis( inputs.gamepad, inputs.axis ) };
			case 'logic.gamepadStick': return this.input.stick( inputs );
			case 'logic.topic': return { value: numeric( this.streamValue( inputs.topic, context ), inputs.fallback ) };
			case 'logic.streamText': return { value: toText( this.streamValue( inputs.topic, context ), inputs.fallback ) };
			case 'logic.serialValue': return { value: numeric( this.streamValue( 'serial.' + inputs.key.trim(), context ), inputs.fallback ) };
			case 'logic.midiCC': {

				const value = numeric( this.streamValue( 'midi.cc.' + Math.round( inputs.channel ) + '.' + Math.round( inputs.controller ), context ), 0 );
				return { value, normalized: value / 127 };

			}
			case 'logic.midiNote': {

				const value = numeric( this.streamValue( 'midi.note.' + Math.round( inputs.channel ) + '.' + Math.round( inputs.note ), context ), 0 );
				return { value, pressed: value > 0 };

			}
			case 'logic.midiBend': return { value: numeric( this.streamValue( 'midi.bend.' + Math.round( inputs.channel ), context ), 0 ) };
			case 'logic.landmark': {

				const source = inputs.source.trim();
				const prefix = ( source ? 'input.' + source + '.' : '' ) + 'vision.' + inputs.group + '.' + Math.round( inputs.index ) + '.';
				const coords = [ 'x', 'y', 'z' ].map( axis => this.streamValue( prefix + axis, context ) );
				const vector = coords.map( value => numeric( value, 0 ) );
				return { x: vector[ 0 ], y: vector[ 1 ], z: vector[ 2 ], vector, available: coords.every( Number.isFinite ) };

			}
			case 'logic.variable': {

				const stored = instance.variables.get( inputs.name );
				if ( stored?.preview ) context.preview = true;
				return { value: stored?.value ?? inputs.fallback };

			}
			case 'logic.position': return this.target( instance, inputs.target )?.position ?? { x: 0, y: 0, z: 0 };
			case 'logic.compare': return { value: inputs.a > inputs.b };
			case 'logic.equal': return { value: inputs.a === inputs.b };
			case 'logic.not': return { value: ! inputs.value };
			case 'logic.and': return { value: inputs.a && inputs.b };
			case 'logic.or': return { value: inputs.a || inputs.b };
			default: throw new Error( 'This node does not produce a value.' );

		}

	}

	streamValue( topic, context ) {

		const sample = this.streams.getSample( topic.trim() );
		if ( sample?.preview ) context.preview = true;
		return sample?.value;

	}

	action( instance, node, context ) {

		const inputs = this.inputs( instance, node, context );
		switch ( node.type ) {

			case 'logic.branch': return [ inputs.condition ? 'yes' : 'no' ];
			case 'logic.sequence': return [ 'first', 'second' ];
			case 'logic.once':
				if ( instance.state.has( node.id ) ) return empty;
				instance.state.set( node.id, true );
				break;
			case 'logic.delay':
				if ( this.timers.length >= MAX_EVENTS ) throw new Error( 'Too many pending Delay events.' );
				this.timers.push( { instance, node, context, time: this.time + inputs.seconds, frame: this.frame + 1 } );
				return empty;
			case 'logic.send':
				if ( inputs.name.trim() ) this.streams.emit( inputs.name.trim(), { value: inputs.value, object: instance.owner.uuid }, context.preview );
				break;
			case 'logic.setVariable':
				instance.variables.set( inputs.name, { value: inputs.value, preview: context.preview } );
				break;
			case 'logic.publishStream': {

				const topic = inputs.topic.trim();
				if ( /^map\.[\w.-]+$/.test( topic ) ) this.streams.publish( topic, inputs.value, context.preview, context.sample?.origin || topic );
				break;

			}
			case 'logic.sendSerial':
				if ( /^[\w]*$/.test( inputs.key ) ) this.streams.sendOutput( 'serial', { key: inputs.key }, inputs.value, context.preview );
				break;
			case 'logic.sendCC':
				this.streams.sendOutput( 'midi.cc', { channel: Math.round( inputs.channel ), controller: Math.round( inputs.controller ) }, inputs.value, context.preview );
				break;
			case 'logic.sendNote':
				this.streams.sendOutput( 'midi.note', { channel: Math.round( inputs.channel ), note: Math.round( inputs.note ) }, inputs.value, context.preview );
				break;
			case 'logic.gamepadVibrate': if ( ! context.preview ) this.input.vibrate( inputs ); break;
			case 'logic.merge': break;
			default: this.objectAction( instance, node, inputs );

		}
		return then;

	}

	objectAction( instance, node, inputs ) {

		const object = this.target( instance, inputs.target );
		if ( ! object ) return;
		const { x, y, z, local } = inputs;
		switch ( node.type ) {

			case 'logic.move':
				this.motion.set( x, y, z );
				if ( local ) this.motion.applyQuaternion( object.quaternion );
				object.position.add( this.motion );
				break;
			case 'logic.moveVector':
				if ( ! inputs.vector ) return;
				this.motion.fromArray( inputs.vector ).multiplyScalar( inputs.scale );
				if ( local ) this.motion.applyQuaternion( object.quaternion );
				object.position.add( this.motion );
				break;
			case 'logic.rotate':
				this.rotation.setFromEuler( this.euler.set( x * degrees, y * degrees, z * degrees ) );
				if ( local ) object.quaternion.multiply( this.rotation );
				else object.quaternion.premultiply( this.rotation );
				break;
			case 'logic.setPosition': object.position.set( x, y, z ); break;
			case 'logic.setPositionVector':
				object.position.fromArray( inputs.vector );
				if ( inputs.world ) object.parent?.worldToLocal( object.position );
				break;
			case 'logic.setScale': object.scale.set( x, y, z ); break;
			case 'logic.setVisibility': object.visible = inputs.visible; break;
			case 'logic.toggleVisibility': object.visible = ! object.visible; break;
			case 'logic.setColor': {

				const material = Array.isArray( object.material ) ? object.material[ Math.round( inputs.slot ) ] : object.material;
				material?.color?.set( inputs.color );
				break;

			}
			case 'logic.lightIntensity': if ( object.isLight ) object.intensity = inputs.value; break;
			case 'logic.setParameter': this.streams.setParam?.( object.uuid, Math.round( inputs.index ), inputs.name, inputs.value ); break;
			default: throw new Error( 'Unsupported Logic Nodes action.' );

		}

	}

	fire( instance, node, port, context ) {

		context = { ...context };
		const stack = [];
		const push = ( source, output ) => {

			const next = instance.outgoing.get( source.id ).get( output ) || empty;
			for ( let i = next.length - 1; i >= 0; i -- ) stack.push( next[ i ] );

		};
		push( node, port );
		while ( stack.length && this.remaining > 0 ) {

			const next = stack.pop();
			this.remaining --;
			try {

				const outputs = this.action( instance, next, context );
				for ( let i = outputs.length - 1; i >= 0; i -- ) push( next, outputs[ i ] );

			} catch ( error ) {

				this.report( instance, next, error );

			}

		}

	}

	report( instance, node, error ) {

		const errors = instance.errors ||= new Set();
		const key = node.id + '/' + error.message;
		if ( errors.has( key ) ) return;
		errors.add( key );
		this.onError( error, instance.owner );

	}

	trigger( kind, context = {} ) {

		for ( const instance of this.instances ) {

			if ( hasRestriction( instance.owner, 'disabled' ) ) continue;
			for ( const node of instance.triggers.get( kind ) || empty ) {

				if ( this.remaining <= 0 ) return;
				try {

					const visit = { ...context };
					const inputs = this.inputs( instance, node, visit );
					const port = this.triggerPort( instance, node, kind, inputs, visit );
					if ( Array.isArray( port ) ) for ( const output of port ) this.fire( instance, node, output, visit );
					else if ( port ) this.fire( instance, node, port, visit );

				} catch ( error ) {

					this.report( instance, node, error );

				}

			}

		}

	}

	triggerPort( instance, node, kind, inputs, context ) {

		const { detail } = context;
		switch ( kind ) {

			case 'keydown': return ( inputs.repeat || ! detail?.repeat ) && detail?.code === inputs.key ? 'then' : undefined;
			case 'keyup': return detail?.code === inputs.key ? 'then' : undefined;
			case 'held': return this.held.has( inputs.key ) ? 'then' : undefined;
			case 'pointerup':
			case 'pointerdown': {

				if ( detail?.button !== Math.round( inputs.button ) ) return;
				if ( node.type !== 'logic.objectPress' ) return 'then';
				if ( context.pointerHit?.parents?.includes( this.target( instance, inputs.target )?.uuid ) ) return 'then';
				return;

			}
			case 'hover': {

				const hit = this.input.hoverHit();
				const over = hit.parents?.includes( this.target( instance, inputs.target )?.uuid ) === true;
				const previous = instance.state.get( node.id ) === true;
				instance.state.set( node.id, over );
				context.pointerHit = hit;
				if ( over ) return previous ? 'over' : [ 'enter', 'over' ];
				if ( previous ) return 'exit';
				return;

			}
			case 'gamepadconnection': return this.input.connection( inputs.gamepad );
			case 'gamepadbutton': {

				if ( ! this.input.button( inputs.gamepad, inputs.button, inputs.mode ) ) return;
				context.detail = { value: this.input.button( inputs.gamepad, inputs.button ).strength };
				return 'then';

			}
			case 'custom': return context.name === inputs.name.trim().replace( /^event\./, '' ) ? 'then' : undefined;
			case 'sample': {

				if ( context.sample.topic !== inputs.topic.trim() ) return;
				const value = context.sample.value;
				if ( node.type === 'logic.streamSample' ) return 'then';
				const before = instance.state.get( node.id );
				if ( node.type === 'logic.streamChange' ) {

					instance.state.set( node.id, value );
					return ! Object.is( before, value ) ? 'then' : undefined;

				}
				if ( ! Number.isFinite( value ) ) return;
				const above = value >= inputs.threshold;
				instance.state.set( node.id, above );
				if ( above && ! before ) return 'above';
				if ( ! above && before === true ) return 'below';
				return;

			}
			case 'interval': {

				const last = instance.state.get( node.id ) || 0;
				if ( this.time + 1e-7 < last + inputs.seconds ) return;
				instance.state.set( node.id, last + Math.floor( ( this.time - last + 1e-7 ) / inputs.seconds ) * inputs.seconds );
				return 'then';

			}
			case 'overlap': {

				const target = inputs.target ? this.target( instance, inputs.target ) : undefined;
				const [ first, second ] = this.bounds;
				const overlaps = !! target && target !== instance.owner &&
					first.setFromObject( instance.owner ).intersectsBox( second.setFromObject( target ) );
				const wasInside = instance.state.get( node.id ) || false;
				instance.state.set( node.id, overlaps );
				return overlaps === wasInside ? undefined : overlaps ? 'enter' : 'exit';

			}
			default: return 'then';

		}

	}

	start() {

		if ( this.running ) return;
		this.running = true;
		if ( ! this.instances.length ) return;
		this.unsubscribe = this.streams.on( '*', ( detail, event ) => {

			if ( event.name === 'keydown' && detail?.code ) this.held.add( detail.code );
			else if ( event.name === 'keyup' && detail?.code ) this.held.delete( detail.code );
			if ( this.pending.length < MAX_EVENTS ) this.pending.push( event );

		} );
		const topics = new Set();
		for ( const instance of this.instances ) for ( const node of instance.triggers.get( 'sample' ) || empty ) {

			try {

				const topic = this.inputs( instance, node, {} ).topic.trim();
				if ( topic ) topics.add( topic );

			} catch ( error ) { this.report( instance, node, error ); }

		}
		this.sampleSubscriptions = [ ...topics ].map( topic => this.streams.subscribe( topic, ( value, sample ) => {

			if ( this.pending.length < MAX_EVENTS ) this.pending.push( { sample, detail: { value }, preview: sample.preview } );

		} ) );
		this.remaining = MAX_ACTIONS;
		this.trigger( 'start' );

	}

	tick( time, delta, input ) {

		this.start();
		if ( ! this.instances.length ) return;
		this.frame ++;
		this.time = Math.max( this.time, numeric( time, this.time ) );
		this.delta = Math.max( 0, numeric( delta, 0 ) );
		this.remaining = MAX_ACTIONS;
		this.input.update( input );
		const ready = this.timers.filter( timer => timer.time <= this.time && timer.frame <= this.frame );
		this.timers = this.timers.filter( timer => timer.time > this.time || timer.frame > this.frame );
		for ( const { instance, node, context } of ready ) {

			if ( ! hasRestriction( instance.owner, 'disabled' ) ) this.fire( instance, node, 'then', context );

		}
		if ( this.usesGamepads ) {

			this.trigger( 'gamepadconnection' );
			this.trigger( 'gamepadbutton' );

		}
		this.trigger( 'update' );
		this.trigger( 'held' );
		this.trigger( 'interval' );
		this.trigger( 'overlap' );
		if ( this.devices.has( 'pointer-ray' ) ) this.trigger( 'hover' );
		for ( let i = 0; i < this.pending.length && i < MAX_EVENTS && this.remaining > 0; i ++ ) {

			let context = this.pending[ i ];
			if ( context.sample ) { this.trigger( 'sample', context ); continue; }
			if ( context.name === 'pointerdown' || context.name === 'pointerup' ) {

				context = { ...context, pointerEvent: true };
				if ( this.devices.has( 'pointer-ray' ) ) context.pointerHit = context.detail?.hit ?? this.input.pointerHit( context.detail?.position );

			}
			if ( inputEvents.has( context.name ) ) this.trigger( context.name, context );
			this.trigger( 'custom', context );

		}
		this.pending.length = 0;
		if ( this.remaining === 0 && ! this.budgetWarning ) {

			this.budgetWarning = true;
			this.onError( new Error( 'Logic Nodes exceeded its action limit in one frame.' ), this.scene );

		}

	}

	stop() {

		this.running = false;
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		for ( const unsubscribe of this.sampleSubscriptions || empty ) unsubscribe();
		this.sampleSubscriptions = [];
		this.pending.length = this.timers.length = 0;
		this.releaseInput();
		this.time = this.delta = this.frame = 0;
		this.budgetWarning = false;
		for ( const instance of this.instances ) {

			instance.state.clear();
			instance.variables.clear();

		}

	}

	releaseInput() {

		this.held.clear();
		this.input.reset();

	}

}
