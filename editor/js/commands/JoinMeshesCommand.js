import { MultiCmdsCommand } from './MultiCmdsCommand.js';
import { Command } from '../Command.js';

export class JoinMeshesCommand extends Command {

	constructor( editor, commands = [], selection = [] ) {

		super( editor );
		this.type = 'JoinMeshesCommand';
		this.batch = new MultiCmdsCommand( editor, commands );
		this.selection = selection.map( object => object.uuid );

	}

	execute() {

		this.batch.execute();
		this.editor.select( this.editor.objectByUuid( this.selection.at( -1 ) ) );

	}

	undo() {

		this.batch.undo();
		this.editor.selector.setSelection( this.selection.map( id => this.editor.objectByUuid( id ) ).filter( Boolean ) );

	}

	toJSON() {

		const json = { ...super.toJSON(), cmds: this.batch.toJSON().cmds, selection: this.selection };
		// Reparented children already exist elsewhere when the carrier is restored.
		for ( const cmd of json.cmds ) if ( cmd.type === 'AddObjectCommand' ) delete cmd.object.object.children;
		return json;

	}

	fromJSON( json ) {

		super.fromJSON( json );
		this.batch.fromJSON( { ...json, type: 'MultiCmdsCommand' } );
		this.selection = json.selection;
		const objects = new Map();
		for ( const cmd of this.batch.cmdArray ) if ( cmd.type === 'AddObjectCommand' || cmd.type === 'RemoveObjectCommand' ) objects.set( cmd.object.uuid, cmd.object );
		this.batch.cmdArray.forEach( ( cmd, index ) => {

			if ( cmd.type !== 'MoveObjectCommand' ) return;
			const original = json.cmds[ index ];
			cmd.oldParent = objects.get( original.oldParentUuid ) || cmd.oldParent;
			cmd.newParent = objects.get( original.newParentUuid ) || cmd.newParent;

		} );

	}

}
