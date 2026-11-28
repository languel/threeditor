import { constraintSettings } from './ArmatureConstraints.js';
import { bonePhysicsSettings } from './ArmaturePhysicsConfig.js';

export function reflectBoneFrame( THREE, frame ) {

	const { head, tail, quaternion } = frame;
	return {
		head: new THREE.Vector3( - head.x, head.y, head.z ),
		tail: new THREE.Vector3( - tail.x, tail.y, tail.z ),
		quaternion: new THREE.Quaternion( quaternion.x, - quaternion.y, - quaternion.z, quaternion.w )
	};

}

export function mirroredBonePhysics( value ) {

	const settings = bonePhysicsSettings( value );
	if ( ! settings || settings.joint !== 'hinge' || settings.axis === 'X' ) return settings;
	return { ...settings, min: - settings.max, max: - settings.min };

}

export function mirroredBoneConstraint( value, worldReflection, target, id ) {

	const settings = constraintSettings( value );
	if ( ! settings ) return null;
	settings.id = id;
	if ( settings.target ) settings.target = target;
	if ( settings.type === 'dampedTrack' && settings.trackAxis.endsWith( 'X' ) ) {

		settings.trackAxis = settings.trackAxis === 'X' ? '-X' : 'X';

	}
	if ( settings.type === 'limitLocation' || settings.type === 'limitRotation' ) {

		const elements = worldReflection.elements;
		// World axis limits can be transformed exactly for cardinal mirror
		// planes. On tilted planes the original global limits still apply.
		const diagonal = [ elements[ 0 ], elements[ 5 ], elements[ 10 ] ];
		const worldAxis = [ 1, 2, 4, 6, 8, 9 ].some( i => Math.abs( elements[ i ] ) > 1e-8 ) ? -1 :
			diagonal.findIndex( value => Math.abs( value + 1 ) < 1e-8 );
		const axis = settings.ownerSpace === 'world' ? worldAxis : 0;
		if ( axis !== -1 ) for ( let i = 0; i < 3; i ++ ) {

			if ( ( settings.type === 'limitLocation' ) !== ( i === axis ) ) continue;
			const offset = settings.type === 'limitLocation' && settings.ownerSpace === 'world' ? elements[ 12 + i ] : 0;
			const min = settings.min[ i ], max = settings.max[ i ];
			settings.min[ i ] = max === null ? null : offset - max;
			settings.max[ i ] = min === null ? null : offset - min;

		}

	}
	return settings;

}
