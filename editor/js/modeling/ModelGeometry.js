import { faceCorners, inheritMaterial, interpolateFaceCorner, readFaceAttributes } from './FaceAttributes.js';

export function modelData( kind ) {

	if ( kind === 'path' ) return { kind, points: [ [ -1.5, -.5, 0 ], [ -.6, .6, 0 ], [ .5, .2, 0 ], [ 1.5, .7, 0 ] ], smooth: true, closed: false, planar: true };
	const points = [ [ -1.4, -.8, 0 ], [ 1.4, -.8, 0 ], [ 1.4, .8, 0 ], [ -1.4, .8, 0 ] ];
	return kind === 'shape' ? { kind, points, smooth: false, depth: 0 } : { kind, points, faces: [ [ 0, 1, 2, 3 ] ] };

}

export function isClosedOutline( data ) {

	return data.kind === 'shape' ? data.closed !== false : data.closed === true;

}

export function outlinePoints( THREE, data, limit = 512 ) {

	const points = data.points.map( point => new THREE.Vector3( ...point ) );
	const closed = isClosedOutline( data );
	if ( data.smooth && points.length > 2 ) {

		const curve = new THREE.CatmullRomCurve3( points, closed );
		const samples = curve.getPoints( Math.min( limit, points.length * 12 ) );
		if ( closed ) samples.pop();
		return samples;

	}
	return points;

}

// Adapted from Threegrease's polygon renderer. Keep ordered face loops as
// editor data and triangulate a Newell projection only for the render mesh.
function faceProjection( THREE, vertices ) {

	const normal = new THREE.Vector3();
	for ( let i = 0; i < vertices.length; i ++ ) {

		const [ x, y, z ] = vertices[ i ], [ x2, y2, z2 ] = vertices[ ( i + 1 ) % vertices.length ];
		normal.x += ( y - y2 ) * ( z + z2 );
		normal.y += ( z - z2 ) * ( x + x2 );
		normal.z += ( x - x2 ) * ( y + y2 );

	}
	if ( normal.lengthSq() === 0 ) return null;
	normal.normalize();
	const axis = Math.abs( normal.z ) < .9 ? new THREE.Vector3( 0, 0, 1 ) : new THREE.Vector3( 1, 0, 0 );
	const u = axis.cross( normal ).normalize();
	const v = new THREE.Vector3().crossVectors( normal, u );
	const point = new THREE.Vector3();
	const outline = vertices.map( vertex => {

		point.fromArray( vertex );
		return new THREE.Vector2( point.dot( u ), point.dot( v ) );

	} );
	return { normal, outline };

}

export function addFace( THREE, data, indices ) {

	if ( indices.length < 3 || new Set( indices ).size !== indices.length ) throw new Error( 'Select at least three distinct vertices in boundary order.' );
	if ( data.faces.some( face => face.length === indices.length && face.every( index => indices.includes( index ) ) ) ) throw new Error( 'Those vertices already form a face.' );
	const projection = faceProjection( THREE, indices.map( index => data.points[ index ] ) );
	if ( ! projection || ! THREE.ShapeUtils.triangulateShape( projection.outline, [] ).length ) throw new Error( 'The selected vertices need to form a polygon with area.' );
	data.faces.push( [ ...indices ] );

}

export function splitEdge( data, a, b, fraction = .5 ) {

	const faces = data.faces.filter( face => face.some( ( vertex, index ) => {

		const next = face[ ( index + 1 ) % face.length ];
		return vertex === a && next === b || vertex === b && next === a;

	} ) );
	if ( ! faces.length ) throw new Error( 'Select the two ends of an existing edge.' );
	const middle = data.points.length;
	data.points.push( data.points[ a ].map( ( value, axis ) => value + ( data.points[ b ][ axis ] - value ) * fraction ) );
	for ( const face of faces ) {

		const index = face.findIndex( ( vertex, i ) => {

			const next = face[ ( i + 1 ) % face.length ];
			return vertex === a && next === b || vertex === b && next === a;

		} );
		const next = ( index + 1 ) % face.length;
		const t = face[ index ] === a ? fraction : 1 - fraction;
		interpolateFaceCorner( face, index + 1, [ [ index, 1 - t ], [ next, t ] ] );
		face.splice( index + 1, 0, middle );

	}
	return middle;

}

export function pokeFace( THREE, data, faceIndex, triangleIndex, point ) {

	const face = data.faces[ faceIndex ];
	const projection = faceProjection( THREE, face.map( index => data.points[ index ] ) );
	if ( ! projection ) throw new Error( 'Select a face with area.' );
	const triangles = THREE.ShapeUtils.triangulateShape( projection.outline, [] ).map( triangle => triangle.map( i => face[ i ] ) );
	const triangle = triangles[ triangleIndex ];
	if ( ! triangle ) throw new Error( 'Click inside a face.' );
	const center = data.points.push( point.toArray() ) - 1;
	const split = triangle.map( ( vertex, i ) => [ vertex, triangle[ ( i + 1 ) % 3 ], center ] );
	if ( split.some( part => ! faceNormal( THREE, data, part ) ) ) throw new Error( 'Click inside the face, away from its edges.' );
	triangles.splice( triangleIndex, 1, ...split );
	const augmented = faceCorners( [ ...face ], face );
	const [ a, b, c ] = triangle.map( index => new THREE.Vector3( ...data.points[ index ] ) );
	const weights = THREE.Triangle.getBarycoord( point, a, b, c, new THREE.Vector3() );
	if ( weights ) interpolateFaceCorner( augmented, augmented.length, triangle.map( ( id, index ) => [ face.indexOf( id ), weights.getComponent( index ) ] ) );
	augmented.push( center );
	data.faces.splice( faceIndex, 1, ...triangles.map( part => faceCorners( part, augmented ) ) );
	return [ center ];

}

export function weldPoints( data, indices ) {

	const [ keep, ...merged ] = indices;
	const points = new Set( indices );
	data.points[ keep ] = data.points[ keep ].map( ( _, axis ) => indices.reduce( ( sum, index ) => sum + data.points[ index ][ axis ], 0 ) / indices.length );
	data.faces = data.faces.map( face => {

		const remapped = face.map( index => points.has( index ) ? keep : index );
		const unique = [ ...new Set( remapped ) ];
		return faceCorners( unique, face, unique.map( point => remapped.indexOf( point ) ) );

	} );
	removePoints( data, merged );
	const seen = new Set();
	data.faces = data.faces.filter( face => {

		const key = face.slice().sort( ( a, b ) => a - b ).join( ',' );
		if ( seen.has( key ) ) return false;
		seen.add( key );
		return true;

	} );
	return [ keep - merged.filter( index => index < keep ).length ];

}

export function removePoints( data, indices ) {

	const remove = new Set( indices );
	const remap = new Map();
	data.points = data.points.filter( ( point, index ) => {

		if ( remove.has( index ) ) return false;
		remap.set( index, remap.size );
		return true;

	} );
	if ( data.faces ) data.faces = data.faces.map( face => {

		const kept = face.filter( index => remap.has( index ) );
		return faceCorners( kept.map( index => remap.get( index ) ), face, kept.map( index => face.indexOf( index ) ) );

	} ).filter( face => face.length >= 3 );

}

export function faceNormal( THREE, data, indices ) {

	return faceProjection( THREE, indices.map( index => data.points[ index ] ) )?.normal;

}

// Adapted from ThreeGrease core/polyedit.ts. Keep the underside of a standalone
// sheet, and extend the walls of an existing solid from its selected face.
export function extrudeFace( THREE, data, faceIndex, distance ) {

	const face = data.faces[ faceIndex ];
	const normal = face && faceNormal( THREE, data, face );
	const offset = typeof distance === 'number' ? normal?.clone().multiplyScalar( distance ) : distance;
	if ( ! normal || ! offset || ! offset.toArray().every( Number.isFinite ) || offset.lengthSq() < 1e-16 ) throw new Error( 'Use a face with area and a nonzero distance.' );
	const isolated = face.every( ( vertex, i ) => ! data.faces.some( ( other, index ) =>
		index !== faceIndex && other.includes( vertex ) && other.includes( face[ ( i + 1 ) % face.length ] ) ) );
	const cap = face.map( index => data.points.push( new THREE.Vector3( ...data.points[ index ] ).add( offset ).toArray() ) - 1 );
	const reverse = isolated && normal.dot( offset ) < 0;
	const corners = face.map( ( _, i ) => i );
	data.faces[ faceIndex ] = faceCorners( reverse ? cap.slice().reverse() : cap, face, reverse ? corners.reverse() : corners );
	if ( isolated ) data.faces.push( reverse ? face : faceCorners( face.slice().reverse(), face ) );
	for ( let i = 0; i < face.length; i ++ ) {

		const j = ( i + 1 ) % face.length;
		const side = [ face[ i ], face[ j ], cap[ j ], cap[ i ] ];
		data.faces.push( inheritMaterial( reverse ? side.reverse() : side, face ) );

	}
	return cap;

}

export function boundaryEdge( data, a, b ) {

	const directions = [];
	for ( const face of data.faces ) for ( let i = 0; i < face.length; i ++ ) {

		const from = face[ i ], to = face[ ( i + 1 ) % face.length ];
		if ( ( from === a && to === b ) || ( from === b && to === a ) ) directions.push( [ to, from ] );

	}
	return directions.length === 1 ? directions[ 0 ] : null;

}

export function extrudeEdge( THREE, data, edge, offset ) {

	const [ a, b ] = edge;
	const cap = edge.map( index => data.points.push( new THREE.Vector3( ...data.points[ index ] ).add( offset ).toArray() ) - 1 );
	const adjacent = data.faces.find( face => face.some( ( point, i ) => {

		const next = face[ ( i + 1 ) % face.length ];
		return point === a && next === b || point === b && next === a;

	} ) );
	data.faces.push( inheritMaterial( [ a, b, cap[ 1 ], cap[ 0 ] ], adjacent ) );
	return cap;

}

export function meshFromOutline( THREE, data ) {

	if ( ! isClosedOutline( data ) && data.kind !== 'profile' ) throw new Error( 'Close the outline before extruding.' );
	const points = outlinePoints( THREE, { ...data, closed: true }, 96 ).map( point => point.toArray() );
	const mesh = { kind: 'mesh', points, faces: [] };
	addFace( THREE, mesh, points.map( ( _, i ) => i ) );
	if ( data.depth > 0 ) extrudeFace( THREE, mesh, 0, data.depth );
	return mesh;

}

function polygonGeometry( THREE, data ) {

	const geometry = new THREE.BufferGeometry();
	const positions = [], normals = [], triangleFaces = [];
	const channels = new Map( [ [ 'uv', { size: 2, array: [] } ] ] );
	const grouped = data.faces.some( face => face.surface?.slot !== undefined );
	for ( const face of data.faces ) for ( const [ name, values ] of Object.entries( face.surface?.channels || {} ) ) {

		const size = values.find( Boolean )?.length;
		if ( ! size ) continue;
		if ( ! channels.has( name ) ) channels.set( name, { size, array: [] } );
		else channels.get( name ).size = Math.max( channels.get( name ).size, size );

	}
	for ( const [ faceIndex, face ] of data.faces.entries() ) {

		const vertices = face.map( index => data.points[ index ] );
		const projection = faceProjection( THREE, vertices );
		if ( ! projection ) continue;
		const { normal, outline } = projection;
		const box = new THREE.Box2().setFromPoints( outline );
		const size = box.getSize( new THREE.Vector2() );
		const start = positions.length / 3;
		for ( const triangle of THREE.ShapeUtils.triangulateShape( outline, [] ) ) {

			triangleFaces.push( faceIndex );
			for ( const index of triangle ) {

				positions.push( ...vertices[ index ] );
				normals.push( ...normal );
				const point = outline[ index ];
				for ( const [ name, channel ] of channels ) {

					const value = face.surface?.channels[ name ]?.[ index ] || ( name.startsWith( 'uv' ) ?
						[ ( point.x - box.min.x ) / ( size.x || 1 ), ( point.y - box.min.y ) / ( size.y || 1 ) ] : [] );
					for ( let axis = 0; axis < channel.size; axis ++ ) channel.array.push( value[ axis ] ?? ( name === 'color' ? 1 : 0 ) );

				}

			}

		}
		const slot = face.surface?.slot ?? 0;
		const count = positions.length / 3 - start;
		if ( grouped && count && slot >= 0 ) {

			const last = geometry.groups.at( -1 );
			if ( last?.materialIndex === slot && last.start + last.count === start ) last.count += count;
			else geometry.addGroup( start, count, slot );

		}

	}
	geometry.userData.triangleFaces = triangleFaces;
	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
	for ( const [ name, { array, size } ] of channels ) geometry.setAttribute( name, new THREE.Float32BufferAttribute( array, size ) );
	return geometry;

}

export function modelGeometry( THREE, data ) {

	let geometry;
	if ( data.kind === 'mesh' ) {

		geometry = polygonGeometry( THREE, data );

	} else {

		const points = outlinePoints( THREE, data );
		if ( data.kind === 'shape' && isClosedOutline( data ) && points.length >= 3 ) {

			const shape = new THREE.Shape( points.map( point => new THREE.Vector2( point.x, point.y ) ) );
			const surface = data.depth > 0 ?
				new THREE.ExtrudeGeometry( shape, { depth: data.depth, bevelEnabled: false } ) :
				new THREE.ShapeGeometry( shape );
			geometry = new THREE.BufferGeometry().copy( surface );
			surface.dispose();

		} else {

			if ( data.closed && points.length > 2 ) points.push( points[ 0 ] );
			geometry = new THREE.BufferGeometry().setFromPoints( data.kind === 'path' ? points : [] );

		}

	}
	geometry.userData.modeling = savedModeling( data );
	return geometry;

}

function savedModeling( data ) {

	return structuredClone( data.kind === 'mesh' ? { ...data, faces: data.faces.map( face => face.slice() ) } : data );

}

export function modelObject( THREE, data, name ) {

	const geometry = modelGeometry( THREE, data );
	const object = data.kind === 'path' ? new THREE.Line( geometry, new THREE.LineBasicMaterial( { color: 0x73d9f5 } ) ) :
		new THREE.Mesh( geometry, new THREE.MeshStandardMaterial( { color: 0xeeeeee, roughness: .9, side: THREE.DoubleSide } ) );
	object.name = name;
	if ( object.isMesh ) object.castShadow = object.receiveShadow = true;
	return object;

}

export function readModelGeometry( geometry, useAuthored = true ) {

	const data = geometry.userData.modeling;
	if ( useAuthored && data && data.kind !== 'vertices' ) {

		const copy = structuredClone( data );
		return copy.kind === 'mesh' ? readFaceAttributes( geometry, copy, true ) : copy;

	}
	const position = geometry.attributes.position;
	const points = [], vertices = [], coincident = new Map();
	// Keep UV seams and hard edges intact by moving coincident buffer vertices together.
	for ( let i = 0; i < position.count; i ++ ) {

		const point = [ position.getX( i ), position.getY( i ), position.getZ( i ) ];
		const key = point.join( ',' );
		if ( ! coincident.has( key ) ) {

			coincident.set( key, points.length );
			points.push( point );
			vertices.push( [] );

		}
		vertices[ coincident.get( key ) ].push( i );

	}
	const control = [];
	vertices.forEach( ( list, i ) => list.forEach( index => control[ index ] = i ) );
	const faces = [], index = geometry.index;
	for ( let i = 0, count = index?.count ?? position.count; i + 2 < count; i += 3 ) {

		const face = [ 0, 1, 2 ].map( offset => control[ index ? index.getX( i + offset ) : i + offset ] );
		faces.push( face );

	}
	return readFaceAttributes( geometry, { kind: 'vertices', points, vertices, faces }, false );
}

// Position-only edits keep the existing triangulation, UVs and material
// groups. Topology-changing edits use the regular geometry builder.
export function moveAuthoredMeshPoints( THREE, source, previous, next, reusable ) {

	const mapping = source.userData.triangleFaces;
	if ( ! mapping || previous.kind !== 'mesh' || previous.points.length !== next.points.length ||
		previous.faces.length !== next.faces.length || previous.faces.some( ( face, i ) =>
			face.length !== next.faces[ i ].length || face.some( ( point, j ) => point !== next.faces[ i ][ j ] ) ) ) return null;

	const position = source.attributes.position;
	const index = source.index;
	const references = new Map();
	const keys = previous.points.map( point => point.map( Math.fround ).join( ',' ) );
	const faces = previous.faces.map( face => new Map( face.map( point => [ keys[ point ], point ] ) ) );
	for ( const [ triangle, face ] of mapping.entries() ) {

		for ( let corner = 0; corner < 3; corner ++ ) {

			const row = triangle * 3 + corner;
			const vertex = index ? index.getX( row ) : row;
			const key = [ position.getX( vertex ), position.getY( vertex ), position.getZ( vertex ) ].join( ',' );
			const point = faces[ face ]?.get( key );
			if ( point === undefined || references.has( vertex ) && references.get( vertex ) !== point ) return null;
			references.set( vertex, point );

		}

	}
	const geometry = reusable || new THREE.BufferGeometry().copy( source );
	const target = geometry.attributes.position;
	for ( const [ vertex, point ] of references ) target.setXYZ( vertex, ...next.points[ point ] );
	target.needsUpdate = true;
	geometry.computeVertexNormals();
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	geometry.userData = { ...source.userData, modeling: savedModeling( next ) };
	return geometry;

}
