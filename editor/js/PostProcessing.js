// Optional per-scene post-processing (Depth of Field / Focus + Unreal Bloom) for WebGLRenderer.
export const DEFAULT_POSTPROCESSING = {
	bloom: false,
	bloomStrength: 0.65,
	bloomRadius: 0.55,
	bloomThreshold: 0.45,
	dof: false,
	focus: 5.5,
	aperture: 0.0025,
	maxblur: 0.012
};

export class PostProcessingHost {

	constructor() {

		this.modules = null;
		this.loading = null;
		this.composer = null;
		this.renderPass = null;
		this.bloomPass = null;
		this.bokehPass = null;
		this.outputPass = null;
		this.renderer = null;
		this.hasBloom = false;
		this.hasDof = false;
		this.width = 0;
		this.height = 0;
		this.pixelRatio = 1;

	}

	ensureModules( onReady ) {

		if ( this.modules ) return this.modules;
		if ( ! this.loading ) {

			this.loading = Promise.all( [
				import( 'three/addons/postprocessing/EffectComposer.js' ),
				import( 'three/addons/postprocessing/RenderPass.js' ),
				import( 'three/addons/postprocessing/UnrealBloomPass.js' ),
				import( 'three/addons/postprocessing/BokehPass.js' ),
				import( 'three/addons/postprocessing/OutputPass.js' )
			] ).then( ( [ { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { BokehPass }, { OutputPass } ] ) => {

				this.modules = { EffectComposer, RenderPass, UnrealBloomPass, BokehPass, OutputPass };
				onReady?.();

			} ).catch( error => {

				this.loading = null;
				console.error( 'PostProcessing:', error );

			} );

		}
		return null;

	}

	rebuild( renderer, scene, camera, width, height, wantBloom, wantDof ) {

		const m = this.modules;
		if ( ! m ) return;
		this.disposeComposer();
		this.renderer = renderer;
		this.hasBloom = wantBloom;
		this.hasDof = wantDof;
		this.width = Math.max( 1, width );
		this.height = Math.max( 1, height );
		this.pixelRatio = renderer.getPixelRatio();

		const composer = new m.EffectComposer( renderer );
		composer.setPixelRatio( this.pixelRatio );
		composer.setSize( this.width, this.height );

		const renderPass = new m.RenderPass( scene, camera );
		composer.addPass( renderPass );

		let bokehPass = null;
		if ( wantDof ) {

			bokehPass = new m.BokehPass( scene, camera, {
				focus: DEFAULT_POSTPROCESSING.focus,
				aperture: DEFAULT_POSTPROCESSING.aperture,
				maxblur: DEFAULT_POSTPROCESSING.maxblur
			} );
			composer.addPass( bokehPass );

		}

		let bloomPass = null;
		if ( wantBloom ) {

			bloomPass = new m.UnrealBloomPass( { x: this.width, y: this.height }, DEFAULT_POSTPROCESSING.bloomStrength, DEFAULT_POSTPROCESSING.bloomRadius, DEFAULT_POSTPROCESSING.bloomThreshold );
			composer.addPass( bloomPass );

		}

		const outputPass = new m.OutputPass();
		composer.addPass( outputPass );

		this.composer = composer;
		this.renderPass = renderPass;
		this.bokehPass = bokehPass;
		this.bloomPass = bloomPass;
		this.outputPass = outputPass;

	}

	render( renderer, scene, camera, width, height, drawFallback, onReady ) {

		const cfg = scene?.userData?.postprocessing;
		const wantBloom = Boolean( cfg?.bloom );
		const wantDof = Boolean( cfg?.dof );
		if ( ( ! wantBloom && ! wantDof ) || renderer?.isWebGPURenderer ) {

			if ( this.composer ) this.disposeComposer();
			drawFallback();
			return;

		}

		const m = this.ensureModules( onReady );
		if ( ! m ) {

			drawFallback();
			return;

		}

		const w = Math.max( 1, Math.round( width ) );
		const h = Math.max( 1, Math.round( height ) );
		const pr = renderer.getPixelRatio();

		if ( ! this.composer || this.renderer !== renderer || this.hasBloom !== wantBloom || this.hasDof !== wantDof ) {

			this.rebuild( renderer, scene, camera, w, h, wantBloom, wantDof );

		} else if ( this.width !== w || this.height !== h || this.pixelRatio !== pr ) {

			this.width = w;
			this.height = h;
			this.pixelRatio = pr;
			this.composer.setPixelRatio( pr );
			this.composer.setSize( w, h );
			this.bloomPass?.setSize( w, h );

		}

		this.renderPass.scene = scene;
		this.renderPass.camera = camera;

		if ( this.bokehPass ) {

			this.bokehPass.scene = scene;
			this.bokehPass.camera = camera;
			this.bokehPass.uniforms.focus.value = Number( cfg.focus ?? DEFAULT_POSTPROCESSING.focus );
			this.bokehPass.uniforms.aperture.value = Number( cfg.aperture ?? DEFAULT_POSTPROCESSING.aperture );
			this.bokehPass.uniforms.maxblur.value = Number( cfg.maxblur ?? DEFAULT_POSTPROCESSING.maxblur );

		}

		if ( this.bloomPass ) {

			this.bloomPass.strength = Number( cfg.bloomStrength ?? DEFAULT_POSTPROCESSING.bloomStrength );
			this.bloomPass.radius = Number( cfg.bloomRadius ?? DEFAULT_POSTPROCESSING.bloomRadius );
			this.bloomPass.threshold = Number( cfg.bloomThreshold ?? DEFAULT_POSTPROCESSING.bloomThreshold );

		}

		this.composer.render();

	}

	disposeComposer() {

		this.bokehPass?.dispose?.();
		this.bloomPass?.dispose?.();
		this.outputPass?.dispose?.();
		this.renderPass?.dispose?.();
		this.composer?.dispose?.();
		this.composer = this.renderPass = this.bokehPass = this.bloomPass = this.outputPass = null;
		this.hasBloom = this.hasDof = false;

	}

	dispose() {

		this.disposeComposer();
		this.renderer = null;

	}

}
