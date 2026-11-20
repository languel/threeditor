import * as THREE from 'three';
import { fitView, lightViewCamera } from './LightView.js';

export class ViewLayout {

	constructor( editor, viewport ) {

		this.editor = editor;
		this.viewport = viewport;
		this.cameras = new WeakMap();
		this.frames = [];
		this.activeKey = 'director';
		this.directorCopy = null;
		this.divider = document.createElement( 'div' );
		this.divider.className = 'viewport-split-divider';
		this.divider.hidden = true;
		viewport.append( this.divider );
		this.divider.tabIndex = 0;
		this.divider.setAttribute( 'role', 'separator' );
		this.divider.setAttribute( 'aria-label', 'Resize viewport areas' );
		this.divider.addEventListener( 'pointerdown', event => {
			if ( event.button === 0 ) this.divider.setPointerCapture( event.pointerId );
		} );
		this.divider.addEventListener( 'pointermove', event => {
			if ( ! this.divider.hasPointerCapture( event.pointerId ) ) return;
			const rect = viewport.getBoundingClientRect();
			const fraction = editor.viewportSplitAxis === 'horizontal' ?
				( event.clientY - rect.top ) / rect.height : ( event.clientX - rect.left ) / rect.width;
			this.resizeSplit( fraction );
		} );
		this.divider.addEventListener( 'keydown', event => {
			const step = ( editor.viewportSplitAxis === 'horizontal' ? { ArrowUp: -.05, ArrowDown: .05 } : { ArrowLeft: -.05, ArrowRight: .05 } )[ event.key ];
			if ( step === undefined ) return;
			event.preventDefault();
			event.stopPropagation();
			this.resizeSplit( editor.viewportSplitRatio + step );
		} );
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

	resizeSplit( fraction ) {

		this.editor.setViewportSplit( true, this.editor.viewportSplitAxis, fraction );

	}

	closeArea( pointer ) {

		const editor = this.editor;
		if ( ! editor.viewportSplit ) return;
		const closing = pointer && this.at( pointer.x, pointer.y, 'area' );
		editor.splitWorkspace.join( closing?.key === 'director' ? 'source' : 'director' );

	}

	areas( width, height ) {

		const whole = { x: 0, y: 0, width, height };
		if ( ! this.editor.viewportSplit || this.maximizedPane ) return [ whole ];
		const ratio = this.editor.viewportSplitRatio;
		if ( this.editor.viewportSplitAxis === 'horizontal' ) {

			const edge = Math.max( 1, Math.floor( height * ratio ) );
			const areas = [ { ...whole, height: edge }, { ...whole, y: edge, height: height - edge } ];
			return this.swapped ? areas.reverse() : areas;

		}
		const edge = Math.max( 1, Math.floor( width * ratio ) );
		const areas = [ { ...whole, width: edge }, { ...whole, x: edge, width: width - edge } ];
		return this.swapped ? areas.reverse() : areas;

	}

	update( width, height ) {

		const editor = this.editor;
		const soloDirector = editor.viewportSplit && this.maximizedPane === 'director';
		const source = soloDirector ? null : editor.viewportSource;
		const areas = this.areas( width, height );
		const split = areas.length > 1;
		const area = areas.at( - 1 );
		let camera = soloDirector ? editor.camera : editor.viewportCamera, rect = area;
		const director = ! source && camera === editor.camera;
		if ( source ) {

			camera = lightViewCamera( THREE, source, this.cameras.get( source ) );
			this.cameras.set( source, camera );
			const aspect = camera.isOrthographicCamera ? ( camera.right - camera.left ) / ( camera.top - camera.bottom ) : camera.aspect;
			rect = fitView( area, aspect );

		} else if ( split && director ) {

			// Both Director areas share the editor camera pose. The second has
			// its own projection, so dragging the divider cannot stretch it.
			if ( this.directorCopy?.type !== camera.type ) this.directorCopy = camera.clone( false );
			this.directorCopy.copy( camera, false );
			camera = this.directorCopy;
			const aspect = area.width / Math.max( 1, area.height );
			if ( camera.isPerspectiveCamera ) camera.aspect = aspect;
			else {
				const height = camera.top - camera.bottom;
				camera.left = - height * aspect / 2;
				camera.right = height * aspect / 2;
			}
			camera.updateProjectionMatrix();
			camera.updateMatrixWorld( true );

		}

		this.frames = [ { key: soloDirector ? 'director' : 'source', camera, source, rect, area, director } ];
		if ( split ) this.frames.unshift( { key: 'director', camera: editor.camera, rect: areas[ 0 ], area: areas[ 0 ], director: true } );
		this.divider.hidden = this.directorName.hidden = this.sourceName.hidden = ! split;
		if ( split ) {

			const horizontal = editor.viewportSplitAxis === 'horizontal';
			this.divider.dataset.axis = editor.viewportSplitAxis;
			this.divider.style.setProperty( '--split-edge', ( horizontal ? Math.max( areas[ 0 ].y, area.y ) : Math.max( areas[ 0 ].x, area.x ) ) + 'px' );
			this.divider.setAttribute( 'aria-orientation', horizontal ? 'horizontal' : 'vertical' );
			this.divider.setAttribute( 'aria-valuemin', '15' );
			this.divider.setAttribute( 'aria-valuemax', '85' );
			this.divider.setAttribute( 'aria-valuenow', String( Math.round( editor.viewportSplitRatio * 100 ) ) );
			this.label( this.directorName, this.frames[ 0 ], editor.camera.name || 'Director' );
			this.label( this.sourceName, this.frames[ 1 ], source?.name || camera.name || 'Camera' );

		}
		return this.frames;

	}

	label( element, frame, name ) {

		element.style.left = frame.area.x + 12 + 'px';
		element.style.top = frame.area.y + frame.area.height - 36 + 'px';
		element.textContent = name;

	}

	at( x, y, region = 'rect' ) {

		const bounds = this.editor.renderer?.domElement.getBoundingClientRect();
		if ( ! bounds ) return;
		const localX = x - bounds.left, localY = y - bounds.top;
		return this.frames.find( ( { [ region ]: rect } ) => localX >= rect.x && localX < rect.x + rect.width && localY >= rect.y && localY < rect.y + rect.height );

	}

	clientRect( frame ) {

		const bounds = this.editor.renderer.domElement.getBoundingClientRect();
		const { x, y, width, height } = frame.rect;
		return { x, y, width, height, left: bounds.left + x, top: bounds.top + y };

	}

	get navigation() {

		const visible = this.frames.filter( frame => this.isViewportPane?.( frame.key ) !== false );
		if ( ! visible.length ) return;
		if ( visible.length === 1 ) {

			const frame = visible[ 0 ];
			return frame.source || ( this.maximizedPane && ! frame.director ) ? undefined : frame;

		}
		return visible.find( frame => frame.key === this.activeKey && frame.director ) || visible[ 0 ];

	}

	get optical() {

		return this.frames.find( frame => frame.source && this.isViewportPane?.( frame.key ) !== false );

	}

}
