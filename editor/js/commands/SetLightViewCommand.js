import { Command } from '../Command.js';
import { restoreLightView } from '../modeling/LightView.js';

export class SetLightViewCommand extends Command {

	constructor( editor, object = null, before = null, after = null ) {

		super( editor );
		this.type = 'SetLightViewCommand';
		this.name = 'Fly light view';
		Object.assign( this, { object, before, after } );

	}

	execute() {

		restoreLightView( this.object, this.after );
		this.editor.signals.objectChanged.dispatch( this.object );

	}

	undo() {

		restoreLightView( this.object, this.before );
		this.editor.signals.objectChanged.dispatch( this.object );

	}

	toJSON() {

		return { ...super.toJSON( this ), objectUuid: this.object.uuid, before: this.before, after: this.after };

	}

	fromJSON( json ) {

		super.fromJSON( json );
		this.object = this.editor.objectByUuid( json.objectUuid );
		this.before = json.before;
		this.after = json.after;

	}

}
