import * as THREE from 'three';
import { ArmatureTopologyCommand, boneEditState } from '../commands/ArmatureTopologyCommand.js';
import { keepWorldTransform } from '../ObjectParenting.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { armatureBones, boneRestFrames, createBone, isArmature } from './Armature.js';
import { ikSettings } from './ArmatureIK.js';
import { restInParentFrame } from './ArmatureRestEditing.js';

function editable( object ) {

	return object.matrixAutoUpdate && object.matrixWorldAutoUpdate &&
		! hasRestriction( object, 'locked' ) && ! hasRestriction( object, 'disabled' );

}

function topologySelection( editor, rig, bones ) {

	if ( ! isArmature( rig ) || editor.objectByUuid( rig.uuid ) !== rig || ! editable( rig ) ||
		editor.streams.playing || editor.modalTransform?.active || editor.viewTools.armature.drag ) {

		throw new Error( 'Finish the current operation and choose an editable armature.' );

	}
	const selected = new Set( bones );
	const ordered = armatureBones( rig ).filter( bone => selected.has( bone ) && bone.userData.armatureBone && editable( bone ) );
	if ( ! ordered.length || ordered.length !== selected.size ) throw new Error( 'Choose editable bones from the same armature.' );
	return ordered;

}

function topologyEdit( editor, rig, bones ) {

	const entries = new Map();
	function entry( object ) {

		if ( ! entries.has( object ) ) {

			const before = boneEditState( object );
			entries.set( object, { object, before, after: { ...before } } );

		}
		return entries.get( object );

	}
	function data( object, values ) {

		const { before, after } = entry( object );
		if ( before ) before.data ??= object.userData;
		after.data = { ...object.userData, ...after.data, ...values };

	}
	function add( object, parent ) {

		entries.set( object, { object, before: null, after: { ...boneEditState( object ), parent: parent.uuid, index: null } } );

	}
	function remove( object ) {

		const change = entry( object );
		change.after = null;
		change.scripts = editor.scripts[ object.uuid ]?.slice();

	}
	function run( name ) {

		const before = editor.selector.selection;
		const after = before.filter( object => ! entries.has( object ) || entries.get( object ).after );
		const selection = after.length !== before.length ? {
			before: before.map( object => object.uuid ), after: after.length ? after.map( object => object.uuid ) : [ rig.uuid ]
		} : undefined;
		editor.history.execute( new ArmatureTopologyCommand( editor, rig, Array.from( entries.values() ), selection ), name );

	}
	return { bones: topologySelection( editor, rig, bones ), entry, data, add, remove, run };

}

export function deleteRigBones( editor, rig, bones ) {

	const edit = topologyEdit( editor, rig, bones );
	const removed = new Set( edit.bones );
	const frames = boneRestFrames( THREE, rig );
	const promoted = [];
	for ( const bone of edit.bones ) {

		let parent = bone.parent;
		while ( removed.has( parent ) ) parent = parent.parent;
		for ( const child of bone.children ) {

			if ( removed.has( child ) || child.userData.runtimeOnly ) continue;
			if ( ! editable( child ) ) throw new Error( 'Unlock ' + ( child.name || child.type ) + ' before removing its parent.' );
			const transform = keepWorldTransform( child, parent );
			Object.assign( edit.entry( child ).after, {
				parent: parent.uuid, index: null, position: transform.position, scale: transform.scale,
				quaternion: new THREE.Quaternion().setFromEuler( new THREE.Euler().fromArray( transform.rotation ) ).toArray()
			} );
			const frame = frames.get( child );
			if ( frame ) edit.data( child, {
				armatureBone: restInParentFrame( THREE, { ...child.userData.armatureBone, connected: false }, frame, frames.get( parent ) )
			} );
			promoted.push( { object: child, parent } );

		}
		edit.remove( bone );

	}
	edit.run( 'Delete Bones' );
	return promoted;

}

function adjustSplitIK( rig, splits, edit ) {

	for ( const bone of armatureBones( rig ) ) {

		const settings = ikSettings( bone.userData.armatureIK );
		if ( ! settings ) continue;
		const split = splits.get( bone.uuid );
		const owner = settings.useTail && split ? split.segments.at( -1 ) : bone;
		let chainLength = settings.chainLength;
		let child = bone;
		const max = settings.chainLength || Infinity;
		// A connected child follows the new end segment. An offset child keeps
		// its original parent, so those extra joints do not enter its chain.
		for ( let joint = settings.useTail ? bone : bone.parent, count = 0; joint?.userData.armatureBone && count < max; joint = joint.parent, count ++ ) {

			const segments = splits.get( joint.uuid )?.segments;
			if ( chainLength && segments && ( joint === bone || child.userData.armatureBone.connected ) ) chainLength += segments.length - 1;
			child = joint;

		}
		if ( chainLength > 64 ) throw new Error( 'Subdividing would exceed the 64-bone IK chain limit.' );
		if ( owner !== bone ) edit.data( bone, { armatureIK: undefined } );
		if ( owner !== bone || chainLength !== settings.chainLength ) edit.data( owner, {
			armatureIK: { ...bone.userData.armatureIK, chainLength }
		} );

	}

}

function adjustSplitReferences( editor, rig, frames, splits, edit ) {

	const point = new THREE.Vector3();
	const directions = new Map();
	for ( const [ uuid, { bone } ] of splits ) {

		const frame = frames.get( bone );
		directions.set( uuid, frame.tail.clone().sub( frame.head ) );

	}
	editor.scene.traverse( object => {

		const data = object.userData;
		if ( data.runtimeOnly ) return;
		if ( data.armatureConstraints?.some( entry => splits.has( entry?.target ) && entry.headTail > 0 ) ) {

			const constraints = data.armatureConstraints.map( entry => {

				const split = splits.get( entry?.target );
				if ( ! split || ! ( entry.headTail > 0 ) || [ 'copyRotation', 'copyScale' ].includes( entry.type ) ) return entry;
				const relative = Math.min( 1, entry.headTail ) * split.segments.length;
				if ( entry.targetSpace === 'local' ) {

					if ( relative > 1 ) throw new Error( 'A local-space constraint on ' + object.name + ' targets beyond the first new segment.' );
					return { ...entry, headTail: relative };

				}
				const index = Math.min( split.segments.length - 1, Math.floor( relative ) );
				return { ...entry, target: split.segments[ index ].uuid, headTail: relative - index };

			} );
			edit.data( object, { armatureConstraints: constraints } );

		}
		const binding = data.armatureBinding;
		if ( binding?.rig !== rig.uuid || ! binding.weightSamples ) return;
		const bind = new THREE.Matrix4().fromArray( binding.objectToRig );
		let changed = false;
		const weightSamples = Object.fromEntries( Object.entries( binding.weightSamples ).map( ( [ key, weights ] ) => {

			if ( ! Object.keys( weights ).some( uuid => splits.has( uuid ) ) ) return [ key, weights ];
			point.fromArray( key.split( ',' ).map( value => Number( value ) / 1e6 ) ).applyMatrix4( bind );
			const next = { ...weights };
			for ( const [ uuid, weight ] of Object.entries( weights ) ) {

				const split = splits.get( uuid );
				if ( ! split ) continue;
				const axis = directions.get( uuid );
				const along = point.clone().sub( frames.get( split.bone ).head ).dot( axis ) / axis.lengthSq();
				const index = THREE.MathUtils.clamp( Math.floor( along * split.segments.length ), 0, split.segments.length - 1 );
				if ( ! index ) continue;
				next[ split.segments[ index ].uuid ] = weight;
				delete next[ uuid ];
				changed = true;

			}
			return [ key, next ];

		} ) );
		if ( changed ) edit.data( object, { armatureBinding: { ...binding, weightSamples } } );

	} );

}

export function subdivideRigBones( editor, rig, bones, cuts = 1 ) {

	if ( ! Number.isInteger( cuts ) || cuts < 1 || cuts > 16 ) throw new Error( 'Choose between 1 and 16 cuts.' );
	const edit = topologyEdit( editor, rig, bones );
	const frames = boneRestFrames( THREE, rig );
	const names = new Set( armatureBones( rig ).map( bone => bone.name ) );
	const splits = new Map();
	for ( const bone of edit.bones ) {

		if ( bone.userData.armaturePhysics ) throw new Error( 'Remove Rapier body settings from ' + bone.name + ' before subdividing it.' );
		const rest = bone.userData.armatureBone;
		const length = rest.length / ( cuts + 1 );
		if ( ! Number.isFinite( length ) || length < 1e-5 ) throw new Error( bone.name + ' is too short for this number of cuts.' );
		const weightGroup = rest.weightGroup || bone.uuid;
		const stagedRest = edit.entry( bone ).after.data?.armatureBone ?? rest;
		edit.data( bone, { armatureBone: { ...stagedRest, length, weightGroup } } );
		const segments = [ bone ];
		let suffix = 1;
		for ( let i = 0; i < cuts; i ++ ) {

			let name;
			do { name = bone.name + '.' + String( suffix ++ ).padStart( 3, '0' ); } while ( names.has( name ) );
			names.add( name );
			const piece = createBone( THREE, name, {
				position: [ 0, length, 0 ], quaternion: [ 0, 0, 0, 1 ], roll: 0,
				length, connected: true, deform: rest.deform, weightGroup
			} );
			edit.add( piece, segments.at( -1 ) );
			segments.push( piece );

		}
		splits.set( bone.uuid, { bone, segments } );
		const last = segments.at( -1 );
		for ( const child of bone.children ) {

			const childRest = child.userData.armatureBone;
			if ( ! childRest?.connected ) continue;
			if ( ! editable( child ) ) throw new Error( 'Unlock ' + child.name + ' before subdividing its parent.' );
			const after = edit.entry( child ).after;
			after.parent = last.uuid;
			after.index = null;
			after.position = [ child.position.x, child.position.y - ( rest.length - length ), child.position.z ];
			edit.data( child, { armatureBone: { ...childRest, position: [ 0, length, 0 ] } } );

		}

	}
	adjustSplitIK( rig, splits, edit );
	adjustSplitReferences( editor, rig, frames, splits, edit );
	edit.run( 'Subdivide Bones' );
	return Array.from( splits.values() );

}
