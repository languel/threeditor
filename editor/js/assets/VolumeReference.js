import * as THREE from 'three';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { markModelReference } from '../modeling/ReferenceObjects.js';
import { parseVdb } from '../libs/openvdb/parser.mjs';

const corners = [ [ 0, 0, 0 ], [ 1, 0, 0 ], [ 1, 1, 0 ], [ 0, 1, 0 ],
	[ 0, 0, 1 ], [ 1, 0, 1 ], [ 1, 1, 1 ], [ 0, 1, 1 ] ];
const edges = [ [ 0, 1 ], [ 1, 2 ], [ 2, 3 ], [ 3, 0 ], [ 4, 5 ], [ 5, 6 ],
	[ 6, 7 ], [ 7, 4 ], [ 0, 4 ], [ 1, 5 ], [ 2, 6 ], [ 3, 7 ] ];

export function volumeSurface( grid ) {

	const { indexBBox, background } = grid;
	const span = indexBBox.max.map( ( value, i ) => value - indexBBox.min[ i ] + 1 );
	const stride = Math.max( 1, Math.ceil( Math.max( ...span ) / 96 ) );
	const origin = indexBBox.min.map( value => value - stride );
	const dimensions = span.map( value => Math.ceil( value / stride ) + 3 );
	const [ width, height, depth ] = dimensions;
	const offset = ( x, y, z ) => ( z * height + y ) * width + x;
	const field = new Float32Array( width * height * depth );
	const ix = [ 0, 0, 0 ];
	let low = Infinity, high = - Infinity;
	for ( let z = 0; z < depth; z ++ ) for ( let y = 0; y < height; y ++ ) for ( let x = 0; x < width; x ++ ) {

		ix[ 0 ] = origin[ 0 ] + x * stride;
		ix[ 1 ] = origin[ 1 ] + y * stride;
		ix[ 2 ] = origin[ 2 ] + z * stride;
		const sampled = grid.readValue( ix ).value;
		const density = Number.isFinite( sampled ) ? sampled : background;
		field[ offset( x, y, z ) ] = density;
		low = Math.min( low, density );
		high = Math.max( high, density );

	}
	if ( ! Number.isFinite( low ) || ! Number.isFinite( high ) || low === high ) throw new Error( 'The VDB grid has no surface at this sampling resolution.' );
	const levelSet = background > 0 && low < 0;
	const iso = levelSet ? 0 : low + ( high - low ) * .15;
	const matrix = new THREE.Matrix4().set( ...grid.transform.matrix );
	const points = [];
	const values = new Float32Array( 8 );
	const hit = Array.from( { length: 12 }, () => new THREE.Vector3() );
	for ( let z = 0; z + 1 < depth; z ++ ) for ( let y = 0; y + 1 < height; y ++ ) for ( let x = 0; x + 1 < width; x ++ ) {

		let pattern = 0;
		for ( const [ i, [ dx, dy, dz ] ] of corners.entries() ) {

			const value = values[ i ] = field[ offset( x + dx, y + dy, z + dz ) ];
			if ( levelSet ? value < iso : value > iso ) pattern |= 1 << i;

		}
		const flags = edgeTable[ pattern ];
		if ( ! flags ) continue;
		for ( const [ i, [ a, b ] ] of edges.entries() ) {

			if ( ! ( flags & 1 << i ) ) continue;
			const ratio = ( iso - values[ a ] ) / ( values[ b ] - values[ a ] );
			const p = corners[ a ], q = corners[ b ];
			hit[ i ].set(
				origin[ 0 ] + stride * ( x + p[ 0 ] + ratio * ( q[ 0 ] - p[ 0 ] ) ),
				origin[ 1 ] + stride * ( y + p[ 1 ] + ratio * ( q[ 1 ] - p[ 1 ] ) ),
				origin[ 2 ] + stride * ( z + p[ 2 ] + ratio * ( q[ 2 ] - p[ 2 ] ) )
			).applyMatrix4( matrix );

		}
		const end = ( pattern + 1 ) * 16;
		for ( let i = pattern * 16; i < end && triTable[ i ] !== - 1; i ++ ) {

			const p = hit[ triTable[ i ] ];
			points.push( p.x, p.y, p.z );

		}
		if ( points.length > 3600000 ) throw new Error( 'The VDB surface is too dense for a modeling reference.' );

	}
	if ( ! points.length ) throw new Error( 'No surface could be extracted from the VDB grid.' );
	const geometry = new THREE.BufferGeometry().setAttribute( 'position', new THREE.Float32BufferAttribute( points, 3 ) );
	geometry.computeVertexNormals();
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	return { geometry, iso, stride };

}

export async function loadVolumeReference( file ) {

	const { grids } = parseVdb( await file.arrayBuffer() );
	const scalar = grids.filter( grid => grid.valueType === 'float' && grid.indexBBox );
	const grid = scalar.find( grid => /density|level.?set|surface|sdf/i.test( grid.name ) ) || scalar[ 0 ];
	if ( ! grid ) throw new Error( 'Choose an OpenVDB file with a scalar density or level-set grid.' );
	const { geometry, iso, stride } = volumeSurface( grid );
	const material = new THREE.MeshStandardMaterial( { color: 0x7bafcb, roughness: .8, side: THREE.DoubleSide } );
	const object = markModelReference( new THREE.Mesh( geometry, material ), 'volume' );
	object.userData.modelReference = { kind: 'volume', grid: grid.name, isovalue: iso, stride };
	object.name = file.name.replace( /\.vdb$/i, '' ) + ' · VDB reference';
	return object;

}
