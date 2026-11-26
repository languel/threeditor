import { addNode, connectNodes, createGraph, dataflowOrder, evaluateDataflow, planDataflow } from './NodeGraph.js';
import { numberInput, VALUE_NODES } from './ValueNodes.js';

const outputType = 'shader.output';
const socket = ( label, type, optional = false ) => ( { label, type, optional } );
const colorInput = ( label, value = '#ffffff' ) => ( { label, type: 'color', default: value } );
const numeric = { value: socket( 'Value', 'number' ) };
const coordinate = { uv: socket( 'UV', 'vec2' ) };
const inputUV = socket( 'UV', 'vec2', true );
const color = { color: socket( 'Color', 'color' ) };
const vector = { vector: socket( 'Vector', 'vec3' ) };
const xyz = { x: numberInput( 'X' ), y: numberInput( 'Y' ), z: numberInput( 'Z' ) };
const factors = { a: numberInput( 'A' ), b: numberInput( 'B', 1 ), factor: numberInput( 'Factor', .5, 0, 1 ) };
const numberNode = ( label, inputs ) => ( { label, category: 'Math', inputs, outputs: numeric } );
const patternNode = ( label, scale ) => ( {
	label, category: 'Patterns', inputs: { uv: inputUV, scale: numberInput( 'Scale', scale, 0, 1e4 ) }, outputs: numeric
} );

export const SHADER_DOMAIN = {
	id: 'shader',
	label: 'Shader Graph',
	validateLinks: dataflowOrder,
	nodes: new Map( [
		[ outputType, {
			label: 'Material Output', fixed: true,
			inputs: {
				color: socket( 'Base Color', 'color', true ),
				roughness: socket( 'Roughness', 'number', true ),
				metalness: socket( 'Metalness', 'number', true ),
				emissive: socket( 'Emission', 'color', true ),
				emissionStrength: socket( 'Emission Strength', 'number', true ),
				opacity: socket( 'Opacity', 'number', true ),
				normal: socket( 'Normal', 'vec3', true ),
				position: socket( 'Position', 'vec3', true )
			}
		} ],
		...VALUE_NODES,
		[ 'shader.color', { label: 'Color', category: 'Values', inputs: { color: colorInput( 'Color' ) }, outputs: color } ],
		[ 'shader.vector', { label: 'Combine XYZ', category: 'Vector', inputs: xyz, outputs: vector } ],
		[ 'shader.separate', {
			label: 'Separate XYZ', category: 'Vector', inputs: { vector: socket( 'Vector', 'vec3' ) },
			outputs: { x: socket( 'X', 'number' ), y: socket( 'Y', 'number' ), z: socket( 'Z', 'number' ) }
		} ],
		[ 'shader.uv', { label: 'UV', category: 'Coordinates', outputs: coordinate } ],
		[ 'shader.uvTransform', {
			label: 'Transform UV', category: 'Coordinates', outputs: coordinate,
			inputs: {
				uv: inputUV, scaleX: numberInput( 'Scale X', 1 ), scaleY: numberInput( 'Scale Y', 1 ),
				offsetX: numberInput( 'Offset X' ), offsetY: numberInput( 'Offset Y' )
			}
		} ],
		[ 'shader.uvSeparate', {
			label: 'Separate UV', category: 'Coordinates', inputs: { uv: inputUV },
			outputs: { u: socket( 'U', 'number' ), v: socket( 'V', 'number' ) }
		} ],
		[ 'shader.position', { label: 'Local Position', category: 'Coordinates', outputs: vector } ],
		[ 'shader.worldPosition', { label: 'World Position', category: 'Coordinates', outputs: vector } ],
		[ 'shader.viewNormal', { label: 'View Normal', category: 'Coordinates', outputs: vector } ],
		[ 'shader.time', { label: 'Time', category: 'Coordinates', outputs: { value: socket( 'Seconds', 'number' ) } } ],
		[ 'shader.checker', patternNode( 'Checker', 6 ) ],
		[ 'shader.noise', patternNode( 'Perlin Noise', 5 ) ],
		[ 'shader.baseMap', { label: 'Base Color Texture', category: 'Textures', inputs: { uv: inputUV }, outputs: color } ],
		[ 'shader.mixColor', {
			label: 'Mix Color', category: 'Color', outputs: color,
			inputs: { a: colorInput( 'A', '#2856a0' ), b: colorInput( 'B', '#f9bc55' ), factor: factors.factor }
		} ],
		[ 'shader.tint', {
			label: 'Multiply Color', category: 'Color', outputs: color,
			inputs: { a: colorInput( 'A' ), b: colorInput( 'B' ) }
		} ],
		[ 'shader.grayscale', { label: 'Grayscale', category: 'Color', inputs: { value: numberInput( 'Value', .5 ) }, outputs: color } ],
		[ 'shader.mixNumber', numberNode( 'Mix Number', factors ) ],
		[ 'shader.subtract', numberNode( 'Subtract', { a: numberInput( 'A' ), b: numberInput( 'B' ) } ) ],
		[ 'shader.sine', numberNode( 'Sine', { value: numberInput( 'Radians' ) } ) ],
		[ 'shader.fraction', numberNode( 'Fraction', { value: numberInput( 'Value' ) } ) ],
		[ 'shader.displace', {
			label: 'Displace Along Normal', category: 'Vector', outputs: vector,
			inputs: { height: numberInput( 'Height' ) }
		} ]
	] )
};

export function createShaderGraph( hex = '#ffffff' ) {

	const graph = createGraph( SHADER_DOMAIN );
	const source = addNode( graph, 'shader.color', 24, 32 );
	source.values.color = hex;
	const output = addNode( graph, outputType, 268, 32 );
	connectNodes( graph, SHADER_DOMAIN, { node: source.id, socket: 'color' }, { node: output.id, socket: 'color' } );
	return graph;

}

export function compileShaderGraph( tsl, graph, material ) {

	const outputs = Array.isArray( graph?.nodes ) ? graph.nodes.filter( node => node?.type === outputType ) : [];
	if ( outputs.length !== 1 ) throw new Error( 'A shader graph needs one Material Output.' );
	const plan = planDataflow( graph, SHADER_DOMAIN, outputs[ 0 ].id );
	if ( plan.missing ) throw new Error( plan.missing );
	const asColor = value => typeof value === 'string' ? tsl.color( value ) : value;
	const uv = value => value ?? tsl.uv();
	const operations = new Map( [
		[ 'value.number', ( { value } ) => ( { value: tsl.float( value ) } ) ],
		[ 'math.add', ( { a, b } ) => ( { value: tsl.add( a, b ) } ) ],
		[ 'math.multiply', ( { a, b } ) => ( { value: tsl.mul( a, b ) } ) ],
		[ 'shader.color', ( { color } ) => ( { color: asColor( color ) } ) ],
		[ 'shader.vector', ( { x, y, z } ) => ( { vector: tsl.vec3( x, y, z ) } ) ],
		[ 'shader.separate', ( { vector } ) => ( { x: vector.x, y: vector.y, z: vector.z } ) ],
		[ 'shader.uv', () => ( { uv: tsl.uv() } ) ],
		[ 'shader.uvTransform', values => ( { uv: uv( values.uv ).mul( tsl.vec2( values.scaleX, values.scaleY ) ).add( tsl.vec2( values.offsetX, values.offsetY ) ) } ) ],
		[ 'shader.uvSeparate', values => ( { u: uv( values.uv ).x, v: uv( values.uv ).y } ) ],
		[ 'shader.position', () => ( { vector: tsl.positionLocal } ) ],
		[ 'shader.worldPosition', () => ( { vector: tsl.positionWorld } ) ],
		[ 'shader.viewNormal', () => ( { vector: tsl.normalViewGeometry } ) ],
		[ 'shader.time', () => ( { value: tsl.time } ) ],
		[ 'shader.checker', values => ( { value: tsl.checker( uv( values.uv ).mul( values.scale ) ) } ) ],
		[ 'shader.noise', values => ( { value: tsl.mx_noise_float( uv( values.uv ).mul( values.scale ), .5, .5 ).clamp( 0, 1 ) } ) ],
		[ 'shader.baseMap', values => ( { color: material.map ? tsl.texture( material.map, uv( values.uv ) ).rgb : tsl.color( 0xffffff ) } ) ],
		[ 'shader.mixColor', ( { a, b, factor } ) => ( { color: tsl.mix( asColor( a ), asColor( b ), factor ) } ) ],
		[ 'shader.tint', ( { a, b } ) => ( { color: tsl.mul( asColor( a ), asColor( b ) ) } ) ],
		[ 'shader.grayscale', ( { value } ) => ( { color: tsl.vec3( value ) } ) ],
		[ 'shader.mixNumber', ( { a, b, factor } ) => ( { value: tsl.mix( a, b, factor ) } ) ],
		[ 'shader.subtract', ( { a, b } ) => ( { value: tsl.sub( a, b ) } ) ],
		[ 'shader.sine', ( { value } ) => ( { value: tsl.sin( value ) } ) ],
		[ 'shader.fraction', ( { value } ) => ( { value: tsl.fract( value ) } ) ],
		[ 'shader.displace', ( { height } ) => ( { vector: tsl.positionLocal.add( tsl.normalLocal.mul( height ) ) } ) ]
	] );
	const result = evaluateDataflow( plan, ( node, inputs ) => operations.get( node.type )( inputs ), ( value, spec ) => {

		if ( ! value.isNode ) throw new Error( spec.label + ' needs a shader expression.' );

	} );
	const nodes = {
		colorNode: result.color, roughnessNode: result.roughness?.clamp( 0, 1 ), metalnessNode: result.metalness?.clamp( 0, 1 ),
		emissiveNode: result.emissive ?? ( result.emissionStrength ? tsl.materialEmissive : undefined ),
		opacityNode: result.opacity?.clamp( 0, 1 ), normalNode: result.normal, positionNode: result.position
	};
	if ( result.emissionStrength ) nodes.emissiveNode = nodes.emissiveNode.mul( result.emissionStrength.max( 0 ) );
	return {
		properties: Object.fromEntries( Object.entries( nodes ).filter( ( [ , value ] ) => value !== undefined ) ),
		animated: plan.steps.some( ( { node } ) => node.type === 'shader.time' )
	};

}
