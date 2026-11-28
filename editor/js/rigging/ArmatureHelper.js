import {
	BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, OctahedronGeometry, Vector3
} from 'three';
import { boneVisibleInCollections } from './BoneCollections.js';

const head = [ 0, 0, 0 ];
const tail = [ 0, 1, 0 ];
const crossSection = [ [ .14, .25, 0 ], [ 0, .25, .14 ], [ - .14, .25, 0 ], [ 0, .25, - .14 ] ];
const lines = crossSection.flatMap( ( point, i ) => [ ...head, ...point, ...point, ...tail, ...point, ...crossSection[ ( i + 1 ) % 4 ] ] );

export function createBoneHelper( editor, bone ) {

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new Float32BufferAttribute( lines, 3 ) );
	const material = new LineBasicMaterial( { color: 0xaeb8c8, depthTest: false, toneMapped: false } );
	const helper = new LineSegments( geometry, material );
	helper.type = 'ArmatureBoneHelper';
	helper.isSkeletonHelper = true;
	helper.matrixAutoUpdate = false;
	helper.frustumCulled = false;
	helper.renderOrder = 3;
	helper.userData.object = bone;

	const point = new Vector3();
	const hitGeometry = new OctahedronGeometry( 1 );
	const hitPositions = hitGeometry.attributes.position;
	for ( let index = 0; index < hitPositions.count; index ++ ) {

		point.fromBufferAttribute( hitPositions, index );
		hitPositions.setXYZ( index, point.x * .17, .25 + point.y * ( point.y > 0 ? .75 : .25 ), point.z * .17 );

	}
	const picker = new Mesh( hitGeometry, new MeshBasicMaterial( { visible: false } ) );
	picker.name = 'picker';
	picker.userData.object = bone;
	helper.add( picker );
	const jointGeometry = new OctahedronGeometry( .045 );
	const joints = [ 'head', 'tail' ].map( ( part, index ) => {

		const marker = new Mesh( jointGeometry, new MeshBasicMaterial( { depthTest: false, toneMapped: false } ) );
		marker.position.y = index;
		marker.renderOrder = 4;
		marker.visible = false;
		helper.add( marker );
		return { marker, part };

	} );

	const update = helper.updateMatrixWorld;
	const scale = new Vector3();
	helper.updateMatrixWorld = function ( force ) {

		bone.updateWorldMatrix( true, false );
		const workspace = editor.viewTools?.armature;
		const editing = workspace?.editing && workspace.rig.getObjectById( bone.id );
		const rest = editing ? workspace.restFor( bone ) : bone.userData.armatureBone;
		this.matrix.copy( bone.matrixWorld ).scale( scale.setScalar( rest.length ) );
		this.matrixWorldNeedsUpdate = true;
		this.material.color.setHex( editor.selected === bone ? 0x65b5ff : editor.selector.selection.includes( bone ) ? 0x4089c1 : 0xaeb8c8 );
		for ( const { marker, part } of joints ) {

			marker.visible = !! editing && ( part === 'tail' || ! rest.connected || ! boneVisibleInCollections( bone.parent ) );
			const active = editing && editor.selector.selection.includes( bone ) && ( workspace.part === 'body' || workspace.part === part );
			marker.material.color.setHex( active ? 0x65b5ff : 0xaeb8c8 );

		}
		update.call( this, force );

	};
	helper.dispose = () => {

		geometry.dispose();
		material.dispose();
		hitGeometry.dispose();
		picker.material.dispose();
		jointGeometry.dispose();
		for ( const { marker } of joints ) marker.material.dispose();

	};
	return helper;

}
