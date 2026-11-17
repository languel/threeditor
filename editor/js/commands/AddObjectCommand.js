import { withoutRuntimeChildren } from '../ObjectRestrictions.js';
import { Command } from '../Command.js';
import { ObjectLoader } from 'three';

class AddObjectCommand extends Command {

	/**
	 * @param {Editor} editor
	 * @param {THREE.Object3D|null} [object=null]
	 * @param {THREE.Object3D|null} [parent=null]
	 * @param {boolean} [selectOnAdd=true]
	 * @constructor
	 */
	constructor( editor, object = null, parent = null, selectOnAdd = true ) {

		super( editor );

		this.type = 'AddObjectCommand';

		this.object = object;
		this.parent = parent;
		this.selectOnAdd = selectOnAdd;

		if ( object !== null ) {

			this.name = editor.strings.getKey( 'command/AddObject' ) + ': ' + object.name;

		}

	}

	execute() {

		if ( this.parent ) this.editor.addObject( this.object, this.parent, this.parent.children.length );
		else this.editor.addObject( this.object );
		if ( this.selectOnAdd ) this.editor.select( this.object );

	}

	undo() {

		this.editor.removeObject( this.object );
		if ( this.selectOnAdd || this.editor.selected === this.object ) this.editor.deselect();

	}

	toJSON() {

		const output = super.toJSON( this );

		if ( ! this.selectOnAdd ) output.selectOnAdd = false;
		if ( this.parent ) output.parentUuid = this.parent.uuid;
		output.object = withoutRuntimeChildren( this.object, () => this.object.toJSON() );

		return output;

	}

	fromJSON( json ) {

		super.fromJSON( json );
		this.selectOnAdd = json.selectOnAdd !== false;

		this.object = this.editor.objectByUuid( json.object.object.uuid );
		this.parent = json.parentUuid ? this.editor.objectByUuid( json.parentUuid ) : null;

		if ( this.object === undefined ) {

			const loader = new ObjectLoader();
			this.object = loader.parse( json.object );

		}

	}

}

export { AddObjectCommand };
