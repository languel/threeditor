import * as THREE from 'three';
import { fitView, lightViewCamera } from './LightView.js';

export class ViewLayout {

	constructor( editor, viewport ) {

		this.editor = editor;
		this.viewport = viewport;
		this.cameras = new WeakMap();
		this.frames = [];
		this.divider = document.createElement( 'div' );
		this.divider.className = 'viewport-split-divider';
		this.divider.hidden = true;
		viewport.append( this.divider );
		this.directorName = document.createElement( 'span' );
		this.directorName.className = 'viewport-pane-name';
		this.directorName.textContent = 'Director';
		this.directorName.hidden = true;
		viewport.append( this.directorName );
		this.sourceName = document.createElement( 'span' );
		this.sourceName.className = 'viewport-pane-name';
		this.sourceName.hidden = true;
		viewport.append( this.sourceName );

	}

	update( width, height ) {

		const editor = this.editor;
		const source = editor.viewportSource;
		const split = editor.viewportSplit && ( source || editor.viewportCamera !== editor.camera );
		const edge = split ? Math.floor( width / 2 ) : 0;
		const region = { x: edge, y: 0, width: width - edge, height };
		let camera = editor.viewportCamera, rect = region;
		if ( source ) {

			camera = lightViewCamera( THREE, source, this.cameras.get( source ) );
			this.cameras.set( source, camera );
			const aspect = camera.isOrthographicCamera ? ( camera.right - camera.left ) / ( camera.top - camera.bottom ) : camera.aspect;
			rect = fitView( region, aspect );

		}
		this.frames = [ { key: 'source', camera, source, rect } ];
		if ( split ) this.frames.unshift( { key: 'director', camera: editor.camera, rect: { x: 0, y: 0, width: edge, height } } );
		this.divider.hidden = this.directorName.hidden = this.sourceName.hidden = ! split;
		this.divider.style.left = edge + 'px';
		this.sourceName.style.left = edge + 12 + 'px';
		this.sourceName.textContent = source?.name || camera.name || 'Camera';
		return this.frames;

	}

	at( x, y ) {

		const bounds = this.editor.renderer?.domElement.getBoundingClientRect();
		if ( ! bounds ) return;
		const localX = x - bounds.left, localY = y - bounds.top;
		return this.frames.find( ( { rect } ) => localX >= rect.x && localX < rect.x + rect.width && localY >= rect.y && localY < rect.y + rect.height );

	}

	clientRect( frame ) {

		const bounds = this.editor.renderer.domElement.getBoundingClientRect();
		const { x, y, width, height } = frame.rect;
		return { x, y, width, height, left: bounds.left + x, top: bounds.top + y };

	}

	get navigation() {

		return this.frames.find( frame => ! frame.source && ( frame.key === 'director' || this.frames.length === 1 ) );

	}

	get optical() {

		return this.frames.find( frame => frame.source );

	}

}
