import { hasRestriction } from '../ObjectRestrictions.js';
import { LOGIC_DOMAIN, planLogicGraph } from './LogicNodes.js';
import { validateSocketValue } from './NodeGraph.js';
import { VALUE_OPERATIONS } from './ValueNodes.js';

const then = [ 'then' ];
const empty = [];
const degrees = Math.PI / 180;
const MAX_EVENTS = 1024;
const MAX_ACTIONS = 4096;

function numeric( value, fallback ) {

	return Number.isFinite( value ) ? value : fallback;

}

export class LogicRuntime {

	constructor( THREE, scene, streams, onError = ( error, object ) => console.warn( 'Logic Nodes on ' + ( object.name || object.uuid ), error ) ) {

		this.scene = scene;
		this.streams = streams;
		this.onError = onError;
		this.instances = [];
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

			} catch ( error ) {

				onError( error, object );

			}

		} );

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
			case 'logic.eventValue': return { value: numeric( context.detail?.value ?? context.detail, inputs.fallback ) };
			case 'logic.topic': return { value: numeric( this.streams.get( inputs.topic ), inputs.fallback ) };
			case 'logic.variable': return { value: instance.variables.get( inputs.name ) ?? inputs.fallback };
			case 'logic.position': return this.target( instance, inputs.target )?.position ?? { x: 0, y: 0, z: 0 };
			case 'logic.compare': return { value: inputs.a > inputs.b };
			case 'logic.equal': return { value: inputs.a === inputs.b };
			case 'logic.not': return { value: ! inputs.value };
			case 'logic.and': return { value: inputs.a && inputs.b };
			case 'logic.or': return { value: inputs.a || inputs.b };
			default: throw new Error( 'This node does not produce a value.' );

		}

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
				instance.variables.set( inputs.name, inputs.value );
				break;
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
			case 'logic.rotate':
				this.rotation.setFromEuler( this.euler.set( x * degrees, y * degrees, z * degrees ) );
				if ( local ) object.quaternion.multiply( this.rotation );
				else object.quaternion.premultiply( this.rotation );
				break;
			case 'logic.setPosition': object.position.set( x, y, z ); break;
			case 'logic.setScale': object.scale.set( x, y, z ); break;
			case 'logic.setVisibility': object.visible = inputs.visible; break;
			case 'logic.toggleVisibility': object.visible = ! object.visible; break;
			default: throw new Error( 'Unsupported Logic Nodes action.' );

		}

	}

	fire( instance, node, port, context ) {

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

					const inputs = this.inputs( instance, node, context );
					const port = this.triggerPort( instance, node, kind, inputs, context );
					if ( port ) this.fire( instance, node, port, context );

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
			case 'pointerdown': return detail?.button === Math.round( inputs.button ) ? 'then' : undefined;
			case 'custom': return context.name === inputs.name.trim().replace( /^event\./, '' ) ? 'then' : undefined;
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
		this.remaining = MAX_ACTIONS;
		this.trigger( 'start' );

	}

	tick( time, delta ) {

		this.start();
		if ( ! this.instances.length ) return;
		this.frame ++;
		this.time = Math.max( this.time, numeric( time, this.time ) );
		this.delta = Math.max( 0, numeric( delta, 0 ) );
		this.remaining = MAX_ACTIONS;
		const ready = this.timers.filter( timer => timer.time <= this.time && timer.frame <= this.frame );
		this.timers = this.timers.filter( timer => timer.time > this.time || timer.frame > this.frame );
		for ( const { instance, node, context } of ready ) {

			if ( ! hasRestriction( instance.owner, 'disabled' ) ) this.fire( instance, node, 'then', context );

		}
		this.trigger( 'update' );
		this.trigger( 'held' );
		this.trigger( 'interval' );
		this.trigger( 'overlap' );
		for ( let i = 0; i < this.pending.length && i < MAX_EVENTS && this.remaining > 0; i ++ ) {

			const context = this.pending[ i ];
			if ( [ 'keydown', 'keyup', 'pointerdown' ].includes( context.name ) ) this.trigger( context.name, context );
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
		this.pending.length = this.timers.length = 0;
		this.releaseKeys();
		this.time = this.delta = this.frame = 0;
		this.budgetWarning = false;
		for ( const instance of this.instances ) {

			instance.state.clear();
			instance.variables.clear();

		}

	}

	releaseKeys() {

		this.held.clear();

	}

}
