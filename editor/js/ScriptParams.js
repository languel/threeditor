import { parse } from './libs/acorn/acorn.mjs';

function scriptParams( source ) {

	const comments = [];
	let program;
	try {

		program = parse( source, { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowImportExportEverywhere: true, onComment: comments } );

	} catch {

		return [];

	}

	const fields = new Map();
	for ( const comment of comments ) {

		for ( const line of comment.value.split( '\n' ) ) {

			const match = line.match( /^\s*\*?\s*@param\s+([\w$]+)\s*=\s*(.+?)\s*$/ );
			if ( ! match ) continue;
			const [ , name, expression ] = match;
			const range = expression.match( /\s+\((-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)\)$/ );
			let value;
			try {

				value = JSON.parse( range ? expression.slice( 0, range.index ) : expression );

			} catch {

				continue;

			}
			if ( ! [ 'number', 'boolean', 'string' ].includes( typeof value ) ) continue;
			const field = { name, value };
			if ( range && typeof value === 'number' && Number( range[ 1 ] ) <= Number( range[ 2 ] ) ) {

				field.min = Number( range[ 1 ] );
				field.max = Number( range[ 2 ] );

			}
			fields.set( name, field );

		}

	}
	const ranges = new Map( comments.filter( comment => comment.type === 'Block' ).map( comment => [ comment.start, comment.value ] ) );
	for ( const statement of program.body ) {

		if ( statement.type !== 'VariableDeclaration' || statement.kind !== 'const' || statement.declarations.length !== 1 ) continue;
		const { id, init } = statement.declarations[ 0 ];
		if ( id.type !== 'Identifier' || ! init || fields.has( id.name ) ) continue;
		const commentStart = statement.end + source.slice( statement.end ).match( /^[ \t]*/ )[ 0 ].length;
		const range = ranges.get( commentStart )?.match( /^\s*(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)\s*$/ );
		if ( ! range ) continue;
		const min = Number( range[ 1 ] ), max = Number( range[ 2 ] );
		const literal = init.type === 'UnaryExpression' && [ '-', '+' ].includes( init.operator ) ? init.argument : init;
		if ( literal.type !== 'Literal' || typeof literal.value !== 'number' ) continue;
		const value = init.operator === '-' ? - literal.value : literal.value;
		if ( ! Number.isFinite( value ) || ! Number.isFinite( min ) || ! Number.isFinite( max ) || min > max ) continue;
		fields.set( id.name, { name: id.name, value, min, max, initializer: { start: init.start, end: init.end } } );

	}
	for ( const comment of comments ) for ( const line of comment.value.split( '\n' ) ) {
		const match = line.match( /^\s*\*?\s*@options\s+([\w$]+)\s*=\s*(.+)$/ );
		if ( ! match || ! fields.has( match[ 1 ] ) ) continue;
		try { const choices = JSON.parse( match[ 2 ] ); if ( Array.isArray( choices ) && choices.every( value => typeof value === 'string' ) ) fields.get( match[ 1 ] ).options = choices; } catch { /* invalid choices leave a normal text field */ }
	}
	return [ ...fields.values() ];

}

function scriptSourceForExecution( script, source = script.source ) {

	if ( script.generated || ! source.includes( '/*' ) ) return source;
	const bindings = scriptParams( source ).filter( field => field.initializer ).reverse();
	for ( const field of bindings ) {

		const { start, end } = field.initializer;
		const value = scriptParamValue( script, field );
		if ( ! Number.isFinite( value ) || Object.is( value, field.value ) ) continue;
		const replacement = Object.is( value, -0 ) ? '-0' : String( value );
		source = source.slice( 0, start ) + replacement + source.slice( end );

	}
	return source;

}

function scriptParamValue( script, field ) {

	const override = Object.hasOwn( script.paramValues || {}, field.name ) ? script.paramValues[ field.name ] : undefined;
	const value = typeof override === typeof field.value ? override : field.value;
	return field.min === undefined ? value : Math.min( field.max, Math.max( field.min, value ) );

}

function serializeScript( script ) {

	if ( script.generated ) return script;
	const fields = scriptParams( script.source ).filter( field => ! field.initializer );
	const output = { ...script };
	delete output.parameters;
	if ( fields.length ) output.parameters = Object.fromEntries( fields.map( field => [ field.name, scriptParamValue( script, field ) ] ) );
	return output;

}

export { scriptParams, scriptParamValue, scriptSourceForExecution, serializeScript };
