import { addNode, connectNodes, createGraph, dataflowOrder, evaluateDataflow, planDataflow } from './NodeGraph.js';
import { numberInput, shaderValueOperations, VALUE_NODES } from './ValueNodes.js';
import { attributeInput, validAttributeName } from './GeometryFields.js';

const outputType = 'shader.output';
const socket = ( label, type, optional = false ) => ( { label, type, optional } );
const colorInput = ( label, value = '#ffffff' ) => ( { label, type: 'color', default: value } );
const numeric = { value: socket( 'Value', 'number' ) };
const coordinate = { uv: socket( 'UV', 'vec2' ) };
const inputUV = socket( 'UV', 'vec2', true );
const inputVector = socket( 'Vector', 'vec3', true );
const color = { color: socket( 'Color', 'color' ) };
const vector = { vector: socket( 'Vector', 'vec3' ) };
const xyz = { x: numberInput( 'X' ), y: numberInput( 'Y' ), z: numberInput( 'Z' ) };
const factors = { a: numberInput( 'A' ), b: numberInput( 'B', 1 ), factor: numberInput( 'Factor', .5, 0, 1 ) };
const numberNode = ( label, inputs ) => ( { label, category: 'Math', inputs, outputs: numeric, hidden: true } );
const patternNode = ( label, scale ) => ( {
	label, category: 'Patterns', inputs: { uv: inputUV, scale: numberInput( 'Scale', scale, 0, 1e4 ) }, outputs: numeric
} );
const choices = ( label, options ) => ( { label, type: 'string', default: options[ 0 ], options } );

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
		[ 'shader.vector', { label: 'Combine XYZ', category: 'Vector', inputs: xyz, outputs: vector, hidden: true } ],
		[ 'shader.separate', {
			label: 'Separate XYZ', category: 'Vector', inputs: { vector: socket( 'Vector', 'vec3' ) }, hidden: true,
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
		[ 'shader.voronoi', patternNode( 'Voronoi Texture', 5 ) ],
		[ 'shader.whiteNoise', patternNode( 'White Noise Texture', 1 ) ],
		[ 'shader.fractalNoise', patternNode( 'Fractal Noise', 5 ) ],
		[ 'shader.wave', {
			label: 'Wave Texture', category: 'Patterns',
			inputs: {
				uv: inputUV, axis: choices( 'Shape', [ 'X Bands', 'Y Bands', 'Rings' ] ), scale: numberInput( 'Scale', 5, 0, 1e4 ),
				phase: numberInput( 'Phase' ), distortion: numberInput( 'Distortion', 0, 0, 100 )
			}, outputs: numeric
		} ],
		[ 'shader.gradient', {
			label: 'Gradient Texture', category: 'Patterns', inputs: { vector: inputVector, mode: choices( 'Type', [ 'Linear', 'Easing', 'Diagonal', 'Radial', 'Spherical' ] ) },
			outputs: { ...numeric, ...color }
		} ],
		[ 'shader.baseMap', { label: 'Base Color Texture', category: 'Textures', inputs: { uv: inputUV }, outputs: color } ],
		[ 'shader.attribute', {
			label: 'Named Attribute', category: 'Coordinates',
			inputs: { ...attributeInput, fallback: numberInput( 'Fallback' ) }, outputs: numeric
		} ],
		[ 'shader.mixColor', {
			label: 'Mix Color', category: 'Color', outputs: color,
			inputs: { a: colorInput( 'A', '#2856a0' ), b: colorInput( 'B', '#f9bc55' ), factor: factors.factor }
		} ],
		[ 'shader.tint', {
			label: 'Multiply Color', category: 'Color', outputs: color,
			inputs: { a: colorInput( 'A' ), b: colorInput( 'B' ) }
		} ],
		[ 'shader.colorRamp', {
			label: 'Color Ramp', category: 'Color', outputs: color,
			inputs: {
				factor: factors.factor, a: colorInput( 'Color A', '#000000' ), b: colorInput( 'Color B' ),
				start: numberInput( 'Start', 0, 0, 1 ), end: numberInput( 'End', 1, 0, 1 ),
				mode: choices( 'Interpolation', [ 'Linear', 'Ease', 'Constant' ] )
			}
		} ],
		[ 'shader.invert', { label: 'Invert Color', category: 'Color', inputs: { color: colorInput( 'Color' ), factor: factors.factor }, outputs: color } ],
		[ 'shader.luminance', { label: 'RGB to Luminance', category: 'Color', inputs: { color: colorInput( 'Color' ) }, outputs: numeric } ],
		[ 'shader.hsv', {
			label: 'Hue, Saturation, Value', category: 'Color', outputs: color,
			inputs: { color: colorInput( 'Color' ), hue: numberInput( 'Hue Shift' ), saturation: numberInput( 'Saturation', 1 ), value: numberInput( 'Value', 1 ) }
		} ],
		[ 'shader.gamma', { label: 'Gamma', category: 'Color', inputs: { color: colorInput( 'Color' ), gamma: numberInput( 'Gamma', 1, .01, 10 ) }, outputs: color } ],
		[ 'shader.fresnel', {
			label: 'Fresnel', category: 'Surface', inputs: { normal: socket( 'Normal', 'vec3', true ), ior: numberInput( 'IOR', 1.45, 1, 20 ) }, outputs: numeric
		} ],
		[ 'shader.facing', {
			label: 'Layer Facing', category: 'Surface', inputs: { normal: socket( 'Normal', 'vec3', true ), power: numberInput( 'Power', 1, .01, 40 ) },
			outputs: numeric
		} ],
		[ 'shader.bump', {
			label: 'Bump', category: 'Surface', inputs: { height: numberInput( 'Height' ), strength: numberInput( 'Strength', 1, 0, 100 ) }, outputs: vector
		} ],
		[ 'shader.normalMap', {
			label: 'Normal Map', category: 'Surface', inputs: { uv: inputUV, strength: numberInput( 'Strength', 1, 0, 100 ) }, outputs: vector
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
	if ( plan.missing ) return { properties: {}, animated: false, missing: plan.missing };
	const asColor = value => typeof value === 'string' ? tsl.color( value ) : value;
	const uv = value => value ?? tsl.uv();
	const facing = normal => tsl.dot( normal ?? tsl.normalViewGeometry, tsl.positionViewDirection ).abs().clamp( 0, 1 );
	const operations = new Map( [
		...shaderValueOperations( tsl ),
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
		[ 'shader.voronoi', values => ( { value: tsl.mx_worley_noise_float_2d( uv( values.uv ).mul( values.scale ) ) } ) ],
		[ 'shader.whiteNoise', values => ( { value: tsl.mx_cell_noise_float( uv( values.uv ).mul( values.scale ) ) } ) ],
		[ 'shader.fractalNoise', values => ( { value: tsl.mx_fractal_noise_float_2d( uv( values.uv ).mul( values.scale ), 4 ).mul( .5 ).add( .5 ).clamp( 0, 1 ) } ) ],
		[ 'shader.wave', ( { uv: input, axis, scale, phase, distortion } ) => {

			const coords = uv( input );
			const value = axis === 'Rings' ? coords.sub( .5 ).length() : axis === 'Y Bands' ? coords.y : coords.x;
			const angle = value.mul( scale ).mul( Math.PI * 2 ).add( phase ).add( tsl.mx_noise_float( coords.mul( scale ) ).mul( distortion ) );
			return { value: tsl.sin( angle ).mul( .5 ).add( .5 ) };

		} ],
		[ 'shader.gradient', ( { vector, mode } ) => {

			const p = vector ?? tsl.positionLocal;
			let value = p.x;
			if ( mode === 'Easing' ) value = tsl.smoothstep( 0, 1, p.x );
			else if ( mode === 'Diagonal' ) value = p.x.add( p.y ).mul( .5 );
			else if ( mode === 'Radial' ) value = tsl.atan( p.y, p.x ).div( Math.PI * 2 ).add( .5 );
			else if ( mode === 'Spherical' ) value = p.length().oneMinus();
			value = value.clamp( 0, 1 );
			return { value, color: tsl.vec3( value ) };

		} ],
		[ 'shader.baseMap', values => ( { color: material.map ? tsl.texture( material.map, uv( values.uv ) ).rgb : tsl.color( 0xffffff ) } ) ],
		[ 'shader.attribute', ( { name, fallback } ) => {

			if ( ! validAttributeName( name ) ) throw new Error( 'Use letters, digits, and underscores for an attribute name.' );
			return { value: tsl.Fn( ( _, builder ) => builder.hasGeometryAttribute( name ) &&
				builder.geometry.getAttribute( name ).itemSize === 1 ? tsl.attribute( name, 'float' ) : tsl.float( fallback ) )() };

		} ],
		[ 'shader.mixColor', ( { a, b, factor } ) => ( { color: tsl.mix( asColor( a ), asColor( b ), factor ) } ) ],
		[ 'shader.tint', ( { a, b } ) => ( { color: tsl.mul( asColor( a ), asColor( b ) ) } ) ],
		[ 'shader.colorRamp', ( { factor, a, b, start, end, mode } ) => {

			const span = tsl.sub( end, start );
			let t = tsl.float( span ).equal( 0 ).select( tsl.step( start, factor ), tsl.sub( factor, start ).div( span ).clamp( 0, 1 ) );
			if ( mode === 'Ease' ) t = tsl.smoothstep( 0, 1, t );
			else if ( mode === 'Constant' ) t = tsl.step( 1, t );
			return { color: tsl.mix( asColor( a ), asColor( b ), t ) };

		} ],
		[ 'shader.invert', ( { color, factor } ) => { const base = asColor( color ); return { color: tsl.mix( base, base.oneMinus(), factor ) }; } ],
		[ 'shader.luminance', ( { color } ) => ( { value: tsl.luminance( asColor( color ) ) } ) ],
		[ 'shader.hsv', ( { color, hue, saturation, value } ) => ( { color: tsl.saturation( tsl.hue( asColor( color ), tsl.mul( hue, Math.PI * 2 ) ), saturation ).mul( value ) } ) ],
		[ 'shader.gamma', ( { color, gamma } ) => ( { color: tsl.pow( asColor( color ).max( 0 ), gamma ) } ) ],
		[ 'shader.fresnel', ( { normal, ior } ) => {

			const ratio = tsl.sub( ior, 1 ).div( tsl.add( ior, 1 ) );
			const reflectance = ratio.mul( ratio );
			return { value: tsl.mix( reflectance, 1, facing( normal ).oneMinus().pow( 5 ) ) };

		} ],
		[ 'shader.facing', ( { normal, power } ) => ( { value: facing( normal ).pow( power ) } ) ],
		[ 'shader.bump', ( { height, strength } ) => ( { vector: tsl.bumpMap( tsl.float( height ), tsl.float( strength ) ) } ) ],
		[ 'shader.normalMap', ( { uv: input, strength } ) => ( { vector: material.normalMap ?
			tsl.normalMap( tsl.texture( material.normalMap, uv( input ) ), tsl.vec2( strength ) ) : tsl.normalViewGeometry } ) ],
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
