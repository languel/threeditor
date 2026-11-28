import { SetValueCommand } from '../commands/SetValueCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { armatureOf, isArmature } from './Armature.js?v=armature-apply';
import { boneCollections, boneCollectionTree, findBoneCollection } from './BoneCollections.js';

const newCollectionId = () => 'collection:' + ( globalThis.crypto?.randomUUID?.() ?? Math.random().toString( 36 ).slice( 2 ) );

function checkRig( editor, rig ) {

	if ( ! isArmature( rig ) || editor.objectByUuid( rig.uuid ) !== rig || editor.streams.playing || editor.modalTransform?.active ||
		editor.viewTools?.armature.drag || hasRestriction( rig, 'locked' ) || hasRestriction( rig, 'disabled' ) ) {

		throw new Error( 'Finish the current operation and choose an editable armature.' );

	}

}

function getCollection( rig, id ) {

	const collection = findBoneCollection( rig, id );
	if ( ! collection ) throw new Error( 'Bone collection not found: ' + id );
	return collection;

}

export function boneCollectionsCommand( editor, rig, collections ) {

	const command = new SetValueCommand( editor, rig, 'userData', { ...rig.userData, armature: { ...rig.userData.armature, collections } } );
	command.updatable = false;
	return command;

}

export function setBoneCollection( editor, rig, id, patch = {} ) {

	checkRig( editor, rig );
	const collections = boneCollections( rig );
	const previous = id == null ? null : getCollection( rig, id );
	const names = new Set( collections.filter( collection => collection !== previous ).map( collection => collection.name ) );
	let name = patch.name === undefined ? previous?.name : patch.name.trim();
	if ( name === undefined ) {

		name = 'Bones';
		for ( let index = 1; names.has( name ); index ++ ) name = 'Bones.' + String( index ).padStart( 3, '0' );

	}
	if ( ! name || names.has( name ) ) throw new Error( 'Choose a unique bone collection name.' );
	const parent = patch.parent === undefined ? previous?.parent ?? null : patch.parent === null ? null : getCollection( rig, patch.parent ).id;
	if ( previous && ( parent === previous.id || boneCollectionTree( rig, previous.id ).some( child => child.collection.id === parent ) ) ) {

		throw new Error( 'A collection cannot be parented to itself or one of its children.' );

	}
	const collection = {
		id: previous?.id ?? newCollectionId(), name, parent, bones: previous?.bones ?? [],
		visible: patch.visible ?? previous?.visible ?? true, solo: patch.solo ?? previous?.solo ?? false
	};
	let next = previous ? collections.map( item => item === previous ? collection : item ) : [ ...collections, collection ];
	if ( patch.direction !== undefined ) {

		const siblings = next.filter( item => item.parent === parent );
		const neighbor = siblings[ siblings.indexOf( collection ) + ( patch.direction === 'up' ? - 1 : 1 ) ];
		if ( neighbor ) {

			const from = next.indexOf( collection ), to = next.indexOf( neighbor );
			[ next[ from ], next[ to ] ] = [ next[ to ], next[ from ] ];

		}

	}
	editor.execute( boneCollectionsCommand( editor, rig, next ), previous ? 'Edit Bone Collection' : 'Add Bone Collection' );
	return collection;

}

export function removeBoneCollection( editor, rig, id ) {

	checkRig( editor, rig );
	const collection = getCollection( rig, id );
	const collections = boneCollections( rig );
	const children = collections.filter( item => item.parent === collection.id ).map( item => ( { ...item, parent: collection.parent } ) );
	const next = collections.flatMap( item => item === collection ? children : item.parent === collection.id ? [] : [ item ] );
	editor.execute( boneCollectionsCommand( editor, rig, next ), 'Remove Bone Collection' );

}

export function assignBonesToCollection( editor, rig, id, bones, operation = 'assign' ) {

	checkRig( editor, rig );
	const collection = getCollection( rig, id );
	if ( ! [ 'assign', 'remove', 'move' ].includes( operation ) ) throw new Error( 'Unknown bone membership operation.' );
	if ( ! bones.length || bones.some( bone => ! bone?.userData.armatureBone || armatureOf( bone ) !== rig ||
		hasRestriction( bone, 'locked' ) || hasRestriction( bone, 'disabled' ) ) ) {

		throw new Error( 'Choose editable bones from the same armature.' );

	}
	const ids = new Set( bones.map( bone => bone.uuid ) );
	const current = boneCollections( rig );
	const next = current.map( item => {

		let members = item.bones;
		if ( item === collection && operation !== 'remove' ) members = [ ...new Set( [ ...members, ...ids ] ) ];
		else if ( item === collection || operation === 'move' ) members = members.filter( bone => ! ids.has( bone ) );
		return members.length === item.bones.length ? item : { ...item, bones: members };

	} );
	if ( next.some( ( item, index ) => item !== current[ index ] ) ) {

		const labels = { assign: 'Assign Bones to Collection', remove: 'Unassign Bones from Collection', move: 'Move Bones to Collection' };
		editor.execute( boneCollectionsCommand( editor, rig, next ), labels[ operation ] );

	}
	return next.find( item => item.id === collection.id );

}
