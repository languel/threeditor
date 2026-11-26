import { addNode, createGraph, dataflowOrder, indexGraph } from './NodeGraph.js';
import { numberInput, VALUE_NODES } from './ValueNodes.js';

const event = label => ( { label, type: 'event' } );
const flag = ( label, value = false ) => ( { label, type: 'boolean', default: value } );
const text = ( label, value = '' ) => ( { label, type: 'string', default: value, maxLength: 128 } );
const object = label => ( { label, type: 'object', default: '' } );
const numeric = { value: { label: 'Value', type: 'number' } };
const condition = { value: { label: 'Value', type: 'boolean' } };
const xyz = ( x = 0, y = 0, z = 0 ) => ( { x: numberInput( 'X', x ), y: numberInput( 'Y', y ), z: numberInput( 'Z', z ) } );
const target = object( 'Target' );
const flow = { then: event( 'Then' ) };
const comparands = { a: numberInput( 'A' ), b: numberInput( 'B' ) };
const variableName = text( 'Name', 'count' );
const eventName = text( 'Event', 'activate' );
const duration = ( label, value = 1 ) => numberInput( label, value, 0, 3600 );
const trigger = ( label, id, inputs, outputs = flow ) => ( { label, category: 'Events', trigger: id, inputs, outputs } );
const action = ( label, category, inputs, outputs = flow ) => ( { label, category, inputs: { run: event( 'Run' ), ...inputs }, outputs } );

export const LOGIC_DOMAIN = {
	id: 'logic',
	label: 'Logic Nodes',
	validateLinks: validateLogicLinks,
	nodes: new Map( [
		[ 'logic.start', trigger( 'On Start', 'start' ) ],
		[ 'logic.update', trigger( 'On Update', 'update' ) ],
		[ 'logic.keyDown', trigger( 'On Key Press', 'keydown', { key: text( 'Key Code', 'Space' ), repeat: flag( 'Allow Repeat' ) } ) ],
		[ 'logic.keyUp', trigger( 'On Key Release', 'keyup', { key: text( 'Key Code', 'Space' ) } ) ],
		[ 'logic.keyHeld', trigger( 'While Key Is Held', 'held', { key: text( 'Key Code', 'ArrowRight' ) } ) ],
		[ 'logic.pointer', trigger( 'On Pointer Press', 'pointerdown', { button: numberInput( 'Button', 0, 0, 4 ) } ) ],
		[ 'logic.receive', trigger( 'Receive Event', 'custom', { name: eventName } ) ],
		[ 'logic.interval', trigger( 'Every Interval', 'interval', { seconds: numberInput( 'Seconds', 1, .001, 3600 ) } ) ],
		[ 'logic.overlap', trigger( 'On Overlap', 'overlap', { target }, { enter: event( 'Enter' ), exit: event( 'Exit' ) } ) ],
		[ 'logic.clock', {
			label: 'Scene Time', category: 'Values',
			outputs: { elapsed: { label: 'Elapsed Seconds', type: 'number' }, delta: { label: 'Delta Seconds', type: 'number' } }
		} ],
		[ 'logic.object', { label: 'Object', category: 'Values', inputs: { object: target }, outputs: { object: { label: 'Object', type: 'object' } } } ],
		[ 'logic.boolean', { label: 'Boolean', category: 'Values', inputs: { value: flag( 'Value' ) }, outputs: condition } ],
		[ 'logic.eventValue', { label: 'Event Value', category: 'Values', inputs: { fallback: numberInput( 'Fallback' ) }, outputs: numeric } ],
		[ 'logic.topic', {
			label: 'Stream Value', category: 'Values',
			inputs: { topic: text( 'Topic' ), fallback: numberInput( 'Fallback' ) }, outputs: numeric
		} ],
		[ 'logic.variable', { label: 'Get Variable', category: 'Values', inputs: { name: variableName, fallback: numberInput( 'Fallback' ) }, outputs: numeric } ],
		[ 'logic.position', {
			label: 'Object Position', category: 'Values', inputs: { target },
			outputs: { x: { label: 'X', type: 'number' }, y: { label: 'Y', type: 'number' }, z: { label: 'Z', type: 'number' } }
		} ],
		[ 'logic.compare', { label: 'Greater Than', category: 'Conditions', inputs: comparands, outputs: condition } ],
		[ 'logic.equal', { label: 'Equal', category: 'Conditions', inputs: comparands, outputs: condition } ],
		[ 'logic.not', { label: 'Not', category: 'Conditions', inputs: { value: flag( 'Value' ) }, outputs: condition } ],
		[ 'logic.and', { label: 'And', category: 'Conditions', inputs: { a: flag( 'A' ), b: flag( 'B' ) }, outputs: condition } ],
		[ 'logic.or', { label: 'Or', category: 'Conditions', inputs: { a: flag( 'A' ), b: flag( 'B' ) }, outputs: condition } ],
		[ 'logic.branch', action( 'Branch', 'Flow', { condition: flag( 'Condition' ) }, { yes: event( 'True' ), no: event( 'False' ) } ) ],
		[ 'logic.sequence', action( 'Sequence', 'Flow', {}, { first: event( 'First' ), second: event( 'Second' ) } ) ],
		[ 'logic.merge', { label: 'Merge Events', category: 'Flow', inputs: { a: event( 'A' ), b: event( 'B' ) }, outputs: flow } ],
		[ 'logic.once', action( 'Once', 'Flow', {} ) ],
		[ 'logic.delay', { ...action( 'Delay', 'Flow', { seconds: duration( 'Seconds' ) } ), deferred: true } ],
		[ 'logic.send', action( 'Send Event', 'Actions', { name: eventName, value: numberInput( 'Value', 1 ) } ) ],
		[ 'logic.setVariable', action( 'Set Variable', 'Actions', { name: variableName, value: numberInput( 'Value' ) } ) ],
		[ 'logic.move', action( 'Move', 'Actions', { target, ...xyz(), local: flag( 'Local Axes' ) } ) ],
		[ 'logic.rotate', action( 'Rotate', 'Actions', { target, ...xyz(), local: flag( 'Local Axes', true ) } ) ],
		[ 'logic.setPosition', action( 'Set Position', 'Actions', { target, ...xyz() } ) ],
		[ 'logic.setScale', action( 'Set Scale', 'Actions', { target, ...xyz( 1, 1, 1 ) } ) ],
		[ 'logic.setVisibility', action( 'Set Visibility', 'Actions', { target, visible: flag( 'Visible', true ) } ) ],
		[ 'logic.toggleVisibility', action( 'Toggle Visibility', 'Actions', { target } ) ],
		...VALUE_NODES
	] )
};

function validateLogicLinks( { nodes, inputs } ) {

	const immediate = new Map();
	const consumers = new Map( [ ...nodes.keys() ].map( id => [ id, [] ] ) );
	for ( const [ id, bindings ] of inputs ) {

		const def = LOGIC_DOMAIN.nodes.get( nodes.get( id ).type );
		const edges = new Map();
		immediate.set( id, edges );
		for ( const [ socket, from ] of bindings ) {

			const source = LOGIC_DOMAIN.nodes.get( nodes.get( from.node ).type );
			if ( def.inputs[ socket ].type === 'event' && source.deferred ) continue;
			edges.set( socket, from );
			consumers.get( from.node ).push( id );

		}

	}
	try {

		dataflowOrder( { nodes, inputs: immediate, consumers } );

	} catch ( error ) {

		throw new Error( 'Feedback needs a Delay node. Value links cannot form cycles.', { cause: error } );

	}

}

export function createLogicGraph() {

	const graph = createGraph( LOGIC_DOMAIN );
	addNode( graph, 'logic.start', 24, 32 );
	return graph;

}

export function planLogicGraph( graph ) {

	const index = indexGraph( graph, LOGIC_DOMAIN );
	validateLogicLinks( index );
	const outgoing = new Map();
	const triggers = new Map();
	for ( const node of index.nodes.values() ) {

		const definition = LOGIC_DOMAIN.nodes.get( node.type );
		const kind = definition.trigger;
		if ( kind ) {

			if ( ! triggers.has( kind ) ) triggers.set( kind, [] );
			triggers.get( kind ).push( node );

		}
		outgoing.set( node.id, new Map() );

	}
	for ( const { from, to } of graph.links ) {

		const def = LOGIC_DOMAIN.nodes.get( index.nodes.get( to.node ).type );
		if ( def.inputs[ to.socket ].type !== 'event' ) continue;
		const outputs = outgoing.get( from.node );
		if ( ! outputs.has( from.socket ) ) outputs.set( from.socket, [] );
		outputs.get( from.socket ).push( index.nodes.get( to.node ) );

	}
	return { ...index, outgoing, triggers };

}

export function remapLogicObjects( graph, remap ) {

	if ( ! Array.isArray( graph?.nodes ) ) return;
	for ( const node of graph.nodes ) {

		const inputs = LOGIC_DOMAIN.nodes.get( node.type )?.inputs;
		for ( const [ key, spec ] of Object.entries( inputs || {} ) ) {

			if ( spec.type === 'object' && node.values?.[ key ] ) node.values[ key ] = remap( node.values[ key ] );

		}

	}

}
