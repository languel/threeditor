import { parseExpressionAt } from '../libs/acorn/acorn.mjs';

const infix = new Map( [
	[ '+', 'add' ], [ '-', 'subtract' ], [ '*', 'multiply' ], [ '/', 'divide' ], [ '%', 'modulo' ],
	[ '**', 'power' ], [ '<', 'less' ], [ '>', 'greater' ]
] );
const constants = { pi: Math.PI, tau: Math.PI * 2, e: Math.E };

export const expressionInput = { label: 'Expression', type: 'string', default: 'sin(x) + y * z', maxLength: 256 };

export function compileExpression( source, operations ) {

	let ast;
	try {

		ast = parseExpressionAt( source, 0, { ecmaVersion: 2020, preserveParens: true } );
		if ( source.slice( ast.end ).trim() ) throw new Error( 'Unexpected text after the expression.' );

	} catch ( error ) {

		throw new Error( 'Math Expression: ' + error.message );

	}
	function compile( node ) {

		if ( node.type === 'ParenthesizedExpression' ) return compile( node.expression );
		if ( node.type === 'Literal' && Number.isFinite( node.value ) ) return () => node.value;
		if ( node.type === 'Identifier' ) {

			const name = node.name.toLowerCase();
			if ( [ 'x', 'y', 'z' ].includes( name ) ) return inputs => inputs[ name ];
			if ( Object.hasOwn( constants, name ) ) return () => constants[ name ];

		}
		if ( node.type === 'UnaryExpression' && ( node.operator === '+' || node.operator === '-' ) ) {

			const read = compile( node.argument );
			return node.operator === '-' ? inputs => operations.get( 'multiply' ).run( - 1, read( inputs ) ) : read;

		}
		if ( node.type === 'BinaryExpression' && infix.has( node.operator ) ) {

			const left = compile( node.left ), right = compile( node.right );
			const { run } = operations.get( infix.get( node.operator ) );
			return inputs => run( left( inputs ), right( inputs ) );

		}
		if ( node.type === 'CallExpression' && node.callee.type === 'Identifier' ) {

			const operation = operations.get( node.callee.name.toLowerCase() );
			if ( operation && operation.arity === node.arguments.length ) {

				const args = node.arguments.map( compile );
				return inputs => operation.run( ...args.map( read => read( inputs ) ) );

			}
			throw new Error( 'Unknown math function or incorrect argument count for ' + node.callee.name + '.' );

		}
		throw new Error( 'Math Expression supports numeric operators, X/Y/Z, constants, and math functions.' );

	}
	return compile( ast );

}
