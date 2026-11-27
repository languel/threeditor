import { armatureOf } from './Armature.js';
import { hasRestriction } from '../ObjectRestrictions.js';

const EPSILON = 1e-8;
const solving = new WeakSet();

export function ikSettings( value ) {

	if ( ! value || typeof value.target !== 'string' || ! value.target ) return null;
	const { target, pole = '', chainLength = 2, iterations = 32, influence = 1, useTail = true } = value;
	if ( typeof pole !== 'string' || ! Number.isInteger( chainLength ) || chainLength < 0 || chainLength > 64 ||
		! Number.isInteger( iterations ) || iterations < 1 || iterations > 128 || ! Number.isFinite( influence ) ||
		influence < 0 || influence > 1 || typeof useTail !== 'boolean' ) return null;
	return { target, pole, chainLength, iterations, influence, useTail };

}

function chainFor( owner, settings ) {

	const chain = [];
	const max = settings.chainLength || Infinity;
	for ( let bone = settings.useTail ? owner : owner.parent; bone?.isBone && chain.length < max; bone = bone.parent ) {

		if ( ! bone.userData.armatureBone ) break;
		chain.push( bone );

	}
	return chain.reverse();

}

function contains( bones, object ) {

	for ( let ancestor = object; ancestor; ancestor = ancestor.parent ) if ( bones.includes( ancestor ) ) return true;
	return false;

}

export function resolveIK( scene, owner, settings, stagedTarget ) {

	const rig = armatureOf( owner );
	const chain = chainFor( owner, settings );
	const target = stagedTarget?.uuid === settings.target ? stagedTarget : scene.getObjectByProperty( 'uuid', settings.target );
	const pole = settings.pole ? scene.getObjectByProperty( 'uuid', settings.pole ) : null;
	if ( ! rig || ! chain.length ) return { error: 'The constraint needs an authored bone chain.' };
	if ( ! target || target.userData.runtimeOnly || hasRestriction( target, 'disabled' ) ) return { error: 'Choose an available IK target.' };
	if ( settings.pole && ( ! pole || pole.userData.runtimeOnly || hasRestriction( pole, 'disabled' ) ) ) return { error: 'Choose an available pole or clear the pole target.' };
	if ( contains( chain, target ) || contains( chain, pole ) ) return { error: 'IK targets must stay outside the chain and its descendants.' };
	if ( chain.some( bone => bone.userData.armaturePhysics?.mode === 'dynamic' || hasRestriction( bone, 'disabled' ) ) ) {

		return { error: 'IK can solve enabled pose bones and kinematic bones. Use Rapier to drive dynamic bones.' };

	}
	return { owner, rig, chain, target, pole, settings };

}

function orderedConstraints( scene, override ) {

	const entries = [];
	scene.traverse( object => {

		if ( ! object.isBone || hasRestriction( object, 'disabled' ) ) return;
		if ( object === override?.owner ) {

			entries.push( override );
			return;

		}
		const settings = ikSettings( object.userData.armatureIK );
		if ( ! settings?.influence ) return;
		const entry = resolveIK( scene, object, settings );
		if ( ! entry.error ) entries.push( entry );

	} );
	const pending = entries.map( entry => ( {
		entry, dependencies: new Set( entries.filter( upstream => upstream !== entry &&
			[ entry.target, entry.pole, entry.chain[ 0 ].parent ].some( input => contains( upstream.chain, input ) ) ) )
	} ) );
	const ordered = [];
	while ( pending.length ) {

		const next = pending.findIndex( item => ! item.dependencies.size );
		if ( next < 0 ) break; // Cyclic target dependencies have no stable pose.
		const [ { entry } ] = pending.splice( next, 1 );
		ordered.push( entry );
		for ( const item of pending ) item.dependencies.delete( entry );

	}
	return ordered;

}

export function hasIKDependencyCycle( scene, entry ) {

	return ! orderedConstraints( scene, entry ).includes( entry );

}

function perpendicular( THREE, axis, suggestion ) {

	const projected = suggestion.clone().addScaledVector( axis, - suggestion.dot( axis ) );
	if ( projected.lengthSq() > EPSILON ) return projected.normalize();
	const basis = Math.abs( axis.x ) < .8 ? new THREE.Vector3( 1, 0, 0 ) : new THREE.Vector3( 0, 0, 1 );
	return basis.addScaledVector( axis, - basis.dot( axis ) ).normalize();

}

function solvePoints( THREE, points, target, pole, iterations ) {

	const root = points[ 0 ].clone();
	const end = points.length - 1;
	const lengths = points.slice( 1 ).map( ( point, i ) => point.distanceTo( points[ i ] ) );
	if ( lengths.some( length => length < EPSILON || ! Number.isFinite( length ) ) ) return false;
	const length = lengths.reduce( ( sum, part ) => sum + part, 0 );
	const toward = target.clone().sub( root );
	const distance = toward.length();
	if ( distance < EPSILON ) toward.copy( points[ end ] ).sub( root );
	if ( toward.lengthSq() < EPSILON ) toward.copy( points[ 1 ] ).sub( root );
	toward.normalize();

	if ( distance >= length || end === 1 ) {

		for ( let i = 1; i <= end; i ++ ) points[ i ].copy( points[ i - 1 ] ).addScaledVector( toward, lengths[ i - 1 ] );
		return true;

	}
	const bend = pole?.clone().sub( root ) || points[ 1 ].clone().sub( root );
	if ( end === 2 ) {

		const [ first, second ] = lengths;
		const reach = Math.max( Math.abs( first - second ), distance, EPSILON );
		const center = ( first * first - second * second + reach * reach ) / ( 2 * reach );
		const side = Math.sqrt( Math.max( 0, first * first - center * center ) );
		if ( distance < EPSILON && Math.abs( first - second ) < EPSILON ) {

			points[ 1 ].copy( root ).addScaledVector( bend.lengthSq() > EPSILON ? bend.normalize() : toward, first );
			points[ 2 ].copy( root );

		} else {

			points[ 1 ].copy( root ).addScaledVector( toward, center ).addScaledVector( perpendicular( THREE, toward, bend ), side );
			points[ 2 ].copy( root ).addScaledVector( toward, reach );

		}
		return true;

	}

	// Seed a small bend when a straight chain is asked to reach back along itself.
	const sideways = perpendicular( THREE, toward, bend );
	if ( points.slice( 1, end ).every( point => point.clone().sub( root ).cross( toward ).lengthSq() < EPSILON ) ) {

		for ( let i = 1; i < end; i ++ ) points[ i ].addScaledVector( sideways, .025 * length * Math.sin( Math.PI * i / end ) );

	}
	const direction = new THREE.Vector3();
	for ( let iteration = 0; iteration < iterations; iteration ++ ) {

		points[ end ].copy( target );
		for ( let i = end - 1; i >= 0; i -- ) {

			direction.subVectors( points[ i ], points[ i + 1 ] );
			if ( direction.lengthSq() < EPSILON ) direction.copy( toward ).negate();
			points[ i ].copy( points[ i + 1 ] ).addScaledVector( direction.normalize(), lengths[ i ] );

		}
		points[ 0 ].copy( root );
		for ( let i = 1; i <= end; i ++ ) {

			direction.subVectors( points[ i ], points[ i - 1 ] );
			if ( direction.lengthSq() < EPSILON ) direction.copy( toward );
			points[ i ].copy( points[ i - 1 ] ).addScaledVector( direction.normalize(), lengths[ i - 1 ] );

		}
		if ( points[ end ].distanceToSquared( target ) < 1e-10 ) break;

	}
	if ( pole ) for ( let i = 1; i < end; i ++ ) {

		const previous = points[ i - 1 ];
		const axis = direction.subVectors( points[ i + 1 ], previous );
		if ( axis.lengthSq() < EPSILON ) continue;
		axis.normalize();
		const offset = points[ i ].clone().sub( previous );
		const along = offset.dot( axis );
		const radius = offset.addScaledVector( axis, - along ).length();
		if ( radius < EPSILON ) continue;
		points[ i ].copy( previous ).addScaledVector( axis, along )
			.addScaledVector( perpendicular( THREE, axis, pole.clone().sub( previous ) ), radius );

	}
	return true;

}

function solve( THREE, entry, snapshots ) {

	const { owner, rig, chain, target, pole, settings } = entry;
	rig.updateWorldMatrix( true, false );
	if ( ! rig.matrixWorld.determinant() ) return;
	const rigToWorld = rig.matrixWorld.clone();
	const worldToRig = rigToWorld.clone().invert();
	const getEnd = vector => settings.useTail ?
		owner.localToWorld( vector.set( 0, owner.userData.armatureBone.length, 0 ) ) : owner.getWorldPosition( vector );
	const points = chain.map( bone => bone.getWorldPosition( new THREE.Vector3() ).applyMatrix4( worldToRig ) );
	points.push( getEnd( new THREE.Vector3() ).applyMatrix4( worldToRig ) );
	const goal = target.getWorldPosition( new THREE.Vector3() ).applyMatrix4( worldToRig );
	const polePoint = pole?.getWorldPosition( new THREE.Vector3() ).applyMatrix4( worldToRig );
	if ( ! Number.isFinite( goal.lengthSq() ) || polePoint && ! Number.isFinite( polePoint.lengthSq() ) ) return;
	if ( ! solvePoints( THREE, points, goal, polePoint, settings.iterations ) ) return;

	const start = chain.map( bone => bone.quaternion.clone() );
	const parentInverse = new THREE.Matrix4(), current = new THREE.Vector3(), desired = new THREE.Vector3();
	const delta = new THREE.Quaternion();
	for ( const [ i, bone ] of chain.entries() ) {

		bone.updateWorldMatrix( true, false );
		if ( ! bone.parent.matrixWorld.determinant() ) continue;
		parentInverse.copy( bone.parent.matrixWorld ).invert();
		if ( i + 1 < chain.length ) chain[ i + 1 ].getWorldPosition( current );
		else getEnd( current );
		current.applyMatrix4( parentInverse ).sub( bone.position );
		desired.copy( points[ i + 1 ] ).applyMatrix4( rigToWorld ).applyMatrix4( parentInverse ).sub( bone.position );
		if ( current.lengthSq() < EPSILON || desired.lengthSq() < EPSILON ) continue;
		if ( ! snapshots.has( bone ) ) snapshots.set( bone, start[ i ] );
		bone.quaternion.premultiply( delta.setFromUnitVectors( current.normalize(), desired.normalize() ) );
		bone.updateMatrix();

	}
	if ( settings.influence < 1 ) for ( const [ i, bone ] of chain.entries() ) {

		bone.quaternion.slerp( start[ i ], 1 - settings.influence );
		bone.updateMatrix();

	}

}

// Keep authored rotations separate from the evaluated pose used by rendering,
// picking, graph queries and kinematic physics.
export function withArmatureIK( THREE, scene, evaluate, skipRig = null ) {

	if ( solving.has( scene ) ) return evaluate();
	const entries = orderedConstraints( scene );
	if ( ! entries.length && ! skipRig ) return evaluate();
	const snapshots = new Map();
	solving.add( scene );
	try {

		for ( const entry of entries ) if ( ! skipRig || armatureOf( entry.owner ) !== skipRig ) solve( THREE, entry, snapshots );
		scene.updateMatrixWorld( true );
		return evaluate();

	} finally {

		for ( const [ bone, original ] of snapshots ) {

			bone.quaternion.copy( original );
			bone.updateMatrix();

		}
		solving.delete( scene );
		scene.updateMatrixWorld( true );

	}

}
