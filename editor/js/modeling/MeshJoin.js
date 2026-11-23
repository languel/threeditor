import { readModelGeometry } from './ModelGeometry.js?v=expressive-pencil';

function component( THREE, attribute, index, axis ) {

	if ( attribute.isFloat16BufferAttribute && ! attribute.normalized ) return THREE.DataUtils.fromHalfFloat( attribute.array[ index * attribute.itemSize + axis ] );
	return attribute.getComponent( index, axis );

}

// Entries are in active-first order and supply a transform into active space.
export function joinMeshGeometry( THREE, entries, keepPolygons = entries.some( entry => entry.geometry.userData.modeling?.kind === 'mesh' ) ) {

	const activeMaterial = entries[ 0 ].material;
	// Active material indices may be referenced by scripts and timeline tracks.
	const materials = [ activeMaterial ].flat();
	const attributes = new Map(), slots = new Map();
	materials.forEach( ( material, index ) => { if ( ! slots.has( material ) ) slots.set( material, index ); } );
	const geometry = new THREE.BufferGeometry();
	const points = [], faces = [], triangleFaces = [], indices = [];
	let vertexCount = 0;
	for ( const entry of entries ) {

		vertexCount += entry.geometry.attributes.position.count;
		for ( const [ name, attribute ] of Object.entries( entry.geometry.attributes ) ) {

			if ( attribute.gpuType === THREE.IntType || ! attribute.array && ! attribute.data?.array ) throw new Error( 'Join requires CPU-readable floating-point vertex attributes.' );
			const size = attributes.get( name );
			if ( size && size !== attribute.itemSize && name !== 'color' ) throw new Error( 'The meshes use incompatible ' + name + ' attributes.' );
			attributes.set( name, Math.max( size || 0, attribute.itemSize ) );

		}

	}
	attributes.set( 'normal', 3 );
	for ( const [ name, size ] of attributes ) {

		const array = new Float32Array( vertexCount * size );
		if ( name === 'color' ) array.fill( 1 );
		if ( name === 'tangent' ) for ( let i = 0; i < array.length; i += size ) { array[ i ] = 1; array[ i + 3 ] = 1; }
		geometry.setAttribute( name, new THREE.BufferAttribute( array, size ) );

	}

	let offset = 0;
	for ( const entry of entries ) {

		const { geometry: source, matrix, material } = entry;
		const transformed = new THREE.BufferGeometry().copy( source );
		try {

			for ( const name of [ 'position', 'normal', 'tangent' ] ) {

				const attribute = transformed.getAttribute( name );
				if ( ! attribute || ! attribute.normalized && ! attribute.isFloat16BufferAttribute &&
					( attribute.array || attribute.data?.array ) instanceof Float32Array ) continue;
				const values = new Float32Array( attribute.count * attribute.itemSize );
				for ( let i = 0; i < attribute.count; i ++ ) for ( let c = 0; c < attribute.itemSize; c ++ ) values[ i * attribute.itemSize + c ] = component( THREE, attribute, i, c );
				transformed.setAttribute( name, new THREE.BufferAttribute( values, attribute.itemSize ) );

			}
			if ( ! transformed.hasAttribute( 'normal' ) ) transformed.computeVertexNormals();
			transformed.applyMatrix4( matrix );
			const reversed = matrix.determinant() < 0;
			for ( const [ name, attr ] of Object.entries( transformed.attributes ) ) {

				const output = geometry.getAttribute( name );
				for ( let i = 0; i < attr.count; i ++ ) for ( let c = 0; c < attr.itemSize; c ++ ) {

					const value = component( THREE, attr, i, c );
					output.setComponent( offset + i, c, reversed && name === 'tangent' && c === 3 ? -value : value );

				}

			}
			const logical = keepPolygons ? readModelGeometry( source, source.userData.modeling?.kind === 'mesh' ) : null;
			const faceOffset = faces.length;
			if ( logical ) {

				const pointOffset = points.length;
				for ( const point of logical.points ) points.push( new THREE.Vector3( ...point.map( Math.fround ) ).applyMatrix4( matrix ).toArray() );
				for ( const face of logical.faces ) faces.push( ( reversed ? face.slice().reverse() : face ).map( i => pointOffset + i ) );

			}
			const count = source.index?.count ?? source.attributes.position.count;
			const groups = Array.isArray( material ) ? source.groups : [ { start: 0, count, materialIndex: 0 } ];
			const drawStart = source.drawRange.start, drawEnd = drawStart + source.drawRange.count;
			for ( const group of groups ) {

				const start = Math.max( drawStart, group.start ), end = Math.min( drawEnd, group.start + group.count, count );
				const mat = Array.isArray( material ) ? material[ group.materialIndex ] : material;
				if ( ! mat || start + 2 >= end ) continue;
				if ( ! slots.has( mat ) ) { slots.set( mat, materials.length ); materials.push( mat ); }
				const first = indices.length;
				const vertex = i => offset + ( source.index ? source.index.getX( i ) : i );
				for ( let i = start; i + 2 < end; i += 3 ) {

					indices.push( vertex( i ), vertex( i + ( reversed ? 2 : 1 ) ), vertex( i + ( reversed ? 1 : 2 ) ) );
					if ( logical ) {

						const triangle = Math.floor( i / 3 );
						triangleFaces.push( faceOffset + ( logical.kind === 'mesh' ? source.userData.triangleFaces?.[ triangle ] ?? triangle : triangle ) );

					}

				}
				const slot = entry === entries[ 0 ] ? group.materialIndex : slots.get( mat );
				geometry.addGroup( first, indices.length - first, slot );

			}
			offset += source.attributes.position.count;

		} finally {

			transformed.dispose();

		}

	}

	if ( ! indices.length ) { geometry.dispose(); throw new Error( 'The selection has no mesh faces to join.' ); }
	geometry.setIndex( indices );
	if ( keepPolygons ) {

		geometry.userData.modeling = { kind: 'mesh', points, faces };
		geometry.userData.triangleFaces = triangleFaces;

	}
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	return { geometry, material: materials.length === 1 && ! Array.isArray( activeMaterial ) ? materials[ 0 ] : materials };

}
