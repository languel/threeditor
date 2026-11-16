import * as THREE from 'three';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';
import { modelSnapMode, snapIncrement, snapMeshFeature } from './ModelSnap.js';
import { modelGeometry, modelObject, outlinePoints, removePoints } from './ModelGeometry.js';


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
		this.proxy = new THREE.Object3D();
		this.proxy.name = 'Modeling pivot';
		this.ray = new THREE.Raycaster();
		this.overlay = document.createElement( 'canvas' );
		this.overlay.className = 'modeling-overlay';
		this.overlay.setAttribute( 'aria-hidden', 'true' );
		this.overlay.hidden = true;
		viewport.append( this.overlay );
		this.context = this.overlay.getContext( '2d' );

		viewport.addEventListener( 'pointerdown', event => this.pointerDown( event ), true );
		viewport.addEventListener( 'pointermove', event => this.pointerMove( event ), true );
		viewport.addEventListener( 'pointerleave', () => {

			if ( ! this.placementSnap ) return;
			this.placementSnap = null;
			this.draw();

		} );
		viewport.addEventListener( 'pointerup', event => this.pointerEnd( event ), true );
		viewport.addEventListener( 'pointercancel', event => this.pointerEnd( event, true ), true );
		viewport.addEventListener( 'lostpointercapture', event => this.pointerEnd( event, true ), true );
		for ( const type of [ 'mousedown', 'mouseup', 'dblclick', 'touchstart', 'touchend' ] ) viewport.addEventListener( type, event => {

			if ( this.object && event.target === editor.renderer?.domElement ) event.stopImmediatePropagation();

		}, true );

		const { signals } = editor;
		signals.sceneRendered.add( () => this.draw() );
		signals.transformSettingsChanged.add( () => { if ( this.object && ! this.gesture ) this.changed(); } );
		window.addEventListener( 'pointermove', event => {
			this.lastPointer = event;
			if ( this.gesture?.modal ) this.updateModal( event );
		}, true );
		window.addEventListener( 'pointerdown', event => {

			if ( ! this.gesture?.modal || ! [ 0, 2 ].includes( event.button ) ) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if ( event.button === 2 ) editor.suppressContextMenuUntil = performance.now() + 500;
			this.finishTransform( event.button === 0 );

		}, true );
		signals.geometryChanged.add( object => {

			if ( this.object !== object ) return;
			this.data = this.read( object );
			this.indices = this.indices.filter( index => index < this.data.points.length );
			this.changed();

		} );
		signals.objectSelected.add( object => { if ( object !== this.object ) this.stop(); } );
		signals.objectChanged.add( () => { if ( this.object && ! this.canEdit() ) this.stop(); } );
		signals.startPlayer.add( () => this.stop() );
		signals.editorCleared.add( () => this.stop() );
		window.addEventListener( 'keydown', event => {

			if ( ! this.object || document.querySelector( 'dialog[open]' ) ) return;
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
			const deleting = [ 'Delete', 'Backspace' ].includes( event.key ) && ! event.target.closest?.( 'input, textarea, select, [contenteditable]' );
			if ( event.key !== 'Escape' && ! deleting ) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if ( event.key === 'Escape' ) this.stop();
			else if ( this.data.kind !== 'vertices' && this.indices.length ) this.edit( 'Remove modeling points', next => {

				removePoints( next, this.indices );
				return [];

			} );

		}, true );

	}

	read( object ) {

		const data = object.geometry.userData.modeling;
		if ( data && data.kind !== 'vertices' ) return structuredClone( data );
		const position = object.geometry.attributes.position;
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
		return { kind: 'vertices', points, vertices };

	}

	canEdit() {

		return this.object && isVisible( this.object ) && ! hasRestriction( this.object, 'locked' );

	}

	start( object ) {

		if ( ! object?.geometry?.userData.modeling && ! editableMesh( object ) ) return;
		if ( ! object.geometry.userData.modeling?.points && object.geometry.attributes.position.count > 20000 ) throw new Error( 'Vertex editing supports meshes with up to 20,000 buffer vertices.' );
		if ( this.editor.viewTools?.mode ) this.editor.viewTools.setMode( '' );
		this.object = object;
		if ( ! this.canEdit() ) { this.object = null; return; }
		this.data = this.read( object );
		this.indices = [];
		this.adding = false;
		this.overlay.hidden = false;
		this.changed();
		this.render();

	}

	stop() {

		if ( ! this.object ) return;
		this.releaseDrag();
		if ( this.gesture?.modal ) this.finishTransform( false );
		else if ( this.gesture ) this.cancelGizmo?.();
		this.object = this.data = null;
		this.indices = [];
		this.overlay.hidden = true;
		this.changed();
		this.render();

	}

	changed() {

		this.placementSnap = null;
		if ( this.canEdit() && this.indices.length && ! this.gesture && ! this.drag ) this.updateProxy();
		this.onSelectionChange?.();
		this.onChange?.();

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

			geometry = reusable || new THREE.BufferGeometry().copy( object.geometry );
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

		const geometry = ( this.gesture || this.drag )?.geometry;
		if ( ! geometry || ! this.object ) return draw();
		const object = this.object, original = object.geometry;
		object.geometry = geometry;
		try { return draw(); }
		finally { object.geometry = original; }

	}

	get planar() {

		return this.data?.kind === 'shape' || Boolean( this.data?.planar );

	}

	updateProxy() {

		const object = this.object;
		object.updateWorldMatrix( true, false );
		const points = this.indices.map( index => object.localToWorld( new THREE.Vector3( ...this.data.points[ index ] ) ) );
		const config = this.editor.config;
		const pivot = config.getKey( 'settings/transformPivot' );
		const center = this.proxy.position.set( 0, 0, 0 );
		if ( pivot === 'bounds' ) new THREE.Box3().setFromPoints( points ).getCenter( center );
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
		if ( accept && state.geometry && this.canEdit() && this.pointsChanged( state ) ) {

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

		const { mode, axis, numeric } = this.gesture;
		const name = { translate: 'Move points', rotate: 'Rotate points', scale: 'Scale points' }[ mode ];
		this.notice.textContent = [ name, axis, numeric, 'X/Y/Z axis · type a value · Enter accept · Esc cancel' ].filter( Boolean ).join( ' · ' );

	}

	modalKey( event ) {

		if ( [ 'Control', 'Shift', 'Alt', 'Meta' ].includes( event.key ) ) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		const state = this.gesture, key = event.key.toLowerCase();
		if ( key === 'enter' || key === 'escape' ) { this.finishTransform( key === 'enter' ); return; }
		if ( 'xyz'.includes( key ) && key.length === 1 ) {

			const axis = event.shiftKey && state.mode !== 'rotate' ? 'XYZ'.replace( key.toUpperCase(), '' ) : key.toUpperCase();
			state.axis = state.axis === axis ? '' : axis;

		} else if ( key === 'backspace' ) state.numeric = state.numeric.slice( 0, -1 );
		else if ( /^[-.0-9]$/.test( key ) ) state.numeric += key;
		this.labelModal();
		this.updateModal( this.lastPointer );

	}

	updateModal( pointer ) {

		const state = this.gesture;
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

	project( point, width, height ) {

		const camera = this.frame.camera;
		const projection = new THREE.Vector3( ...point ).applyMatrix4( this.object.matrixWorld );
		const depth = projection.clone().applyMatrix4( camera.matrixWorldInverse ).z;
		projection.project( camera );
		if ( depth >= 0 || ! Number.isFinite( projection.x ) ) return;
		return [ ( projection.x + 1 ) * width / 2, ( 1 - projection.y ) * height / 2 ];

	}

	draw() {

		if ( ! this.canEdit() || ! this.editor.renderer ) return;
		const { width, height, x, y } = this.rect();
		const bounds = this.editor.renderer.domElement.getBoundingClientRect();
		if ( ! width || ! height ) return;
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
		ctx.save();
		ctx.translate( x, y );
		ctx.beginPath();
		ctx.rect( 0, 0, width, height );
		ctx.clip();
		const state = this.gesture || this.drag;
		const data = state?.draft || this.data;
		const handles = data.points.map( point => this.project( point, width, height ) );
		this.handles = handles;
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

			data.faces.forEach( face => stroke( face.map( index => handles[ index ] ), true ) );

		} else if ( data.kind !== 'vertices' ) {

			const points = outlinePoints( THREE, data );
			stroke( points.map( point => this.project( point.toArray(), width, height ) ), data.kind === 'shape' || data.closed );

		}
		if ( this.indices.length > 1 ) {

			ctx.strokeStyle = '#ffba62';
			stroke( this.indices.map( index => handles[ index ] ), false );

		}
		const selected = new Set( this.indices );
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

			const point = this.project( this.object.worldToLocal( snap.clone() ).toArray(), width, height );
			if ( point ) {

				ctx.beginPath();
				ctx.rect( point[ 0 ] - 5, point[ 1 ] - 5, 10, 10 );
				ctx.strokeStyle = '#ffba62';
				ctx.lineWidth = 2;
				ctx.stroke();

			}

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
		right.addScaledVector( normal, - right.dot( normal ) ).normalize();
		return [ right, new THREE.Vector3().crossVectors( normal, right ).normalize() ];

	}

	placementPoint( event, state ) {

		const origin = this.object.getWorldPosition( new THREE.Vector3() );
		const normal = new THREE.Vector3( 0, 0, 1 ).applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( this.object.matrixWorld ) );
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint( normal, origin );
		const world = this.pointerWorld( event.clientX, event.clientY, plane );
		const axes = this.planar ? this.snapAxes( plane ) : worldAxes;
		const snapped = this.snapPoint( world, origin, event, axes, state );
		if ( ! snapped ) return null;
		const point = this.object.worldToLocal( snapped.clone() );
		if ( this.planar ) point.z = 0;
		return point;

	}

	pointerDown( event ) {

		if ( ! this.canEdit() || this.drag || event.button !== 0 || event.altKey || event.metaKey || event.target !== this.editor.renderer?.domElement ) return;
		if ( this.gesture || ! this.editor.viewLayout.navigation || this.editor.viewLayout.at( event.clientX, event.clientY ) !== this.frame ) return;
		this.lastPointer = event;
		if ( ! event.shiftKey && ! this.adding && this.gizmoUnderPointer?.( event ) ) return;
		const { left, top } = this.rect();
		const hit = this.pointUnder( event.clientX - left, event.clientY - top );
		if ( hit < 0 && ! this.adding && ! event.shiftKey ) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if ( hit >= 0 ) {

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
			const point = this.placementPoint( event, {} );
			if ( point ) this.edit( 'Add modeling point', next => {

				next.points.push( point.toArray() );
				return [ next.points.length - 1 ];

			} );
			return;

		}
		const origin = this.object.localToWorld( new THREE.Vector3( ...this.data.points[ hit ] ) );
		const normal = this.planar ?
			new THREE.Vector3( 0, 0, 1 ).applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( this.object.matrixWorld ) ) :
			this.frame.camera.getWorldDirection( new THREE.Vector3() );
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint( normal, origin );
		const world = this.pointerWorld( event.clientX, event.clientY, plane );
		if ( ! world ) { this.changed(); this.draw(); return; }
		this.drag = { target: event.target, id: event.pointerId, start: world, origin, plane };
		event.target.setPointerCapture( event.pointerId );
		this.changed();
		this.draw();

	}

	pointerMove( event ) {

		const drag = this.drag;
		if ( ! drag ) {

			if ( ! this.canEdit() || ! this.adding || this.gesture || ! this.editor.viewLayout.navigation ) return;
			const marker = {};
			if ( this.editor.viewLayout.at( event.clientX, event.clientY ) === this.frame && modelSnapMode( this.editor.config, event.ctrlKey ) ) {

				this.placementPoint( event, marker );

			}
			if ( marker.snap || this.placementSnap ) {

				this.placementSnap = marker.snap;
				this.draw();

			}
			return;

		}
		if ( drag.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		const point = this.pointerWorld( event.clientX, event.clientY, drag.plane );
		if ( ! point ) return;
		const target = point.sub( drag.start ).add( drag.origin );
		const axes = this.planar ? this.snapAxes( drag.plane ) : worldAxes;
		const snapped = this.snapPoint( target, drag.origin, event, axes, drag );
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
		if ( ! cancel && drag.geometry && this.canEdit() && this.pointsChanged( drag ) ) this.commit( 'Move modeling points', drag.draft, this.indices, drag.geometry );
		else {

			drag.geometry?.dispose();
			this.changed();
			this.render();

		}

	}

}
