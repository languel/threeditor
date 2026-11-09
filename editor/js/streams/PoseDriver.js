// VRM 0.x and 1.0 describe the humanoid skeleton with glTF node indices.
function vrmBoneMap( result ) {

	const extensions = result.parser.json.extensions;
	const version1 = extensions?.VRMC_vrm?.humanoid?.humanBones;
	const version0 = extensions?.VRM?.humanoid?.humanBones;
	if ( ! version1 && ! version0 ) return null;
	const nodes = new Map();
	result.scene.traverse( object => nodes.set( result.parser.associations.get( object )?.nodes, object ) );
	const entries = version1 ? Object.entries( version1 ) : version0.map( bone => [ bone.bone, bone ] );
	return Object.fromEntries( entries.flatMap( ( [ name, { node } ] ) => nodes.has( node ) ? [ [ name, nodes.get( node ).uuid ] ] : [] ) );

}

// This source is shared by imported VRMs and the editable avatar lesson.
function poseDriver( THREE, root, bus, preview ) {

	const links = [
		[ 'leftUpperArm', 'leftLowerArm', 11, 13 ], [ 'leftLowerArm', 'leftHand', 13, 15 ],
		[ 'rightUpperArm', 'rightLowerArm', 12, 14 ], [ 'rightLowerArm', 'rightHand', 14, 16 ],
		[ 'leftUpperLeg', 'leftLowerLeg', 23, 25 ], [ 'leftLowerLeg', 'leftFoot', 25, 27 ],
		[ 'rightUpperLeg', 'rightLowerLeg', 24, 26 ], [ 'rightLowerLeg', 'rightFoot', 26, 28 ]
	];
	const origin = new THREE.Vector3(), direction = new THREE.Vector3(), parentRotation = new THREE.Quaternion();
	const bones = root.userData.vrmBones;
	const restPose = root.userData.vrmRest ||= {};
	root.updateWorldMatrix( true, true );
	const drivers = links.flatMap( ( [ from, to, a, b ] ) => {

		const bone = root.getObjectByProperty( 'uuid', bones[ from ] );
		const child = root.getObjectByProperty( 'uuid', bones[ to ] );
		if ( ! bone?.parent || ! child ) return [];
		bone.parent.getWorldQuaternion( parentRotation ).invert();
		const restDirection = child.getWorldPosition( new THREE.Vector3() ).sub( bone.getWorldPosition( origin ) ).normalize().applyQuaternion( parentRotation );
		const stored = restPose[ from ] ||= { direction: restDirection.toArray(), quaternion: bone.quaternion.toArray() };
		return [ { bone, a, b, restDirection: restDirection.fromArray( stored.direction ), rest: new THREE.Quaternion().fromArray( stored.quaternion ) } ];

	} );

	function update( event ) {

		const points = bus.get( 'vision.pose.world' ) || bus.get( 'vision.pose.landmarks' );
		for ( const [ index, { bone, a, b, restDirection, rest } ] of drivers.entries() ) {

			const start = points?.[ a ], end = points?.[ b ];
			if ( start && end && Math.min( start.visibility ?? 1, end.visibility ?? 1 ) >= .5 ) {

				direction.set( start.x - end.x, start.y - end.y, start.z - end.z );
				if ( direction.lengthSq() < 1e-8 ) continue;
				bone.parent.getWorldQuaternion( parentRotation ).invert();
				direction.normalize().applyQuaternion( parentRotation );
				bone.quaternion.setFromUnitVectors( restDirection, direction ).multiply( rest );

			} else if ( preview && ! points ) {

				bone.quaternion.copy( rest );
				bone.rotateZ( .4 * Math.sin( event.time / 490 + index * 1.1 ) );

			}

		}

	}

	return { update, stop() { for ( const { bone, rest } of drivers ) bone.quaternion.copy( rest ); } };

}

function poseScript( preview = false ) {

	return {
		name: 'MediaPipe humanoid pose', enabled: true, assetBehavior: 'stream',
		source: `// Drives arm and leg directions using VRM humanoid bones.
 // @param preview = ${ preview }
 let driver;
 function init() { driver = (${ poseDriver.toString() })(THREE, this, player.streams, params.preview); }
 function update(event) { driver.update(event); }
 function stop() { driver.stop(); }
`
	};

}

export { vrmBoneMap, poseScript };
