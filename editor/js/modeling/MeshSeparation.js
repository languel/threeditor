// Partition the original triangles so UV seams, material groups, and
// imported vertex attributes survive separating an editable mesh.
export function separateMesh( THREE, geometry, data, mode, selectedFaces = [] ) {

	const { index, attributes, groups, drawRange } = geometry;
	const count = index?.count ?? attributes.position.count;
	const triangles = Array.from( { length: Math.floor( count / 3 ) }, ( _, i ) => ( {
		vertices: [ 0, 1, 2 ].map( j => index ? index.getX( i * 3 + j ) : i * 3 + j ),
		face: data.kind === 'mesh' ? geometry.userData.triangleFaces?.[ i ] ?? i : i,
		slot: -1,
		drawn: i * 3 >= drawRange.start && i * 3 + 3 <= drawRange.start + drawRange.count
	} ) );
	for ( const group of groups ) {

		const end = Math.min( count, group.start + group.count );
		for ( let i = group.start; i + 2 < end; i += 3 ) triangles[ Math.floor( i / 3 ) ].slot = group.materialIndex;

	}

	const buckets = new Map();
	const selected = new Set( selectedFaces );
	const looseRoots = mode === 'loose' ? faceComponents( data ) : null;
	for ( const triangle of triangles ) {

		const key = mode === 'selection' ? Number( selected.has( triangle.face ) ) :
			mode === 'material' ? triangle.slot : looseRoots[ triangle.face ];
		if ( ! buckets.has( key ) ) buckets.set( key, [] );
		buckets.get( key ).push( triangle );

	}

	let ordered;
	if ( mode === 'selection' ) {

		if ( ! buckets.has( 1 ) ) return [];
		ordered = [ buckets.get( 0 ) || [], buckets.get( 1 ) ];

	} else {

		if ( buckets.size < 2 ) return [];
		ordered = [ ...buckets.values() ];

	}

	// A generated n-gon normally uses one material. Splitting it between
	// materials would require a deliberate conversion into editable triangles.
	if ( mode === 'material' && data.kind === 'mesh' ) {

		const owner = new Map();
		for ( const triangle of triangles ) {

			if ( owner.has( triangle.face ) && owner.get( triangle.face ) !== triangle.slot ) throw new Error( 'One polygon uses multiple material slots.' );
			owner.set( triangle.face, triangle.slot );

		}

	}

	const renderedFaces = new Set( triangles.map( triangle => triangle.face ) );
	const unrenderedFaces = data.faces.map( ( _, i ) => i ).filter( i => ! renderedFaces.has( i ) );
	const usedPoints = new Set( data.faces.flat() );
	const loosePoints = data.points.map( ( _, i ) => i ).filter( i => ! usedPoints.has( i ) );
	const referenced = new Set( triangles.flatMap( triangle => triangle.vertices ) );
	const spareVertices = index ? Array.from( { length: attributes.position.count }, ( _, i ) => i ).filter( i => ! referenced.has( i ) ) : [];
	return ordered.map( ( list, i ) => copyPart( THREE, geometry, data, list,
		i === 0 ? unrenderedFaces : [], i === 0 ? loosePoints : [], i === 0 ? spareVertices : [] ) );

}

function faceComponents( { points, faces } ) {

	const parents = points.map( ( _, i ) => i );
	const root = start => {

		let index = start;
		while ( parents[ index ] !== index ) {

			parents[ index ] = parents[ parents[ index ] ];
			index = parents[ index ];

		}
		return index;

	};
	for ( const face of faces ) {

		const id = root( face[ 0 ] );
		for ( const vertex of face ) parents[ root( vertex ) ] = id;

	}
	return faces.map( face => root( face[ 0 ] ) );

}

function copyPart( THREE, source, data, triangles, extraFaces, loosePoints, spareVertices ) {

	const part = new THREE.BufferGeometry();
	part.name = source.name;
	const { modeling, triangleFaces, ...userData } = source.userData;
	part.userData = structuredClone( userData );
	const vertices = [ ...new Set( triangles.flatMap( triangle => triangle.vertices ).concat( spareVertices ) ) ];
	const index = new Map( vertices.map( ( vertex, i ) => [ vertex, i ] ) );
	for ( const [ name, attribute ] of Object.entries( source.attributes ) ) {

		const buffer = attribute.isInterleavedBufferAttribute ? attribute.data : attribute;
		const { itemSize } = attribute;
		const stride = buffer.stride || itemSize;
		const offset = attribute.offset || 0;
		const raw = buffer.array;
		const array = new raw.constructor( vertices.length * itemSize );
		vertices.forEach( ( vertex, i ) => {

			const start = vertex * stride + offset;
			array.set( raw.subarray( start, start + itemSize ), i * itemSize );

		} );
		const Attribute = attribute.isFloat16BufferAttribute ? THREE.Float16BufferAttribute : THREE.BufferAttribute;
		const copy = new Attribute( array, itemSize, attribute.normalized );
		copy.name = attribute.name;
		copy.gpuType = attribute.gpuType ?? copy.gpuType;
		copy.setUsage( buffer.usage );
		part.setAttribute( name, copy );

	}
	if ( source.index ) part.setIndex( triangles.flatMap( triangle => triangle.vertices.map( vertex => index.get( vertex ) ) ) );

	let start = 0;
	while ( start < triangles.length ) {

		const slot = triangles[ start ].slot;
		let end = start + 1;
		while ( end < triangles.length && triangles[ end ].slot === slot ) end++;
		if ( slot >= 0 ) part.addGroup( start * 3, ( end - start ) * 3, slot );
		start = end;

	}
	if ( source.drawRange.start !== 0 || source.drawRange.count !== Infinity ) {

		const first = triangles.findIndex( triangle => triangle.drawn );
		const last = triangles.findLastIndex( triangle => triangle.drawn );
		part.setDrawRange( Math.max( 0, first ) * 3, first < 0 ? 0 : ( last - first + 1 ) * 3 );

	}

	if ( data.kind === 'mesh' ) {

		const faces = [ ...new Set( triangles.map( triangle => triangle.face ).concat( extraFaces ) ) ];
		const faceMap = new Map( faces.map( ( face, i ) => [ face, i ] ) );
		const points = [ ...new Set( faces.flatMap( face => data.faces[ face ] ).concat( loosePoints ) ) ];
		const pointMap = new Map( points.map( ( point, i ) => [ point, i ] ) );
		const { points: sourcePoints, faces: sourceFaces, ...settings } = data;
		part.userData.modeling = {
			...structuredClone( settings ),
			points: points.map( point => sourcePoints[ point ].slice() ),
			faces: faces.map( face => sourceFaces[ face ].map( point => pointMap.get( point ) ) )
		};
		part.userData.triangleFaces = triangles.map( triangle => faceMap.get( triangle.face ) );

	} else {

		part.userData.modeling = { kind: 'vertices' };

	}
	part.computeBoundingBox();
	part.computeBoundingSphere();
	return part;

}
