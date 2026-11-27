import { constraintSettings, constraintTargetFrame, findConstraint, resolveConstraint } from './ArmatureConstraints.js';
import { hasConstraintDependencyCycle, withArmaturePose } from './ArmaturePose.js';

function childConstraint( owner, id ) {

	const settings = constraintSettings( findConstraint( owner, id ) );
	if ( settings?.type !== 'childOf' ) throw new Error( 'Choose a Child Of constraint.' );
	return settings;

}

function targetFor( scene, owner, settings ) {

	const result = resolveConstraint( scene, owner, settings );
	if ( result.error ) throw new Error( result.error );
	return result.target;

}

function inverseOf( matrix ) {

	const determinant = matrix.determinant();
	if ( ! determinant || ! Number.isFinite( determinant ) ) throw new Error( 'Child Of needs invertible transforms.' );
	const inverse = matrix.clone().invert();
	if ( ! inverse.elements.every( Number.isFinite ) ) throw new Error( 'Child Of needs finite transforms.' );
	return inverse;

}

export function withChildInverse( THREE, scene, owner, id, clear = false ) {

	const settings = childConstraint( owner, id );
	const target = clear ? null : targetFor( scene, owner, settings );
	const inverse = target ? withArmaturePose( THREE, scene, () => inverseOf( constraintTargetFrame( THREE, target, settings.headTail ) ).toArray() ) : null;
	return owner.userData.armatureConstraints.map( item => item?.id === settings.id ? { ...settings, inverse } : item );

}

export function switchedParentStack( THREE, scene, owner, id, newTarget ) {

	const settings = childConstraint( owner, id );
	const entry = { ...settings, target: newTarget ?? settings.target, influence: 1, muted: false, inverse: null };
	const target = targetFor( scene, owner, entry );
	const stack = owner.userData.armatureConstraints.map( item => item?.id === entry.id ? entry :
		item?.type === 'childOf' ? { ...item, influence: 0 } : item );
	if ( hasConstraintDependencyCycle( scene, owner, stack ) ) throw new Error( 'Switching to this target would create a constraint cycle.' );
	const world = () => {

		owner.updateWorldMatrix( true, false );
		return owner.matrixWorld.clone();

	};
	const previous = withArmaturePose( THREE, scene, world );
	const mutedStack = stack.map( item => item === entry ? { ...item, influence: 0 } : item );
	const baseline = withArmaturePose( THREE, scene, () => ( {
		world: world(), target: constraintTargetFrame( THREE, target, entry.headTail )
	} ), undefined, { stackOwner: owner, stack: mutedStack } );
	entry.inverse = inverseOf( baseline.target ).multiply( previous ).multiply( inverseOf( baseline.world ) ).toArray();
	if ( ! constraintSettings( entry ) ) throw new Error( 'Unable to calculate a finite Child Of inverse.' );
	const next = withArmaturePose( THREE, scene, world, undefined, { stackOwner: owner, stack } );
	if ( next.elements.some( ( value, i ) => ! Number.isFinite( value ) ||
		Math.abs( value - previous.elements[ i ] ) > 1e-7 * Math.max( 1, Math.abs( previous.elements[ i ] ) ) ) ) {

		throw new Error( 'This stack cannot preserve the pose during the switch. Put the Child Of constraints last and check its IK settings.' );

	}
	return stack;

}
