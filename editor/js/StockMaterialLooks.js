import { Color, ShaderMaterial } from 'three';

const vertexShader = /* glsl */`
#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

varying vec3 lookPosition;
varying vec3 lookNormal;
varying vec3 lookViewPosition;
varying vec3 lookViewNormal;

void main() {
	#include <morphinstance_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	lookPosition = position;
	lookNormal = normal;
	lookViewPosition = -mvPosition.xyz;
	lookViewNormal = transformedNormal;
}
`;

const fragmentStart = /* glsl */`
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

varying vec3 lookPosition;
varying vec3 lookNormal;
varying vec3 lookViewPosition;
varying vec3 lookViewNormal;

// Narrow repeating strokes with analytic pixel coverage.
float strokeAt( float coordinate, float width ) {
	float pixel = max( fwidth( coordinate ), 0.0001 );
	float distanceToStroke = abs( fract( coordinate + 0.5 ) - 0.5 );
	return ( 1.0 - smoothstep( width - pixel * 0.5, width + pixel * 0.5, distanceToStroke ) )
		* ( 1.0 - smoothstep( 0.4, 0.8, pixel ) );
}

float gridAt( vec2 plane ) {
	return max( strokeAt( plane.x, 0.015 ), strokeAt( plane.y, 0.015 ) );
}

void main() {
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	vec3 normal = normalize( lookViewNormal ) * ( gl_FrontFacing ? 1.0 : -1.0 );
	vec3 view = isOrthographic ? vec3( 0.0, 0.0, 1.0 ) : normalize( lookViewPosition );
	float facing = abs( dot( normal, view ) );
	float rim = 1.0 - smoothstep( 0.08, 0.19, facing );
	float shade = clamp( dot( normal, normalize( vec3( -0.45, 0.72, 1.0 ) ) ) * 0.5 + 0.5, 0.0, 1.0 );
	vec3 weights = pow( abs( normalize( lookNormal ) ), vec3( 6.0 ) );
	weights /= max( dot( weights, vec3( 1.0 ) ), 0.0001 );
`;

const looks = {
	lineDrawing: {
		label: 'Line drawing', fill: 0xf3eee1, ink: 0x242330,
		body: /* glsl */`
	float band = smoothstep( 0.47, 0.48, shade );
	vec3 color = mix( fill * 0.72, fill, band );
	color = mix( color, ink, rim );
`
	},
	blueprint: {
		label: 'Blueprint', fill: 0x0e346a, ink: 0x9cecff,
		body: /* glsl */`
	vec3 position = lookPosition * 8.0;
	vec3 fine = vec3( gridAt( position.yz ), gridAt( position.xz ), gridAt( position.xy ) );
	position *= 0.2;
	vec3 major = vec3( gridAt( position.yz ), gridAt( position.xz ), gridAt( position.xy ) );
	float rule = max( dot( fine, weights ) * 0.28, dot( major, weights ) * 0.64 );
	vec3 color = mix( fill * mix( 0.68, 1.3, shade ), ink, max( rule, rim ) );
`
	},
	sketch: {
		label: 'Sketch', fill: 0xf1dfbc, ink: 0x342b32,
		body: /* glsl */`
	vec3 position = lookPosition * 25.0;
	vec3 diagonal = vec3( position.y + position.z, position.z + position.x, position.x + position.y );
	vec3 crosshatch = vec3( position.y - position.z, position.z - position.x, position.x - position.y );
	float first = dot( weights, vec3( strokeAt( diagonal.x, 0.10 ), strokeAt( diagonal.y, 0.10 ), strokeAt( diagonal.z, 0.10 ) ) );
	float second = dot( weights, vec3( strokeAt( crosshatch.x, 0.07 ), strokeAt( crosshatch.y, 0.07 ), strokeAt( crosshatch.z, 0.07 ) ) );
	float hatch = max( first * ( 1.0 - smoothstep( 0.49, 0.82, shade ) ), second * ( 1.0 - smoothstep( 0.24, 0.61, shade ) ) );
	vec3 color = mix( fill * mix( 0.72, 1.0, shade ), ink, max( hatch, rim ) );
`
	},
	neon: {
		label: 'Neon', fill: 0x301063, ink: 0x55eaff,
		body: /* glsl */`
	float glow = pow( 1.0 - facing, 3.0 );
	vec3 color = fill * ( 0.32 + shade * 0.74 ) + ink * ( glow * 1.8 + rim * 2.5 + 0.12 );
`
	}
};

const stockMaterialLooks = Object.fromEntries( Object.entries( looks ).map( ( [ id, look ] ) => [ id, look.label ] ) );

function glslColor( hex ) {

	return 'vec3( ' + new Color( hex ).toArray().map( channel => channel.toFixed( 6 ) ).join( ', ' ) + ' )';

}

function createStockMaterialLook( id, previous ) {

	const look = Object.hasOwn( looks, id ) ? looks[ id ] : null;
	if ( ! look ) return null;

	return new ShaderMaterial( {
		name: look.label,
		side: previous.side,
		userData: { stockLook: id },
		vertexShader,
		fragmentShader: fragmentStart + `
	const vec3 fill = ${ glslColor( look.fill ) };
	const vec3 ink = ${ glslColor( look.ink ) };
	${ look.body }
	gl_FragColor = vec4( color, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`
	} );

}

export { createStockMaterialLook, stockMaterialLooks };
