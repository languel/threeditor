import { armatureOf, boneRestScale } from './Armature.js?v=armature-apply';
import { constraintSettings } from './ArmatureConstraints.js';
import { timelineData } from '../animation/TimelineData.js';

export function armatureTransformBake( THREE, matrix ) {

	const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), dimensions = new THREE.Vector3();
	matrix.decompose( position, rotation, dimensions );
	const scale = dimensions.x;
	const uniform = new THREE.Matrix4().compose( position, rotation, new THREE.Vector3().setScalar( scale ) );
	if ( ! ( scale > 0 ) || matrix.elements.some( ( value, i ) =>
		! Number.isFinite( uniform.elements[ i ] ) || Math.abs( value - uniform.elements[ i ] ) > 1e-8 * Math.max( 1, Math.abs( value ) ) ) ) {

		throw new Error( 'Applying armature transforms requires a positive uniform scale and a rotation without shear.' );

	}
	return {
		matrix, inverse: matrix.clone().invert(), scale, rotation,
		rotates: Math.hypot( rotation.x, rotation.y, rotation.z ) > 1e-8,
		translates: position.lengthSq() > 1e-16
	};

}

export function bakedRestBone( THREE, rest, bake ) {

	return {
		...rest,
		position: new THREE.Vector3().fromArray( rest.position ).applyMatrix4( bake.matrix ).toArray(),
		quaternion: new THREE.Quaternion().fromArray( rest.quaternion ).premultiply( bake.rotation ).toArray(),
		scale: boneRestScale( rest ) * bake.scale
	};

}

export function bakedArmatureLinks( THREE, scene, bakes, children, change ) {

	const objects = new Map();
	scene.traverse( object => { objects.set( object.uuid, object ); } );
	function correction( basis, bake ) {

		const matrix = new THREE.Matrix4();
		if ( basis ) matrix.fromArray( basis );
		return matrix.multiply( bake.inverse ).toArray();

	}
	for ( const object of objects.values() ) {

		if ( object.userData.runtimeOnly ) continue;
		const binding = object.userData.armatureBinding;
		const bound = binding && bakes.get( objects.get( binding.rig ) );
		if ( bound ) {

			const previousScale = binding.weightDistanceScale;
			const distanceScale = ( Number.isFinite( previousScale ) && previousScale > 0 ? previousScale : 1 ) * bound.scale;
			const bind = new THREE.Matrix4().fromArray( binding.objectToRig ).premultiply( bound.matrix );
			if ( ! Number.isFinite( distanceScale ) || ! bind.elements.every( Number.isFinite ) ) throw new Error( 'Could not preserve the binding of ' + object.name + '.' );
			change( object, { armatureBinding: { ...binding, objectToRig: bind.toArray(), weightDistanceScale: distanceScale } } );

		}
		const ik = object.userData.armatureIK;
		if ( ik && [ ik.target, ik.pole ].some( uuid => bakes.get( objects.get( uuid ) )?.translates ) ) {

			throw new Error( 'An IK control on ' + object.name + ' targets the armature origin. Choose a bone or an attached Empty before applying its location.' );

		}
		const raw = object.userData.armatureConstraints;
		if ( ! raw?.length ) continue;
		let changed = false;
		const stack = raw.map( entry => {

			const settings = constraintSettings( entry );
			if ( ! settings ) return entry;
			const target = objects.get( settings.target );
			const targetRoot = bakes.get( target );
			const ownerPose = settings.ownerSpace === 'pose' && bakes.get( armatureOf( object ) );
			const targetPose = settings.targetSpace === 'pose' && bakes.get( armatureOf( target ) );
			if ( targetRoot && settings.type === 'childOf' ) {

				changed = true;
				const inverse = settings.inverse ? new THREE.Matrix4().fromArray( settings.inverse ) : new THREE.Matrix4();
				return { ...entry, inverse: inverse.premultiply( targetRoot.matrix ).toArray() };

			}
			if ( targetRoot ) {

				const positionOnly = [ 'copyLocation', 'limitDistance', 'dampedTrack' ].includes( settings.type );
				if ( ! positionOnly || targetRoot.translates || settings.targetSpace === 'pose' ) {

					throw new Error( 'The constraint ' + settings.name + ' on ' + object.name + ' reads the armature origin. Choose a bone or an attached Empty as its target.' );

				}

			}
			if ( target && ! target.isBone && children.has( target ) && settings.targetSpace === 'local' ) {

				throw new Error( 'The constraint ' + settings.name + ' reads a child’s local transform. Use World Space before applying the armature transform.' );

			}
			if ( ! ownerPose && ! targetPose ) return entry;
			changed = true;
			return {
				...entry,
				...( ownerPose ? { ownerPoseBasis: correction( entry.ownerPoseBasis, ownerPose ) } : {} ),
				...( targetPose ? { targetPoseBasis: correction( entry.targetPoseBasis, targetPose ) } : {} )
			};

		} );
		if ( changed ) change( object, { armatureConstraints: stack } );

	}

}

export function rebasedArmatureTimeline( THREE, scene, bakes, children ) {

	const properties = new Set( [ 'position', 'rotation', 'scale', 'quaternion', 'matrix' ] );
	const byId = new Map( [ ...children.keys(), ...bakes.keys() ].map( object => [ object.uuid, object ] ) );
	scene.traverse( owner => {

		for ( const clip of owner.animations || [] ) for ( const track of clip.tracks ) {

			const parsed = THREE.PropertyBinding.parseTrackName( track.name );
			if ( ! properties.has( parsed.propertyName ) ) continue;
			let node = THREE.PropertyBinding.findNode( owner, parsed.nodeName );
			if ( parsed.objectName === 'bones' ) node = node?.skeleton?.getBoneByName?.( parsed.objectIndex ) ?? node;
			const bake = children.get( node );
			const property = parsed.propertyName;
			const changes = bake && ( ! bake.matrix || property === 'position' || property === 'matrix' ||
				( property === 'scale' ? bake.scale !== 1 : bake.rotates ) );
			if ( bakes.has( node ) || changes ) throw new Error( 'Imported animation ' + clip.name + ' controls ' + node.name + '. Its transform keys require rebaking before this edit.' );

		}

	} );
	const timeline = timelineData( scene );
	let changed = false;
	const clips = timeline.clips.map( clip => ( {
		...clip, tracks: ( clip.tracks || [] ).map( track => {

			const { target } = track;
			if ( target?.kind !== 'object' || ! properties.has( target.property ) || ! track.keys?.length ) return track;
			const object = byId.get( target.object );
			if ( bakes.has( object ) ) throw new Error( object.name + ' has animated armature object transforms.' );
			const bake = children.get( object );
			if ( ! bake ) return track;
			if ( ! bake.matrix || target.property === 'rotation' && bake.rotates || target.property === 'quaternion' || target.property === 'matrix' ) {

				throw new Error( 'This operation changes how ' + object.name + ' interpolates its transform keys.' );

			}
			if ( target.property === 'rotation' || target.property === 'scale' && bake.scale === 1 ) return track;
			changed = true;
			return { ...track, keys: track.keys.map( key => {

				const value = new THREE.Vector3().fromArray( key.value );
				if ( target.property === 'position' ) value.applyMatrix4( bake.matrix );
				else value.multiplyScalar( bake.scale );
				return { ...key, value: value.toArray() };

			} ) };

		} )
	} ) );
	return changed ? { ...timeline, clips } : null;

}
