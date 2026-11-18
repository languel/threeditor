import * as THREE from 'three';
import { withEnabledObjects } from '../ObjectRestrictions.js';

// Adapted from ThreeGrease's camera-to-UV bake. This pass interpolates
// world position directly in UV space and depth-tests it in the source view.
const vertexShader = /* glsl */`
	varying vec3 worldPoint;
	void main() {
		worldPoint = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
		gl_Position = vec4( uv * 2.0 - 1.0, 0.5, 1.0 );
	}
`;
const fragmentShader = /* glsl */`
	uniform sampler2D sourceColor;
	uniform sampler2D sourceDepth;
	uniform mat4 sourceViewProjection;
	uniform vec2 depthScale;
	uniform vec4 projectionCrop;
	uniform bool projectorFrame;
	uniform bool reversed;
	varying vec3 worldPoint;

	float viewDepth( float ndc ) {
		return abs( ( depthScale.y ) / ( depthScale.x - ndc ) );
	}
	vec3 toSRGB( vec3 linear ) {
		return mix( linear * 12.92, 1.055 * pow( max( linear, vec3( 0.0 ) ), vec3( 1.0 / 2.4 ) ) - 0.055,
			step( vec3( 0.0031308 ), linear ) );
	}
	void main() {
		// Mark covered but occluded texels so island padding leaves them clear.
		gl_FragColor = vec4( 0.0, 1.0, 0.0, 0.0 );
		vec4 clip = sourceViewProjection * vec4( worldPoint, 1.0 );
		if ( clip.w <= 0.0 ) return;
		vec3 ndc = clip.xyz / clip.w;
		if ( any( greaterThan( abs( ndc.xy ), vec2( 1.0 ) ) ) || ndc.z < ( reversed ? 0.0 : -1.0 ) || ndc.z > 1.0 ) return;

		vec2 px = ndc.xy * 0.5 + 0.5;
		float sampled = texture2D( sourceDepth, px ).x;
		if ( reversed ? sampled <= 0.0 : sampled >= 1.0 ) return;
		float surface = reversed ? sampled : 2.0 * sampled - 1.0;
		// A perspective clip W is distance from the source camera. An
		// orthographic projection compares Z directly in world units.
		bool perspective = depthScale.y != 0.0;
		float depth = perspective ? clip.w : ndc.z;
		float nearest = perspective ? viewDepth( surface ) : surface;
		float error = perspective ? depth - nearest : ( reversed ? nearest - depth : depth - nearest );
		if ( error > ( perspective ? max( 0.002, depth * 0.002 ) : 0.0002 ) ) return;

		vec2 uv = projectorFrame ? projectionCrop.xy + px * projectionCrop.zw : px;
		gl_FragColor = vec4( toSRGB( texture2D( sourceColor, uv ).rgb ), 1.0 );
	}
`;

function withWhiteSurfaces( scene, draw ) {

	const originals = new Map(), white = new Map();
	const neutral = material => {

		if ( ! white.has( material ) ) white.set( material, new THREE.MeshStandardMaterial( {
			color: 0xffffff, roughness: 1, metalness: 0, side: material.side, visible: material.visible,
			alphaTest: material.alphaTest, alphaMap: material.alphaMap,
			transparent: material.transparent, opacity: material.opacity,
			depthWrite: material.depthWrite
		} ) );
		return white.get( material );

	};
	try {

		scene.traverseVisible( object => {

			if ( ! object.isMesh || ! object.material ) return;
			originals.set( object, object.material );
			object.material = Array.isArray( object.material ) ? object.material.map( neutral ) : neutral( object.material );

		} );
		return draw();

	} finally {

		for ( const [ object, material ] of originals ) object.material = material;
		for ( const material of white.values() ) material.dispose();

	}

}

function toCanvas( pixels, size ) {

	// A small gutter prevents bilinear sampling from pulling in empty texels.
	const filled = [];
	for ( let pass = 0; pass < 4; pass ++ ) {

		filled.length = 0;
		for ( let y = 0; y < size; y ++ ) for ( let x = 0; x < size; x ++ ) {

			const dst = ( y * size + x ) * 4;
			if ( pixels[ dst + 3 ] || pixels[ dst + 1 ] ) continue;
			for ( const src of [ x > 0 ? dst - 4 : -1, x + 1 < size ? dst + 4 : -1,
				y > 0 ? dst - size * 4 : -1, y + 1 < size ? dst + size * 4 : -1 ] ) {

				if ( src < 0 || pixels[ src + 3 ] !== 255 ) continue;
				filled.push( dst, src );
				break;

			}

		}
		if ( ! filled.length ) break;
		for ( let i = 0; i < filled.length; i += 2 ) pixels.copyWithin( filled[ i ], filled[ i + 1 ], filled[ i + 1 ] + 4 );

	}
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = size;
	const context = canvas.getContext( '2d' );
	const image = context.createImageData( size, size );
	let coverage = false;
	for ( let y = 0; y < size; y ++ ) {

		const row = pixels.subarray( y * size * 4, ( y + 1 ) * size * 4 );
		for ( let i = 0; i < row.length; i += 4 ) {

			if ( row[ i + 3 ] ) coverage = true;
			else row[ i + 1 ] = 0;

		}
		image.data.set( row, ( size - 1 - y ) * size * 4 );

	}
	if ( ! coverage ) throw new Error( 'The source view could not see any of the UV surface.' );
	context.putImageData( image, 0, 0 );
	return canvas;

}

export function bakeTexture( renderer, scene, object, geometry, camera, { size, mode, output } ) {

	if ( ! renderer?.isWebGLRenderer || renderer.xr.isPresenting ) throw new Error( 'Texture baking requires the WebGL renderer.' );
	if ( ! geometry.getAttribute( 'uv' ) ) throw new Error( 'Unwrap the mesh before baking.' );
	if ( mode === 'projector' && ! output?.canvas ) throw new Error( 'Choose a projector with an active texture output.' );

	const aspect = camera.isOrthographicCamera ? ( camera.right - camera.left ) / ( camera.top - camera.bottom ) : camera.aspect;
	const sourceSize = Math.min( Math.max( 512, size ), renderer.capabilities.maxTextureSize );
	const width = Math.max( 1, Math.round( sourceSize * Math.min( 1, aspect ) ) );
	const height = Math.max( 1, Math.round( sourceSize * Math.min( 1, 1 / aspect ) ) );
	const source = new THREE.WebGLRenderTarget( width, height, { depthTexture: new THREE.DepthTexture( width, height ) } );
	const atlas = new THREE.WebGLRenderTarget( size, size, { depthBuffer: false } );
	const projectorTexture = mode === 'projector' ? new THREE.CanvasTexture( output.canvas ) : null;
	const crop = new THREE.Vector4( 0, 0, 1, 1 );
	if ( projectorTexture ) {

		const { canvas, x, y, width, height } = output;
		projectorTexture.colorSpace = THREE.SRGBColorSpace;
		crop.set( x / canvas.width, 1 - ( y + height ) / canvas.height, width / canvas.width, height / canvas.height );

	}
	const material = new THREE.ShaderMaterial( {
		vertexShader, fragmentShader, side: THREE.DoubleSide, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
		uniforms: {
			sourceColor: { value: projectorTexture || source.texture }, sourceDepth: { value: source.depthTexture },
			sourceViewProjection: { value: new THREE.Matrix4() }, depthScale: { value: new THREE.Vector2() },
			projectionCrop: { value: crop }, projectorFrame: { value: Boolean( projectorTexture ) }, reversed: { value: false }
		}
	} );
	const proxy = new THREE.Mesh( geometry, material );
	proxy.frustumCulled = false;
	proxy.matrixAutoUpdate = false;
	object.updateWorldMatrix( true, false );
	proxy.matrix.copy( object.matrixWorld );
	const uvScene = new THREE.Scene();
	uvScene.add( proxy );

	const target = renderer.getRenderTarget(), cubeFace = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
	const color = renderer.getClearColor( new THREE.Color() ), alpha = renderer.getClearAlpha(), auto = renderer.autoClear;
	const shadowEnabled = renderer.shadowMap.enabled, shadowUpdate = renderer.shadowMap.autoUpdate, shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
	const background = scene.background, fog = scene.fog, override = scene.overrideMaterial, environment = scene.environment;
	try {

		scene.background = scene.fog = scene.overrideMaterial = null;
		if ( mode === 'guide' ) {

			scene.environment = null;
			renderer.shadowMap.enabled = true;

		}
		renderer.autoClear = false;
		renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled;
		renderer.setClearColor( 0x000000, 0 );
		renderer.setRenderTarget( source );
		renderer.clear();
		withEnabledObjects( scene, () => {

			const draw = () => renderer.render( scene, camera );
			if ( mode === 'guide' ) withWhiteSurfaces( scene, draw );
			else draw();

		} );
		const projection = camera.projectionMatrix.elements;
		material.uniforms.sourceViewProjection.value.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		material.uniforms.reversed.value = camera.reversedDepth;
		if ( camera.isPerspectiveCamera ) material.uniforms.depthScale.value.set( - projection[ 10 ], projection[ 14 ] );
		renderer.shadowMap.autoUpdate = renderer.shadowMap.needsUpdate = false;
		renderer.setRenderTarget( atlas );
		renderer.clear();
		renderer.render( uvScene, new THREE.OrthographicCamera() );
		const pixels = new Uint8Array( size * size * 4 );
		renderer.readRenderTargetPixels( atlas, 0, 0, size, size, pixels );
		return toCanvas( pixels, size );

	} finally {

		scene.background = background;
		scene.fog = fog;
		scene.overrideMaterial = override;
		scene.environment = environment;
		renderer.setClearColor( color, alpha );
		renderer.setRenderTarget( target, cubeFace, mip );
		renderer.autoClear = auto;
		renderer.shadowMap.enabled = shadowEnabled;
		renderer.shadowMap.autoUpdate = shadowUpdate;
		renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
		material.dispose();
		projectorTexture?.dispose();
		source.depthTexture.dispose();
		source.dispose();
		atlas.dispose();

	}

}
