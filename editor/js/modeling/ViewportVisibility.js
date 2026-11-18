import { isVisible } from '../ObjectRestrictions.js';

// Session-only visibility for Director panes. Saved visibility and optical
// previews keep using the scene's authored state.
export class ViewportVisibility {

	constructor( editor, changed ) {

		this.editor = editor;
		this.changed = changed;
		this.hidden = new Set();
		this.ancestors = new Set();
		for ( const name of [ 'editorCleared', 'projectLoaded' ] ) editor.signals[ name ].add( () => this.reset() );
		editor.signals.sceneGraphChanged.add( () => this.refresh() );
		editor.signals.objectAdded.add( object => {

			if ( ! this.allows( object ) ) {

				this.local?.add( object );
				this.only?.add( object );

			}

		} );

	}

	get active() {

		return Boolean( this.local || this.only || this.hidden.size );

	}

	selected() {

		return this.editor.selector.selection.filter( object => object.parent && object !== this.editor.camera && isVisible( object ) && this.allows( object ) );

	}

	toggleLocal() {

		const selected = this.selected();
		if ( ! this.local && ! selected.length ) return;
		this.local = this.local ? null : new Set( selected );
		this.update();

	}

	hideSelection( others = false ) {

		const selected = this.selected();
		if ( ! selected.length ) return;
		if ( others ) this.only = new Set( selected );
		else for ( const object of selected ) this.hidden.add( object );
		this.refresh();
		this.editor.selector.setSelection( selected.filter( object => this.allows( object ) ) );
		this.changed();

	}

	reveal() {

		this.hidden.clear();
		this.only = null;
		this.update();

	}

	reset() {

		if ( ! this.active ) return;
		this.local = null;
		this.reveal();

	}

	update() {

		this.refresh();
		this.changed();

	}

	allows( object, frame ) {

		if ( ! this.active || frame && ! frame.director ) return true;
		let inLocal = ! this.local, inOnly = ! this.only;
		for ( let parent = object; parent; parent = parent.parent ) {

			if ( this.hidden.has( parent ) ) return false;
			inLocal ||= this.local?.has( parent );
			inOnly ||= this.only?.has( parent );

		}
		return !! ( inLocal && inOnly );

	}

	refresh() {

		this.ancestors.clear();
		if ( ! this.active ) return;
		// Clear stale references after deletes, scene replacement or moves.
		const scene = this.editor.scene;
		for ( const set of [ this.hidden, this.local, this.only ] ) {

			if ( ! set ) continue;
			for ( const object of set ) {

				let root = object;
				while ( root.parent && root !== scene ) root = root.parent;
				if ( root !== scene ) set.delete( object );

			}

		}
		if ( this.local?.size === 0 ) this.local = null;
		if ( this.only?.size === 0 ) this.only = null;
		for ( const object of [ ... ( this.local || [] ), ... ( this.only || [] ) ] ) if ( this.allows( object ) ) {

			for ( let parent = object.parent; parent && parent !== scene; parent = parent.parent ) this.ancestors.add( parent );

		}

	}

	draw( frame, callback ) {

		if ( ! frame.director || ! this.active ) return callback();
		const hidden = [], layers = [];
		const visit = object => {

			if ( ! object.visible ) return;
			if ( ! this.allows( object ) ) {

				if ( ! this.ancestors.has( object ) ) {

					hidden.push( object );
					object.visible = false;
					return;

				}
				// A selected child may need the ancestor's transform without
				// the ancestor's own surface, helper or light in the view.
				layers.push( [ object, object.layers.mask ] );
				object.layers.mask = 0;

			}
			for ( const child of object.children ) visit( child );

		};
		try {

			for ( const child of this.editor.scene.children ) visit( child );
			for ( const child of Object.values( this.editor.helpers ) ) {

				const object = child.userData.object || child.children.find( node => node.name === 'picker' )?.userData.object ||
					child.object || child.light || child.camera;
				if ( child.visible && object && ! this.allows( object ) ) {

					hidden.push( child );
					child.visible = false;

				}

			}
			return callback();

		} finally {

			for ( const object of hidden ) object.visible = true;
			for ( const [ object, mask ] of layers ) object.layers.mask = mask;

		}

	}

}
