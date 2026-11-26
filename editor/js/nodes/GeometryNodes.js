import { addNode, connectNodes, createGraph, dataflowOrder, evaluateDataflow, planDataflow } from './NodeGraph.js';
import { numberInput, VALUE_NODES, VALUE_OPERATIONS } from './ValueNodes.js';

export const GEOMETRY_MODIFIER = 'GEOMETRY_NODES';
const sourceType = 'geometry.input';
const outputType = 'geometry.output';
const geometry = { geometry: { label: 'Geometry', type: 'geometry' } };
const size = label => numberInput( label, 1, .0001, 1e6 );

export const GEOMETRY_DOMAIN = {
	id: 'geometry',
	label: 'Geometry Nodes',
	validateLinks: dataflowOrder,
	nodes: new Map( [
		[ sourceType, { label: 'Mesh Input', category: 'Geometry', fixed: true, outputs: geometry } ],
		[ outputType, { label: 'Mesh Output', category: 'Geometry', fixed: true, inputs: geometry } ],
		[ 'geometry.box', {
			label: 'Box', category: 'Primitives', outputs: geometry,
			inputs: { width: size( 'Width' ), height: size( 'Height' ), depth: size( 'Depth' ) }
		} ],
		[ 'geometry.sphere', {
			label: 'Sphere', category: 'Primitives', outputs: geometry,
			inputs: { radius: size( 'Radius' ), segments: numberInput( 'Segments', 24, 3, 128 ), rings: numberInput( 'Rings', 16, 2, 128 ) }
		} ],
		[ 'geometry.transform', {
			label: 'Transform Geometry', category: 'Geometry', outputs: geometry,
			inputs: {
				...geometry, x: numberInput( 'Translate X' ), y: numberInput( 'Translate Y' ), z: numberInput( 'Translate Z' ),
				rotationX: numberInput( 'Rotate X (°)' ), rotationY: numberInput( 'Rotate Y (°)' ), rotationZ: numberInput( 'Rotate Z (°)' ),
				scale: size( 'Scale' )
			}
		} ],
		...VALUE_NODES
	] )
};

export function createGeometryGraph() {

	const graph = createGraph( GEOMETRY_DOMAIN );
	const input = addNode( graph, sourceType, 24, 32 );
	const output = addNode( graph, outputType, 268, 32 );
	connectNodes( graph, GEOMETRY_DOMAIN, { node: input.id, socket: 'geometry' }, { node: output.id, socket: 'geometry' } );
	return graph;

}

export function planGeometryGraph( graph ) {

	const outputs = Array.isArray( graph?.nodes ) ? graph.nodes.filter( node => node?.type === outputType ) : [];
	if ( outputs?.length !== 1 ) throw new Error( 'A geometry graph needs one Mesh Output.' );
	return planDataflow( graph, GEOMETRY_DOMAIN, outputs[ 0 ].id );

}

// A node owns new buffers and borrows its inputs. Transfer the final buffer to
// the caller and release the other buffers even when an operation fails.
export function evaluateGeometryGraph( THREE, graph, source ) {

	const plan = planGeometryGraph( graph );
	const buffers = new Set();
	let result = source;
	let vertices = 0;
	function own( buffer ) {

		buffers.add( buffer );
		vertices += buffer.attributes.position.count;
		if ( vertices > 4e6 ) throw new Error( 'Geometry Nodes exceeds its evaluation budget of four million vertices.' );
		return buffer;

	}
	function primitive( buffer ) {

		try {

			// Store evaluated attributes so project JSON also retains the groups.
			const output = own( new THREE.BufferGeometry().copy( buffer ) );
			output.clearGroups();
			output.addGroup( 0, output.index.count, 0 );
			return { geometry: output };

		} finally {

			buffer.dispose();

		}

	}
	const operations = new Map( [
		...VALUE_OPERATIONS,
		[ sourceType, () => ( { geometry: source } ) ],
		[ 'geometry.box', ( { width, height, depth } ) => primitive( new THREE.BoxGeometry( width, height, depth ) ) ],
		[ 'geometry.sphere', ( { radius, segments, rings } ) => primitive( new THREE.SphereGeometry( radius, Math.round( segments ), Math.round( rings ) ) ) ],
		[ 'geometry.transform', ( inputs ) => {

			const { x, y, z, rotationX, rotationY, rotationZ, scale } = inputs;
			const rotation = new THREE.Euler( rotationX * Math.PI / 180, rotationY * Math.PI / 180, rotationZ * Math.PI / 180 );
			const matrix = new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ),
				new THREE.Quaternion().setFromEuler( rotation ), new THREE.Vector3( scale, scale, scale ) );
			const transformed = own( new THREE.BufferGeometry().copy( inputs.geometry ) );
			transformed.userData = structuredClone( inputs.geometry.userData );
			transformed.applyMatrix4( matrix );
			transformed.computeBoundingBox();
			if ( [ ...transformed.boundingBox.min, ...transformed.boundingBox.max ].some( v => ! Number.isFinite( v ) ) &&
				transformed.attributes.position.count ) throw new Error( 'Transform Geometry produced positions outside the supported range.' );
			return { geometry: transformed };

		} ]
	] );
	try {

		const output = evaluateDataflow( plan, ( node, inputs ) => operations.get( node.type )( inputs ) );
		result = output?.geometry ?? source;
		return result;

	} finally {

		for ( const buffer of buffers ) if ( buffer !== result ) buffer.dispose();

	}

}
