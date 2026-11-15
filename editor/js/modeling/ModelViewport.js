import * as THREE from 'three';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';
import { meshHit } from './SurfacePicking.js';
import { modelGeometry, modelObject, outlinePoints, removePoints } from './ModelGeometry.js';

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
		this.ray = new THREE.Raycaster();
		this.overlay = document.createElement( 'canvas' );
		this.overlay.className = 'modeling-overlay';
		this.overlay.setAttribute( 'aria-hidden', 'true' );
		this.overlay.hidden = true;
		viewport.append( this.overlay );
		this.context = this.overlay.getContext( '2d' );

		viewport.addEventListener( 'pointerdown', event => this.pointerDown( event ), true );
		viewport.addEventListener( 'pointermove', event => this.pointerMove( event ), true );
		viewport.addEventListener( 'pointerup', event => this.pointerEnd( event ), true );
		viewport.addEventListener( 'pointercancel', event => this.pointerEnd( event, true ), true );
		viewport.addEventListener( 'lostpointercapture', event => this.pointerEnd( event, true ), true );
		for ( const type of [ 'mousedown', 'mouseup', 'dblclick', 'touchstart', 'touchend' ] ) viewport.addEventListener( type, event => {

			if ( this.object && event.target === editor.renderer?.domElement ) event.stopImmediatePropagation();

		}, true );

		const { signals } = editor;
		signals.sceneRendered.add( () => this.draw() );
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

			if ( ! this.object ) return;
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
		this.snap = false;
		this.overlay.hidden = false;
		this.changed();
		this.render();

	}

	stop() {

		if ( ! this.object ) return;
		this.releaseDrag();
		this.object = this.data = null;
		this.indices = [];
		this.overlay.hidden = true;
		this.changed();
		this.render();

	}

	changed() {

		this.onChange?.();

	}

	edit( name, mutate ) {

		if ( ! this.canEdit() ) return;
		const data = structuredClone( this.data );
		const indices = mutate( data );
		this.commit( name, data, Array.isArray( indices ) ? indices : this.indices );

	}

	commit( name, data, indices ) {

		const object = this.object;
		let geometry;
		if ( data.kind === 'vertices' ) {

			geometry = new THREE.BufferGeometry().copy( object.geometry );
			const position = new THREE.Float32BufferAttribute( new Float32Array( geometry.attributes.position.count * 3 ), 3 );
			data.points.forEach( ( point, i ) => {

				for ( const index of data.vertices[ i ] ) position.setXYZ( index, ...point );

			} );
			geometry.setAttribute( 'position', position );
			geometry.computeVertexNormals();
			geometry.computeBoundingBox();
			geometry.userData = { ...geometry.userData, modeling: { kind: 'vertices' } };

		} else {

			geometry = modelGeometry( THREE, data );

		}
		this.indices = indices;
		const command = new SetGeometryCommand( this.editor, object, geometry );
		command.updatable = false;
		this.editor.execute( command, name );

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
		const data = this.drag?.draft || this.data;
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

	pointerPoint( x, y, plane, snap ) {

		const rect = this.rect();
		const cursor = new THREE.Vector2( ( x - rect.left ) * 2 / rect.width - 1, 1 - ( y - rect.top ) * 2 / rect.height );
		const camera = this.frame.camera;
		this.ray.setFromCamera( cursor, camera );
		if ( snap ) {

			const hit = meshHit( this.ray, this.editor.scene, this.object );
			return hit ? this.object.worldToLocal( hit.point ) : null;

		}
		const point = this.ray.ray.intersectPlane( plane, new THREE.Vector3() );
		return point && this.object.worldToLocal( point );

	}

	pointerDown( event ) {

		if ( ! this.canEdit() || this.drag || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.target !== this.editor.renderer?.domElement ) return;
		if ( this.editor.viewLayout.at( event.clientX, event.clientY ) !== this.frame ) return;
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
		const data = this.data;
		const planar = data.kind === 'shape' || data.planar;
		const origin = this.object.localToWorld( new THREE.Vector3( ...( data.points[ hit ] || [ 0, 0, 0 ] ) ) );
		const normal = hit < 0 || planar ?
			new THREE.Vector3( 0, 0, 1 ).applyNormalMatrix( new THREE.Matrix3().getNormalMatrix( this.object.matrixWorld ) ) :
			this.frame.camera.getWorldDirection( new THREE.Vector3() );
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint( normal, origin );
		const start = this.pointerPoint( event.clientX, event.clientY, plane, hit < 0 && this.snap && ! planar );
		if ( ! start ) { this.changed(); this.draw(); return; }
		if ( hit < 0 ) {

			if ( ! this.adding ) return;
			this.edit( 'Add modeling point', next => {

				if ( planar ) start.z = 0;
				next.points.push( start.toArray() );
				return [ next.points.length - 1 ];

			} );
			return;

		}
		this.drag = { target: event.target, id: event.pointerId, start, plane, draft: null };
		event.target.setPointerCapture( event.pointerId );
		this.changed();
		this.draw();

	}

	pointerMove( event ) {

		const drag = this.drag;
		if ( ! drag || drag.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		const point = this.pointerPoint( event.clientX, event.clientY, drag.plane, false );
		if ( ! point ) return;
		const delta = point.sub( drag.start );
		drag.draft = { ...this.data, points: this.data.points.slice() };
		for ( const index of this.indices ) {

			const position = drag.draft.points[ index ];
			drag.draft.points[ index ] = position.map( ( value, axis ) => value + delta.getComponent( axis ) );
			if ( this.data.kind === 'shape' || this.data.planar ) drag.draft.points[ index ][ 2 ] = 0;

		}
		this.draw();

	}

	releaseDrag() {

		const drag = this.drag;
		this.drag = null;
		if ( drag?.target.hasPointerCapture( drag.id ) ) drag.target.releasePointerCapture( drag.id );
		return drag;

	}

	pointerEnd( event, cancel = false ) {

		if ( this.drag?.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		const drag = this.releaseDrag();
		if ( ! cancel && drag.draft && this.canEdit() ) this.commit( 'Move modeling points', drag.draft, this.indices );
		else this.draw();

	}

}
