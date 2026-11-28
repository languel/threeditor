import * as THREE from 'three';
import { hasRestriction } from '../ObjectRestrictions.js';
import { selectionRoots } from '../ObjectParenting.js?v=editor-panes';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { SetPositionCommand } from '../commands/SetPositionCommand.js';
import { SetRotationCommand } from '../commands/SetRotationCommand.js';
import { SetScaleCommand } from '../commands/SetScaleCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { pencilSamples } from './ModelGeometry.js?v=texture-projection';
import { isArmature } from '../rigging/Armature.js';
import { constraintSettings } from '../rigging/ArmatureConstraints.js';
import { armatureTransformBake, bakedArmatureLinks, bakedRestBone, rebasedArmatureTimeline } from '../rigging/ArmatureTransformBake.js';

export const applyTransformOptions = [
	[ 'location', 'Location' ],
	[ 'rotation', 'Rotation' ],
	[ 'scale', 'Scale' ],
	[ 'all', 'All Transforms' ],
	[ 'rotationScale', 'Rotation & Scale' ]
];

const identity = new THREE.Matrix4();

function matricesMatch( a, b ) {

	return a.elements.every( ( value, i ) => Number.isFinite( b.elements[ i ] ) &&
		Math.abs( value - b.elements[ i ] ) <= 1e-8 * Math.max( 1, Math.abs( value ) ) );

}

function editableTransform( object ) {

	return object.matrixAutoUpdate && object.matrixWorldAutoUpdate && ! object.userData.runtimeOnly &&
		! hasRestriction( object, 'locked' ) && ! hasRestriction( object, 'disabled' );

}

function canBakeObject( object, scene ) {

	const data = object.userData, geometry = object.geometry;
	if ( ! object.parent || object === scene || ! editableTransform( object ) || object.isBone ||
		object.isSkinnedMesh || object.isInstancedMesh || object.isBatchedMesh || object.splats ||
		data.armatureBinding || data.armatureConstraints?.length || data.modifierBase ||
		data.measurement || data.assetObject || data.nodeComponents?.geometry ) return false;
	if ( ! geometry ) return object.isGroup || object.type === 'Object3D';
	return ( object.isMesh || object.isLine || object.isPoints ) && geometry.isBufferGeometry &&
		geometry.attributes.position?.itemSize === 3 && ! geometry.isInstancedBufferGeometry &&
		! geometry.attributes.position.isGLBufferAttribute && ! Object.values( geometry.morphAttributes ).some( attributes => attributes.length );

}

export function canApplyObjectTransforms( editor, selection = editor.selector.selection ) {

	return ! editor.modeling.editMode && ! editor.viewTools.mode && ! editor.viewTools.armature?.mode && ! editor.editWorkspace.exclusive &&
		! editor.streams.playing && ! editor.modalTransform.active && ! editor.flyControls?.active &&
		( ! editor.timeline?.recording || ! selection.some( isArmature ) ) &&
		selection.length > 0 && selection.every( object => canBakeObject( object, editor.scene ) );

}

function bakeModelData( data, matrix, mirrored ) {

	if ( ! data?.points ) return;
	const e = matrix.elements;
	const preservesPlane = [ e[ 2 ], e[ 6 ], e[ 14 ] ].every( value => Math.abs( value ) < 1e-8 );
	if ( data.profile || data.kind === 'shape' ) {

		if ( ! preservesPlane || data.depth > 0 &&
			( Math.abs( e[ 8 ] ) >= 1e-8 || Math.abs( e[ 9 ] ) >= 1e-8 || e[ 10 ] <= 0 ) ) {

			throw new Error( 'This transform would move the editable outline out of its local plane.' );

		}
		if ( data.depth > 0 ) data.depth *= e[ 10 ];

	} else if ( ! preservesPlane && data.planar ) data.planar = false;

	if ( data.pencilBrush ) {

		const x = new THREE.Vector3().setFromMatrixColumn( matrix, 0 );
		const y = new THREE.Vector3().setFromMatrixColumn( matrix, 1 );
		const z = new THREE.Vector3().setFromMatrixColumn( matrix, 2 );
		const scale = x.length();
		const tolerance = 1e-8 * scale * scale;
		if ( mirrored || [ y.lengthSq() - scale * scale, z.lengthSq() - scale * scale, x.dot( y ), y.dot( z ), z.dot( x ) ]
			.some( value => Math.abs( value ) > tolerance ) ) {

			throw new Error( 'An editable Pencil stroke requires a uniform, positive bake scale.' );

		}
		const brush = data.pencilBrush;
		const vector = new THREE.Vector3();
		brush.samples = pencilSamples( data ).map( sample => ( {
			...sample, radius: sample.radius * scale,
			normal: vector.fromArray( sample.normal ).transformDirection( matrix ).toArray(),
			right: vector.fromArray( sample.right ).transformDirection( matrix ).toArray(),
			up: vector.fromArray( sample.up ).transformDirection( matrix ).toArray()
		} ) );
		if ( brush.size !== undefined ) brush.size *= scale;

	}

	const point = new THREE.Vector3();
	data.points = data.points.map( values => point.fromArray( values ).applyMatrix4( matrix ).toArray() );
	if ( mirrored ) for ( const face of data.faces || [] ) {

		face.reverse();
		for ( const corners of Object.values( face.surface?.channels || {} ) ) corners.reverse();

	}

}

function bakeGeometry( object, matrix ) {

	// Parametric geometries serialize their constructor parameters instead of
	// their buffers. Store the baked result as ordinary BufferGeometry.
	const geometry = new THREE.BufferGeometry().copy( object.geometry );
	geometry.type = 'BufferGeometry';
	geometry.userData = structuredClone( object.geometry.userData );
	for ( const name of [ 'position', 'normal', 'tangent' ] ) {

		const attribute = geometry.getAttribute( name );
		if ( ! attribute || ! attribute.normalized && ! attribute.isFloat16BufferAttribute &&
			( attribute.array instanceof Float32Array || attribute.array instanceof Float64Array ) ) continue;
		const values = new Float32Array( attribute.count * attribute.itemSize );
		for ( let i = 0; i < attribute.count; i ++ ) {

			const offset = i * attribute.itemSize;
			values[ offset ] = attribute.getX( i );
			values[ offset + 1 ] = attribute.getY( i );
			values[ offset + 2 ] = attribute.getZ( i );
			if ( attribute.itemSize === 4 ) values[ offset + 3 ] = attribute.getW( i );

		}
		geometry.setAttribute( name, new THREE.BufferAttribute( values, attribute.itemSize ) );

	}
	geometry.applyMatrix4( matrix );
	const mirrored = matrix.determinant() < 0;
	if ( mirrored && object.isMesh ) {

		// Three.js flips front-face culling for a reflected object matrix.
		// Preserve that orientation after the reflection moves into geometry.
		const index = geometry.getIndex();
		const count = index?.count ?? geometry.attributes.position.count;
		const indices = index ? Array.from( index.array ) : Array.from( { length: count }, ( _, i ) => i );
		for ( let i = 0; i + 2 < count; i += 3 ) [ indices[ i + 1 ], indices[ i + 2 ] ] = [ indices[ i + 2 ], indices[ i + 1 ] ];
		geometry.setIndex( indices );
		const tangent = geometry.attributes.tangent;
		if ( tangent ) for ( let i = 0; i < tangent.count; i ++ ) tangent.setW( i, - tangent.getW( i ) );

	}
	bakeModelData( geometry.userData.modeling, matrix, mirrored );
	return geometry;

}

function planObjectTransforms( editor, mode, selection ) {

	const selected = new Set( selection );
	const commands = [];
	const bakes = new Map(), rebased = new Map(), metadata = new Map();
	function change( object, values ) {

		metadata.set( object, { ...object.userData, ...metadata.get( object ), ...values } );

	}

	function visit( object, inherited, parentBake ) {

		if ( object.userData.runtimeOnly ) return;
		let carry = identity, armatureBake;
		if ( selected.has( object ) || inherited !== identity ) {

			const name = object.name || object.type;
			const constraints = object.userData.armatureConstraints;
			const changesConstraintFrame = constraints?.length && ( ! parentBake || ! object.userData.armatureBone &&
				Array.isArray( constraints ) && constraints.some( entry => constraintSettings( entry )?.ownerSpace === 'local' ) );
			if ( ! editableTransform( object ) || object.isBone && ! parentBake || changesConstraintFrame ) {

				throw new Error( 'Cannot preserve the transform of ' + name + '.' );

			}
			const position = object.position.clone(), rotation = object.rotation.clone(), scale = object.scale.clone();
			const quaternion = object.quaternion.clone();
			if ( selected.has( object ) ) {

				const local = new THREE.Matrix4().compose( position, quaternion, scale ).premultiply( inherited );
				if ( mode === 'location' || mode === 'all' ) position.set( 0, 0, 0 );
				if ( mode === 'rotation' || mode === 'rotationScale' || mode === 'all' ) {

					rotation.set( 0, 0, 0 );
					quaternion.identity();

				}
				if ( mode === 'scale' || mode === 'rotationScale' || mode === 'all' ) scale.set( 1, 1, 1 );
				const reset = new THREE.Matrix4().compose( position, quaternion, scale );
				if ( reset.determinant() === 0 || local.determinant() === 0 ) throw new Error( 'Cannot apply transforms to ' + name + ' with a zero scale axis.' );
				carry = reset.invert().multiply( local );
				if ( matricesMatch( carry, identity ) ) carry = identity;
				if ( carry !== identity ) {

					if ( isArmature( object ) ) {

						armatureBake = armatureTransformBake( THREE, carry );
						bakes.set( object, armatureBake );

					} else if ( object.geometry ) commands.push( new SetGeometryCommand( editor, object, bakeGeometry( object, carry ) ) );

				}
				if ( parentBake ) rebased.set( object, {} );

			} else if ( parentBake ) {

				position.applyMatrix4( parentBake.matrix );
				if ( parentBake.rotates ) rotation.setFromQuaternion( quaternion.premultiply( parentBake.rotation ), rotation.order );
				scale.multiplyScalar( parentBake.scale );
				const rest = object.userData.armatureBone;
				if ( object.isBone && rest ) change( object, { armatureBone: bakedRestBone( THREE, rest, parentBake ) } );
				rebased.set( object, parentBake );

			} else {

				const local = new THREE.Matrix4().compose( position, quaternion, scale ).premultiply( inherited );
				local.decompose( position, quaternion, scale );
				if ( ! matricesMatch( local, new THREE.Matrix4().compose( position, quaternion, scale ) ) ) {

					throw new Error( 'Applying transforms would shear the child ' + name + '.' );

				}
				rotation.setFromQuaternion( quaternion, object.rotation.order );

			}
			if ( ! position.equals( object.position ) ) commands.push( new SetPositionCommand( editor, object, position ) );
			if ( ! rotation.equals( object.rotation ) ) commands.push( new SetRotationCommand( editor, object, rotation ) );
			if ( ! scale.equals( object.scale ) ) commands.push( new SetScaleCommand( editor, object, scale ) );

		}
		for ( const child of object.children ) visit( child, carry, armatureBake );

	}

	for ( const object of selectionRoots( selection ) ) visit( object, identity );
	if ( bakes.size ) {

		bakedArmatureLinks( THREE, editor.scene, bakes, rebased, change );
		const timeline = rebasedArmatureTimeline( THREE, editor.scene, bakes, rebased );
		if ( timeline ) change( editor.scene, { timeline } );
		for ( const [ object, data ] of metadata ) commands.push( new SetValueCommand( editor, object, 'userData', data ) );

	}
	return { commands, bakes };

}

export function applyObjectTransforms( editor, mode, selection = editor.selector.selection ) {

	const option = applyTransformOptions.find( ( [ value ] ) => value === mode );
	if ( ! option || ! canApplyObjectTransforms( editor, selection ) ) return false;
	const plan = () => planObjectTransforms( editor, mode, selection );
	const containsRig = selection.some( isArmature );
	const { commands, bakes } = containsRig && editor.timeline ? editor.timeline.withBase( plan ) : plan();
	if ( ! commands.length ) return false;
	const name = mode === 'all' ? 'Apply All Transforms' : 'Apply ' + option[ 1 ];
	const command = new MultiCmdsCommand( editor, commands );
	if ( bakes.size ) {

		editor.animationCommands?.animationStop();
		editor.history.execute( command, name );

	} else editor.execute( command, name );
	editor.selector.syncPivot();
	return true;

}
