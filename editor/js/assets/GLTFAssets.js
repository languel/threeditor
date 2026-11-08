// Both JSON glTF and GLB may refer to external buffers and textures.
export async function gltfDocument( file ) {
	if ( /\.gltf$/i.test( file.name ) ) return JSON.parse( await file.text() );
	const bytes = await file.arrayBuffer();
	const view = new DataView( bytes );
	if ( bytes.byteLength < 20 || view.getUint32( 0, true ) !== 0x46546c67 || view.getUint32( 4, true ) !== 2 ) throw new Error( 'Invalid GLB header.' );
	const length = view.getUint32( 12, true );
	if ( view.getUint32( 16, true ) !== 0x4e4f534a || length + 20 > bytes.byteLength ) throw new Error( 'Invalid GLB JSON chunk.' );
	return JSON.parse( new TextDecoder().decode( new Uint8Array( bytes, 20, length ) ).replace( /\u0000+$/, '' ) );
}
export function gltfResourceURIs( document ) {
	return [ ...new Set( [ ...( document.buffers || [] ), ...( document.images || [] ) ].map( r => r.uri ).filter( uri => uri && ! uri.startsWith( 'data:' ) ) ) ];
}
