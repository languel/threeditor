import { FramebufferTexture, HalfFloatType, Matrix4, ShaderMaterial, UnsignedByteType, Vector2, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const vertexShader = /* glsl */`
	varying vec2 screenUV;
	void main() {
		screenUV = uv;
		gl_Position = vec4( position.xy, 0.0, 1.0 );
	}
`;

function radicalInverse( index, base ) {

	let value = 0, scale = 1 / base;
	while ( index > 0 ) {

		value += ( index % base ) * scale;
		index = Math.floor( index / base );
		scale /= base;

	}
	return value;

}

// Progressive antialiasing for effects outside the path tracer's scene model.
// Capture the viewport's normal color pass, including splats and post effects.
export class ViewportAccumulation {

	constructor( renderer ) {

		this.renderer = renderer;
		this.samples = 0;
		this.size = new Vector2();
		this.shift = new Matrix4();
		this.projection = new Matrix4();
		this.blend = new ShaderMaterial( {
			vertexShader,
			uniforms: { current: { value: null }, history: { value: null }, weight: { value: 1 } },
			fragmentShader: /* glsl */`
				uniform sampler2D current;
				uniform sampler2D history;
				uniform float weight;
				varying vec2 screenUV;
				void main() {
					vec4 sampleColor = sRGBTransferEOTF( texture2D( current, screenUV ) );
					gl_FragColor = mix( texture2D( history, screenUV ), sampleColor, weight );
				}
			`,
			depthTest: false, depthWrite: false, toneMapped: false
		} );
		this.output = new ShaderMaterial( {
			vertexShader,
			uniforms: { image: { value: null } },
			fragmentShader: /* glsl */`
				uniform sampler2D image;
				varying vec2 screenUV;
				void main() {
					gl_FragColor = texture2D( image, screenUV );
					#include <colorspace_fragment>
				}
			`,
			depthTest: false, depthWrite: false, toneMapped: false
		} );
		this.quad = new FullScreenQuad( this.blend );

	}

	reset() {

		this.samples = 0;

	}

	update( camera, draw ) {

		const renderer = this.renderer;
		const { x: width, y: height } = renderer.getDrawingBufferSize( this.size );
		if ( ! width || ! height ) return 0;
		if ( this.capture?.image.width !== width || this.capture?.image.height !== height ) {

			this.capture?.dispose();
			this.capture = new FramebufferTexture( width, height );
			for ( const buffer of this.buffers || [] ) buffer.dispose();
			const type = renderer.extensions.has( 'EXT_color_buffer_float' ) ? HalfFloatType : UnsignedByteType;
			this.buffers = Array.from( { length: 2 }, () =>
				new WebGLRenderTarget( width, height, { type, depthBuffer: false } ) );
			this.reset();

		}
		if ( this.samples < 32 ) {

			const next = this.samples + 1;
			this.projection.copy( camera.projectionMatrix );
			this.shift.makeTranslation( 2 * ( radicalInverse( next, 2 ) - .5 ) / width,
				2 * ( radicalInverse( next, 3 ) - .5 ) / height, 0 );
			camera.projectionMatrix.premultiply( this.shift );
			camera.projectionMatrixInverse.copy( camera.projectionMatrix ).invert();
			try {

				draw();
				renderer.copyFramebufferToTexture( this.capture );

			} finally {

				camera.projectionMatrix.copy( this.projection );
				camera.projectionMatrixInverse.copy( this.projection ).invert();

			}
			const target = this.buffers[ next % 2 ];
			this.blend.uniforms.current.value = this.capture;
			this.blend.uniforms.history.value = this.buffers[ this.samples % 2 ].texture;
			this.blend.uniforms.weight.value = 1 / next;
			this.quad.material = this.blend;
			renderer.setRenderTarget( target );
			try {

				this.quad.render( renderer );

			} finally {

				renderer.setRenderTarget( null );

			}
			this.samples = next;

		}
		this.output.uniforms.image.value = this.buffers[ this.samples % 2 ].texture;
		this.quad.material = this.output;
		this.quad.render( renderer );
		return this.samples;

	}

	dispose() {

		this.capture?.dispose();
		for ( const buffer of this.buffers || [] ) buffer.dispose();
		this.blend.dispose();
		this.output.dispose();
		this.quad.dispose();

	}

}
