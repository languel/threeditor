// Lazy GaussianSplatRenderer bridge for Viewport, Player, and AssetPreview.
// Keeps GaussianSplatRenderer out of scene.children/toJSON except during draw.
export class SplatHost {

	constructor() {

		this.renderer = null;
		this.splatRenderer = null;
		this.loading = null;
		this.disposed = false;

	}

	hasSplat( scene ) {

		let found = false;
		scene?.traverseVisible?.( object => {

			if ( object.splats || object.userData?.hasSplat ) found = true;

		} );
		return found;

	}

	ensure( renderer, onDirty ) {

		if ( this.disposed ) return null;
		if ( this.renderer !== renderer ) {

			this.splatRenderer?.dispose();
			this.splatRenderer = null;
			this.loading = null;
			this.renderer = renderer;

		}
		if ( this.splatRenderer ) return this.splatRenderer;
		if ( ! this.loading && renderer ) {

			this.loading = import( 'gaussian-splat-lite' )
				.then( ( { GaussianSplatRenderer } ) => {

					if ( this.disposed || this.renderer !== renderer ) return;
					this.splatRenderer = new GaussianSplatRenderer( { renderer, onDirty } );
					onDirty?.();

				} )
				.catch( error => {

					this.loading = null;
					console.error( 'GaussianSplatRenderer:', error );

				} );

		}
		return null;

	}

	render( renderer, scene, draw, onDirty ) {

		if ( ! this.hasSplat( scene ) ) {

			draw();
			return;

		}
		const sr = this.ensure( renderer, onDirty );
		if ( ! sr ) {

			draw();
			return;

		}
		// Attach directly without firing Object3D events or polluting Outliner/toJSON.
		scene.children.push( sr );
		sr.parent = scene;
		try {

			draw();

		} finally {

			const index = scene.children.indexOf( sr );
			if ( index !== - 1 ) scene.children.splice( index, 1 );
			sr.parent = null;

		}

	}

	dispose() {

		this.disposed = true;
		this.splatRenderer?.dispose();
		this.splatRenderer = null;
		this.renderer = null;
		this.loading = null;

	}

}
