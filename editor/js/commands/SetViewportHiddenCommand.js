import { Command } from '../Command.js';

export class SetViewportHiddenCommand extends Command {

	constructor( editor, hidden = [], selection ) {

		super( editor );
		this.type = 'SetViewportHiddenCommand';
		this.name = 'Viewport visibility';
		this.before = [ ...editor.viewportVisibility.hidden ];
		this.after = hidden;
		this.beforeSelection = editor.selector.selection.map( object => object.uuid );
		this.afterSelection = selection?.map( object => object.uuid );

	}

	execute() {

		this.editor.viewportVisibility.setHidden( this.after );
		if ( this.afterSelection ) this.select( this.afterSelection );
		else this.afterSelection = this.editor.selector.selection.map( object => object.uuid );

	}

	undo() {

		this.editor.viewportVisibility.setHidden( this.before );
		this.select( this.beforeSelection );

	}

	select( uuids ) {

		const { editor } = this;
		const state = editor.viewportVisibility;
		editor.selector.setSelection( uuids.map( uuid => editor.objectByUuid( uuid ) ).filter( object => object && state.allows( object ) ) );

	}

	toJSON() {

		return { ...super.toJSON(), before: this.before, after: this.after, beforeSelection: this.beforeSelection, afterSelection: this.afterSelection };

	}

	fromJSON( json ) {

		super.fromJSON( json );
		this.before = json.before;
		this.after = json.after;
		this.beforeSelection = json.beforeSelection;
		this.afterSelection = json.afterSelection;

	}

}
