import { activeGraph, addNode, createGraph, indexGraph, validateSocketValue } from './NodeGraph.js';

const groupInput = 'group.input';
const groupOutput = 'group.output';
const bodyId = domain => domain.id.split( '.' )[ 0 ] + '.group';
const endpoint = ( node, socket ) => ( { node, socket } );
const endpointKey = ( { node, socket } ) => JSON.stringify( [ node, socket ] );
const types = new Set( [ 'number', 'field', 'color', 'string', 'object', 'boolean', 'event', 'geometry', 'curve', 'points', 'instances', 'vec2', 'vec3' ] );
const newGroupId = () => 'group:' + ( globalThis.crypto?.randomUUID?.() ?? Math.random().toString( 36 ).slice( 2 ) );

export function nodeGroupsDomain( base, groups, group ) {

	if ( ! groups?.length && ! group ) return base;
	const nodes = new Map( [ ...base.nodes ].filter( ( [ , spec ] ) => ! group || ! spec.fixed ) );
	for ( const entry of groups || [] ) nodes.set( entry.id, {
		label: entry.name, category: 'Groups', inputs: entry.inputs, outputs: entry.outputs, group: entry
	} );
	if ( group ) {

		nodes.set( groupInput, { label: 'Group Input', fixed: true, groupInterface: 'inputs', outputs: group.inputs } );
		nodes.set( groupOutput, { label: 'Group Output', fixed: true, groupInterface: 'outputs', inputs: group.outputs } );

	}
	// The root commit validates expanded wiring, including Delay feedback in Logic Nodes.
	return { ...base, id: group ? bodyId( base ) : base.id, label: group?.name ?? base.label, nodes, validateLinks: undefined };

}

function interfaceSocket( spec, value ) {

	const copy = {};
	for ( const name of [ 'label', 'type', 'default', 'min', 'max', 'maxLength', 'options', 'optional', 'browseTopic', 'emptyLabel', 'allowSelf' ] ) {

		if ( Object.hasOwn( spec, name ) ) copy[ name ] = structuredClone( spec[ name ] );

	}
	if ( value !== undefined ) copy.default = structuredClone( value );
	return copy;

}

function addInterfaceSocket( group, direction, spec, value ) {

	const entries = group[ direction ];
	const prefix = direction === 'inputs' ? 'in' : 'out';
	let index = 1;
	while ( Object.hasOwn( entries, prefix + index ) ) index ++;
	const key = prefix + index;
	entries[ key ] = interfaceSocket( spec, value );
	return key;

}

export function groupNodes( root, graph, domain, ids ) {

	const selected = graph.nodes.filter( node => ids.has( node.id ) && ! domain.nodes.get( node.type ).fixed );
	if ( ! selected.length ) return;
	const picked = new Map( selected.map( node => [ node.id, node ] ) );
	const x = selected.reduce( ( sum, node ) => sum + node.x, 0 ) / selected.length;
	const y = selected.reduce( ( sum, node ) => sum + node.y, 0 ) / selected.length;
	const min = Math.min( ...selected.map( node => node.x ) );
	const max = Math.max( ...selected.map( node => node.x ) );
	const top = Math.min( ...selected.map( node => node.y ) );
	const groups = root.groups ||= [];
	let number = 1;
	while ( groups.some( entry => entry.name === 'Group ' + number ) ) number ++;
	const id = newGroupId();
	const body = createGraph( { id: bodyId( domain ) } );
	const group = { id, name: 'Group ' + number, inputs: {}, outputs: {}, body };
	groups.push( group );
	const instance = addNode( graph, id, x, y );
	body.nodes = [ ...selected,
		{ id: groupInput, type: groupInput, x: min - 246, y: top, values: {} },
		{ id: groupOutput, type: groupOutput, x: max + 246, y: top, values: {} }
	];
	const outputs = new Map();
	const links = [];
	for ( const link of graph.links ) {

		const from = picked.get( link.from.node );
		const to = picked.get( link.to.node );
		if ( from && to ) body.links.push( link );
		else if ( to ) {

			const socket = addInterfaceSocket( group, 'inputs', domain.nodes.get( to.type ).inputs[ link.to.socket ], to.values[ link.to.socket ] );
			body.links.push( { from: endpoint( groupInput, socket ), to: link.to } );
			links.push( { ...link, to: endpoint( instance.id, socket ) } );

		} else if ( from ) {

			const spec = domain.nodes.get( from.type ).outputs[ link.from.socket ];
			const key = endpointKey( link.from ) + ( spec.type === 'event' ? ':' + endpointKey( link.to ) : '' );
			if ( ! outputs.has( key ) ) {

				const socket = addInterfaceSocket( group, 'outputs', spec );
				outputs.set( key, socket );
				body.links.push( { from: link.from, to: endpoint( groupOutput, socket ) } );

			}
			links.push( { ...link, from: endpoint( instance.id, outputs.get( key ) ) } );

		} else links.push( link );

	}
	graph.nodes = graph.nodes.filter( node => ! picked.has( node.id ) );
	graph.links = links;
	return instance;

}

export function exposeGroupSocket( group, graph, domain, port ) {

	const node = graph.nodes.find( item => item.id === port.node );
	const definition = domain.nodes.get( node.type );
	if ( definition.fixed ) return;
	if ( port.direction === 'input' ) {

		if ( graph.links.some( link => endpointKey( link.to ) === endpointKey( port ) ) ) throw new Error( 'Disconnect the input before exposing it.' );
		const id = addInterfaceSocket( group, 'inputs', definition.inputs[ port.socket ], node.values[ port.socket ] );
		graph.links.push( { from: endpoint( groupInput, id ), to: endpoint( node.id, port.socket ) } );

	} else {

		if ( graph.links.some( link => link.to.node === groupOutput && endpointKey( link.from ) === endpointKey( port ) ) ) return;
		const id = addInterfaceSocket( group, 'outputs', definition.outputs[ port.socket ] );
		graph.links.push( { from: endpoint( node.id, port.socket ), to: endpoint( groupOutput, id ) } );

	}

}

export function removeGroupSocket( root, group, direction, name ) {

	const input = direction === 'inputs';
	delete group[ direction ][ name ];
	group.body.links = group.body.links.filter( link => {

		const port = input ? link.from : link.to;
		return port.node !== ( input ? groupInput : groupOutput ) || port.socket !== name;

	} );
	function drop( graph ) {

		const instances = new Set();
		for ( const node of graph.nodes ) {

			if ( node.type === group.id ) {

				instances.add( node.id );
				if ( input ) delete node.values[ name ];

			}
			if ( node.body ) drop( node.body );

		}
		graph.links = graph.links.filter( link => {

			const port = input ? link.to : link.from;
			return ! instances.has( port.node ) || port.socket !== name;

		} );

	}
	drop( root );
	for ( const entry of root.groups ) drop( entry.body );

}

function constant( type, value ) {

	switch ( type ) {

		case 'number': return [ 'value.number', 'value', { value } ];
		case 'field': return [ 'field.constant', 'value', { value } ];
		case 'color': return [ 'shader.color', 'color', { color: value } ];
		case 'vec3': return [ 'vector.combine', 'vector', { x: value[ 0 ], y: value[ 1 ], z: value[ 2 ] } ];
		case 'object': return [ 'logic.object', 'object', { object: value } ];
		case 'string': return [ 'logic.string', 'value', { value } ];
		case 'boolean': return [ 'logic.boolean', 'value', { value } ];

	}

}

function inlineGroup( graph, domain, instance, group, body ) {

	const children = body.nodes.filter( node => node.type !== groupInput && node.type !== groupOutput );
	const cx = children.length ? children.reduce( ( sum, node ) => sum + node.x, 0 ) / children.length : instance.x;
	const cy = children.length ? children.reduce( ( sum, node ) => sum + node.y, 0 ) / children.length : instance.y;
	const existing = new Map( graph.nodes.map( node => [ node.id, node ] ) );
	const added = new Map();
	const allocate = ( id, node ) => {

		let name = instance.id + '/' + id;
		for ( let suffix = 2; existing.has( name ); suffix ++ ) name = instance.id + '/' + id + '-' + suffix;
		const clone = { ...node, id: name, values: { ...node.values }, x: node.x - cx + instance.x, y: node.y - cy + instance.y };
		existing.set( name, clone );
		return clone;

	};
	for ( const node of children ) added.set( node.id, allocate( node.id, node ) );
	const inbound = new Map(), outgoing = new Map(), replacements = new Map();
	const sources = new Map( body.links.filter( link => link.to.node === groupOutput ).map( link => [ link.to.socket, link ] ) );
	for ( const link of graph.links ) {

		if ( link.to.node === instance.id ) { inbound.set( link.to.socket, link ); replacements.set( link, [] ); }
		if ( link.from.node === instance.id && link.to.node !== instance.id ) {

			const socket = link.from.socket;
			if ( ! outgoing.has( socket ) ) outgoing.set( socket, [] );
			outgoing.get( socket ).push( link );

		}

	}
	const links = [], literals = [];
	function resolve( from, visited = new Set() ) {

		if ( from.node !== groupInput ) return { from: endpoint( added.get( from.node ).id, from.socket ) };
		const spec = group.inputs[ from.socket ];
		const link = inbound.get( from.socket );
		const fallback = { value: instance.values[ from.socket ] ?? spec.default, type: spec.type };
		if ( link?.from.node !== instance.id ) return { ...fallback, link, from: link?.from, muted: link?.muted };
		const source = sources.get( link.from.socket );
		if ( ! source ) return fallback;
		if ( visited.has( from.socket ) ) throw new Error( 'A group connection creates a cycle through its interface.' );
		visited.add( from.socket );
		const resolved = resolve( source.from, visited );
		return { ...fallback, ...resolved, muted: resolved.muted || link.muted || source.muted };

	}
	function attach( source, to, muted, preserveFallback ) {

		const destination = existing.get( to.node );
		const spec = domain.nodes.get( destination.type ).inputs[ to.socket ];
		const editable = Object.hasOwn( spec, 'default' );
		const hasValue = source.value !== undefined;
		if ( hasValue && editable && ( ! source.from || preserveFallback ) && ! muted ) destination.values[ to.socket ] = source.value;
		muted = muted || source.muted;
		let from = source.from;
		if ( ! from && hasValue && ! editable ) {

			const [ type, socket, values ] = constant( source.type, source.value ) || [];
			if ( ! domain.nodes.has( type ) ) throw new Error( 'The group default for ' + spec.label + ' cannot be connected here.' );
			const literal = allocate( 'default-' + literals.length, { type, x: destination.x - 246 + cx - instance.x, y: destination.y + cy - instance.y, values } );
			literals.push( literal );
			from = endpoint( literal.id, socket );

		}
		if ( from ) ( replacements.get( source.link ) || links ).push( { from, to, ...( muted ? { muted: true } : {} ) } );

	}
	for ( const link of body.links ) {

		const source = resolve( link.from );
		if ( link.to.node !== groupOutput ) attach( source, endpoint( added.get( link.to.node ).id, link.to.socket ), link.muted, true );
		else for ( const outer of outgoing.get( link.to.socket ) || [] ) attach( source, outer.to, outer.muted || link.muted, false );

	}
	for ( const link of graph.links ) {

		if ( link.to.node === instance.id ) links.push( ...replacements.get( link ) );
		else if ( link.from.node !== instance.id ) links.push( link );

	}
	const inserted = [ ...added.values(), ...literals ];
	graph.nodes = graph.nodes.flatMap( node => node === instance ? inserted : [ node ] );
	graph.links = links;
	return inserted;

}

export function ungroupNode( graph, domain, node ) {

	if ( node.muted ) throw new Error( 'Unmute the group before ungrouping.' );
	const group = domain.nodes.get( node.type )?.group;
	if ( group ) return inlineGroup( graph, domain, node, group, structuredClone( group.body ) );

}

export function copiedGroupDefinitions( nodes, groups ) {

	const library = new Map( ( groups || [] ).map( group => [ group.id, group ] ) );
	const copied = new Set();
	function visit( nodes ) {

		for ( const node of nodes ) {

			const group = library.get( node.type );
			if ( group && ! copied.has( group ) ) {

				copied.add( group );
				visit( group.body.nodes );

			}
			if ( node.body ) visit( node.body.nodes );

		}

	}
	visit( nodes );
	return [ ...copied ];

}

export function importGroupDefinitions( root, definitions, nodes ) {

	const current = new Map( ( root.groups || [] ).map( group => [ group.id, group ] ) );
	const names = new Set( ( root.groups || [] ).map( group => group.name ) );
	if ( ! definitions.length ) return nodes;
	// A definition edited in another graph can have the same ID and different wiring.
	const conflict = definitions.some( group => current.has( group.id ) && JSON.stringify( current.get( group.id ) ) !== JSON.stringify( group ) );
	const ids = new Map( definitions.map( group => [ group.id, conflict ? newGroupId() : group.id ] ) );
	function remap( nodes ) {

		for ( const node of nodes ) {

			if ( ids.has( node.type ) ) node.type = ids.get( node.type );
			if ( node.body ) remap( node.body.nodes );

		}

	}
	for ( const original of definitions ) {

		const id = ids.get( original.id );
		if ( current.has( id ) ) continue;
		const group = structuredClone( original );
		group.id = id;
		remap( group.body.nodes );
		for ( let suffix = 2; names.has( group.name ); suffix ++ ) {

			const ending = ' ' + suffix;
			group.name = original.name.slice( 0, 64 - ending.length ) + ending;

		}
		names.add( group.name );
		( root.groups ||= [] ).push( group );

	}
	const pasted = structuredClone( nodes );
	remap( pasted );
	return pasted;

}

function validateGroups( groups ) {

	if ( ! Array.isArray( groups ) ) throw new Error( 'Invalid node group library.' );
	const seen = new Set();
	for ( const entry of groups ) {

		if ( ! entry || ! /^group:[\w-]+$/.test( entry.id ) || seen.has( entry.id ) ||
			typeof entry.name !== 'string' || ! entry.name.trim() || entry.name.length > 64 ) throw new Error( 'Invalid node group definition.' );
		seen.add( entry.id );
		for ( const direction of [ 'inputs', 'outputs' ] ) {

			const sockets = entry[ direction ];
			if ( ! sockets || typeof sockets !== 'object' || Array.isArray( sockets ) ) throw new Error( 'Invalid node group sockets.' );
			for ( const [ id, spec ] of Object.entries( sockets ) ) {

				if ( ! /^(in|out)\d+$/.test( id ) || ! types.has( spec?.type ) ||
					typeof spec.label !== 'string' || ! spec.label.trim() || spec.label.length > 100 ) throw new Error( 'Invalid node group socket.' );
				if ( Object.hasOwn( spec, 'default' ) ) validateSocketValue( spec.default, spec );

			}

		}

	}

}

export function expandNodeGroups( graph, base ) {

	if ( ! graph || ! Object.hasOwn( graph, 'groups' ) ) return graph;
	const groups = graph.groups;
	validateGroups( groups );
	if ( ! groups.length ) return graph;
	let size = 0;
	function expand( input, scope, ancestors, group ) {

		if ( ancestors.length > 24 ) throw new Error( 'Node groups and zones support up to 24 nested levels.' );
		const domain = nodeGroupsDomain( scope, groups, group );
		const index = indexGraph( input, domain );
		size += index.nodes.size + input.links.length;
		if ( size > 24000 ) throw new Error( 'Node group expansion exceeded 24,000 nodes and links.' );
		if ( group && ( index.nodes.get( groupInput )?.type !== groupInput || index.nodes.get( groupOutput )?.type !== groupOutput ||
			input.nodes.filter( node => node.type === groupInput || node.type === groupOutput ).length !== 2 ) ) {

			throw new Error( group.name + ' needs one Group Input and one Group Output.' );

		}
		const live = activeGraph( input, domain );
		const output = { ...live, nodes: live.nodes.map( node => ( { ...node, values: { ...node.values } } ) ) };
		for ( const node of output.nodes.slice() ) {

			const spec = domain.nodes.get( node.type );
			if ( spec.group ) {

				if ( ancestors.includes( node.type ) ) throw new Error( 'A node group cannot contain itself.' );
				const body = expand( spec.group.body, scope, [ ...ancestors, node.type ], spec.group );
				inlineGroup( output, domain, node, spec.group, body );

			} else if ( node.body && spec.bodyDomain ) {

				node.body = expand( node.body, spec.bodyDomain(), [ ...ancestors, null ] );

			}

		}
		delete output.groups;
		return output;

	}
	return expand( graph, base, [] );

}
