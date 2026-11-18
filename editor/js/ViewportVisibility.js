import { SetViewportHiddenCommand } from './commands/SetViewportHiddenCommand.js';
import { isVisible, registerViewportVisibility } from './ObjectRestrictions.js';

// Editor-only state. The player's and exporter's scene visibility comes from
// Object3D.visible and the authored object restrictions.
export class ViewportVisibility {

	constructor( editor ) {

		this.editor = editor;
		this.hidden = new Set();
		this.local = null;
		registerViewportVisibility( editor.scene, this );
		editor.signals.objectAdded.add( object => {

			if ( this.local ) this.local.objects.add( object );

		} );

	}

	inLocalView( object ) {

		if ( ! this.local || object === this.editor.scene ) return true;
		const roots = this.local.objects;
		for ( let node = object; node; node = node.parent ) if ( roots.has( node ) ) return true;
		for ( const root of roots ) {

			for ( let node = root.parent; node; node = node.parent ) if ( node === object ) return true;

		}
		return false;

	}

	isHidden( object ) {

		for ( let node = object; node; node = node.parent ) if ( this.hidden.has( node.uuid ) ) return true;
		return false;

	}

	allows( object ) {

		return ! this.isHidden( object ) && this.inLocalView( object );

	}

	setHidden( uuids ) {

		this.hidden = new Set( uuids );
		const editor = this.editor;
		const selection = editor.selector.selection;
		const visibleSelection = selection.filter( object => this.allows( object ) );
		if ( visibleSelection.length < selection.length ) editor.selector.setSelection( visibleSelection );
		editor.signals.viewportVisibilityChanged.dispatch();

	}

	changeHidden( label, hidden, selection ) {

		const uuids = [ ...hidden ];
		if ( uuids.length === this.hidden.size && uuids.every( id => this.hidden.has( id ) ) ) return;
		this.editor.execute( new SetViewportHiddenCommand( this.editor, uuids, selection ), label );

	}

	hide( unselected = false ) {

		const editor = this.editor;
		const hidden = new Set( this.hidden );
		const selection = editor.selector.selection.filter( object => object !== editor.scene && object !== editor.camera );
		if ( ! selection.length ) return;
		if ( ! unselected ) {

			for ( const object of selection ) hidden.add( object.uuid );

		} else {

			const related = new Set();
			for ( const object of selection ) {

				for ( let parent = object.parent; parent; parent = parent.parent ) related.add( parent );
				object.traverse( child => related.add( child ) );

			}
			const visit = object => {
				if ( ! object.visible || ! this.allows( object ) || object.userData.runtimeOnly ) return;
				if ( ! related.has( object ) ) hidden.add( object.uuid );
				else for ( const child of object.children ) visit( child );
			};
			for ( const child of editor.scene.children ) visit( child );

		}
		this.changeHidden( unselected ? 'Hide unselected in viewport' : 'Hide selected in viewport', hidden );

	}

	reveal() {

		const editor = this.editor;
		const revealed = [ ...this.hidden ].map( uuid => editor.objectByUuid( uuid ) ).filter( object => object && this.inLocalView( object ) );
		const selectable = revealed.filter( object => {

			for ( let parent = object; parent; parent = parent.parent ) {

				const flags = parent.userData?.threeditor;
				if ( ! parent.visible || flags?.disabled || flags?.unselectable ) return false;

			}
			return true;

		} );
		const hidden = new Set( this.hidden );
		for ( const object of revealed ) hidden.delete( object.uuid );
		this.changeHidden( 'Reveal in viewport', hidden, [ ...new Set( [ ...editor.selector.selection, ...selectable ] ) ] );

	}

	toggleLocal() {

		const editor = this.editor;
		if ( this.local ) this.local = null;
		else {

			const selected = editor.selector.selection.filter( object => object !== editor.scene && object !== editor.camera && isVisible( object ) );
			if ( ! selected.length ) return;
			this.local = { objects: new Set( selected ) };

		}
		editor.signals.viewportVisibilityChanged.dispatch();

	}

}
