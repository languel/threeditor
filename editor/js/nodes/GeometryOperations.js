// Use the union of vertex attributes and preserve groups for meshes that use
// multiple materials. Indexed and non-indexed inputs can be combined directly.
export function joinGeometry( THREE, sources ) {

	const layout = new Map();
	let vertexCount = 0;
	for ( const source of sources ) {

		vertexCount += source.attributes.position.count;
		for ( const [ name, attribute ] of Object.entries( source.attributes ) ) {

			if ( attribute.isGLBufferAttribute || attribute.gpuType === THREE.IntType ) {

				throw new Error( 'Join Geometry requires CPU-readable floating-point vertex attributes.' );

			}
			const size = layout.get( name );
			if ( size && size !== attribute.itemSize && name !== 'color' ) throw new Error( 'Join Geometry found incompatible ' + name + ' attributes.' );
			layout.set( name, Math.max( size || 0, attribute.itemSize ) );

		}

	}
	const ranges = sources.map( source => {

		const count = source.index?.count ?? source.attributes.position.count;
		const start = Math.min( count, Math.max( 0, source.drawRange.start ) );
		return { start, end: Math.min( count, start + source.drawRange.count ) };

	} );
	const indexCount = ranges.reduce( ( count, { start, end } ) => count + end - start, 0 );
	if ( indexCount > 4e6 ) throw new Error( 'Join Geometry exceeds four million indices.' );
	const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
	const indices = new IndexArray( indexCount );
	const result = new THREE.BufferGeometry();
	result.setIndex( new THREE.BufferAttribute( indices, 1 ) );
	for ( const [ name, size ] of layout ) {

		const array = new Float32Array( vertexCount * size );
		if ( name === 'color' ) array.fill( 1 );
		result.setAttribute( name, new THREE.BufferAttribute( array, size ) );

	}
	let vertexOffset = 0, indexOffset = 0;
	for ( const [ sourceIndex, source ] of sources.entries() ) {

		for ( const [ name, attribute ] of Object.entries( source.attributes ) ) {

			const destination = result.attributes[ name ];
			for ( let vertex = 0; vertex < attribute.count; vertex ++ ) {

				for ( let c = 0; c < attribute.itemSize; c ++ ) {

					const value = attribute.isFloat16BufferAttribute && ! attribute.normalized ?
						THREE.DataUtils.fromHalfFloat( attribute.array[ vertex * attribute.itemSize + c ] ) : attribute.getComponent( vertex, c );
					destination.setComponent( vertexOffset + vertex, c, value );

				}

			}

		}
		const { start, end } = ranges[ sourceIndex ];
		for ( let i = start; i < end; i ++ ) indices[ indexOffset + i - start ] = vertexOffset + ( source.index ? source.index.getX( i ) : i );
		const groups = source.groups.length ? source.groups : [ { start, count: end - start, materialIndex: 0 } ];
		for ( const group of groups ) {

			const first = Math.max( start, group.start );
			const last = Math.min( end, group.start + group.count );
			if ( last > first ) result.addGroup( indexOffset + first - start, last - first, group.materialIndex );

		}
		vertexOffset += source.attributes.position.count;
		indexOffset += end - start;

	}
	if ( sources.some( source => ! source.hasAttribute( 'normal' ) ) ) result.computeVertexNormals();
	return result;

}
