import { addNode, connectNodes, createGraph, dataflowOrder, evaluateDataflow, planDataflow, validateSocketValue } from './NodeGraph.js';
import { numberInput, VALUE_NODES, VALUE_OPERATIONS } from './ValueNodes.js';
import { joinGeometry } from './GeometryOperations.js';
import { attributeInput, FIELD_NODES, FIELD_OPERATIONS, fieldInput, forEachVertex, sampleField, validAttributeName } from './GeometryFields.js';

export const GEOMETRY_MODIFIER = 'GEOMETRY_NODES';
const sourceType = 'geometry.input';
const outputType = 'geometry.output';
const repeatType = 'geometry.repeat';
const repeatInput = 'geometry.repeat.input';
const repeatOutput = 'geometry.repeat.output';
const simulationType = 'geometry.simulation';
const simulationInput = 'geometry.simulation.input';
const simulationOutput = 'geometry.simulation.output';
const geometry = { geometry: { label: 'Geometry', type: 'geometry' } };
const size = label => numberInput( label, 1, .0001, 1e6 );
const numberOutput = label => ( { label, type: 'number' } );
const stateOutputs = { ...geometry, value: numberOutput( 'Value' ) };
const stateInputs = { ...geometry, value: numberInput( 'Value' ) };
const axes = [ 'x', 'y', 'z' ];

const geometryNodes = [
	[ 'geometry.box', {
		label: 'Box', category: 'Primitives', outputs: geometry,
		inputs: { width: size( 'Width' ), height: size( 'Height' ), depth: size( 'Depth' ) }
	} ],
	[ 'geometry.sphere', {
		label: 'Sphere', category: 'Primitives', outputs: geometry,
		inputs: { radius: size( 'Radius' ), segments: numberInput( 'Segments', 24, 3, 128 ), rings: numberInput( 'Rings', 16, 2, 128 ) }
	} ],
	[ 'geometry.grid', {
		label: 'Grid', category: 'Primitives', outputs: geometry,
		inputs: { width: size( 'Width' ), depth: size( 'Depth' ), xSegments: numberInput( 'X Segments', 10, 1, 256 ), zSegments: numberInput( 'Z Segments', 10, 1, 256 ) }
	} ],
	[ 'geometry.cylinder', {
		label: 'Cylinder', category: 'Primitives', outputs: geometry,
		inputs: { bottom: size( 'Bottom Radius' ), top: numberInput( 'Top Radius', 1, 0, 1e6 ), height: size( 'Height' ), segments: numberInput( 'Segments', 24, 3, 256 ) }
	} ],
	[ 'geometry.join', {
		label: 'Join Geometry', category: 'Geometry', outputs: geometry,
		inputs: { a: { label: 'A', type: 'geometry' }, b: { label: 'B', type: 'geometry' } }
	} ],
	[ 'geometry.materialIndex', {
		label: 'Set Material Index', category: 'Geometry', outputs: geometry,
		inputs: { ...geometry, index: numberInput( 'Material Index', 0, 0, 65535 ) }
	} ],
	[ 'geometry.setPosition', {
		label: 'Set Position', category: 'Geometry', outputs: geometry,
		inputs: { ...geometry, selection: fieldInput( 'Selection', 1 ), x: fieldInput( 'Offset X' ), y: fieldInput( 'Offset Y' ), z: fieldInput( 'Offset Z' ) }
	} ],
	[ 'geometry.storeAttribute', {
		label: 'Store Named Attribute', category: 'Geometry', outputs: geometry,
		inputs: { ...geometry, ...attributeInput, value: fieldInput( 'Value' ) }
	} ],
	[ 'geometry.transform', {
		label: 'Transform Geometry', category: 'Geometry', outputs: geometry,
		inputs: {
			...geometry, x: numberInput( 'Translate X' ), y: numberInput( 'Translate Y' ), z: numberInput( 'Translate Z' ),
			rotationX: numberInput( 'Rotate X (°)' ), rotationY: numberInput( 'Rotate Y (°)' ), rotationZ: numberInput( 'Rotate Z (°)' ),
			scale: size( 'Scale' )
		}
	} ],
	[ repeatType, {
		label: 'Repeat', category: 'Zones', inputs: { ...stateInputs, count: numberInput( 'Iterations', 5, 0, 128 ) }, outputs: stateOutputs,
		bodyDomain: () => REPEAT_BODY_DOMAIN
	} ],
	...VALUE_NODES,
	...FIELD_NODES
];

const REPEAT_BODY_DOMAIN = {
	id: 'geometry.repeat-body',
	label: 'Repeat body',
	sink: repeatOutput,
	validateLinks: dataflowOrder,
	createStarter: () => createStarter( REPEAT_BODY_DOMAIN, repeatInput, repeatOutput, Object.keys( stateInputs ) ),
	nodes: new Map( [
		[ repeatInput, { label: 'Repeat Input', fixed: true, outputs: { ...stateOutputs, iteration: numberOutput( 'Iteration' ) } } ],
		[ repeatOutput, { label: 'Repeat Output', fixed: true, inputs: stateInputs } ],
		...geometryNodes
	] )
};

const SIMULATION_BODY_DOMAIN = {
	id: 'geometry.simulation-body',
	label: 'Simulation body',
	sink: simulationOutput,
	validateLinks: dataflowOrder,
	createStarter: () => createStarter( SIMULATION_BODY_DOMAIN, simulationInput, simulationOutput, Object.keys( stateInputs ) ),
	nodes: new Map( [
		[ simulationInput, {
			label: 'Simulation Input', fixed: true,
			outputs: { ...stateOutputs, delta: numberOutput( 'Delta Seconds' ), time: numberOutput( 'Elapsed Seconds' ), frame: numberOutput( 'Step' ) }
		} ],
		[ simulationOutput, { label: 'Simulation Output', fixed: true, inputs: stateInputs } ],
		...geometryNodes
	] )
};

export const GEOMETRY_DOMAIN = {
	id: 'geometry',
	label: 'Geometry Nodes',
	sink: outputType,
	validateLinks: dataflowOrder,
	nodes: new Map( [
		[ sourceType, { label: 'Mesh Input', fixed: true, outputs: geometry } ],
		[ outputType, { label: 'Mesh Output', fixed: true, inputs: geometry } ],
		...geometryNodes,
		[ simulationType, {
			label: 'Simulation', category: 'Zones', inputs: stateInputs, outputs: stateOutputs,
			bodyDomain: () => SIMULATION_BODY_DOMAIN
		} ]
	] )
};

function createStarter( domain, inputType, outputType, sockets ) {

	const graph = createGraph( domain );
	const input = addNode( graph, inputType, 24, 32 );
	const output = addNode( graph, outputType, 268, 32 );
	for ( const socket of sockets ) connectNodes( graph, domain, { node: input.id, socket }, { node: output.id, socket } );
	return graph;

}

export function createGeometryGraph() {

	return createStarter( GEOMETRY_DOMAIN, sourceType, outputType, [ 'geometry' ] );

}

export function planGeometryGraph( graph, domain = GEOMETRY_DOMAIN, depth = 0 ) {

	if ( depth > 24 ) throw new Error( 'Geometry Nodes supports up to 24 nested zones.' );
	const sinks = Array.isArray( graph?.nodes ) ? graph.nodes.filter( node => node?.type === domain.sink ) : [];
	if ( sinks.length !== 1 ) throw new Error( domain.label + ' needs one ' + domain.nodes.get( domain.sink ).label + '.' );
	const plan = planDataflow( graph, domain, sinks[ 0 ].id );
	for ( const step of plan.steps || [] ) {

		const body = domain.nodes.get( step.node.type ).bodyDomain?.();
		if ( ! body ) continue;
		step.body = planGeometryGraph( step.node.body, body, depth + 1 );
		if ( step.body.missing ) return step.body;

	}
	return plan;

}

export function hasSimulation( plan ) {

	return !! plan.steps?.some( ( { node } ) => node.type === simulationType );

}

// A node owns new buffers and borrows its inputs. Transfer the final buffer to
// the caller and release the other buffers even when an operation fails.
export function evaluateGeometryGraph( THREE, graph, source, simulation, stage = 0 ) {

	const plan = simulation?.plans.get( graph ) ?? planGeometryGraph( graph );
	const buffers = new Set();
	let result = source;
	let vertices = 0;
	let evaluations = 0;
	function checkVertices( count ) {

		if ( vertices + count > 4e6 ) throw new Error( 'Geometry Nodes exceeds its evaluation budget of four million vertices.' );

	}
	function own( buffer ) {

		buffers.add( buffer );
		const count = buffer.attributes.position.count;
		checkVertices( count );
		vertices += count;
		return buffer;

	}
	function copy( source ) {

		checkVertices( source.attributes.position.count );
		const output = own( new THREE.BufferGeometry().copy( source ) );
		output.userData = structuredClone( source.userData );
		return output;

	}
	function primitive( buffer ) {

		try {

			// Store evaluated attributes so project JSON also retains the groups.
			const output = copy( buffer );
			output.clearGroups();
			output.addGroup( 0, output.index.count, 0 );
			return { geometry: output };

		} finally {

			buffer.dispose();

		}

	}
	const operations = new Map( [
		...VALUE_OPERATIONS,
		...FIELD_OPERATIONS,
		[ sourceType, () => ( { geometry: source } ) ],
		[ 'geometry.box', ( { width, height, depth } ) => primitive( new THREE.BoxGeometry( width, height, depth ) ) ],
		[ 'geometry.sphere', ( { radius, segments, rings } ) => primitive( new THREE.SphereGeometry( radius, Math.round( segments ), Math.round( rings ) ) ) ],
		[ 'geometry.grid', ( { width, depth, xSegments, zSegments } ) =>
			primitive( new THREE.PlaneGeometry( width, depth, Math.round( xSegments ), Math.round( zSegments ) ).rotateX( - Math.PI / 2 ) ) ],
		[ 'geometry.cylinder', ( { bottom, top, height, segments } ) =>
			primitive( new THREE.CylinderGeometry( top, bottom, height, Math.round( segments ) ) ) ],
		[ 'geometry.join', ( { a, b } ) => {

			checkVertices( a.attributes.position.count + b.attributes.position.count );
			return { geometry: own( joinGeometry( THREE, [ a, b ] ) ) };

		} ],
		[ 'geometry.materialIndex', ( { geometry, index } ) => {

			const output = copy( geometry );
			output.clearGroups();
			output.addGroup( 0, output.index?.count ?? output.attributes.position.count, Math.round( index ) );
			return { geometry: output };

		} ],
		[ 'geometry.setPosition', inputs => {

			const output = copy( inputs.geometry );
			const positions = new Float32Array( output.attributes.position.count * 3 );
			forEachVertex( THREE, inputs.geometry, element => {

				const values = element.position;
				const selected = sampleField( inputs.selection, element ) > 0;
				for ( let i = 0; i < axes.length; i ++ ) {

					const axis = axes[ i ];
					const value = values[ axis ] + ( selected ? sampleField( inputs[ axis ], element ) : 0 );
					const distance = Math.fround( value );
					if ( ! Number.isFinite( distance ) ) throw new Error( 'Set Position produced a position outside the supported range.' );
					positions[ element.index * 3 + i ] = distance;

				}

			} );
			output.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
			output.computeVertexNormals();
			output.computeBoundingBox();
			output.computeBoundingSphere();
			return { geometry: output };

		} ],
		[ 'geometry.storeAttribute', ( { geometry, name, value } ) => {

			const existing = Object.hasOwn( geometry.attributes, name ) && geometry.getAttribute( name );
			if ( ! validAttributeName( name ) || [ 'position', 'normal', 'tangent', 'color', 'skinIndex', 'skinWeight' ].includes( name ) ||
				/^uv\d*$/.test( name ) || ( existing && existing.itemSize !== 1 ) ) {

				throw new Error( 'Choose a custom scalar attribute name.' );

			}
			const output = copy( geometry );
			const values = new Float32Array( output.attributes.position.count );
			forEachVertex( THREE, geometry, element => {

				const sample = Math.fround( sampleField( value, element ) );
				if ( ! Number.isFinite( sample ) ) throw new Error( 'An attribute value is outside the supported range.' );
				values[ element.index ] = sample;

			} );
			output.setAttribute( name, new THREE.BufferAttribute( values, 1 ) );
			return { geometry: output };

		} ],
		[ 'geometry.transform', ( inputs ) => {

			const { x, y, z, rotationX, rotationY, rotationZ, scale } = inputs;
			const rotation = new THREE.Euler( rotationX * Math.PI / 180, rotationY * Math.PI / 180, rotationZ * Math.PI / 180 );
			const matrix = new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ),
				new THREE.Quaternion().setFromEuler( rotation ), new THREE.Vector3( scale, scale, scale ) );
			const transformed = copy( inputs.geometry );
			transformed.applyMatrix4( matrix );
			transformed.computeBoundingBox();
			if ( [ ...transformed.boundingBox.min, ...transformed.boundingBox.max ].some( v => ! Number.isFinite( v ) ) &&
				transformed.attributes.position.count ) throw new Error( 'Transform Geometry produced positions outside the supported range.' );
			return { geometry: transformed };

		} ]
	] );
	function run( plan, zoneInputs ) {

		return evaluateDataflow( plan, ( node, inputs, step ) => {

			if ( ++ evaluations > 50000 ) throw new Error( 'Geometry Nodes exceeds 50,000 node evaluations. Reduce the nested iteration counts.' );
			if ( node.type === repeatInput || node.type === simulationInput ) return zoneInputs;
			if ( node.type === repeatType ) {

				let state = { geometry: inputs.geometry, value: inputs.value };
				const count = Math.round( inputs.count );
				for ( let iteration = 0; iteration < count; iteration ++ ) {

					state = run( step.body, { ...state, iteration } );

				}
				return state;

			}
			if ( node.type === simulationType ) {

				if ( ! simulation ) return inputs;
				const key = stage + '/' + node.id;
				const previous = simulation.previous.get( key );
				const state = run( step.body, {
					geometry: previous ? copy( previous.geometry ) : inputs.geometry,
					value: previous?.value ?? inputs.value,
					delta: simulation.delta, time: simulation.time, frame: simulation.frame
				} );
				// Keep the carried state separate from the render buffer and any
				// editing or downstream modifier passes.
				const snapshot = copy( state.geometry );
				buffers.delete( snapshot );
				simulation.next.set( key, { geometry: snapshot, value: state.value } );
				return state;

			}
			return operations.get( node.type )( inputs );

		}, ( value, socket ) => {

			if ( socket.type !== 'field' ) validateSocketValue( value, socket );
			else if ( typeof value !== 'function' ) throw new Error( socket.label + ' needs a geometry field.' );

		} );

	}
	try {

		const output = run( plan );
		result = output?.geometry ?? source;
		return result;

	} finally {

		for ( const buffer of buffers ) if ( buffer !== result ) buffer.dispose();

	}

}
