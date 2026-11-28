import * as THREE from 'three';
import { ArmatureTopologyCommand, boneEditState } from '../commands/ArmatureTopologyCommand.js?v=armature-symmetrize';
import { keepWorldTransform } from '../ObjectParenting.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { armatureBones, boneRestFrame, boneRestFrames, createBone, isArmature, mirroredBoneName } from './Armature.js?v=armature-apply';
import { ikSettings, resolveIK } from './ArmatureIK.js';
import { restInParentFrame } from './ArmatureRestEditing.js?v=armature-apply';
import { reflectBoneFrame, mirroredBoneConstraint, mirroredBonePhysics } from './ArmatureMirror.js?v=armature-apply';
import { armaturePoseCycles } from './ArmaturePose.js?v=armature-symmetrize';
import { constraintSettings, resolveConstraint } from './ArmatureConstraints.js';

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

function namedBoneMap( bones ) {

	const byName = new Map();
	for ( const bone of bones ) byName.set( bone.name, byName.has( bone.name ) ? null : bone );
	return byName;

}

function matchingName( byName, name ) {

	if ( byName.get( name ) === null ) throw new Error( 'Use unique bone names before mirroring ' + name + '.' );
	return byName.get( name );

}

function mirroredRelativeTransform( matrix, bone ) {

	const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
	matrix.decompose( position, quaternion, scale );
	const local = new THREE.Matrix4().compose( position, quaternion, scale );
	if ( matrix.elements.some( ( value, i ) => ! Number.isFinite( local.elements[ i ] ) ||
		Math.abs( value - local.elements[ i ] ) > 1e-7 * Math.max( 1, Math.abs( value ) ) ) ) {

		throw new Error( 'Mirroring ' + bone.name + ' would require a sheared local pose.' );

	}
	return { position: position.toArray(), quaternion: quaternion.toArray(), scale: scale.toArray() };

}

function checkMirroredRelationships( scene, staged, edit ) {

	const relevant = Array.from( staged ).some( ( [ target, stage ] ) =>
		stage.source.userData.armatureIK || stage.source.userData.armatureConstraints?.length ||
		target.userData.armatureIK || target.userData.armatureConstraints?.length );
	if ( ! relevant && ! Array.from( staged.keys() ).some( bone => bone.parent ) ) return;
	const shadow = new THREE.Scene();
	const objects = new Map( [ [ scene.uuid, shadow ] ] );
	// Validate the proposed hierarchy with the same planner as Play, without
	// registering editor objects or cloning geometry, materials or assets.
	function copy( object ) {

		const node = object.isBone ? new THREE.Bone() : new THREE.Object3D();
		node.uuid = object.uuid;
		node.name = object.name;
		node.userData = staged.has( object ) ? edit.entry( object ).after.data : object.userData;
		node.matrixAutoUpdate = object.matrixAutoUpdate;
		objects.set( node.uuid, node );

	}
	scene.traverse( object => { if ( object !== scene ) copy( object ); } );
	for ( const object of staged.keys() ) if ( ! objects.has( object.uuid ) ) copy( object );
	scene.traverse( object => {

		if ( object === scene || staged.has( object ) ) return;
		objects.get( object.parent.uuid ).add( objects.get( object.uuid ) );

	} );
	for ( const [ target, stage ] of staged ) objects.get( stage.parent.uuid ).add( objects.get( target.uuid ) );
	for ( const [ target, { source } ] of staged ) {

		const clone = objects.get( target.uuid );
		const oldIK = ikSettings( source.userData.armatureIK );
		const newIK = ikSettings( clone.userData.armatureIK );
		if ( newIK?.influence && ! resolveIK( scene, source, oldIK ).error ) {

			const result = resolveIK( shadow, clone, newIK );
			if ( result.error ) throw new Error( target.name + ': ' + result.error );

		}
		for ( const entry of clone.userData.armatureConstraints || [] ) {

			if ( entry.muted || ! entry.influence ) continue;
			const original = constraintSettings( source.userData.armatureConstraints.find( value => value?.name === entry.name ) );
			if ( resolveConstraint( scene, source, original ).error ) continue;
			const result = resolveConstraint( shadow, clone, entry );
			if ( result.error ) throw new Error( target.name + ': ' + result.error );

		}

	}
	const existing = armaturePoseCycles( scene );
	for ( const uuid of armaturePoseCycles( shadow ) ) if ( ! existing.has( uuid ) ) {

		throw new Error( 'Mirroring would create a pose dependency cycle at ' + objects.get( uuid ).name + '.' );

	}

}

export function symmetrizeRigBones( editor, rig, bones ) {

	const edit = topologyEdit( editor, rig, bones );
	const all = armatureBones( rig );
	const named = namedBoneMap( all );
	const selected = new Set( edit.bones );
	const frames = boneRestFrames( THREE, rig );
	const mirror = new THREE.Matrix4().makeScale( - 1, 1, 1 );
	editor.scene.updateMatrixWorld( true );
	if ( ! rig.matrixWorld.determinant() ) throw new Error( 'Use a nonzero armature scale before mirroring bones.' );
	const worldReflection = rig.matrixWorld.clone().multiply( mirror ).multiply( rig.matrixWorld.clone().invert() );
	const pairs = new Map(), staged = new Map();
	for ( const source of edit.bones ) {

		const opposite = mirroredBoneName( source.name );
		if ( ! opposite ) continue;
		matchingName( named, source.name );
		const existing = matchingName( named, opposite.name );
		if ( opposite.side === 'l' && selected.has( existing ) ) continue;
		if ( existing && ( ! frames.has( existing ) || ! editable( existing ) ) ) throw new Error( 'Unlock ' + opposite.name + ' before mirroring bones.' );
		const target = existing || new THREE.Bone();
		target.name = opposite.name;
		pairs.set( source, target );
		staged.set( target, {
			source, frame: reflectBoneFrame( THREE, frames.get( source ) ),
			world: worldReflection.clone().multiply( source.matrixWorld ).multiply( mirror )
		} );

	}
	if ( ! pairs.size ) throw new Error( 'Select bones with side names such as Arm.L or Arm.R.' );

	function oppositeObject( source ) {

		if ( pairs.has( source ) ) return pairs.get( source );
		const name = mirroredBoneName( source.name )?.name;
		if ( ! name ) return null;
		if ( frames.has( source ) ) return matchingName( named, name );
		const matches = source.parent?.children.filter( child => child.name === name && ! child.userData.runtimeOnly );
		return matches?.length === 1 ? matches[ 0 ] : null;

	}

	for ( const [ target, stage ] of staged ) {

		let parent = stage.source.parent;
		while ( parent !== rig ) {

			const opposite = oppositeObject( parent );
			if ( opposite && ( staged.has( opposite ) || frames.has( opposite ) ) ) {

				parent = opposite;
				break;

			}
			if ( ! mirroredBoneName( parent.name ) ) break;
			parent = parent.parent;

		}
		if ( ! editable( parent ) ) throw new Error( 'Unlock ' + parent.name + ' before assigning mirrored bones.' );
		stage.parent = parent;
		if ( ! target.parent ) edit.add( target, parent );

	}
	const afterParent = object => staged.get( object )?.parent || object.parent;
	for ( const target of staged.keys() ) {

		const ancestors = new Set( [ target ] );
		for ( let parent = afterParent( target ); parent !== rig; parent = afterParent( parent ) ) {

			if ( ! parent || ancestors.has( parent ) ) throw new Error( 'Mirroring ' + target.name + ' would create a bone hierarchy cycle.' );
			ancestors.add( parent );

		}

	}
	function restFrame( bone ) {

		if ( bone === rig ) return;
		if ( staged.has( bone ) ) return staged.get( bone ).frame;
		const rest = bone.userData.armatureBone;
		if ( ! rest ) return;
		return boneRestFrame( THREE, rest, restFrame( bone.parent ) );

	}
	function poseMatrix( object ) {

		if ( staged.has( object ) ) return staged.get( object ).world;
		if ( ! object.parent || object === rig ) return object.matrixWorld;
		return poseMatrix( object.parent ).clone().multiply( object.matrix );

	}
	const retarget = uuid => {

		const object = uuid && editor.objectByUuid( uuid );
		return object && oppositeObject( object )?.uuid || uuid;

	};
	const mirroredById = new Map( Array.from( staged.keys(), bone => [ bone.uuid, bone ] ) );
	const weightGroups = new Map();
	for ( const [ target, stage ] of staged ) {

		const { source, frame, world, parent } = stage;
		const local = poseMatrix( parent ).clone();
		if ( ! local.determinant() ) throw new Error( 'Cannot mirror a pose through a parent with a zero scale axis.' );
		const change = edit.entry( target ).after;
		if ( change.parent !== parent.uuid ) change.index = null;
		Object.assign( change, mirroredRelativeTransform( local.invert().multiply( world ), source ), { parent: parent.uuid } );
		const sourceRest = source.userData.armatureBone;
		const parentFrame = restFrame( parent );
		const connected = Boolean( sourceRest.connected && parentFrame && parentFrame.tail.distanceToSquared( frame.head ) < 1e-14 );
		const rest = restInParentFrame( THREE, { ...sourceRest, connected }, frame, parentFrame );
		if ( sourceRest.weightGroup ) {

			if ( ! weightGroups.has( sourceRest.weightGroup ) ) {

				const head = all.find( bone => bone.uuid === sourceRest.weightGroup );
				const sameGroup = all.find( bone => bone.userData.armatureBone?.weightGroup === sourceRest.weightGroup && oppositeObject( bone )?.userData.armatureBone?.weightGroup );
				weightGroups.set( sourceRest.weightGroup, ( sameGroup && oppositeObject( sameGroup ).userData.armatureBone.weightGroup ) ||
					( head && oppositeObject( head )?.uuid ) || THREE.MathUtils.generateUUID() );

			}
			rest.weightGroup = weightGroups.get( sourceRest.weightGroup );

		}
		const ik = ikSettings( source.userData.armatureIK );
		const constraints = ( source.userData.armatureConstraints || [] ).flatMap( constraint => {

			const existing = target.userData.armatureConstraints?.find( item => item?.type === constraint?.type && item?.name === constraint?.name );
			const next = mirroredBoneConstraint( constraint, worldReflection, retarget( constraint?.target ), existing?.id || THREE.MathUtils.generateUUID() );
			if ( ! next ) return [];
			if ( next.type === 'childOf' ) {

				const oldTarget = editor.objectByUuid( constraint.target );
				const newTarget = mirroredById.get( next.target ) || editor.objectByUuid( next.target );
				if ( oldTarget && newTarget ) {

					const oldDistance = ( oldTarget.userData.armatureBone?.length ?? 0 ) * next.headTail;
					const newDistance = ( staged.get( newTarget )?.source.userData.armatureBone.length ?? newTarget.userData.armatureBone?.length ?? 0 ) * next.headTail;
					const oldFrame = oldTarget.matrixWorld.clone().multiply( new THREE.Matrix4().makeTranslation( 0, oldDistance, 0 ) );
					const newFrame = poseMatrix( newTarget ).clone().multiply( new THREE.Matrix4().makeTranslation( 0, newDistance, 0 ) );
					if ( newFrame.determinant() ) {

						next.inverse = newFrame.invert().multiply( worldReflection ).multiply( oldFrame )
							.multiply( next.inverse ? new THREE.Matrix4().fromArray( next.inverse ) : new THREE.Matrix4() )
							.multiply( worldReflection ).toArray();

					}

				}

			}
			return [ next ];

		} );
		edit.data( target, {
			armatureBone: rest, armaturePhysics: mirroredBonePhysics( source.userData.armaturePhysics ) || undefined,
			armatureIK: ik ? { ...ik, target: retarget( ik.target ), pole: retarget( ik.pole ) } : undefined,
			armatureConstraints: constraints.length ? constraints : undefined
		} );

	}
	checkMirroredRelationships( editor.scene, staged, edit );
	edit.run( 'Symmetrize Bones' );
	return Array.from( pairs, ( [ source, bone ] ) => ( { source, bone } ) );

}
