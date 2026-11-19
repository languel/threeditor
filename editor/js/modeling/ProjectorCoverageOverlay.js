import * as THREE from 'three';
import { isProjector } from '../assets/Projector.js';
import { drawProjectorCoverage, inspectProjectorCoverage } from './ProjectorCoverage.js?v=coverage-overlay';
import { modelButton } from './ModelControls.js?v=coverage-overlay';

export class ProjectorCoverageOverlay {

	constructor( editor, host ) {

		this.editor = editor;
		this.enabled = false;
		this.pending = null;
		this.canvas = document.createElement( 'canvas' );
		this.canvas.className = 'viewport-projector-coverage';
		this.canvas.setAttribute( 'aria-hidden', 'true' );
		this.canvas.hidden = true;
		this.controls = document.createElement( 'div' );
		this.controls.className = 'viewport-projector-coverage-controls';
		this.controls.hidden = true;
		this.status = document.createElement( 'output' );
		this.status.setAttribute( 'aria-label', 'Projector coverage status' );
		this.status.hidden = true;
		this.controls.append( this.status );
		this.toggle = modelButton( this.controls, 'Projector coverage overlay', 'target', () => this.setEnabled( ! this.enabled ) );
		this.toggle.setAttribute( 'aria-pressed', 'false' );
		this.refreshButton = modelButton( this.controls, 'Refresh projector coverage', 'refresh', () => this.refresh( true ) );
		this.refreshButton.hidden = true;
		host.append( this.canvas, this.controls );
		for ( const event of [ 'objectChanged', 'geometryChanged', 'materialChanged', 'sceneGraphChanged', 'timelineFrameChanged' ] ) {

			editor.signals[ event ].add( () => this.invalidate() );

		}

	}

	update( frame, visible = true ) {

		const source = this.editor.viewportSource;
		const projector = isProjector( source ) ? source : null;
		this.frame = projector && frame?.source === projector && visible ? frame : null;
		if ( projector !== this.projector ) {

			this.projector = projector;
			this.setEnabled( false );

		}
		this.controls.hidden = ! this.frame;
		if ( ! this.frame ) {

			this.canvas.hidden = true;
			this.pose = undefined;
			clearTimeout( this.pending );
			this.pending = null;
			return;

		}
		const { area, rect, camera } = this.frame;
		this.controls.style.left = area.x + area.width - 8 + 'px';
		this.controls.style.top = area.y + area.height - 8 + 'px';
		this.controls.style.maxWidth = Math.max( 0, area.width - 16 ) + 'px';
		if ( ! this.enabled ) return;
		Object.assign( this.canvas.style, {
			left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px'
		} );
		const pose = [ projector.userData.projectorTarget, ...camera.matrixWorld.elements, ...camera.projectionMatrix.elements ].join( ',' );
		if ( pose !== this.pose ) {

			this.pose = pose;
			this.canvas.hidden = true;
			this.invalidate();

		}

	}

	setEnabled( enabled ) {

		this.enabled = enabled;
		this.pose = undefined;
		this.toggle.setAttribute( 'aria-pressed', String( enabled ) );
		this.canvas.hidden = this.status.hidden = this.refreshButton.hidden = ! enabled;
		if ( enabled ) {

			this.update( this.frame );
			this.refresh();

		} else {

			clearTimeout( this.pending );
			this.pending = null;

		}

	}

	invalidate() {

		if ( ! this.enabled || ! this.frame ) return;
		// Sample once a drag, lens edit, or timeline scrub settles.
		clearTimeout( this.pending );
		this.status.textContent = 'Checking coverage…';
		this.pending = setTimeout( () => this.refresh(), 160 );

	}

	refresh( detailed = false ) {

		clearTimeout( this.pending );
		this.pending = null;
		if ( ! this.enabled || ! this.frame ) return;
		const { projector, editor } = this;
		const target = editor.objectByUuid( projector.userData.projectorTarget );
		const report = target && inspectProjectorCoverage( THREE, editor.scene, projector, target, detailed ? 40 : 20 );
		const hasSamples = !! report?.targetSamples;
		this.canvas.hidden = ! hasSamples;
		if ( hasSamples ) {

			drawProjectorCoverage( this.canvas, report, true );
			this.status.textContent = Number( ( 100 * report.blockedSamples / report.targetSamples ).toFixed( 1 ) ) + '% blocked';

		} else this.status.textContent = target ? 'No receiver samples in lens' : 'Choose an auto-mask target';

	}

}
