import { MeshBasicMaterial, MeshMatcapMaterial, MeshNormalMaterial } from 'three';

export const shadingModes = [
	[ 'realistic', 'Rendered', 'shadingRendered' ],
	[ 'solid', 'Solid', 'shadingSolid' ],
	[ 'materials', 'Material Preview', 'shadingMaterial' ],
	[ 'wireframe', 'Wireframe', 'shadingWire' ],
	[ 'normals', 'Normals', 'shadingNormals' ],
	[ 'preview', 'Clean Preview', 'preview' ]
];

const factories = {
	solid: () => new MeshMatcapMaterial( { color: 0xaaaaaa, toneMapped: false } ),
	normals: () => new MeshNormalMaterial(),
	wireframe: () => new MeshBasicMaterial( { color: 0x9aabbc, wireframe: true, toneMapped: false } )
};

const overrides = new Map();

function meshOverride( mode, material ) {

	if ( ! material || ! material.visible || material.allowOverride === false ) return material;

	const key = mode + ':' + material.side;
	if ( ! overrides.has( key ) ) {

		const replacement = factories[ mode ]();
		replacement.side = material.side;
		overrides.set( key, replacement );

	}
	return overrides.get( key );

}

// Only substitute mesh materials during the draw. Scan renderers, points,
// lines, sprites and the original materials keep their own render state.
export function withViewportShading( scene, mode, draw ) {

	if ( ! Object.hasOwn( factories, mode ) ) return draw();

	const originals = [];
	try {

		scene.traverseVisible( object => {

			if ( ! object.isMesh || ! object.material ) return;
			const original = object.material;
			originals.push( [ object, original ] );
			object.material = Array.isArray( original ) ? original.map( material => meshOverride( mode, material ) ) : meshOverride( mode, original );

		} );
		return draw();

	} finally {

		for ( const [ object, material ] of originals ) object.material = material;

	}

}
