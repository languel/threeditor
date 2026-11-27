import { expressionMath, mathExpressionInput, numberInput } from './ValueNodes.js';
import { compileExpression } from './MathExpression.js';

export const fieldInput = ( label, value = 0 ) => ( { label, type: 'field', default: value } );
const fieldSocket = label => ( { label, type: 'field' } );
const fieldOutput = { value: fieldSocket( 'Field' ) };
const axes = { x: fieldSocket( 'X' ), y: fieldSocket( 'Y' ), z: fieldSocket( 'Z' ) };
const binary = { a: fieldInput( 'A' ), b: fieldInput( 'B' ) };
export const attributeInput = { name: { label: 'Name', type: 'string', default: 'weight', maxLength: 64 } };
const field = ( label, inputs, outputs = fieldOutput ) => ( { label, category: 'Fields', inputs, outputs } );

export const FIELD_NODES = [
	[ 'field.constant', field( 'Constant Field', { value: numberInput( 'Value' ) } ) ],
	[ 'field.position', field( 'Position', {}, axes ) ],
	[ 'field.normal', field( 'Normal', {}, axes ) ],
	[ 'field.index', field( 'Index', {}, { index: fieldSocket( 'Index' ), fraction: fieldSocket( 'Normalized Index' ) } ) ],
	[ 'field.attribute', field( 'Read Named Attribute', { ...attributeInput, fallback: numberInput( 'Fallback' ) } ) ],
	[ 'field.random', field( 'Random Field', {
		seed: numberInput( 'Seed', 0, 0, 0xffffffff ), min: numberInput( 'Min' ), max: numberInput( 'Max', 1 )
	} ) ],
	[ 'field.add', field( 'Add Fields', binary ) ],
	[ 'field.multiply', field( 'Multiply Fields', { ...binary, b: fieldInput( 'B', 1 ) } ) ],
	[ 'field.sine', field( 'Sine Field', { value: fieldInput( 'Radians' ) } ) ],
	[ 'field.maprange', field( 'Map Range Field', {
		value: fieldInput( 'Value' ), a: fieldInput( 'From Min' ), b: fieldInput( 'From Max', 1 ), c: fieldInput( 'To Min' ), d: fieldInput( 'To Max', 1 )
	} ) ],
	[ 'field.expression', field( 'Math Expression Field', { expression: mathExpressionInput, x: fieldInput( 'X' ), y: fieldInput( 'Y' ), z: fieldInput( 'Z' ) } ) ],
	[ 'field.compare', field( 'Greater Than Field', binary ) ]
];

export function sampleField( value, element ) {

	return typeof value === 'function' ? value( element ) : value;

}

export function validAttributeName( name ) {

	return typeof name === 'string' && /^[a-z_][a-z_0-9]{0,63}$/i.test( name ) && ! Object.hasOwn( Object.prototype, name );

}

export function randomAt( seed, index ) {

	let bits = Math.imul( ( index + 1 ) ^ seed, 0x27d4eb2d );
	bits = Math.imul( bits ^ bits >>> 15, 0x85ebca6b );
	return ( ( bits ^ bits >>> 13 ) >>> 0 ) / 0x100000000;

}

function components( key ) {

	return Object.fromEntries( Object.keys( axes ).map( axis => [ axis, element => element[ key ][ axis ] ] ) );

}

const pair = ( operation, a, b ) => element => operation( sampleField( a, element ), sampleField( b, element ) );
const math = expressionMath();

function memoField( evaluate ) {

	let previous, index, result;
	return element => {

		if ( element !== previous || element.index !== index ) {

			result = evaluate( element );
			previous = element;
			index = element.index;

		}
		return result;

	};

}

export const FIELD_OPERATIONS = [
	[ 'field.constant', ( { value } ) => ( { value: () => value } ) ],
	[ 'field.position', () => components( 'position' ) ],
	[ 'field.normal', () => components( 'normal' ) ],
	[ 'field.index', () => ( {
		index: element => element.index,
		fraction: element => element.index / Math.max( 1, element.count - 1 )
	} ) ],
	[ 'field.attribute', ( { name, fallback } ) => {

		if ( ! validAttributeName( name ) ) throw new Error( 'Use letters, digits, and underscores for an attribute name.' );
		return { value: ( { geometry, index } ) => {

			const attribute = Object.hasOwn( geometry.attributes, name ) && geometry.getAttribute( name );
			return attribute && attribute.itemSize === 1 && index < attribute.count ? attribute.getX( index ) : fallback;

		} };

	} ],
	[ 'field.random', ( { seed, min, max } ) => ( { value: element => min + randomAt( Math.round( seed ), element.index ) * ( max - min ) } ) ],
	[ 'field.add', ( { a, b } ) => ( { value: pair( ( x, y ) => x + y, a, b ) } ) ],
	[ 'field.multiply', ( { a, b } ) => ( { value: pair( ( x, y ) => x * y, a, b ) } ) ],
	[ 'field.sine', ( { value } ) => ( { value: element => Math.sin( sampleField( value, element ) ) } ) ],
	[ 'field.maprange', inputs => ( {
		value: element => math.get( 'maprange' ).run( ...Object.values( inputs ).map( value => sampleField( value, element ) ) )
	} ) ],
	[ 'field.expression', ( { expression, x, y, z } ) => {

		const run = compileExpression( expression, math );
		return { value: element => run( { x: sampleField( x, element ), y: sampleField( y, element ), z: sampleField( z, element ) } ) };

	} ],
	[ 'field.compare', ( { a, b } ) => ( { value: pair( ( x, y ) => x > y ? 1 : 0, a, b ) } ) ]
].map( ( [ type, create ] ) => [ type, inputs => Object.fromEntries( Object.entries( create( inputs ) )
	.map( ( [ socket, field ] ) => [ socket, memoField( field ) ] ) ) ] );

export function forEachVertex( THREE, geometry, visit ) {

	const position = geometry.attributes.position;
	const normal = geometry.attributes.normal;
	const element = { geometry, index: 0, count: position.count, position: new THREE.Vector3(), normal: new THREE.Vector3( 0, 1, 0 ) };
	for ( let i = 0; i < position.count; i ++ ) {

		element.index = i;
		element.position.fromBufferAttribute( position, i );
		if ( normal ) element.normal.fromBufferAttribute( normal, i );
		visit( element );

	}

}
