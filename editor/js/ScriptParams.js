import { parse } from './libs/acorn/acorn.mjs';

function scriptParams( source ) {

	const comments = [];
	try {

		parse( source, { ecmaVersion: 'latest', allowReturnOutsideFunction: true, onComment: comments } );

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
	return [ ...fields.values() ];

}

function scriptParamValue( script, field ) {

	const override = Object.hasOwn( script.paramValues || {}, field.name ) ? script.paramValues[ field.name ] : undefined;
	const value = typeof override === typeof field.value ? override : field.value;
	return field.min === undefined ? value : Math.min( field.max, Math.max( field.min, value ) );

}

function serializeScript( script ) {

	if ( script.generated ) return script;
	const fields = scriptParams( script.source );
	const output = { ...script };
	delete output.parameters;
	if ( fields.length ) output.parameters = Object.fromEntries( fields.map( field => [ field.name, scriptParamValue( script, field ) ] ) );
	return output;

}

export { scriptParams, scriptParamValue, serializeScript };
