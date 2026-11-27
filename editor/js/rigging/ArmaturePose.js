import { armatureOf } from './Armature.js';
import { canOwnConstraints, constraintSettings, resolveConstraint, solveConstraint } from './ArmatureConstraints.js';
import { ikSettings, resolveIK, solveIK } from './ArmatureIK.js';
import { hasRestriction } from '../ObjectRestrictions.js';

const evaluating = new WeakSet();

function dependsOn( input, writes ) {

	for ( let ancestor = input; ancestor; ancestor = ancestor.parent ) if ( writes.has( ancestor ) ) return true;
	return false;

}

function poseOperations( scene, { stackOwner, stack, ik, skipRig } = {} ) {

	const operations = [];
	scene.traverse( owner => {

		const raw = owner === stackOwner ? stack : owner.userData.armatureConstraints;
		const authoredBone = owner.isBone && owner.userData.armatureBone;
		if ( ! authoredBone && ! raw?.length ) return;
		if ( ! canOwnConstraints( owner ) || hasRestriction( owner, 'disabled' ) ||
			skipRig && armatureOf( owner ) === skipRig ) return;
		if ( Array.isArray( raw ) ) {

			const local = [];
			for ( const item of raw ) {

				const settings = constraintSettings( item );
				if ( ! settings || settings.muted || ! settings.influence ) continue;
				const constraint = resolveConstraint( scene, owner, settings );
				if ( ! constraint.error ) local.push( constraint );

			}
			if ( local.length ) operations.push( {
				owner, local, writes: new Set( [ owner ] ), reads: [ owner.parent, ...local.map( entry => entry.target ) ]
			} );

		}
		if ( ! authoredBone ) return;
		const settings = ikSettings( owner.userData.armatureIK );
		if ( owner !== ik?.owner && ! settings?.influence ) return;
		const chain = owner === ik?.owner ? ik : resolveIK( scene, owner, settings );
		if ( ! chain.error ) operations.push( {
			owner, ik: chain, writes: new Set( chain.chain ), reads: [ chain.chain[ 0 ].parent, chain.target, chain.pole ]
		} );

	} );
	return operations;

}

function mustFollow( operation, upstream ) {

	if ( upstream === operation ) return false;
	// A local stack on any affected bone runs before its IK pass. Reads of
	// bones in that same chain see the pose as it exists before IK.
	if ( operation.ik && upstream.local && operation.writes.has( upstream.owner ) ) return true;
	const reads = operation.local && upstream.ik && upstream.writes.has( operation.owner ) ?
		operation.reads.filter( input => ! upstream.writes.has( input ) ) : operation.reads;
	return reads.some( input => dependsOn( input, upstream.writes ) );

}

function posePlan( scene, overrides ) {

	const operations = poseOperations( scene, overrides );
	const dependents = new Map( operations.map( op => [ op, [] ] ) );
	const pending = new Map();
	for ( const operation of operations ) {

		let count = 0;
		for ( const upstream of operations ) if ( mustFollow( operation, upstream ) ) {

			dependents.get( upstream ).push( operation );
			count ++;

		}
		pending.set( operation, count );

	}
	const ordered = operations.filter( operation => ! pending.get( operation ) );
	for ( const operation of ordered ) {

		for ( const downstream of dependents.get( operation ) ) {

			const remaining = pending.get( downstream ) - 1;
			pending.set( downstream, remaining );
			if ( remaining === 0 ) ordered.push( downstream );

		}

	}
	return { ordered, blocked: operations.filter( operation => pending.get( operation ) > 0 ) };

}

export function hasIKDependencyCycle( scene, entry ) {

	return posePlan( scene, { ik: entry } ).blocked.some( operation => operation.ik === entry );

}

export function hasConstraintDependencyCycle( scene, owner, stack ) {

	return posePlan( scene, { stackOwner: owner, stack } ).blocked.some( operation => operation.owner === owner && operation.local );

}

export function withArmaturePose( THREE, scene, evaluate, skipRig, override ) {

	if ( evaluating.has( scene ) ) return evaluate();
	const { ordered } = posePlan( scene, { skipRig, ...override } );
	if ( ! ordered.length && ! skipRig ) return evaluate();
	evaluating.add( scene );
	const snapshots = new Map();
	try {

		for ( const operation of ordered ) {

			for ( const object of operation.writes ) if ( ! snapshots.has( object ) ) {

				snapshots.set( object, [ object.position.clone(), object.quaternion.clone(), object.scale.clone(), object.matrix.clone(), object.matrixAutoUpdate ] );

			}
			if ( operation.ik ) {

				for ( const bone of operation.writes ) if ( ! bone.matrixAutoUpdate ) {

					bone.matrixAutoUpdate = true;
					bone.updateMatrix();

				}
				solveIK( THREE, operation.ik );

			}
			else for ( const constraint of operation.local ) solveConstraint( THREE, operation.owner, constraint );

		}
		scene.updateMatrixWorld( true );
		return evaluate();

	} finally {

		for ( const [ object, [ position, rotation, scale, matrix, auto ] ] of snapshots ) {

			object.position.copy( position );
			object.quaternion.copy( rotation );
			object.scale.copy( scale );
			object.matrixAutoUpdate = auto;
			object.matrix.copy( matrix );
			object.matrixWorldNeedsUpdate = true;

		}
		evaluating.delete( scene );
		scene.updateMatrixWorld( true );

	}

}
