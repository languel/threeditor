import { armatureOf, resetBoneTransform } from './Armature.js';
import { bonePhysicsSettings, usesArmaturePhysics } from './ArmaturePhysicsConfig.js';
import { withArmaturePose } from './ArmaturePose.js';
import { hasRestriction } from '../ObjectRestrictions.js';

export const RIG_STEP_RATE = 60;

let engine;
function loadRapier() {

	if ( typeof __THREEEDITOR_HAS_ARMATURE_PHYSICS__ === 'undefined' || __THREEEDITOR_HAS_ARMATURE_PHYSICS__ ) {

		engine ||= import( './vendor/rapier/rapier.mjs' ).then( async ( { default: rapier } ) => {

			await rapier.init();
			return rapier;

		} ).catch( error => { engine = undefined; throw error; } );
		return engine;

	}

}

export async function prepareArmaturePhysics( THREE, scene ) {

	if ( ! usesArmaturePhysics( scene ) ) return;
	const rapier = await loadRapier();
	if ( rapier ) return new ArmaturePhysics( THREE, rapier, scene );

}

export class ArmaturePhysics {

	constructor( THREE, rapier, scene ) {

		this.THREE = THREE;
		this.rapier = rapier;
		this.scene = scene;
		this.initial = new Map();
		this.bodies = new Map();
		this.kinematic = new Map();
		this.colliderOwners = new Map();
		this.frame = 0;
		this.position = new THREE.Vector3();
		this.rotation = new THREE.Quaternion();
		this.scale = new THREE.Vector3();
		this.parentRotation = new THREE.Quaternion();
		this.matrix = new THREE.Matrix4();
		try {

			this.initialize();

		} catch ( error ) {

			this.dispose();
			throw error;

		}

	}

	initialize() {

		if ( this.world ) return;
		withArmaturePose( this.THREE, this.scene, () => this.initializePosed() );

	}

	initializePosed() {

		const { rapier, scene, position, rotation, scale } = this;
		this.world = new rapier.World( { x: 0, y: - 9.81, z: 0 } );
		this.eventQueue = new rapier.EventQueue( true );
		this.world.timestep = 1 / RIG_STEP_RATE;
		scene.updateMatrixWorld( true );
		const dynamic = [];
		scene.traverse( object => {

			if ( hasRestriction( object, 'disabled' ) || ! object.matrixWorld.determinant() ) return;
			if ( object.isBone && object.userData.armatureBone && armatureOf( object ) ) {

				const settings = bonePhysicsSettings( object.userData.armaturePhysics );
				if ( ! settings ) return;
				object.matrixWorld.decompose( position, rotation, scale );
				const length = object.userData.armatureBone.length * Math.abs( scale.y );
				const radius = settings.radius * Math.max( Math.abs( scale.x ), Math.abs( scale.z ) );
				if ( ! Number.isFinite( length + radius ) || length < 1e-5 || radius < 1e-5 ) return;

				const descriptor = settings.mode === 'dynamic' ?
					rapier.RigidBodyDesc.dynamic().setGravityScale( settings.gravity ).setLinearDamping( settings.damping )
						.setAngularDamping( settings.damping ).setCcdEnabled( true ) : rapier.RigidBodyDesc.kinematicPositionBased();
				const boneWorldRotation = rotation.clone();
				const followsHinge = settings.mode === 'dynamic' && settings.joint === 'hinge' &&
					( object.parent?.isBone || settings.anchored );
				// Align both body frames at the initial pose so hinge limits are zeroed there.
				const bodyFrame = followsHinge ? this.parentFrame( object.parent ) : boneWorldRotation;
				const boneFromBody = bodyFrame.clone().invert().multiply( boneWorldRotation );
				const body = this.addBody( descriptor, object, bodyFrame );
				const center = new this.THREE.Vector3( 0, length / 2, 0 ).applyQuaternion( boneFromBody );
				const capsule = rapier.ColliderDesc.capsule( Math.max( 0, length / 2 - radius ), radius )
					.setTranslation( center.x, center.y, center.z ).setRotation( boneFromBody ).setMass( settings.mass );
				this.addCollider( capsule, body, object );
				this.bodies.set( object, { body, settings, boneFromBody, bodyFromBone: boneFromBody.clone().invert() } );
				if ( settings.mode === 'dynamic' ) {

					dynamic.push( object );
					this.initial.set( object, { position: object.position.clone(), rotation: object.quaternion.clone(), scale: object.scale.clone() } );

				} else this.kinematic.set( object, body );

			} else if ( object.isMesh && object.userData.armatureCollider ) {

				this.addSceneCollider( object, object.userData.armatureCollider );

			}

		} );
		this.dynamic = dynamic;
		for ( const bone of dynamic ) this.connect( bone );

	}

	parentFrame( object ) {

		const parent = this.bodies.get( object )?.body;
		const result = new this.THREE.Quaternion();
		if ( ! parent ) return object.getWorldQuaternion( result );
		const q = parent.rotation();
		return result.set( q.x, q.y, q.z, q.w );

	}

	addBody( descriptor, object, frame ) {

		const { position, rotation, scale } = this;
		object.matrixWorld.decompose( position, rotation, scale );
		return this.world.createRigidBody( descriptor.setTranslation( position.x, position.y, position.z ).setRotation( frame || rotation ) );

	}

	addSceneCollider( object, settings ) {

		const { rapier, position, rotation, scale } = this;
		if ( ! [ 'fixed', 'kinematic' ].includes( settings.mode ) || ! object.geometry?.attributes.position?.count ) return;
		if ( ! object.geometry.boundingBox ) object.geometry.computeBoundingBox();
		const bounds = object.geometry.boundingBox;
		if ( bounds.isEmpty() ) return;
		object.matrixWorld.decompose( position, rotation, scale );
		const center = bounds.getCenter( new this.THREE.Vector3() ).multiply( scale );
		const half = bounds.getSize( new this.THREE.Vector3() ).multiply( scale ).multiplyScalar( .5 );
		if ( ! Number.isFinite( half.x + half.y + half.z ) ) return;
		const moving = settings.mode === 'kinematic';
		const body = this.addBody( moving ? rapier.RigidBodyDesc.kinematicPositionBased() : rapier.RigidBodyDesc.fixed(), object );
		const box = rapier.ColliderDesc.cuboid( Math.max( .005, Math.abs( half.x ) ), Math.max( .005, Math.abs( half.y ) ),
			Math.max( .005, Math.abs( half.z ) ) ).setTranslation( center.x, center.y, center.z );
		this.addCollider( box, body, object );
		if ( moving ) this.kinematic.set( object, body );

	}

	addCollider( descriptor, body, object ) {

		const collider = this.world.createCollider( descriptor.setActiveEvents( this.rapier.ActiveEvents.COLLISION_EVENTS ), body );
		this.colliderOwners.set( collider.handle, object );

	}

	connect( bone ) {

		const { rapier, THREE, position, rotation, scale, kinematic } = this;
		const { body, settings, boneFromBody } = this.bodies.get( bone );
		const parent = bone.parent;
		if ( ! parent || ! parent.isBone && ! settings.anchored ) return;

		let anchor = this.bodies.get( parent )?.body || kinematic.get( parent );
		if ( ! anchor ) {

			anchor = this.addBody( rapier.RigidBodyDesc.kinematicPositionBased(), parent );
			kinematic.set( parent, anchor );

		}
		const q = anchor.rotation();
		const parentInverse = new THREE.Quaternion( q.x, q.y, q.z, q.w ).invert();
		const p = anchor.translation();
		bone.matrixWorld.decompose( position, rotation, scale );
		const parentJoint = position.clone().sub( new THREE.Vector3( p.x, p.y, p.z ) ).applyQuaternion( parentInverse );
		const childJoint = new THREE.Vector3();
		let definition;
		if ( settings.joint === 'hinge' ) {

			const axis = new THREE.Vector3();
			axis[ settings.axis.toLowerCase() ] = 1;
			const axisAtParent = axis.clone().applyQuaternion( rotation ).applyQuaternion( parentInverse ).normalize();
			definition = rapier.JointData.revoluteWithAxes( parentJoint, childJoint, axisAtParent, axis.applyQuaternion( boneFromBody ).normalize() );

		} else if ( settings.joint === 'fixed' ) {

			definition = rapier.JointData.fixed( parentJoint, parentInverse.multiply( rotation ), childJoint, new THREE.Quaternion() );

		} else definition = rapier.JointData.spherical( parentJoint, childJoint );

		const joint = this.world.createImpulseJoint( definition, anchor, body, true );
		joint.setContactsEnabled( false );
		if ( settings.joint === 'hinge' && settings.limits ) {

			joint.setLimits( THREE.MathUtils.degToRad( settings.min ), THREE.MathUtils.degToRad( settings.max ) );

		}

	}

	applyPose() {

		if ( ! this.world ) return;
		const { matrix, rotation, parentRotation } = this;
		for ( const bone of this.dynamic ) {

			const { body, boneFromBody } = this.bodies.get( bone );
			const p = body.translation(), q = body.rotation();
			bone.position.set( p.x, p.y, p.z );
			rotation.set( q.x, q.y, q.z, q.w ).multiply( boneFromBody );
			if ( bone.parent ) {

				bone.parent.updateWorldMatrix( true, false );
				bone.position.applyMatrix4( matrix.copy( bone.parent.matrixWorld ).invert() );
				bone.parent.getWorldQuaternion( parentRotation ).invert();
				rotation.premultiply( parentRotation );

			}
			bone.quaternion.copy( rotation );
			bone.updateMatrix();

		}

	}

	rewindIfNeeded( seconds ) {

		if ( Math.floor( seconds * RIG_STEP_RATE + 1e-7 ) < this.frame ) this.reset();

	}

	advanceTo( seconds, maxSteps = Infinity ) {

		if ( ! this.world || ! Number.isFinite( seconds ) || seconds < 0 ) return;
		const { position, rotation, scale } = this;
		const end = Math.min( Math.floor( seconds * RIG_STEP_RATE + 1e-7 ), this.frame + maxSteps );
		while ( this.frame < end ) {

			this.applyPose();
			withArmaturePose( this.THREE, this.scene, () => {

				for ( const [ object, body ] of this.kinematic ) {

					object.updateWorldMatrix( true, false );
					object.matrixWorld.decompose( position, rotation, scale );
					body.setNextKinematicTranslation( position );
					body.setNextKinematicRotation( rotation );

				}

			} );
			this.world.step( this.eventQueue );
			this.frame ++;
			this.eventQueue.drainCollisionEvents( ( a, b, entered ) => {

				const first = this.colliderOwners.get( a ), second = this.colliderOwners.get( b );
				if ( first && second && ( first.isBone || second.isBone ) ) this.onContact?.( first, second, entered );

			} );

		}
		this.applyPose();

	}

	impulse( bone, impulse ) {

		const entry = this.bodies.get( bone );
		if ( ! this.world || entry?.settings.mode !== 'dynamic' ) return false;
		entry.body.applyImpulse( { x: impulse[ 0 ], y: impulse[ 1 ], z: impulse[ 2 ] }, true );
		return true;

	}

	velocity( bone ) {

		const body = this.bodies.get( bone )?.body;
		if ( ! this.world || ! body ) return [ 0, 0, 0 ];
		const velocity = body.linvel();
		return [ velocity.x, velocity.y, velocity.z ];

	}

	resetBone( bone ) {

		const entry = this.bodies.get( bone );
		if ( ! resetBoneTransform( bone ) || ! entry ) return;
		const { body, bodyFromBone } = entry;
		const { position, rotation, scale } = this;
		bone.updateWorldMatrix( true, false );
		bone.matrixWorld.decompose( position, rotation, scale );
		body.setTranslation( position, true );
		body.setRotation( rotation.multiply( bodyFromBone ), true );
		body.setLinvel( { x: 0, y: 0, z: 0 }, true );
		body.setAngvel( { x: 0, y: 0, z: 0 }, true );

	}

	reset() {

		this.dispose();
		this.initialize();

	}

	dispose() {

		if ( ! this.world ) return;
		this.world.free();
		this.world = null;
		this.eventQueue?.free();
		this.eventQueue = null;
		for ( const [ bone, transform ] of this.initial ) {

			bone.position.copy( transform.position );
			bone.quaternion.copy( transform.rotation );
			bone.scale.copy( transform.scale );
			bone.updateMatrix();

		}
		this.initial.clear();
		this.bodies.clear();
		this.kinematic.clear();
		this.colliderOwners.clear();
		this.dynamic = [];
		this.frame = 0;

	}

}
