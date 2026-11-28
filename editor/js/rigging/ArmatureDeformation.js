import { armatureBones, isArmature } from './Armature.js';
import { withArmaturePose } from './ArmaturePose.js';
import { normalizeBoneWeights, paintBoneWeight, weightPointKey } from './ArmatureWeights.js';
import { hasRestriction } from '../ObjectRestrictions.js';

const records = new WeakMap();
const activeScenes = new WeakSet();

export function canDeformWithArmature( object ) {

	const positions = object?.geometry?.attributes.position;
	return !! positions?.count && positions.itemSize === 3 && ( object.isMesh || object.isLine || object.isPoints ) &&
		! object.isSkinnedMesh && ! object.isInstancedMesh && ! object.isBatchedMesh && ! object.splats && ! object.userData.runtimeOnly;

}

function restEntries( THREE, rig ) {

	const position = new THREE.Vector3(), rotation = new THREE.Quaternion();
	const unitScale = new THREE.Vector3( 1, 1, 1 );
	const matrixByBone = new Map();
	const entries = [];
	for ( const bone of armatureBones( rig ) ) {

		const rest = bone.userData.armatureBone;
		if ( ! rest ) continue;
		const matrix = new THREE.Matrix4().compose( position.fromArray( rest.position ), rotation.fromArray( rest.quaternion ), unitScale );
		const parent = matrixByBone.get( bone.parent );
		if ( parent ) matrix.premultiply( parent );
		else if ( bone.parent !== rig ) continue;
		matrixByBone.set( bone, matrix );
		if ( rest.deform !== false ) entries.push( {
			bone, rest, inverseRest: matrix.clone().invert(),
			segment: new THREE.Line3(
				new THREE.Vector3().setFromMatrixPosition( matrix ),
				new THREE.Vector3( 0, rest.length, 0 ).applyMatrix4( matrix )
			)
		} );

	}
	return entries;

}

// Pick the nearest bone segments and normalize their distance-based weights.
// Measuring in armature rest space keeps weights fixed while the rig is posed.
function automaticWeights( THREE, position, bones, objectToRig, count ) {

	const indices = new Uint32Array( count * position.count );
	const weights = new Float32Array( indices.length );
	const point = new THREE.Vector3(), nearest = new THREE.Vector3();
	const scores = new Float64Array( count );
	const groups = new Map();
	for ( const [ id, { bone, rest } ] of bones.entries() ) {

		const key = rest.weightGroup || bone.uuid;
		if ( ! groups.has( key ) ) groups.set( key, [] );
		groups.get( key ).push( id );

	}
	for ( let vertex = 0; vertex < position.count; vertex ++ ) {

		point.fromBufferAttribute( position, vertex ).applyMatrix4( objectToRig );
		scores.fill( 0 );
		const start = vertex * count;
		for ( const group of groups.values() ) {

			// A subdivided bone still ranks as one influence against the rest
			// of the rig. Its nearest segment receives that influence.
			let id = group[ 0 ], distance2 = Infinity;
			for ( const candidate of group ) {

				bones[ candidate ].segment.closestPointToPoint( point, true, nearest );
				const distance = point.distanceToSquared( nearest );
				if ( distance < distance2 ) {

					id = candidate;
					distance2 = distance;

				}

			}
			const score = 1 / ( ( distance2 + .0025 ) ** 2 );
			for ( let rank = 0; rank < count; rank ++ ) {

				if ( score <= scores[ rank ] ) continue;
				for ( let offset = count - 1; offset > rank; offset -- ) {

					scores[ offset ] = scores[ offset - 1 ];
					indices[ start + offset ] = indices[ start + offset - 1 ];

				}
				scores[ rank ] = score;
				indices[ start + rank ] = id;
				break;

			}

		}
		const total = scores.reduce( ( sum, value ) => sum + value, 0 );
		for ( let rank = 0; rank < count; rank ++ ) weights[ start + rank ] = total ? scores[ rank ] / total : ( rank === 0 ? 1 : 0 );

	}
	return { indices, weights };

}

export function releaseArmatureGeometry( object ) {

	const entry = records.get( object );
	entry?.output.dispose();
	records.delete( object );

}

function skinRecord( THREE, object, rig, binding ) {

	const source = object.geometry;
	const position = source.attributes.position;
	const normal = source.attributes.normal;
	const attributes = [ source.index, ...Object.values( source.attributes ) ];
	const versions = attributes.map( attribute => attribute?.data?.version ?? attribute?.version );
	let entry = records.get( object );
	const bones = armatureBones( rig ).filter( bone => bone.userData.armatureBone );
	const rest = bones.map( bone => bone.userData.armatureBone );
	const parents = bones.map( bone => bone.parent );
	if ( entry?.binding === binding && entry.source === source && entry.attributes.length === attributes.length &&
		attributes.every( ( attribute, index ) => attribute === entry.attributes[ index ] && versions[ index ] === entry.versions[ index ] ) &&
		entry.bones.length === bones.length &&
		bones.every( ( bone, index ) => bone === entry.bones[ index ] && rest[ index ] === entry.rest[ index ] && parents[ index ] === entry.parents[ index ] ) ) {

		return entry;

	}
	releaseArmatureGeometry( object );
	const segments = restEntries( THREE, rig );
	if ( ! segments.length ) return;
	const count = Math.min( segments.length, binding.influences );
	const reference = new THREE.Matrix4().fromArray( binding.objectToRig );
	const skin = automaticWeights( THREE, position, segments, reference, count );
	const boneIds = segments.map( entry => entry.bone.uuid );
	const samples = binding.weightSamples;
	if ( samples ) for ( let vertex = 0; vertex < position.count; vertex ++ ) {

		const override = samples[ weightPointKey( position, vertex ) ];
		const normalized = override && normalizeBoneWeights( override, boneIds, count );
		if ( ! normalized ) continue;
		let slot = vertex * count;
		skin.weights.fill( 0, slot, slot + count );
		for ( const [ bone, weight ] of Object.entries( normalized ) ) {

			skin.indices[ slot ] = boneIds.indexOf( bone );
			skin.weights[ slot ++ ] = weight;

		}

	}
	entry = {
		binding, source, position, normal, attributes, versions, bones, rest, parents,
		segments, count, boneIds, ...skin, output: source.clone(), meshWorld: null, boneWorld: [],
		matrices: segments.map( () => new THREE.Matrix4() ), normals: segments.map( () => new THREE.Matrix3() )
	};
	records.set( object, entry );
	return entry;

}

export function armatureVertexWeights( THREE, scene, object ) {

	const binding = object?.userData.armatureBinding;
	if ( ! binding || ! canDeformWithArmature( object ) || ! Array.isArray( binding.objectToRig ) ||
		binding.objectToRig.length !== 16 || ! binding.objectToRig.every( Number.isFinite ) ||
		! Number.isInteger( binding.influences ) || binding.influences < 1 || binding.influences > 4 ) return;
	const rig = scene.getObjectByProperty( 'uuid', binding.rig );
	if ( ! isArmature( rig ) || hasRestriction( rig, 'disabled' ) ) return;
	const entry = skinRecord( THREE, object, rig, binding );
	if ( ! entry ) return;
	const { boneIds, position, count, indices, weights } = entry;
	return {
		bones: entry.segments.map( segment => segment.bone ), boneIds, position, count,
		at( vertex ) {

			if ( ! Number.isInteger( vertex ) || vertex < 0 || vertex >= position.count ) return;
			const result = {};
			for ( let slot = vertex * count; slot < ( vertex + 1 ) * count; slot ++ ) {

				if ( weights[ slot ] > 0 ) result[ boneIds[ indices[ slot ] ] ] = weights[ slot ];

			}
			return result;

		}
	};

}

export function weightsForVertexEdits( THREE, scene, object, bone, vertices, value ) {

	const weights = armatureVertexWeights( THREE, scene, object );
	if ( ! weights?.boneIds.includes( bone ) ) throw new Error( 'Choose a deforming bone from the object’s armature.' );
	if ( ! Number.isFinite( value ) || value < 0 || value > 1 ) throw new Error( 'Weight must be between zero and one.' );
	const samples = {};
	for ( const vertex of vertices ) {

		const current = weights.at( vertex );
		if ( ! current ) throw new Error( 'Vertex index is outside the rest geometry.' );
		samples[ weightPointKey( weights.position, vertex ) ] = paintBoneWeight( current, bone, value, weights.boneIds, weights.count );

	}
	return samples;

}

function deform( THREE, object, rig, entry ) {

	const { segments, output, position, normal, matrices, normals, count, indices, weights } = entry;
	object.updateWorldMatrix( true, false );
	rig.updateWorldMatrix( true, true );
	if ( ! object.matrixWorld.determinant() || ! rig.matrixWorld.determinant() ) return;
	const meshToRig = new THREE.Matrix4().copy( rig.matrixWorld ).invert().multiply( object.matrixWorld );
	if ( entry.meshWorld?.equals( object.matrixWorld ) && entry.rigWorld.equals( rig.matrixWorld ) &&
		segments.every( ( { bone }, index ) => entry.boneWorld[ index ].equals( bone.matrixWorld ) ) ) return output;
	entry.meshWorld = object.matrixWorld.clone();
	entry.rigWorld = rig.matrixWorld.clone();
	entry.boneWorld = segments.map( ( { bone } ) => bone.matrixWorld.clone() );
	const worldToMesh = new THREE.Matrix4().copy( object.matrixWorld ).invert();

	for ( const [ index, { bone, inverseRest } ] of segments.entries() ) {

		matrices[ index ].multiplyMatrices( worldToMesh, bone.matrixWorld ).multiply( inverseRest ).multiply( meshToRig );
		normals[ index ].getNormalMatrix( matrices[ index ] );

	}
	const deformed = output.attributes.position;
	const deformedNormal = output.attributes.normal;
	const initial = new THREE.Vector3(), vertex = new THREE.Vector3(), component = new THREE.Vector3();
	const initialNormal = new THREE.Vector3(), sumNormal = new THREE.Vector3();
	for ( let index = 0; index < position.count; index ++ ) {

		initial.fromBufferAttribute( position, index );
		vertex.set( 0, 0, 0 );
		if ( normal ) initialNormal.fromBufferAttribute( normal, index );
		sumNormal.set( 0, 0, 0 );
		for ( let influence = index * count; influence < ( index + 1 ) * count; influence ++ ) {

			const weight = weights[ influence ];
			if ( weight === 0 ) continue;
			const joint = indices[ influence ];
			vertex.addScaledVector( component.copy( initial ).applyMatrix4( matrices[ joint ] ), weight );
			if ( normal ) sumNormal.addScaledVector( component.copy( initialNormal ).applyMatrix3( normals[ joint ] ), weight );

		}
		deformed.setXYZ( index, vertex.x, vertex.y, vertex.z );
		if ( normal ) {

			sumNormal.normalize();
			deformedNormal.setXYZ( index, sumNormal.x, sumNormal.y, sumNormal.z );

		}

	}
	deformed.needsUpdate = true;
	if ( normal ) deformedNormal.needsUpdate = true;
	output.boundingBox = output.boundingSphere = null;
	return output;

}

// Scope the posed geometry to presentation and ray queries. Modeling tools and
// scene serialization can continue to use the original editable rest geometry.
export function withArmatureDeformation( THREE, scene, draw, skip = null, skipRig = null ) {

	return withArmaturePose( THREE, scene, () => withWeightedPose( THREE, scene, draw, skip, skipRig ), skipRig );

}

function withWeightedPose( THREE, scene, draw, skip, skipRig ) {

	if ( activeScenes.has( scene ) ) return draw();
	activeScenes.add( scene );
	const changes = [];
	try {

		scene.traverseVisible( object => {

			const binding = object.userData.armatureBinding;
			if ( ! binding ) {

				if ( records.has( object ) ) releaseArmatureGeometry( object );
				return;

			}
			if ( object === skip || binding.rig === skipRig?.uuid || ! canDeformWithArmature( object ) || hasRestriction( object, 'disabled' ) ) return;
			if ( ! Array.isArray( binding.objectToRig ) || binding.objectToRig.length !== 16 || ! binding.objectToRig.every( Number.isFinite ) ||
				! Number.isInteger( binding.influences ) || binding.influences < 1 || binding.influences > 4 ) return;
			const rig = scene.getObjectByProperty( 'uuid', binding.rig );
			if ( ! isArmature( rig ) ) { releaseArmatureGeometry( object ); return; }
			if ( hasRestriction( rig, 'disabled' ) ) return;
			const entry = skinRecord( THREE, object, rig, binding );
			const geometry = entry && deform( THREE, object, rig, entry );
			if ( ! geometry ) return;
			changes.push( [ object, object.geometry ] );
			object.geometry = geometry;

		} );
		return draw();

	} finally {

		for ( const [ object, source ] of changes ) object.geometry = source;
		activeScenes.delete( scene );

	}

}
