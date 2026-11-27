import { activeGraph, addNode, createGraph, dataflowOrder, indexGraph } from './NodeGraph.js';
import { numberInput, VALUE_NODES } from './ValueNodes.js';
import { expandNodeGroups, nodeGroupsDomain } from './NodeGroups.js';

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
const topic = ( value = '', mode = 'numeric' ) => ( { ...text( 'Topic', value ), browseTopic: mode } );
const stringOutput = { value: { label: 'Text', type: 'string' } };
const vec3 = { label: 'Vector', type: 'vec3' };
const axes = Object.fromEntries( [ 'x', 'y', 'z' ].map( axis => [ axis, { label: axis.toUpperCase(), type: 'number' } ] ) );
const midiChannel = numberInput( 'Channel', 1, 1, 16 );
const midiNumber = ( label, value ) => numberInput( label, value, 0, 127 );
const trigger = ( label, id, inputs, outputs = flow ) => ( { label, category: 'Events', trigger: id, inputs, outputs } );
const action = ( label, category, inputs, outputs = flow ) => ( { label, category, inputs: { run: event( 'Run' ), ...inputs }, outputs } );
const gamepad = numberInput( 'Controller Index', 0, 0, 63 );
const gamepadButton = numberInput( 'Button Index', 0, 0, 127 );
const pointerButton = numberInput( 'Button', 0, 0, 4 );
const options = ( label, values ) => ( { ...text( label, values[ 0 ] ), options: values } );
const vector = ( label, value ) => ( { ...vec3, label, ...( value ? { default: value } : {} ) } );
const unit = ( label, value ) => numberInput( label, value, 0, 1 );
const numberOutput = label => ( { type: 'number', label } );
const booleanOutput = label => ( { type: 'boolean', label } );
const rayOutputs = {
	hit: booleanOutput( 'Hit' ), object: { label: 'Object', type: 'object' }, point: vector( 'Point' ),
	normal: vector( 'Normal' ), distance: numberOutput( 'Distance' )
};
const inputEvent = ( device, ...args ) => ( { ...trigger( ...args ), category: 'Input', device } );
const inputValue = ( device, label, inputs, outputs, keywords ) => ( { device, label, category: 'Input', inputs, outputs, keywords } );

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
		[ 'logic.pointer', trigger( 'On Pointer Press', 'pointerdown', { button: pointerButton } ) ],
		[ 'logic.pointerUp', inputEvent( 'pointer', 'On Pointer Release', 'pointerup', { button: pointerButton } ) ],
		[ 'logic.objectPress', inputEvent( 'pointer-ray', 'On Object Press', 'pointerdown', { target, button: pointerButton } ) ],
		[ 'logic.pointerOver', { ...inputEvent( 'pointer-ray', 'Pointer Over Object', 'hover', { target }, {
			enter: event( 'Enter' ), over: event( 'Over' ), exit: event( 'Exit' )
		} ), keywords: 'mouse hover' } ],
		[ 'logic.pointerPosition', inputValue( 'pointer', 'Pointer Position', {}, {
			x: numberOutput( 'X' ), y: numberOutput( 'Y' ), inside: booleanOutput( 'Inside View' )
		}, 'mouse cursor' ) ],
		[ 'logic.pointerRay', inputValue( 'pointer-ray', 'Pointer Ray', {}, rayOutputs, 'mouse pick click raycast' ) ],
		[ 'logic.raycast', {
			label: 'Raycast', category: 'Queries', outputs: rayOutputs,
			inputs: {
				origin: vector( 'World Origin', [ 0, 0, 0 ] ), direction: vector( 'World Direction', [ 0, - 1, 0 ] ),
				distance: numberInput( 'Max Distance', 100, 0, 1e6 ), scope: { ...object( 'Search In' ), emptyLabel: 'Whole scene' },
				ignore: { ...object( 'Ignore' ), emptyLabel: 'None', allowSelf: true }
			}
		} ],
		[ 'logic.keyboardState', inputValue( 'keyboard', 'Keyboard Key State', { key: text( 'Key Code', 'Space' ) }, { pressed: booleanOutput( 'Pressed' ) } ) ],
		[ 'logic.gamepadConnection', inputEvent( 'gamepad', 'Gamepad Connection', 'gamepadconnection', { gamepad }, {
			connected: event( 'Connected' ), disconnected: event( 'Disconnected' )
		} ) ],
		[ 'logic.gamepadButton', inputEvent( 'gamepad', 'Gamepad Button', 'gamepadbutton', {
			gamepad, button: gamepadButton, mode: options( 'Mode', [ 'Press', 'Held', 'Release' ] )
		} ) ],
		[ 'logic.gamepadButtonValue', inputValue( 'gamepad', 'Gamepad Button Value', { gamepad, button: gamepadButton }, {
			strength: numberOutput( 'Strength' ), pressed: booleanOutput( 'Pressed' )
		}, 'controller trigger analog' ) ],
		[ 'logic.gamepadActive', inputValue( 'gamepad', 'Gamepad Active', { gamepad }, { active: booleanOutput( 'Active' ) }, 'controller connected' ) ],
		[ 'logic.gamepadAxis', inputValue( 'gamepad', 'Gamepad Axis', { gamepad, axis: numberInput( 'Axis Index', 0, 0, 127 ) }, numeric, 'controller joystick' ) ],
		[ 'logic.gamepadStick', inputValue( 'gamepad', 'Gamepad Stick', {
			gamepad, stick: options( 'Stick', [ 'Left', 'Right' ] ), deadZone: numberInput( 'Dead Zone', .15, 0, .99 ),
			gain: numberInput( 'Gain', 1, 0, 20 ), invertX: flag( 'Invert X' ), invertY: flag( 'Invert Y' )
		}, { x: numberOutput( 'X' ), y: numberOutput( 'Y' ), vector: vec3, strength: numberOutput( 'Strength' ) }, 'controller joystick') ],
		[ 'logic.gamepadVibrate', { ...action( 'Gamepad Vibrate', 'Input', {
			gamepad, seconds: numberInput( 'Seconds', .2, 0, 5 ), strong: unit( 'Strong Motor', .6 ), weak: unit( 'Weak Motor', .4 )
		} ), device: 'gamepad', keywords: 'controller rumble haptics' } ],
		[ 'logic.receive', trigger( 'Receive Event', 'custom', { name: eventName } ) ],
		[ 'logic.interval', trigger( 'Every Interval', 'interval', { seconds: numberInput( 'Seconds', 1, .001, 3600 ) } ) ],
		[ 'logic.overlap', trigger( 'On Overlap', 'overlap', { target }, { enter: event( 'Enter' ), exit: event( 'Exit' ) } ) ],
		[ 'logic.streamSample', { ...trigger( 'On Stream Sample', 'sample', { topic: topic( '', 'any' ) } ), category: 'Streams' } ],
		[ 'logic.streamChange', { ...trigger( 'On Stream Change', 'sample', { topic: topic( '', 'any' ) } ), category: 'Streams' } ],
		[ 'logic.streamThreshold', { ...trigger( 'Stream Threshold', 'sample', { topic: topic(), threshold: numberInput( 'Threshold', .5 ) },
			{ above: event( 'Rises Above' ), below: event( 'Falls Below' ) } ), category: 'Streams' } ],
		[ 'logic.clock', {
			label: 'Scene Time', category: 'Values',
			outputs: { elapsed: { label: 'Elapsed Seconds', type: 'number' }, delta: { label: 'Delta Seconds', type: 'number' } }
		} ],
		[ 'logic.object', { label: 'Object', category: 'Values', inputs: { object: target }, outputs: { object: { label: 'Object', type: 'object' } } } ],
		[ 'logic.host', { label: 'Host Object', category: 'Values', outputs: { object: { label: 'Object', type: 'object' } } } ],
		[ 'logic.bone', {
			label: 'Armature Bone', category: 'Rigging',
			inputs: { armature: object( 'Armature' ), name: text( 'Bone Name or UUID', 'Bone' ) },
			outputs: { object: { label: 'Bone', type: 'object' }, found: booleanOutput( 'Found' ), head: vector( 'World Head' ), tail: vector( 'World Tail' ) }
		} ],
		[ 'logic.resetBone', action( 'Reset Bone Pose', 'Rigging', { target } ) ],
		[ 'logic.setIKInfluence', action( 'Set IK Influence', 'Rigging', { target, influence: unit( 'Influence', 1 ) } ) ],
		[ 'logic.boneContact', {
			...trigger( 'On Bone Contact', 'bonecontact', { target, other: { ...object( 'Other Collider' ), emptyLabel: 'Any collider' } },
				{ enter: event( 'Enter' ), exit: event( 'Exit' ) } ), category: 'Rigging'
		} ],
		[ 'logic.boneImpulse', action( 'Apply Bone Impulse', 'Rigging', { target, impulse: vector( 'World Impulse', [ 0, 1, 0 ] ) } ) ],
		[ 'logic.boneVelocity', {
			label: 'Bone Velocity', category: 'Rigging', inputs: { target },
			outputs: { velocity: vector( 'World Velocity' ), speed: numberOutput( 'Speed' ) }
		} ],
		[ 'logic.boolean', { label: 'Boolean', category: 'Values', inputs: { value: flag( 'Value' ) }, outputs: condition } ],
		[ 'logic.string', { label: 'Text', category: 'Values', inputs: { value: text( 'Text' ) }, outputs: stringOutput } ],
		[ 'logic.eventValue', { label: 'Event Value', category: 'Values', inputs: { fallback: numberInput( 'Fallback' ) }, outputs: numeric } ],
		[ 'logic.eventText', { label: 'Event Text', category: 'Values', inputs: { fallback: text( 'Fallback' ) }, outputs: stringOutput } ],
		[ 'logic.topic', {
			label: 'Stream Value', category: 'Streams',
			inputs: { topic: topic(), fallback: numberInput( 'Fallback' ) }, outputs: numeric
		} ],
		[ 'logic.streamText', { label: 'Stream Text', category: 'Streams', inputs: { topic: topic( 'serial.line', 'any' ), fallback: text( 'Fallback' ) }, outputs: stringOutput } ],
		[ 'logic.serialValue', { label: 'Serial Value', category: 'Streams', inputs: { key: text( 'Signal', 'A0' ), fallback: numberInput( 'Fallback' ) }, outputs: numeric } ],
		[ 'logic.midiCC', { label: 'MIDI Control', category: 'Streams', inputs: { channel: midiChannel, controller: midiNumber( 'Controller', 1 ) },
			outputs: { ...numeric, normalized: { label: 'Normalized', type: 'number' } } } ],
		[ 'logic.midiNote', { label: 'MIDI Note', category: 'Streams', inputs: { channel: midiChannel, note: midiNumber( 'Note', 60 ) },
			outputs: { ...numeric, pressed: { label: 'Pressed', type: 'boolean' } } } ],
		[ 'logic.midiBend', { label: 'MIDI Pitch Bend', category: 'Streams', inputs: { channel: midiChannel }, outputs: numeric } ],
		[ 'logic.landmark', { label: 'MediaPipe Landmark', category: 'Streams', keywords: 'tracking pose face hand iris vision',
			inputs: {
				group: { ...text( 'Tracking', 'pose' ), options: [ 'pose', 'hand', 'leftHand', 'rightHand', 'face', 'iris.left', 'iris.right' ] },
				index: numberInput( 'Index', 16, 0, 511 ), source: text( 'Input ID' )
			}, outputs: { ...axes, vector: vec3, available: { label: 'Available', type: 'boolean' } } } ],
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
		[ 'logic.publishStream', action( 'Publish Stream Value', 'Streams', { topic: topic( 'map.value' ), value: numberInput( 'Value' ) } ) ],
		[ 'logic.sendSerial', action( 'Send Serial Value', 'Streams', { key: text( 'Signal', 'LED' ), value: numberInput( 'Value' ) } ) ],
		[ 'logic.sendCC', action( 'Send MIDI Control', 'Streams', { channel: midiChannel, controller: midiNumber( 'Controller', 1 ), value: midiNumber( 'Value', 0 ) } ) ],
		[ 'logic.sendNote', action( 'Send MIDI Note', 'Streams', { channel: midiChannel, note: midiNumber( 'Note', 60 ), value: midiNumber( 'Velocity', 100 ) } ) ],
		[ 'logic.move', action( 'Move', 'Actions', { target, ...xyz(), local: flag( 'Local Axes' ) } ) ],
		[ 'logic.moveVector', action( 'Move by Vector', 'Actions', { target, vector: vec3, scale: numberInput( 'Scale', 1 ), local: flag( 'Local Axes' ) } ) ],
		[ 'logic.rotate', action( 'Rotate', 'Actions', { target, ...xyz(), local: flag( 'Local Axes', true ) } ) ],
		[ 'logic.setPosition', action( 'Set Position', 'Actions', { target, ...xyz() } ) ],
		[ 'logic.setPositionVector', action( 'Set Position by Vector', 'Actions', { target, vector: vector( 'Position', [ 0, 0, 0 ] ), world: flag( 'World Space', true ) } ) ],
		[ 'logic.setScale', action( 'Set Scale', 'Actions', { target, ...xyz( 1, 1, 1 ) } ) ],
		[ 'logic.setVisibility', action( 'Set Visibility', 'Actions', { target, visible: flag( 'Visible', true ) } ) ],
		[ 'logic.toggleVisibility', action( 'Toggle Visibility', 'Actions', { target } ) ],
		[ 'logic.setColor', action( 'Set Material Color', 'Actions', { target, color: { label: 'Color', type: 'color', default: '#ffffff' }, slot: numberInput( 'Slot', 0, 0, 255 ) } ) ],
		[ 'logic.lightIntensity', action( 'Set Light Intensity', 'Actions', { target, value: numberInput( 'Intensity', 1, 0, 1e6 ) } ) ],
		[ 'logic.setParameter', action( 'Set Script Parameter', 'Actions', { target, index: numberInput( 'Script Index', 0, 0, 255 ), name: text( 'Parameter' ), value: numberInput( 'Value' ) } ) ],
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

	graph = expandNodeGroups( graph, LOGIC_DOMAIN );
	graph = activeGraph( graph, LOGIC_DOMAIN );
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
	const domain = nodeGroupsDomain( LOGIC_DOMAIN, graph.groups );
	for ( const group of graph.groups || [] ) for ( const socket of Object.values( group.inputs ) ) {

		if ( socket.type === 'object' && socket.default ) socket.default = remap( socket.default );

	}
	for ( const scope of [ graph, ...( graph.groups || [] ).map( group => group.body ) ] ) for ( const node of scope.nodes ) {

		const inputs = domain.nodes.get( node.type )?.inputs;
		for ( const [ key, spec ] of Object.entries( inputs || {} ) ) {

			if ( spec.type === 'object' && node.values?.[ key ] ) node.values[ key ] = remap( node.values[ key ] );

		}

	}

}
