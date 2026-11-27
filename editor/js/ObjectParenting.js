import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { MoveObjectCommand } from './commands/MoveObjectCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { hasRestriction } from './ObjectRestrictions.js';

function editable( object ) {

	return object?.parent && ! object.userData.runtimeOnly && ! hasRestriction( object, 'locked' ) && ! hasRestriction( object, 'disabled' );

}

export function selectionRoots( selection ) {

	const selected = new Set( selection );
	return selection.filter( object => {

		for ( let ancestor = object.parent; ancestor; ancestor = ancestor.parent ) if ( selected.has( ancestor ) ) return false;
		return true;

	} );

}

function parentingTargets( editor, clearing ) {

	if ( editor.modeling.editMode || editor.viewTools.mode || editor.editWorkspace.exclusive ||
		editor.streams.playing || editor.modalTransform.active ) return [];
	const selection = editor.selector.selection;
	const active = selection.at( -1 );
	if ( ! clearing && ( ! editable( active ) || selection.some( object => object !== active && object.getObjectById( active.id ) ) ) ) return [];
	const roots = selectionRoots( selection.filter( object => clearing || object !== active ) );
	return roots.filter( object => editable( object ) && object.parent !== ( clearing ? editor.scene : active ) );

}

export function canParentSelection( editor, clearing ) {

	return parentingTargets( editor, clearing ).length > 0;

}

export function keepWorldTransform( object, parent ) {

	if ( ! object.matrixAutoUpdate ) throw new Error( 'Keep Transform requires editable location, rotation, and scale.' );
	parent.updateWorldMatrix( true, false );
	object.updateWorldMatrix( true, false );
	if ( parent.matrixWorld.determinant() === 0 ) throw new Error( 'The parent transform has a zero scale axis.' );
	const local = new Matrix4().copy( parent.matrixWorld ).invert().multiply( object.matrixWorld );
	const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
	local.decompose( position, rotation, scale );
	const candidate = new Matrix4().compose( position, rotation, scale );
	if ( local.elements.some( ( value, index ) => ! Number.isFinite( candidate.elements[ index ] ) ||
		Math.abs( value - candidate.elements[ index ] ) > 1e-7 * Math.max( 1, Math.abs( value ) ) ) ) {

		throw new Error( 'Keep Transform cannot represent shear with editable transform fields.' );

	}
	return { position: position.toArray(), rotation: new Euler().setFromQuaternion( rotation, object.rotation.order ).toArray(), scale: scale.toArray() };

}

export function changeParent( editor, clearing, mode ) {

	const objects = parentingTargets( editor, clearing );
	if ( ! objects.length ) return;
	const parent = clearing ? editor.scene : editor.selector.selection.at( -1 );
	const commands = objects.map( ( object, index ) => {

		const transform = mode === 'keepWorld' ? keepWorldTransform( object, parent ) :
			mode === 'withoutInverse' ? { position: [ 0, 0, 0 ], rotation: object.rotation.toArray(), scale: object.scale.toArray() } : null;
		if ( transform && ! object.matrixAutoUpdate ) throw new Error( 'This object uses a fixed local matrix.' );
		const move = new MoveObjectCommand( editor, object, parent, null, transform );
		move.newIndex += index;
		return move;

	} );
	editor.execute( commands.length === 1 ? commands[ 0 ] : new MultiCmdsCommand( editor, commands ), clearing ? 'Clear Parent' : 'Set Parent' );
	editor.selector.syncPivot();

}
