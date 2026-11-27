import { addNode, connectNodes, validateSocketValue } from './NodeGraph.js';
import { copiedGroupDefinitions, importGroupDefinitions, nodeGroupsDomain } from './NodeGroups.js';

export function copyNodes( graph, ids, catalog = graph.groups ) {

	const nodes = graph.nodes.filter( node => ids.has( node.id ) );
	return structuredClone( {
		domain: graph.domain,
		nodes,
		groups: copiedGroupDefinitions( nodes, catalog ),
		links: graph.links.filter( link => ids.has( link.from.node ) && ids.has( link.to.node ) )
	} );

}

export function pasteNodes( graph, domain, clipboard, dx, dy, root = graph ) {

	const groups = ( clipboard.groups || [] ).filter( group => group.body.domain.split( '.' )[ 0 ] === domain.id.split( '.' )[ 0 ] );
	const sources = importGroupDefinitions( root, groups, clipboard.nodes );
	domain = nodeGroupsDomain( domain, root.groups );
	const ids = new Map();
	for ( const source of sources ) {

		if ( ! domain.nodes.has( source.type ) || domain.nodes.get( source.type ).fixed ||
			( source.body && source.body.domain !== domain.nodes.get( source.type ).bodyDomain?.().id ) ) continue;
		const node = addNode( graph, source.type, source.x + dx, source.y + dy );
		const { id } = node;
		Object.assign( node, structuredClone( source ), { id, x: node.x, y: node.y } );
		ids.set( source.id, id );

	}
	for ( const link of clipboard.links ) {

		const from = ids.get( link.from.node ), to = ids.get( link.to.node );
		if ( from && to ) graph.links.push( { ...link, from: { ...link.from, node: from }, to: { ...link.to, node: to } } );

	}
	return new Set( ids.values() );

}

export function makeLinks( graph, domain, ids, replace ) {

	const nodes = graph.nodes.filter( node => ids.has( node.id ) ).sort( ( a, b ) => a.x - b.x || a.y - b.y );
	let count = 0;
	for ( let i = 1; i < nodes.length; i ++ ) {

		const left = nodes[ i - 1 ], right = nodes[ i ];
		const outputs = Object.entries( domain.nodes.get( left.type ).outputs || {} );
		const inputs = Object.entries( domain.nodes.get( right.type ).inputs || {} );
		for ( const [ input, spec ] of inputs ) {

			const existing = graph.links.find( link => link.to.node === right.id && link.to.socket === input );
			if ( existing && ! replace ) continue;
			const sameType = outputs.filter( ( [ , output ] ) => output.type === spec.type );
			const match = sameType.find( ( [ name ] ) => name === input ) ||
				sameType.find( ( [ name ] ) => ! graph.links.some( link => link.from.node === left.id && link.from.socket === name && link.to.node === right.id ) );
			if ( ! match || existing?.from.node === left.id && existing.from.socket === match[ 0 ] ) continue;
			connectNodes( graph, domain, { node: left.id, socket: match[ 0 ] }, { node: right.id, socket: input } );
			count ++;

		}

	}
	return count;

}

export function swapNode( graph, domain, id, type ) {

	const index = graph.nodes.findIndex( node => node.id === id );
	const old = graph.nodes[ index ];
	const replacement = addNode( graph, type, old.x, old.y, domain );
	graph.nodes.pop();
	replacement.id = id;
	if ( old.muted ) replacement.muted = true;
	graph.nodes[ index ] = replacement;
	const before = domain.nodes.get( old.type ), after = domain.nodes.get( type );
	const used = new Set();
	const sockets = new Map();
	for ( const direction of [ 'inputs', 'outputs' ] ) for ( const [ name, spec ] of Object.entries( before[ direction ] || {} ) ) {

		const choices = Object.entries( after[ direction ] || {} ).filter( ( [ key, socket ] ) =>
			socket.type === spec.type && ( direction === 'outputs' || ! used.has( key ) ) );
		const match = choices.find( ( [ key ] ) => key === name ) || choices[ 0 ];
		if ( ! match ) continue;
		const [ key, socket ] = match;
		sockets.set( direction + '/' + name, key );
		if ( direction !== 'inputs' ) continue;
		used.add( key );
		if ( ! Object.hasOwn( old.values, name ) || ! Object.hasOwn( socket, 'default' ) ) continue;
		try {

			validateSocketValue( old.values[ name ], socket );
			replacement.values[ key ] = old.values[ name ];

		} catch { /* The new node's default applies to incompatible values. */ }

	}
	graph.links = graph.links.flatMap( link => {

		const from = link.from.node === id ? sockets.get( 'outputs/' + link.from.socket ) : link.from.socket;
		const to = link.to.node === id ? sockets.get( 'inputs/' + link.to.socket ) : link.to.socket;
		return from && to ? [ { ...link, from: { ...link.from, socket: from }, to: { ...link.to, socket: to } } ] : [];

	} );

}

export function wireBend( from, to ) {

	return Math.max( 26, Math.abs( to.x - from.x ) * .5 );

}

const cross = ( a, b, c ) => ( b.x - a.x ) * ( c.y - a.y ) - ( b.y - a.y ) * ( c.x - a.x );

function intersects( a, b, c, d ) {

	return Math.max( a.x, b.x ) >= Math.min( c.x, d.x ) && Math.max( c.x, d.x ) >= Math.min( a.x, b.x ) &&
		Math.max( a.y, b.y ) >= Math.min( c.y, d.y ) && Math.max( c.y, d.y ) >= Math.min( a.y, b.y ) &&
		cross( a, b, c ) * cross( a, b, d ) <= 0 && cross( c, d, a ) * cross( c, d, b ) <= 0;

}

export function cutsWire( stroke, from, to ) {

	const bend = wireBend( from, to );
	let last = from;
	const steps = Math.min( 100, Math.max( 16, Math.ceil( ( Math.abs( from.x - to.x ) + Math.abs( from.y - to.y ) + 2 * bend ) / 12 ) ) );
	for ( let i = 1; i <= steps; i ++ ) {

		const t = i / steps, u = 1 - t;
		const next = {
			x: u ** 3 * from.x + 3 * u ** 2 * t * ( from.x + bend ) + 3 * u * t ** 2 * ( to.x - bend ) + t ** 3 * to.x,
			y: u ** 2 * ( u + 3 * t ) * from.y + t ** 2 * ( 3 * u + t ) * to.y
		};
		for ( let j = 1; j < stroke.length; j ++ ) if ( intersects( last, next, stroke[ j - 1 ], stroke[ j ] ) ) return true;
		last = next;

	}
	return false;

}
