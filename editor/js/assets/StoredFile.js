// Some WebKit hosts cannot persist Blob/File values in IndexedDB.
export async function encodeFile( file ) {

	if ( ! ( file instanceof Blob ) ) return file;
	return { assetFileBytes: await file.arrayBuffer(), name: file.name, type: file.type, lastModified: file.lastModified };

}

export function decodeFile( file ) {

	if ( ! file?.assetFileBytes ) return file;
	const { assetFileBytes, name, type, lastModified } = file;
	return new File( [ assetFileBytes ], name, { type, lastModified } );

}

export async function encodeSourceFiles( files ) {

	return Promise.all( [ ...files ].map( async ( [ path, entry ] ) => [ path, { ...entry, file: await encodeFile( entry.file ) } ] ) );

}

export function decodeSourceFiles( files ) {

	return [ ...files ].map( ( [ path, entry ] ) => [ path, { ...entry, file: decodeFile( entry.file ) } ] );

}
