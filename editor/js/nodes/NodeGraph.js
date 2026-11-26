const VERSION = 1;

export function createGraph( domain ) {

	return { version: VERSION, domain: domain.id, nodes: [], links: [] };

}

export function addNode( graph, type, x, y, domain ) {

	const ids = new Set( graph.nodes.map( node => node.id ) );
	let id = type;
	for ( let suffix = 2; ids.has( id ); suffix ++ ) id = type + '-' + suffix;
	const node = { id, type, x, y, values: {} };
	const body = domain?.nodes.get( type )?.bodyDomain?.();
	if ( body ) node.body = body.createStarter();
	graph.nodes.push( node );
	return node;

}

export function removeNode( graph, id ) {

	graph.nodes = graph.nodes.filter( node => node.id !== id );
	graph.links = graph.links.filter( link => link.from.node !== id && link.to.node !== id );

}

export function disconnectInput( graph, input ) {

	graph.links = graph.links.filter( ( { to } ) => to.node !== input.node || to.socket !== input.socket );

}

export function connectNodes( graph, domain, from, to ) {

	const draft = { ...graph };
	disconnectInput( draft, to );
	draft.links.push( { from: { ...from }, to: { ...to } } );
	const index = indexGraph( draft, domain );
	domain.validateLinks?.( index );
	graph.links = draft.links;

}

function getSocket( sockets, name ) {

	return sockets && Object.hasOwn( sockets, name ) ? sockets[ name ] : undefined;

}

function validateValue( value, socket ) {

	if ( socket.type === 'number' ) {

		if ( ! Number.isFinite( value ) ) throw new Error( socket.label + ' must be a finite number.' );
		if ( value < socket.min || value > socket.max ) {

			throw new Error( socket.label + ' must be between ' + socket.min + ' and ' + socket.max + '.' );

		}

	}

}

// The graph format describes sockets and edges. Each domain supplies its node
// definitions, and each runtime decides how to interpret a validated graph.
export function indexGraph( graph, domain ) {

	if ( graph?.version !== VERSION || graph.domain !== domain.id ||
		! Array.isArray( graph.nodes ) || ! Array.isArray( graph.links ) ) {

		throw new Error( 'Unsupported ' + domain.label + ' graph.' );

	}
	const nodes = new Map();
	const inputs = new Map();
	const consumers = new Map();
	for ( const node of graph.nodes ) {

		const def = domain.nodes.get( node?.type );
		if ( ! def || typeof node.id !== 'string' || ! node.id || nodes.has( node.id ) ||
			! Number.isFinite( node.x ) || ! Number.isFinite( node.y ) ||
			! node.values || typeof node.values !== 'object' || Array.isArray( node.values ) ) {

			throw new Error( 'Invalid node in ' + domain.label + ' graph.' );

		}
		for ( const [ name, value ] of Object.entries( node.values ) ) {

			const socket = getSocket( def.inputs, name );
			if ( ! socket || ! Object.hasOwn( socket, 'default' ) ) throw new Error( 'Invalid input value on ' + def.label + '.' );
			validateValue( value, socket );

		}
		nodes.set( node.id, node );
		inputs.set( node.id, new Map() );
		consumers.set( node.id, [] );

	}
	for ( const link of graph.links ) {

		const from = link?.from;
		const to = link?.to;
		const output = getSocket( domain.nodes.get( nodes.get( from?.node )?.type )?.outputs, from?.socket );
		const input = getSocket( domain.nodes.get( nodes.get( to?.node )?.type )?.inputs, to?.socket );
		if ( ! output || ! input ) throw new Error( 'A link references a missing socket.' );
		if ( output.type !== input.type ) throw new Error( 'Connect sockets of the same type.' );
		if ( inputs.get( to.node ).has( to.socket ) ) throw new Error( 'An input can have only one link.' );
		inputs.get( to.node ).set( to.socket, from );
		consumers.get( from.node ).push( to.node );

	}
	return { nodes, inputs, consumers };

}

export function dataflowOrder( { nodes, inputs, consumers } ) {

	const indegrees = new Map( [ ...inputs ].map( ( [ id, bindings ] ) => [ id, bindings.size ] ) );
	const order = [ ...nodes.keys() ].filter( id => indegrees.get( id ) === 0 );
	for ( let i = 0; i < order.length; i ++ ) {

		for ( const consumer of consumers.get( order[ i ] ) ) {

			const degree = indegrees.get( consumer ) - 1;
			indegrees.set( consumer, degree );
			if ( degree === 0 ) order.push( consumer );

		}

	}
	if ( order.length !== nodes.size ) throw new Error( 'This connection would create a cycle.' );
	return order;

}

export function planDataflow( graph, domain, target ) {

	const index = indexGraph( graph, domain );
	const { nodes, inputs } = index;
	if ( ! nodes.has( target ) ) throw new Error( 'The graph output node is missing.' );

	const required = new Set( [ target ] );
	for ( const id of required ) {

		for ( const from of inputs.get( id ).values() ) required.add( from.node );

	}
	const steps = [];
	for ( const id of dataflowOrder( index ) ) {

		if ( ! required.has( id ) ) continue;
		const node = nodes.get( id );
		const def = domain.nodes.get( node.type );
		const bindings = Object.entries( def.inputs || {} ).map( ( [ name, socket ] ) => ( {
			name, socket, from: inputs.get( id ).get( name ),
			value: Object.hasOwn( node.values, name ) ? node.values[ name ] : socket.default
		} ) );
		const missing = bindings.find( binding => ! binding.from && binding.value === undefined );
		if ( missing ) return { missing: 'Connect ' + missing.socket.label + ' on ' + def.label + '.' };
		steps.push( { node, bindings } );

	}
	return { steps };

}

// Evaluates each upstream node once. The target is a sink and receives the
// resolved input values so it can feed a mesh, material, or any other host.
export function evaluateDataflow( plan, runNode ) {

	if ( plan.missing ) return;
	const results = new Map();
	const target = plan.steps.at( -1 ).node;
	for ( const step of plan.steps ) {

		const { node, bindings } = step;
		const inputs = Object.fromEntries( bindings.map( ( { name, socket, from, value } ) => {

			if ( from ) {

				value = results.get( from.node )?.[ from.socket ];
				if ( value === undefined ) throw new Error( 'No value was produced for ' + socket.label + '.' );
				validateValue( value, socket );

			}
			return [ name, value ];

		} ) );
		if ( node === target ) return inputs;
		results.set( node.id, runNode( node, inputs, step ) );

	}

}
