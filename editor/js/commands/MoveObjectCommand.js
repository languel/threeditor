import { Command } from '../Command.js';

function localTransform( object ) {

	return { position: object.position.toArray(), rotation: object.rotation.toArray(), scale: object.scale.toArray() };

}

function applyLocalTransform( object, transform ) {

	if ( ! transform ) return;
	object.position.fromArray( transform.position );
	object.rotation.fromArray( transform.rotation );
	object.scale.fromArray( transform.scale );
	object.updateMatrix();

}

class MoveObjectCommand extends Command {

	/**
	 * @param {Editor} editor
	 * @param {THREE.Object3D|null} [object=null]
	 * @param {THREE.Object3D|null} [newParent=null]
	 * @param {THREE.Object3D|null} [newBefore=null]
	 * @param {Object|null} [transform=null] Local position, rotation and scale after moving.
	 * @constructor
	 */
	constructor( editor, object = null, newParent = null, newBefore = null, transform = null ) {

		super( editor );

		this.type = 'MoveObjectCommand';
		this.name = editor.strings.getKey( 'command/MoveObject' );

		this.object = object;
		this.oldParent = ( object !== null ) ? object.parent : null;
		this.oldIndex = ( this.oldParent !== null ) ? this.oldParent.children.indexOf( this.object ) : null;
		this.newParent = newParent;

		if ( newBefore !== null ) {

			this.newIndex = ( newParent !== null ) ? newParent.children.indexOf( newBefore ) : null;

		} else {

			this.newIndex = ( newParent !== null ) ? newParent.children.length : null;

		}

		if ( this.oldParent === this.newParent && this.newIndex > this.oldIndex ) {

			this.newIndex --;

		}

		this.newBefore = newBefore;
		this.newTransform = transform;
		this.oldTransform = transform && localTransform( object );

	}

	execute() {

		this.oldIndex = this.oldParent.children.indexOf( this.object );
		this.oldParent.remove( this.object );

		const children = this.newParent.children;
		children.splice( this.newIndex, 0, this.object );
		this.object.parent = this.newParent;
		applyLocalTransform( this.object, this.newTransform );
		this.object.updateWorldMatrix( true, true );

		this.object.dispatchEvent( { type: 'added' } );
		this.editor.signals.objectChanged.dispatch( this.object );
		this.editor.signals.objectChanged.dispatch( this.newParent );
		this.editor.signals.objectChanged.dispatch( this.oldParent );
		this.editor.signals.sceneGraphChanged.dispatch();

	}

	undo() {

		this.newParent.remove( this.object );

		const children = this.oldParent.children;
		children.splice( this.oldIndex, 0, this.object );
		this.object.parent = this.oldParent;
		applyLocalTransform( this.object, this.oldTransform );
		this.object.updateWorldMatrix( true, true );

		this.object.dispatchEvent( { type: 'added' } );
		this.editor.signals.objectChanged.dispatch( this.object );
		this.editor.signals.objectChanged.dispatch( this.newParent );
		this.editor.signals.objectChanged.dispatch( this.oldParent );
		this.editor.signals.sceneGraphChanged.dispatch();

	}

	toJSON() {

		const output = super.toJSON( this );

		output.objectUuid = this.object.uuid;
		output.newParentUuid = this.newParent.uuid;
		output.oldParentUuid = this.oldParent.uuid;
		output.newIndex = this.newIndex;
		output.oldIndex = this.oldIndex;
		if ( this.newTransform ) {

			output.newTransform = this.newTransform;
			output.oldTransform = this.oldTransform;

		}

		return output;

	}

	fromJSON( json ) {

		super.fromJSON( json );

		this.object = this.editor.objectByUuid( json.objectUuid );
		this.oldParent = this.editor.objectByUuid( json.oldParentUuid );
		if ( this.oldParent === undefined ) {

			this.oldParent = this.editor.scene;

		}

		this.newParent = this.editor.objectByUuid( json.newParentUuid );

		if ( this.newParent === undefined ) {

			this.newParent = this.editor.scene;

		}

		this.newIndex = json.newIndex;
		this.oldIndex = json.oldIndex;
		this.newTransform = json.newTransform;
		this.oldTransform = json.oldTransform;

	}

}

export { MoveObjectCommand };
