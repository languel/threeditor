import * as THREE from 'three';
import { NodeMaterial, QuadMesh } from 'three/webgpu';
import { Fn, Loop, float, texture, uniform, uv, vec2, vec4 } from 'three/tsl';
import { isVisible, withEnabledObjects } from './ObjectRestrictions.js';

export const SELECTED_OUTLINE = 0xff8a24;
export const ACTIVE_OUTLINE = 0xffbd66;

export function supportsSelectionOutline( renderer ) {

	return ( renderer.isWebGLRenderer || renderer.isWebGPURenderer ) && ! renderer.xr.isPresenting;

}

// Adapted from ThreeGrease's render/outline.ts: isolate the selection using
// its own materials, then dilate its alpha silhouette by two screen pixels.
// This preserves cutouts, strokes, points, skinning and shader deformation.
const vertexShader = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const fragmentShader = `
varying vec2 vUv;
uniform sampler2D tMask;
uniform vec2 uTexel;
uniform float uWidth;
uniform vec3 uColor;
float inside(vec2 uv) {
	if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
	return step(0.22, texture2D(tMask, uv).a);
}
void main() {
	if (inside(vUv) > 0.5) discard;
	float hit = 0.0;
	for (int i = 0; i < 16; i++) {
		float a = float(i) * 0.39269908;
		vec2 d = vec2(cos(a), sin(a)) * uTexel * uWidth;
		hit = max(hit, inside(vUv + d));
		hit = max(hit, inside(vUv + d * 0.5));
	}
	if (hit < 0.5) discard;
	gl_FragColor = vec4(uColor, 1.0);
	#include <colorspace_fragment>
}
`;

export function hasSelectionSurface( root ) {

	let drawable = false;
	root.traverseVisible( object => {

		if ( ! isVisible( object ) ) return;
		if ( object.splats || object.userData.hasSplat ) drawable = true;
		const materials = Array.isArray( object.material ) ? object.material : [ object.material ];
		if ( ( object.isMesh || object.isLine || object.isPoints || object.isSprite ) &&
			materials.some( material => material?.visible && ( ! material.transparent || material.opacity > 0 ) ) ) drawable = true;

	} );
	return drawable;

}

// Keep selected descendants and their ancestor path, but don't draw an
// unselected mesh ancestor. Layers affect its drawing without hiding children.
export function withSelectionOnly( scene, roots, draw ) {

	const keep = new Set( roots );
	const path = new Set();
	for ( const root of roots ) for ( let parent = root.parent; parent; parent = parent.parent ) path.add( parent );
	const hidden = [], layers = [];
	function walk( object ) {

		for ( const child of object.children ) {

			if ( keep.has( child ) ) continue;
			if ( path.has( child ) ) {

				if ( child.material ) { layers.push( [ child, child.layers.mask ] ); child.layers.mask = 0; }
				walk( child );

			} else if ( child.visible && ! child.isLight ) {

				child.visible = false;
				hidden.push( child );

			}

		}

	}
	walk( scene );
	try { return withEnabledObjects( scene, draw ); }
	finally {

		for ( const object of hidden ) object.visible = true;
		for ( const [ object, mask ] of layers ) object.layers.mask = mask;

	}

}

export class SelectionOutline {

	constructor() {

		this.mask = new THREE.WebGLRenderTarget( 1, 1 );
		this.material = new THREE.ShaderMaterial( {
			vertexShader, fragmentShader,
			uniforms: {
				tMask: { value: this.mask.texture },
				uTexel: { value: new THREE.Vector2() },
				uWidth: { value: 2 },
				uColor: { value: new THREE.Color( SELECTED_OUTLINE ) }
			},
			transparent: true, depthTest: false, depthWrite: false, toneMapped: false
		} );
		this.quad = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), this.material );
		this.scene = new THREE.Scene();
		this.scene.add( this.quad );
		this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );

	}

	drawWebGPU( renderer ) {

		if ( ! this.gpuQuad ) {

			const texel = uniform( this.material.uniforms.uTexel.value );
			const width = uniform( this.material.uniforms.uWidth.value );
			const color = uniform( this.material.uniforms.uColor.value );
			const mask = texture( this.mask.texture );
			const inside = coord => mask.sample( coord ).a.greaterThanEqual( .22 ).and(
				coord.x.greaterThanEqual( 0 ).and( coord.y.greaterThanEqual( 0 ) ).and( coord.x.lessThanEqual( 1 ) ).and( coord.y.lessThanEqual( 1 ) )
			);
			const material = new NodeMaterial();
			material.transparent = true;
			material.toneMapped = material.depthTest = material.depthWrite = false;
			material.fragmentNode = Fn( () => {

				const coord = uv();
				inside( coord ).discard();
				const hit = float( 0 ).toVar();
				Loop( 16, ( { i } ) => {

					const angle = float( i ).mul( Math.PI / 8 );
					const offset = vec2( angle.cos(), angle.sin() ).mul( texel ).mul( width );
					hit.assign( hit.max( float( inside( coord.add( offset ) ) ) ).max( float( inside( coord.add( offset.mul( .5 ) ) ) ) ) );

				} );
				hit.lessThan( .5 ).discard();
				return vec4( color, 1 );

			} )();
			this.gpuQuad = new QuadMesh( material );
			this.gpuWidth = width;

		}
		this.gpuWidth.value = this.material.uniforms.uWidth.value;
		this.gpuQuad.render( renderer );

	}

	draw( renderer, scene, camera, roots, renderMask, color = SELECTED_OUTLINE ) {

		if ( ! roots.length || ! supportsSelectionOutline( renderer ) ) return;
		const viewport = renderer.getViewport( new THREE.Vector4() );
		const scissor = renderer.getScissor( new THREE.Vector4() );
		const scissorTest = renderer.getScissorTest();
		const target = renderer.getRenderTarget();
		const clearColor = renderer.getClearColor( new THREE.Color() );
		const clearAlpha = renderer.getClearAlpha();
		const autoClear = renderer.autoClear;
		const shadowUpdate = renderer.shadowMap.autoUpdate;
		const shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
		const background = scene.background, fog = scene.fog, override = scene.overrideMaterial;
		const ratio = target ? 1 : renderer.getPixelRatio();
		const width = Math.max( 1, Math.round( viewport.z * ratio ) );
		const height = Math.max( 1, Math.round( viewport.w * ratio ) );
		this.mask.setSize( width, height );
		this.material.uniforms.uTexel.value.set( 1 / width, 1 / height );
		this.material.uniforms.uWidth.value = 2 * ratio;
		this.material.uniforms.uColor.value.setHex( color );
		try {

			scene.background = null;
			scene.fog = null;
			scene.overrideMaterial = null;
			renderer.shadowMap.autoUpdate = renderer.shadowMap.needsUpdate = false;
			renderer.setRenderTarget( this.mask );
			renderer.setClearColor( 0x000000, 0 );
			renderer.autoClear = false;
			renderer.clear();
			withSelectionOnly( scene, roots, () => renderMask( camera ) );
			renderer.setRenderTarget( target );
			renderer.setViewport( viewport );
			renderer.setScissor( scissor );
			renderer.setScissorTest( scissorTest );
			if ( renderer.isWebGPURenderer ) this.drawWebGPU( renderer );
			else renderer.render( this.scene, this.camera );

		} finally {

			scene.background = background;
			scene.fog = fog;
			scene.overrideMaterial = override;
			renderer.setRenderTarget( target );
			renderer.setViewport( viewport );
			renderer.setScissor( scissor );
			renderer.setScissorTest( scissorTest );
			renderer.setClearColor( clearColor, clearAlpha );
			renderer.autoClear = autoClear;
			renderer.shadowMap.autoUpdate = shadowUpdate;
			renderer.shadowMap.needsUpdate = shadowNeedsUpdate;

		}

	}

	dispose() {

		this.mask.dispose();
		this.material.dispose();
		this.quad.geometry.dispose();
		this.gpuQuad?.material.dispose();

	}

}
