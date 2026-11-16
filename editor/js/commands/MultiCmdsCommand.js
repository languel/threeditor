import { Command } from '../Command.js';
import * as Commands from './Commands.js';

class MultiCmdsCommand extends Command {

	/**
	 * @param {Editor} editor
	 * @param {Array<Command>} [cmdArray=[]]
	 * @constructor
	 */
	constructor( editor, cmdArray = [], afterExecute = null ) {

		super( editor );

		this.type = 'MultiCmdsCommand';
		this.name = editor.strings.getKey( 'command/MultiCmds' );

		this.cmdArray = cmdArray;
		this.afterExecute = afterExecute;

	}

	execute() {

		const signal = this.editor.signals.sceneGraphChanged;
		const wasActive = signal.active;
		signal.active = false;
		try {

			for ( const command of this.cmdArray ) command.execute();
			if ( this.afterExecute ) {

				const followUp = this.afterExecute();
				this.afterExecute = null;
				if ( followUp ) {

					followUp.execute();
					this.cmdArray.push( followUp );

				}

			}

		} finally {

			signal.active = wasActive;

		}
		signal.dispatch();

	}

	undo() {

		const signal = this.editor.signals.sceneGraphChanged;
		const wasActive = signal.active;
		signal.active = false;
		try {

			for ( let i = this.cmdArray.length - 1; i >= 0; i -- ) this.cmdArray[ i ].undo();

		} finally {

			signal.active = wasActive;

		}
		signal.dispatch();

	}

	toJSON() {

		const output = super.toJSON( this );

		const cmds = [];
		for ( let i = 0; i < this.cmdArray.length; i ++ ) {

			cmds.push( this.cmdArray[ i ].toJSON() );

		}

		output.cmds = cmds;

		return output;

	}

	fromJSON( json ) {

		super.fromJSON( json );

		const cmds = json.cmds;
		for ( let i = 0; i < cmds.length; i ++ ) {

			const cmd = new Commands[ cmds[ i ].type ]( this.editor );
			cmd.fromJSON( cmds[ i ] );
			this.cmdArray.push( cmd );

		}

	}

}

export { MultiCmdsCommand };
