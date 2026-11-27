import { boneRestFrames, boneRestFromPoints } from './Armature.js';

export function restInParentFrame( THREE, previous, frame, parent ) {

	const head = frame.head.clone(), tail = frame.tail.clone(), quaternion = frame.quaternion.clone();
	if ( parent ) {

		const inverse = parent.quaternion.clone().invert();
		head.sub( parent.head ).applyQuaternion( inverse );
		tail.sub( parent.head ).applyQuaternion( inverse );
		quaternion.premultiply( inverse );

	}
	const rotation = boneRestFromPoints( THREE, head.toArray(), tail.toArray() );
	const twist = new THREE.Quaternion().fromArray( rotation.quaternion ).invert().multiply( quaternion );
	let roll = 2 * Math.atan2( twist.y, twist.w );
	roll = THREE.MathUtils.euclideanModulo( roll + Math.PI, 2 * Math.PI ) - Math.PI;
	return {
		...previous,
		position: previous.connected ? [ 0, parent.head.distanceTo( parent.tail ), 0 ] : rotation.position,
		quaternion: quaternion.toArray(), length: rotation.length, roll
	};

}

export function stageBoneRest( THREE, rig, edits ) {

	const original = boneRestFrames( THREE, rig );
	const joints = new Map();
	for ( const [ bone, edit ] of edits ) {

		if ( ! original.has( bone ) ) throw new Error( 'Select bones from the active armature.' );
		const connected = bone.userData.armatureBone.connected && original.has( bone.parent );
		if ( edit.head ) {

			const owner = connected ? bone.parent : bone;
			joints.set( owner, { ...joints.get( owner ), [ connected ? 'tail' : 'head' ]: edit.head } );

		}
		if ( edit.tail ) joints.set( bone, { ...joints.get( bone ), tail: edit.tail } );

	}

	const nextFrames = new Map(), changes = new Map();
	const axis = new THREE.Vector3( 0, 1, 0 );
	for ( const [ bone, base ] of original ) {

		const previous = bone.userData.armatureBone;
		const parent = nextFrames.get( bone.parent );
		const connected = previous.connected && !! parent;
		const { head = base.head, tail = base.tail } = joints.get( bone ) ?? {};
		const nextHead = connected ? parent.tail : head;
		const direction = tail.clone().sub( nextHead );
		const length = direction.length();
		if ( ! Number.isFinite( length ) || length < 1e-5 ) throw new Error( bone.name + ' needs different head and tail positions.' );
		direction.divideScalar( length );
		const edit = edits.get( bone );
		const orientation = edit?.quaternion ?? base.quaternion;
		const oldDirection = axis.clone().applyQuaternion( orientation );
		const quaternion = new THREE.Quaternion().setFromUnitVectors( oldDirection, direction ).multiply( orientation ).normalize();

		const frame = { head: nextHead, tail, quaternion };
		nextFrames.set( bone, frame );
		const next = restInParentFrame( THREE, { ...previous, connected }, frame, parent );
		if ( edit?.roll !== undefined ) {

			const twist = new THREE.Quaternion().setFromAxisAngle( axis, edit.roll - next.roll );
			quaternion.multiply( twist );
			next.quaternion = new THREE.Quaternion().fromArray( next.quaternion ).multiply( twist ).toArray();
			next.roll = edit.roll;

		}
		if ( Math.abs( next.length - previous.length ) > 1e-9 ||
			1 - Math.abs( new THREE.Quaternion().fromArray( next.quaternion ).dot( new THREE.Quaternion().fromArray( previous.quaternion ) ) ) > 1e-12 ||
			next.position.some( ( value, axis ) => Math.abs( value - previous.position[ axis ] ) > 1e-9 ) ) changes.set( bone, next );

	}

	return changes;

}
