export const numberInput = ( label, value = 0, min = - 1e6, max = 1e6 ) => ( { label, type: 'number', default: value, min, max } );

const numberOutput = { value: { label: 'Value', type: 'number' } };
export const VALUE_NODES = [
	[ 'value.number', { label: 'Number', category: 'Values', inputs: { value: numberInput( 'Value' ) }, outputs: numberOutput } ],
	[ 'math.add', { label: 'Add', category: 'Math', inputs: { a: numberInput( 'A' ), b: numberInput( 'B' ) }, outputs: numberOutput } ],
	[ 'math.multiply', { label: 'Multiply', category: 'Math', inputs: { a: numberInput( 'A', 1 ), b: numberInput( 'B', 1 ) }, outputs: numberOutput } ]
];

export const VALUE_OPERATIONS = new Map( [
	[ 'value.number', ( { value } ) => ( { value } ) ],
	[ 'math.add', ( { a, b } ) => ( { value: a + b } ) ],
	[ 'math.multiply', ( { a, b } ) => ( { value: a * b } ) ]
] );
