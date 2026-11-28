import { ObjectLoader } from 'three';
import { Command } from '../Command.js';
import { serializeScript } from '../ScriptParams.js';

export function boneEditState( object ) {

	return {
		parent: object.parent?.uuid, index: object.parent?.children.indexOf( object ),
		position: object.position.toArray(), quaternion: object.quaternion.toArray(),
		order: object.rotation.order, scale: object.scale.toArray()
	};

}

function depth( object ) {

	let levels = 0;
	for ( let parent = object.parent; parent; parent = parent.parent ) levels ++;
	return levels;

}

function sameTransform( first, second ) {

	return first.order === second.order && [ 'position', 'quaternion', 'scale' ].every( key =>
		first[ key ].every( ( value, axis ) => value === second[ key ][ axis ] ) );

}

export class ArmatureTopologyCommand extends Command {

	constructor( editor, rig, entries = [], selection ) {

		super( editor );
		this.type = 'ArmatureTopologyCommand';
		this.rig = rig?.uuid;
		this.entries = entries;
		this.selection = selection;

	}

	execute() { this.apply( 'after' ); }
	undo() { this.apply( 'before' ); }

	apply( direction ) {

		const { editor, entries } = this;
		const signal = editor.signals.sceneGraphChanged;
		const active = signal.active;
		const byId = new Map( entries.map( entry => [ entry.object.uuid, entry ] ) );
		const completed = new Set(), order = new Map();
		const removed = entries.filter( entry => ! entry[ direction ] ).sort( ( a, b ) => depth( b.object ) - depth( a.object ) );
		const rig = editor.objectByUuid( this.rig );
		if ( editor.viewTools.armature.rig === rig && removed.some( entry => editor.selector.selection.includes( entry.object ) ) ) editor.select( rig );

		function attach( entry ) {

			if ( completed.has( entry ) ) return;
			const { object, scripts } = entry;
			const state = entry[ direction ];
			if ( state.data ) object.userData = state.data;
			const sameParent = entry.before && entry.after && entry.before.parent === entry.after.parent;
			if ( sameParent && sameTransform( entry.before, entry.after ) ) {

				completed.add( entry );
				return;

			}
			object.rotation.order = state.order;
			object.position.fromArray( state.position );
			object.quaternion.fromArray( state.quaternion );
			object.scale.fromArray( state.scale );
			object.updateMatrix();
			completed.add( entry );
			if ( sameParent ) return;

			const parentEntry = byId.get( state.parent );
			if ( parentEntry ) attach( parentEntry );
			const parent = parentEntry?.object || editor.objectByUuid( state.parent );
			if ( ! object.parent ) {

				if ( scripts?.length ) editor.scripts[ object.uuid ] = scripts;
				editor.addObject( object, parent, parent.children.length );

			} else if ( object.parent !== parent ) parent.add( object );

			if ( ! order.has( parent ) ) order.set( parent, [] );
			order.get( parent ).push( entry );

		}

		signal.active = false;
		try {

			for ( const entry of entries ) if ( entry[ direction ] ) attach( entry );
			for ( const { object } of removed ) {

				editor.removeObject( object );
				delete editor.scripts[ object.uuid ];

			}
			for ( const [ parent, siblings ] of order ) {

				siblings.sort( ( a, b ) => ( a[ direction ].index ?? Infinity ) - ( b[ direction ].index ?? Infinity ) );
				for ( const { object } of siblings ) parent.children.splice( parent.children.indexOf( object ), 1 );
				for ( const entry of siblings ) parent.children.splice( entry[ direction ].index ?? parent.children.length, 0, entry.object );

			}
			editor.scene.updateMatrixWorld( true );
			const selection = this.selection?.[ direction ];
			if ( selection ) editor.selector.setSelection( selection.map( uuid => editor.objectByUuid( uuid ) ).filter( Boolean ) );
			for ( const entry of entries ) if ( entry[ direction ] ) editor.signals.objectChanged.dispatch( entry.object, entry[ direction ].data ? 'userData' : undefined );
			editor.selector.syncPivot();

		} finally {

			signal.active = active;

		}
		signal.dispatch();

	}

	toJSON() {

		return {
			...super.toJSON(), rig: this.rig, selection: this.selection,
			entries: this.entries.map( ( { object, before, after, scripts } ) => {

				let bone;
				if ( ! before || ! after ) {

					const copy = object.clone( false );
					copy.uuid = object.uuid;
					bone = copy.toJSON();

				}
				return { uuid: object.uuid, bone, before, after, scripts: scripts?.map( serializeScript ) };

			} )
		};

	}

	fromJSON( json ) {

		super.fromJSON( json );
		this.rig = json.rig;
		this.selection = json.selection;
		const loader = new ObjectLoader();
		this.entries = json.entries.map( ( { uuid, bone, before, after, scripts } ) => ( {
			object: this.editor.objectByUuid( uuid ) || loader.parse( bone ), before, after, scripts
		} ) );

	}

}
