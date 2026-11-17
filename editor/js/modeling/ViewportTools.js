import { icon } from '../Glyphs.js?v=edit-modes';
import { modelButton, modelField } from './ModelControls.js';
import * as THREE from 'three';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { canEditLightMask, setLightMask } from './LightMask.js?v=mask-editor';
import { maskShapes } from './ProjectionMask.js?v=mask-editor';
import { openMaskEditor } from './MaskEditor.js';
import { rayToView, meshHit } from './SurfacePicking.js';
import { formatMeasurement, lengthUnits, makeMeasurePoint, measurementArea, measurementLength, worldMeasurePoints } from './Measurements.js';
import { localSurfacePoint, surfacePaint, surfacePath } from './SurfaceMarks.js?v=top-toolbar';

function element( tag, parent, text ) {

	const node = document.createElement( tag );
	if ( text ) node.textContent = text;
	parent.append( node );
	return node;

}

function select( parent, label, options ) {

	const node = element( 'select', parent );
	node.setAttribute( 'aria-label', label );
	for ( const [ value, label ] of options ) element( 'option', node, label ).value = value;
	return node;

}

function normalized( rect, x, y ) {

	return [ ( x - rect.left ) / rect.width, ( y - rect.top ) / rect.height ];

}

export class ViewportTools {

	constructor( editor, viewport, layout, render ) {

		Object.assign( this, { editor, viewport, layout, render } );
		this.mode = '';
		this.points = [];
		this.brush = { color: '#47cdea', diameter: 14, opacity: 1 };
		this.measure = { unit: 'm', closed: false, bind: true, snap: true };
		this.ray = new THREE.Raycaster();
		this.measurements = [];
		this.overlay = element( 'canvas', viewport );
		this.overlay.className = 'viewport-tool-overlay';
		this.overlay.setAttribute( 'aria-hidden', 'true' );
		this.overlay.hidden = true;
		this.context = this.overlay.getContext( '2d' );
		this.panel = element( 'div', viewport.querySelector( '.viewport-header' ) );
		this.panel.className = 'viewport-tool-panel';
		const workspace = element( 'div', this.panel );
		workspace.className = 'viewport-workspace';
		workspace.setAttribute( 'role', 'group' );
		workspace.setAttribute( 'aria-label', 'Viewport mode' );
		this.modeButtons = new Map( [
			[ 'object', modelButton( workspace, 'Object mode', 'objectMode', () => this.setWorkspaceMode( 'object' ) ) ],
			[ 'edit', modelButton( workspace, 'Edit mode', 'editMode', () => this.setWorkspaceMode( 'edit' ) ) ]
		] );
		const tools = [
			[ '', 'Select & navigate', 'toolSelect' ], [ 'mask', 'Edit light mask', 'toolMask' ],
			[ 'measure', 'Measure', 'toolMeasure' ], [ 'path', 'Surface path', 'toolPath' ], [ 'paint', 'Surface paint', 'toolPaint' ]
		];
		this.selector = select( this.panel, 'Viewport tool', tools );
		this.selector.className = 'viewport-tool-select';
		this.selector.onchange = () => this.setMode( this.selector.value );
		this.editMask = modelButton( this.panel, 'Edit mask', 'toolMask', () => this.setMode( 'mask' ) );
		this.editMask.className = 'viewport-tool-mask-text';
		const strip = element( 'div', this.panel );
		strip.className = 'viewport-tool-strip';
		strip.setAttribute( 'role', 'group' );
		strip.setAttribute( 'aria-label', 'Viewport tools' );
		this.toolButtons = new Map( tools.map( ( [ mode, label, glyph ] ) => {

			const control = element( 'button', strip );
			control.type = 'button';
			control.onclick = () => this.setMode( mode );
			control.innerHTML = icon( glyph );
			control.title = label;
			control.setAttribute( 'aria-label', label );
			return [ mode, control ];

		} ) );
		this.creation = element( 'div', this.panel );
		this.creation.className = 'viewport-creation';
		for ( const [ kind, label, glyph ] of [
			[ 'path', 'Draw path', 'toolPath' ], [ 'shape', 'Draw shape', 'surface' ], [ 'mesh', 'Build mesh', 'shadingWire' ]
		] ) modelButton( this.creation, label, glyph, () => this.run( () => editor.modeling.create( kind, true ) ) );
		modelButton( this.creation, 'Draw freehand', 'edit', () => this.run( () => editor.modeling.create( 'path', true, true ) ) );
		this.modelOptions = element( 'div', this.panel );
		this.modelOptions.className = 'viewport-tool-options viewport-model-options';
		editor.modeling.onToolsChange = () => this.refreshWorkspace();
		this.controls = element( 'div', this.panel );
		this.controls.className = 'viewport-tool-options';
		this.status = element( 'output', this.panel );
		this.status.setAttribute( 'aria-live', 'polite' );
		this.readout = element( 'output', this.panel );

		viewport.addEventListener( 'pointerdown', event => this.pointerDown( event ), true );
		viewport.addEventListener( 'pointermove', event => this.pointerMove( event ), true );
		for ( const type of [ 'pointerup', 'pointercancel', 'lostpointercapture' ] ) viewport.addEventListener( type, event => this.pointerEnd( event ), true );
		viewport.addEventListener( 'dblclick', event => {

			if ( ! [ 'path', 'measure' ].includes( this.mode ) || this.points.length < 3 || event.target !== editor.renderer?.domElement ) return;
			const frame = layout.at( event.clientX, event.clientY );
			if ( ! frame || ( this.mode === 'path' && frame.key !== this.pathView ) || this.nearestHandle( frame, event.clientX, event.clientY ) !== 0 ) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if ( this.mode === 'path' ) this.pathClosed = true;
			else this.measureClosed.checked = this.measure.closed = true;
			this.draw();

		}, true );
		for ( const type of [ 'mousedown', 'mouseup', 'dblclick', 'touchstart', 'touchend' ] ) viewport.addEventListener( type, event => {

			if ( this.mode && event.target === editor.renderer?.domElement ) event.stopImmediatePropagation();

		}, true );
		window.addEventListener( 'keydown', event => {

			if ( ! this.mode || document.querySelector( 'dialog[open]' ) || event.target.closest?.( 'input, textarea, select, [contenteditable]' ) ) return;
			if ( ! [ 'Escape', 'Enter', 'Backspace', 'Delete' ].includes( event.key ) ) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if ( event.key === 'Escape' ) this.setMode( '' );
			else if ( event.key === 'Enter' ) this.run( () => this.finish() );
			else this.removePoint();

		}, true );

		const signals = editor.signals;
		signals.sceneRendered.add( () => this.draw() );
		signals.sceneGraphChanged.add( () => this.collectMeasurements() );
		signals.objectChanged.add( ( object, property ) => {

			if ( property !== 'userData' ) return;
			this.syncMaskControls();
			if ( this.mode === 'mask' && object === this.maskSource ) this.readMask();

		} );
		signals.viewportCameraChanged.add( () => {

			if ( this.pointer ) this.release();
			this.syncMaskControls();

		} );
		signals.editorCleared.add( () => { this.setMode( '' ); this.collectMeasurements(); } );
		signals.projectLoaded.add( () => this.collectMeasurements() );
		signals.startPlayer.add( () => this.setMode( '' ) );
		signals.objectRemoved.add( object => {

			const includes = target => target && !! object.getObjectByProperty( 'uuid', target.uuid );
			if ( includes( this.target ) || includes( this.ruler ) ) this.setMode( '' );

		} );
		this.syncMaskControls();
		this.refreshWorkspace();

	}

	syncMaskControls() {

		const source = this.editor.viewportSource;
		const editable = canEditLightMask( source );
		if ( this.mode === 'mask' && ( ! editable || this.maskSource !== source ) ) this.setMode( '' );
		this.selector.querySelector( 'option[value="mask"]' ).disabled = ! editable;
		this.toolButtons.get( 'mask' ).disabled = ! editable;
		for ( const [ mode, control ] of this.toolButtons ) control.setAttribute( 'aria-pressed', String( mode === this.mode || ! mode && ! this.mode ) );
		this.editMask.hidden = ! editable || this.mode === 'mask';

	}

	setWorkspaceMode( mode ) {

		if ( this.mode ) this.setMode( '' );
		if ( this.editor.modeling.editMode !== ( mode === 'edit' ) ) this.editor.modeling.setMode( mode );

	}

	toggleWorkspaceMode() {

		this.setWorkspaceMode( this.editor.modeling.editMode ? 'object' : 'edit' );

	}

	refreshWorkspace() {

		const model = this.editor.modeling;
		const edit = model.editMode;
		for ( const [ mode, button ] of this.modeButtons ) button.setAttribute( 'aria-pressed', String( mode === ( edit ? 'edit' : 'object' ) ) );
		for ( const mode of [ 'path', 'paint' ] ) {

			this.toolButtons.get( mode ).hidden = ! edit;
			this.selector.querySelector( 'option[value="' + mode + '"]' ).hidden = ! edit;

		}
		this.creation.hidden = ! edit || !! this.mode;
		this.modelOptions.replaceChildren();
		if ( ! edit || this.mode ) return;
		const options = this.modelOptions;
		for ( const { label, glyph, run, disabled, pressed } of model.actions() ) {

			const control = modelButton( options, label, glyph, () => this.run( run ), disabled );
			if ( pressed !== undefined ) control.setAttribute( 'aria-pressed', String( pressed ) );

		}
		if ( model.brush === 'grab' || model.brush === 'smooth' ) {

			const radius = modelField( options, 'Brush radius (px)', 'brushWidth', 'number', model.brushRadius );
			radius.onchange = () => { model.brushRadius = THREE.MathUtils.clamp( radius.valueAsNumber || 50, 5, 250 ); radius.value = model.brushRadius; };
			const strength = modelField( options, 'Brush strength', 'opacity', 'number', model.brushStrength );
			strength.onchange = () => { model.brushStrength = THREE.MathUtils.clamp( strength.valueAsNumber || 0.5, 0.01, 1 ); strength.value = model.brushStrength; };

		}
		if ( model.data?.kind === 'mesh' && model.indices.length >= 3 ) {

			const distance = modelField( options, 'Extrusion distance', 'extrude', 'number', model.extrudeDistance );
			distance.onchange = () => { if ( Number.isFinite( distance.valueAsNumber ) ) model.extrudeDistance = distance.valueAsNumber; };

		}

	}

	collectMeasurements() {

		this.measurements = [];
		this.editor.scene.traverse( object => { if ( object.userData.measurement ) this.measurements.push( object ); } );

	}

	setMode( mode ) {

		if ( mode === 'mask' && ! canEditLightMask( this.editor.viewportSource ) ) mode = '';
		this.release();
		this.mode = mode;
		this.pathClosed = false;
		this.selector.value = mode;
		this.points = [];
		this.target = this.ruler = null;
		this.selected = - 1;
		this.status.textContent = '';
		this.readout.textContent = '';
		if ( ( mode === 'path' || mode === 'paint' ) && ! this.editor.modeling.editMode ) {

			this.mode = '';
			this.editor.modeling.start( this.editor.selected );
			this.mode = mode;

		}
		this.editor.modeling.syncTool();
		if ( mode === 'mask' ) {

			this.maskSource = this.editor.viewportSource;
			this.maskIndex = undefined;
			this.readMask();

		} else {

			this.maskSource = null;
			if ( mode === 'measure' && this.editor.selected?.userData.measurement && ! hasRestriction( this.editor.selected, 'locked' ) ) {

				this.ruler = this.editor.selected;
				const data = this.ruler.userData.measurement;
				this.points = structuredClone( data.points );
				this.measure.unit = data.unit;
				this.measure.closed = data.closed;

			}

		}
		this.buildOptions();
		this.syncMaskControls();
		this.refreshWorkspace();
		this.render();

	}

	readMask() {

		const shapes = maskShapes( this.maskSource?.userData.projectionMask );
		this.maskIndex = Math.min( this.maskIndex ?? ( shapes.length ? 0 : -1 ), shapes.length - 1 );
		if ( this.maskLayers ) {

			this.maskLayers.replaceChildren( ...shapes.map( ( shape, i ) => new Option( shape.name, i ) ), new Option( 'New outline', -1 ) );
			this.maskLayers.value = this.maskIndex;

		}
		const mask = shapes[ this.maskIndex ];
		this.points = structuredClone( mask?.points || [] );
		this.maskMode = mask?.mode || 'inside';
		this.selected = - 1;
		this.syncMaskMode();

	}

	syncMaskMode() {

		if ( ! this.maskSelect ) return;
		this.maskSelect.value = this.maskMode;
		this.maskButtons?.forEach( ( button, index ) => button.setAttribute( 'aria-pressed', String( this.maskMode === [ 'inside', 'cutout' ][ index ] ) ) );

	}

	buildOptions() {

		const parent = this.controls;
		parent.replaceChildren();
		this.maskLayers = this.maskSelect = this.maskButtons = this.finishButton = this.removeButton = null;
		if ( ! this.mode ) return;
		if ( this.mode === 'mask' ) {

			this.maskSelect = select( parent, 'Light mask mode', [ [ 'inside', 'Light inside' ], [ 'cutout', 'Block inside' ] ] );
			this.maskSelect.className = 'viewport-mask-mode-select';
			this.maskButtons = [ 'inside', 'cutout' ].map( mode => {

				const button = modelButton( parent, mode === 'inside' ? 'Light inside' : 'Block inside', mode === 'inside' ? 'toolMask' : 'maskCutout',
					() => { this.maskMode = mode; this.syncMaskMode(); this.draw(); } );
				button.classList.add( 'viewport-mask-mode-button' );
				return button;

			} );
			this.syncMaskMode();
			this.maskSelect.onchange = () => { this.maskMode = this.maskSelect.value; this.syncMaskMode(); this.draw(); };
			this.maskLayers = select( parent, 'Mask shape', [] );
			this.maskLayers.onchange = () => { this.maskIndex = Number( this.maskLayers.value ); this.readMask(); this.draw(); };
			this.readMask();
			modelButton( parent, 'New outline', 'add', () => { this.maskIndex = -1; this.readMask(); this.draw(); } );
			modelButton( parent, 'Open 2D mask editor', 'editMode', () => openMaskEditor( this.editor, this.maskSource ) );
			modelButton( parent, 'Delete mask shape', 'delete', () => this.run( () => {

				if ( this.maskIndex < 0 ) return;
				const shapes = maskShapes( this.maskSource.userData.projectionMask );
				shapes.splice( this.maskIndex, 1 );
				setLightMask( this.editor, this.maskSource, shapes.length ? { shapes } : null );
				this.render();

			} ) );
			this.finishButton = modelButton( parent, 'Apply mask', 'apply', () => this.run( () => this.finish() ) );

		} else if ( this.mode === 'measure' ) {

			const unit = select( parent, 'Measurement units', Object.keys( lengthUnits ).map( name => [ name, name ] ) );
			unit.value = this.measure.unit;
			unit.onchange = () => { this.measure.unit = unit.value; this.draw(); };
			this.measureClosed = modelField( parent, 'Closed', 'toolMask', 'checkbox', this.measure.closed );
			this.measureClosed.onchange = event => { this.measure.closed = event.target.checked; this.draw(); };
			modelField( parent, 'Bind to mesh', 'link', 'checkbox', this.measure.bind ).onchange = event => { this.measure.bind = event.target.checked; };
			modelField( parent, 'Snap vertices', 'snapVertex', 'checkbox', this.measure.snap ).onchange = event => { this.measure.snap = event.target.checked; };
			this.finishButton = modelButton( parent, 'Save ruler', 'save', () => this.run( () => this.finish() ) );
			modelButton( parent, 'New ruler', 'add', () => { this.ruler = null; this.points = []; this.selected = - 1; this.draw(); } );
			const known = modelField( parent, 'Known length', 'toolMeasure', 'number', '' );
			known.min = '0';
			known.step = 'any';
			modelButton( parent, 'Calibrate units', 'calibrate', () => this.run( () => this.calibrate( known.valueAsNumber ) ) );

		} else {

			modelField( parent, 'Color', 'color', 'color', this.brush.color ).oninput = event => { this.brush.color = event.target.value; };
			if ( this.mode === 'path' ) this.finishButton = modelButton( parent, 'Save path', 'save', () => this.run( () => this.finish() ) );
			else {

				const width = modelField( parent, 'Brush (px)', 'brushWidth', 'number', this.brush.diameter );
				width.min = '2';
				width.max = '100';
				width.onchange = () => { this.brush.diameter = THREE.MathUtils.clamp( width.valueAsNumber || 14, 2, 100 ); width.value = this.brush.diameter; };
				const opacity = modelField( parent, 'Opacity', 'opacity', 'number', this.brush.opacity );
				opacity.min = '0.05';
				opacity.max = '1';
				opacity.step = '.05';
				opacity.onchange = () => { this.brush.opacity = THREE.MathUtils.clamp( opacity.valueAsNumber || 1, .05, 1 ); opacity.value = this.brush.opacity; };

			}

		}
		if ( this.mode !== 'paint' ) this.removeButton = modelButton( parent, 'Remove point', 'remove', () => this.removePoint() );
		modelButton( parent, 'Done', 'exitTool', () => this.setMode( '' ) );

	}

	run( action ) {

		try { this.status.textContent = ''; action(); }
		catch ( error ) { this.status.textContent = error.message; }

	}

	removePoint() {

		if ( ! this.points.length ) return;
		this.points.splice( this.selected < 0 ? this.points.length - 1 : this.selected, 1 );
		this.selected = - 1;
		this.draw();

	}

	finish() {

		const minimum = this.mode === 'mask' || this.mode === 'measure' && this.measure.closed ? 3 : 2;
		if ( this.mode === 'paint' || this.points.length < minimum ) return;
		const editor = this.editor;
		if ( this.mode === 'mask' ) {

			const shapes = maskShapes( this.maskSource.userData.projectionMask );
			const index = this.maskIndex < 0 ? shapes.length : this.maskIndex;
			shapes[ index ] = { name: shapes[ index ]?.name || 'Mask ' + ( index + 1 ), mode: this.maskMode, points: structuredClone( this.points ) };
			this.maskIndex = index;
			setLightMask( editor, this.maskSource, { shapes } );
			this.render();

		} else if ( this.mode === 'measure' ) {

			const measurement = { points: structuredClone( this.points ), unit: this.measure.unit, closed: this.measure.closed };
			if ( this.ruler && ! hasRestriction( this.ruler, 'locked' ) ) {

				const userData = { ...this.ruler.userData, measurement };
				const command = new SetValueCommand( editor, this.ruler, 'userData', userData );
				command.updatable = false;
				editor.execute( command, 'Edit ruler' );

			} else {

				const ruler = new THREE.Group();
				ruler.name = 'Ruler';
				ruler.userData.measurement = measurement;
				editor.execute( new AddObjectCommand( editor, ruler ) );
				this.ruler = ruler;

			}
			this.render();

		} else {

			if ( ! this.target || hasRestriction( this.target, 'locked' ) ) return;
			const points = this.samplePath();
			editor.execute( new AddObjectCommand( editor, surfacePath( points, this.brush.color, this.pathClosed ), this.target ) );
			this.points = [];
			this.pathClosed = false;
			this.target = null;
			this.selected = - 1;
			this.render();

		}

	}

	samplePath() {

		const frame = this.layout.frames.find( frame => frame.key === this.pathView );
		if ( ! frame ) throw new Error( 'Return to the view where you placed the path.' );
		const bounds = this.editor.renderer.domElement.getBoundingClientRect();
		const points = [ this.points[ 0 ] ];
		const segments = this.pathClosed ? this.points.length + 1 : this.points.length;
		for ( let i = 1; i < segments; i ++ ) {

			const a = this.visiblePoint( frame, this.points[ i - 1 ] );
			const b = this.visiblePoint( frame, this.points[ i % this.points.length ] );
			if ( ! a || ! b ) throw new Error( 'Frame the whole path in the viewport before saving it.' );
			const steps = Math.ceil( Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ) / 6 );
			for ( let j = 1; j < steps; j ++ ) {

				const x = bounds.left + THREE.MathUtils.lerp( a[ 0 ], b[ 0 ], j / steps );
				const y = bounds.top + THREE.MathUtils.lerp( a[ 1 ], b[ 1 ], j / steps );
				if ( this.layout.at( x, y ) !== frame ) throw new Error( 'Frame the whole path in the viewport before saving it.' );
				rayToView( this.ray, this.layout, frame, x, y );
				const hit = meshHit( this.ray, this.editor.scene );
				if ( hit?.object !== this.target ) throw new Error( 'A segment leaves the mesh. Add points around the gap.' );
				points.push( localSurfacePoint( hit, this.ray ) );

			}
			if ( i < this.points.length ) points.push( this.points[ i ] );

		}
		return points;

	}

	calibrate( value ) {

		const { scene } = this.editor;
		const points = worldMeasurePoints( THREE, scene, this.ruler, this.points );
		const length = measurementLength( points, this.measure.closed );
		if ( ! Number.isFinite( value ) || value <= 0 || length <= 0 ) throw new Error( 'Enter a positive known length for a ruler with two or more points.' );
		const command = new SetValueCommand( this.editor, scene, 'userData', {
			...scene.userData, metersPerUnit: value * lengthUnits[ this.measure.unit ] / length
		} );
		command.updatable = false;
		this.editor.execute( command, 'Calibrate measurement units' );
		this.draw();

	}

	project( world, frame ) {

		const p = world.clone().applyMatrix4( frame.camera.matrixWorldInverse );
		if ( p.z >= 0 ) return;
		p.applyMatrix4( frame.camera.projectionMatrix );
		const { rect } = frame;
		return [ rect.x + ( p.x + 1 ) / 2 * rect.width, rect.y + ( 1 - p.y ) / 2 * rect.height ];

	}

	visiblePoint( frame, point ) {

		if ( this.mode === 'mask' ) {

			const { rect } = frame;
			return [ rect.x + point[ 0 ] * rect.width, rect.y + point[ 1 ] * rect.height ];

		}
		if ( this.mode === 'measure' ) return this.project( worldMeasurePoints( THREE, this.editor.scene, this.ruler, [ point ] )[ 0 ], frame );
		if ( this.target ) return this.project( this.target.localToWorld( new THREE.Vector3( ...point ) ), frame );

	}

	nearestHandle( frame, x, y ) {

		const rect = this.layout.clientRect( frame );
		const cursor = [ x - rect.left + rect.x, y - rect.top + rect.y ];
		let nearest = 10, index = - 1;
		this.points.forEach( ( point, i ) => {

			const pixel = this.visiblePoint( frame, point );
			if ( ! pixel ) return;
			const distance = Math.hypot( pixel[ 0 ] - cursor[ 0 ], pixel[ 1 ] - cursor[ 1 ] );
			if ( distance < nearest ) { nearest = distance; index = i; }

		} );
		return index;

	}

	measurePoint( frame, x, y ) {

		rayToView( this.ray, this.layout, frame, x, y );
		const hit = meshHit( this.ray, this.editor.scene );
		if ( ! hit ) {

			const floor = this.ray.ray.intersectPlane( new THREE.Plane( new THREE.Vector3( 0, 1, 0 ) ), new THREE.Vector3() );
			return floor && makeMeasurePoint( floor, null, this.ruler );

		}
		let point = hit.point;
		if ( this.measure.snap ) {

			const rect = this.layout.clientRect( frame );
			const cursor = [ x - rect.left + rect.x, y - rect.top + rect.y ];
			let closest = 14;
			for ( const index of [ hit.face.a, hit.face.b, hit.face.c ] ) {

				const vertex = hit.object.localToWorld( hit.object.getVertexPosition( index, new THREE.Vector3() ) );
				const pixel = this.project( vertex, frame );
				if ( ! pixel ) continue;
				const distance = Math.hypot( pixel[ 0 ] - cursor[ 0 ], pixel[ 1 ] - cursor[ 1 ] );
				if ( distance < closest ) { closest = distance; point = vertex; }

			}

		}
		return makeMeasurePoint( point, this.measure.bind ? hit.object : null, this.ruler );

	}

	pointerDown( event ) {

		if ( ! this.mode || event.button !== 0 || event.altKey || event.target !== this.editor.renderer?.domElement ) return;
		const frame = this.layout.at( event.clientX, event.clientY );
		if ( ! frame || this.mode === 'mask' && frame.source !== this.maskSource ) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		const { clientX: x, clientY: y } = event;
		this.status.textContent = '';
		this.selected = this.mode !== 'paint' ? this.nearestHandle( frame, x, y ) : - 1;
		if ( this.mode === 'mask' ) {

			if ( this.selected < 0 ) this.selected = this.points.push( normalized( this.layout.clientRect( frame ), x, y ) ) - 1;

		} else if ( this.mode === 'measure' ) {

			if ( this.selected < 0 ) {

				const point = this.measurePoint( frame, x, y );
				if ( ! point ) return;
				this.selected = this.points.push( point ) - 1;

			}

		} else {

			rayToView( this.ray, this.layout, frame, x, y );
			const hit = meshHit( this.ray, this.editor.scene );
			if ( ! hit || hasRestriction( hit.object, 'locked' ) ) {

				this.status.textContent = 'Start on a visible, unlocked mesh.';
				return;

			}
			if ( this.mode === 'path' ) {

				if ( this.target && this.target !== hit.object ) { this.status.textContent = 'Save this path before drawing on another mesh.'; return; }
				this.target = hit.object;
				this.pathView = frame.key;
				const point = localSurfacePoint( hit, this.ray );
				if ( this.selected < 0 ) {

					this.pathClosed = false;
					this.selected = this.points.push( point ) - 1;

				}

			} else {

				this.target = hit.object;
				this.stroke = { positions: [], trail: [], x, y, color: this.brush.color, opacity: this.brush.opacity };
				this.paintDab( frame, x, y );

			}

		}
		this.pointer = { id: event.pointerId, target: event.target, key: frame.key, x, y };
		event.target.setPointerCapture( event.pointerId );
		this.draw();

	}

	pointerMove( event ) {

		const pointer = this.pointer;
		if ( ! pointer || pointer.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		const { clientX: x, clientY: y } = event;
		if ( Math.hypot( x - pointer.x, y - pointer.y ) < 2 ) return;
		const frame = this.layout.frames.find( frame => frame.key === pointer.key );
		if ( ! frame ) return;
		const samePane = this.layout.at( x, y ) === frame;
		if ( this.mode === 'mask' ) {

			this.points[ this.selected ] = normalized( this.layout.clientRect( frame ), x, y ).map( point => THREE.MathUtils.clamp( point, 0, 1 ) );

		} else if ( this.mode === 'measure' && samePane ) {

			const point = this.measurePoint( frame, x, y );
			if ( point ) this.points[ this.selected ] = point;

		} else if ( this.mode === 'path' && samePane ) {

			rayToView( this.ray, this.layout, frame, x, y );
			const hit = meshHit( this.ray, this.editor.scene );
			if ( hit?.object === this.target ) this.points[ this.selected ] = localSurfacePoint( hit, this.ray );

		} else if ( this.mode === 'paint' ) {

			const stroke = this.stroke;
			const dx = x - stroke.x, dy = y - stroke.y;
			const step = Math.max( 2, this.brush.diameter * .28 );
			const distance = Math.hypot( dx, dy );
			if ( distance >= step ) {

				const count = Math.min( 90, Math.floor( distance / step ) );
				for ( let i = 1; i <= count; i ++ ) {

					const px = stroke.x + dx * i / count, py = stroke.y + dy * i / count;
					if ( this.layout.at( px, py ) === frame ) this.paintDab( frame, px, py );

				}
				stroke.x = x;
				stroke.y = y;

			}

		}
		this.draw();

	}

	paintDab( frame, x, y ) {

		rayToView( this.ray, this.layout, frame, x, y );
		const hit = meshHit( this.ray, this.editor.scene );
		if ( hit?.object !== this.target ) return;
		const center = localSurfacePoint( hit, this.ray );
		const radius = this.brush.diameter / 2;
		const points = [];
		for ( let side = 0; side < 8; side ++ ) {

			const angle = side * Math.PI / 4;
			const px = x + Math.cos( angle ) * radius, py = y + Math.sin( angle ) * radius;
			if ( this.layout.at( px, py ) !== frame ) { points.push( null ); continue; }
			rayToView( this.ray, this.layout, frame, px, py );
			const corner = meshHit( this.ray, this.editor.scene );
			const sameSurface = corner?.object === this.target && Math.abs( corner.distance - hit.distance ) < Math.max( .02, hit.distance * .12 );
			points.push( sameSurface ? localSurfacePoint( corner, this.ray ) : null );

		}
		const start = this.stroke.positions.length;
		for ( let side = 0; side < points.length; side ++ ) {

			const next = points[ ( side + 1 ) % points.length ];
			if ( points[ side ] && next ) this.stroke.positions.push( ...center, ...points[ side ], ...next );

		}
		if ( this.stroke.positions.length > start ) this.stroke.trail.push( center );

	}

	pointerEnd( event ) {

		if ( this.pointer?.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		const stroke = this.stroke;
		const target = this.target;
		this.release();
		if ( event.type === 'pointerup' && stroke?.positions.length && target && ! hasRestriction( target, 'locked' ) ) {

			const paint = surfacePaint( stroke.positions, stroke.color, stroke.opacity );
			this.editor.execute( new AddObjectCommand( this.editor, paint, target ) );

		}
		this.draw();

	}

	release() {

		const pointer = this.pointer;
		this.pointer = null;
		this.stroke = null;
		if ( pointer?.target.hasPointerCapture( pointer.id ) ) pointer.target.releasePointerCapture( pointer.id );

	}

	draw() {

		if ( ! this.editor.renderer ) return;
		this.overlay.hidden = ! this.mode && ! this.measurements.length;
		if ( this.overlay.hidden ) return;
		const { width, height } = this.editor.renderer.domElement.getBoundingClientRect();
		const ratio = Math.min( 2, window.devicePixelRatio || 1 );
		const w = Math.round( width * ratio ), h = Math.round( height * ratio );
		if ( this.overlay.width !== w || this.overlay.height !== h ) {

			this.overlay.width = w;
			this.overlay.height = h;

		}
		const ctx = this.context;
		ctx.setTransform( ratio, 0, 0, ratio, 0, 0 );
		ctx.clearRect( 0, 0, width, height );
		for ( const frame of this.layout.frames ) {

			const { rect } = frame;
			ctx.save();
			ctx.beginPath();
			ctx.rect( rect.x, rect.y, rect.width, rect.height );
			ctx.clip();
			for ( const ruler of this.measurements ) {

				if ( ! isVisible( ruler ) || this.mode === 'measure' && ruler === this.ruler ) continue;
				const data = ruler.userData.measurement;
				this.drawRuler( ctx, frame, ruler, data.points, data, false );

			}
			if ( this.mode === 'measure' ) this.drawRuler( ctx, frame, this.ruler, this.points, this.measure, true );
			if ( this.mode === 'path' ) this.strokePixels( ctx, this.points.map( point => this.visiblePoint( frame, point ) ), this.pathClosed, true );
			if ( this.mode === 'mask' && frame.source === this.maskSource ) {

				ctx.strokeStyle = '#c0c9de';
				ctx.strokeRect( rect.x + .5, rect.y + .5, rect.width - 1, rect.height - 1 );
				this.strokePixels( ctx, this.points.map( point => this.visiblePoint( frame, point ) ), true, true );

			}
			if ( this.stroke && this.target ) {

				ctx.fillStyle = this.stroke.color;
				for ( const point of this.stroke.trail ) {

					const pixel = this.visiblePoint( frame, point );
					if ( ! pixel ) continue;
					ctx.beginPath();
					ctx.arc( ...pixel, frame.key === this.pointer?.key ? this.brush.diameter / 2 : 2, 0, Math.PI * 2 );
					ctx.fill();

				}

			}
			ctx.restore();

		}
		const min = this.mode === 'mask' || this.mode === 'measure' && this.measure.closed ? 3 : 2;
		if ( this.finishButton ) this.finishButton.disabled = this.points.length < min;
		if ( this.removeButton ) this.removeButton.disabled = ! this.points.length;
		if ( this.mode === 'measure' ) {

			const scene = this.editor.scene;
			const points = worldMeasurePoints( THREE, scene, this.ruler, this.points );
			const scale = scene.userData.metersPerUnit || 1;
			this.readout.title = 'Total length';
			this.readout.setAttribute( 'aria-label', 'Total length' );
			this.readout.textContent = points.length < 2 ? '' : formatMeasurement( measurementLength( points, this.measure.closed ), this.measure.unit, scale );

		}

	}

	strokePixels( ctx, pixels, closed, handles ) {

		ctx.strokeStyle = '#65dcf0';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		let last = false;
		for ( const point of pixels ) {

			if ( ! point ) { last = false; continue; }
			if ( last ) ctx.lineTo( ...point );
			else ctx.moveTo( ...point );
			last = true;

		}
		if ( closed && pixels.length > 2 && pixels.every( Boolean ) ) ctx.closePath();
		ctx.stroke();
		if ( handles ) pixels.forEach( ( point, index ) => {

			if ( ! point ) return;
			ctx.beginPath();
			ctx.arc( ...point, 4, 0, Math.PI * 2 );
			ctx.fillStyle = index === this.selected ? '#ffba62' : '#65dcf0';
			ctx.fill();

		} );

	}

	drawRuler( ctx, frame, ruler, data, options, handles ) {

		const points = worldMeasurePoints( THREE, this.editor.scene, ruler, data );
		const pixels = points.map( point => this.project( point, frame ) );
		this.strokePixels( ctx, pixels, options.closed, handles );
		const scale = this.editor.scene.userData.metersPerUnit || 1;
		const label = ( text, x, y ) => {

			ctx.font = '12px system-ui';
			ctx.strokeStyle = '#121722';
			ctx.lineWidth = 3;
			ctx.strokeText( text, x, y );
			ctx.fillStyle = '#d6fbff';
			ctx.fillText( text, x, y );

		};
		const legs = options.closed && pixels.length > 2 ? pixels.length : pixels.length - 1;
		for ( let i = 0; i < legs; i ++ ) {

			const j = ( i + 1 ) % pixels.length;
			if ( ! pixels[ i ] || ! pixels[ j ] ) continue;
			label( formatMeasurement( points[ i ].distanceTo( points[ j ] ), options.unit, scale ),
				( pixels[ i ][ 0 ] + pixels[ j ][ 0 ] ) / 2, ( pixels[ i ][ 1 ] + pixels[ j ][ 1 ] ) / 2 - 6 );

		}
		for ( let i = 0; i < pixels.length; i ++ ) {

			if ( ! pixels[ i ] || ! options.closed && ( i === 0 || i === pixels.length - 1 ) || pixels.length < 3 ) continue;
			const a = points[ ( i - 1 + points.length ) % points.length ].clone().sub( points[ i ] );
			const b = points[ ( i + 1 ) % points.length ].clone().sub( points[ i ] );
			if ( a.lengthSq() && b.lengthSq() ) label( Math.round( THREE.MathUtils.radToDeg( a.angleTo( b ) ) ) + '°', pixels[ i ][ 0 ] + 7, pixels[ i ][ 1 ] + 9 );

		}
		if ( options.closed && pixels.length > 2 && pixels.every( Boolean ) ) {

			const center = pixels.reduce( ( sum, point ) => [ sum[ 0 ] + point[ 0 ], sum[ 1 ] + point[ 1 ] ], [ 0, 0 ] );
			label( formatMeasurement( measurementArea( THREE, points ), options.unit, scale, true ), center[ 0 ] / pixels.length, center[ 1 ] / pixels.length );

		}

	}

}
