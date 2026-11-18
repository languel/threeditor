import { Command } from '../Command.js';
import { MultiCmdsCommand } from './MultiCmdsCommand.js';

export class DuplicateObjectsCommand extends Command {

	constructor( editor, commands = [], sources = [], copies = [] ) {

		super( editor );
		this.type = 'DuplicateObjectsCommand';
		this.batch = new MultiCmdsCommand( editor, commands );
		this.sources = sources.map( object => object.uuid );
		this.copies = copies.map( object => object.uuid );

	}

	execute() {

		this.batch.execute();
		this.select( this.copies );

	}

	undo() {

		this.batch.undo();
		this.select( this.sources );

	}

	select( uuids ) {

		this.editor.selector.setSelection( uuids.map( uuid => this.editor.objectByUuid( uuid ) ).filter( Boolean ) );

	}

	toJSON() {

		return { ...super.toJSON(), cmds: this.batch.toJSON().cmds, sources: this.sources, copies: this.copies };

	}

	fromJSON( json ) {

		super.fromJSON( json );
		this.batch.fromJSON( { ...json, type: 'MultiCmdsCommand' } );
		this.sources = json.sources;
		this.copies = json.copies;
		const objects = new Map();
		const geometries = new Map();
		const materials = new Map();
		const sharedMaterial = material => {

			const existing = this.editor.materials[ material.uuid ] || materials.get( material.uuid );
			if ( existing ) return existing;
			materials.set( material.uuid, material );
			return material;

		};
		for ( const command of this.batch.cmdArray ) {

			if ( command.type !== 'AddObjectCommand' ) continue;
			command.object.traverse( object => {

				objects.set( object.uuid, object );
				if ( object.geometry ) {

					const shared = geometries.get( object.geometry.uuid );
					if ( shared ) object.geometry = shared;
					else geometries.set( object.geometry.uuid, object.geometry );

				}
				if ( object.material ) object.material = Array.isArray( object.material ) ? object.material.map( sharedMaterial ) : sharedMaterial( object.material );

			} );

		}
		const restoreLightTargets = node => {

			if ( node.target ) {

				const target = objects.get( node.target ) || this.editor.objectByUuid( node.target );
				if ( target ) objects.get( node.uuid ).target = target;

			}
			for ( const child of node.children || [] ) restoreLightTargets( child );

		};
		this.batch.cmdArray.forEach( ( command, index ) => {

			const snapshot = json.cmds[ index ];
			if ( command.type === 'AddObjectCommand' ) restoreLightTargets( snapshot.object.object );
			if ( command.type === 'AddScriptCommand' ) command.object = objects.get( snapshot.objectUuid ) || command.object;

		} );

	}

}
