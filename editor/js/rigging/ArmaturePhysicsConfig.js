export const bonePhysicsModes = [ 'kinematic', 'dynamic' ];
export const boneJointTypes = [ 'ball', 'hinge', 'fixed' ];
export const jointAxes = [ 'X', 'Y', 'Z' ];

export function bonePhysicsSettings( value ) {

	if ( ! value || ! bonePhysicsModes.includes( value.mode ) ) return null;
	const { mode, radius = .1, mass = 1, damping = .1, gravity = 1,
		joint = 'ball', axis = 'Z', limits = false, min = - 90, max = 90, anchored = false } = value;
	if ( ! [ radius, mass, damping, gravity, min, max ].every( Number.isFinite ) ||
		radius < .005 || radius > 100 || mass < .01 || mass > 1e4 || damping < 0 || damping > 100 ||
		gravity < - 10 || gravity > 10 || min < - 180 || max > 180 || min > max ||
		! boneJointTypes.includes( joint ) || ! jointAxes.includes( axis ) ) return null;
	return { mode, radius, mass, damping, gravity, joint, axis, limits: limits === true, min, max, anchored: anchored === true };

}

export function usesArmaturePhysics( root ) {

	const pending = [ root ];
	for ( let object = pending.pop(); object; object = pending.pop() ) {

		if ( object.userData?.threeditor?.disabled ) continue;
		if ( ( object.isBone || object.type === 'Bone' ) && object.userData?.armatureBone && bonePhysicsSettings( object.userData.armaturePhysics ) ) return true;
		for ( const child of object.children || [] ) pending.push( child );

	}
	return false;

}
