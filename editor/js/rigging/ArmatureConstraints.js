import { armatureOf } from './Armature.js';
import { hasRestriction } from '../ObjectRestrictions.js';

export const constraintTypes = {
	copyLocation: { label: 'Copy Location', channel: 'location', target: true, mixes: [ 'replace', 'add' ] },
	copyRotation: { label: 'Copy Rotation', channel: 'rotation', target: true, mixes: [ 'replace', 'add', 'before', 'after' ] },
	copyScale: { label: 'Copy Scale', channel: 'scale', target: true, mixes: [ 'replace', 'multiply' ] },
	copyTransforms: { label: 'Copy Transforms', channel: 'transforms', target: true },
	limitLocation: { label: 'Limit Location', channel: 'location', limit: true },
	limitRotation: { label: 'Limit Rotation', channel: 'rotation', limit: true },
	limitScale: { label: 'Limit Scale', channel: 'scale', limit: true },
	dampedTrack: { label: 'Damped Track', target: true },
	limitDistance: { label: 'Limit Distance', target: true }
};

export const constraintSpaces = [ 'world', 'local', 'pose' ];
export const trackAxes = [ 'X', 'Y', 'Z', '-X', '-Y', '-Z' ];
export const distanceModes = [ 'inside', 'outside', 'surface' ];
export const eulerOrders = [ 'XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX' ];
export const AXES = 'XYZ';

function axisValues( value ) {

	return Array.isArray( value ) && value.length === 3 && value.every( axis => axis === null || Number.isFinite( axis ) );

}

export function constraintSettings( value ) {

	const { type, id, name, influence = 1, muted = false } = value ?? {};
	if ( ! Object.hasOwn( constraintTypes, type ) || typeof id !== 'string' || ! id ||
		typeof name !== 'string' || ! name.trim() || typeof muted !== 'boolean' ||
		! Number.isFinite( influence ) || influence < 0 || influence > 1 ) return null;
	const definition = constraintTypes[ type ];
	const settings = { type, id, name: name.trim(), influence, muted };
	if ( definition.target ) {

		const { target = '', headTail = 0 } = value;
		if ( typeof target !== 'string' || ! Number.isFinite( headTail ) || headTail < 0 || headTail > 1 ) return null;
		Object.assign( settings, { target, headTail } );

	}
	if ( definition.channel ) {

		const { ownerSpace = definition.limit ? 'local' : 'world', targetSpace = 'world' } = value;
		if ( ! constraintSpaces.includes( ownerSpace ) || definition.target && ! constraintSpaces.includes( targetSpace ) ) return null;
		settings.ownerSpace = ownerSpace;
		if ( definition.target ) settings.targetSpace = targetSpace;

	}
	if ( definition.mixes ) {

		const { axes = AXES, invert = '', mix = 'replace' } = value;
		if ( typeof axes !== 'string' || ! /^X?Y?Z?$/.test( axes ) || typeof invert !== 'string' || ! /^X?Y?Z?$/.test( invert ) ||
			! definition.mixes.includes( mix ) ) return null;
		Object.assign( settings, { axes, invert, mix } );

	}
	if ( definition.channel === 'rotation' ) {

		const { order = 'XYZ' } = value;
		if ( ! eulerOrders.includes( order ) ) return null;
		settings.order = order;

	}
	if ( definition.limit ) {

		const { min = [ null, null, null ], max = [ null, null, null ] } = value;
		if ( ! axisValues( min ) || ! axisValues( max ) || min.some( ( axis, i ) => axis !== null && max[ i ] !== null && axis > max[ i ] ) ) return null;
		if ( type === 'limitScale' && [ ...min, ...max ].some( axis => axis !== null && axis < 0 ) ) return null;
		Object.assign( settings, { min: min.slice(), max: max.slice() } );

	}
	if ( type === 'dampedTrack' ) {

		const { trackAxis = 'Y' } = value;
		if ( ! trackAxes.includes( trackAxis ) ) return null;
		settings.trackAxis = trackAxis;

	}
	if ( type === 'limitDistance' ) {

		const { distance = 1, mode = 'inside' } = value;
		if ( ! Number.isFinite( distance ) || distance < 0 || ! distanceModes.includes( mode ) ) return null;
		Object.assign( settings, { distance, mode } );

	}
	return settings;

}

export function boneConstraint( bone, idOrName ) {

	const stack = bone?.userData.armatureConstraints;
	return Array.isArray( stack ) && ( stack.find( item => item?.id === idOrName ) ?? stack.find( item => item?.name === idOrName ) ) || null;

}

export function resolveBoneConstraint( scene, owner, settings ) {

	if ( ! settings || ! armatureOf( owner ) || ! owner.userData.armatureBone ) return { error: 'Choose an authored bone and valid constraint settings.' };
	if ( owner.userData.armaturePhysics?.mode === 'dynamic' ) return { error: 'Rapier drives dynamic bones. Choose a pose or kinematic bone.' };
	if ( ! owner.matrixAutoUpdate || hasRestriction( owner, 'disabled' ) ) return { error: 'The owner bone is unavailable.' };
	if ( ! constraintTypes[ settings.type ].target ) return { settings };
	const target = settings.target && scene.getObjectByProperty( 'uuid', settings.target );
	if ( ! target || target === scene || target.userData.runtimeOnly || hasRestriction( target, 'disabled' ) ) return { error: 'Choose an available target.' };
	if ( owner.getObjectById( target.id ) ) return { error: 'A constraint target must stay outside the owner’s descendants and cannot be the owner.' };
	if ( settings.targetSpace === 'pose' && ! armatureOf( target ) ) return { error: 'Pose space needs an armature or a bone target.' };
	return { settings, target };

}

function basisInSpace( THREE, object, space ) {

	const matrix = new THREE.Matrix4();
	if ( space === 'local' ) {

		const rest = object.userData.armatureBone;
		if ( rest ) matrix.compose( new THREE.Vector3().fromArray( rest.position ),
			new THREE.Quaternion().fromArray( rest.quaternion ), new THREE.Vector3( 1, 1, 1 ) ).invert();

	} else {

		object.parent?.updateWorldMatrix( true, false );
		if ( object.parent ) matrix.copy( object.parent.matrixWorld );
		if ( space === 'pose' ) {

			const rig = armatureOf( object );
			rig.updateWorldMatrix( true, false );
			if ( ! rig.matrixWorld.determinant() ) return null;
			matrix.premultiply( rig.matrixWorld.clone().invert() );

		}

	}
	return matrix.determinant() ? matrix : null;

}

function sample( THREE, object, basis, space, headTail = 0 ) {

	if ( object.matrixAutoUpdate ) object.updateMatrix();
	const matrix = new THREE.Matrix4().multiplyMatrices( basis, object.matrix );
	const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
	if ( space === 'local' && object.matrixAutoUpdate ) {

		const rest = object.userData.armatureBone;
		position.copy( object.position ).applyMatrix4( basis );
		rotation.copy( object.quaternion );
		if ( rest ) rotation.premultiply( new THREE.Quaternion().fromArray( rest.quaternion ).invert() );
		scale.copy( object.scale );

	} else {

		matrix.decompose( position, rotation, scale );
		rotation.normalize();

	}
	// The matrix cannot determine a unique rotation if a scale axis is zero.
	// A translation constraint can still use the resulting position.
	if ( headTail && object.userData.armatureBone ) position.set( 0, object.userData.armatureBone.length * headTail, 0 ).applyMatrix4( matrix );
	return { position, rotation, scale };

}

function mixVector( current, target, settings, rotate = false ) {

	const result = current.clone();
	for ( let i = 0; i < 3; i ++ ) {

		const axis = AXES[ i ];
		if ( ! settings.axes.includes( axis ) ) {

			if ( rotate ) result.setComponent( i, 0 );
			continue;

		}
		const joint = target.getComponent( i ) * ( settings.invert.includes( axis ) ? - 1 : 1 );
		const value = current.getComponent( i );
		let next = joint;
		if ( settings.mix === 'add' && ! rotate ) next += value;
		if ( settings.mix === 'multiply' ) next *= value;
		result.setComponent( i, next );

	}
	return result;

}

function eulerVector( THREE, rotation, order ) {

	const euler = new THREE.Euler().setFromQuaternion( rotation, order );
	return new THREE.Vector3( euler.x, euler.y, euler.z );

}

function eulerRotation( THREE, vector, order ) {

	return new THREE.Quaternion().setFromEuler( new THREE.Euler( vector.x, vector.y, vector.z, order ) );

}

function validRotation( rotation ) {

	return rotation && Number.isFinite( rotation.lengthSq() ) && rotation.lengthSq() > 1e-8;

}

function copyRotation( THREE, before, target, settings ) {

	if ( ! validRotation( before ) || ! validRotation( target ) ) return;
	const { mix, order } = settings;
	const original = eulerVector( THREE, before, order );
	const sampled = eulerVector( THREE, target, order );
	const combined = mixVector( original, sampled, settings, mix !== 'replace' );
	if ( mix === 'add' ) combined.add( original );
	const rotation = eulerRotation( THREE, combined, order );
	if ( mix === 'before' ) return rotation.multiply( before );
	if ( mix === 'after' ) return rotation.premultiply( before );
	return rotation;

}

function limit( value, settings ) {

	return value.clone().clamp(
		value.clone().fromArray( settings.min.map( axis => axis ?? - Infinity ) ),
		value.clone().fromArray( settings.max.map( axis => axis ?? Infinity ) )
	);

}

function limitAngles( value, { min, max } ) {

	const turn = 2 * Math.PI;
	return value.fromArray( value.toArray().map( ( angle, i ) => {

		const low = min[ i ], high = max[ i ];
		if ( low !== null && high !== null ) {

			if ( high - low >= turn ) return angle;
			const center = low + ( high - low ) / 2;
			angle += turn * Math.round( ( center - angle ) / turn );

		}
		return Math.min( high ?? Infinity, Math.max( low ?? - Infinity, angle ) );

	} ) );

}

function applyTransform( THREE, bone, settings, target ) {

	const ownerBasis = basisInSpace( THREE, bone, settings.ownerSpace );
	const targetBasis = target && basisInSpace( THREE, target, settings.targetSpace );
	if ( ! ownerBasis || target && ! targetBasis ) return;
	const owner = sample( THREE, bone, ownerBasis, settings.ownerSpace );
	const input = target && sample( THREE, target, targetBasis, settings.targetSpace, settings.headTail );
	const { influence } = settings;
	let position, rotation, scale;
	switch ( settings.type ) {

		case 'copyLocation': position = mixVector( owner.position, input.position, settings ); break;
		case 'copyRotation': rotation = copyRotation( THREE, owner.rotation, input.rotation, settings ); break;
		case 'copyScale': scale = mixVector( owner.scale, input.scale, settings ); break;
		case 'copyTransforms': ( { position, rotation, scale } = input ); break;
		case 'limitLocation': position = limit( owner.position, settings ); break;
		case 'limitRotation':
			if ( validRotation( owner.rotation ) ) rotation = eulerRotation( THREE, limitAngles( eulerVector( THREE, owner.rotation, settings.order ), settings ), settings.order );
			break;
		case 'limitScale': scale = limit( owner.scale.clone().fromArray( owner.scale.toArray().map( Math.abs ) ), settings ); break;

	}
	if ( position && ! position.equals( owner.position ) && Number.isFinite( position.lengthSq() ) ) {

		bone.position.lerp( position.applyMatrix4( ownerBasis.clone().invert() ), influence );

	}
	const changesRotation = validRotation( rotation ) && ( ! validRotation( owner.rotation ) || 1 - Math.abs( rotation.dot( owner.rotation ) ) > 1e-12 );
	if ( changesRotation ) {

		const parentOrientation = new THREE.Quaternion();
		ownerBasis.decompose( new THREE.Vector3(), parentOrientation, new THREE.Vector3() );
		bone.quaternion.slerp( rotation.premultiply( parentOrientation.normalize().invert() ).normalize(), influence );

	}
	if ( scale && Number.isFinite( scale.lengthSq() ) && ( changesRotation || ! scale.equals( owner.scale ) ) ) {

		if ( settings.ownerSpace === 'local' ) {

			bone.scale.lerp( scale, influence );
			return;

		}
		// Convert each axis length in the constraint space to a local scale.
		// The basis may have non-uniform scale, so orientation matters.
		const basis = ownerBasis.multiply( new THREE.Matrix4().makeRotationFromQuaternion( bone.quaternion ) );
		const column = new THREE.Vector3();
		const stretch = new THREE.Vector3().fromArray( [ 0, 1, 2 ].map( i => column.setFromMatrixColumn( basis, i ).length() ) );
		if ( basis.determinant() < 0 ) stretch.x *= - 1;
		if ( stretch.x && stretch.y && stretch.z ) bone.scale.lerp( scale.divide( stretch ), influence );

	}

}

function track( THREE, bone, target, settings ) {

	bone.parent.updateWorldMatrix( true, false );
	if ( ! bone.parent.matrixWorld.determinant() ) return;
	const point = target.localToWorld( new THREE.Vector3( 0, ( target.userData.armatureBone?.length ?? 0 ) * settings.headTail, 0 ) );
	const toward = bone.parent.worldToLocal( point ).sub( bone.position );
	const axis = new THREE.Vector3().setComponent( AXES.indexOf( settings.trackAxis.at( - 1 ) ), settings.trackAxis.startsWith( '-' ) ? - 1 : 1 );
	axis.multiply( bone.scale );
	if ( toward.lengthSq() < 1e-12 || axis.lengthSq() < 1e-12 ) return;
	axis.normalize().applyQuaternion( bone.quaternion );
	const goal = new THREE.Quaternion().setFromUnitVectors( axis, toward.normalize() ).multiply( bone.quaternion );
	bone.quaternion.slerp( goal, settings.influence );

}

function limitDistance( THREE, bone, target, settings ) {

	bone.parent.updateWorldMatrix( true, false );
	if ( ! bone.parent.matrixWorld.determinant() ) return;
	const center = target.localToWorld( new THREE.Vector3( 0, ( target.userData.armatureBone?.length ?? 0 ) * settings.headTail, 0 ) );
	const radial = bone.getWorldPosition( new THREE.Vector3() ).sub( center );
	const length = radial.length();
	const { distance, mode, influence } = settings;
	if ( mode === 'inside' && length <= distance || mode === 'outside' && length >= distance ) return;
	if ( length < 1e-7 ) radial.set( 0, 1, 0 );
	const goal = center.addScaledVector( radial.normalize(), distance );
	bone.position.lerp( bone.parent.worldToLocal( goal ), influence );

}

export function solveBoneConstraint( THREE, bone, { settings, target } ) {

	if ( settings.type === 'dampedTrack' ) track( THREE, bone, target, settings );
	else if ( settings.type === 'limitDistance' ) limitDistance( THREE, bone, target, settings );
	else applyTransform( THREE, bone, settings, target );
	bone.updateMatrix();

}
