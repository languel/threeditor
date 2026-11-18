import { ObjectLoader } from 'three';
import { Command } from '../Command.js';

export class SetMeshMaterialsCommand extends Command {

	constructor( editor, object, material ) {

		super( editor );
		this.type = 'SetMeshMaterialsCommand';
		this.object = object;
		this.old = object?.material;
		this.material = material;

	}

	set( material ) {

		const { editor, object } = this;
		editor.removeMaterial( object.material );
		object.material = Array.isArray( material ) ? material.slice() : material;
		editor.addMaterial( object.material );
		editor.signals.materialChanged.dispatch( object );
		editor.signals.objectChanged.dispatch( object, 'material' );

	}

	execute() {

		this.set( this.material );

	}

	undo() {

		this.set( this.old );

	}

	toJSON() {

		const store = material => {

			const meta = { textures: {}, images: {} };
			const list = [ material ].flat().map( item => item.toJSON( meta ) );
			return { list, isArray: Array.isArray( material ), textures: Object.values( meta.textures ), images: Object.values( meta.images ) };

		};
		return { ...super.toJSON(), objectUuid: this.object.uuid, old: store( this.old ), material: store( this.material ) };

	}

	fromJSON( json ) {

		super.fromJSON( json );
		this.object = this.editor.objectByUuid( json.objectUuid );
		const loader = new ObjectLoader();
		const load = data => {

			const textures = loader.parseTextures( data.textures, loader.parseImages( data.images ) );
			const materials = loader.parseMaterials( data.list, textures );
			const list = data.list.map( item => this.editor.materials[ item.uuid ] || materials[ item.uuid ] );
			return data.isArray ? list : list[ 0 ];

		};
		this.old = load( json.old );
		this.material = load( json.material );

	}

}
