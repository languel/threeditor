import { Vector3 } from 'three';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';
import { combineSelection, selectionRegionContains } from './MeshSelection.js?v=object-selection';

const regionTools = [ 'box', 'lasso', 'circle' ];

export class ObjectSelection {

	constructor( editor, viewport, layout, render ) {

		Object.assign( this, { editor, layout, render, tool: 'select', operation: 'set', radius: 50 } );
		this.canvas = document.createElement( 'canvas' );
		this.canvas.className = 'viewport-tool-overlay';
		this.canvas.setAttribute( 'aria-hidden', 'true' );
		this.canvas.hidden = true;
		viewport.append( this.canvas );
		viewport.addEventListener( 'mousedown', event => {

			if ( this.accepts( event ) ) event.stopImmediatePropagation();

		}, true );
		viewport.addEventListener( 'pointerdown', event => this.start( event ), true );
		viewport.addEventListener( 'pointermove', event => this.move( event ), true );
		viewport.addEventListener( 'pointerup', event => this.finish( event ), true );
		for ( const type of [ 'pointercancel', 'lostpointercapture' ] ) viewport.addEventListener( type, event => {

			if ( this.drag?.id === event.pointerId ) this.cancel();

		}, true );
		window.addEventListener( 'keydown', event => {

			if ( ! this.drag || event.key !== 'Escape' ) return;
			event.stopImmediatePropagation();
			event.preventDefault();
			this.cancel();

		}, true );
		for ( const name of [ 'startPlayer', 'editorCleared', 'projectLoaded', 'windowResize', 'viewportCameraChanged' ] ) {

			editor.signals[ name ].add( () => this.cancel() );

		}

	}

	accepts( event ) {

		const editor = this.editor;
		return regionTools.includes( this.tool ) && ! editor.viewTools.mode && editor.viewTools.workspaceMode === 'object' &&
			! editor.editWorkspace?.exclusive && ! editor.modalTransform?.active && ! editor.flyControls?.active &&
			event.button === 0 && ! event.altKey && event.pointerType !== 'touch' && event.target === editor.renderer?.domElement;

	}

	setTool( tool ) {

		this.cancel();
		this.tool = tool;

	}

	start( event ) {

		if ( this.drag || ! this.accepts( event ) ) return;
		const frame = this.layout.at( event.clientX, event.clientY );
		if ( ! frame ) return;
		const rect = this.layout.clientRect( frame );
		const start = [ event.clientX - rect.left, event.clientY - rect.top ];
		this.drag = { tool: this.tool, start, end: start, polygon: [ start ], rect, frame, target: event.target, id: event.pointerId,
			operation: event.ctrlKey ? 'subtract' : event.shiftKey ? 'extend' : this.operation };
		event.target.setPointerCapture( event.pointerId );
		event.preventDefault();
		event.stopImmediatePropagation();
		this.draw();

	}

	move( event ) {

		const drag = this.drag;
		if ( ! drag || drag.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		const { left, top, width, height } = drag.rect;
		drag.end = [ Math.min( width, Math.max( 0, event.clientX - left ) ), Math.min( height, Math.max( 0, event.clientY - top ) ) ];
		drag.polygon.push( drag.end );
		this.draw();

	}

	finish( event ) {

		const drag = this.drag;
		if ( ! drag || drag.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		this.move( event );
		this.cancel();
		const { width, height } = drag.rect;
		const camera = drag.frame.camera;
		const travel = drag.polygon.some( point => Math.hypot( point[ 0 ] - drag.start[ 0 ], point[ 1 ] - drag.start[ 1 ] ) >= 4 );
		let hits;
		if ( drag.tool !== 'circle' && ! travel ) {

			const [ x, y ] = drag.start;
			const hit = this.editor.selector.getPointerIntersects( { x: x / width, y: y / height }, camera )[ 0 ];
			const object = hit && ( hit.object.userData.object || hit.object );
			hits = object ? [ object ] : [];

		} else {

			const point = new Vector3();
			hits = this.candidates( drag.frame ).filter( object => {

				object.getWorldPosition( point ).project( camera );
				if ( point.z < - 1 || point.z > 1 || Math.abs( point.x ) > 1 || Math.abs( point.y ) > 1 ) return false;
				return selectionRegionContains( drag, [ ( point.x + 1 ) * width / 2, ( 1 - point.y ) * height / 2 ], this.radius );

			} );

		}
		this.apply( hits, drag.operation );

	}

	cancel() {

		const drag = this.drag;
		if ( ! drag ) return;
		this.drag = null;
		this.canvas.hidden = true;
		if ( drag.target.hasPointerCapture( drag.id ) ) drag.target.releasePointerCapture( drag.id );

	}

	candidates( frame = this.layout.navigation ) {

		const objects = [];
		const visibility = this.editor.viewportVisibility;
		function visit( parent ) {

			for ( const object of parent.children ) {

				if ( object.userData.runtimeOnly || ! isVisible( object ) || hasRestriction( object, 'unselectable' ) ) continue;
				if ( visibility.allows( object, frame ) ) objects.push( object );
				visit( object );

			}

		}
		visit( this.editor.scene );
		return objects;

	}

	apply( hits, operation ) {

		const selector = this.editor.selector;
		const byId = objects => new Map( objects.map( object => [ object.uuid, object ] ) );
		selector.setSelection( [ ...combineSelection( byId( selector.selection ), byId( hits ), operation ).values() ] );
		this.render();

	}

	draw() {

		const { rect, tool, start, end, polygon, target } = this.drag;
		const bounds = target.getBoundingClientRect();
		if ( this.canvas.width !== Math.round( bounds.width ) ) this.canvas.width = Math.round( bounds.width );
		if ( this.canvas.height !== Math.round( bounds.height ) ) this.canvas.height = Math.round( bounds.height );
		this.canvas.hidden = false;
		const ctx = this.canvas.getContext( '2d' );
		ctx.clearRect( 0, 0, this.canvas.width, this.canvas.height );
		ctx.save();
		ctx.translate( rect.left - bounds.left, rect.top - bounds.top );
		ctx.beginPath();
		ctx.rect( 0, 0, rect.width, rect.height );
		ctx.clip();
		ctx.strokeStyle = '#ffd481';
		ctx.fillStyle = '#ffd48122';
		ctx.beginPath();
		if ( tool === 'circle' ) {

			ctx.lineWidth = this.radius * 2;
			ctx.lineCap = ctx.lineJoin = 'round';
			ctx.strokeStyle = ctx.fillStyle;
			ctx.moveTo( ...start );
			for ( const point of polygon ) ctx.lineTo( ...point );
			ctx.stroke();
			ctx.lineWidth = 1;
			ctx.strokeStyle = '#ffd481';
			ctx.beginPath();
			ctx.arc( ...end, this.radius, 0, Math.PI * 2 );

		} else if ( tool === 'lasso' ) {

			ctx.moveTo( ...start );
			for ( const point of polygon ) ctx.lineTo( ...point );
			ctx.closePath();

		} else ctx.rect( ...start, end[ 0 ] - start[ 0 ], end[ 1 ] - start[ 1 ] );
		ctx.fill();
		ctx.stroke();
		ctx.restore();

	}

}
