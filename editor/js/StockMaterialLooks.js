import { Color, MeshStandardMaterial, ObjectLoader, ShaderMaterial } from 'three';
import { hasRestriction } from './ObjectRestrictions.js';

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

const fragmentStart = ( value, legacy ) => /* glsl */`
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
	return max( strokeAt( plane.x, ${ value.gridWidth || '0.015' } ), strokeAt( plane.y, ${ value.gridWidth || '0.015' } ) );
}

void main() {
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	vec3 normal = normalize( lookViewNormal ) * ( gl_FrontFacing ? 1.0 : -1.0 );
	vec3 view = isOrthographic ? vec3( 0.0, 0.0, 1.0 ) : normalize( lookViewPosition );
	float facing = abs( dot( normal, view ) );
	float rim = 1.0 - smoothstep( ${ legacy ? '0.08' : 'outlineWidth * ( 8.0 / 19.0 )' }, ${ value.outlineWidth }, facing );
	float shade = clamp( dot( normal, normalize( vec3( -0.45, 0.72, 1.0 ) ) ) * 0.5 + 0.5, 0.0, 1.0 );
	vec3 weights = pow( abs( normalize( lookNormal ) ), vec3( 6.0 ) );
	weights /= max( dot( weights, vec3( 1.0 ) ), 0.0001 );
`;

const number = ( label, initial, min, max, step ) => ( { label, type: 'float', initial, min, max, step } );
const color = ( label, initial ) => ( { label, type: 'vec3', initial } );
const outlineWidth = number( 'Outline width', '0.19', 0.01, 0.9, 0.01 );

const looks = {
	lineDrawing: {
		label: 'Line drawing', fill: 0xf3eee1, ink: 0x242330,
		fields: { shadeThreshold: number( 'Shade threshold', '0.47', 0, 0.99, 0.01 ) },
		body: ( value, legacy ) => /* glsl */`
	float band = smoothstep( ${ value.shadeThreshold }, ${ legacy ? '0.48' : 'shadeThreshold + 0.01' }, shade );
	vec3 color = mix( fill * 0.72, fill, band );
	color = mix( color, ink, rim );
`
	},
	blueprint: {
		label: 'Blueprint', fill: 0x0e346a, ink: 0x9cecff,
		fields: {
			gridFrequency: number( 'Grid frequency', '8.0', 0.1, 80, 0.5 ),
			gridWidth: number( 'Grid line width', '0.015', 0.001, 0.25, 0.005 )
		},
		body: value => /* glsl */`
	vec3 position = lookPosition * ${ value.gridFrequency };
	vec3 fine = vec3( gridAt( position.yz ), gridAt( position.xz ), gridAt( position.xy ) );
	position *= 0.2;
	vec3 major = vec3( gridAt( position.yz ), gridAt( position.xz ), gridAt( position.xy ) );
	float rule = max( dot( fine, weights ) * 0.28, dot( major, weights ) * 0.64 );
	vec3 color = mix( fill * mix( 0.68, 1.3, shade ), ink, max( rule, rim ) );
`
	},
	sketch: {
		label: 'Sketch', fill: 0xf1dfbc, ink: 0x342b32,
		fields: {
			hatchFrequency: number( 'Hatch frequency', '25.0', 0.1, 100, 0.5 ),
			hatchWidth: number( 'Hatch width', '0.10', 0.01, 0.4, 0.01 )
		},
		body: ( value, legacy ) => /* glsl */`
	vec3 position = lookPosition * ${ value.hatchFrequency };
	vec3 diagonal = vec3( position.y + position.z, position.z + position.x, position.x + position.y );
	vec3 crosshatch = vec3( position.y - position.z, position.z - position.x, position.x - position.y );
	float first = dot( weights, vec3( strokeAt( diagonal.x, ${ value.hatchWidth } ), strokeAt( diagonal.y, ${ value.hatchWidth } ), strokeAt( diagonal.z, ${ value.hatchWidth } ) ) );
	float second = dot( weights, vec3( strokeAt( crosshatch.x, ${ legacy ? '0.07' : 'hatchWidth * 0.7' } ), strokeAt( crosshatch.y, ${ legacy ? '0.07' : 'hatchWidth * 0.7' } ), strokeAt( crosshatch.z, ${ legacy ? '0.07' : 'hatchWidth * 0.7' } ) ) );
	float hatch = max( first * ( 1.0 - smoothstep( 0.49, 0.82, shade ) ), second * ( 1.0 - smoothstep( 0.24, 0.61, shade ) ) );
	vec3 color = mix( fill * mix( 0.72, 1.0, shade ), ink, max( hatch, rim ) );
`
	},
	neon: {
		label: 'Neon', fill: 0x301063, ink: 0x55eaff,
		fields: {
			glowIntensity: number( 'Glow intensity', '1.8', 0, 12, 0.1 ),
			rimIntensity: number( 'Rim intensity', '2.5', 0, 12, 0.1 ),
			glowFalloff: number( 'Glow falloff', '3.0', 0.1, 12, 0.1 )
		},
		body: value => /* glsl */`
	float glow = pow( 1.0 - facing, ${ value.glowFalloff } );
	vec3 color = fill * ( 0.32 + shade * 0.74 ) + ink * ( glow * ${ value.glowIntensity } + rim * ${ value.rimIntensity } + 0.12 );
`
	}
};

const stockMaterialLooks = Object.fromEntries( Object.entries( looks ).map( ( [ id, look ] ) => [ id, look.label ] ) );

function glslColor( hex ) {

	return 'vec3( ' + new Color( hex ).toArray().map( channel => channel.toFixed( 6 ) ).join( ', ' ) + ' )';

}

function stockLookFields( id ) {

	if ( ! Object.hasOwn( looks, id ) ) return {};
	const look = looks[ id ];
	return { fill: color( 'Fill color', look.fill ), ink: color( 'Ink color', look.ink ), outlineWidth, ...look.fields };

}

function stockLookProgram( id, legacy = false ) {

	const look = looks[ id ];
	const fields = Object.entries( stockLookFields( id ) );
	const uniforms = Object.fromEntries( fields.map( ( [ key, { type, initial } ] ) =>
		[ key, { value: type === 'vec3' ? new Color( initial ) : Number( initial ) } ] ) );
	const values = Object.fromEntries( fields.map( ( [ key, field ] ) => [ key, legacy ? field.initial : key ] ) );
	const declarations = legacy ? '' : fields.map( ( [ key, field ] ) => 'uniform ' + field.type + ' ' + key + ';\n' ).join( '' );
	const legacyColors = legacy ? `
	const vec3 fill = ${ glslColor( look.fill ) };
	const vec3 ink = ${ glslColor( look.ink ) };` : '';
	const fragmentShader = declarations + fragmentStart( values, legacy ) + `${ legacyColors }
	${ look.body( values, legacy ) }
	gl_FragColor = vec4( color, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;
	return { uniforms, vertexShader, fragmentShader };

}

const liveBases = new WeakMap();

function createStockMaterialLook( id, previous ) {

	if ( ! Object.hasOwn( looks, id ) ) return null;
	const userData = { stockLook: id };
	const base = previous.userData.stockLook ? liveBases.get( previous ) : previous;
	const snapshot = previous.userData.stockLook ? previous.userData.stockLookBase : previous.toJSON();
	if ( snapshot ) userData.stockLookBase = snapshot;
	const material = new ShaderMaterial( {
		name: looks[ id ].label, side: previous.side, userData, ...stockLookProgram( id )
	} );
	if ( base ) liveBases.set( material, base );
	return material;

}

function upgradeStockMaterialLook( material ) {

	const id = material?.userData.stockLook;
	if ( ! Object.hasOwn( looks, id ) || ! material.isShaderMaterial || Object.keys( material.uniforms ).length ) return;
	if ( material.vertexShader !== vertexShader || material.fragmentShader !== stockLookProgram( id, true ).fragmentShader ) return;
	Object.assign( material, stockLookProgram( id ) );
	material.needsUpdate = true;

}

async function loadStockLookBase( material, materials, pending ) {

	const base = liveBases.get( material );
	if ( base ) return base;
	const snapshot = material.userData.stockLookBase;
	if ( ! snapshot ) return new MeshStandardMaterial( { side: material.side } );
	const existing = materials[ snapshot.uuid ];
	if ( existing ) return existing;
	if ( ! pending.has( snapshot.uuid ) ) pending.set( snapshot.uuid, parseStockLookBase( snapshot ) );
	return pending.get( snapshot.uuid );

}

async function parseStockLookBase( snapshot ) {

	const loader = new ObjectLoader();
	const images = await loader.parseImagesAsync( snapshot.images );
	const textures = loader.parseTextures( snapshot.textures, images );
	return loader.parseMaterials( [ snapshot ], textures )[ snapshot.uuid ];

}

function createCustomShaderMaterial( previous ) {

	return new ShaderMaterial( {
		name: 'Custom shader', side: previous.side,
		uniforms: { baseColor: { value: new Color( 0x83a9e1 ) } },
		fragmentShader: /* glsl */`
uniform vec3 baseColor;

void main() {
	gl_FragColor = vec4( baseColor, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`
	} );

}

// Collect scene-owned meshes, including meshes in nested groups.
function groupLookSlots( group ) {

	const slots = [];
	if ( hasRestriction( group, 'disabled' ) ) return slots;
	function visit( object ) {

		if ( object.userData.runtimeOnly || object.userData.threeditor?.disabled ) return;
		if ( object.isMesh ) {

			const materials = Array.isArray( object.material ) ? object.material : [ object.material ];
			materials.forEach( ( material, slot ) => { if ( material ) slots.push( { object, material, slot } ); } );

		}
		for ( const child of object.children ) visit( child );

	}
	visit( group );
	return slots;

}

export { createCustomShaderMaterial, createStockMaterialLook, groupLookSlots, loadStockLookBase,
	stockLookFields, stockMaterialLooks, upgradeStockMaterialLook };
