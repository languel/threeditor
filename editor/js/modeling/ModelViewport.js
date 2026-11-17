import { cutAcrossMesh, loopCut, dissolveEdge, autoQuad } from './PolyOperations.js';
import { selectionCandidates, applySelection, edgeLoop, pointInPolygon, meshEdges } from './MeshSelection.js?v=shape-selection';
import { modifierSource, setModifierStack } from './Modifiers.js?v=poly-context';
import { meshBrushes, sculptNeighbors, sculptPoints } from './SculptBrush.js?v=contour-editing';
import * as THREE from 'three';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { SetPositionCommand } from '../commands/SetPositionCommand.js';
import { SetRotationCommand } from '../commands/SetRotationCommand.js';
import { meshHit } from './SurfacePicking.js';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';
import { modelSnapMode, snapIncrement, snapMeshFeature } from './ModelSnap.js';
import { addFace, boundaryEdge, extrudeEdge, extrudeFace, faceNormal, isClosedOutline, meshFromOutline, modelData, modelGeometry, modelObject, outlinePoints, pokeFace, removePoints, splitEdge, weldPoints } from './ModelGeometry.js?v=contour-editing';

import { contourEdgeCount, insertContourPoint, interpolatePoint, nearestContourEdge } from './Contour.js';

const worldAxes = [ new THREE.Vector3( 1, 0, 0 ), new THREE.Vector3( 0, 1, 0 ), new THREE.Vector3( 0, 0, 1 ) ];

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
		this.overlay = document.createElement( 'canvas' );
		this.overlay.className = 'modeling-overlay';
		this.overlay.setAttribute( 'aria-hidden', 'true' );
		this.overlay.hidden = true;
		viewport.append( this.overlay );
		this.context = this.overlay.getContext( '2d' );

		viewport.addEventListener( 'pointerdown', event => {

			const control = document.activeElement;
			if ( event.target === editor.renderer?.domElement && control?.closest( '.viewport-tool-panel, .modeling-panel, #animation' ) ) control.blur();
			this.pointerDown( event );

		}, true );
		viewport.addEventListener( 'pointermove', event => this.pointerMove( event ), true );
		viewport.addEventListener( 'pointerleave', () => {

			if ( ! this.placementSnap && ! this.penHover ) return;
			this.placementSnap = this.penHover = null;
			this.draw();

		} );
		viewport.addEventListener( 'pointerup', event => this.pointerEnd( event ), true );
		viewport.addEventListener( 'pointercancel', event => this.pointerEnd( event, true ), true );
		viewport.addEventListener( 'lostpointercapture', event => this.pointerEnd( event, true ), true );
		viewport.addEventListener( 'dblclick', event => this.editContourAtPointer( event ), true );
		for ( const type of [ 'mousedown', 'mouseup', 'dblclick', 'touchstart', 'touchend' ] ) viewport.addEventListener( type, event => {

			if ( this.object && ! editor.viewTools?.mode && event.target === editor.renderer?.domElement ) event.stopImmediatePropagation();

		}, true );

		const { signals } = editor;
		signals.sceneRendered.add( () => this.draw() );
		signals.transformSettingsChanged.add( () => { if ( this.object && ! this.gesture ) this.changed(); } );
		window.addEventListener( 'pointermove', event => {
			this.lastPointer = event;
			if ( this.gesture?.modal ) this.updateModal( event );
		}, true );
		window.addEventListener( 'pointerdown', event => {

			if ( ! this.gesture?.modal || ! [ 0, 2 ].includes( event.button ) || ! viewport.contains( event.target ) ) return;
			if ( this.gesture.extrusion && ( event.target !== editor.renderer?.domElement || editor.viewLayout.at( event.clientX, event.clientY ) !== editor.viewLayout.navigation ) ) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if ( event.button === 2 ) editor.suppressContextMenuUntil = performance.now() + 500;
			this.finishTransform( event.button === 0 );

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

			if ( ! this.object || editor.viewTools?.mode || editor.editWorkspace?.exclusive || document.querySelector( 'dialog[open]' ) || event.target.closest?.( '.context-menu' ) ) return;
			if ( this.gesture?.modal ) { this.modalKey( event ); return; }
			if ( event.key === 'Escape' && ( this.gesture || this.drag ) ) {

				event.preventDefault();
				event.stopImmediatePropagation();
				if ( this.drag ) this.releaseDrag();
				else this.cancelGizmo?.();
				this.changed();
				this.render();
				return;

			}
			if ( ! editor.keymap.allowsViewportInput( event ) ) return;
			if ( this.penChain && [ 'Escape', 'Enter', 'f', 'F' ].includes( event.key ) ) {

				event.preventDefault();
				event.stopImmediatePropagation();
				if ( event.key === 'Escape' ) { this.penChain = null; this.changed(); this.render(); }
				else editor.viewTools.run( () => this.finishPenFace() );
				return;

			}
			if ( this.pen && ( this.penChain || this.drag ) && ! event.ctrlKey && ! event.metaKey && [ 'x', 'y', 'z' ].includes( event.key.toLowerCase() ) ) {

				event.preventDefault(); event.stopImmediatePropagation();
				const state = this.drag || this.penChain, axis = event.key.toUpperCase();
				state.axis = state.axis === axis ? '' : axis; state.planeLock = event.shiftKey; return;

			}
			if ( ! event.repeat && ! ( event.altKey || event.metaKey || event.ctrlKey || event.shiftKey ) &&
				event.key === 'Enter' && this.adding && this.canCloseProfile() ) {

				event.preventDefault();
				event.stopImmediatePropagation();
				editor.viewTools.run( () => this.closeProfile() );
				return;

			}
			const deleting = [ 'Delete', 'Backspace' ].includes( event.key );
			if ( deleting && editor.viewTools.workspaceMode === 'sculpt' ) return;
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
		const data = geometry.userData.modeling;
		if ( data && data.kind !== 'vertices' ) return structuredClone( data );
		const position = geometry.attributes.position;
		const points = [], vertices = [], coincident = new Map();
		// Keep UV seams and hard edges intact by moving coincident buffer vertices together.
		for ( let i = 0; i < position.count; i ++ ) {

			const point = [ position.getX( i ), position.getY( i ), position.getZ( i ) ];
			const key = point.join( ',' );
			if ( ! coincident.has( key ) ) {

				coincident.set( key, points.length );
				points.push( point );
				vertices.push( [] );

			}
			vertices[ coincident.get( key ) ].push( i );

		}
		const control = [];
		vertices.forEach( ( list, i ) => list.forEach( index => control[ index ] = i ) );
		const faces = [], index = geometry.index;
		for ( let i = 0, count = index?.count ?? position.count; i + 2 < count; i += 3 ) {

			const face = [ 0, 1, 2 ].map( offset => control[ index ? index.getX( i + offset ) : i + offset ] );
			faces.push( face );

		}
		return { kind: 'vertices', points, vertices, faces };

	}

	canEdit() {

		return this.object && isVisible( this.object ) && ! hasRestriction( this.object, 'locked' );

	}

	setMode( mode ) {

		if ( mode === 'edit' ) this.start( this.editor.selected );
		else this.stop();

	}

	start( object ) {

		if ( this.editor.editWorkspace?.exclusive ) this.editor.editWorkspace.close();
		if ( this.editor.viewTools?.mode ) this.editor.viewTools.setMode( '' );
		if ( this.editor.viewportSource && ! this.editor.viewportSplit ) this.editor.setViewportSplit( true );
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

	canSculptTarget( object ) {

		if ( ! this.canEditTarget( object ) ) return false;
		const source = modifierSource( object );
		return ( source.userData.modeling?.points?.length ?? source.attributes.position.count ) > 0;

	}

	setTarget( object ) {

		this.releaseDrag();
		if ( this.gesture?.modal ) this.finishTransform( false );
		else if ( this.gesture ) this.cancelGizmo?.();
		const editable = this.canEditTarget( object );
		this.object = editable ? object : null;
		this.data = editable ? this.read( object ) : null;
		this.indices = [];
		this.elements = new Map();
		this.adding = Boolean( this.data?.profile );
		const hasFaces = this.data?.kind !== 'vertices' && Boolean( this.data?.faces?.length );
		this.pen = this.editMode && this.pen && hasFaces;
		this.knife = this.editMode && this.knife && hasFaces && ! this.data.profile;
		this.penHover = null;
		this.penChain = null;
		if ( ! this.editMode || this.brush !== 'freehand' && ! this.data?.points?.length ) this.brush = '';
		this.overlay.hidden = ! this.object;
		this.changed();
		this.render();

	}

	syncTool() {

		if ( this.editor.viewTools?.mode ) {

			this.releaseDrag();
			if ( this.gesture?.modal ) this.finishTransform( false );
			else if ( this.gesture ) this.cancelGizmo?.();

		}
		this.overlay.hidden = ! this.object || !! this.editor.viewTools?.mode;

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
		this.editor.execute( new AddObjectCommand( this.editor, object ) );
		this.start( object );
		this.adding = empty && ! freehand;
		this.pen = kind === 'mesh';
		this.brush = freehand ? 'freehand' : '';
		this.changed();
		this.render();

	}

	actions() {

		if ( ! this.data ) return [];
		const { data, indices } = this;
		const actions = [];
		const add = ( label, glyph, run, disabled = false, pressed ) => actions.push( { label, glyph, run, disabled, pressed } );
		const sculpt = this.editor.viewTools.workspaceMode === 'sculpt';
		if ( data.points.length ) add( 'Sculpt brushes', 'sculptTool', () => this.editor.viewTools.setWorkspaceMode( sculpt ? 'edit' : 'sculpt' ), false, sculpt );
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

			next.points = [];
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

			add( 'Close outline', 'closeTool', () => this.closeProfile(), ! this.canCloseProfile() );
			add( 'Extrude outline', 'extrude', () => this.startExtrusion(), ! this.extrusionSelection() );
			add( 'Insert outline point', 'snapMidpoint', () => this.insertAfterSelectedPoint(), ! this.editingOutline || indices.length !== 1 );
			add( 'Smooth outline', 'sculptSmooth', () => this.toggleOutlineSmoothing(), ! this.editingOutline || data.points.length < 3, !! data.smooth );
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

	selectElement( event ) {

		const edge = this.selectionMode === 'edge' ? this.penHit( event ).edge : null;
		const rect = this.rect();
		const vertex = this.selectionMode === 'vertex' ? this.pointUnder( event.clientX - rect.left, event.clientY - rect.top ) : -1;
		const hit = this.selectionMode === 'face' ? this.faceHit( event )?.face : edge ? [ edge.a, edge.b ] : vertex >= 0 ? [ vertex ] : null;
		const hits = edge && event.altKey ? edgeLoop( this.data, hit, event.ctrlKey ) : hit ? [ hit ] : [];
		this.applyElementSelection( hits, event.shiftKey ? 'toggle' : event.ctrlKey && ! event.altKey ? 'subtract' : this.selectionOperation );

	}

	beginSelection( event ) {

		const rect = this.rect();
		const point = [ event.clientX - rect.left, event.clientY - rect.top ];
		this.drag = { selection: true, tool: this.selectionTool, start: point, end: point, polygon: [ point ],
			operation: event.ctrlKey ? 'subtract' : event.shiftKey ? 'extend' : this.selectionOperation,
			initial: this.selectionMode === 'vertex' ? new Map( this.indices.map( i => [ String( i ), [ i ] ] ) ) : new Map( this.elements ),
			target: event.target, id: event.pointerId, event };
		event.target.setPointerCapture( event.pointerId );
		this.draw();

	}

	finishSelection( drag, cancel ) {

		if ( cancel ) { this.applyElementSelection( [ ...drag.initial.values() ], 'set' ); return; }
		if ( Math.hypot( drag.end[ 0 ] - drag.start[ 0 ], drag.end[ 1 ] - drag.start[ 1 ] ) < 4 && drag.tool === 'select' ) {

			this.selectElement( drag.event ); return;

		}
		const { width, height } = this.rect();
		const pixels = this.data.points.map( point => this.project( point, width, height ) );
		const inside = point => point && ( drag.tool === 'circle' ? drag.polygon.some( center => Math.hypot( point[ 0 ] - center[ 0 ], point[ 1 ] - center[ 1 ] ) <= this.brushRadius ) :
			drag.tool === 'lasso' ? pointInPolygon( point, drag.polygon ) : point[ 0 ] >= Math.min( drag.start[ 0 ], drag.end[ 0 ] ) && point[ 0 ] <= Math.max( drag.start[ 0 ], drag.end[ 0 ] ) && point[ 1 ] >= Math.min( drag.start[ 1 ], drag.end[ 1 ] ) && point[ 1 ] <= Math.max( drag.start[ 1 ], drag.end[ 1 ] ) );
		const hits = selectionCandidates( this.data, this.selectionMode ).filter( ids => ids.every( i => inside( pixels[ i ] ) ) );
		this.applyElementSelection( hits, drag.operation );

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

	setBrush( brush ) {

		if ( ! this.canEdit() || this.drag || this.gesture || brush && ( ! this.data.points.length || ! meshBrushes.some( ( [ id ] ) => id === brush ) ) ) return;
		this.pen = false;
		this.penChain = null;
		this.knife = false;
		this.brush = brush;
		this.adding = false;
		this.changed();
		this.render();

	}

	sculptNormals() {

		const { data, object } = this;
		const normals = data.points.map( () => new THREE.Vector3() );
		if ( data.faces ) for ( const face of data.faces ) {

			const normal = faceNormal( THREE, data, face );
			if ( normal ) for ( const index of face ) normals[ index ].add( normal );

		}
		if ( data.vertices && object.geometry.attributes.normal ) {

			const sample = new THREE.Vector3();
			for ( const [ index, vertices ] of data.vertices.entries() ) for ( const vertex of vertices ) {

				normals[ index ].add( sample.fromBufferAttribute( object.geometry.attributes.normal, vertex ) );

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

	}

	edit( name, mutate ) {

		if ( ! this.canEdit() ) return;
		const data = structuredClone( this.data );
		const indices = mutate( data );
		this.commit( name, data, Array.isArray( indices ) ? indices : this.indices );

	}

	buildGeometry( data, reusable ) {

		const object = this.object;
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

			geometry = modelGeometry( THREE, data );

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

	preview( state, points ) {

		const draft = { ...this.data, points };
		let geometry;
		try { geometry = this.buildGeometry( draft, state.geometry ); }
		catch { return; }
		if ( state.geometry !== geometry ) state.geometry?.dispose();
		state.geometry = geometry;
		state.draft = draft;

	}

	withPreview( draw ) {

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
			if ( axes.length && ! state.numeric ) this.proxy.position.copy( this.snapPoint( this.proxy.position, state.origin, pointer, axes, state ) );
			else state.snap = null;

		}
		this.proxy.updateMatrix();
		const delta = new THREE.Matrix4().multiplyMatrices( this.proxy.matrix, state.inverse );
		const points = this.data.points.map( ( point, index ) => {

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
		const pointer = this.lastPointer;
		if ( pointer?.target !== this.editor.renderer?.domElement || this.editor.viewLayout.at( pointer.clientX, pointer.clientY ) !== this.frame ) {

			this.lastPointer = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };

		}
		if ( ! this.beginTransform( mode, true ) ) return;
		this.editor.controls.enabled = false;
		this.onSelectionChange?.();
		this.notice ||= document.createElement( 'div' );
		this.notice.className = 'navigation-notice';
		this.viewport.append( this.notice );
		this.labelModal();

	}

	labelModal() {

		const { mode, axis, numeric } = this.gesture;
		if ( this.gesture.extrusion ) {

			this.notice.textContent = [ 'Extrude', axis || ( this.gesture.free ? 'Free move' : 'Face normal' ), numeric,
				'X/Y/Z axis · N free/normal · type distance · Enter confirm · Esc cancel' ].filter( Boolean ).join( ' · ' );
			return;

		}
		const name = { translate: 'Move points', rotate: 'Rotate points', scale: 'Scale points' }[ mode ];
		this.notice.textContent = [ name, axis, numeric, 'X/Y/Z axis · type a value · Enter accept · Esc cancel' ].filter( Boolean ).join( ' · ' );

	}

	modalKey( event ) {

		if ( [ 'Control', 'Shift', 'Alt', 'Meta' ].includes( event.key ) ) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		const state = this.gesture, key = event.key.toLowerCase();
		if ( key === 'enter' || key === 'escape' ) { this.finishTransform( key === 'enter' ); return; }
		if ( key === 'n' && state.extrusion ) { state.axis = ''; state.free = ! state.free; }
		else if ( 'xyz'.includes( key ) && key.length === 1 ) {

			const axis = ! state.extrusion && event.shiftKey && state.mode !== 'rotate' ? 'XYZ'.replace( key.toUpperCase(), '' ) : key.toUpperCase();
			state.axis = state.axis === axis ? '' : axis;

		} else if ( key === 'backspace' ) state.numeric = state.numeric.slice( 0, -1 );
		else if ( /^[-.0-9]$/.test( key ) ) state.numeric += key;
		this.labelModal();
		this.updateModal( this.lastPointer );

	}

	updateModal( pointer ) {

		const state = this.gesture;
		if ( state.extrusion ) { this.updateExtrusion( pointer ); return; }
		const start = state.pointer;
		const dx = pointer.clientX - start.clientX;
		const dy = start.clientY - pointer.clientY;
		const value = state.numeric ? Number( state.numeric ) : NaN;
		const view = this.frame.camera.getWorldDirection( new THREE.Vector3() );
		const axis = state.axis.length === 1 ? new THREE.Vector3().setComponent( 'XYZ'.indexOf( state.axis ), 1 )
			.applyQuaternion( state.rotation ) : null;
		const snap = modelSnapMode( this.editor.config, pointer.ctrlKey );
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
			const delta = to.sub( from ).applyQuaternion( state.rotation.clone().invert() );
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
			this.proxy.quaternion.premultiply( new THREE.Quaternion().setFromAxisAngle( normal, angle ) );

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

	project( point, width, height, camera = this.frame.camera ) {
		const projection = new THREE.Vector3( ...point ).applyMatrix4( this.object.matrixWorld );
		const depth = projection.clone().applyMatrix4( camera.matrixWorldInverse ).z;
		projection.project( camera );
		if ( depth >= 0 || ! Number.isFinite( projection.x ) ) return;
		return [ ( projection.x + 1 ) * width / 2, ( 1 - projection.y ) * height / 2 ];

	}

	draw() {

		if ( ! this.canEdit() || ! this.editor.renderer || ! this.frame || this.editor.viewTools?.mode || this.editor.editWorkspace?.exclusive ) return;
		const bounds = this.editor.renderer.domElement.getBoundingClientRect();
		const ratio = Math.min( 2, window.devicePixelRatio || 1 );
		const w = Math.round( bounds.width * ratio ), h = Math.round( bounds.height * ratio );
		if ( this.overlay.width !== w || this.overlay.height !== h ) {

			this.overlay.width = w;
			this.overlay.height = h;

		}
		this.object.updateWorldMatrix( true, false );
		const ctx = this.context;
		ctx.setTransform( ratio, 0, 0, ratio, 0, 0 );
		ctx.clearRect( 0, 0, bounds.width, bounds.height );
		const frames = this.editor.viewLayout.frames;
		for ( const frame of frames ) {
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
		const state = this.gesture || this.drag;
		const data = this.penChain?.data || state?.draft || this.data;
		const handles = data.points.map( point => project( point ) );
		if ( interactive ) this.handles = handles;
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = '#6cd4f2';
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
					ctx.setLineDash( [ 4, 4 ] );
					stroke( [ handles.at( -1 ), [ pointer.clientX - left, pointer.clientY - top ] ], false );
					ctx.setLineDash( [] );

				}

			}
			data.faces.forEach( face => stroke( face.map( index => handles[ index ] ), true ) );

		} else if ( data.kind !== 'vertices' ) {

			const points = outlinePoints( THREE, data );
			stroke( points.map( point => project( point.toArray() ) ), isClosedOutline( data ) );

		}
		if ( this.penChain ) {

			ctx.strokeStyle = '#ffba62';
			stroke( this.penChain.indices.map( index => handles[ index ] ), false );

		}
		if ( ! this.pen && this.selectionMode !== 'vertex' && this.elements?.size ) {

			ctx.strokeStyle = '#ffba62';
			ctx.fillStyle = '#ff9a3038';
			ctx.lineWidth = 2.5;
			for ( const element of this.elements.values() ) {

				stroke( element.map( i => handles[ i ] ), this.selectionMode === 'face' );
				if ( this.selectionMode === 'face' ) ctx.fill();

			}

		} else if ( this.indices.length > 1 ) {

			ctx.strokeStyle = '#ffba62';
			stroke( this.indices.map( index => handles[ index ] ), false );

		}
		if ( interactive && this.pen && this.penHover && ! this.drag ) {

			ctx.strokeStyle = '#ffd481';
			ctx.lineWidth = 3;
			stroke( [ handles[ this.penHover.a ], handles[ this.penHover.b ] ], false );
			ctx.lineWidth = 1.5;

		}
		const selected = new Set( state?.cap || this.indices );
		for ( let i = 0; i < handles.length; i ++ ) {

			const point = handles[ i ];
			if ( ! point ) continue;
			const active = selected.has( i );
			ctx.beginPath();
			ctx.arc( ...point, active ? 5 : 3.5, 0, Math.PI * 2 );
			ctx.fillStyle = active ? '#ffba62' : '#6cd4f2';
			ctx.fill();
			ctx.strokeStyle = '#101922';
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
		if ( interactive && this.brush && this.brush !== 'freehand' && this.lastPointer ) {

			const { left, top } = this.rect();
			ctx.beginPath();
			ctx.arc( this.lastPointer.clientX - left, this.lastPointer.clientY - top, this.brushRadius, 0, Math.PI * 2 );
			ctx.strokeStyle = '#ffba62';
			ctx.lineWidth = 1;
			ctx.stroke();

		}
		const constraint = this.penChain || state;
		if ( constraint?.axis ) {

			const axis = worldAxes[ 'XYZ'.indexOf( constraint.axis ) ];
			const origin = constraint.origin || this.object.localToWorld( new THREE.Vector3( ...( this.penChain?.data.points[ this.penChain.indices.at( -1 ) ] || [ 0, 0, 0 ] ) ) );
			const local = world => this.object.worldToLocal( world ).toArray();
			ctx.strokeStyle = { X: '#ff6060', Y: '#92d760', Z: '#628fff' }[ constraint.axis ]; ctx.setLineDash( [ 5, 4 ] );
			stroke( [ project( local( origin.clone().addScaledVector( axis, -100 ) ) ), project( local( origin.clone().addScaledVector( axis, 100 ) ) ) ], false );
			ctx.setLineDash( [] );

		}
		if ( interactive && state?.knife ) {

			ctx.strokeStyle = '#ff725e'; ctx.lineWidth = 2; stroke( [ state.start, state.end ], false );

		}
		if ( interactive && state?.selection ) {

			ctx.strokeStyle = '#ffba62'; ctx.fillStyle = '#ffba6218'; ctx.lineWidth = 1;
			ctx.beginPath();
			if ( state.tool === 'circle' ) ctx.arc( ...state.end, this.brushRadius, 0, Math.PI * 2 );
			else if ( state.tool === 'lasso' ) { state.polygon.forEach( ( p, i ) => i ? ctx.lineTo( ...p ) : ctx.moveTo( ...p ) ); ctx.closePath(); }
			else ctx.rect( state.start[ 0 ], state.start[ 1 ], state.end[ 0 ] - state.start[ 0 ], state.end[ 1 ] - state.start[ 1 ] );
			ctx.fill(); ctx.stroke();

		}
		ctx.restore();

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
		if ( this.pen && event.ctrlKey ) { state.snap = null; return point; }
		const mode = modelSnapMode( config, event.ctrlKey );
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

				next.points.push( placement.point.toArray() );
				return [ next.points.length - 1 ];

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

	invertElementSelection() {

		this.applyElementSelection( selectionCandidates( this.data, this.selectionMode ), 'toggle' );

	}

	canFillSelection() {

		return this.data.kind === 'mesh' && this.indices.length >= 3 && this.selectedFace() < 0;

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

	get editingOutline() {

		return this.canEdit() && [ 'path', 'shape' ].includes( this.data?.kind ) &&
			! this.brush && ! this.pen && ! this.knife && ! this.drag && ! this.gesture;

	}

	insertOutlinePoint( after, point ) {

		this.edit( 'Insert outline point', data => [ insertContourPoint( data.points, after, point ) ] );

	}

	insertAfterSelectedPoint() {

		if ( ! this.editingOutline || this.indices.length !== 1 ) return;
		const { points } = this.data;
		const index = this.indices[ 0 ];
		const point = points[ index ];
		const following = isClosedOutline( this.data ) ? points[ ( index + 1 ) % points.length ] : points[ index + 1 ];
		let next = [ point[ 0 ] + .5, ...point.slice( 1 ) ];
		if ( following ) next = interpolatePoint( point, following, .5 );
		else if ( points[ index - 1 ] ) next = interpolatePoint( point, points[ index - 1 ], -.5 );
		this.insertOutlinePoint( index, next );

	}

	toggleOutlineSmoothing() {

		if ( ! this.editingOutline || this.data.points.length < 3 ) return;
		this.edit( this.data.smooth ? 'Straighten outline segments' : 'Smooth outline', data => { data.smooth = ! data.smooth; } );

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
			if ( hitZ !== undefined && ! face.face.includes( a ) && ! face.face.includes( b ) &&
				along.clone().applyMatrix4( localToView ).z < hitZ - Math.abs( hitZ ) * .018 ) continue;
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

				if ( performance.now() - drag.downAt > 450 ) this.edit( 'Dissolve mesh edge', data => { if ( ! dissolveEdge( data, [ drag.edge.a, drag.edge.b ] ) ) data.faces = data.faces.filter( face => ! face.includes( drag.edge.a ) || ! face.includes( drag.edge.b ) ); return []; } );
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

	editContourAtPointer( event ) {

		if ( ! this.canEdit() || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey ||
			this.editor.viewTools?.mode || this.editor.editWorkspace?.exclusive || this.drag || this.gesture ||
			event.target !== this.editor.renderer?.domElement || this.editor.viewLayout.at( event.clientX, event.clientY ) !== this.editor.viewLayout.navigation ) return;
		const { left, top, width, height } = this.rect();
		const cursor = [ event.clientX - left, event.clientY - top ];
		const handle = this.pointUnder( ...cursor );
		if ( handle === 0 && this.canCloseProfile() ) {

			event.preventDefault();
			event.stopImmediatePropagation();
			this.editor.viewTools.run( () => this.closeProfile() );
			return;

		}
		if ( handle >= 0 || this.adding || ! this.editingOutline ) return;
		const closed = isClosedOutline( this.data );
		const samples = outlinePoints( THREE, this.data );
		const hit = nearestContourEdge( samples.map( point => this.project( point.toArray(), width, height ) ), closed, cursor, 10 );
		if ( ! hit ) return;
		const a = samples[ hit.index ], b = samples[ hit.next ];
		let fraction = hit.fraction;
		const camera = this.frame.camera;
		if ( camera.isPerspectiveCamera ) {

			const toCamera = new THREE.Matrix4().multiplyMatrices( camera.matrixWorldInverse, this.object.matrixWorld );
			const aDepth = - a.clone().applyMatrix4( toCamera ).z, bDepth = - b.clone().applyMatrix4( toCamera ).z;
			fraction = fraction * aDepth / ( ( 1 - fraction ) * bDepth + fraction * aDepth );

		}
		const edgeCount = contourEdgeCount( this.data.points, closed );
		const parameter = ( hit.index + fraction ) / contourEdgeCount( samples, closed ) * edgeCount;
		if ( Math.abs( parameter - Math.round( parameter ) ) < 1e-6 ) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		this.editor.viewTools.run( () => this.insertOutlinePoint( Math.floor( parameter ), interpolatePoint( a.toArray(), b.toArray(), fraction ) ) );

	}

	pointerDown( event ) {

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
		if ( ! this.pen && ! this.adding && ! this.brush ) {

			// Geometry picks take precedence over large transform gizmo planes.
			const rect = this.rect();
			const onGeometry = this.selectionMode === 'vertex' ? this.pointUnder( event.clientX - rect.left, event.clientY - rect.top ) >= 0 : this.selectionMode === 'edge' ? !! this.penHit( event ).edge : !! this.faceHit( event );
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
			if ( ! this.indices.includes( hit ) ) this.indices = [ hit ];

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

			const { width, height } = this.rect();
			const pixels = this.data.points.map( point => this.project( point, width, height ) );
			const view = this.frame.camera.getWorldDirection( new THREE.Vector3() );
			const origin = this.object.getWorldPosition( new THREE.Vector3() );
			this.pointerWorld( event.clientX, event.clientY, new THREE.Plane().setFromNormalAndCoplanarPoint( view, origin ) );
			const hit = this.object.isMesh && this.ray.intersectObject( this.object, false )[ 0 ];
			if ( ! hit && ! pixels.some( p => p && Math.hypot( p[ 0 ] - cursor[ 0 ], p[ 1 ] - cursor[ 1 ] ) < this.brushRadius ) ) return;
			stroke.plane = new THREE.Plane().setFromNormalAndCoplanarPoint( view, hit?.point || origin );
			stroke.neighbors = sculptNeighbors( this.data, this.object.geometry );
			stroke.normals = this.sculptNormals();
			stroke.last = cursor;
			stroke.pixels = pixels;

		}
		event.preventDefault();
		event.stopImmediatePropagation();
		this.drag = stroke;
		if ( event.ctrlKey && brush !== 'freehand' ) this.editor.suppressContextMenuUntil = performance.now() + 500;
		event.target.setPointerCapture( event.pointerId );
		if ( brush !== 'freehand' && brush !== 'grab' ) this.moveBrush( event, stroke );

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
			const grab = tool === 'grab';
			const points = grab ? this.data.points : stroke.draft?.points || this.data.points;
			const { width, height } = this.rect();
			const pixels = grab ? stroke.pixels : points.map( point => this.project( point, width, height ) );
			const pressure = event.pointerType === 'pen' ? event.pressure || .5 : 1;
			const strength = this.brushStrength * pressure;
			const step = cursor.map( ( value, axis ) => value - ( grab ? stroke.cursor : stroke.last )[ axis ] );
			const invert = event.ctrlKey ? -1 : 1;
			const movement = ! [ 'smooth', 'relax' ].includes( tool ) && ( ( point, pixel, weight ) => {

				let offset = step.map( value => value * weight );
				if ( tool === 'pinch' ) offset = cursor.map( ( value, axis ) => ( value - pixel[ axis ] ) * weight * invert * .18 );
				if ( tool === 'twist' ) {

					const angle = invert * weight * .035 * ( Math.hypot( ...step ) + 2 );
					const x = pixel[ 0 ] - cursor[ 0 ], y = pixel[ 1 ] - cursor[ 1 ];
					offset = [ x * ( Math.cos( angle ) - 1 ) - y * Math.sin( angle ), y * ( Math.cos( angle ) - 1 ) + x * Math.sin( angle ) ];

				}
				const a = this.pointerWorld( left + pixel[ 0 ], top + pixel[ 1 ], stroke.plane );
				const b = this.pointerWorld( left + pixel[ 0 ] + offset[ 0 ], top + pixel[ 1 ] + offset[ 1 ], stroke.plane );
				if ( ! a || ! b ) return point;
				const delta = this.object.worldToLocal( b ).sub( this.object.worldToLocal( a ) );
				return new THREE.Vector3( ...point ).add( delta ).toArray();

			} );
			const next = sculptPoints( points, pixels, grab ? stroke.cursor : cursor, this.brushRadius, strength,
				{ tool, move: movement, neighbors: stroke.neighbors, normals: stroke.normals } );
			if ( this.planar ) for ( const [ index, point ] of next.entries() ) if ( point !== points[ index ] ) point[ 2 ] = 0;
			this.preview( stroke, next );
			stroke.last = cursor;

		}
		this.render();

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
			if ( this.brush && this.object ) this.draw();
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
		if ( ! keepGeometry ) drag?.geometry?.dispose();
		if ( drag?.target.hasPointerCapture( drag.id ) ) drag.target.releasePointerCapture( drag.id );
		return drag;

	}

	pointerEnd( event, cancel = false ) {

		if ( this.drag?.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		const drag = this.releaseDrag( true );
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
		const changed = drag.brush === 'freehand' ? drag.draft?.points.length >= 2 : drag.brush ? drag.draft?.points.some( ( point, index ) =>
			point.some( ( value, axis ) => value !== this.data.points[ index ]?.[ axis ] ) ) : drag.draft && this.pointsChanged( drag );
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
			this.commit( drag.brush === 'freehand' ? 'Draw freehand path' : drag.brush ? 'Sculpt mesh' : 'Move modeling points',
				drag.draft, this.indices, drag.geometry );

		}
		else {

			drag.geometry?.dispose();
			this.changed();
			this.render();

		}

	}

}
