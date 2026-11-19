import { brushOpacityFactor, brushPalette, brushPressure, brushSizeFactor, pencilBrush } from './PencilBrush.js?v=pencil-placement';
import { guidePencilPoint, simplifyPencilStroke, smoothPencilStroke, stabilizePointer } from './PencilStroke.js?v=pencil-placement';
import { modelObject, outlinePoints } from './ModelGeometry.js?v=brush-response';
import { icon } from '../Glyphs.js?v=color-sampler';
import { splatStrokeCommands } from './SplatPaint.js?v=pencil-splats';
import { addPencilSplatDab } from './PencilSplats.js?v=brush-response';
import { grainOpacity } from './PencilGrain.js';
import { TexturePaintStroke } from './TexturePaint.js?v=pencil-placement';
import { TexturePaintProjection } from './TexturePaintProjection.js';
import { cleanShading } from '../ViewportShading.js?v=live-preview';
import { formatCombo } from '../Keymap.js?v=pencil-ribbon';
import { meshBrushes } from './SculptBrush.js?v=surface-tools';
import { modelButton, modelField } from './ModelControls.js?v=color-sampler';
import * as THREE from 'three';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { AddObjectCommand } from '../commands/AddObjectCommand.js?v=surface-tools';
import { RemoveObjectCommand } from '../commands/RemoveObjectCommand.js';
import { closestPointOnSegment, segmentCount } from './Contour.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { canEditLightMask, setLightMask } from './LightMask.js?v=mask-editor';
import { maskShapes } from './ProjectionMask.js?v=mask-editor';
import { openMaskEditor } from './MaskEditor.js?v=pencil-placement';
import { rayToView, meshHit, paintSurfaces } from './SurfacePicking.js?v=surface-tools';
import { formatMeasurement, lengthUnits, makeMeasurePoint, measurementArea, measurementLength, worldMeasurePoints } from './Measurements.js';
import { localSurfacePoint, surfacePaint, surfacePath } from './SurfaceMarks.js?v=surface-tools';
import { StrokeSampler } from './StrokeSampler.js';

const selectionModes = [
	[ 'select', 'Select', 'toolSelect' ], [ 'box', 'Box select', 'selectBox' ],
	[ 'circle', 'Circle select', 'selectCircle' ], [ 'lasso', 'Lasso select', 'selectLasso' ]
];

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
		viewport.addEventListener( 'pointerleave', () => { if ( this.brushCursor ) { this.brushCursor = null; this.draw(); } } );
		this.mode = '';
		this.points = [];
		this.brush = { output: 'surface', placement: 'surface', color: '#47cdea', diameter: 14, opacity: 1 };
		this.pencilTool = 'vector';
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
		this.modeSelect = select( workspace, 'Interaction mode', [
			[ 'object', 'Object Mode' ], [ 'edit', 'Edit Mode' ],
			[ 'sculpt', 'Sculpt Mode' ], [ 'paint', 'Surface Paint' ]
		] );
		this.modeSelect.onchange = () => {

			this.setWorkspaceMode( this.modeSelect.value );
			this.modeSelect.blur();

		};
		this.elementModes = element( 'div', this.panel );
		this.elementModes.className = 'viewport-element-modes';
		this.elementButtons = new Map( [ 'vertex', 'edge', 'face' ].map( mode => {

			const name = mode[ 0 ].toUpperCase() + mode.slice( 1 );
			return [ mode, modelButton( this.elementModes, name + ' select', mode + 'Select', () => editor.modeling.setSelectionMode( mode ) ) ];

		} ) );
		const updateElementShortcuts = () => {

			for ( const [ mode, button ] of this.elementButtons ) {

				const combo = editor.keymap.combo( 'select' + mode[ 0 ].toUpperCase() + mode.slice( 1 ) );
				const label = button.getAttribute( 'aria-label' );
				button.title = combo ? label + ' (' + formatCombo( combo ) + ')' : label;

			}

		};
		editor.keymap.listeners.add( updateElementShortcuts );
		updateElementShortcuts();
		const tools = [
			[ '', 'Select & navigate', 'toolSelect' ], [ 'pencil', 'Pencil', 'freehandDraw' ], [ 'measure', 'Measure', 'toolMeasure' ],
			[ 'cursor', '3D Cursor', 'pivotOrigin' ], [ 'mask', 'Edit light mask', 'toolMask' ],
			[ 'path', 'Surface path', 'toolPath' ], [ 'paint', 'Surface paint', 'surfaceBrush' ]
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
			control.onclick = mode === 'pencil' ? () => this.togglePencil() : mode ? () => this.setMode( mode ) : () => this.openSelectionMenu();
			control.innerHTML = icon( glyph );
			control.title = mode === 'cursor' ? label + ' (Shift+right-click)' : label;
			control.setAttribute( 'aria-label', label );
			return [ mode, control ];

		} ) );
		this.geometryTools = element( 'div', this.panel.parentNode );
		this.geometryTools.className = 'viewport-geometry-tools';
		this.geometryTools.setAttribute( 'role', 'group' );
		this.geometryTools.setAttribute( 'aria-label', 'Viewport Toolbar' );
		this.restoreToolbar = modelButton( this.panel.parentNode, 'Show Viewport Toolbar', 'panel', () => this.toggleToolbar() );
		this.restoreToolbar.classList.add( 'viewport-restore-toolbar' );
		const updateToolbarHint = () => {

			const binding = editor.keymap.combo( 'viewportToolbar' );
			this.restoreToolbar.title = 'Show Viewport Toolbar' + ( binding ? ' (' + formatCombo( binding ) + ')' : '' );

		};
		editor.keymap.listeners.add( updateToolbarHint );
		updateToolbarHint();
		this.syncToolbar();
		this.geometryTools.append( strip );
		this.transformTools = element( 'div', strip );
		this.transformTools.className = 'viewport-transform-tools';
		this.transformTools.setAttribute( 'role', 'group' );
		this.transformTools.setAttribute( 'aria-label', 'Transform tools' );
		this.toolButtons.get( 'cursor' ).after( this.transformTools );
		const selectTool = this.toolButtons.get( '' );
		selectTool.classList.add( 'viewport-selection-trigger' );
		selectTool.setAttribute( 'aria-haspopup', 'true' );
		selectTool.setAttribute( 'aria-expanded', 'false' );
		this.selectionTools = element( 'div', this.geometryTools );
		this.selectionTools.className = 'viewport-selection-tools';
		this.selectionTools.setAttribute( 'popover', 'auto' );
		this.selectionTools.setAttribute( 'role', 'group' );
		this.selectionTools.setAttribute( 'aria-label', 'Selection tools' );
		this.selectionTools.addEventListener( 'toggle', () => selectTool.setAttribute( 'aria-expanded', String( this.selectionTools.matches( ':popover-open' ) ) ) );
		this.selectionButtons = new Map( selectionModes.map( ( [ tool, label, glyph ] ) => [ tool, modelButton( this.selectionTools, label, glyph, () => {

			this.selectionTools.hidePopover();
			this.chooseSelectionTool( tool );
			selectTool.focus();

		} ) ] ) );
		const bindings = { select: 'selectionCycle', box: 'selectionBox', circle: 'selectionCircle', lasso: 'selectionLasso' };
		const updateSelectionHints = () => {

			for ( const [ tool, label ] of selectionModes ) {
				const binding = editor.keymap.combo( bindings[ tool ] );
				this.selectionButtons.get( tool ).title = label + ( binding ? ' (' + formatCombo( binding ) + ')' : '' );
			}

		};
		editor.keymap.listeners.add( updateSelectionHints );
		updateSelectionHints();
		this.selectionOp = modelButton( this.elementModes, 'Selection operation: Set', 'selectOperation', () => {

			const model = editor.modeling, operations = [ 'set', 'extend', 'subtract', 'toggle', 'intersect' ];
			model.selectionOperation = operations[ ( operations.indexOf( model.selectionOperation ) + 1 ) % operations.length ];
			model.changed();

		} );
		this.creation = element( 'div', this.geometryTools );
		this.creation.className = 'viewport-creation';
		this.creationButtons = new Map();
		for ( const [ kind, label, glyph ] of [
			[ 'path', 'Draw path', 'pathDraw' ], [ 'shape', 'Draw shape', 'shapeDraw' ], [ 'mesh', 'Build mesh', 'meshBuild' ]
		] ) this.creationButtons.set( kind, modelButton( this.creation, label, glyph, () => this.run( () => editor.modeling.create( kind, true ) ) ) );
		this.primary = element( 'div', this.geometryTools );
		this.primary.className = 'viewport-primary-tools';
		this.penButton = modelButton( this.primary, 'Polybuild (6)', 'topologyPen', () => this.run( () => editor.modeling.togglePen() ) );
		this.knifeButton = modelButton( this.primary, 'Knife (K)', 'knifeTool', () => this.run( () => editor.modeling.toggleKnife() ) );
		this.penButton.title = 'Polybuild / Topology pen (6)';
		this.sculptButton = modelButton( this.primary, 'Sculpt brushes', 'sculptTool', () => this.run( () => editor.modeling.setBrush( editor.modeling.brush && editor.modeling.brush !== 'freehand' ? '' : 'grab' ) ) );
		this.actionMenu = element( 'details', this.panel );
		this.actionMenu.className = 'model-action-menu';
		const summary = element( 'summary', this.actionMenu );
		summary.innerHTML = icon( 'toolActions' );
		summary.title = 'Mesh and point operations';
		summary.setAttribute( 'aria-label', 'Mesh and point operations' );
		this.modelOptions = element( 'div', this.actionMenu );
		this.modelOptions.className = 'viewport-model-options';
		this.brushSettings = element( 'div', this.panel );
		this.brushSettings.className = 'viewport-brush-settings';
		editor.modeling.onToolsChange = () => this.refreshWorkspace();
		const context = element( 'div', this.panel.parentNode );
		context.className = 'viewport-tool-panel viewport-tool-context';
		this.regularControls = this.controls = element( 'div', context );
		this.controls.className = 'viewport-tool-options';
		this.regularStatus = this.status = element( 'output', context );
		this.status.setAttribute( 'aria-live', 'polite' );
		this.pencilContext = element( 'div', viewport );
		this.pencilContext.className = 'viewport-pencil-toolbox';
		this.pencilContext.setAttribute( 'role', 'group' );
		this.pencilContext.setAttribute( 'aria-label', 'Pencil toolbox' );
		this.pencilContext.hidden = true;
		this.pencilControls = element( 'div', this.pencilContext );
		this.pencilControls.className = 'viewport-pencil-controls';
		this.pencilStatus = element( 'output', this.pencilContext );
		this.pencilStatus.setAttribute( 'aria-live', 'polite' );
		this.readout = element( 'output', context );

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

			if ( editor.flyControls?.active ) return;

			if ( ! this.mode || this.editor.editWorkspace?.exclusive || document.querySelector( 'dialog[open]' ) || event.target.closest?.( 'input, textarea, select, [contenteditable], #editor-2d' ) ) return;
			if ( ! [ 'Escape', 'Enter', 'Backspace', 'Delete' ].includes( event.key ) ) return;
			if ( ! this.stroke && this.editor.keymap?.overEditableViewport === false ) return;
			if ( [ 'cursor', 'pencil' ].includes( this.mode ) && event.key !== 'Escape' ) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if ( event.key === 'Escape' ) {

				if ( this.mode === 'cursor' ) { this.setMode( '' ); return; }
				if ( this.stroke ) {

					this.release(); this.render(); this.draw();
					return;

				}
				this.points = []; this.selected = -1;
				if ( this.mode === 'pencil' ) { this.togglePencil(); return; }
				this.editor.select( null ); this.draw();

			}
			else if ( event.key === 'Enter' ) this.run( () => this.finish() );
			else this.removePoint();

		}, true );

		const signals = editor.signals;
		signals.cursorChanged.add( () => {

			this.cursorFields?.forEach( ( field, axis ) => {
				if ( document.activeElement !== field ) field.value = editor.cursor.getComponent( axis ).toFixed( 3 );
			} );

		} );
		signals.objectSelected.add( object => {

			if ( this.mode === 'measure' || this.editor.modeling.editMode && object?.userData.measurement ) this.setMode( object?.userData.measurement ? 'measure' : '' );
			else { this.refreshWorkspace(); this.draw(); }

		} );
		signals.transformSettingsChanged.add( key => {

			if ( key === 'modelPlacement' && this.mode === 'pencil' ) this.buildOptions();

		} );
		signals.sceneRendered.add( () => this.draw() );
		signals.sceneGraphChanged.add( () => this.collectMeasurements() );
		signals.objectChanged.add( ( object, property ) => {

			if ( this.mode === 'measure' && object === this.ruler && ! this.pointer ) {

				const data = object.userData.measurement;
				this.points = structuredClone( data.points );
				Object.assign( this.measure, { unit: data.unit, closed: data.closed } );
				this.buildOptions();
				this.draw();

			}
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
		this.refreshWorkspace();

	}

	setWorkspaceMode( mode ) {

		const model = this.editor.modeling;
		if ( mode === 'paint' ) { this.setMode( 'paint' ); return; }
		if ( this.mode ) this.setMode( '' );
		const needsEdit = mode === 'edit' || mode === 'sculpt';
		if ( model.editMode !== needsEdit ) model.setMode( needsEdit ? 'edit' : 'object' );
		if ( mode === 'sculpt' ) model.setBrush( 'grab' );
		else if ( model.brush ) model.setBrush( '' );
		this.refreshWorkspace();

	}

	toggleWorkspaceMode() {

		this.setWorkspaceMode( this.editor.modeling.editMode ? 'object' : 'edit' );

	}

	openSelectionMenu() {

		const menu = this.selectionTools;
		if ( menu.matches( ':popover-open' ) ) { menu.hidePopover(); return; }
		const anchor = this.toolButtons.get( '' ).getBoundingClientRect();
		menu.style.left = Math.min( anchor.right + 4, window.innerWidth - 160 ) + 'px';
		menu.style.top = Math.min( anchor.top, window.innerHeight - 138 ) + 'px';
		menu.showPopover( { source: this.toolButtons.get( '' ) } );

	}

	chooseSelectionTool( tool ) {

		const model = this.editor.modeling;
		if ( this.mode ) this.setMode( '' );
		if ( tool === 'cycle' ) tool = selectionModes[ ( selectionModes.findIndex( option => option[ 0 ] === model.selectionTool ) + 1 ) % selectionModes.length ][ 0 ];
		model.setSelectionTool( tool );

	}

	refreshWorkspace() {

		const model = this.editor.modeling;
		const edit = model.editMode;
		for ( const [ tool, button ] of this.selectionButtons ) button.setAttribute( 'aria-pressed', String( ! model.pen && ! model.knife && ! model.brush && ! model.adding && tool === model.selectionTool ) );
		this.selectionOp.title = 'Selection operation: ' + model.selectionOperation + ' (click to cycle)';
		this.selectionOp.setAttribute( 'aria-label', 'Selection operation: ' + model.selectionOperation );
		this.elementModes.hidden = ! edit || ! model.object || !! this.mode;
		for ( const [ mode, button ] of this.elementButtons ) button.setAttribute( 'aria-pressed', String( mode === model.selectionMode && ! model.pen && ! model.knife && ! model.brush ) );
		this.modeSelect.value = this.mode === 'paint' || this.pencilFromPaint ? 'paint' : edit && model.brush && model.brush !== 'freehand' ? 'sculpt' : edit ? 'edit' : 'object';
		this.modeSelect.querySelector( 'option[value="sculpt"]' ).disabled = ! model.canEditTarget( this.editor.selected );
		for ( const mode of [ 'path' ] ) {

			this.toolButtons.get( mode ).hidden = ! edit;
			this.selector.querySelector( 'option[value="' + mode + '"]' ).hidden = ! edit;

		}
		this.creation.hidden = this.primary.hidden = ! edit || !! this.mode;
		this.actionMenu.hidden = ! edit || !! this.mode || ! model.object;
		this.modelOptions.replaceChildren();
		this.brushSettings.replaceChildren();
		const sculpt = model.brush && model.brush !== 'freehand';
		const pen = model.pen && ! model.adding;
		this.knifeButton.disabled = ! model.canEdit() || ! model.data?.faces?.length || !! model.data?.profile;
		this.knifeButton.setAttribute( 'aria-pressed', String( !! model.knife ) );
		const name = this.mode ? { cursor: '3D Cursor', mask: 'Light mask', measure: 'Measure', pencil: 'Pencil', path: 'Surface path', paint: 'Surface paint' }[ this.mode ] :
			sculpt ? 'Sculpt · ' + ( meshBrushes.find( ( [ id ] ) => id === model.brush )?.[ 1 ] || model.brush ) :
			model.knife ? 'Knife' : pen ? 'Topology pen' : model.brush === 'freehand' ? 'Freehand' :
				model.adding ? { path: 'Draw path', shape: 'Draw shape', mesh: 'Build mesh' }[ model.data?.kind ] : model.selectionTool === 'select' ? 'Select' : model.selectionTool + ' select';
		const [ , selectionLabel, selectionGlyph ] = selectionModes.find( option => option[ 0 ] === model.selectionTool );
		const selectTool = this.toolButtons.get( '' );
		selectTool.innerHTML = icon( selectionGlyph );
		selectTool.title = selectionLabel + ' · Selection tools';
		selectTool.setAttribute( 'aria-label', selectTool.title );
		this.panel.setAttribute( 'aria-label', 'Viewport tools · ' + name );
		for ( const [ mode, control ] of this.toolButtons ) control.setAttribute( 'aria-pressed', String( mode ? this.mode === mode : ! this.mode && ! model.pen && ! model.knife && ! model.brush && ! model.adding ) );
		for ( const [ kind, control ] of this.creationButtons ) control.setAttribute( 'aria-pressed', String( ! this.mode && model.adding && model.data?.kind === kind ) );
		this.penButton.setAttribute( 'aria-pressed', String( ! this.mode && pen ) );
		this.sculptButton.setAttribute( 'aria-pressed', String( ! this.mode && Boolean( sculpt ) ) );
		this.penButton.disabled = ! model.canEdit() || ! model.data?.faces?.length;
		this.sculptButton.disabled = ! model.canEdit() || ! model.data?.points.length;
		this.editor.viewportSidebar?.refresh();
		this.editor.primitiveAdjustment?.refresh();
		if ( ! edit || this.mode ) return;
		for ( const { label, glyph, run, disabled, pressed } of model.actions() ) {

			if ( [ 'Topology pen', 'Polybuild (6)', 'Knife (K)', 'Sculpt brushes' ].includes( label ) ) continue;
			const control = modelButton( this.modelOptions, label, glyph, () => { this.actionMenu.open = false; this.run( run ); } , disabled );
			if ( pressed !== undefined ) control.setAttribute( 'aria-pressed', String( pressed ) );

		}
		if ( sculpt ) {

			const choose = select( this.brushSettings, 'Sculpt brush', meshBrushes.map( ( [ id, label ] ) => [ id, label ] ) );
			choose.value = model.brush;
			choose.onchange = () => model.setBrush( choose.value );
			const radius = modelField( this.brushSettings, 'Brush radius (px)', 'brushWidth', 'number', model.brushRadius );
			radius.onchange = () => { model.brushRadius = THREE.MathUtils.clamp( radius.valueAsNumber || 50, 5, 250 ); radius.value = model.brushRadius; };
			const strength = modelField( this.brushSettings, 'Brush strength', 'opacity', 'number', model.brushStrength );
			strength.onchange = () => { model.brushStrength = THREE.MathUtils.clamp( strength.valueAsNumber || 0.5, 0.01, 1 ); strength.value = model.brushStrength; };

		}
	}

	syncToolbar() {

		const show = this.editor.config.getKey( 'settings/viewportToolbar' ) !== false;
		this.geometryTools.hidden = ! show;
		this.restoreToolbar.hidden = show;

	}

	toggleToolbar() {

		this.editor.config.setKey( 'settings/viewportToolbar', this.geometryTools.hidden );
		this.syncToolbar();

	}

	collectMeasurements() {

		this.measurements = [];
		this.editor.scene.traverse( object => { if ( object.userData.measurement ) this.measurements.push( object ); } );

	}

	togglePencil() {

		this.setMode( this.mode === 'pencil' ? this.pencilFromPaint ? 'paint' : '' : 'pencil' );

	}

	setMode( mode ) {

		if ( mode === 'mask' && ! canEditLightMask( this.editor.viewportSource ) ) mode = '';
		this.release();
		const wasPencil = this.mode === 'pencil';
		const wasPaint = this.mode === 'paint' || this.pencilFromPaint;
		this.pencilFromPaint = mode === 'pencil' && wasPaint;
		if ( mode === 'paint' && ! wasPaint && this.editor.viewportShading !== 'materials' ) {

			this.previousPaintShading = this.editor.viewportShading;
			this.editor.setViewportShading( 'materials' );

		} else if ( mode !== 'paint' && ! this.pencilFromPaint && this.previousPaintShading ) {

			if ( this.editor.viewportShading === 'materials' ) this.editor.setViewportShading( this.previousPaintShading );
			this.previousPaintShading = null;

		}
		this.mode = mode;
		if ( ! mode && ! wasPencil ) {

			const model = this.editor.modeling;
			model.selectionTool = 'select';
			model.knife = false;
			model.pen = false;
			model.penChain = null;
			model.brush = '';
			model.adding = false;

		}
		this.pathClosed = false;
		this.selector.value = mode;
		this.points = [];
		this.target = this.ruler = null;
		this.selected = - 1;
		this.status.textContent = '';
		this.readout.textContent = '';
		this.brushCursor = null;
		if ( mode === 'path' && ! this.editor.modeling.editMode ) {

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

		const pencil = this.mode === 'pencil';
		this.controls = pencil ? this.pencilControls : this.regularControls;
		this.status = pencil ? this.pencilStatus : this.regularStatus;
		this.regularControls.replaceChildren();
		this.pencilControls.replaceChildren();
		this.regularStatus.textContent = this.pencilStatus.textContent = '';
		this.pencilContext.hidden = ! pencil;
		const parent = this.controls;
		this.maskLayers = this.maskSelect = this.maskButtons = this.finishButton = this.removeButton = null;
		this.cursorFields = null;
		if ( ! this.mode ) return;
		if ( this.mode === 'cursor' ) {

			this.cursorFields = [ 'X', 'Y', 'Z' ].map( ( axis, index ) => {

				const field = modelField( parent, 'Cursor ' + axis, 'pivotOrigin', 'number', this.editor.cursor.getComponent( index ).toFixed( 3 ) );
				field.step = 'any';
				field.onchange = () => {

					if ( Number.isFinite( field.valueAsNumber ) ) this.editor.setCursor( this.editor.cursor.clone().setComponent( index, field.valueAsNumber ) );
					field.value = this.editor.cursor.getComponent( index ).toFixed( 3 );

				};
				return field;

			} );
			modelButton( parent, 'Done', 'exitTool', () => this.setMode( '' ) );
			return;

		}
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
			unit.onchange = () => { this.measure.unit = unit.value; if ( this.ruler ) this.finish(); this.draw(); };
			this.measureClosed = modelField( parent, 'Closed', 'toolMask', 'checkbox', this.measure.closed );
			this.measureClosed.onchange = event => { this.measure.closed = event.target.checked; if ( this.ruler ) this.finish(); this.draw(); };
			modelField( parent, 'Bind to mesh', 'link', 'checkbox', this.measure.bind ).onchange = event => { this.measure.bind = event.target.checked; };
			modelField( parent, 'Snap vertices', 'snapVertex', 'checkbox', this.measure.snap ).onchange = event => { this.measure.snap = event.target.checked; };
			this.finishButton = modelButton( parent, 'Save ruler', 'save', () => this.run( () => this.finish() ) );
			modelButton( parent, 'New ruler', 'add', () => { this.ruler = null; this.points = []; this.selected = - 1; this.draw(); } );
			const known = modelField( parent, 'Known length', 'toolMeasure', 'number', '' );
			known.min = '0';
			known.step = 'any';
			modelButton( parent, 'Calibrate units', 'calibrate', () => this.run( () => this.calibrate( known.valueAsNumber ) ) );

		} else if ( this.mode === 'pencil' ) {

			const tools = [
				[ 'vector', 'Draw editable stroke', 'freehandDraw' ],
				[ 'splats', 'Draw Pencil splats', 'pencilSplats' ],
				[ 'texture', 'Paint mesh texture', 'brush' ],
				[ 'erase', 'Erase mesh texture', 'erase' ],
				[ 'eraseStroke', 'Erase pencil strokes', 'remove' ]
			];
			const toolbar = element( 'div', parent );
			toolbar.className = 'pencil-tool-buttons';
			const picker = element( 'details', parent );
			picker.className = 'pencil-tool-picker';
			const summary = element( 'summary', picker );
			const [ , label, glyph ] = tools.find( ( [ tool ] ) => tool === this.pencilTool );
			summary.innerHTML = icon( glyph );
			summary.title = 'Pencil tool · ' + label;
			summary.setAttribute( 'aria-label', summary.title );
			const menu = element( 'div', picker );
			menu.className = 'pencil-stroke-options';
			for ( const target of [ toolbar, menu ] ) for ( const [ tool, name, glyph ] of tools ) {

				const button = modelButton( target, name, glyph, () => {

					this.pencilTool = tool;
					this.buildOptions();
					this.draw();
					if ( target === menu ) this.pencilControls.querySelector( '.pencil-tool-picker > summary' ).focus();

				} );
				button.setAttribute( 'aria-pressed', String( this.pencilTool === tool ) );

			}
			brushPalette( this.editor, parent, () => this.draw(), {
				strokeOptions: this.pencilUsesPlacement(), singleRow: true, curveCleanup: this.pencilTool === 'vector', dabSpacing: this.pencilTool !== 'vector',
				addStrokeControls: controls => this.buildPencilStrokeControls( controls )
			} );

		} else {

			modelField( parent, 'Color', 'color', 'color', this.brush.color ).oninput = event => { this.brush.color = event.target.value; };
			if ( this.mode === 'path' ) this.finishButton = modelButton( parent, 'Save path', 'save', () => this.run( () => this.finish() ) );
			else {

				const output = select( parent, 'Brush output', [ [ 'surface', 'Surface dabs' ], [ 'vector', 'Vector stroke' ], [ 'texture', 'Texture paint' ], [ 'splat', 'Gaussian splats' ] ] );
				output.value = this.brush.output;
				output.onchange = () => { this.brush.output = output.value; this.buildOptions(); };
				if ( this.brush.output === 'vector' || this.brush.output === 'splat' ) {

					const placement = select( parent, 'Stroke placement', [ [ 'surface', 'Surface' ], [ 'view', 'View plane' ] ] );
					placement.value = this.brush.placement;
					placement.onchange = () => { this.brush.placement = placement.value; placement.blur(); };

				}
				const width = modelField( parent, this.brush.output === 'vector' ? 'Sample spacing (px)' : 'Brush (px)', 'brushWidth', 'number', this.brush.diameter );
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
		if ( this.mode !== 'paint' && this.mode !== 'pencil' ) this.removeButton = modelButton( parent, 'Remove point', 'remove', () => this.removePoint() );
		if ( ! pencil ) modelButton( parent, 'Done', 'exitTool', () => this.setMode( '' ) );

	}

	pencilUsesPlacement() {

		return this.pencilTool === 'vector' || this.pencilTool === 'splats';

	}

	buildPencilStrokeControls( controls ) {

		const choice = ( label, key, options ) => {

			const input = select( controls, label, options );
			input.title = label;
			input.value = this.editor.config.getKey( key ) || options[ 0 ][ 0 ];
			input.onchange = () => { this.editor.config.setKey( key, input.value ); this.draw(); };

		};
		choice( 'Pencil drawing plane', 'settings/pencilDrawingPlane', [
			[ 'placement', 'Follow placement' ], [ 'view', 'View at start' ], [ 'upright', 'Upright from start' ],
			[ 'top', 'Top from start' ], [ 'front', 'Front from start' ], [ 'side', 'Side from start' ],
			[ 'strokeDepth', 'Follow stroke depth' ]
		] );
		choice( 'Pencil attachment target', 'settings/pencilStrokeDepth', [
			[ 'off', 'No attachment' ], [ 'segment', 'Any segment' ],
			[ 'first', 'Stroke starts' ], [ 'ends', 'Stroke ends' ]
		] );
		choice( 'Pencil attach points', 'settings/pencilAttachPoints', [
			[ 'ends', 'Attach first and last' ], [ 'first', 'Attach first only' ], [ 'all', 'Attach all points' ]
		] );
		for ( const [ label, glyph, key ] of [
			[ 'Pencil plane guide', 'plane', 'settings/pencilPlaneGuide' ],
			[ 'Pencil height guide', 'pivotBottom', 'settings/pencilHeightGuide' ]
		] ) {

			modelField( controls, label, glyph, 'checkbox', this.editor.config.getKey( key ) !== false ).onchange = event => {

				this.editor.config.setKey( key, event.target.checked );
				this.draw();

			};

		}

	}

	pencilPlacementSettings() {

		const { config } = this.editor;
		return {
			depthTarget: config.getKey( 'settings/pencilStrokeDepth' ) || 'off',
			attachPoints: config.getKey( 'settings/pencilAttachPoints' ) || 'ends',
			orientation: config.getKey( 'settings/pencilDrawingPlane' ) || 'placement'
		};

	}

	resizeBrush( factor ) {

		const model = this.editor.modeling;
		if ( this.mode === 'pencil' ) {

			const brush = pencilBrush( this.editor );
			const next = Math.round( brush.size * factor );
			brush.size = THREE.MathUtils.clamp( next === brush.size ? next + Math.sign( factor - 1 ) : next, 1, 256 );
			this.buildOptions();

		} else if ( this.mode === 'paint' ) {

			this.brush.diameter = THREE.MathUtils.clamp( Math.round( this.brush.diameter * factor ), 2, 100 );
			this.buildOptions();

		} else if ( ( model.brush && model.brush !== 'freehand' || model.selectionTool === 'circle' ) ) {

			model.brushRadius = THREE.MathUtils.clamp( Math.round( model.brushRadius * factor ), 5, 250 );
			this.refreshWorkspace();

		}
		this.draw();
		model.draw();

	}

	adjustBrushStrength( delta ) {

		const model = this.editor.modeling;
		if ( this.mode === 'pencil' ) {

			const brush = pencilBrush( this.editor );
			brush.strength = Math.round( THREE.MathUtils.clamp( brush.strength + delta, .01, 1 ) * 100 ) / 100;
			this.buildOptions();

		} else if ( this.mode === 'paint' ) {

			this.brush.opacity = Math.round( THREE.MathUtils.clamp( this.brush.opacity + delta, .01, 1 ) * 100 ) / 100;
			this.buildOptions();

		} else if ( model.brush && model.brush !== 'freehand' ) {

			model.brushStrength = Math.round( THREE.MathUtils.clamp( model.brushStrength + delta, .01, 1 ) * 100 ) / 100;
			this.refreshWorkspace();

		}
		this.draw(); model.draw();

	}

	run( action ) {

		try { this.status.textContent = ''; action(); }
		catch ( error ) { this.status.textContent = error.message; }

	}

	removePoint() {

		if ( ! this.points.length ) return;
		this.points.splice( this.selected < 0 ? this.points.length - 1 : this.selected, 1 );
		this.selected = - 1;
		if ( this.mode === 'measure' && this.ruler ) this.finish();
		this.draw();

	}

	finish() {

		const minimum = this.mode === 'mask' || this.mode === 'measure' && this.measure.closed ? 3 : 2;
		if ( this.mode === 'paint' || this.mode === 'pencil' || this.points.length < minimum ) return;
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

		if ( this.placeCursor( event ) ) return;
		if ( this.mode === 'cursor' ) return;
		if ( this.pointer || ! this.mode || event.button !== 0 || event.altKey || event.target !== this.editor.renderer?.domElement ) return;
		const frame = this.layout.at( event.clientX, event.clientY );
		if ( ! frame || this.mode === 'pencil' && ( ! frame.director || this.editor.editWorkspace?.exclusive || this.editor.modalTransform?.active || this.editor.flyControls?.active ) || this.mode === 'mask' && frame.source !== this.maskSource ) return;
		if ( this.mode === 'pencil' ) document.activeElement.blur?.();
		event.preventDefault();
		event.stopImmediatePropagation();
		const { clientX: x, clientY: y } = event;
		this.status.textContent = '';
		this.selected = ! [ 'paint', 'pencil' ].includes( this.mode ) ? this.nearestHandle( frame, x, y ) : - 1;
		if ( this.mode === 'mask' ) {

			if ( this.selected < 0 ) this.selected = this.points.push( normalized( this.layout.clientRect( frame ), x, y ) ) - 1;

		} else if ( this.mode === 'measure' ) {

			if ( this.selected < 0 ) {

				const point = this.measurePoint( frame, x, y );
				if ( ! point ) return;
				this.selected = this.points.push( point ) - 1;

			}

		} else {

			if ( this.mode === 'path' ) {

				rayToView( this.ray, this.layout, frame, x, y );
				const hit = meshHit( this.ray, this.editor.scene );
				if ( ! hit || hasRestriction( hit.object, 'locked' ) ) {

					this.status.textContent = 'Start on a visible, unlocked mesh.';
					return;

				}
				if ( this.target && this.target !== hit.object ) { this.status.textContent = 'Save this path before drawing on another mesh.'; return; }
				this.target = hit.object;
				this.pathView = frame.key;
				const point = localSurfacePoint( hit, this.ray );
				if ( this.selected < 0 ) {

					this.pathClosed = false;
					this.selected = this.points.push( point ) - 1;

				}

			} else {

				const pencil = this.mode === 'pencil';
				const style = pencilBrush( this.editor );
				const brush = pencil ? {
					output: { vector: 'vector', splats: 'splat', eraseStroke: 'eraseStroke' }[ this.pencilTool ] || 'texture',
					erase: this.pencilTool === 'erase', color: style.color, diameter: this.pencilTool === 'vector' ? 6 : style.size,
					opacity: style.strength, hardness: style.hardness, aspect: style.aspect, angle: style.angle,
					grain: style.grain, grainScale: style.grainScale, grainPattern: style.grainPattern,
					pressureSize: style.pressureSize, pressureOpacity: style.pressureOpacity
				} : this.brush;
				const { output, diameter } = brush;
				const pressure = pencil ? brushPressure( event ) : Math.max( .12, brushPressure( event ) );
				const spacing = output === 'vector' ? diameter : Math.max( 1, diameter * ( pencil ? style.spacing ?? .12 : .25 ) );
				const placement = pencil ? this.editor.modeling.placement : brush.placement;
				this.stroke = { ...brush, pencil, placement, frameKey: frame.key, object: this.editor.selected, startPixel: [ x, y ], marks: new Set(), receivers: new Map(),
					surfaces: paintSurfaces( this.editor.scene ), sampler: new StrokeSampler( x, y, pressure, spacing ) };
				if ( output === 'texture' ) this.stroke.texture = new TexturePaintStroke( this.editor );
				if ( output === 'eraseStroke' ) this.stroke.erased = new Set();
				if ( pencil && this.pencilUsesPlacement() ) {

					Object.assign( this.stroke, this.pencilPlacementSettings() );
					this.stroke.ignoreStartAnchor = event.ctrlKey || event.metaKey;
					this.stroke.style = { ...style };
					if ( output === 'splat' && style.grain > 0 ) this.stroke.grainTile = grainOpacity( style.grain, style.grainPattern );
					const cursor = this.project( this.editor.cursor, frame );
					const bounds = this.layout.clientRect( frame );
					this.stroke.guideCenter = cursor ? [ bounds.left + cursor[ 0 ] - frame.rect.x, bounds.top + cursor[ 1 ] - frame.rect.y ] :
						[ bounds.left + bounds.width / 2, bounds.top + bounds.height / 2 ];
					if ( style.stabilize || event.shiftKey ) this.stroke.stabilizer = [ x, y ];

				}
				this.paintDab( frame, x, y, pressure, 'start', event.ctrlKey || event.metaKey );
				this.refreshPaintPreview();

			}

		}
		this.pointer = { id: event.pointerId, target: event.target, key: frame.key, x, y };
		event.target.setPointerCapture( event.pointerId );
		this.draw();

	}

	placeCursor( event ) {

		const { editor, layout } = this;
		const shortcut = event.button === 2 && event.shiftKey;
		const tool = this.mode === 'cursor' && event.button === 0 && ! event.altKey;
		if ( ! ( shortcut || tool ) || event.target !== editor.renderer?.domElement ||
			this.pointer || editor.editWorkspace?.mode || editor.flyControls?.active || editor.modalTransform?.active ||
			editor.modeling.gesture || editor.modeling.drag ) return false;
		const frame = layout.at( event.clientX, event.clientY );
		if ( ! frame?.director ) return false;

		event.preventDefault();
		event.stopImmediatePropagation();
		if ( shortcut ) editor.suppressContextMenuUntil = performance.now() + 500;
		editor.scene.updateMatrixWorld( true );
		rayToView( this.ray, layout, frame, event.clientX, event.clientY );
		const { triangles, scans } = paintSurfaces( editor.scene );
		const hit = this.ray.intersectObjects( triangles, false )[ 0 ];
		const view = frame.camera;
		const distance = hit?.distance ?? view.position.distanceTo( editor.cursor );
		const height = view.isOrthographicCamera ? ( view.top - view.bottom ) / view.zoom :
			2 * Math.max( distance, view.near ) * Math.tan( THREE.MathUtils.degToRad( view.getEffectiveFOV() / 2 ) );
		this.ray.params.Points.threshold = 4 * height / frame.rect.height;
		const scan = this.ray.intersectObjects( scans, false )[ 0 ];
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint( view.getWorldDirection( new THREE.Vector3() ), editor.cursor );
		const point = scan && ( ! hit || scan.distance < hit.distance ) ? scan.point :
			hit?.point || this.ray.ray.intersectPlane( plane, new THREE.Vector3() );
		if ( point ) editor.setCursor( point );
		return true;

	}

	pointerMove( event ) {

		const pointer = this.pointer;
		if ( ! pointer && [ 'paint', 'pencil' ].includes( this.mode ) ) {

			const frame = this.layout.at( event.clientX, event.clientY );
			this.brushCursor = event.target === this.editor.renderer?.domElement && frame ? { x: event.clientX, y: event.clientY, frame } : null;
			this.draw();
			return;

		}
		if ( ! pointer || pointer.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		const { clientX: x, clientY: y } = event;
		if ( ! this.stroke && Math.hypot( x - pointer.x, y - pointer.y ) < 2 ) return;
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

		} else if ( this.stroke ) {

			this.brushCursor = samePane ? { x, y, frame } : null;
			const pressure = this.stroke.pencil ? brushPressure( event ) : Math.max( .12, brushPressure( event ) );
			if ( this.sampleStroke( frame, x, y, pressure, event ) ) this.refreshPaintPreview();

		}
		this.draw();

	}

	sampleStroke( frame, x, y, pressure, event ) {

		const stroke = this.stroke;
		const paint = ( px, py, force, phase, ignoreAnchor ) => {

			if ( stroke.guideCenter ) [ px, py ] = guidePencilPoint( [ px, py ], stroke.startPixel, stroke.guideCenter,
				stroke.style.guide, THREE.MathUtils.degToRad( stroke.style.guideAngle ) );
			if ( this.layout.at( px, py ) === frame ) this.paintDab( frame, px, py, force, phase, ignoreAnchor );
			else stroke.segment = null;

		};
		if ( stroke.style && ( stroke.style.stabilize || event.shiftKey ) ) {

			stroke.stabilizer ||= [ stroke.sampler.x, stroke.sampler.y ];
			[ x, y ] = stabilizePointer( stroke.stabilizer, x, y, stroke.style.stabilizeRadius );

		} else stroke.stabilizer = null;
		const sampled = stroke.sampler.move( x, y, pressure, paint );
		if ( event.type === 'pointerup' && ( stroke.output === 'vector' || stroke.pencil && stroke.output === 'splat' ) ) {

			const attach = stroke.depthTarget && stroke.depthTarget !== 'off' && stroke.attachPoints !== 'first';
			const ignore = event.ctrlKey || event.metaKey;
			const anchor = attach && ! ignore && this.layout.at( event.clientX, event.clientY ) === frame ?
				this.pickPencilStroke( frame, event.clientX, event.clientY, 22, stroke.depthTarget ) : null;
			if ( anchor ) this.paintDab( frame, event.clientX, event.clientY, pressure, 'end', false, anchor );
			else if ( stroke.sampler.remainder >= 1 ) paint( x, y, pressure, 'end', true );

		}
		return sampled;

	}

	pencilPoint( stroke, frame, x, y, phase, ignoreAnchor, anchor ) {

		const { scene, cursor } = this.editor;
		const ray = rayToView( this.ray, this.layout, frame, x, y ).ray;
		const viewNormal = frame.camera.getWorldDirection( new THREE.Vector3() );
		const starting = ! stroke.started;
		const followDepth = stroke.orientation === 'strokeDepth';
		const allowAnchor = ! ignoreAnchor && ! ( starting && stroke.ignoreStartAnchor ) && stroke.depthTarget !== 'off' &&
			( starting || stroke.attachPoints === 'all' || phase === 'end' && stroke.attachPoints === 'ends' );
		const hit = anchor || ( allowAnchor ? this.pickPencilStroke( frame, x, y, 22, stroke.depthTarget ) : null );
		const depth = followDepth && ! hit && ! ( starting && ( ignoreAnchor || stroke.ignoreStartAnchor ) ) ?
			this.pickPencilStroke( frame, x, y, 70, stroke.depthTarget === 'off' ? 'segment' : stroke.depthTarget ) : null;
		const through = ( normal, point ) => new THREE.Plane().setFromNormalAndCoplanarPoint( normal, point );
		const intersect = plane => ray.intersectPlane( plane, new THREE.Vector3() );
		if ( followDepth && ( hit || depth ) ) stroke.depthPlane = through( viewNormal, ( hit || depth ).point );

		let plane = stroke.plane || stroke.depthPlane;
		let receiver = stroke.planeReceiver || scene;
		let point = hit?.point ?? ( plane && intersect( plane ) );
		let onSurface = false;
		if ( starting && hit ) {

			stroke.anchor = hit.point;
			const parent = hit.object.parent;
			if ( parent && ! hasRestriction( parent, 'locked' ) ) receiver = parent;
			stroke.attachmentReceiver = receiver;

		}
		if ( ! plane ) {

			const surfacePlacement = stroke.placement === 'surface' || stroke.placement === 'surfacePerpendicular';
			if ( surfacePlacement && ! hit ) stroke.surfaces ||= paintSurfaces( scene );
			const surface = surfacePlacement && ! hit ? this.brushSurface( stroke, frame, x, y, true, true ) : null;
			if ( surface ) {

				onSurface = true;
				receiver = surface.object;
				point = receiver.localToWorld( new THREE.Vector3( ...surface.point ) );
				const normal = surface.hit.face ? ( surface.hit.normal || surface.hit.face.normal ).clone()
					.applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( surface.hit.object.matrixWorld ) ) : viewNormal.clone();
				if ( stroke.placement === 'surfacePerpendicular' && stroke.orientation === 'placement' ) {

					const perpendicular = viewNormal.clone().addScaledVector( normal, -viewNormal.dot( normal ) );
					plane = through( perpendicular.lengthSq() > 1e-6 ? perpendicular.normalize() : this.pencilUprightNormal( viewNormal ), point );
					stroke.plane = plane;
					stroke.planeReceiver = receiver;

				} else plane = through( normal, point );

			} else {

				const origin = cursor.clone();
				const normal = viewNormal.clone();
				if ( stroke.placement === 'ground' || surfacePlacement ) { origin.y = 0; normal.set( 0, 1, 0 ); }
				else if ( stroke.placement === 'object' && stroke.object && stroke.object !== scene ) {

					stroke.object.getWorldPosition( origin );
					normal.set( 0, 0, 1 ).applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( stroke.object.matrixWorld ) );

				}
				plane = through( normal, point || origin );
				point ||= intersect( plane );
				if ( point && ! surfacePlacement && ! followDepth ) {

					stroke.plane = plane;
					stroke.planeReceiver = receiver;

				}

			}

		}
		if ( ! point ) return;
		if ( starting && stroke.orientation !== 'placement' && ! followDepth ) {

			const normals = { top: [ 0, 1, 0 ], front: [ 0, 0, 1 ], side: [ 1, 0, 0 ] };
			const normal = stroke.orientation === 'upright' ? this.pencilUprightNormal( viewNormal ) :
				normals[ stroke.orientation ] ? new THREE.Vector3( ...normals[ stroke.orientation ] ) : viewNormal;
			stroke.plane = plane = through( normal, point );
			stroke.planeReceiver = receiver;

		}
		stroke.started = true;
		receiver = stroke.attachmentReceiver || ( hit && stroke.segment?.receiver ) || receiver;
		return { object: receiver, point: receiver.worldToLocal( point.clone() ).toArray(), normal: plane.normal, world: point, attached: Boolean( hit ), onSurface };

	}

	pencilUprightNormal( viewNormal ) {

		const normal = viewNormal.clone().setY( 0 );
		return normal.lengthSq() > 1e-6 ? normal.normalize() : new THREE.Vector3( 0, 0, 1 );

	}

	pickPencilStroke( frame, x, y, radius, target, excluded ) {

		const bounds = this.layout.clientRect( frame );
		const pixel = [ frame.rect.x + x - bounds.left, frame.rect.y + y - bounds.top ];
		let best, threshold = radius, nearestDepth = Infinity;
		this.editor.scene.traverseVisible( object => {

			const data = object.geometry?.userData.modeling;
			if ( data?.kind !== 'path' || ! data.points.length || object.userData.runtimeOnly || excluded?.has( object ) || ! isVisible( object ) ) return;
			if ( excluded && ( ! ( object.userData.pencilStroke || object.name === 'Pencil stroke' ) || hasRestriction( object, 'locked' ) ) ) return;
			const test = ( a, b, from, to ) => {

				if ( ! a || ! b ) return;
				const { distance, fraction } = closestPointOnSegment( pixel, a, b );
				if ( distance >= radius || distance > threshold + .25 ) return;
				const depthA = - from.clone().applyMatrix4( frame.camera.matrixWorldInverse ).z;
				const depthB = - to.clone().applyMatrix4( frame.camera.matrixWorldInverse ).z;
				const invA = frame.camera.isOrthographicCamera ? 1 : 1 / depthA;
				const invB = frame.camera.isOrthographicCamera ? 1 : 1 / depthB;
				const t = fraction * invB / ( ( 1 - fraction ) * invA + fraction * invB );
				const depth = THREE.MathUtils.lerp( depthA, depthB, t );
				if ( best && distance >= threshold - .25 && depth >= nearestDepth ) return;
				threshold = distance;
				nearestDepth = depth;
				best = { object, point: from.clone().lerp( to, t ) };

			};
			if ( target === 'first' || target === 'ends' ) {

				for ( const point of target === 'first' ? [ data.points[ 0 ] ] : [ data.points[ 0 ], data.points.at( -1 ) ] ) {

					const world = new THREE.Vector3( ...point ).applyMatrix4( object.matrixWorld );
					const screen = this.project( world, frame );
					test( screen, screen, world, world );

				}
				return;

			}
			// Pick the visible curve samples, including bends between authored points.
			const world = outlinePoints( THREE, data, Infinity ).map( point => point.applyMatrix4( object.matrixWorld ) );
			const screen = world.map( point => this.project( point, frame ) );
			for ( let i = 0; i < segmentCount( world, data.closed ); i ++ ) {

				const next = ( i + 1 ) % world.length;
				test( screen[ i ], screen[ next ], world[ i ], world[ next ] );

			}

		} );
		return best;

	}

	brushSurface( stroke, frame, px, py, includeScans, allowLocked = false ) {

		const { triangles, scans, receivers } = stroke.surfaces;
		if ( this.layout.at( px, py ) !== frame ) return;
		rayToView( this.ray, this.layout, frame, px, py );
		let hit = this.ray.intersectObjects( triangles, false ).find( hit => hit.face && isVisible( hit.object ) );
		if ( includeScans && scans.length ) {

			const camera = frame.camera;
			const reference = hit?.distance ?? camera.position.distanceTo( this.editor.controls.getCenter( camera ) );
			const visibleHeight = camera.isOrthographicCamera ? ( camera.top - camera.bottom ) / camera.zoom :
				2 * Math.max( reference, camera.near ) * Math.tan( THREE.MathUtils.degToRad( camera.getEffectiveFOV() / 2 ) );
			this.ray.params.Points.threshold = visibleHeight * Math.max( 4, stroke.diameter / 3 ) / frame.rect.height;
			const scan = this.ray.intersectObjects( scans, false ).find( sample => isVisible( sample.object ) );
			if ( scan && ( ! hit || scan.distance < hit.distance ) ) hit = scan;

		}
		const object = hit && receivers.get( hit.object );
		if ( ! object || ! object.parent ) return;
		const receiver = hasRestriction( object, 'locked' ) ? ( allowLocked ? this.editor.scene : null ) : object;
		if ( receiver ) return { object: receiver, hit, point: localSurfacePoint( hit, this.ray, receiver ) };

	}

	paintDab( frame, x, y, pressure, phase, ignoreAnchor, anchor ) {

		const stroke = this.stroke;
		const { triangles, scans } = stroke.surfaces;
		const sample = ( px, py, includeScans ) => this.brushSurface( stroke, frame, px, py, includeScans );
		this.editor.scene.updateMatrixWorld( true );
		if ( stroke.erased ) {

			const hit = this.pickPencilStroke( frame, x, y, stroke.diameter * brushSizeFactor( stroke, pressure ) / 2 + 3, 'segment', stroke.erased );
			if ( hit ) stroke.erased.add( hit.object );
			this.status.textContent = stroke.erased.size ? 'Release to erase ' + stroke.erased.size + ' stroke(s).' : '';
			return;

		}
		if ( stroke.output === 'vector' || stroke.output === 'splat' ) {

			let center;
			if ( stroke.pencil ) center = this.pencilPoint( stroke, frame, x, y, phase, ignoreAnchor, anchor );
			else if ( stroke.placement === 'view' ) {

				rayToView( this.ray, this.layout, frame, x, y );
				const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
					frame.camera.getWorldDirection( new THREE.Vector3() ), this.editor.controls.getCenter( frame.camera ) );
				const point = this.ray.ray.intersectPlane( plane, new THREE.Vector3() );
				if ( point ) center = { object: this.editor.scene, point: this.editor.scene.worldToLocal( point ).toArray() };

			} else center = sample( x, y, true );

			if ( ! center ) {

				stroke.segment = null;
				this.status.textContent = [ 'surface', 'surfacePerpendicular' ].includes( stroke.placement ) ? ( stroke.pencil ? 'Draw over a visible surface.' : 'Paint on a visible, unlocked surface.' ) : 'The brush ray does not reach the placement plane.';
				return;

			}
			this.status.textContent = '';
			if ( phase === 'end' && center.attached ) {

				stroke.endAnchor = true;
				const last = stroke.segment?.receiver === center.object && stroke.segment.points?.at( -1 );
				if ( last && new THREE.Vector3( ...last ).distanceToSquared( new THREE.Vector3( ...center.point ) ) < 1e-12 ) return;

			}
			if ( stroke.output === 'splat' && stroke.pencil ) {

				if ( stroke.segment?.receiver !== center.object ) {

					stroke.segment = { receiver: center.object, positions: [], radii: [], kernels: [], points: [], samples: [] };
					stroke.marks.add( stroke.segment );

				}
				const sample = this.pencilSample( stroke.style, center, frame, pressure );
				addPencilSplatDab( stroke.segment, center.point, sample, stroke.style, stroke.grainTile );
				return;

			}
			if ( stroke.output === 'splat' ) {

				let mark = stroke.receivers.get( center.object );
				if ( ! mark ) {

					mark = { receiver: center.object, positions: [], radii: [] };
					stroke.receivers.set( center.object, mark );
					stroke.marks.add( mark );

				}
				const camera = frame.camera;
				const depth = - center.object.localToWorld( new THREE.Vector3( ...center.point ) ).applyMatrix4( camera.matrixWorldInverse ).z;
				const height = camera.isOrthographicCamera ? ( camera.top - camera.bottom ) / camera.zoom :
					2 * depth * Math.tan( THREE.MathUtils.degToRad( camera.getEffectiveFOV() / 2 ) );
				mark.radii.push( height / frame.rect.height * stroke.diameter * pressure / 4 );
				mark.positions.push( ...center.point );
				return;

			}
			if ( stroke.segment?.receiver !== center.object ) {

				stroke.segment = { receiver: center.object, positions: [], points: [], samples: [], anchors: [] };
				stroke.marks.add( stroke.segment );

			}
			if ( center.attached ) stroke.segment.anchors.push( stroke.segment.points.length );
			stroke.segment.draped ||= center.onSurface;
			stroke.segment.points.push( center.point );
			stroke.segment.positions.push( ...center.point );
			if ( stroke.pencil ) stroke.segment.samples.push( this.pencilSample( stroke.style, center, frame, pressure ) );
			return;

		}
		const radius = stroke.diameter / 2 * ( stroke.pencil ? brushSizeFactor( stroke, pressure ) : pressure );
		if ( stroke.texture ) {

			const opacity = stroke.opacity * brushOpacityFactor( stroke, pressure );
			if ( opacity === 0 ) return;

			if ( ! stroke.projection?.matches( frame ) ) stroke.projection = new TexturePaintProjection( frame, triangles, scans );
			if ( ! stroke.projection.clipped ) {

				const rect = this.layout.clientRect( frame );
				const px = x - rect.left, py = y - rect.top;
				const faces = stroke.projection.faces( px, py, radius );
				let issue = '';
				for ( const face of faces ) {

					const [ anchor ] = face.screen;
					const result = stroke.texture.paint( face, stroke.color, opacity, radius,
						frame, anchor.x - px, anchor.y - py, stroke );
					issue ||= result;

				}
				this.status.textContent = faces.length ? issue : 'Choose a visible UV-mapped mesh.';
				return;

			}
			const faces = new Map();
			const stamp = ( contact, dx, dy ) => {

				if ( ! contact ) return;
				const hit = contact.hit;
				const key = [ contact.object.uuid, hit.instanceId, hit.faceIndex ].join( '/' );
				if ( faces.has( key ) ) return;
				faces.set( key, stroke.texture.paint( hit, stroke.color, opacity, radius, frame, dx, dy, stroke ) );

			};
			stamp( sample( x, y, true ), 0, 0 );
			for ( const fraction of [ .5, .95 ] ) for ( let i = 0; i < 8; i ++ ) {

				const angle = i * Math.PI / 4;
				const dx = radius * fraction * Math.cos( angle ), dy = radius * fraction * Math.sin( angle );
				stamp( sample( x + dx, y + dy, true ), dx, dy );

			}
			this.status.textContent = faces.size ? [ ...faces.values() ].find( Boolean ) || '' : 'Choose a visible UV-mapped mesh.';
			return;

		}
		const center = sample( x, y, true );
		if ( ! center ) return;
		const scanPlane = ! center.hit.face && new THREE.Plane().setFromNormalAndCoplanarPoint(
			frame.camera.getWorldDirection( new THREE.Vector3() ), center.object.localToWorld( new THREE.Vector3( ...center.point ) ) );
		const ring = Array.from( { length: 8 }, ( _, i ) => {

			const angle = i * Math.PI / 4;
			const dx = Math.cos( angle ) * radius, dy = Math.sin( angle ) * radius;
			if ( scanPlane && this.layout.at( x + dx, y + dy ) === frame ) {

				rayToView( this.ray, this.layout, frame, x + dx, y + dy );
				const point = this.ray.ray.intersectPlane( scanPlane, new THREE.Vector3() );
				return point && center.object.worldToLocal( point ).toArray();

			}
			for ( const t of [ 1, .66, .33, .14 ] ) {

				const sampleHit = sample( x + dx * t, y + dy * t );
				if ( sampleHit?.object === center.object && sampleHit.hit.instanceId === center.hit.instanceId &&
					Math.abs( sampleHit.hit.distance - center.hit.distance ) < Math.max( .005, center.hit.distance * .06 ) ) return sampleHit.point;

			}

		} );
		const mark = stroke.receivers.get( center.object ) || { receiver: center.object, positions: [], uploaded: 0 };
		for ( let i = 0; i < ring.length; i ++ ) {

			const a = ring[ i ], b = ring[ ( i + 1 ) % ring.length ];
			if ( a && b ) mark.positions.push( ...center.point, ...a, ...b );

		}
		if ( mark.positions.length ) { stroke.receivers.set( center.object, mark ); stroke.marks.add( mark ); }

	}

	pencilSample( style, center, frame, pressure ) {

		const { object, point, normal } = center;
		const { camera } = frame;
		const world = object.localToWorld( new THREE.Vector3().fromArray( point ) );
		const depth = -world.applyMatrix4( camera.matrixWorldInverse ).z;
		const height = camera.isOrthographicCamera ? ( camera.top - camera.bottom ) / camera.zoom :
			2 * Math.max( depth, camera.near ) * Math.tan( THREE.MathUtils.degToRad( camera.getEffectiveFOV() / 2 ) );
		const worldRadius = height / frame.rect.height * style.size * brushSizeFactor( style, pressure ) / 2;
		const inverse = object.matrixWorld.clone().invert();
		const right = new THREE.Vector3().setFromMatrixColumn( camera.matrixWorld, 0 );
		right.addScaledVector( normal, -right.dot( normal ) );
		if ( right.lengthSq() < 1e-8 ) right.setFromMatrixColumn( camera.matrixWorld, 1 ).cross( normal );
		right.normalize();
		const up = new THREE.Vector3().crossVectors( normal, right );
		const localRight = right.clone().transformDirection( inverse );
		const localUp = up.transformDirection( inverse );
		const localOrigin = new THREE.Vector3().fromArray( point );
		const radius = object.worldToLocal( object.localToWorld( localOrigin.clone() ).addScaledVector( right, worldRadius ) ).distanceTo( localOrigin );
		return { normal: normal.clone().applyMatrix3( new THREE.Matrix3().getNormalMatrix( inverse ) ).normalize().toArray(),
			right: localRight.toArray(), up: localUp.toArray(), radius, opacity: brushOpacityFactor( style, pressure ) };

	}

	pencilObject( stroke, points, samples, closed ) {

		const { color, strength, hardness, aspect, angle, grain, grainScale, grainPattern } = stroke.style;
		return modelObject( THREE, { kind: 'path', points, smooth: false, closed, planar: false,
			pencilBrush: { color, strength, hardness, aspect, angle, grain, grainScale, grainPattern, samples } }, 'Pencil stroke' );

	}

	refreshPaintPreview() {

		const { marks, color, opacity, diameter } = this.stroke;
		for ( const mark of marks ) {

			if ( mark.positions.length === mark.uploaded ) continue;
			if ( this.stroke.style ) {

				mark.preview?.removeFromParent();
				mark.preview?.geometry.dispose();
				mark.preview?.material.dispose();
				mark.preview = this.pencilObject( this.stroke, mark.points, mark.samples, false );
				mark.preview.userData.runtimeOnly = true;
				mark.receiver.add( mark.preview );
				mark.uploaded = mark.positions.length;
				continue;

			}
			if ( ! mark.preview ) {

				if ( mark.radii ) {

					mark.preview = new THREE.Points( new THREE.BufferGeometry(), new THREE.PointsMaterial( {
						color, size: diameter, sizeAttenuation: false, opacity, transparent: true, depthWrite: false
					} ) );

				} else mark.preview = mark.points ? surfacePath( [], color, false, opacity ) : surfacePaint( [], color, opacity );
				mark.preview.userData.runtimeOnly = true;
				mark.receiver.add( mark.preview );

			}
			mark.preview.geometry.dispose();
			mark.preview.geometry = new THREE.BufferGeometry();
			mark.preview.geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( mark.positions, 3 ) );
			mark.uploaded = mark.positions.length;

		}
		this.render();

	}

	pointerEnd( event ) {

		if ( this.pointer?.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		const stroke = this.stroke;
		if ( event.type === 'pointerup' && stroke ) {

			const frame = this.layout.frames.find( frame => frame.key === this.pointer.key );
			if ( frame ) this.sampleStroke( frame, event.clientX, event.clientY, stroke.sampler.pressure, event );

		}
		const commands = stroke?.texture?.finish( event.type === 'pointerup' ) || [];
		if ( event.type === 'pointerup' && this.mode === 'measure' && this.ruler ) this.finish();
		this.release();
		if ( event.type === 'pointerup' && stroke ) {

			if ( stroke.erased ) for ( const object of stroke.erased ) {

				if ( object.parent && ! hasRestriction( object, 'locked' ) ) commands.push( new RemoveObjectCommand( this.editor, object ) );

			}
			if ( stroke.erased ) this.status.textContent = '';
			for ( const mark of stroke.marks ) {

				const receiver = mark.receiver;
				if ( ( receiver !== this.editor.scene && ! receiver.parent ) || ! isVisible( receiver ) || hasRestriction( receiver, 'locked' ) ) continue;
				if ( mark.radii ) {

					commands.push( ...splatStrokeCommands( this.editor, mark, stroke.color, stroke.opacity ) );
					continue;

				}
				if ( mark.points && mark.points.length < 2 ) continue;
				const closed = stroke.pencil && ! stroke.endAnchor && stroke.marks.size === 1 && mark.points.length >= 4 &&
					Math.hypot( stroke.sampler.x - stroke.startPixel[ 0 ], stroke.sampler.y - stroke.startPixel[ 1 ] ) < 10;
				let points = closed ? mark.points.slice( 0, -1 ) : mark.points;
				let samples = closed ? mark.samples.slice( 0, -1 ) : mark.samples;
				if ( points && stroke.style && ( stroke.plane || ! mark.draped && stroke.orientation !== 'strokeDepth' ) ) {

					const frame = this.layout.frames.find( frame => frame.key === stroke.frameKey );
					points = smoothPencilStroke( points, stroke.style.smoothing, 2, mark.anchors );
					if ( frame ) {

						const reduced = simplifyPencilStroke( points, point => this.project( mark.receiver.localToWorld( new THREE.Vector3( ...point ) ), frame ),
							stroke.style.simplify, closed, mark.anchors );
						if ( reduced !== points ) {

							const kept = new Set( reduced );
							samples = samples.filter( ( _, i ) => kept.has( points[ i ] ) );
							points = reduced;

						}

					}

				}
				const object = stroke.style ? this.pencilObject( stroke, points, samples, closed ) :
					points ? surfacePath( points, stroke.color, closed, stroke.opacity ) : surfacePaint( mark.positions, stroke.color, stroke.opacity );
				commands.push( new AddObjectCommand( this.editor, object, receiver, false ) );

			}
			if ( commands.length ) this.editor.execute( commands.length === 1 ? commands[ 0 ] : new MultiCmdsCommand( this.editor, commands ), stroke.pencil && stroke.output === 'splat' ? 'Draw Pencil splats' : stroke.erased ? 'Erase pencil strokes' : stroke.erase ? 'Erase texture stroke' : stroke.texture ? 'Paint texture stroke' : stroke.pencil ? 'Draw pencil stroke' : 'Paint surface stroke' );

		}
		if ( stroke ) this.render();
		this.draw();

	}

	release() {

		const pointer = this.pointer;
		this.pointer = null;
		if ( this.stroke ) for ( const { preview } of this.stroke.marks.values() ) {

			preview?.removeFromParent();
			preview?.geometry.dispose();
			preview?.material.dispose();

		}
		this.stroke?.texture?.finish( false );
		if ( this.stroke?.erased ) this.status.textContent = '';
		this.stroke = null;
		this.brushCursor = null;
		if ( pointer?.target.hasPointerCapture( pointer.id ) ) pointer.target.releasePointerCapture( pointer.id );

	}

	drawPencilPlane( ctx, frame ) {

		const pointer = this.brushCursor;
		if ( pointer?.frame.key !== frame.key ) return;
		let [ x, y ] = this.stroke?.stabilizer || [ pointer.x, pointer.y ];
		const { config, scene } = this.editor;
		const preview = this.stroke ? { ...this.stroke } : {
			...this.pencilPlacementSettings(), placement: this.editor.modeling.placement,
			object: this.editor.selected, diameter: pencilBrush( this.editor ).size
		};
		if ( preview.guideCenter ) [ x, y ] = guidePencilPoint( [ x, y ], preview.startPixel, preview.guideCenter,
			preview.style.guide, THREE.MathUtils.degToRad( preview.style.guideAngle ) );
		scene.updateMatrixWorld( true );
		const sample = this.pencilPoint( preview, frame, x, y, 'preview' );
		if ( ! sample ) return;
		const { world: center, normal: n } = sample;
		const right = new THREE.Vector3().crossVectors( Math.abs( n.z ) < .9 ? new THREE.Vector3( 0, 0, 1 ) : new THREE.Vector3( 1, 0, 0 ), n ).normalize();
		const up = new THREE.Vector3().crossVectors( n, right );
		const camera = frame.camera;
		const depth = - center.clone().applyMatrix4( camera.matrixWorldInverse ).z;
		if ( depth <= camera.near ) return;
		const height = camera.isOrthographicCamera ? ( camera.top - camera.bottom ) / camera.zoom :
			2 * depth * Math.tan( THREE.MathUtils.degToRad( camera.getEffectiveFOV() / 2 ) );
		const span = height / frame.rect.height * 44;
		const point = ( u, v ) => this.project( center.clone().addScaledVector( right, span * u ).addScaledVector( up, span * v ), frame );
		ctx.save();
		ctx.strokeStyle = '#ffae66';
		ctx.lineWidth = 1;
		ctx.setLineDash( [ 4, 3 ] );
		ctx.beginPath();
		if ( config.getKey( 'settings/pencilPlaneGuide' ) !== false ) {

			for ( const [ u, v ] of [ [ -1, -1 ], [ -1, 0 ], [ -1, 1 ], [ 0, -1 ], [ 1, -1 ] ] ) {

				const start = point( u, v );
				for ( const end of [ u === -1 && point( 1, v ), v === -1 && point( u, 1 ) ] ) {

					if ( ! start || ! end ) continue;
					ctx.moveTo( ...start );
					ctx.lineTo( ...end );

				}

			}
			const base = this.project( center, frame );
			const tip = this.project( center.clone().addScaledVector( n, span * .55 ), frame );
			if ( base && tip ) { ctx.moveTo( ...base ); ctx.lineTo( ...tip ); }

		}
		ctx.stroke();
		if ( config.getKey( 'settings/pencilHeightGuide' ) !== false && Math.abs( center.y ) > 1e-6 ) {

			const top = this.project( center, frame );
			const ground = this.project( center.clone().setY( 0 ), frame );
			if ( top && ground ) {

				ctx.beginPath();
				ctx.moveTo( ...top );
				ctx.lineTo( ...ground );
				ctx.stroke();
				ctx.setLineDash( [] );
				ctx.beginPath();
				ctx.ellipse( ...ground, 4, 2.5, 0, 0, Math.PI * 2 );
				ctx.stroke();

			}

		}
		const anchor = preview.anchor && this.project( preview.anchor, frame );
		if ( anchor ) {

			ctx.setLineDash( [] );
			ctx.fillStyle = '#ffae66';
			ctx.beginPath();
			ctx.arc( ...anchor, 4, 0, Math.PI * 2 );
			ctx.fill();

		}
		ctx.restore();

	}

	draw() {

		if ( ! this.editor.renderer ) return;
		const overlays = this.editor.viewportOverlays;
		const showCursor = overlays && ! this.editor.editWorkspace?.mode && ! cleanShading( this.editor.viewportShading );
		this.overlay.hidden = ! showCursor && ! this.mode && ! ( overlays && this.measurements.length );
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
			if ( showCursor && frame.director ) {

				const pixel = this.project( this.editor.cursor, frame );
				if ( pixel ) drawCursor( ctx, ...pixel );

			}
			if ( overlays ) for ( const ruler of this.measurements ) {

				if ( ! isVisible( ruler ) || this.mode === 'measure' && ruler === this.ruler ) continue;
				const data = ruler.userData.measurement;
				this.drawRuler( ctx, frame, ruler, data.points, data, this.editor.selector.selection.includes( ruler ) );

			}
			if ( this.mode === 'measure' ) this.drawRuler( ctx, frame, this.ruler, this.points, this.measure, true );
			if ( this.mode === 'path' ) this.strokePixels( ctx, this.points.map( point => this.visiblePoint( frame, point ) ), this.pathClosed, true );
			if ( this.mode === 'mask' && frame.source === this.maskSource ) {

				ctx.strokeStyle = '#c0c9de';
				ctx.strokeRect( rect.x + .5, rect.y + .5, rect.width - 1, rect.height - 1 );
				this.strokePixels( ctx, this.points.map( point => this.visiblePoint( frame, point ) ), true, true );

			}
			if ( showCursor && this.mode === 'pencil' && this.pencilUsesPlacement() && frame.director &&
				( this.editor.config.getKey( 'settings/pencilPlaneGuide' ) !== false ||
				  this.editor.config.getKey( 'settings/pencilHeightGuide' ) !== false ) ) this.drawPencilPlane( ctx, frame );
			if ( showCursor && frame.director && this.stroke?.stabilizer && this.brushCursor?.frame.key === frame.key ) {

				const bounds = this.layout.clientRect( frame );
				const [ x, y ] = this.stroke.stabilizer;
				const tip = [ rect.x + x - bounds.left, rect.y + y - bounds.top ];
				ctx.strokeStyle = '#ffae66';
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo( ...tip );
				ctx.lineTo( rect.x + this.brushCursor.x - bounds.left, rect.y + this.brushCursor.y - bounds.top );
				ctx.stroke();
				ctx.beginPath();
				ctx.arc( ...tip, 3, 0, 2 * Math.PI );
				ctx.stroke();

			}
			if ( ( this.mode === 'paint' || this.mode === 'pencil' && frame.director && this.pencilTool !== 'vector' ) &&
				this.brushCursor?.frame.key === frame.key ) {

				const bounds = this.layout.clientRect( frame );
				ctx.beginPath();
				ctx.arc( rect.x + this.brushCursor.x - bounds.left, rect.y + this.brushCursor.y - bounds.top, ( this.mode === 'pencil' ? pencilBrush( this.editor ).size : this.brush.diameter ) / 2, 0, 2 * Math.PI );
				ctx.strokeStyle = this.mode === 'pencil' ? pencilBrush( this.editor ).color : this.brush.color;
				ctx.lineWidth = 1.5;
				ctx.stroke();

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

function drawCursor( ctx, x, y ) {

	ctx.save();
	ctx.translate( x, y );
	ctx.lineWidth = 1.5;
	ctx.strokeStyle = '#e9e9e9';
	ctx.beginPath();
	ctx.moveTo( -12, 0 ); ctx.lineTo( 12, 0 );
	ctx.moveTo( 0, -12 ); ctx.lineTo( 0, 12 );
	ctx.stroke();
	for ( let i = 0; i < 8; i ++ ) {

		ctx.strokeStyle = i % 2 ? '#f14b57' : '#ffffff';
		ctx.beginPath();
		ctx.arc( 0, 0, 8, i * Math.PI / 4, ( i + 1 ) * Math.PI / 4 );
		ctx.stroke();

	}
	ctx.restore();

}
