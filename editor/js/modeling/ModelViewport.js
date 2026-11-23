import { isPencilStroke, regionHitsPencilStroke } from './PencilSelection.js';
import { cutAcrossMesh, loopCut, dissolveEdge, autoQuad } from './PolyOperations.js';
import { elementKey, selectionCandidates, applySelection, connectedSelection, edgeLoop, selectionRegionContains, meshEdges, combineSelection } from './MeshSelection.js?v=shape-selection';
import { evaluateModifiers, modifierSource, modifierStackCommands, setModifierStack } from './Modifiers.js?v=poly-context';
import { separateMesh } from './MeshSeparation.js';
import { meshBrushes, strokeBrushes, sculptNeighbors, sculptPoints } from './SculptBrush.js?v=stroke-edit';
import * as THREE from 'three';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { AddMeshPrimitiveCommand } from '../commands/AddMeshPrimitiveCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { SetPositionCommand } from '../commands/SetPositionCommand.js';
import { SetRotationCommand } from '../commands/SetRotationCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { meshHit, paintSurfaces } from './SurfacePicking.js';
import { TexturePaintProjection } from './TexturePaintProjection.js';
import { interpolatePoint, segmentCount } from './Contour.js';
import { joinMeshGeometry } from './MeshJoin.js';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';
import { modelSnapMode, snapIncrement, snapMeshFeature } from './ModelSnap.js';
import { automaticAxis, constraintHint, createSnapBaseMarker, createTransformPointer, endsConstraintDrag, isConstraintDrag, modalSnapMode, pickTransformSnapBase, showSnapBase, showTransformPointer,
	snapBaseHint, startConstraintDrag, trackballDelta, transformHints, transformModes, transformNumber } from './TransformGesture.js?v=transform-gizmos';
import { addFace, appendModelPoint, insertModelPoint, pencilSamples, boundaryEdge, extrudeEdge, extrudeFace, faceNormal, isClosedOutline, meshFromOutline, modelData, modelGeometry, modelObject, moveAuthoredMeshPoints, outlinePoints, readModelGeometry, pokeFace, removePoints, splitEdge, weldPoints } from './ModelGeometry.js?v=texture-projection';


const editSelectionColor = '#ff9d45';
const editWireColor = '#22262d';
const worldAxes = [ new THREE.Vector3( 1, 0, 0 ), new THREE.Vector3( 0, 1, 0 ), new THREE.Vector3( 0, 0, 1 ) ];

function elementCenter( data, ids ) {

	const point = [ 0, 0, 0 ];
	for ( const index of ids ) for ( let axis = 0; axis < 3; axis ++ ) point[ axis ] += data.points[ index ][ axis ];
	return point.map( value => value / ids.length );

}

export function editableMesh( object ) {

	return object?.isMesh && ! object.isSkinnedMesh && ! object.isInstancedMesh &&
		object.geometry?.attributes.position && ! Object.keys( object.geometry.morphAttributes ).length;

}

export class ModelViewport {

	constructor( editor, viewport, render ) {

		this.editor = editor;
		this.viewport = viewport;
		this.render = render;
		this.indices = [];
		this.editMode = false;
		this.selectionMode ||= 'vertex';
		this.selectionTool = 'select';
		this.selectionOperation = 'set';
		this.brushRadius = 50;
		this.brushStrength = 0.5;
		this.proxy = new THREE.Object3D();
		this.proxy.name = 'Modeling pivot';
		this.ray = new THREE.Raycaster();
		this.depthViews = new WeakMap();
		this.depthPoint = new THREE.Vector3();
		this.overlay = document.createElement( 'canvas' );
		this.overlay.className = 'modeling-overlay';
		this.overlay.setAttribute( 'aria-hidden', 'true' );
		this.overlay.hidden = true;
		viewport.append( this.overlay );
		this.context = this.overlay.getContext( '2d' );

		viewport.addEventListener( 'pointerdown', event => {

			const control = document.activeElement;
			if ( event.target === editor.renderer?.domElement && control?.closest( '.viewport-tool-panel, .modeling-panel, #animation, .viewport-edit-workspace' ) ) control.blur();
			this.pointerDown( event );

		}, true );
		viewport.addEventListener( 'pointermove', event => this.pointerMove( event ), true );
		viewport.addEventListener( 'pointerleave', () => {

			if ( ! this.placementSnap && ! this.penHover && ! this.isSculpting ) return;
			if ( this.isSculpting ) this.lastPointer = null;
			this.placementSnap = this.penHover = null;
			this.draw();

		} );
		viewport.addEventListener( 'pointerup', event => this.pointerEnd( event ), true );
		viewport.addEventListener( 'pointercancel', event => this.pointerEnd( event, true ), true );
		viewport.addEventListener( 'lostpointercapture', event => this.pointerEnd( event, true ), true );
		viewport.addEventListener( 'dblclick', event => this.closeOnFirstPoint( event ), true );
		for ( const type of [ 'mousedown', 'mouseup', 'dblclick', 'touchstart', 'touchend' ] ) viewport.addEventListener( type, event => {

			if ( this.object && ! editor.viewTools?.mode && event.target === editor.renderer?.domElement ) event.stopImmediatePropagation();

		}, true );

		const { signals } = editor;
		for ( const name of [ 'sceneGraphChanged', 'geometryChanged', 'objectChanged', 'materialChanged', 'viewportVisibilityChanged', 'timelineFrameChanged' ] ) {

			signals[ name ].add( () => { this.depthViews = new WeakMap(); } );

		}
		this.snapBaseMarker = createSnapBaseMarker( viewport );
		this.transformPointer = createTransformPointer( viewport );
		signals.sceneRendered.add( () => { this.draw(); this.refreshSnapBaseMarker(); this.refreshTransformPointer(); } );
		signals.transformSettingsChanged.add( () => { if ( this.object && ! this.gesture ) this.changed(); } );
		signals.cursorChanged.add( () => {

			if ( this.object && this.indices.length && ! this.gesture && editor.config.getKey( 'settings/transformPivot' ) === 'cursor' ) this.updateProxy();

		} );
		window.addEventListener( 'pointermove', event => {
			this.lastPointer = event;
			if ( this.gesture?.modal ) this.updateModal( event );
		}, true );
		window.addEventListener( 'pointerdown', event => {

			const state = this.gesture;
			if ( ! state?.modal || ! [ 0, 1, 2 ].includes( event.button ) || ! viewport.contains( event.target ) ) return;
			if ( event.button === 1 && state.extrusion ) return;
			if ( this.gesture.extrusion && ( event.target !== editor.renderer?.domElement || editor.viewLayout.at( event.clientX, event.clientY ) !== editor.viewLayout.navigation ) ) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if ( event.button === 2 ) editor.suppressContextMenuUntil = performance.now() + 500;
			if ( ! state.extrusion && isConstraintDrag( event ) ) {

				if ( editor.viewLayout.at( event.clientX, event.clientY ) === this.frame && ! state.pickingBase ) {

					if ( event.button === 0 ) {

						state.snapBase = this.movingSnapBase();
						this.rebaseModal( event );

					}
					state.auto = startConstraintDrag( event, state.mode );
					this.labelModal();

				}
				return;

			}
			if ( state.pickingBase ) {

				if ( event.button === 2 ) state.pickingBase = false;
				else if ( editor.viewLayout.at( event.clientX, event.clientY ) === this.frame ) this.pickModalSnapBase( event );
				this.labelModal();
				return;

			}
			this.finishTransform( event.button === 0 );

		}, true );
		for ( const type of [ 'pointerup', 'pointercancel' ] ) window.addEventListener( type, event => {

			const state = this.gesture;
			if ( ! endsConstraintDrag( state?.auto, event ) ) return;
			const accept = event.type === 'pointerup' && state.auto.button === 0 && state.auto.locked;
			state.auto = null;
			event.stopImmediatePropagation();
			if ( accept ) this.finishTransform( true );
			else this.labelModal();

		}, true );
		window.addEventListener( 'keyup', event => {

			const state = this.gesture;
			if ( ! state?.modal || state.extrusion ) return;
			if ( event.key === 'Alt' && state.auto && state.auto.button === undefined ) {

				if ( state.auto.locked ) {

					state.snapBase = this.movingSnapBase();
					this.rebaseModal( this.modalPointer( event ) );

				}
				state.auto = null;
				this.labelModal();

			}
			if ( [ 'Shift', 'Control' ].includes( event.key ) ) this.updateModal( this.modalPointer( event ) );

		}, true );
		signals.geometryChanged.add( object => {

			if ( this.object !== object ) return;
			this.penChain = null;
			const wasProfile = this.data?.profile;
			this.data = this.read( object );
			if ( this.data.kind === 'vertices' ) { this.pen = false; this.knife = false; }
			if ( this.data.profile && ! wasProfile ) this.adding = true;
			this.indices = this.indices.filter( index => index < this.data.points.length );
			this.changed();

		} );
		signals.objectSelected.add( object => {

			if ( this.drag?.sculpt ) this.releaseDrag();
			if ( this.editMode && object !== this.object ) this.setTarget( object );

		} );
		signals.objectChanged.add( ( object, property ) => {

			if ( this.object && ! this.canEdit() ) { this.setTarget( null ); return; }
			if ( object === this.object && property === 'userData' && ! this.drag && ! this.gesture ) {

				this.data = this.read( object );
				this.indices = this.indices.filter( i => i < this.data.points.length );
				this.changed(); this.render();

			}

		} );
		signals.startPlayer.add( () => this.stop() );
		signals.editorCleared.add( () => this.stop() );
		window.addEventListener( 'keydown', event => {

			if ( editor.flyControls?.active ) return;

			if ( this.drag?.objectSelection && event.key === 'Escape' ) {

				event.preventDefault();
				event.stopImmediatePropagation();
				this.releaseDrag();
				this.draw();
				return;

			}
			if ( ( ! this.object && ! this.drag?.sculpt ) || editor.viewTools?.mode || editor.editWorkspace?.exclusive || document.querySelector( 'dialog[open]' ) || event.target.closest?.( '.context-menu, .viewport-edit-workspace' ) ) return;
			if ( this.gesture?.modal ) { this.modalKey( event ); return; }
			if ( this.penChain && ! event.target.closest?.( 'input, textarea, select, [contenteditable]' ) && [ 'Escape', 'Enter', 'f', 'F' ].includes( event.key ) ) {

				event.preventDefault();
				event.stopImmediatePropagation();
				if ( event.key === 'Escape' ) { this.penChain = null; this.changed(); this.render(); }
				else editor.viewTools.run( () => this.finishPenFace() );
				return;

			}
			if ( event.key === 'Escape' && ( this.gesture || this.drag ) ) {

				event.preventDefault();
				event.stopImmediatePropagation();
				if ( this.drag ) this.releaseDrag();
				else this.cancelGizmo?.();
				this.changed();
				this.render();
				return;

			}
			if ( editor.keymap?.overEditableViewport === false ) return;
			const editingField = event.target.closest?.( 'input, textarea, select, [contenteditable]' );
			if ( ! editingField && this.data.faces?.length && ! event.ctrlKey && ! event.metaKey && event.key.toLowerCase() === 'k' ) {

				event.preventDefault(); event.stopImmediatePropagation(); this.toggleKnife(); return;

			}
			if ( ! editingField && this.pen && ( this.penChain || this.drag ) && ! event.ctrlKey && ! event.metaKey && [ 'x', 'y', 'z' ].includes( event.key.toLowerCase() ) ) {

				event.preventDefault(); event.stopImmediatePropagation();
				const state = this.drag || this.penChain, axis = event.key.toUpperCase();
				state.axis = state.axis === axis ? '' : axis; state.planeLock = event.shiftKey; return;

			}

			if ( ! editingField && ! ( event.altKey || event.metaKey || event.ctrlKey || event.shiftKey ) && ! event.repeat ) {

				const key = event.key.toLowerCase();
				const open = key === 'f' && this.data.kind === 'path' && isClosedOutline( this.data );
				const close = ( this.adding && key === 'enter' || key === 'f' ) && this.canCloseProfile();
				const fill = key === 'f' && this.data.kind === 'mesh' && this.indices.length >= 3 && this.selectedFace() < 0;
				const extrude = key === 'e' && this.extrusionSelection();
				if ( open || close || fill || extrude ) {

					event.preventDefault();
					event.stopImmediatePropagation();
					editor.viewTools.run( () => {

						if ( open ) this.openPath();
						else if ( close ) this.closeProfile();
						else if ( fill ) this.fillFace();
						else this.startExtrusion();

					} );
					return;

				}

			}
			if ( editingField ) return;
			const deleting = [ 'Delete', 'Backspace' ].includes( event.key ) && ! event.target.closest?.( 'input, textarea, select, [contenteditable]' );
			if ( event.key !== 'Escape' && ! deleting ) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if ( event.key === 'Escape' ) {

				this.selectPoints( false );

			}
			else this.removeSelection();

		}, true );

	}

	read( object ) {

		const geometry = modifierSource( object );
		return readModelGeometry( geometry );
	}

	canEdit() {

		return this.object && isVisible( this.object ) && ! hasRestriction( this.object, 'locked' );

	}

	setMode( mode ) {

		if ( mode === 'edit' ) this.start( this.editor.selected );
		else this.stop();

	}

	start( object ) {

		if ( this.editor.viewTools?.mode ) this.editor.viewTools.setMode( '' );
		if ( this.editor.viewportSource && ! this.editor.viewportSplit ) this.editor.splitWorkspace.split( this.editor.viewportSplitAxis );
		this.editMode = true;
		this.setTarget( object );
		if ( object?.userData.measurement ) this.editor.viewTools.setMode( 'measure' );

	}

	stop() {

		if ( ! this.editMode ) return;
		this.editMode = false;
		this.setTarget( null );

	}

	canEditTarget( object ) {

		const sourceGeometry = object?.geometry ? modifierSource( object ) : null;
		const data = sourceGeometry?.userData.modeling;
		return object && ( data || editableMesh( object ) ) && isVisible( object ) && ! hasRestriction( object, 'locked' ) &&
			( ! object.userData.surfaceMark || data?.kind === 'path' ) && ( data?.points || sourceGeometry.attributes.position.count <= 20000 );

	}

	setTarget( object ) {

		const wasPencilStroke = this.isPencilStroke;
		this.releaseDrag();
		if ( this.gesture?.modal ) this.finishTransform( false );
		else if ( this.gesture ) this.cancelGizmo?.();
		const editable = this.canEditTarget( object );
		this.object = editable ? object : null;
		this.data = editable ? this.read( object ) : null;
		this.indices = [];
		this.elements = new Map();
		this.adding = Boolean( this.data?.profile );
		this.pen = this.editMode && Boolean( this.pen );
		if ( this.isPencilStroke ) {

			if ( ! wasPencilStroke ) this.preStrokeSelectionMode = this.selectionMode;
			this.selectionMode = 'vertex';
			this.pen = this.knife = false;

		} else if ( wasPencilStroke ) {

			this.selectionMode = this.preStrokeSelectionMode;
			if ( [ 'thickness', 'opacity' ].includes( this.brush ) && this.sculptBrushes === meshBrushes ) this.brush = 'grab';

		}
		this.penHover = null;
		this.penChain = null;
		if ( ! this.editMode ) this.brush = '';
		this.changed();
		this.render();

	}

	syncTool() {

		if ( this.editor.viewTools?.mode ) {

			this.releaseDrag();
			if ( this.gesture?.modal ) this.finishTransform( false );
			else if ( this.gesture ) this.cancelGizmo?.();

		}

	}

	create( kind, empty = false, freehand = false ) {

		const labels = { path: 'Editable path', shape: 'Editable shape', mesh: 'Editable mesh' };
		const data = modelData( kind );
		if ( freehand ) data.planar = false;
		if ( empty ) {

			data.points = [];
			if ( kind === 'shape' ) data.closed = false;
			if ( data.faces ) { data.faces = []; data.profile = true; }

		}
		const object = modelObject( THREE, data, labels[ kind ] );
		object.position.copy( this.editor.cursor );
		this.editor.execute( new AddObjectCommand( this.editor, object ) );
		this.start( object );
		this.adding = empty && ! freehand;
		this.pen = kind === 'mesh';
		this.brush = freehand ? 'freehand' : '';
		this.changed();
		this.render();

	}

	get canInsertPrimitive() {

		return this.canSelectTopology && editableMesh( this.object ) &&
			( this.data.kind === 'vertices' || this.data.kind === 'mesh' ) && ! this.data.profile;

	}

	insertPrimitive( name, primitive ) {

		if ( ! this.canInsertPrimitive ) return;
		const object = this.object, source = modifierSource( object ), start = this.data.points.length;
		object.updateWorldMatrix( true, false );
		if ( object.matrixWorld.determinant() === 0 ) throw new Error( 'Add Mesh requires an object with nonzero scale.' );
		const placement = new THREE.Matrix4().makeTranslation( ...this.editor.cursor.toArray() ).premultiply( object.matrixWorld.clone().invert() );
		const material = Array.isArray( object.material ) ? object.material[ 0 ] : object.material;
		const before = { indices: this.indices.slice(), mode: this.selectionMode, loops: [ ...this.elements.values() ].map( loop => loop.slice() ) };
		const stack = object.userData.modifiers;
		const oldGeometry = object.geometry, oldUserData = object.userData;
		const build = input => {

			const { geometry } = joinMeshGeometry( THREE, [
				{ geometry: source, material: object.material, matrix: new THREE.Matrix4() },
				{ geometry: input, material, matrix: placement }
			], true );
			const after = { indices: geometry.userData.modeling.points.slice( start ).map( ( _, index ) => start + index ) };
			let commands;
			if ( stack?.length ) {

				try { commands = modifierStackCommands( this.editor, object, stack, geometry ); }
				finally { geometry.dispose(); }
				commands[ 0 ].oldValue = oldUserData;

			} else commands = [ new SetGeometryCommand( this.editor, object, geometry ) ];
			commands.at( -1 ).oldGeometry = oldGeometry;
			return { commands, after };

		};
		const { commands, after } = build( primitive );
		const command = new AddMeshPrimitiveCommand( this.editor, object, commands, before, after );
		this.editor.execute( command, 'Add ' + name );
		return {
			command,
			available: () => this.object === object && this.canInsertPrimitive,
			replace: input => {

				const next = build( input );
				command.replaceResult( next.commands, next.after );

			}
		};

	}

	restorePointSelection( { indices, mode, loops } ) {

		this.indices = indices.filter( index => index < this.data.points.length );
		this.elements.clear();
		if ( this.selectionMode !== 'vertex' ) {

			const selected = new Set( this.indices );
			const drawn = mode === this.selectionMode ? loops : this.data.faces.flatMap( face => this.selectionMode === 'face' ?
				[ face ] : face.map( ( index, i ) => [ index, face[ ( i + 1 ) % face.length ] ] ) );
			for ( const loop of drawn ) if ( loop.every( index => selected.has( index ) ) ) this.elements.set( elementKey( loop ), loop );

		}
		this.changed();
		this.render();

	}

	actions() {

		if ( ! this.data ) return [];
		const { data, indices } = this;
		const actions = [];
		const add = ( label, glyph, run, disabled = false, pressed ) => actions.push( { label, glyph, run, disabled, pressed } );
		if ( data.points.length ) add( 'Sculpt brushes', 'sculptTool', () => this.setBrush( this.brush && this.brush !== 'freehand' ? '' : 'grab' ), false, Boolean( this.brush && this.brush !== 'freehand' ) );
		if ( data.faces?.length && ! data.profile ) add( 'Knife (K)', 'knifeTool', () => this.toggleKnife(), false, !! this.knife );
		if ( data.kind === 'vertices' ) {

			add( 'Polybuild (6)', 'topologyPen', () => this.togglePen() ); return actions;

		}
		add( this.adding ? 'Stop adding' : 'Add points', 'add', () => {

			this.brush = '';
			this.pen = false;
			this.adding = ! this.adding;
			this.changed();
			this.render();

		}, false, this.adding );
		add( 'Remove selected', 'remove', () => this.edit( 'Remove modeling points', next => { removePoints( next, indices ); return []; } ), ! indices.length );
		add( 'Clear points', 'delete', () => this.edit( 'Clear modeling points', next => {

			if ( next.pencilBrush ) removePoints( next, next.points.map( ( _, i ) => i ) );
			else next.points = [];
			if ( next.kind === 'shape' || next.kind === 'path' ) next.closed = false;
			if ( next.faces ) next.faces = [];
			return [];

		} ), ! data.points.length );
		if ( data.kind === 'mesh' ) {

			add( 'Topology pen', 'topologyPen', () => this.togglePen(), false, this.pen );
			add( 'Weld selected vertices', 'weldTool', () => this.weld(), indices.length < 2 || Boolean( data.profile ) );
			const face = this.selectedFace();
			const adjacent = indices.length === 2 && data.faces.some( face => face.some( ( point, index ) =>
				indices.includes( point ) && indices.includes( face[ ( index + 1 ) % face.length ] ) ) );
			add( 'Fill face', 'fillTool', () => this.fillFace(), ( ! data.profile || data.points.length < 3 ) && ( indices.length < 3 || face >= 0 ) );
			add( 'Split edge', 'splitTool', () => this.edit( 'Split mesh edge', next => [ splitEdge( next, ...indices ) ] ), ! adjacent );
			add( 'Delete face', 'deleteFace', () => this.edit( 'Delete mesh face', next => { next.faces.splice( face, 1 ); } ), face < 0 );
			const extrusion = this.extrusionSelection();
			add( extrusion?.edge ? 'Extrude edge' : 'Extrude face', 'extrude', () => this.startExtrusion(), ! extrusion );

		} else {

			if ( data.kind === 'path' && isClosedOutline( data ) ) add( 'Open path', 'closeTool', () => this.openPath() );
			else add( 'Close outline', 'closeTool', () => this.closeProfile(), ! this.canCloseProfile() );
			add( 'Extrude outline', 'extrude', () => this.startExtrusion(), ! this.extrusionSelection() );
			add( 'Insert point', 'snapMidpoint', () => this.edit( 'Insert outline point', next => {

				const i = indices[ 0 ];
				if ( i < segmentCount( next.points, isClosedOutline( next ) ) ) return [ insertModelPoint( next, i, .5 ) ];
				const point = next.points[ i ];
				const previous = next.points[ i - 1 ];
				return [ appendModelPoint( next, previous ? interpolatePoint( point, previous, -.5 ) : [ point[ 0 ] + .5, point[ 1 ], point[ 2 ] ] ) ];

			} ), indices.length !== 1 );
			if ( data.kind === 'path' ) add( 'Create shape from path', 'snapFace', () => {

				const object = this.object;
				const shape = this.toShape();
				object.updateWorldMatrix( true, false );
				if ( object.parent !== this.editor.scene ) object.matrixWorld.decompose( shape.position, shape.quaternion, shape.scale );
				this.editor.execute( new AddObjectCommand( this.editor, shape ) );
				this.start( shape );

			}, ! data.closed || data.points.length < 3 );

		}
		return actions;

	}

	togglePen() {

		if ( ! this.canEdit() || ! this.data.faces?.length || this.gesture || this.drag ) return;
		if ( this.data.kind === 'vertices' ) {

			const data = { kind: 'mesh', points: structuredClone( this.data.points ), faces: structuredClone( this.data.faces ) };
			this.commit( 'Convert to editable polygon mesh', data, [] );

		}
		this.knife = false;
		this.pen = ! this.pen;
		this.brush = '';
		this.adding = false;
		this.penHover = null;
		this.penChain = null;
		this.changed();
		this.render();

	}

	toggleKnife() {

		if ( ! this.canEdit() || ! this.data.faces?.length || this.data.profile ) return;
		if ( this.data.kind === 'vertices' ) this.commit( 'Convert to editable polygon mesh', { kind: 'mesh', points: structuredClone( this.data.points ), faces: structuredClone( this.data.faces ) }, [] );
		this.knife = ! this.knife; this.pen = false; this.penChain = null; this.brush = ''; this.adding = false;
		this.changed(); this.render();

	}

	beginKnife( event, pending = false ) {

		const rect = this.rect(), start = [ event.clientX - rect.left, event.clientY - rect.top ];
		this.drag = { knife: ! pending, penEmpty: pending, start, end: start, downAt: performance.now(), event, target: event.target, id: event.pointerId };
		event.preventDefault(); event.stopImmediatePropagation(); event.target.setPointerCapture( event.pointerId ); this.draw();

	}

	finishKnife( drag, cancel ) {

		if ( cancel ) { this.draw(); return; }
		if ( drag.penEmpty && ! drag.knife ) { this.addPenPoint( drag.event, -1 ); return; }
		const data = structuredClone( this.data ), rect = this.rect(), camera = this.frame.camera;
		const project = point => this.project( point, rect.width, rect.height );
		const fraction = ( edge, t ) => {

			if ( ! camera.isPerspectiveCamera ) return t;
			const depth = i => - this.object.localToWorld( new THREE.Vector3( ...data.points[ i ] ) ).applyMatrix4( camera.matrixWorldInverse ).z;
			const a = depth( edge[ 0 ] ), b = depth( edge[ 1 ] );
			return ( t / b ) / ( ( 1 - t ) / a + t / b );

		};
		const ids = cutAcrossMesh( data, drag.start, drag.end, project, fraction );
		if ( ids.length ) this.commit( 'Knife cut', data, ids );
		else this.draw();

	}

	penPlacement( event, origin, plane, state ) {

		let point = this.pointerWorld( event.clientX, event.clientY, plane );
		if ( this.placement === 'surface' && ! state.axis ) {

			const hit = meshHit( this.ray, this.editor.scene, this.object );
			if ( hit ) point = hit.point;

		}
		if ( ! point ) return null;
		const axes = state.axis ? state.planeLock ? worldAxes.filter( ( _, i ) => i !== 'XYZ'.indexOf( state.axis ) ) : [ worldAxes[ 'XYZ'.indexOf( state.axis ) ] ] : this.placement === 'ground' || this.placement === 'surfacePerpendicular' ? this.snapAxes( plane ) : worldAxes;
		const snap = this.snapPoint( point, origin, event, axes, state );
		if ( ! state.axis ) return snap;
		const delta = snap.clone().sub( origin ), constrained = origin.clone();
		for ( const axis of axes ) constrained.addScaledVector( axis, delta.dot( axis ) );
		return constrained;

	}

	weld() {

		if ( this.data?.kind !== 'mesh' || this.data.profile || this.indices.length < 2 ) return;
		this.edit( 'Weld mesh vertices', next => weldPoints( next, this.indices ) );

	}

	setSelectionMode( mode ) {

		if ( this.isPencilStroke && mode !== 'vertex' ) return;
		this.selectionMode = mode;
		this.knife = false;
		this.pen = false;
		this.penChain = null;
		this.brush = '';
		this.adding = false;
		this.indices = [];
		this.elements = new Map();
		this.editor.viewTools?.setMode( '' );
		this.changed();
		this.render();

	}

	setSelectionTool( tool ) {

		this.pen = false; this.penChain = null; this.brush = ''; this.adding = false;
		this.selectionTool = tool;
		this.knife = false;
		this.changed(); this.render();

	}

	applyElementSelection( hits, operation ) {

		const current = this.selectionMode === 'vertex' ? new Map( this.indices.map( i => [ String( i ), [ i ] ] ) ) : this.elements || new Map();
		this.elements = applySelection( current, hits, operation );
		this.indices = [ ...new Set( [ ...this.elements.values() ].flat() ) ];
		this.changed(); this.render();

	}

	get canSelectTopology() {

		return this.editMode && this.canEdit() && ! ( this.adding || this.penChain || this.brush || this.drag || this.gesture || this.editor.viewTools.mode );

	}

	get canSeparate() {

		return this.canSelectTopology && this.object.isMesh && ! this.object.userData.assetObject && this.data.faces?.length > 0 &&
			! Object.keys( modifierSource( this.object ).morphAttributes ).length;

	}

	selectedSurfaceFaces() {

		const points = new Set( this.indices );
		return this.data.faces.flatMap( ( face, index ) => {

			const selected = this.selectionMode === 'face' ? this.elements.has( elementKey( face ) ) :
				this.selectionMode === 'edge' ? face.every( ( a, i ) => this.elements.has( elementKey( [ a, face[ ( i + 1 ) % face.length ] ] ) ) ) :
				face.every( point => points.has( point ) );
			return selected ? [ index ] : [];

		} );

	}

	separate( mode ) {

		if ( ! this.canSeparate ) return;
		const { editor, object, data } = this;
		const selected = mode === 'selection' ? this.selectedSurfaceFaces() : [];
		const source = modifierSource( object );
		const parts = separateMesh( THREE, source, data, mode, selected );
		if ( parts.length < 2 ) {

			editor.viewTools.status.textContent = mode === 'loose' ? 'This mesh has one connected surface.' : 'There are no faces to separate by this method.';
			return;

		}
		const stack = object.userData.modifiers;
		const evaluated = [];
		try {

			for ( const part of parts ) evaluated.push( stack?.length ?
				{ geometry: evaluateModifiers( part, stack, true ), userData: { ...object.userData, modifierBase: part.toJSON() } } :
				{ geometry: part, userData: object.userData } );

		} catch ( error ) {

			for ( const { geometry } of evaluated ) if ( ! parts.includes( geometry ) ) geometry.dispose();
			for ( const part of parts ) part.dispose();
			throw error;

		}
		if ( stack?.length ) for ( const part of parts ) part.dispose();
		const commands = [];
		const [ original, ...pieces ] = evaluated;
		if ( stack?.length ) commands.push( new SetValueCommand( editor, object, 'userData', original.userData ) );
		commands.push( new SetGeometryCommand( editor, object, original.geometry ) );
		const names = new Set();
		editor.scene.traverse( item => names.add( item.name ) );
		let suffix = 1;
		const baseName = object.name || 'Mesh';
		for ( const { geometry, userData } of pieces ) {

			const piece = object.clone( false );
			piece.geometry = geometry;
			piece.userData = structuredClone( userData );
			do { piece.name = baseName + '.' + String( suffix++ ).padStart( 3, '0' ); } while ( names.has( piece.name ) );
			commands.push( new AddObjectCommand( editor, piece, object.parent, false ) );

		}
		this.indices = [];
		this.elements.clear();
		editor.execute( new MultiCmdsCommand( editor, commands ), 'Separate mesh' );

	}

	selectTopology( operation, pointer ) {

		if ( ! this.canSelectTopology ) return;
		const current = this.selectionMode === 'vertex' ? this.indices.map( i => [ i ] ) : [ ...this.elements.values() ];
		let seeds = current;
		if ( pointer ) {

			const event = { clientX: pointer.x, clientY: pointer.y };
			let element = this.elementUnder( event );
			if ( ! element && this.selectionMode !== 'face' ) {

				const face = this.visibleFaceHit( event )?.face;
				if ( face ) element = face.slice( 0, this.selectionMode === 'edge' ? 2 : 1 );

			}
			if ( ! element ) return;
			seeds = [ element ];

		}
		if ( ! seeds.length ) return;
		const hits = connectedSelection( this.data, this.selectionMode, seeds, operation === 'subtract' ? 'linked' : operation );
		this.applyElementSelection( hits, pointer ? operation === 'subtract' ? 'subtract' : 'extend' : 'set' );

	}

	invertElementSelection() {

		this.applyElementSelection( selectionCandidates( this.data, this.selectionMode ), 'toggle' );

	}

	elementUnder( event ) {

		if ( this.selectionMode === 'face' ) return this.faceUnder( event );
		if ( this.selectionMode === 'edge' ) {

			const edge = this.penHit( event ).edge;
			return edge ? [ edge.a, edge.b ] : null;

		}
		const rect = this.rect();
		const vertex = this.pointUnder( event.clientX - rect.left, event.clientY - rect.top );
		return vertex < 0 ? null : [ vertex ];

	}

	selectElement( event ) {

		const hit = this.elementUnder( event );
		const hits = hit && this.selectionMode === 'edge' && event.altKey ? edgeLoop( this.data, hit, event.ctrlKey ) : hit ? [ hit ] : [];
		this.applyElementSelection( hits, event.shiftKey ? 'toggle' : event.ctrlKey && ! event.altKey ? 'subtract' : this.selectionOperation );

	}

	beginSelection( event, objectSelection = false ) {

		const rect = this.rect();
		const point = [ event.clientX - rect.left, event.clientY - rect.top ];
		this.drag = { selection: true, objectSelection, tool: this.selectionTool, start: point, end: point, polygon: [ point ],
			operation: event.ctrlKey ? 'subtract' : event.shiftKey ? 'extend' : this.selectionOperation,
			initial: objectSelection ? new Map( this.editor.selector.selection.map( object => [ object.uuid, object ] ) ) : this.selectionMode === 'vertex' ? new Map( this.indices.map( i => [ String( i ), [ i ] ] ) ) : new Map( this.elements ),
			target: event.target, id: event.pointerId, event };
		event.target.setPointerCapture( event.pointerId );
		this.draw();

	}

	finishSelection( drag, cancel ) {

		if ( drag.objectSelection ) { this.finishObjectSelection( drag, cancel ); return; }
		if ( cancel ) { this.applyElementSelection( [ ...drag.initial.values() ], 'set' ); return; }
		if ( Math.hypot( drag.end[ 0 ] - drag.start[ 0 ], drag.end[ 1 ] - drag.start[ 1 ] ) < 4 && drag.tool === 'select' ) {

			this.selectElement( drag.event ); return;

		}
		const { width, height } = this.rect();
		const frame = this.frame;
		const pixels = this.data.points.map( point => this.project( point, width, height ) );
		const inside = point => selectionRegionContains( drag, point, this.brushRadius );
		const hits = selectionCandidates( this.data, this.selectionMode ).filter( ids => {

			if ( this.selectionMode === 'face' ) {

				const center = elementCenter( this.data, ids );
				const pixel = this.project( center, width, height );
				return inside( pixel ) && this.pointVisible( center, pixel, frame );

			}
			if ( ! ids.every( i => inside( pixels[ i ] ) ) ) return false;
			if ( ids.length === 1 ) return this.pointVisible( this.data.points[ ids[ 0 ] ], pixels[ ids[ 0 ] ], frame );
			const center = elementCenter( this.data, ids );
			return this.pointVisible( center, this.project( center, width, height ), frame );

		} );
		this.applyElementSelection( hits, drag.operation );

	}

	finishObjectSelection( drag, cancel ) {

		if ( ! cancel ) {

			const { scene, selector } = this.editor;
			const { camera, rect: { width, height } } = this.frame;
			const hits = new Map(), point = new THREE.Vector3();
			scene.traverseVisible( object => {

				const isSelectable = object.geometry || object.isLight || object.isCamera || object.userData.assetObject?.type === 'projector' || object.userData.hasSplat;
				if ( ! isSelectable || object.userData.runtimeOnly || hasRestriction( object, 'unselectable' ) || ! isVisible( object ) ) return;
				if ( isPencilStroke( object ) ) {

					if ( regionHitsPencilStroke( object, camera, width, height, drag, this.brushRadius ) ) hits.set( object.uuid, object );
					return;

				}
				point.setFromMatrixPosition( object.matrixWorld ).project( camera );
				if ( point.z < -1 || point.z > 1 ) return;
				const pixel = [ ( point.x + 1 ) * width / 2, ( 1 - point.y ) * height / 2 ];
				if ( selectionRegionContains( drag, pixel, this.brushRadius ) ) hits.set( object.uuid, object );

			} );
			selector.setSelection( [ ...combineSelection( drag.initial, hits, drag.operation ).values() ] );

		}
		this.draw();

	}

	selectPoints( all ) {

		if ( ! this.canEdit() ) return;
		this.elements = new Map();
		if ( all && this.data.faces && this.selectionMode !== 'vertex' ) for ( const face of this.data.faces ) {

			const loops = this.selectionMode === 'face' ? [ face ] : face.map( ( a, i ) => [ a, face[ ( i + 1 ) % face.length ] ] );
			for ( const loop of loops ) this.elements.set( loop.slice().sort( ( a, b ) => a - b ).join( ':' ), loop );

		}
		this.indices = all ? this.data.points.map( ( _, index ) => index ) : [];
		this.changed();
		this.render();

	}

	removeSelection() {

		if ( this.data?.kind === 'vertices' || ! this.indices.length ) return;
		if ( this.data.faces && this.selectionMode !== 'vertex' && this.elements?.size ) {

			const selected = new Set( this.elements.keys() );
			this.edit( 'Delete selected mesh elements', next => {

				next.faces = next.faces.filter( face => this.selectionMode === 'face' ?
					! selected.has( face.slice().sort( ( a, b ) => a - b ).join( ':' ) ) :
					! face.some( ( a, i ) => selected.has( [ a, face[ ( i + 1 ) % face.length ] ].sort( ( a, b ) => a - b ).join( ':' ) ) ) );
				return [];

			} );
			this.elements.clear();
			return;

		}
		this.edit( 'Remove modeling points', next => { removePoints( next, this.indices ); return []; } );

	}

	get isPencilStroke() {

		return this.data?.kind === 'path' && !! this.data.pencilBrush;

	}

	get isSculpting() {

		return !! this.brush && this.brush !== 'freehand';

	}

	get sculptBrushes() {

		const { selection } = this.editor.selector;
		return ! selection.some( object => object !== this.editor.scene ) || this.sculptTargets().some( object =>
			modifierSource( object ).userData.modeling?.pencilBrush ) ? strokeBrushes : meshBrushes;

	}

	sculptTargets() {

		const { scene, selector } = this.editor;
		const eligible = object => ! object.userData.runtimeOnly && ! object.userData.measurement && this.canEditTarget( object );
		const selection = selector.selection.filter( object => object !== scene );
		const objects = new Set();
		const add = object => { if ( eligible( object ) ) objects.add( object ); };
		if ( selection.length ) for ( const object of selection ) {

			if ( object.isGroup ) object.traverseVisible( add );
			else add( object );

		}
		else scene.traverseVisible( add );
		return [ ...objects ];

	}

	setBrush( brush ) {

		if ( ! this.editMode || this.drag || this.gesture || ( brush === 'freehand' ? ! this.canEdit() || ! this.data.points.length :
			brush && ! this.sculptBrushes.some( ( [ id ] ) => id === brush ) ) ) return;
		this.pen = false;
		this.brush = brush;
		this.adding = false;
		this.changed();
		this.render();

	}

	sculptNormals( data, geometry ) {
		const normals = data.points.map( () => new THREE.Vector3() );
		if ( data.faces ) for ( const face of data.faces ) {

			const normal = faceNormal( THREE, data, face );
			if ( normal ) for ( const index of face ) normals[ index ].add( normal );

		}
		if ( data.vertices && geometry.attributes.normal ) {

			const sample = new THREE.Vector3();
			for ( const [ index, vertices ] of data.vertices.entries() ) for ( const vertex of vertices ) {

				normals[ index ].add( sample.fromBufferAttribute( geometry.attributes.normal, vertex ) );

			}

		}
		return normals.map( normal => normal.normalize() );

	}

	changed() {

		this.placementSnap = null;
		if ( this.canEdit() && this.indices.length && ! this.gesture && ! this.drag ) this.updateProxy();
		this.onSelectionChange?.();
		this.onChange?.();
		this.onToolsChange?.();
		this.editor.signals.modelingSelectionChanged.dispatch();

	}

	edit( name, mutate ) {

		if ( ! this.canEdit() ) return;
		const data = structuredClone( this.data );
		const indices = mutate( data );
		this.commit( name, data, Array.isArray( indices ) ? indices : this.indices );

	}

	buildGeometry( data, reusable, object = this.object, originalData = this.data ) {
		let geometry;
		if ( data.kind === 'vertices' ) {

			geometry = reusable || new THREE.BufferGeometry().copy( modifierSource( object ) );
			const position = reusable ? geometry.attributes.position :
				new THREE.Float32BufferAttribute( new Float32Array( geometry.attributes.position.count * 3 ), 3 );
			data.points.forEach( ( point, i ) => {

				for ( const index of data.vertices[ i ] ) position.setXYZ( index, ...point );

			} );
			if ( reusable ) position.needsUpdate = true;
			else geometry.setAttribute( 'position', position );
			geometry.computeVertexNormals();
			geometry.computeBoundingBox();
			geometry.computeBoundingSphere();
			geometry.userData = { ...geometry.userData, modeling: { kind: 'vertices' } };

		} else {

			geometry = data.kind === 'mesh' ? moveAuthoredMeshPoints( THREE, modifierSource( object ), originalData, data, reusable ) : null;
			geometry ||= modelGeometry( THREE, data );
			if ( Array.isArray( object.material ) && ! geometry.groups.length && ! data.faces?.some( face => face.surface?.slot === -1 ) ) {

				geometry.addGroup( 0, geometry.index?.count ?? geometry.attributes.position.count, 0 );

			}

		}
		return geometry;

	}

	commit( name, data, indices, geometry = this.buildGeometry( data ) ) {

		this.indices = indices;
		if ( this.object.userData.modifiers?.length ) {

			try { setModifierStack( this.editor, this.object, this.object.userData.modifiers, geometry, name ); }
			finally { geometry.dispose(); }
			return;

		}
		const command = new SetGeometryCommand( this.editor, this.object, geometry );
		command.updatable = false;
		this.editor.execute( command, name );

	}

	preview( state, points, pencilBrush = state.draft?.pencilBrush || ( state.data || this.data ).pencilBrush ) {

		const source = state.data || this.data;
		const draft = { ...source, points };
		if ( pencilBrush ) draft.pencilBrush = pencilBrush;
		let geometry;
		try { geometry = this.buildGeometry( draft, state.geometry, state.object || this.object, source ); }
		catch { return; }
		if ( state.geometry !== geometry ) state.geometry?.dispose();
		state.geometry = geometry;
		state.draft = draft;

	}

	withPreview( draw ) {

		if ( this.drag?.sculpt ) {

			const originals = new Map();
			for ( const { object, geometry } of this.drag.targets.values() ) if ( geometry ) {

				originals.set( object, object.geometry );
				object.geometry = geometry;

			}
			try { return draw(); }
			finally { for ( const [ object, geometry ] of originals ) object.geometry = geometry; }

		}

		const geometry = this.drag?.newStroke ? null : ( this.gesture || this.drag )?.geometry || ( this.object?.userData.modifierBase ? modifierSource( this.object ) : null );
		if ( ! geometry || ! this.object ) return draw();
		const object = this.object, original = object.geometry;
		object.geometry = geometry;
		try { return draw(); }
		finally { object.geometry = original; }

	}

	get planar() {

		return this.data?.kind === 'shape' || Boolean( this.data?.planar || this.data?.profile );

	}

	updateProxy() {

		const object = this.object;
		object.updateWorldMatrix( true, false );
		const points = this.indices.map( index => object.localToWorld( new THREE.Vector3( ...this.data.points[ index ] ) ) );
		const config = this.editor.config;
		const pivot = config.getKey( 'settings/transformPivot' );
		const center = this.proxy.position.set( 0, 0, 0 );
		if ( pivot === 'bounds' || pivot === 'bottom' ) {

			const box = new THREE.Box3().setFromPoints( points );
			box.getCenter( center );
			if ( pivot === 'bottom' ) center.y = box.min.y;

		}
		else if ( pivot === 'cursor' ) center.copy( this.editor.cursor );
		else if ( pivot === 'active' ) center.copy( points.at( -1 ) );
		else if ( pivot !== 'origin' ) {

			for ( const point of points ) center.add( point );
			center.divideScalar( points.length );

		}
		const orientation = config.getKey( 'settings/transformOrientation' );
		const rotation = this.proxy.quaternion.identity();
		if ( orientation === 'local' ) object.getWorldQuaternion( rotation );
		if ( orientation === 'parent' ) object.parent?.getWorldQuaternion( rotation );
		if ( orientation === 'view' ) this.frame?.camera.getWorldQuaternion( rotation );
		if ( orientation === 'normal' ) {

			const normal = new THREE.Vector3();
			if ( this.data.faces && ! this.planar ) {

				const selected = new Set( this.indices );
				for ( const face of this.data.faces ) {

					if ( ! face.every( index => selected.has( index ) ) ) continue;
					const [ a, b, c ] = face.map( index => new THREE.Vector3( ...this.data.points[ index ] ) );
					normal.add( b.sub( a ).cross( c.sub( a ) ) );

				}

			} else if ( this.data.vertices && object.geometry.attributes.normal ) {

				const attribute = object.geometry.attributes.normal;
				for ( const index of this.indices ) for ( const vertex of this.data.vertices[ index ] ) {

					normal.add( new THREE.Vector3().fromBufferAttribute( attribute, vertex ) );

				}

			}
			if ( normal.lengthSq() < 1e-10 ) normal.set( 0, 0, 1 );
			normal.applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( object.matrixWorld ) );
			rotation.setFromUnitVectors( new THREE.Vector3( 0, 0, 1 ), normal );

		}
		this.proxy.scale.setScalar( 1 );
		this.proxy.updateMatrixWorld( true );

	}

	beginTransform( mode, modal = false ) {

		if ( ! this.canEdit() || ! this.indices.length || this.drag || this.gesture ) return false;
		const pointer = this.lastPointer;
		this.proxy.updateMatrix();
		this.gesture = { mode, modal, pointer, origin: this.proxy.position.clone(), rotation: this.proxy.quaternion.clone(),
			inverse: this.proxy.matrix.clone().invert(), selected: new Set( this.indices ), axis: '', numeric: '' };
		return true;

	}

	updateTransform( axis, pointer = this.lastPointer ) {

		const state = this.gesture;
		if ( ! state ) return;
		if ( state.mode === 'translate' && pointer ) {

			const axes = [ 'X', 'Y', 'Z' ].filter( name => ( axis || 'XYZ' ).includes( name ) )
				.map( name => new THREE.Vector3().setComponent( 'XYZ'.indexOf( name ), 1 ).applyQuaternion( state.rotation ) );
			if ( axes.length && ! state.numeric ) {

				const base = state.snapBase || state.origin;
				const offset = base.clone().sub( state.origin );
				const target = this.snapPoint( this.proxy.position.clone().add( offset ), base, pointer, axes, state );
				this.proxy.position.copy( target ).sub( offset );

			}
			else state.snap = null;

		}
		this.proxy.updateMatrix();
		const delta = new THREE.Matrix4().multiplyMatrices( this.proxy.matrix, state.inverse );
		const points = ( state.basePoints || this.data.points ).map( ( point, index ) => {

			if ( ! state.selected.has( index ) ) return point;
			const world = this.object.localToWorld( new THREE.Vector3( ...point ) ).applyMatrix4( delta );
			const local = this.object.worldToLocal( world );
			if ( this.planar ) local.z = 0;
			return local.toArray();

		} );
		this.preview( state, points );
		this.render();

	}

	finishTransform( accept ) {

		const state = this.gesture;
		if ( ! state ) return;
		this.gesture = null;
		this.notice?.remove();
		this.snapBaseMarker.hidden = true;
		this.transformPointer.hidden = true;
		if ( state.modal ) this.editor.controls.enabled = true;
		if ( accept && state.geometry && this.canEdit() && state.extrusion ) {

			if ( this.data.kind === 'path' ) {

				const object = modelObject( THREE, state.draft, this.object.name + ' mesh' );
				object.position.copy( this.object.position );
				object.quaternion.copy( this.object.quaternion );
				object.scale.copy( this.object.scale );
				state.geometry.dispose();
				this.editor.execute( new AddObjectCommand( this.editor, object, this.object.parent ), 'Extrude curve' );
				this.indices = state.cap;
				this.changed();
				this.render();

			} else {

				this.adding = false;
				this.commit( 'Extrude mesh', state.draft, state.cap, state.geometry );

			}

		} else if ( accept && state.geometry && this.canEdit() && this.pointsChanged( state ) ) {

			const verb = { translate: 'Move', rotate: 'Rotate', scale: 'Scale' }[ state.mode ];
			this.commit( verb + ' modeling points', state.draft, this.indices, state.geometry );

		} else {

			state.geometry?.dispose();
			this.changed();
			this.render();

		}

	}

	pointsChanged( state ) {

		return this.indices.some( index => state.draft.points[ index ].some( ( value, axis ) => Math.abs( value - this.data.points[ index ][ axis ] ) > 1e-7 ) );

	}

	startModal( mode ) {

		if ( ! this.editor.viewLayout.navigation ) return;
		const rect = this.rect();
		if ( ! rect.width || ! rect.height ) return;
		this.lastPointer ||= { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
		if ( ! this.beginTransform( mode, true ) ) return;
		this.editor.controls.enabled = false;
		this.onSelectionChange?.();
		this.notice ||= document.createElement( 'div' );
		this.notice.className = 'navigation-notice';
		this.viewport.append( this.notice );
		this.labelModal();

	}

	labelModal() {

		this.refreshTransformPointer();
		const { mode, axis, numeric } = this.gesture;
		if ( this.gesture.extrusion ) {

			this.notice.textContent = [ 'Extrude', axis || ( this.gesture.free ? 'Free move' : 'Face normal' ), numeric,
				'X/Y/Z axis · N free/normal · type distance · Enter confirm · Esc cancel' ].filter( Boolean ).join( ' · ' );
			return;

		}
		const state = this.gesture;
		const name = state.trackball ? 'Trackball' : { translate: 'Move points', rotate: 'Rotate points', scale: 'Scale points' }[ mode ];
		const base = snapBaseHint( state.pickingBase, state.snapBase, mode === 'translate' );
		const constraint = constraintHint( state.auto, axis && axis + ( axis.length === 1 ? ' axis' : ' plane' ) );
		this.refreshSnapBaseMarker();
		this.notice.textContent = [ name, constraint, numeric, base, this.planar ? transformHints.replace( 'R twice trackball · ', '' ) : transformHints ].filter( Boolean ).join( ' · ' );

	}

	refreshTransformPointer() {

		const state = this.gesture;
		showTransformPointer( this.transformPointer, this.editor.viewLayout,
			state?.modal && ! state.pickingBase ? state.extrusion ? 'extrude' : state.mode : null, this.lastPointer );

	}

	movingSnapBase() {

		const state = this.gesture;
		return state?.snapBase ? state.snapBase.clone().add( this.proxy.position ).sub( state.origin ) : null;

	}

	refreshSnapBaseMarker() {

		showSnapBase( this.snapBaseMarker, this.frame, this.gesture?.pickingBase ? null : this.movingSnapBase() );

	}

	modalPointer( event ) {

		const pointer = this.lastPointer || this.gesture.pointer;
		return pointer && { clientX: pointer.clientX, clientY: pointer.clientY, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey };

	}

	rebaseModal( pointer ) {

		const state = this.gesture;
		state.basePoints = state.draft?.points || this.data.points;
		state.origin.copy( this.proxy.position );
		this.proxy.quaternion.copy( state.rotation );
		this.proxy.scale.setScalar( 1 );
		this.proxy.updateMatrix();
		state.inverse.copy( this.proxy.matrix ).invert();
		state.pointer = pointer;
		state.numeric = '';

	}

	pickModalSnapBase( event ) {

		const state = this.gesture, rect = this.rect();
		let distance = 14, base;
		for ( const index of state.selected ) {

			const point = ( state.draft || this.data ).points[ index ];
			const pixel = this.project( point, rect.width, rect.height );
			if ( ! pixel ) continue;
			const error = Math.hypot( event.clientX - rect.left - pixel[ 0 ], event.clientY - rect.top - pixel[ 1 ] );
			if ( error < distance ) { distance = error; base = this.object.localToWorld( new THREE.Vector3( ...point ) ); }

		}
		base = this.withPreview( () => pickTransformSnapBase( this.editor, this.frame, event, state.origin, base ) );
		if ( ! base ) return;
		this.lastPointer = event;
		this.rebaseModal( event );
		state.snapBase = base;
		state.pickingBase = false;
		if ( this.editor.config.getKey( 'settings/transformSnap' ) == null ) this.editor.toggleTransformSnap?.();

	}

	modalKey( event ) {

		if ( event.key === 'Meta' ) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		const state = this.gesture, key = event.key.toLowerCase();
		const pointer = this.modalPointer( event );
		if ( key === 'alt' ) {

			if ( ! state.extrusion && ! event.repeat && ! state.pickingBase && ! state.auto ) state.auto = startConstraintDrag( pointer, state.mode );
			this.labelModal();
			return;

		}
		if ( key === 'enter' || key === 'escape' ) {

			if ( state.pickingBase ) { state.pickingBase = false; this.labelModal(); return; }
			this.finishTransform( key === 'enter' );
			return;

		}
		if ( ! state.extrusion && ! event.repeat && transformModes.has( key ) ) {

			const next = transformModes.get( key );
			if ( next === state.mode && state.mode !== 'rotate' ) return;
			state.trackball = ! this.planar && next === state.mode && state.mode === 'rotate' && ! state.trackball;
			state.mode = next;
			state.axis = '';
			state.auto = state.snapBase = null;
			state.pickingBase = false;
			this.rebaseModal( pointer );
			this.labelModal();
			return;

		} else if ( ! state.extrusion && key === 'b' && state.mode === 'translate' && ! event.repeat ) state.pickingBase = ! state.pickingBase;
		else if ( ! state.extrusion && key === 'tab' && event.shiftKey && ! event.repeat ) this.editor.toggleTransformSnap?.();
		else if ( key === 'n' && state.extrusion ) { state.axis = ''; state.free = ! state.free; }
		else if ( 'xyz'.includes( key ) && key.length === 1 && ! event.repeat ) {

			const axis = ! state.extrusion && event.shiftKey && state.mode !== 'rotate' ? 'XYZ'.replace( key.toUpperCase(), '' ) : key.toUpperCase();
			state.axis = state.axis === axis ? '' : axis;
			state.trackball = false;

		} else {

			const input = transformNumber( state.numeric, key );
			if ( state.trackball && input !== state.numeric && input ) state.trackball = false;
			state.numeric = input;

		}
		this.labelModal();
		this.updateModal( pointer );

	}

	updateModal( pointer ) {

		const state = this.gesture;
		if ( state.extrusion ) { this.updateExtrusion( pointer ); return; }
		if ( state.pickingBase ) return;
		if ( state.auto && ! state.auto.locked ) {

			const plane = state.auto.button === undefined ? pointer.shiftKey && state.mode !== 'rotate' : state.auto.plane;
			const lock = automaticAxis( this.frame, state.origin, state.rotation, state.auto, pointer, plane );
			if ( lock ) {

				state.axis = plane ? 'XYZ'.replace( lock, '' ) : lock;
				state.auto.locked = true;
				state.trackball = false;
				this.labelModal();

			}

		}
		if ( state.auto && ( ! state.auto.locked || state.auto.button === undefined ) ) { this.draw(); return; }
		const start = state.pointer;
		const precision = pointer.shiftKey ? .1 : 1;
		const dx = ( pointer.clientX - start.clientX ) * precision;
		const dy = ( start.clientY - pointer.clientY ) * precision;
		const value = state.numeric ? Number( state.numeric ) : NaN;
		const view = this.frame.camera.getWorldDirection( new THREE.Vector3() );
		const axis = state.axis.length === 1 ? new THREE.Vector3().setComponent( 'XYZ'.indexOf( state.axis ), 1 )
			.applyQuaternion( state.rotation ) : null;
		const snap = modalSnapMode( this.editor.config, pointer.ctrlKey );
		const step = Number.isFinite( snap ) || snap === 'grid' || snap === 'increment';
		const nearest = ( value, increment ) => step ? Math.round( value / increment ) * increment : value;
		this.proxy.position.copy( state.origin );
		this.proxy.quaternion.copy( state.rotation );
		this.proxy.scale.setScalar( 1 );
		if ( state.mode === 'translate' ) {

			const plane = new THREE.Plane().setFromNormalAndCoplanarPoint( view, state.origin );
			const from = this.pointerWorld( start.clientX, start.clientY, plane );
			const to = this.pointerWorld( pointer.clientX, pointer.clientY, plane );
			if ( ! from || ! to ) return;
			const delta = to.sub( from ).multiplyScalar( precision ).applyQuaternion( state.rotation.clone().invert() );
			if ( state.axis ) for ( const component of 'XYZ' ) {

				if ( ! state.axis.includes( component ) ) delta[ component.toLowerCase() ] = 0;

			}
			if ( Number.isFinite( value ) ) {

				if ( axis ) delta.copy( axis ).applyQuaternion( state.rotation.clone().invert() );
				else if ( ! delta.lengthSq() ) delta.setComponent( state.axis ? 'XYZ'.indexOf( state.axis[ 0 ] ) : 0, 1 );
				delta.normalize().multiplyScalar( value );

			}
			this.proxy.position.add( delta.applyQuaternion( state.rotation ) );

		} else if ( state.mode === 'rotate' ) {

			const angle = Number.isFinite( value ) ? THREE.MathUtils.degToRad( value ) : nearest( dx * 0.01, Math.PI / 12 );
			const normal = axis || ( this.planar ? new THREE.Vector3( 0, 0, 1 ).applyNormalMatrix(
				new THREE.Matrix3().getNormalMatrix( this.object.matrixWorld ) ) : view.negate() );
			const delta = state.trackball ? trackballDelta( this.frame.camera, dx, -dy ) : new THREE.Quaternion().setFromAxisAngle( normal, angle );
			this.proxy.quaternion.premultiply( delta );

		} else {

			const factor = Number.isFinite( value ) ? value : nearest( 1 + ( dx + dy ) * 0.01, 0.1 );
			for ( const component of 'XYZ' ) if ( ! state.axis || state.axis.includes( component ) ) this.proxy.scale[ component.toLowerCase() ] = factor;

		}
		this.updateTransform( state.axis, pointer );

	}

	toShape() {

		const { object, data } = this;
		const points = data.points.map( ( [ x, y ] ) => [ x, y, 0 ] );
		if ( ! data.closed || points.length < 3 || data.points.some( point => Math.abs( point[ 2 ] ) > 1e-6 ) ) throw new Error( 'Close the path and place its points in the local XY plane first.' );
		const shape = modelObject( THREE, { kind: 'shape', points, smooth: data.smooth, depth: 0 }, object.name + ' shape' );
		if ( object.material?.color ) shape.material.color.copy( object.material.color );
		shape.position.copy( object.position );
		shape.quaternion.copy( object.quaternion );
		shape.scale.copy( object.scale );
		return shape;

	}

	get frame() {

		return this.editor.viewLayout.navigation || this.editor.viewLayout.frames[ 0 ];

	}

	rect() {

		return this.editor.viewLayout.clientRect( this.frame );

	}

	project( point, width, height, camera = this.frame.camera, object = this.object ) {
		const projection = new THREE.Vector3( ...point ).applyMatrix4( object.matrixWorld );
		const depth = projection.clone().applyMatrix4( camera.matrixWorldInverse ).z;
		projection.project( camera );
		if ( depth >= 0 || ! Number.isFinite( projection.x ) ) return;
		return [ ( projection.x + 1 ) * width / 2, ( 1 - projection.y ) * height / 2 ];

	}

	get selectThrough() {

		return this.editor.viewportXRay || this.editor.viewportShading === 'wireframe';

	}

	depthView( frame ) {

		let view = this.depthViews.get( frame.camera );
		if ( ! view?.matches( frame ) ) {

			const { triangles } = paintSurfaces( this.editor.scene );
			view = new TexturePaintProjection( frame, triangles );
			this.depthViews.set( frame.camera, view );

		}
		return view;

	}

	pointVisible( point, pixel, frame = this.frame ) {

		if ( ! pixel ) return false;
		if ( this.selectThrough ) return true;
		const world = this.depthPoint.fromArray( point ).applyMatrix4( this.object.matrixWorld );
		return this.worldPointVisible( world, pixel, frame );

	}

	worldPointVisible( world, pixel, frame ) {

		const { camera } = frame;
		const distance = -this.depthPoint.copy( world ).applyMatrix4( camera.matrixWorldInverse ).z;
		if ( distance < camera.near || distance > camera.far ) return false;
		const depth = this.depthView( frame ).surfaceDepthAt( ...pixel );
		if ( depth === Infinity ) return true;
		const surfaceDistance = camera.isPerspectiveCamera ? -1 / depth : depth;
		return distance <= surfaceDistance + Math.max( .00001, distance * .0001 );

	}

	faceUnder( event ) {

		if ( ! this.selectThrough || this.pen ) return this.visibleFaceHit( event )?.face;
		const { left, top, width, height } = this.rect();
		const x = event.clientX - left, y = event.clientY - top;
		let nearest = 9, face;
		for ( const candidate of selectionCandidates( this.data, 'face' ) ) {

			const pixel = this.project( elementCenter( this.data, candidate ), width, height );
			if ( ! pixel ) continue;
			const distance = Math.hypot( x - pixel[ 0 ], y - pixel[ 1 ] );
			if ( distance < nearest ) { nearest = distance; face = candidate; }

		}
		return face;

	}

	visibleFaceHit( event ) {

		const hit = this.faceHit( event );
		const { left, top } = this.rect();
		if ( hit && this.worldPointVisible( hit.hit.point, [ event.clientX - left, event.clientY - top ], this.frame ) ) return hit;

	}

	draw() {

		this.overlay.hidden = ( ! this.canEdit() && ! this.drag?.objectSelection && ! this.isSculpting ) || ! this.editor.renderer || ! this.frame ||
			!! this.editor.viewTools?.mode || !! this.editor.editWorkspace?.exclusive;
		if ( this.overlay.hidden ) {

			this.handles = [];
			return;

		}
		const bounds = this.editor.renderer.domElement.getBoundingClientRect();
		const ratio = Math.min( 2, window.devicePixelRatio || 1 );
		const w = Math.round( bounds.width * ratio ), h = Math.round( bounds.height * ratio );
		if ( this.overlay.width !== w || this.overlay.height !== h ) {

			this.overlay.width = w;
			this.overlay.height = h;

		}
		this.object?.updateWorldMatrix( true, false );
		const ctx = this.context;
		ctx.setTransform( ratio, 0, 0, ratio, 0, 0 );
		ctx.clearRect( 0, 0, bounds.width, bounds.height );
		const frames = this.editor.viewLayout.frames;
		for ( const frame of frames ) {
			if ( frames.length > 1 && ! frame.director ) continue;
			this.drawFrame( ctx, frame, frame === this.frame );
		}

	}

	drawFrame( ctx, frame, interactive ) {

		const { width, height, x, y } = frame.rect;
		if ( ! width || ! height ) return;
		const project = point => this.project( point, width, height, frame.camera );
		ctx.save();
		ctx.translate( x, y );
		ctx.beginPath();
		ctx.rect( 0, 0, width, height );
		ctx.clip();
		if ( this.drag?.objectSelection ) {

			if ( interactive ) this.drawSelectionRegion( ctx, this.drag );
			ctx.restore();
			return;

		}
		if ( interactive && this.isSculpting && this.lastPointer?.target === this.editor.renderer.domElement ) {

			const { left, top } = this.rect();
			ctx.beginPath();
			ctx.arc( this.lastPointer.clientX - left, this.lastPointer.clientY - top, this.brushRadius, 0, Math.PI * 2 );
			ctx.strokeStyle = '#ffba62';
			ctx.lineWidth = 1;
			ctx.stroke();

		}
		if ( ! this.data ) { ctx.restore(); return; }
		const state = this.drag?.sculpt ? this.drag.targets.get( this.object ) : this.gesture || this.drag;
		const data = this.penChain?.data || state?.draft || this.data;
		const handles = data.points.map( point => {

			const pixel = project( point );
			return state?.draft || this.penChain || this.pointVisible( point, pixel, frame ) ? pixel : undefined;

		} );
		if ( interactive ) this.handles = handles;
		ctx.lineWidth = 1;
		ctx.strokeStyle = editWireColor;
		const stroke = ( points, closed ) => {

			ctx.beginPath();
			let penDown = false;
			for ( const point of points ) {

				if ( ! point ) { penDown = false; continue; }
				if ( penDown ) ctx.lineTo( ...point );
				else ctx.moveTo( ...point );
				penDown = true;

			}
			if ( closed && points.every( Boolean ) ) ctx.closePath();
			ctx.stroke();

		};
		if ( data.faces ) {

			if ( data.profile ) {

				stroke( handles, false );
				if ( interactive && this.adding && handles.at( -1 ) && this.lastPointer?.target === this.editor.renderer.domElement ) {

					const pointer = this.lastPointer;
					const { top, left } = this.rect();
					ctx.strokeStyle = editSelectionColor;
					ctx.setLineDash( [ 4, 4 ] );
					stroke( [ handles.at( -1 ), [ pointer.clientX - left, pointer.clientY - top ] ], false );
					ctx.setLineDash( [] );
					ctx.strokeStyle = editWireColor;

				}

			}
			data.faces.forEach( face => stroke( face.map( index => handles[ index ] ), true ) );

		} else if ( data.kind !== 'vertices' ) {

			const points = outlinePoints( THREE, data );
			stroke( points.map( point => project( point.toArray() ) ), isClosedOutline( data ) );

		}
		const selected = new Set( state?.cap || this.indices );
		ctx.strokeStyle = editSelectionColor;
		ctx.lineWidth = 2;
		if ( this.penChain ) stroke( this.penChain.indices.map( index => handles[ index ] ), false );
		if ( ! this.pen && this.selectionMode !== 'vertex' && this.elements?.size ) {

			ctx.fillStyle = '#ff9d4538';
			for ( const element of this.elements.values() ) {

				const points = element.map( i => handles[ i ] );
				stroke( points, this.selectionMode === 'face' );
				if ( this.selectionMode === 'face' && points.every( Boolean ) ) ctx.fill();

			}

		} else if ( data.faces && selected.size > 1 ) {

			for ( const [ a, b ] of meshEdges( data ) ) {

				if ( selected.has( a ) && selected.has( b ) && handles[ a ] && handles[ b ] ) stroke( [ handles[ a ], handles[ b ] ], false );

			}

		}
		if ( interactive && this.pen && this.penHover && ! this.drag ) {

			ctx.strokeStyle = '#ffd481';
			ctx.lineWidth = 3;
			stroke( [ handles[ this.penHover.a ], handles[ this.penHover.b ] ], false );

		}
		const dots = ! this.pen && this.selectionMode === 'face' ? ( this.selectThrough ?
			selectionCandidates( data, 'face' ).map( face => [ project( elementCenter( data, face ) ), this.elements?.has( elementKey( face ) ) ] ) : [] ) :
			handles.flatMap( ( point, i ) => this.pen || this.selectionMode === 'vertex' || ! data.faces || data.profile || selected.has( i ) ?
				[ [ point, selected.has( i ) ] ] : [] );
		ctx.lineWidth = 1;
		for ( const [ point, active ] of dots ) {

			if ( ! point ) continue;
			ctx.beginPath();
			ctx.arc( ...point, active ? 2.5 : 1.75, 0, Math.PI * 2 );
			ctx.fillStyle = active ? editSelectionColor : editWireColor;
			ctx.fill();
			ctx.strokeStyle = active ? editWireColor : '#8c929a';
			ctx.stroke();

		}

		const snap = state?.snap || this.placementSnap;
		if ( snap ) {

			const point = project( this.object.worldToLocal( snap.clone() ).toArray() );
			if ( point ) {

				ctx.beginPath();
				ctx.rect( point[ 0 ] - 5, point[ 1 ] - 5, 10, 10 );
				ctx.strokeStyle = '#ffba62';
				ctx.lineWidth = 2;
				ctx.stroke();

			}

		}

		const constraint = this.penChain || state;
		if ( constraint?.axis ) {

			const origin = constraint.origin || this.object.localToWorld( new THREE.Vector3( ...( this.penChain?.data.points[ this.penChain.indices.at( -1 ) ] || [ 0, 0, 0 ] ) ) );
			const local = world => this.object.worldToLocal( world ).toArray();
			ctx.setLineDash( [ 5, 4 ] );
			for ( const name of constraint.axis ) {

				const axis = worldAxes[ 'XYZ'.indexOf( name ) ].clone();
				if ( constraint.rotation ) axis.applyQuaternion( constraint.rotation );
				ctx.strokeStyle = { X: '#ff6060', Y: '#92d760', Z: '#628fff' }[ name ];
				stroke( [ project( local( origin.clone().addScaledVector( axis, -100 ) ) ), project( local( origin.clone().addScaledVector( axis, 100 ) ) ) ], false );

			}
			ctx.setLineDash( [] );

		}
		if ( interactive && state?.knife ) {

			ctx.strokeStyle = '#ff725e'; ctx.lineWidth = 2; stroke( [ state.start, state.end ], false );

		}
		if ( interactive && state?.selection ) this.drawSelectionRegion( ctx, state );
		ctx.restore();

	}

	drawSelectionRegion( ctx, state ) {

		ctx.strokeStyle = editSelectionColor;
		ctx.fillStyle = '#ff9d4518';
		ctx.lineWidth = 1;
		ctx.beginPath();
		if ( state.tool === 'circle' ) ctx.arc( ...state.end, this.brushRadius, 0, Math.PI * 2 );
		else if ( state.tool === 'lasso' ) { state.polygon.forEach( ( p, i ) => i ? ctx.lineTo( ...p ) : ctx.moveTo( ...p ) ); ctx.closePath(); }
		else ctx.rect( state.start[ 0 ], state.start[ 1 ], state.end[ 0 ] - state.start[ 0 ], state.end[ 1 ] - state.start[ 1 ] );
		ctx.fill();
		ctx.stroke();

	}


	pointUnder( x, y ) {

		let hit = - 1, nearest = 10;
		for ( let i = 0; i < ( this.handles?.length || 0 ); i ++ ) {

			const point = this.handles[ i ];
			if ( ! point ) continue;
			const distance = Math.hypot( point[ 0 ] - x, point[ 1 ] - y );
			if ( distance < nearest ) { nearest = distance; hit = i; }

		}
		return hit;

	}

	pointerWorld( x, y, plane ) {

		const rect = this.rect();
		const cursor = new THREE.Vector2( ( x - rect.left ) * 2 / rect.width - 1, 1 - ( y - rect.top ) * 2 / rect.height );
		this.ray.setFromCamera( cursor, this.frame.camera );
		return this.ray.ray.intersectPlane( plane, new THREE.Vector3() );

	}

	snapPoint( point, reference, event, axes, state ) {

		const config = this.editor.config;
		if ( this.pen && event.ctrlKey && ! state.modal ) { state.snap = null; return point; }
		const mode = state.modal && ! state.extrusion ? modalSnapMode( config, event.ctrlKey ) : modelSnapMode( config, event.ctrlKey );
		if ( ! mode ) { state.snap = null; return point; }
		if ( mode === 'grid' || mode === 'increment' || Number.isFinite( mode ) ) {

			if ( ! point ) return null;
			const step = Number.isFinite( mode ) ? mode : config.getKey( 'settings/gridStep' );
			const origin = mode === 'grid' ? reference.clone() : reference;
			if ( mode === 'grid' ) for ( const axis of axes ) origin.addScaledVector( axis, - reference.dot( axis ) );
			const result = snapIncrement( point, origin, axes, step );
			state.snap = result;
			return result;

		}
		const rect = this.rect(), camera = this.frame.camera;
		const cursor = new THREE.Vector2( event.clientX - rect.left, event.clientY - rect.top );
		this.ray.setFromCamera( new THREE.Vector2( cursor.x * 2 / rect.width - 1, 1 - cursor.y * 2 / rect.height ), camera );
		const result = snapMeshFeature( { mode, ray: this.ray, scene: this.editor.scene, object: this.object, camera, rect, cursor,
			reference, points: this.data.points, excluded: this.adding ? [] : this.indices } );
		state.snap = null;
		if ( ! result ) return point;
		const delta = result.sub( reference );
		state.snap = reference.clone();
		for ( const axis of axes ) state.snap.addScaledVector( axis, delta.dot( axis ) );
		return state.snap;

	}

	snapAxes( plane ) {

		// A planar shape's snap lattice stays on its local XY plane under parent transforms.
		const normal = plane.normal;
		const right = this.planar ? new THREE.Vector3( 1, 0, 0 ).transformDirection( this.object.matrixWorld ) :
			new THREE.Vector3( Math.abs( normal.x ) < 0.95 ? 1 : 0, Math.abs( normal.x ) < 0.95 ? 0 : 1, 0 );
		right.addScaledVector( normal, - right.dot( normal ) );
		if ( right.lengthSq() < 1e-10 ) {

			right.copy( worldAxes[ Math.abs( normal.x ) < 0.95 ? 0 : 1 ] );
			right.addScaledVector( normal, - right.dot( normal ) );

		}
		right.normalize();
		return [ right, new THREE.Vector3().crossVectors( normal, right ).normalize() ];

	}

	get placement() {

		return this.editor.config.getKey( 'settings/modelPlacement' ) || 'object';

	}

	placementPoint( event, state ) {

		const object = this.object;
		const origin = object.getWorldPosition( new THREE.Vector3() );
		const normal = new THREE.Vector3( 0, 0, 1 ).applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( object.matrixWorld ) );
		const fixed = this.planar && this.data.points.length > 0;
		const placement = fixed ? 'object' : ! this.data.points.length && this.planar && this.placement === 'object' ? 'view' : this.placement;
		let world;
		const plane = new THREE.Plane();
		if ( placement === 'surface' ) {

			this.pointerWorld( event.clientX, event.clientY, plane.setFromNormalAndCoplanarPoint( normal, origin ) );
			const hit = meshHit( this.ray, this.editor.scene, object );
			if ( ! hit ) return null;
			normal.copy( hit.face.normal ).applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( hit.object.matrixWorld ) );
			if ( normal.dot( this.ray.ray.direction ) > 0 ) normal.negate();
			world = hit.point;
			origin.copy( world );

		} else {

			if ( placement === 'view' ) this.frame.camera.getWorldDirection( normal ).negate();
			if ( placement === 'ground' ) {

				normal.set( 0, 1, 0 );
				origin.y = 0;

			}
			world = this.pointerWorld( event.clientX, event.clientY, plane.setFromNormalAndCoplanarPoint( normal, origin ) );

		}
		plane.setFromNormalAndCoplanarPoint( normal, origin );
		const constrained = this.planar || placement === 'view' || placement === 'ground';
		const snapped = this.snapPoint( world, origin, event, constrained ? this.snapAxes( plane ) : worldAxes, state );
		if ( ! snapped ) return null;
		if ( placement === 'surface' && ! state.snap ) state.snap = snapped;
		if ( this.planar && ! fixed && placement !== 'object' ) return { world: snapped, normal };
		const point = object.worldToLocal( snapped.clone() );
		if ( this.planar ) point.z = 0;
		return { point };

	}

	appendPoint( placement ) {

		if ( placement.point ) {

			this.edit( 'Add modeling point', next => {

				return [ appendModelPoint( next, placement.point.toArray() ) ];

			} );
			return;

		}
		const object = this.object;
		const position = object.parent.worldToLocal( placement.world.clone() );
		const normal = placement.normal.applyMatrix3( new THREE.Matrix3().setFromMatrix4( object.parent.matrixWorld ).transpose() ).normalize();
		const quaternion = new THREE.Quaternion().setFromUnitVectors( worldAxes[ 2 ], normal );
		const rotation = new THREE.Euler().setFromQuaternion( quaternion, object.rotation.order );
		const geometry = this.buildGeometry( { ...this.data, points: [ [ 0, 0, 0 ] ] } );
		const update = new SetGeometryCommand( this.editor, object, geometry );
		update.updatable = false;
		this.indices = [ 0 ];
		this.editor.execute( new MultiCmdsCommand( this.editor, [
			new SetPositionCommand( this.editor, object, position ),
			new SetRotationCommand( this.editor, object, rotation ), update
		] ), 'Place modeling outline' );

	}

	canCloseProfile() {

		return this.data.points.length >= 3 && ( this.data.profile || [ 'path', 'shape' ].includes( this.data.kind ) && ! isClosedOutline( this.data ) );

	}

	closeProfile() {

		if ( ! this.canCloseProfile() ) return;
		if ( this.data.profile ) { this.fillFace(); return; }
		this.adding = false;
		this.edit( 'Close outline', data => { data.closed = true; return []; } );

	}

	openPath() {

		this.edit( 'Open path', data => { data.closed = false; } );

	}

	selectedFace() {

		return this.data.faces?.findIndex( face => face.length === this.indices.length && face.every( index => this.indices.includes( index ) ) ) ?? -1;

	}

	fillFace() {

		const data = structuredClone( this.data );
		const indices = data.profile ? data.points.map( ( _, i ) => i ) : this.indices;
		addFace( THREE, data, indices );
		delete data.profile;
		this.adding = false;
		this.pen = true;
		this.commit( 'Fill mesh face', data, indices );

	}

	faceHit( event ) {

		if ( ! this.data.faces?.length && ! ( this.data.kind === 'shape' && this.data.closed !== false && this.data.points.length >= 3 ) ) return;
		const rect = this.rect();
		this.ray.setFromCamera( new THREE.Vector2( ( event.clientX - rect.left ) * 2 / rect.width - 1,
			1 - ( event.clientY - rect.top ) * 2 / rect.height ), this.frame.camera );
		const original = this.object.geometry;
		this.object.geometry = modifierSource( this.object );
		let hit;
		try { hit = this.ray.intersectObject( this.object, false )[ 0 ]; }
		finally { this.object.geometry = original; }
		if ( ! hit ) return;
		if ( this.data.kind === 'shape' ) return { hit, index: 0, triangle: hit.faceIndex, face: this.data.points.map( ( _, i ) => i ) };
		let mapping = this.data.kind === 'vertices' ? this.data.faces.map( ( _, i ) => i ) : this.object.geometry.userData.triangleFaces;
		if ( ! mapping ) {

			const geometry = modelGeometry( THREE, this.data );
			mapping = geometry.userData.triangleFaces;
			geometry.dispose();

		}
		const index = mapping[ hit.faceIndex ];
		if ( index === undefined ) return;
		return { hit, index, triangle: hit.faceIndex - mapping.indexOf( index ), face: this.data.faces[ index ] };

	}

	pickFace( event ) {

		return this.faceHit( event )?.face;

	}

	addPenPoint( event, hit ) {

		const data = this.penChain?.data || this.data;
		if ( this.penChain && this.penChain.indices.length >= 3 && ( hit === this.penChain.indices[ 0 ] || hit === this.penChain.indices.at( -1 ) ) ) { this.finishPenFace(); return; }
		const previous = this.penChain?.indices.at( -1 );
		const origin = previous !== undefined ? this.object.localToWorld( new THREE.Vector3( ...data.points[ previous ] ) ) : hit >= 0 ? this.object.localToWorld( new THREE.Vector3( ...data.points[ hit ] ) ) : this.object.getWorldPosition( new THREE.Vector3() );
		const normal = this.placement === 'ground' ? new THREE.Vector3( 0, 1, 0 ) : this.placement === 'object' ? new THREE.Vector3( 0, 0, 1 ).transformDirection( this.object.matrixWorld ) : this.frame.camera.getWorldDirection( new THREE.Vector3() );
		if ( this.placement === 'ground' ) origin.y = 0;
		if ( ! this.penChain && this.placement === 'surfacePerpendicular' ) {

			this.pointerWorld( event.clientX, event.clientY, new THREE.Plane().setFromNormalAndCoplanarPoint( normal, origin ) );
			const hit = meshHit( this.ray, this.editor.scene, this.object );
			if ( hit ) {

				origin.copy( hit.point );
				const n = hit.face.normal.clone().applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( hit.object.matrixWorld ) );
				const view = this.frame.camera.getWorldDirection( new THREE.Vector3() );
				normal.copy( view ).addScaledVector( n, - view.dot( n ) );
				if ( normal.lengthSq() < 1e-6 ) normal.copy( view );
				normal.normalize();

			}

		}
		const plane = this.penChain?.plane || new THREE.Plane().setFromNormalAndCoplanarPoint( normal, origin );
		const chain = this.penChain ||= { data: structuredClone( this.data ), indices: [], plane };
		if ( hit < 0 ) {

			const edge = this.penHit( event ).edge;
			if ( edge && ! event.ctrlKey ) hit = edge.t < .12 ? edge.a : edge.t > .88 ? edge.b : splitEdge( chain.data, edge.a, edge.b, edge.t );
			else {

				const point = this.penPlacement( event, origin, plane, chain ); if ( ! point ) return;
				hit = chain.data.points.push( this.object.worldToLocal( point ).toArray() ) - 1;

			}

		}
		if ( ! chain.indices.includes( hit ) ) chain.indices.push( hit );
		// A line joining two existing vertices cuts the faces between them,
		// instead of leaving a chord that only looks connected.
		if ( chain.indices.length === 2 && chain.indices.every( i => i < this.data.points.length ) ) {

			const rect = this.rect(), project = point => this.project( point, rect.width, rect.height );
			const ids = cutAcrossMesh( chain.data, project( chain.data.points[ chain.indices[ 0 ] ] ), project( chain.data.points[ hit ] ), project, undefined, chain.indices );
			if ( ids.length ) { this.penChain = null; this.commit( 'Connect mesh vertices', chain.data, ids ); return; }

		}
		this.draw();

	}

	finishPenFace() {

		const chain = this.penChain;
		if ( ! chain || chain.indices.length < 3 ) throw new Error( 'Place at least three corners, then click the first or press F.' );
		addFace( THREE, chain.data, chain.indices );
		this.penChain = null;
		this.commit( 'Build mesh face', chain.data, chain.indices );

	}

	penHit( event ) {

		const { left, top, width, height } = this.rect();
		const data = this.penChain?.data || this.data;
		const x = event.clientX - left, y = event.clientY - top;
		const face = this.faceHit( event );
		const handles = data.points.map( point => this.project( point, width, height ) );
		const camera = this.frame.camera;
		const localToView = new THREE.Matrix4().multiplyMatrices( camera.matrixWorldInverse, this.object.matrixWorld );
		const hitZ = face?.hit.point.clone().applyMatrix4( camera.matrixWorldInverse ).z;
		const seen = new Set();
		let edge, best = 9;
		for ( const [ a, b ] of meshEdges( data ) ) {
			const key = Math.min( a, b ) + ':' + Math.max( a, b );
			if ( seen.has( key ) ) continue;
			seen.add( key );
			const p = handles[ a ], q = handles[ b ];
			if ( ! p || ! q ) continue;
			const dx = q[ 0 ] - p[ 0 ], dy = q[ 1 ] - p[ 1 ];
			const t = ( ( x - p[ 0 ] ) * dx + ( y - p[ 1 ] ) * dy ) / ( dx * dx + dy * dy );
			if ( t < .05 || t > .95 || ! Number.isFinite( t ) ) continue;
			const distance = Math.hypot( x - p[ 0 ] - dx * t, y - p[ 1 ] - dy * t );
			if ( distance >= best ) continue;
			const start = new THREE.Vector3( ...data.points[ a ] );
			const end = new THREE.Vector3( ...data.points[ b ] );
			const depthA = - start.clone().applyMatrix4( localToView ).z, depthB = - end.clone().applyMatrix4( localToView ).z;
			const fraction = camera.isPerspectiveCamera ? ( t / depthB ) / ( ( 1 - t ) / depthA + t / depthB ) : t;
			const along = start.lerp( end, fraction );
			if ( ! this.selectThrough && hitZ !== undefined && ! face.face.includes( a ) && ! face.face.includes( b ) &&
				along.clone().applyMatrix4( localToView ).z < hitZ - Math.abs( hitZ ) * .018 ) continue;
			if ( ! this.selectThrough && ! this.pointVisible( along.toArray(), [ p[ 0 ] + dx * t, p[ 1 ] + dy * t ] ) ) continue;
			edge = { a, b, t: fraction, point: this.object.localToWorld( along ) };
			best = distance;

		}
		return { face, edge };

	}

	beginPen( event ) {

		const { edge, face } = this.penHit( event );
		if ( event.ctrlKey && face ) {

			this.editor.suppressContextMenuUntil = performance.now() + 500;
			this.editor.viewTools.run( () => this.edit( 'Insert vertex in face', data => pokeFace( THREE, data, face.index, face.triangle, this.object.worldToLocal( face.hit.point.clone() ) ) ) );
			return true;

		}
		if ( ! edge && ! face ) return false;
		const indices = edge ? [ edge.a, edge.b ] : face.face.slice();
		const origin = edge?.point || face.hit.point;
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint( this.frame.camera.getWorldDirection( new THREE.Vector3() ), origin );
		const start = this.pointerWorld( event.clientX, event.clientY, plane );
		if ( ! start ) return false;
		this.indices = indices;
		this.drag = { pen: true, event, downAt: performance.now(), edge, boundary: edge && boundaryEdge( this.data, ...indices ), start, origin, plane,
			x: event.clientX, y: event.clientY, id: event.pointerId, target: event.target };
		event.target.setPointerCapture( event.pointerId );
		this.changed();
		this.draw();
		return true;

	}

	movePen( event, drag ) {

		if ( Math.hypot( event.clientX - drag.x, event.clientY - drag.y ) < 5 && ! drag.moved ) return;
		drag.moved = true;
		const snapped = this.penPlacement( event, drag.origin, drag.plane, drag );
		if ( ! snapped ) return;
		const offset = this.object.worldToLocal( snapped.clone() ).sub( this.object.worldToLocal( drag.origin.clone() ) );
		if ( offset.lengthSq() < 1e-12 ) {

			drag.geometry?.dispose();
			drag.geometry = drag.draft = null;
			this.render();
			return;

		}
		const data = structuredClone( this.data );
		if ( drag.edge && ! drag.boundary && ( performance.now() - drag.downAt > 450 || drag.edge.t >= .35 && drag.edge.t <= .65 ) ) {

			drag.cap = loopCut( data, [ drag.edge.a, drag.edge.b ], drag.edge.t );
			if ( ! drag.cap.length ) return;
			drag.geometry?.dispose(); drag.draft = data; drag.geometry = this.buildGeometry( data ); this.render(); return;

		}
		if ( drag.boundary ) drag.cap = extrudeEdge( THREE, data, drag.boundary, offset );
		else for ( const index of this.indices ) data.points[ index ] = new THREE.Vector3( ...data.points[ index ] ).add( offset ).toArray();
		drag.geometry?.dispose();
		drag.draft = data;
		drag.geometry = this.buildGeometry( data );
		this.render();

	}

	finishPen( drag, cancel ) {

		if ( ! cancel && this.canEdit() ) {

			if ( drag.geometry ) {

				this.commit( drag.boundary ? 'Pull mesh boundary edge' : 'Move mesh elements', drag.draft, drag.cap || this.indices, drag.geometry );
				return;

			}
			if ( drag.edge && ! drag.moved ) {

				if ( performance.now() - drag.downAt > 450 ) this.editor.viewTools.run( () => this.edit( 'Dissolve mesh edge', data => {

					if ( ! dissolveEdge( data, [ drag.edge.a, drag.edge.b ] ) ) data.faces = data.faces.filter( face => ! face.includes( drag.edge.a ) || ! face.includes( drag.edge.b ) );
					return [];

				} ) );
				else this.addPenPoint( drag.event, -1 );
				return;

			}

			if ( ! drag.edge && ! drag.moved && drag.event ) {

				if ( performance.now() - drag.downAt > 450 ) this.edit( 'Delete mesh face', data => { const face = this.faceHit( drag.event ); if ( face ) data.faces.splice( face.index, 1 ); return []; } );
				else { const face = this.faceHit( drag.event ); if ( face ) this.edit( 'Insert mesh face vertex', data => pokeFace( THREE, data, face.index, face.triangle, this.object.worldToLocal( face.hit.point.clone() ) ) ); }
				return;

			}
		}
		drag.geometry?.dispose(); this.changed(); this.render();

	}

	extrusionSelection() {

		if ( ! this.data || this.data.kind === 'vertices' ) return;
		if ( this.data.kind !== 'mesh' ) {

			if ( isClosedOutline( this.data ) && this.data.points.length >= 3 ) return { outline: true };

		} else if ( this.data.profile && this.data.points.length >= 3 ) return { outline: true };
		else {

			const index = this.selectedFace();
			if ( index >= 0 ) return { index };
			if ( this.indices.length === 2 ) {

				const edge = boundaryEdge( this.data, ...this.indices );
				if ( edge ) return { edge };

			}

		}

	}

	startExtrusion() {

		const selection = this.extrusionSelection();
		const frame = this.editor.viewLayout.navigation;
		if ( ! selection || ! this.canEdit() || ! frame || this.gesture || this.drag ) return;
		const data = selection.outline ? meshFromOutline( THREE, { ...this.data, kind: this.data.profile ? 'profile' : this.data.kind } ) : this.data;
		const index = selection.index ?? 0;
		const indices = selection.edge || data.faces[ index ];
		const normal = selection.edge ? null : faceNormal( THREE, data, indices );
		if ( ! normal && ! selection.edge ) throw new Error( 'Select a face with area.' );
		const center = new THREE.Vector3();
		for ( const i of indices ) center.add( new THREE.Vector3( ...data.points[ i ] ) );
		center.divideScalar( indices.length );
		const origin = this.object.localToWorld( center.clone() );
		const view = frame.camera.getWorldDirection( new THREE.Vector3() );
		const worldNormal = normal ? normal.applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( this.object.matrixWorld ) ) : view.negate();
		const pointer = this.lastPointer?.target === this.editor.renderer.domElement ? this.lastPointer : null;
		this.gesture = { modal: true, extrusion: true, ...selection, data, index, origin, normal: worldNormal, pointer, axis: '', numeric: '', free: !! selection.edge };
		this.editor.controls.enabled = false;
		this.onSelectionChange?.();
		this.notice ||= document.createElement( 'div' );
		this.notice.className = 'navigation-notice';
		this.viewport.append( this.notice );
		this.labelModal();

	}

	updateExtrusion( pointer ) {

		const state = this.gesture;
		const frame = this.editor.viewLayout.navigation;
		if ( ! frame ) return;
		const rect = this.rect();
		if ( ! pointer ) pointer = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
		const inside = pointer.clientX >= rect.left && pointer.clientX <= rect.left + rect.width &&
			pointer.clientY >= rect.top && pointer.clientY <= rect.top + rect.height;
		const numeric = state.numeric && Number( state.numeric );
		if ( ! state.pointer && inside && pointer.target === this.editor.renderer.domElement ) state.pointer = pointer;
		const start = state.pointer || pointer;
		if ( ! inside && ! Number.isFinite( numeric ) ) return;
		const camera = frame.camera;
		const axis = state.axis ? worldAxes[ 'XYZ'.indexOf( state.axis ) ] : state.free ? null : state.normal;
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint( camera.getWorldDirection( new THREE.Vector3() ), state.origin );
		const from = this.pointerWorld( start.clientX, start.clientY, plane );
		const to = this.pointerWorld( pointer.clientX, pointer.clientY, plane );
		if ( ! from || ! to ) return;
		const delta = to.clone().sub( from );
		if ( axis ) {

			const projected = axis.clone().addScaledVector( plane.normal, - axis.dot( plane.normal ) );
			const pixels = projected.lengthSq() > .04 ? delta.dot( projected ) / projected.lengthSq() :
				delta.length() * Math.sign( start.clientY - pointer.clientY || pointer.clientX - start.clientX );
			delta.copy( axis ).multiplyScalar( Number.isFinite( numeric ) ? numeric : pixels );

		} else if ( Number.isFinite( numeric ) ) {

			if ( ! delta.lengthSq() ) delta.setFromMatrixColumn( camera.matrixWorld, 0 );
			delta.normalize().multiplyScalar( numeric );

		}
		if ( ! Number.isFinite( numeric ) ) {

			const axes = axis ? [ axis ] : this.snapAxes( plane );
			delta.copy( this.snapPoint( state.origin.clone().add( delta ), state.origin, pointer, axes, state ) ).sub( state.origin );

		}
		state.geometry?.dispose();
		state.geometry = state.draft = null;
		if ( delta.lengthSq() > 1e-12 ) {

			const offset = this.object.worldToLocal( state.origin.clone().add( delta ) ).sub( this.object.worldToLocal( state.origin.clone() ) );
			state.draft = structuredClone( state.data );
			state.cap = state.edge ? extrudeEdge( THREE, state.draft, state.edge, offset ) : extrudeFace( THREE, state.draft, state.index, offset );
			state.geometry = this.buildGeometry( state.draft );

		}
		this.render();

	}

	closeOnFirstPoint( event ) {

		if ( this.editor.viewportShading === 'preview' || ! this.canEdit() || this.editor.viewTools?.mode || this.drag || this.gesture ||
			event.target !== this.editor.renderer?.domElement || this.editor.viewLayout.at( event.clientX, event.clientY ) !== this.editor.viewLayout.navigation ) return;
		if ( ! this.canCloseProfile() ) return;
		const { left, top } = this.rect();
		if ( this.pointUnder( event.clientX - left, event.clientY - top ) !== 0 ) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		this.editor.viewTools.run( () => this.closeProfile() );

	}

	pointerDown( event ) {

		if ( this.editor.viewportShading === 'preview' ) return;
		if ( ! this.editMode && this.selectionTool !== 'select' && ! this.editor.viewTools?.mode && ! this.editor.editWorkspace?.exclusive &&
			! this.editor.modalTransform?.active && ! this.editor.flyControls?.active && ! this.drag && event.button === 0 && ! event.altKey &&
			event.target === this.editor.renderer?.domElement && this.editor.viewLayout.navigation &&
			this.editor.viewLayout.at( event.clientX, event.clientY ) === this.editor.viewLayout.navigation ) {

			event.preventDefault();
			event.stopImmediatePropagation();
			this.beginSelection( event, true );
			return;

		}
		if ( this.isSculpting && ! this.editor.viewTools?.mode && ! this.editor.editWorkspace?.exclusive && ! this.drag &&
			! this.gesture && ! this.editor.modalTransform?.active && ! this.editor.flyControls?.active && event.button === 0 &&
			! event.altKey && ! event.metaKey && event.target === this.editor.renderer?.domElement &&
			this.editor.viewLayout.at( event.clientX, event.clientY ) === this.frame ) {

			this.beginBrush( event );
			return;

		}
		if ( this.editMode && ! this.canEdit() && ! this.editor.viewTools?.mode && ! this.editor.editWorkspace?.exclusive &&
			event.button === 0 && ! event.altKey && event.target === this.editor.renderer?.domElement ) {

			event.preventDefault(); event.stopImmediatePropagation();
			const frame = this.editor.viewLayout.at( event.clientX, event.clientY );
			if ( ! frame || frame !== this.editor.viewLayout.navigation ) return;
			const rect = this.editor.viewLayout.clientRect( frame );
			const hits = this.editor.selector.getPointerIntersects( { x: ( event.clientX - rect.left ) / rect.width, y: ( event.clientY - rect.top ) / rect.height }, frame.camera );
			const target = hits.map( hit => hit.object.userData.object || hit.object ).find( object =>
				( object.geometry?.userData.modeling || editableMesh( object ) ) && isVisible( object ) && ! hasRestriction( object, 'locked' ) );
			if ( target ) { this.editor.select( target ); if ( this.object !== target ) this.setTarget( target ); }
			else this.editor.viewTools.status.textContent = 'Select an unlocked mesh, shape or path to edit.';
			return;

		}

		if ( ! this.canEdit() || this.editor.viewTools?.mode || this.editor.editWorkspace?.exclusive || this.drag || event.button !== 0 || event.altKey && ! this.pen && ( this.adding || this.brush || this.selectionMode !== 'edge' ) || event.metaKey && ! this.pen || event.target !== this.editor.renderer?.domElement ) return;
		if ( this.gesture || ! this.editor.viewLayout.navigation || this.editor.viewLayout.at( event.clientX, event.clientY ) !== this.frame ) return;
		this.lastPointer = event;
		if ( this.knife ) { this.beginKnife( event ); return; }
		if ( this.pen && event.altKey ) {

			event.preventDefault(); event.stopImmediatePropagation();
			const rect = this.rect(), data = structuredClone( this.data );
			if ( autoQuad( THREE, data, [ event.clientX - rect.left, event.clientY - rect.top ], point => this.project( point, rect.width, rect.height ), addFace ) ) this.commit( 'AutoQuad', data, data.faces.at( -1 ) );
			return;

		}
		if ( this.pen && event.metaKey ) {

			event.preventDefault(); event.stopImmediatePropagation();
			const rect = this.rect(), vertex = this.pointUnder( event.clientX - rect.left, event.clientY - rect.top );
			if ( vertex >= 0 ) this.indices = this.indices.includes( vertex ) ? this.indices.filter( i => i !== vertex ) : [ ...this.indices, vertex ];
			else { const { edge, face } = this.penHit( event ); const ids = edge ? [ edge.a, edge.b ] : face?.face || []; this.indices = ids.every( i => this.indices.includes( i ) ) ? this.indices.filter( i => ! ids.includes( i ) ) : [ ...new Set( [ ...this.indices, ...ids ] ) ]; }
			this.changed(); this.render(); return;

		}
		if ( this.pen && event.shiftKey ) {

			event.preventDefault(); event.stopImmediatePropagation();
			const rect = this.rect();
			this.drag = { penDelete: true, event, x: event.clientX, y: event.clientY, hit: this.pointUnder( event.clientX - rect.left, event.clientY - rect.top ), ...this.penHit( event ), id: event.pointerId, target: event.target };
			event.target.setPointerCapture( event.pointerId ); return;

		}
		if ( this.brush && ( this.brush !== 'freehand' || this.data.kind === 'path' ) ) {

			this.beginBrush( event );
			return;

		}
		const rect = this.rect();
		const directStrokeDrag = this.isPencilStroke && this.selectionTool === 'select' && this.selectionOperation === 'set' &&
			! ( event.shiftKey || event.ctrlKey || event.altKey ) && this.pointUnder( event.clientX - rect.left, event.clientY - rect.top ) >= 0;
		if ( ! this.pen && ! this.adding && ! this.brush && ! directStrokeDrag ) {

			// Geometry picks take precedence over large transform gizmo planes.
			const onGeometry = this.selectionMode === 'vertex' ? this.pointUnder( event.clientX - rect.left, event.clientY - rect.top ) >= 0 : this.selectionMode === 'edge' ? !! this.penHit( event ).edge : !! this.faceUnder( event );
			if ( ! onGeometry && ! event.shiftKey && this.selectionTool === 'select' && this.gizmoUnderPointer?.( event ) ) return;
			event.preventDefault(); event.stopImmediatePropagation();
			if ( event.altKey ) { this.editor.suppressContextMenuUntil = performance.now() + 500; this.selectElement( event ); return; }
			this.beginSelection( event ); return;

		}
		if ( ! this.pen && ! this.adding && this.data.faces && this.selectionMode !== 'vertex' ) {

			event.preventDefault();
			event.stopImmediatePropagation();
			this.selectElement( event );
			return;

		}
		const { left, top } = this.rect();
		const hit = this.pointUnder( event.clientX - left, event.clientY - top );
		if ( this.penChain && ! event.shiftKey ) {

			event.preventDefault();
			event.stopImmediatePropagation();
			this.editor.viewTools.run( () => this.addPenPoint( event, hit ) );
			return;

		}
		if ( this.pen && ! this.adding && hit < 0 && ! event.shiftKey ) {

			if ( this.beginPen( event ) ) {

				event.preventDefault();
				event.stopImmediatePropagation();

			} else {

				event.preventDefault();
				event.stopImmediatePropagation();
				this.beginKnife( event, true );

			}
			return;

		}
		if ( hit < 0 && ! this.adding && ! event.shiftKey ) {

			if ( this.selectionMode === 'vertex' ) { this.indices = []; this.changed(); this.render(); return; }
			const face = this.pickFace( event );
			if ( ! face ) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			this.indices = face.slice();
			this.changed();
			this.draw();
			return;

		}
		event.preventDefault();
		event.stopImmediatePropagation();
		if ( hit >= 0 ) {

			if ( this.adding && hit === 0 && this.canCloseProfile() ) return;
			if ( event.shiftKey ) {

				this.indices = this.indices.includes( hit ) ? this.indices.filter( index => index !== hit ) : [ ...this.indices, hit ];
				this.changed();
				this.draw();
				return;

			}
			if ( directStrokeDrag ) this.applyElementSelection( this.indices.includes( hit ) ? this.indices.map( i => [ i ] ) : [ [ hit ] ], 'set' );
			else if ( ! this.indices.includes( hit ) ) this.indices = [ hit ];

		}
		if ( hit < 0 ) {

			if ( ! this.adding ) return;
			const placement = this.placementPoint( event, {} );
			if ( placement ) this.appendPoint( placement );
			return;

		}
		const origin = this.object.localToWorld( new THREE.Vector3( ...this.data.points[ hit ] ) );
		const normal = this.planar ?
			new THREE.Vector3( 0, 0, 1 ).applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( this.object.matrixWorld ) ) :
			this.frame.camera.getWorldDirection( new THREE.Vector3() );
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint( normal, origin );
		const world = this.pointerWorld( event.clientX, event.clientY, plane );
		if ( ! world ) { this.changed(); this.draw(); return; }
		this.drag = { target: event.target, id: event.pointerId, start: world, origin, plane, downAt: performance.now(), penVertex: this.pen && ! event.shiftKey ? hit : undefined };
		event.target.setPointerCapture( event.pointerId );
		this.changed();
		this.draw();

	}

	beginBrush( event ) {

		const { left, top } = this.rect();
		const cursor = [ event.clientX - left, event.clientY - top ];
		const brush = this.brush;
		const stroke = { brush, cursor, id: event.pointerId, target: event.target };
		if ( brush === 'freehand' ) {

			const placement = this.placementPoint( event, {} );
			if ( ! placement?.point ) return;
			stroke.samples = [ placement.point.toArray() ];
			stroke.newStroke = this.data.points.length > 0;

		} else {

			stroke.sculpt = true;
			stroke.objects = this.pen ? [ this.object ] : this.sculptTargets();
			stroke.targets = new Map();
			stroke.last = cursor;

		}
		event.preventDefault();
		event.stopImmediatePropagation();
		this.drag = stroke;
		if ( event.ctrlKey && brush !== 'freehand' ) this.editor.suppressContextMenuUntil = performance.now() + 500;
		event.target.setPointerCapture( event.pointerId );
		if ( stroke.sculpt ) this.moveBrush( event, stroke );

	}

	moveBrush( event, stroke ) {

		if ( this.editor.viewLayout.at( event.clientX, event.clientY ) !== this.frame ) return;
		const { left, top } = this.rect();
		const cursor = [ event.clientX - left, event.clientY - top ];
		if ( stroke.brush === 'freehand' ) {

			if ( Math.hypot( cursor[ 0 ] - stroke.cursor[ 0 ], cursor[ 1 ] - stroke.cursor[ 1 ] ) < 5 ) return;
			const placement = this.placementPoint( event, {} );
			if ( ! placement?.point ) return;
			stroke.cursor = cursor;
			stroke.samples.push( placement.point.toArray() );
			this.preview( stroke, stroke.samples.slice() );
			if ( stroke.newStroke ) stroke.draft.closed = false;

		} else {

			const tool = event.shiftKey ? 'smooth' : stroke.brush;
			const at = tool === 'grab' ? stroke.cursor : cursor;
			for ( const object of stroke.objects ) {

				if ( ! this.canEditTarget( object ) || ( tool === 'thickness' || tool === 'opacity' ) &&
					! modifierSource( object ).userData.modeling?.pencilBrush ) continue;
				let target = stroke.targets.get( object );
				if ( ! target ) {

					if ( tool === 'grab' && stroke.grabTested ) continue;
					target = this.startSculptTarget( object, at );
					if ( ! target ) continue;
					stroke.targets.set( object, target );

				}
				this.sculptTarget( event, stroke, target, cursor, tool );

			}
			if ( tool === 'grab' ) stroke.grabTested = true;
			stroke.last = cursor;

		}
		this.render();

	}

	startSculptTarget( object, cursor ) {

		const source = modifierSource( object );
		object.updateWorldMatrix( true, false );
		const { width, height } = this.rect();
		const camera = this.frame.camera;
		if ( ! source.boundingBox ) source.computeBoundingBox();
		const { min, max } = source.boundingBox;
		const corners = [ min.x, max.x ].flatMap( x => [ min.y, max.y ].flatMap( y =>
			[ min.z, max.z ].map( z => this.project( [ x, y, z ], width, height, camera, object ) ) ) );
		if ( corners.every( Boolean ) && [ 0, 1 ].some( axis =>
			corners.every( point => point[ axis ] > cursor[ axis ] + this.brushRadius ) ||
			corners.every( point => point[ axis ] < cursor[ axis ] - this.brushRadius ) ) ) return;
		const data = this.read( object );
		const pixels = data.points.map( point => this.project( point, width, height, camera, object ) );
		let index = -1, nearest = this.brushRadius;
		for ( const [ i, p ] of pixels.entries() ) {

			if ( ! p ) continue;
			const distance = Math.hypot( p[ 0 ] - cursor[ 0 ], p[ 1 ] - cursor[ 1 ] );
			if ( distance < nearest ) { index = i; nearest = distance; }

		}
		if ( index < 0 ) return;
		const normal = camera.getWorldDirection( new THREE.Vector3() );
		const origin = object.localToWorld( new THREE.Vector3( ...data.points[ index ] ) );
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint( normal, origin );
		return { object, data, source: object.geometry, pixels, plane, neighbors: sculptNeighbors( data, source ), normals: this.sculptNormals( data, source ) };

	}

	sculptTarget( event, stroke, target, cursor, tool ) {

		const { object, data } = target;
		const grab = tool === 'grab';
		const points = grab ? data.points : target.draft?.points || data.points;
		const { left, top, width, height } = this.rect();
		const pixels = grab ? target.pixels : points.map( point => this.project( point, width, height, this.frame.camera, object ) );
		const pressure = event.pointerType === 'pen' ? event.pressure || .5 : 1;
		const strength = this.brushStrength * pressure;
		const step = cursor.map( ( value, axis ) => value - ( grab ? stroke.cursor : stroke.last )[ axis ] );
		if ( ( grab && ! target.draft || tool === 'push' ) && ! step.some( Boolean ) ) return;
		const invert = event.ctrlKey ? -1 : 1;
		if ( tool === 'thickness' || tool === 'opacity' ) {

			const draft = target.draft || data;
			const samples = pencilSamples( draft );
			const next = sculptPoints( samples, pixels, cursor, this.brushRadius, strength, {
				tool, move: ( sample, _, weight ) => {

					const key = tool === 'thickness' ? 'radius' : 'opacity';
					const current = sample[ key ] ?? 1;
					const value = tool === 'thickness' ? Math.max( 1e-6, current * Math.exp( invert * weight * .18 ) ) :
						THREE.MathUtils.clamp( current + invert * weight * .12, .02, 1 );
					return current === value ? sample : { ...sample, [ key ]: value };

				}
			} );
			if ( next.some( ( sample, i ) => sample !== samples[ i ] ) ) {

				this.preview( target, draft.points, { ...draft.pencilBrush, samples: next } );
				target.changedBrush = true;

			}
			return;

		}
		const movement = ! [ 'smooth', 'relax' ].includes( tool ) && ( ( point, pixel, weight ) => {

			let offset = step.map( value => value * weight );
			if ( tool === 'pinch' ) offset = cursor.map( ( value, axis ) => ( value - pixel[ axis ] ) * weight * invert * .18 );
			if ( tool === 'twist' ) {

				const angle = invert * weight * .035 * ( Math.hypot( ...step ) + 2 );
				const x = pixel[ 0 ] - cursor[ 0 ], y = pixel[ 1 ] - cursor[ 1 ];
				offset = [ x * ( Math.cos( angle ) - 1 ) - y * Math.sin( angle ), y * ( Math.cos( angle ) - 1 ) + x * Math.sin( angle ) ];

			}
			const a = this.pointerWorld( left + pixel[ 0 ], top + pixel[ 1 ], target.plane );
			const b = this.pointerWorld( left + pixel[ 0 ] + offset[ 0 ], top + pixel[ 1 ] + offset[ 1 ], target.plane );
			if ( ! a || ! b ) return point;
			const delta = object.worldToLocal( b ).sub( object.worldToLocal( a ) );
			return new THREE.Vector3( ...point ).add( delta ).toArray();

		} );
		const next = sculptPoints( points, pixels, grab ? stroke.cursor : cursor, this.brushRadius, strength,
			{ tool, move: movement, neighbors: target.neighbors, normals: target.normals } );
		if ( ! next.some( ( point, i ) => point !== points[ i ] ) ) return;
		if ( ( data.kind === 'shape' || data.planar || data.profile ) ) for ( const [ index, point ] of next.entries() ) if ( point !== points[ index ] ) point[ 2 ] = 0;
		this.preview( target, next );

	}

	pointerMove( event ) {

		const drag = this.drag;
		if ( drag?.penDelete ) {

			if ( Math.hypot( event.clientX - drag.x, event.clientY - drag.y ) < 5 ) return;
			const brush = this.brush; this.brush = 'relax'; this.beginBrush( drag.event ); this.brush = brush;
			if ( this.drag?.brush ) this.moveBrush( event, this.drag ); return;

		}
		if ( drag?.knife || drag?.penEmpty ) {

			if ( this.editor.viewLayout.at( event.clientX, event.clientY ) !== this.frame ) return;
			const rect = this.rect(); drag.end = [ event.clientX - rect.left, event.clientY - rect.top ];
			if ( drag.penEmpty && performance.now() - drag.downAt > 450 && Math.hypot( drag.end[ 0 ] - drag.start[ 0 ], drag.end[ 1 ] - drag.start[ 1 ] ) > 5 ) drag.knife = true;
			this.draw(); return;

		}
		if ( drag?.selection ) {

			const rect = this.rect();
			drag.end = [ event.clientX - rect.left, event.clientY - rect.top ]; drag.polygon.push( drag.end );
			this.draw(); return;

		}
		if ( ! drag ) {

			if ( this.penChain && event.target === this.editor.renderer?.domElement && this.editor.viewLayout.at( event.clientX, event.clientY ) === this.frame ) {

				const chain = this.penChain;
				const origin = this.object.localToWorld( new THREE.Vector3( ...chain.data.points[ chain.indices.at( -1 ) ] ) );
				this.placementSnap = this.penPlacement( event, origin, chain.plane, chain ); this.draw();

			}
			if ( this.pen && this.canEdit() && this.data.faces?.length && ! this.penChain && event.target === this.editor.renderer?.domElement && this.editor.viewLayout.at( event.clientX, event.clientY ) === this.frame ) {

				this.penHover = this.penHit( event ).edge;
				this.draw();

			}
			if ( this.isSculpting || this.brush && this.object ) this.draw();
			if ( ! this.canEdit() || this.editor.viewTools?.mode || ! this.adding || this.gesture || ! this.editor.viewLayout.navigation ) return;
			const marker = {};
			if ( this.editor.viewLayout.at( event.clientX, event.clientY ) === this.frame && ( this.placement === 'surface' || modelSnapMode( this.editor.config, event.ctrlKey ) ) ) {

				this.placementPoint( event, marker );

			}
			if ( this.data.profile || marker.snap || this.placementSnap ) {

				this.placementSnap = marker.snap;
				this.draw();

			}
			return;

		}
		if ( drag.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		if ( drag.pen ) { this.movePen( event, drag ); return; }
		if ( drag.brush ) { this.moveBrush( event, drag ); return; }
		const point = this.pointerWorld( event.clientX, event.clientY, drag.plane );
		if ( ! point ) return;
		const target = point.sub( drag.start ).add( drag.origin );
		const axes = this.planar ? this.snapAxes( drag.plane ) : worldAxes;
		const snapped = drag.penVertex !== undefined ? this.penPlacement( event, drag.origin, drag.plane, drag ) : this.snapPoint( target, drag.origin, event, axes, drag );
		if ( ! snapped ) return;
		const delta = this.object.worldToLocal( snapped.clone() ).sub( this.object.worldToLocal( drag.origin.clone() ) );
		const points = this.data.points.slice();
		for ( const index of this.indices ) {

			const local = new THREE.Vector3( ...points[ index ] ).add( delta );
			if ( this.planar ) local.z = 0;
			points[ index ] = local.toArray();

		}
		this.preview( drag, points );
		this.render();

	}

	releaseDrag( keepGeometry = false ) {

		const drag = this.drag;
		this.drag = null;
		if ( ! keepGeometry ) {

			drag?.geometry?.dispose();
			for ( const target of drag?.targets?.values() || [] ) target.geometry?.dispose();

		}
		if ( drag?.target.hasPointerCapture( drag.id ) ) drag.target.releasePointerCapture( drag.id );
		return drag;

	}

	finishSculptGesture( drag, cancel ) {

		const commands = [];
		const previews = new Set();
		let pencilOnly = true;
		for ( const { geometry } of drag.targets.values() ) if ( geometry ) previews.add( geometry );
		try {

			if ( ! cancel ) for ( const target of drag.targets.values() ) {

				const { object, data, source, draft, geometry } = target;
				if ( ! geometry || ! object.parent || object.geometry !== source || ! this.canEditTarget( object ) ) continue;
				const changed = target.changedBrush || draft.points.some( ( point, i ) => point.some( ( n, axis ) => n !== data.points[ i ][ axis ] ) );
				if ( ! changed ) continue;
				pencilOnly &&= !! data.pencilBrush;
				if ( object.userData.modifiers?.length ) {

					commands.push( ...modifierStackCommands( this.editor, object, object.userData.modifiers, geometry ) );

				} else {

					const command = new SetGeometryCommand( this.editor, object, geometry );
					command.updatable = false;
					commands.push( command );

				}

			}

		} catch ( error ) {

			// Geometry and modifier commands are staged together before any object changes.
			for ( const command of commands ) if ( command.newGeometry ) previews.add( command.newGeometry );
			commands.length = 0;
			this.editor.viewTools.status.textContent = error.message;

		}
		for ( const command of commands ) previews.delete( command.newGeometry );
		for ( const geometry of previews ) geometry.dispose();
		if ( commands.length ) this.editor.execute( commands.length === 1 ? commands[ 0 ] : new MultiCmdsCommand( this.editor, commands ),
			pencilOnly ? 'Sculpt Pencil strokes' : 'Sculpt objects' );
		this.changed();
		this.render();

	}

	pointerEnd( event, cancel = false ) {

		if ( this.drag?.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		const drag = this.releaseDrag( true );
		if ( drag.sculpt ) { this.finishSculptGesture( drag, cancel ); return; }
		if ( drag.penDelete ) {

			if ( ! cancel ) this.edit( 'Delete mesh element', data => {

				if ( drag.hit >= 0 ) removePoints( data, [ drag.hit ] );
				else if ( drag.edge ) data.faces = data.faces.filter( face => ! face.some( ( a, i ) => [ a, face[ ( i + 1 ) % face.length ] ].includes( drag.edge.a ) && [ a, face[ ( i + 1 ) % face.length ] ].includes( drag.edge.b ) ) );
				else if ( drag.face ) data.faces.splice( drag.face.index, 1 );
				return [];

			} );
			this.draw(); return;

		}
		if ( drag.knife || drag.penEmpty ) { this.finishKnife( drag, cancel ); return; }
		if ( drag.selection ) { this.finishSelection( drag, cancel ); return; }
		if ( drag.pen ) { this.finishPen( drag, cancel ); return; }
		if ( drag.penVertex !== undefined && ! cancel && ! drag.draft ) {

			if ( performance.now() - drag.downAt > 450 ) { this.edit( 'Delete mesh vertex', data => { removePoints( data, [ drag.penVertex ] ); return []; } ); return; }

			this.addPenPoint( event, drag.penVertex );
			return;

		}
		const changed = drag.brush === 'freehand' ? drag.draft?.points.length >= 2 : drag.draft && this.pointsChanged( drag );
		if ( ! cancel && drag.geometry && this.canEdit() && changed ) {

			if ( drag.newStroke ) {

				const source = this.object;
				const object = modelObject( THREE, drag.draft, 'Editable path' );
				object.position.copy( source.position );
				object.quaternion.copy( source.quaternion );
				object.scale.copy( source.scale );
				drag.geometry.dispose();
				this.editor.execute( new AddObjectCommand( this.editor, object, source.parent ), 'Draw freehand path' );
				return;

			}
			if ( drag.penVertex !== undefined && this.data.kind === 'mesh' ) {

				const rect = this.rect(); let nearest = 14, target = -1;
				this.data.points.forEach( ( point, i ) => {

					if ( this.indices.includes( i ) ) return;
					const pixel = this.project( point, rect.width, rect.height ); if ( ! pixel ) return;
					const distance = Math.hypot( pixel[ 0 ] + rect.left - event.clientX, pixel[ 1 ] + rect.top - event.clientY );
					if ( distance < nearest ) { target = i; nearest = distance; }

				} );
				if ( target >= 0 && ! event.ctrlKey ) {

					drag.draft.points[ drag.penVertex ] = drag.draft.points[ target ].slice();
					const ids = weldPoints( drag.draft, [ target, drag.penVertex ] );
					drag.geometry.dispose(); this.commit( 'Attach mesh vertex', drag.draft, ids ); return;

				}

			}
			this.commit( drag.brush === 'freehand' ? 'Draw freehand path' : 'Move modeling points',
				drag.draft, this.indices, drag.geometry );

		}
		else {

			drag.geometry?.dispose();
			this.changed();
			this.render();

		}

	}

}
