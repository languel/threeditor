import * as THREE from 'three';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { MoveObjectCommand } from '../commands/MoveObjectCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { SetPositionCommand } from '../commands/SetPositionCommand.js';
import { SetRotationCommand } from '../commands/SetRotationCommand.js';
import { SetScaleCommand } from '../commands/SetScaleCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { keepWorldTransform } from '../ObjectParenting.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { armatureBones, armatureOf, bonePoseTransform, boneRestFrames, boneRestFromPoints, boneRestTail, createArmature, createBone, isArmature } from './Armature.js';
import { restInParentFrame, stageBoneRest } from './ArmatureRestEditing.js';
import { canDeformWithArmature, releaseArmatureGeometry } from './ArmatureDeformation.js';
import { bonePhysicsSettings } from './ArmaturePhysicsConfig.js';
import { ikSettings, resolveIK } from './ArmatureIK.js';
import { hasConstraintDependencyCycle, hasIKDependencyCycle, withArmaturePose } from './ArmaturePose.js';
import { canOwnConstraints, constraintSettings, constraintTypes, resolveConstraint } from './ArmatureConstraints.js';
import { switchedParentStack, withChildInverse } from './ConstraintParenting.js';
import { createEmpty } from '../modeling/ReferenceObjects.js';

function editable( editor, object ) {

	return object && editor.objectByUuid( object.uuid ) === object && ! object.userData.runtimeOnly &&
		! hasRestriction( object, 'locked' ) && ! hasRestriction( object, 'disabled' );

}

export function createRig( editor, name, position = editor.cursor.toArray() ) {

	const rig = createArmature( THREE, name );
	rig.position.fromArray( position );
	editor.execute( new AddObjectCommand( editor, rig ), 'Add Armature' );
	return rig;

}

export function addRigBone( editor, rig, { parent = rig, name = 'Bone', head, tail, roll = 0 } = {} ) {

	if ( ! editable( editor, rig ) || ! editable( editor, parent ) || armatureOf( parent ) !== rig ) {

		throw new Error( 'Select an editable armature or one of its bones.' );

	}
	const names = new Set( armatureBones( rig ).map( bone => bone.name ) );
	const base = name.trim() || 'Bone';
	let unique = base;
	for ( let counter = 1; names.has( unique ); counter ++ ) unique = base + '.' + String( counter ).padStart( 3, '0' );

	const parentLength = parent.userData.armatureBone?.length;
	const connected = head === undefined && parentLength !== undefined;
	head ??= [ 0, parentLength ?? 0, 0 ];
	tail ??= [ head[ 0 ], head[ 1 ] + 1, head[ 2 ] ];
	const bone = createBone( THREE, unique, boneRestFromPoints( THREE, head, tail, roll, connected ) );
	editor.execute( new AddObjectCommand( editor, bone, parent ), connected ? 'Extrude Bone' : 'Add Bone' );
	return bone;

}

function restCommands( editor, bone, next ) {

	const previous = bone.userData.armatureBone;
	const oldOrientation = new THREE.Quaternion().fromArray( previous.quaternion );
	const orientation = new THREE.Quaternion().fromArray( next.quaternion );
	const inverse = oldOrientation.clone().invert();
	const offset = bone.position.clone().sub( new THREE.Vector3().fromArray( previous.position ) ).applyQuaternion( inverse );
	const position = offset.applyQuaternion( orientation ).add( new THREE.Vector3().fromArray( next.position ) );
	const rotation = new THREE.Euler().setFromQuaternion( orientation.multiply( inverse ).multiply( bone.quaternion ), bone.rotation.order );
	const metadata = new SetValueCommand( editor, bone, 'userData', { ...bone.userData, armatureBone: next } );
	return [ metadata, new SetPositionCommand( editor, bone, position ), new SetRotationCommand( editor, bone, rotation ) ];

}

export function editBoneRest( editor, bone, options ) {

	const previous = bone?.userData.armatureBone;
	if ( ! previous || ! armatureOf( bone ) || ! editable( editor, bone ) ) throw new Error( 'Select an editable authored bone.' );
	const head = options.head ?? previous.position;
	const tail = options.tail ?? boneRestTail( THREE, previous );
	const next = boneRestFromPoints( THREE, head, tail, options.roll ?? previous.roll );
	next.connected = previous.connected && head.every( ( value, axis ) => value === previous.position[ axis ] );
	const commands = restCommands( editor, bone, { ...previous, ...next } );
	if ( Math.abs( next.length - previous.length ) > 1e-10 ) for ( const child of bone.children ) {

		const rest = child.userData.armatureBone;
		if ( ! rest?.connected ) continue;
		if ( ! editable( editor, child ) ) throw new Error( 'Unlock the connected child before resizing its parent bone.' );
		commands.push( ...restCommands( editor, child, { ...rest, position: [ 0, next.length, 0 ] } ) );

	}
	editor.history.execute( new MultiCmdsCommand( editor, commands ), 'Edit Bone Rest' );

}

export function commitBoneRest( editor, changes ) {

	const commands = [];
	for ( const [ bone, rest ] of changes ) {

		if ( ! editable( editor, bone ) ) throw new Error( 'Unlock ' + bone.name + ' before editing this joint.' );
		commands.push( ...restCommands( editor, bone, rest ) );

	}
	if ( commands.length ) editor.history.execute( new MultiCmdsCommand( editor, commands ), 'Edit Bone Rest' );

}

export function editRigSpaceBoneRest( editor, bone, { head, tail, roll } ) {

	if ( ! editable( editor, bone ) || ! bone.userData.armatureBone || ! armatureOf( bone ) ) throw new Error( 'Select an editable authored bone.' );
	if ( roll !== undefined && ! Number.isFinite( roll ) ) throw new Error( 'Bone roll must be finite.' );
	const edit = { roll };
	for ( const [ key, point ] of Object.entries( { head, tail } ) ) {

		if ( point === undefined ) continue;
		if ( ! Array.isArray( point ) || point.length !== 3 || ! point.every( Number.isFinite ) ) throw new Error( 'Expected three finite coordinates.' );
		edit[ key ] = new THREE.Vector3().fromArray( point );

	}
	commitBoneRest( editor, stageBoneRest( THREE, armatureOf( bone ), new Map( [ [ bone, edit ] ] ) ) );

}

export function reparentBone( editor, bone, parent, connected = false ) {

	reparentBones( editor, [ bone ], parent, connected );

}

export function reparentBones( editor, bones, parent, connected = false ) {

	const commands = bones.flatMap( bone => boneParentCommands( editor, bone, parent, connected ) );
	if ( ! commands.length ) return;
	editor.history.execute( new MultiCmdsCommand( editor, commands ), connected ? 'Connect Bone' : 'Set Bone Parent' );
	editor.selector.syncPivot();

}

function boneParentCommands( editor, bone, parent, connected ) {

	const rig = armatureOf( bone );
	parent ??= rig;
	if ( ! editable( editor, bone ) || ! bone.userData.armatureBone || ! rig || ! editable( editor, parent ) ||
		armatureOf( parent ) !== rig || parent !== rig && ! parent.userData.armatureBone || bone.getObjectById( parent.id ) ) {

		throw new Error( 'Choose a parent from the same armature, outside the bone’s subtree.' );

	}
	if ( connected && parent === rig ) throw new Error( 'Connected bones need a parent bone.' );
	const previous = bone.userData.armatureBone;
	if ( bone.parent === parent && previous.connected === connected ) return [];
	const frames = boneRestFrames( THREE, rig );
	const frame = frames.get( bone );
	const parentFrame = frames.get( parent );
	const offset = connected ? parentFrame.tail.clone().sub( frame.head ) : new THREE.Vector3();
	frame.head.add( offset );
	frame.tail.add( offset );
	const rest = restInParentFrame( THREE, { ...previous, connected }, frame, parentFrame );
	const metadata = new SetValueCommand( editor, bone, 'userData', { ...bone.userData, armatureBone: rest } );
	const transform = keepWorldTransform( bone, parent );
	if ( connected ) transform.position = rest.position.slice();
	return [ new MoveObjectCommand( editor, bone, parent, null, transform ), metadata ];

}

export function setBonePose( editor, bone, offsets ) {

	if ( ! editable( editor, bone ) || ! bone.userData.armatureBone || ! armatureOf( bone ) ) throw new Error( 'Select an editable authored bone.' );
	for ( const value of Object.values( offsets ) ) {

		if ( value !== undefined && ( ! Array.isArray( value ) || value.length !== 3 || ! value.every( Number.isFinite ) ) ) {

			throw new Error( 'Pose offsets must contain three finite numbers.' );

		}

	}
	const transform = bonePoseTransform( THREE, bone, offsets );
	const commands = poseCommands( editor, bone, transform );
	if ( commands.length ) editor.execute( new MultiCmdsCommand( editor, commands ), 'Set Bone Pose' );

}

function poseCommands( editor, bone, { position, quaternion, scale } ) {

	const commands = [];
	if ( ! bone.position.equals( position ) ) commands.push( new SetPositionCommand( editor, bone, position ) );
	if ( 1 - Math.abs( bone.quaternion.dot( quaternion ) ) > 1e-12 ) {

		commands.push( new SetRotationCommand( editor, bone, new THREE.Euler().setFromQuaternion( quaternion, bone.rotation.order ) ) );

	}
	if ( ! bone.scale.equals( scale ) ) commands.push( new SetScaleCommand( editor, bone, scale ) );
	return commands;

}

export function resetArmaturePose( editor, object, channels = 'all' ) {

	const rig = armatureOf( object );
	if ( ! editable( editor, rig ) ) throw new Error( 'Select an editable armature or one of its bones.' );
	resetBonesPose( editor, object === rig ? armatureBones( rig ) : [ object ], channels );

}

export function resetBonesPose( editor, bones, channels = 'all' ) {

	if ( ! [ 'all', 'location', 'rotation', 'scale' ].includes( channels ) ) throw new Error( 'Choose a pose channel to reset.' );
	const offsets = { location: [ 0, 0, 0 ], rotation: [ 0, 0, 0 ], scale: [ 1, 1, 1 ] };
	const reset = channels === 'all' ? offsets : { [ channels ]: offsets[ channels ] };
	const commands = [];
	for ( const bone of bones ) {

		if ( ! bone.userData.armatureBone || ! editable( editor, bone ) ) continue;
		commands.push( ...poseCommands( editor, bone, bonePoseTransform( THREE, bone, reset ) ) );

	}
	if ( commands.length ) editor.execute( new MultiCmdsCommand( editor, commands ), 'Reset Pose' );

}

export function attachToBone( editor, object, bone, keepWorld = true ) {

	const parent = bone ?? editor.scene;
	if ( ! editable( editor, object ) || ! object.parent || object.isBone || object === editor.camera ||
		bone && ( ! bone.isBone || ! editable( editor, bone ) ) || object.getObjectById( parent.id ) ) {

		throw new Error( 'Choose an editable scene object and a bone outside that object’s hierarchy.' );

	}
	if ( ! bone && ! object.parent.isBone ) throw new Error( 'The object has no bone parent.' );
	if ( object.parent === parent ) return;
	const transform = keepWorld ? keepWorldTransform( object, parent ) : null;
	const command = new MoveObjectCommand( editor, object, parent, null, transform );
	editor.execute( command, bone ? 'Parent to Bone' : 'Clear Bone Parent' );
	editor.selector.syncPivot();

}

export function bindArmature( editor, object, rig, influences = 4 ) {

	if ( ! editable( editor, object ) || rig && ! canDeformWithArmature( object ) ) {

		throw new Error( 'Select an editable mesh, stroke, curve, or point cloud.' );

	}
	const userData = { ...object.userData };
	if ( rig ) {

		if ( ! editable( editor, rig ) || ! isArmature( rig ) || ! armatureBones( rig ).some( bone => bone.userData.armatureBone ) ) {

			throw new Error( 'Choose an editable armature with at least one bone.' );

		}
		if ( ! Number.isInteger( influences ) || influences < 1 || influences > 4 ) throw new Error( 'Choose one to four bone influences.' );
		rig.updateWorldMatrix( true, false );
		object.updateWorldMatrix( true, false );
		if ( ! rig.matrixWorld.determinant() || ! object.matrixWorld.determinant() ) throw new Error( 'Rig and object must have nonzero scale.' );
		const objectToRig = new THREE.Matrix4().copy( rig.matrixWorld ).invert().multiply( object.matrixWorld ).toArray();
		const previous = object.userData.armatureBinding;
		userData.armatureBinding = { rig: rig.uuid, objectToRig, influences };
		if ( previous?.rig === rig.uuid && previous.weightSamples ) userData.armatureBinding.weightSamples = previous.weightSamples;

	} else {

		if ( ! userData.armatureBinding ) return;
		delete userData.armatureBinding;

	}
	releaseArmatureGeometry( object );
	const command = new SetValueCommand( editor, object, 'userData', userData );
	command.updatable = false;
	editor.execute( command, rig ? 'Bind Armature' : 'Clear Armature Binding' );

}

export function commitArmatureWeights( editor, object, samples, expected = object?.userData.armatureBinding ) {

	if ( ! editable( editor, object ) || ! expected || expected !== object.userData.armatureBinding ) {

		throw new Error( 'The object or armature binding changed. Select it again before painting.' );

	}
	const binding = { ...expected };
	if ( samples ) binding.weightSamples = { ...expected.weightSamples, ...samples };
	else delete binding.weightSamples;
	const userData = { ...object.userData, armatureBinding: binding };
	const command = new SetValueCommand( editor, object, 'userData', userData );
	command.updatable = false;
	editor.execute( command, samples ? 'Paint Armature Weights' : 'Clear Painted Weights' );

}

export function setBonePhysics( editor, bone, settings ) {

	if ( ! bone?.userData.armatureBone || ! armatureOf( bone ) || ! editable( editor, bone ) ) throw new Error( 'Select an editable authored bone.' );
	const userData = { ...bone.userData };
	if ( settings.mode === 'off' ) delete userData.armaturePhysics;
	else {

		const physics = bonePhysicsSettings( { ...userData.armaturePhysics, ...settings } );
		if ( ! physics ) throw new Error( 'Choose a physics mode and valid capsule and joint settings.' );
		userData.armaturePhysics = physics;

	}
	const command = new SetValueCommand( editor, bone, 'userData', userData );
	command.updatable = false;
	editor.execute( command, 'Set Bone Physics' );
	return userData.armaturePhysics || null;

}

export function setRigCollider( editor, object, mode ) {

	if ( ! editable( editor, object ) || ! object.isMesh || mode !== 'off' && ! object.geometry?.attributes.position?.count ) {

		throw new Error( 'Select an editable mesh to use as a collider.' );

	}
	if ( ! [ 'off', 'fixed', 'kinematic' ].includes( mode ) ) throw new Error( 'Choose Off, Fixed, or Kinematic.' );
	const userData = { ...object.userData };
	if ( mode === 'off' ) delete userData.armatureCollider;
	else userData.armatureCollider = { mode };
	const command = new SetValueCommand( editor, object, 'userData', userData );
	command.updatable = false;
	editor.execute( command, 'Set Rig Collider' );
	return userData.armatureCollider || null;

}

function ikCommand( editor, bone, value, stagedTarget ) {

	if ( ! bone?.userData.armatureBone || ! armatureOf( bone ) || ! editable( editor, bone ) ) throw new Error( 'Select an editable authored bone.' );
	const userData = { ...bone.userData };
	if ( value.target === '' ) delete userData.armatureIK;
	else {

		const settings = ikSettings( { ...userData.armatureIK, ...value } );
		if ( ! settings ) throw new Error( 'Choose an IK target and valid chain settings.' );
		const entry = resolveIK( editor.scene, bone, settings, stagedTarget );
		if ( entry.error ) throw new Error( entry.error );
		if ( hasIKDependencyCycle( editor.scene, entry ) ) throw new Error( 'The target or pole would create a cycle between rig constraints.' );
		userData.armatureIK = settings;

	}
	const command = new SetValueCommand( editor, bone, 'userData', userData );
	command.updatable = false;
	return command;

}

export function setBoneIK( editor, bone, value ) {

	const command = ikCommand( editor, bone, value );
	editor.execute( command, 'Set Inverse Kinematics' );
	return bone.userData.armatureIK || null;

}

export function setBoneConstraints( editor, bone, input ) {

	if ( ! bone?.userData.armatureBone ) throw new Error( 'Select an authored bone.' );
	return setConstraintStack( editor, bone, input );

}

export function setConstraintStack( editor, owner, input, { autoKey = false } = {} ) {

	if ( ! editable( editor, owner ) || ! canOwnConstraints( owner ) || ! owner.matrixAutoUpdate ) throw new Error( 'Select an editable scene object or authored bone.' );
	if ( ! Array.isArray( input ) ) throw new Error( 'Provide the object’s constraints as an ordered array.' );
	const existing = owner.userData.armatureConstraints ?? [];
	const ids = new Set(), names = new Set();
	const stack = input.map( item => {

		const id = item?.id ?? THREE.MathUtils.generateUUID();
		const label = Object.hasOwn( constraintTypes, item?.type ) ? constraintTypes[ item.type ].label : '';
		let name = item?.name ?? label;
		if ( item?.name === undefined ) for ( let suffix = 2; names.has( name ); suffix ++ ) name = label + ' ' + suffix;
		const settings = constraintSettings( { ...item, id, name } );
		if ( ! settings ) throw new Error( 'Use valid settings for each constraint.' );
		if ( ids.has( settings.id ) || names.has( settings.name ) ) throw new Error( 'Each constraint on an object needs a unique ID and name.' );
		ids.add( settings.id );
		names.add( settings.name );
		const previous = Array.isArray( existing ) && existing.find( entry => entry?.id === settings.id );
		if ( settings.ownerSpace === 'pose' && ! armatureOf( owner ) ) throw new Error( 'Pose space needs an armature or a bone owner.' );
		if ( settings.target && ( settings.target !== previous?.target || settings.targetSpace !== previous?.targetSpace ) ) {

			const result = resolveConstraint( editor.scene, owner, settings );
			if ( result.error ) throw new Error( result.error );

		}
		return settings;

	} );
	if ( hasConstraintDependencyCycle( editor.scene, owner, stack ) ) throw new Error( 'This stack would create a cycle with another constraint or IK chain.' );
	if ( JSON.stringify( stack ) === JSON.stringify( existing ) ) return stack;
	const userData = { ...owner.userData };
	if ( stack.length ) userData.armatureConstraints = stack;
	else delete userData.armatureConstraints;
	const command = new SetValueCommand( editor, owner, 'userData', userData );
	command.updatable = false;
	if ( autoKey ) editor.execute( command, 'Edit Constraints' );
	else editor.history.execute( command, 'Edit Constraints' );
	return stack;

}

export function setChildInverse( editor, owner, id, clear ) {

	return setConstraintStack( editor, owner, withChildInverse( THREE, editor.scene, owner, id, clear ) );

}

export function switchConstraintParent( editor, owner, id, target ) {

	return setConstraintStack( editor, owner, switchedParentStack( THREE, editor.scene, owner, id, target ) );

}

export function createBoneIKTarget( editor, bone ) {

	if ( ! bone?.userData.armatureBone ) throw new Error( 'Select an authored bone.' );
	const target = createEmpty( 'sphere' );
	target.name = bone.name + ' IK Target';
	target.userData.emptyDisplay.size = .13;
	const tail = withArmaturePose( THREE, editor.scene,
		() => bone.localToWorld( new THREE.Vector3( 0, bone.userData.armatureBone.length, 0 ) ) );
	target.position.copy( editor.scene.worldToLocal( tail ) );
	const settings = ikCommand( editor, bone, { target: target.uuid, useTail: true }, target );
	const add = new AddObjectCommand( editor, target, null, false );
	editor.execute( new MultiCmdsCommand( editor, [ add, settings ] ), 'Add IK Target' );
	return target;

}
