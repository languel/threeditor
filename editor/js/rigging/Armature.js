export function isArmature( object ) {

	return !! object?.userData.armature;

}

export function armatureOf( object ) {

	if ( isArmature( object ) ) return object;
	for ( let parent = object; parent?.isBone; parent = parent.parent ) {

		if ( isArmature( parent.parent ) ) return parent.parent;

	}
	return null;

}

export function armatureBones( rig ) {

	const bones = [];
	if ( ! isArmature( rig ) ) return bones;
	function visit( object ) {

		for ( const child of object.children ) if ( child.isBone ) {

			bones.push( child );
			visit( child );

		}

	}
	visit( rig );
	return bones;

}

export function findBone( rig, nameOrId ) {

	const bones = armatureBones( rig );
	return bones.find( bone => bone.uuid === nameOrId ) ?? bones.find( bone => bone.name === nameOrId );

}

export function boneRestFromPoints( THREE, head, tail, roll = 0, connected = false ) {

	if ( [ head, tail ].some( point => ! Array.isArray( point ) || point.length !== 3 || ! point.every( Number.isFinite ) ) ) {

		throw new Error( 'Bone head and tail must each contain three finite numbers.' );

	}
	if ( ! Number.isFinite( roll ) ) throw new Error( 'Bone roll must be finite.' );
	const axis = new THREE.Vector3( 0, 1, 0 );
	const direction = new THREE.Vector3().fromArray( tail ).sub( new THREE.Vector3().fromArray( head ) );
	const length = direction.length();
	if ( ! Number.isFinite( length ) || length < 1e-5 ) throw new Error( 'A bone needs different head and tail positions.' );
	const quaternion = new THREE.Quaternion().setFromUnitVectors( axis, direction.divideScalar( length ) );
	quaternion.multiply( new THREE.Quaternion().setFromAxisAngle( axis, roll ) );
	return { position: head.slice(), quaternion: quaternion.toArray(), length, roll, connected };

}

export function boneRestTail( THREE, rest ) {

	return new THREE.Vector3( 0, rest.length, 0 ).applyQuaternion( new THREE.Quaternion().fromArray( rest.quaternion ) )
		.add( new THREE.Vector3().fromArray( rest.position ) ).toArray();

}

export function boneRestFrames( THREE, rig ) {

	const frames = new Map();
	for ( const bone of armatureBones( rig ) ) {

		const rest = bone.userData.armatureBone;
		if ( ! rest ) continue;
		const parent = frames.get( bone.parent );
		const quaternion = new THREE.Quaternion().fromArray( rest.quaternion );
		const head = new THREE.Vector3().fromArray( rest.position );
		if ( parent ) {

			head.applyQuaternion( parent.quaternion ).add( parent.head );
			quaternion.premultiply( parent.quaternion );

		}
		const tail = new THREE.Vector3( 0, rest.length, 0 ).applyQuaternion( quaternion ).add( head );
		frames.set( bone, { head, tail, quaternion } );

	}
	return frames;

}

export function bonePoseTransform( THREE, bone, offsets ) {

	const rest = bone.userData.armatureBone;
	if ( ! rest ) return null;
	const orientation = new THREE.Quaternion().fromArray( rest.quaternion );
	const position = offsets.location ? new THREE.Vector3().fromArray( offsets.location ).applyQuaternion( orientation )
		.add( new THREE.Vector3().fromArray( rest.position ) ) : bone.position.clone();
	const quaternion = offsets.rotation ? orientation.multiply( new THREE.Quaternion().setFromEuler( new THREE.Euler( ...offsets.rotation ) ) ) :
		bone.quaternion.clone();
	const scale = offsets.scale ? new THREE.Vector3().fromArray( offsets.scale ) : bone.scale.clone();
	return { position, quaternion, scale };

}

export function bonePoseOffsets( THREE, bone ) {

	const rest = bone.userData.armatureBone;
	if ( ! rest ) return null;
	const inverse = new THREE.Quaternion().fromArray( rest.quaternion ).invert();
	return {
		location: bone.position.clone().sub( new THREE.Vector3().fromArray( rest.position ) ).applyQuaternion( inverse ).toArray(),
		rotation: new THREE.Euler().setFromQuaternion( inverse.multiply( bone.quaternion ) ).toArray().slice( 0, 3 ),
		scale: bone.scale.toArray()
	};

}

export function resetBoneTransform( bone ) {

	const rest = bone?.userData.armatureBone;
	if ( ! rest ) return false;
	bone.position.fromArray( rest.position );
	bone.quaternion.fromArray( rest.quaternion );
	bone.scale.set( 1, 1, 1 );
	bone.updateMatrixWorld( true );
	return true;

}

export function createBone( THREE, name, rest ) {

	const bone = new THREE.Bone();
	bone.name = name;
	bone.userData.armatureBone = rest;
	resetBoneTransform( bone );
	return bone;

}

export function createArmature( THREE, name = 'Armature' ) {

	const rig = new THREE.Group();
	rig.name = name;
	rig.userData.armature = { version: 1 };
	rig.add( createBone( THREE, 'Bone', boneRestFromPoints( THREE, [ 0, 0, 0 ], [ 0, 1, 0 ] ) ) );
	return rig;

}
