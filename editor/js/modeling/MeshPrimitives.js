import { cubeNetUV } from './CubeUV.js';
import { modelGeometry } from './ModelGeometry.js';

const length = ( id, label, value ) => ( { id, label, value, min: .001, max: 10000, step: 'any' } );
const segments = ( id, label, value, min = 3 ) => ( { id, label, value, min, max: 256, step: 1 } );
const size = blender => [ length( 'size', 'Size', blender ? 2 : 1 ) ];
const radial = ( blender, count = 32 ) => [
	length( 'radius', 'Radius', 1 ), length( 'depth', 'Depth', blender ? 2 : 1 ), segments( 'vertices', 'Vertices', count )
];

function cube( THREE, size ) {

	const s = size / 2;
	const faces = [ [ 0, 3, 2, 1 ], [ 4, 5, 6, 7 ], [ 0, 1, 5, 4 ], [ 3, 7, 6, 2 ], [ 0, 4, 7, 3 ], [ 1, 2, 6, 5 ] ];
	const points = [ [ -s, -s, -s ], [ s, -s, -s ], [ s, s, -s ], [ -s, s, -s ],
		[ -s, -s, s ], [ s, -s, s ], [ s, s, s ], [ -s, s, s ] ];
	const planes = [ [ 2, false ], [ 2, true ], [ 1, false ], [ 1, true ], [ 0, false ], [ 0, true ] ];
	for ( const [ index, [ axis, positive ] ] of planes.entries() ) {

		faces[ index ].surface = { channels: { uv: faces[ index ].map( vertex =>
			cubeNetUV( points[ vertex ].map( value => value > 0 ? 1 : 0 ), axis, positive, [ size, size, size ] ) ) } };

	}
	return modelGeometry( THREE, {
		kind: 'mesh',
		points,
		faces
	} );

}

function plane( THREE, size, ground ) {

	const s = size / 2;
	const points = ground ? [ [ -s, 0, s ], [ s, 0, s ], [ s, 0, -s ], [ -s, 0, -s ] ] :
		[ [ -s, -s, 0 ], [ s, -s, 0 ], [ s, s, 0 ], [ -s, s, 0 ] ];
	return modelGeometry( THREE, { kind: 'mesh', points, faces: [ [ 0, 1, 2, 3 ] ] } );

}

export const meshPrimitives = [
	[ 'box', 'Cube', ( THREE, blender, p ) => cube( THREE, p.size ), size ],
	[ 'capsule', 'Capsule', THREE => new THREE.CapsuleGeometry( 1, 1, 4, 8, 1 ) ],
	[ 'circle', 'Circle', ( THREE, blender, p ) => new THREE.CircleGeometry( p.radius, p.vertices ),
		() => [ length( 'radius', 'Radius', 1 ), segments( 'vertices', 'Vertices', 32 ) ] ],
	[ 'cone', 'Cone', ( THREE, blender, p ) => new THREE.ConeGeometry( p.radius, p.depth, p.vertices ), () => radial( true ) ],
	[ 'cylinder', 'Cylinder', ( THREE, blender, p ) => new THREE.CylinderGeometry( p.radius, p.radius, p.depth, p.vertices ), radial ],
	[ 'dodecahedron', 'Dodecahedron', THREE => new THREE.DodecahedronGeometry( 1, 0 ) ],
	[ 'icosahedron', 'Icosahedron', THREE => new THREE.IcosahedronGeometry( 1, 0 ) ],
	[ 'lathe', 'Lathe', THREE => new THREE.LatheGeometry() ],
	[ 'octahedron', 'Octahedron', THREE => new THREE.OctahedronGeometry( 1, 0 ) ],
	[ 'plane', 'Plane', ( THREE, blender, p ) => plane( THREE, p.size, blender ), size ],
	[ 'ring', 'Ring', THREE => new THREE.RingGeometry( .5, 1, 32 ) ],
	[ 'sphere', 'UV Sphere', ( THREE, blender, p ) => new THREE.SphereGeometry( p.radius, p.segments, p.rings ),
		() => [ length( 'radius', 'Radius', 1 ), segments( 'segments', 'Segments', 32 ), segments( 'rings', 'Rings', 16, 2 ) ] ],
	[ 'tetrahedron', 'Tetrahedron', THREE => new THREE.TetrahedronGeometry( 1, 0 ) ],
	[ 'torus', 'Torus', THREE => new THREE.TorusGeometry( 1, .4, 12, 48 ) ],
	[ 'torusknot', 'TorusKnot', THREE => new THREE.TorusKnotGeometry( 1, .4, 64, 8, 2, 3 ) ],
	[ 'tube', 'Tube', THREE => {

		const path = new THREE.CatmullRomCurve3( [
			new THREE.Vector3( 2, 2, -2 ), new THREE.Vector3( 2, -2, -2 / 3 ),
			new THREE.Vector3( -2, -2, 2 / 3 ), new THREE.Vector3( -2, 2, 2 )
		] );
		return new THREE.TubeGeometry( path, 64, 1, 8, false );

	} ]
].map( ( [ kind, name, create, fields ] ) => {

	const controls = fields || ( () => [ length( 'scale', 'Scale', 1 ) ] );
	const build = ( THREE, blender, values = Object.fromEntries( controls( blender ).map( field => [ field.id, field.value ] ) ) ) => {

		const geometry = create( THREE, blender, values );
		if ( fields || values.scale === 1 ) return geometry;
		const scaled = new THREE.BufferGeometry().copy( geometry );
		geometry.dispose();
		return scaled.scale( values.scale, values.scale, values.scale );

	};
	return [ kind, name, build, controls ];

} );
