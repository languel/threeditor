import { Command } from '../Command.js';
import { MultiCmdsCommand } from './MultiCmdsCommand.js';

export class AddMeshPrimitiveCommand extends Command {

	constructor( editor, object = null, commands = [], before = null, after = null ) {

		super( editor );
		this.type = 'AddMeshPrimitiveCommand';
		this.batch = new MultiCmdsCommand( editor, commands );
		this.object = object;
		this.before = before;
		this.after = after;

	}

	execute() {

		this.batch.execute();
		this.restoreSelection( this.after );

	}

	replaceResult( commands, selection ) {

		this.batch.cmdArray = commands;
		this.after = selection;
		this.execute();

	}

	undo() {

		this.batch.undo();
		this.restoreSelection( this.before );

	}

	restoreSelection( selection ) {

		const model = this.editor.modeling;
		if ( model.editMode && model.object === this.object ) model.restorePointSelection( selection );

	}

	toJSON() {

		return { ...super.toJSON(), cmds: this.batch.toJSON().cmds, objectUuid: this.object.uuid, before: this.before, after: this.after };

	}

	fromJSON( json ) {

		super.fromJSON( json );
		this.batch.fromJSON( { ...json, type: 'MultiCmdsCommand' } );
		this.object = this.editor.objectByUuid( json.objectUuid );
		this.before = json.before;
		this.after = json.after;

	}

}
