export const grainTileSize = 64;

function noise( x, y ) {

	let hash = Math.imul( x + 43, 374761393 ) ^ Math.imul( y + 71, 668265263 );
	hash = Math.imul( hash ^ ( hash >>> 13 ), 1274126177 );
	return ( ( hash ^ ( hash >>> 16 ) ) >>> 0 ) / 4294967295;

}

// A repeatable tile mixes coarse tooth with fine flecks. The fiber direction
// stretches along the stroke's U axis and across the long side of a stamp.
export function grainOpacity( grain, pattern ) {

	const opacity = new Uint8Array( grainTileSize * grainTileSize );
	for ( let y = 0; y < grainTileSize; y ++ ) for ( let x = 0; x < grainTileSize; x ++ ) {

		const fiber = pattern === 'fiber';
		const coarse = noise( Math.floor( x / ( fiber ? 16 : 4 ) ), Math.floor( y / 4 ) );
		const fleck = noise( Math.floor( x / ( fiber ? 4 : 1 ) ), y );
		const tooth = coarse * .60 + fleck * .40;
		const warp = Math.cos( x * Math.PI / 4 ), weft = Math.cos( y * Math.PI / 4 );
		const weave = .5 + .25 * ( warp + weft ) * ( ( ( x >> 3 ) + ( y >> 3 ) ) % 2 ? -1 : 1 );
		const surface = pattern === 'canvas' ? .7 * weave + .3 * tooth : tooth;
		const coverage = Math.min( 1, Math.max( 0, ( surface - ( pattern === 'speckle' ? .32 : .19 ) ) * 2.5 ) );
		opacity[ y * grainTileSize + x ] = Math.round( 255 * ( 1 - grain * ( 1 - coverage ) ) );

	}
	return opacity;

}

const textures = new WeakMap();

export function pencilGrainTexture( THREE, brush, alphaMask = false ) {

	if ( ! ( brush.grain > 0 ) ) return null;
	const cache = textures.get( THREE ) || new Map();
	textures.set( THREE, cache );
	const key = [ brush.grain, brush.grainPattern, alphaMask ].join( '/' );
	if ( cache.has( key ) ) return cache.get( key );
	const alpha = grainOpacity( brush.grain, brush.grainPattern );
	const rgba = new Uint8Array( alpha.length * 4 ).fill( 255 );
	alpha.forEach( ( value, i ) => { rgba[ i * 4 + ( alphaMask ? 1 : 3 ) ] = value; } );
	const texture = new THREE.DataTexture( rgba, grainTileSize, grainTileSize, THREE.RGBAFormat );
	texture.name = 'Pencil grain · ' + ( brush.grainPattern || 'paper' );
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	cache.set( key, texture );
	return texture;

}
