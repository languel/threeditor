import { compileExpression, expressionInput } from './MathExpression.js';

export const numberInput = ( label, value = 0, min = - 1e6, max = 1e6 ) => ( { label, type: 'number', default: value, min, max } );
const numberOutput = { value: { label: 'Value', type: 'number' } };
const xyz = { x: numberInput( 'X' ), y: numberInput( 'Y' ), z: numberInput( 'Z' ) };
const vector = label => ( { label, type: 'vec3' } );
const vectorOutput = { vector: vector( 'Vector' ) };
const vectorXY = { a: vector( 'A' ), b: vector( 'B' ) };
const channels = Object.keys( xyz );

const clamp = ( v, lo, hi ) => Math.min( Math.max( v, lo ), hi );
const fract = v => v - Math.floor( v );
const mix = ( a, b, t ) => a * ( 1 - t ) + b * t;
const remap = ( v, a, b, c, d ) => a === b ? c : mix( c, d, clamp( ( v - a ) / ( b - a ), 0, 1 ) );
const f = ( tsl, name ) => ( ...values ) => tsl[ name ]( ...values );
const numeric = [
	[ 'add', 'Add', [ 0, 0 ], ( a, b ) => a + b, 'add' ],
	[ 'subtract', 'Subtract', [ 0, 0 ], ( a, b ) => a - b, 'sub' ],
	[ 'multiply', 'Multiply', [ 1, 1 ], ( a, b ) => a * b, 'mul' ],
	[ 'divide', 'Divide', [ 1, 1 ], ( a, b ) => b === 0 ? 0 : a / b, tsl => ( a, b ) => tsl.float( b ).notEqual( 0 ).select( tsl.div( a, b ), 0 ) ],
	[ 'modulo', 'Modulo', [ 0, 1 ], ( a, b ) => b === 0 ? 0 : a - b * Math.floor( a / b ), tsl => ( a, b ) => tsl.float( b ).notEqual( 0 ).select( tsl.mod( a, b ), 0 ) ],
	[ 'power', 'Power', [ 1, 2 ], Math.pow, 'pow' ],
	[ 'sqrt', 'Square Root', [ 1 ], v => Math.sqrt( Math.max( 0, v ) ), tsl => v => tsl.sqrt( tsl.max( 0, v ) ) ],
	[ 'abs', 'Absolute', [ 0 ], Math.abs, 'abs' ],
	[ 'sign', 'Sign', [ 0 ], Math.sign, 'sign' ],
	[ 'min', 'Minimum', [ 0, 1 ], Math.min, 'min' ],
	[ 'max', 'Maximum', [ 0, 1 ], Math.max, 'max' ],
	[ 'floor', 'Floor', [ 0 ], Math.floor, 'floor' ],
	[ 'ceil', 'Ceiling', [ 0 ], Math.ceil, 'ceil' ],
	[ 'round', 'Round', [ 0 ], v => Math.floor( v + .5 ), tsl => v => tsl.floor( tsl.add( v, .5 ) ) ],
	[ 'fract', 'Fraction', [ 0 ], fract, 'fract' ],
	[ 'sin', 'Sine', [ 0 ], Math.sin, 'sin' ],
	[ 'cos', 'Cosine', [ 0 ], Math.cos, 'cos' ],
	[ 'tan', 'Tangent', [ 0 ], Math.tan, 'tan' ],
	[ 'atan2', 'Arctangent 2', [ 0, 1 ], Math.atan2, 'atan' ],
	[ 'radians', 'To Radians', [ 0 ], v => v * Math.PI / 180, 'radians' ],
	[ 'degrees', 'To Degrees', [ 0 ], v => v * 180 / Math.PI, 'degrees' ],
	[ 'exp', 'Exponent', [ 0 ], Math.exp, 'exp' ],
	[ 'log', 'Natural Logarithm', [ 1 ], v => v > 0 ? Math.log( v ) : 0, tsl => v => tsl.float( v ).greaterThan( 0 ).select( tsl.log( v ), 0 ) ],
	[ 'less', 'Less Than (Number)', [ 0, 0 ], ( a, b ) => Number( a < b ), tsl => ( a, b ) => tsl.float( a ).lessThan( b ).select( 1, 0 ) ],
	[ 'greater', 'Greater Than (Number)', [ 0, 0 ], ( a, b ) => Number( a > b ), tsl => ( a, b ) => tsl.float( a ).greaterThan( b ).select( 1, 0 ) ],
	[ 'clamp', 'Clamp', [ 0, 0, 1 ], clamp, 'clamp', [ 'Value', 'Min', 'Max' ] ],
	[ 'mix', 'Mix Number', [ 0, 1, .5 ], mix, 'mix', [ 'A', 'B', 'Factor' ] ],
	[ 'smoothstep', 'Smooth Step', [ 0, 1, .5 ], ( a, b, v ) => {

		const t = remap( v, a, b, 0, 1 );
		return t * t * ( 3 - 2 * t );

	}, 'smoothstep', [ 'Edge 1', 'Edge 2', 'Value' ] ],
	[ 'maprange', 'Map Range', [ 0, 0, 1, 0, 1 ], remap, tsl => ( v, a, b, c, d ) => tsl.float( a ).equal( b ).select( c, tsl.remapClamp( v, a, b, c, d ) ),
		[ 'Value', 'From Min', 'From Max', 'To Min', 'To Max' ] ]
];
const keys = [ 'a', 'b', 'c', 'd', 'e' ];
const values = ( defaults, labels ) => Object.fromEntries( defaults.map( ( value, i ) => [
	keys[ i ], numberInput( labels?.[ i ] ?? ( defaults.length === 1 ? 'Value' : keys[ i ].toUpperCase() ), value )
] ) );

const vectorMath = [
	[ 'add', 'Add Vectors', vectorXY, ( a, b ) => a.map( ( v, i ) => v + b[ i ] ), 'add' ],
	[ 'subtract', 'Subtract Vectors', vectorXY, ( a, b ) => a.map( ( v, i ) => v - b[ i ] ), 'sub' ],
	[ 'multiply', 'Multiply Vectors', vectorXY, ( a, b ) => a.map( ( v, i ) => v * b[ i ] ), 'mul' ],
	[ 'dot', 'Dot Product', vectorXY, ( a, b ) => a.reduce( ( sum, v, i ) => sum + v * b[ i ], 0 ), 'dot', numberOutput ],
	[ 'cross', 'Cross Product', vectorXY, ( a, b ) => [ a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ], a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ], a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] ], 'cross' ],
	[ 'distance', 'Distance', vectorXY, ( a, b ) => Math.hypot( ...a.map( ( v, i ) => v - b[ i ] ) ), 'distance', numberOutput ],
	[ 'length', 'Length', { vector: vector( 'Vector' ) }, a => Math.hypot( ...a ), 'length', numberOutput ],
	[ 'normalize', 'Normalize', { vector: vector( 'Vector' ) }, a => { const length = Math.hypot( ...a ) || 1; return a.map( v => v / length ); }, 'normalize' ],
	[ 'scale', 'Scale Vector', { vector: vector( 'Vector' ), scale: numberInput( 'Scale', 1 ) }, ( a, b ) => a.map( v => v * b ), 'mul' ]
];
export const mathExpressionInput = { ...expressionInput, validate: source => compileExpression( source, expressionMath() ) };

export const VALUE_NODES = [
	[ 'value.number', { label: 'Number', category: 'Values', inputs: { value: numberInput( 'Value' ) }, outputs: numberOutput } ],
	...numeric.map( ( [ id, label, defaults, , , labels ] ) => [ 'math.' + id, { label, category: 'Math', inputs: values( defaults, labels ), outputs: numberOutput } ] ),
	[ 'math.expression', { label: 'Math Expression', category: 'Math', inputs: { expression: mathExpressionInput, ...xyz }, outputs: numberOutput } ],
	[ 'vector.combine', { label: 'Combine XYZ', category: 'Vector Math', inputs: xyz, outputs: vectorOutput } ],
	[ 'vector.separate', { label: 'Separate XYZ', category: 'Vector Math', inputs: { vector: vector( 'Vector' ) },
		outputs: Object.fromEntries( channels.map( key => [ key, { label: key.toUpperCase(), type: 'number' } ] ) ) } ],
	...vectorMath.map( ( [ id, label, inputs, , , outputs ] ) => [ 'vector.' + id, { label, category: 'Vector Math', inputs, outputs: outputs || vectorOutput } ] )
];

export function expressionMath( tsl ) {

	return new Map( numeric.map( ( [ id, , defaults, cpu, gpu ] ) => [ id, {
		arity: defaults.length, run: ! tsl ? cpu : typeof gpu === 'string' ? f( tsl, gpu ) : gpu( tsl )
	} ] ) );

}

function operations( tsl ) {

	const math = expressionMath( tsl );
	const operators = new Map( [
		[ 'value.number', ( { value } ) => ( { value: tsl ? tsl.float( value ) : value } ) ],
		[ 'math.expression', ( { expression, ...inputs } ) => {

			const value = compileExpression( expression, math )( inputs );
			return { value: tsl ? tsl.float( value ) : value };

		} ],
		[ 'vector.combine', ( { x, y, z } ) => ( { vector: tsl ? tsl.vec3( x, y, z ) : [ x, y, z ] } ) ],
		[ 'vector.separate', ( { vector } ) => Object.fromEntries( channels.map( ( key, i ) => [ key, tsl ? vector[ key ] : vector[ i ] ] ) ) ]
	] );
	for ( const [ name, operation ] of math ) operators.set( 'math.' + name, inputs => ( { value: operation.run( ...Object.values( inputs ) ) } ) );
	for ( const [ name, , , cpu, gpu, outputs ] of vectorMath ) {

		const run = tsl ? f( tsl, gpu ) : cpu;
		operators.set( 'vector.' + name, inputs => ( { [ outputs ? 'value' : 'vector' ]: run( ...Object.values( inputs ) ) } ) );

	}
	return operators;

}

export const VALUE_OPERATIONS = operations();
export const shaderValueOperations = operations;
