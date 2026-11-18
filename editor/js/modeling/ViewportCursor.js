import { Plane, Raycaster, Vector3 } from 'three';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { SetPositionCommand } from '../commands/SetPositionCommand.js';
import { meshHit, rayToView } from './SurfacePicking.js?v=local-view';

export class ViewportCursor {

	constructor( editor, viewport, layout ) {

		Object.assign( this, { editor, viewport, layout, markers: [] } );
		viewport.addEventListener( 'pointerdown', event => {

			const shortcut = event.shiftKey && event.button === 2;
			if ( ! shortcut && ! ( this.tool && event.button === 0 && ! event.altKey ) ) return;
			if ( ! this.available || event.target !== editor.renderer?.domElement ) return;
			const frame = layout.at( event.clientX, event.clientY );
			if ( ! frame?.director || ! this.place( frame, event ) ) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if ( shortcut ) editor.suppressContextMenuUntil = performance.now() + 500;

		}, true );
		viewport.addEventListener( 'mousedown', event => {

			if ( this.tool && event.button === 0 && ! event.altKey && event.target === editor.renderer?.domElement &&
				layout.at( event.clientX, event.clientY )?.director ) event.stopImmediatePropagation();

		}, true );
		editor.signals.startPlayer.add( () => { this.tool = false; } );
		editor.signals.editorCleared.add( () => { this.tool = false; } );

	}

	get available() {

		const e = this.editor, mode = e.viewTools?.workspaceMode;
		return ( mode === 'object' || mode === 'edit' ) && ! e.viewTools.mode && ! e.editWorkspace?.exclusive &&
			! e.modalTransform?.active && ! e.flyControls?.active && ! e.modeling?.drag && ! e.modeling?.gesture &&
			! e.objectSelection?.drag && ! e.viewTools?.pointer && this.layout.frames.some( frame => frame.director );

	}

	place( frame, event ) {

		const e = this.editor;
		const ray = rayToView( new Raycaster(), this.layout, frame, event.clientX, event.clientY );
		const hit = meshHit( ray, e.scene, undefined, object => e.viewportVisibility.allows( object, frame ) );
		const plane = new Plane().setFromNormalAndCoplanarPoint( frame.camera.getWorldDirection( new Vector3() ), e.cursor3D );
		const point = hit?.point || ray.ray.intersectPlane( plane, new Vector3() );
		if ( ! point ) return false;
		e.setCursor3D( point );
		return true;

	}

	objects() {

		const e = this.editor;
		return e.selector.selection.filter( object => object.parent && object !== e.camera && isVisible( object ) &&
			e.viewportVisibility.allows( object, this.layout.navigation ) );

	}

	center() {

		const { modeling } = this.editor;
		const center = new Vector3();
		const point = new Vector3();
		if ( modeling.editMode ) {

			if ( ! modeling.canEdit() || ! modeling.indices.length ) return;
			for ( const index of modeling.indices ) center.add( modeling.object.localToWorld( point.fromArray( modeling.data.points[ index ] ) ) );
			return center.divideScalar( modeling.indices.length );

		}
		const selection = this.objects();
		if ( ! selection.length ) return;
		for ( const object of selection ) center.add( object.getWorldPosition( point ) );
		return center.divideScalar( selection.length );

	}

	canSnapSelection() {

		const { modeling } = this.editor;
		if ( modeling.editMode ) return modeling.canEdit() && !! modeling.indices.length;
		const objects = this.objects();
		return objects.length > 0 && objects.every( item => ! hasRestriction( item, 'locked' ) );

	}

	snapSelection() {

		const e = this.editor;
		if ( ! this.canSnapSelection() ) return;
		const center = this.center();
		const model = e.modeling;
		if ( model.editMode ) {

			const target = model.object.worldToLocal( e.cursor3D.clone() );
			if ( model.planar ) target.z = 0;
			const delta = target.sub( model.object.worldToLocal( center ) ).toArray();
			model.edit( 'Snap points to 3D cursor', data => {

				for ( const index of model.indices ) data.points[ index ] = data.points[ index ].map( ( value, axis ) => value + delta[ axis ] );

			} );
			return;

		}
		const delta = e.cursor3D.clone().sub( center );
		if ( ! delta.lengthSq() ) return;
		const members = e.selector.selectionRoots( this.objects() );
		const commands = members.map( object => new SetPositionCommand( e, object,
			object.parent.worldToLocal( object.getWorldPosition( new Vector3() ).add( delta ) ) ) );
		e.execute( new MultiCmdsCommand( e, commands ), 'Snap selection to 3D cursor' );

	}

	draw( frames ) {

		const e = this.editor;
		let index = 0;
		if ( e.viewportShading !== 'preview' && ! e.renderer.xr.isPresenting ) for ( const { camera, rect, director } of frames ) {

			if ( ! director ) continue;
			const point = e.cursor3D.clone().project( camera );
			if ( ! Number.isFinite( point.z ) || point.z < - 1 || point.z > 1 || Math.abs( point.x ) > 1 || Math.abs( point.y ) > 1 ) continue;
			let marker = this.markers[ index ++ ];
			if ( ! marker ) {

				marker = document.createElement( 'div' );
				marker.className = 'viewport-cursor-3d';
				marker.setAttribute( 'aria-hidden', 'true' );
				this.viewport.append( marker );
				this.markers.push( marker );

			}
			marker.hidden = false;
			marker.style.left = rect.x + ( point.x + 1 ) * rect.width / 2 + 'px';
			marker.style.top = rect.y + ( 1 - point.y ) * rect.height / 2 + 'px';

		}
		for ( let i = index; i < this.markers.length; i ++ ) this.markers[ i ].hidden = true;

	}

}
