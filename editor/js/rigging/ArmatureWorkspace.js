import * as THREE from 'three';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';
import { armatureBones, armatureOf, boneRestFrames } from './Armature.js';
import { withArmaturePose } from './ArmaturePose.js';
import { stageBoneRest } from './ArmatureRestEditing.js';
import { combineSelection, selectionRegionIntersectsSegment } from '../modeling/MeshSelection.js';
import { addRigBone, commitBoneRest, reparentBones, resetBonesPose } from './ArmatureTools.js';

export class ArmatureWorkspace {

	constructor( editor, report ) {

		Object.assign( this, { editor, report } );
		this.mode = '';
		this.rig = null;
		this.part = 'body';
		this.proxy = new THREE.Object3D();
		this.proxy.name = 'Armature transform pivot';
		editor.sceneHelpers.add( this.proxy );
		editor.signals.objectSelected.add( object => {

			if ( ! this.mode ) return;
			if ( armatureOf( object ) !== this.rig ) this.setMode( '' );
			else this.syncProxy();

		} );
		editor.signals.objectChanged.add( object => {

			if ( this.drag && object === this.proxy ) this.update();
			else if ( this.editing && ! this.drag ) this.syncProxy();

		} );
		editor.signals.sceneGraphChanged.add( () => {

			if ( this.editing && ! this.drag ) this.syncProxy();

		} );

	}

	get editing() { return this.mode === 'armature-edit'; }

	get selectedBones() {

		return this.editor.selector.selection.filter( bone => bone.userData.armatureBone && armatureOf( bone ) === this.rig );

	}

	selectable( bone ) {

		return isVisible( bone ) && ! hasRestriction( bone, 'unselectable' );

	}

	setMode( mode ) {

		if ( this.mode === mode ) return;
		const { editor } = this;
		const rig = mode ? armatureOf( editor.selected ) : null;
		if ( mode && ( ! rig || hasRestriction( rig, 'locked' ) || hasRestriction( rig, 'disabled' ) ) ) return;
		editor.modalTransform?.cancel();
		if ( this.drag ) this.finish( false );
		this.mode = mode;
		this.rig = rig;
		this.part = 'body';
		if ( rig ) {

			const selected = this.selectedBones;
			const first = armatureBones( rig ).find( bone => bone.userData.armatureBone && this.selectable( bone ) );
			if ( selected.length ) editor.selector.setSelection( selected );
			else if ( first ) editor.select( first );

		}
		this.syncProxy();
		editor.signals.transformSettingsChanged.dispatch( 'armatureMode' );

	}

	selectAll( all ) {

		this.part = 'body';
		const bones = all ? armatureBones( this.rig ).filter( bone => bone.userData.armatureBone && this.selectable( bone ) ) : [];
		this.editor.selector.setSelection( bones.length ? bones : [ this.rig ] );
		this.syncProxy();
		this.editor.signals.transformSettingsChanged.dispatch( 'armatureSelection' );

	}

	pickRest( rect, camera, x, y ) {

		const frames = boneRestFrames( THREE, this.rig );
		const project = point => {

			const screen = this.rig.localToWorld( point.clone() ).project( camera );
			return screen.z >= - 1 && screen.z <= 1 ? new THREE.Vector2(
				rect.left + ( screen.x + 1 ) * rect.width / 2, rect.top + ( 1 - screen.y ) * rect.height / 2
			) : null;

		};
		const cursor = new THREE.Vector2( x, y );
		let joint, body, jointDistance = 11, bodyDistance = 12;
		for ( const [ bone, frame ] of frames ) {

			if ( ! this.selectable( bone ) ) continue;
			const head = project( frame.head ), tail = project( frame.tail );
			for ( const [ part, point ] of [ [ 'tail', tail ], [ 'head', head ] ] ) {

				if ( part === 'head' && bone.userData.armatureBone.connected && this.selectable( bone.parent ) ) continue;
				const distance = point?.distanceTo( cursor );
				if ( distance < jointDistance ) {

					jointDistance = distance;
					joint = { bone, part };

				}

			}
			if ( ! head || ! tail ) continue;
			const delta = tail.clone().sub( head );
			const lengthSq = delta.lengthSq();
			const along = lengthSq ? THREE.MathUtils.clamp( cursor.clone().sub( head ).dot( delta ) / lengthSq, 0, 1 ) : 0;
			const distance = cursor.distanceTo( head.addScaledVector( delta, along ) );
			if ( distance < bodyDistance ) {

				body = { bone, part: 'body' };
				bodyDistance = distance;

			}

		}
		return joint ?? body;

	}

	selectHit( hit, extend ) {

		if ( ! hit ) {

			if ( ! extend ) this.selectAll( false );
			return;

		}
		this.part = extend ? 'body' : hit.part;
		if ( extend && this.editor.selected !== this.rig ) {

			const remaining = this.selectedBones.filter( bone => bone !== hit.bone );
			const selection = remaining.length === this.selectedBones.length ? [ ...remaining, hit.bone ] : remaining;
			this.editor.selector.setSelection( selection.length ? selection : [ this.rig ] );

		} else this.editor.select( hit.bone );
		this.syncProxy();
		this.editor.signals.transformSettingsChanged.dispatch( 'armatureSelection' );

	}

	selectRegion( region, project, radius ) {

		const hits = new Map();
		const include = () => {

			for ( const bone of armatureBones( this.rig ) ) {

				if ( ! bone.userData.armatureBone || ! this.selectable( bone ) ) continue;
				const head = project( bone.getWorldPosition( new THREE.Vector3() ) );
				const length = this.restFor( bone ).length;
				const tail = project( bone.localToWorld( new THREE.Vector3( 0, length, 0 ) ) );
				if ( selectionRegionIntersectsSegment( region, head, tail, radius ) ) hits.set( bone.uuid, bone );

			}

		};
		if ( this.editing ) this.withRest( include );
		else withArmaturePose( THREE, this.editor.scene, include );
		const original = new Map( [ ...region.initial ].filter( ( [ , object ] ) => object.userData.armatureBone ) );
		const selected = [ ...combineSelection( original, hits, region.operation ).values() ];
		this.part = 'body';
		this.editor.selector.setSelection( selected.length ? selected : [ this.rig ] );
		this.syncProxy();
		this.editor.signals.transformSettingsChanged.dispatch( 'armatureSelection' );

	}

	addRoot() {

		const point = this.rig.worldToLocal( this.editor.cursor.clone() );
		const tail = point.clone().add( new THREE.Vector3( 0, 1, 0 ) );
		this.part = 'body';
		return addRigBone( this.editor, this.rig, { head: point.toArray(), tail: tail.toArray() } );

	}

	extrude() {

		const parent = this.selectedBones.at( - 1 );
		if ( ! parent ) return;
		this.part = 'tail';
		addRigBone( this.editor, this.rig, { parent } );

	}

	clearPose( channels ) {

		resetBonesPose( this.editor, this.selectedBones, channels );

	}

	focus() {

		const bounds = new THREE.Box3();
		const bones = this.selectedBones;
		const include = () => {

			for ( const bone of bones ) {

				bounds.expandByPoint( bone.getWorldPosition( new THREE.Vector3() ) );
				const length = bone.userData.armatureBone.length;
				bounds.expandByPoint( bone.localToWorld( new THREE.Vector3( 0, length, 0 ) ) );

			}

		};
		if ( this.editing ) this.withRest( include );
		else withArmaturePose( THREE, this.editor.scene, include );
		this.editor.focus( bounds.isEmpty() ? this.rig : bounds );

	}

	parentSelection( mode ) {

		const bones = this.selectedBones;
		const parent = mode === 'clear' ? this.rig : bones.pop();
		reparentBones( this.editor, bones, parent, mode === 'connected' );

	}

	syncProxy() {

		if ( ! this.editing ) return;
		const bone = this.selectedBones.at( - 1 );
		const frame = bone && boneRestFrames( THREE, this.rig ).get( bone );
		if ( ! frame ) return;
		const point = this.part === 'tail' ? frame.tail : frame.head;
		this.proxy.position.copy( this.rig.localToWorld( point.clone() ) );
		this.proxy.quaternion.copy( this.rig.getWorldQuaternion( new THREE.Quaternion() ) ).multiply( frame.quaternion );
		this.proxy.scale.set( 1, 1, 1 );
		this.proxy.updateMatrixWorld( true );

	}

	get canTransform() {

		const selected = this.selectedBones;
		return this.editing && this.rig.matrixWorld.determinant() !== 0 && selected.length > 0 && selected.every( bone => isVisible( bone ) &&
			! hasRestriction( bone, 'locked' ) && ! hasRestriction( bone, 'disabled' ) );

	}

	begin() {

		if ( this.drag || ! this.canTransform ) return false;
		this.syncProxy();
		this.drag = {
			selected: this.selectedBones, frames: boneRestFrames( THREE, this.rig ),
			inversePivot: this.proxy.matrixWorld.clone().invert(), orientation: this.proxy.quaternion.clone(),
			worldToRig: this.rig.matrixWorld.clone().invert(), rigRotation: this.rig.getWorldQuaternion( new THREE.Quaternion() )
		};
		return true;

	}

	update() {

		const { selected, frames, inversePivot, orientation, worldToRig, rigRotation } = this.drag;
		const sweep = worldToRig.clone().multiply( this.proxy.matrixWorld ).multiply( inversePivot ).multiply( this.rig.matrixWorld );
		const rotation = rigRotation.clone().invert().multiply( this.proxy.quaternion ).multiply( orientation.clone().invert() ).multiply( rigRotation );
		const edits = new Map();
		for ( const bone of selected ) {

			const frame = frames.get( bone ), points = {};
			if ( this.part !== 'tail' ) points.head = frame.head.clone().applyMatrix4( sweep );
			if ( this.part !== 'head' ) points.tail = frame.tail.clone().applyMatrix4( sweep );
			if ( this.part === 'body' ) points.quaternion = frame.quaternion.clone().premultiply( rotation );
			edits.set( bone, points );

		}
		try {

			this.drag.changes = stageBoneRest( THREE, this.rig, edits );
			this.drag.error = null;

		} catch ( error ) {

			this.drag.changes = null;
			this.drag.error = error;

		}

	}

	finish( accept ) {

		const drag = this.drag;
		if ( ! drag ) return;
		this.drag = null;
		if ( accept ) this.report( () => {

			if ( drag.error ) throw drag.error;
			if ( drag.changes ) commitBoneRest( this.editor, drag.changes );

		} );
		this.syncProxy();
		this.editor.signals.transformSettingsChanged.dispatch( 'armatureSelection' );

	}

	restFor( bone ) {

		return this.drag?.changes?.get( bone ) ?? bone.userData.armatureBone;

	}

	withRest( draw ) {

		if ( ! this.editing ) return draw();
		const snapshots = [], rig = this.rig;
		try {

			for ( const bone of armatureBones( rig ) ) {

				const rest = this.restFor( bone );
				if ( ! rest ) continue;
				snapshots.push( [ bone, bone.position.clone(), bone.quaternion.clone(), bone.scale.clone() ] );
				bone.position.fromArray( rest.position );
				bone.quaternion.fromArray( rest.quaternion );
				bone.scale.set( 1, 1, 1 );
				bone.updateMatrix();

			}
			rig.updateWorldMatrix( true, true );
			return draw();

		} finally {

			for ( const [ bone, position, quaternion, scale ] of snapshots ) {

				bone.position.copy( position );
				bone.quaternion.copy( quaternion );
				bone.scale.copy( scale );
				bone.updateMatrix();

			}
			rig.updateWorldMatrix( true, true );

		}

	}

}
