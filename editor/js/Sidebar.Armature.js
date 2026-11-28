import * as THREE from 'three';
import { UIButton, UINumber, UIPanel, UIRow, UIText } from './libs/ui.js';
import { SidebarBonePhysics, SidebarRigCollider } from './Sidebar.RigPhysics.js';
import { SidebarArmatureIK } from './Sidebar.ArmatureIK.js';
import { SidebarConstraints } from './Sidebar.Constraints.js';
import { hasRestriction } from './ObjectRestrictions.js';
import { armatureBones, armatureOf, bonePoseOffsets, boneRestFrames, boneRestTail, isArmature } from './rigging/Armature.js';
import { canDeformWithArmature } from './rigging/ArmatureDeformation.js';
import { addRigBone, bindArmature, commitArmatureWeights, editBoneRest, editRigSpaceBoneRest, reparentBone, resetArmaturePose, setBonePose } from './rigging/ArmatureTools.js?v=armature-x-mirror';

function sceneArmatures( scene ) {

	const rigs = [];
	scene.traverse( object => { if ( isArmature( object ) ) rigs.push( object ); } );
	return rigs;

}

export function hasArmatureTools( scene, object ) {

	return !! armatureOf( object ) || !! object?.userData.armatureBinding || !! object?.userData.armatureCollider ||
		canDeformWithArmature( object ) && sceneArmatures( scene ).length > 0;

}

export function SidebarArmature( editor ) {

	const panel = new UIPanel().setPaddingTop( '10px' );
	const pose = new UIPanel();
	panel.add( pose );
	const picker = document.createElement( 'select' );
	picker.className = 'Select';
	picker.setAttribute( 'aria-label', 'Select armature bone' );
	const pickerRow = new UIRow();
	pickerRow.add( new UIText( 'Bone' ).setClass( 'Label' ) );
	pickerRow.dom.appendChild( picker );
	pose.add( pickerRow );
	const root = new UIButton( 'Add Root Bone' ).onClick( () => run( () => addRigBone( editor, rig ) ) );
	const extrude = new UIButton( 'Extrude Bone' ).onClick( () => run( () => addRigBone( editor, rig, { parent: bone } ) ) );
	const reset = new UIButton( 'Reset Pose' ).onClick( () => run( () => resetArmaturePose( editor, bone || rig ) ) );
	const editMode = new UIButton( 'Edit Rest Skeleton' ).onClick( () => editor.viewTools.setWorkspaceMode( 'armature-edit' ) );
	const poseMode = new UIButton( 'Pose Mode' ).onClick( () => editor.viewTools.setWorkspaceMode( 'pose' ) );
	pose.add( new UIRow().add( editMode, poseMode ), new UIRow().add( root, extrude ), new UIRow().add( reset ) );

	const restPanel = new UIPanel();
	pose.add( restPanel );
	const head = pointFields( restPanel, 'Rest Head', saveRest );
	const tail = pointFields( restPanel, 'Rest Tail', saveRest );
	const roll = new UINumber( 0 ).setPrecision( 2 ).setUnit( '°' ).setWidth( '64px' ).onChange( () => run( () =>
		( editor.viewTools.armature.editing ? editRigSpaceBoneRest : editBoneRest )( editor, bone, { roll: THREE.MathUtils.degToRad( roll.getValue() ) } ) ) );
	roll.dom.setAttribute( 'aria-label', 'Bone roll degrees' );
	restPanel.add( new UIRow().add( new UIText( 'Roll' ).setClass( 'Label' ), roll ) );
	const parent = document.createElement( 'select' );
	parent.className = 'Select';
	parent.setAttribute( 'aria-label', 'Bone parent' );
	const parentRow = new UIRow().add( new UIText( 'Parent' ).setClass( 'Label' ) );
	parentRow.dom.append( parent );
	parent.onchange = () => run( () => reparentBone( editor, bone, editor.objectByUuid( parent.value ) ) );
	const connected = document.createElement( 'input' );
	connected.type = 'checkbox';
	connected.setAttribute( 'aria-label', 'Connected to parent' );
	connected.onchange = () => run( () => reparentBone( editor, bone, bone.parent, connected.checked ) );
	const connectionRow = new UIRow().add( new UIText( 'Connected' ).setClass( 'Label' ) );
	connectionRow.dom.append( connected );
	restPanel.add( parentRow, connectionRow );
	const offsetsPanel = new UIPanel();
	const offsets = Object.fromEntries( [ [ 'location', 'Pose Location' ], [ 'rotation', 'Pose Rotation' ], [ 'scale', 'Pose Scale' ] ].map( ( [ key, label ] ) =>
		[ key, pointFields( offsetsPanel, label, () => run( () => {

			const values = offsets[ key ].map( field => field.getValue() );
			setBonePose( editor, bone, { [ key ]: key === 'rotation' ? values.map( THREE.MathUtils.degToRad ) : values } );

		} ) ) ] ) );
	pose.add( offsetsPanel );
	const physics = SidebarBonePhysics( editor, run );
	const ik = SidebarArmatureIK( editor, run );
	const constraints = SidebarConstraints( editor, run );
	pose.add( constraints, ik, physics );
	const binding = new UIPanel();
	const rigPicker = document.createElement( 'select' );
	rigPicker.className = 'Select';
	rigPicker.setAttribute( 'aria-label', 'Deform with armature' );
	const rigRow = new UIRow().add( new UIText( 'Armature' ).setClass( 'Label' ) );
	rigRow.dom.appendChild( rigPicker );
	const bind = new UIButton( 'Bind Automatic Weights' ).onClick( () => run( () => {

		bindArmature( editor, editor.selected, editor.objectByUuid( rigPicker.value ), influences.getValue() );

	} ) );
	const clear = new UIButton( 'Clear Binding' ).onClick( () => run( () => bindArmature( editor, editor.selected, null ) ) );
	const paint = new UIButton( 'Paint Weights' ).onClick( () => editor.viewTools.setWorkspaceMode( 'weights' ) );
	const resetWeights = new UIButton( 'Reset Painted Weights' ).onClick( () => run( () => commitArmatureWeights( editor, editor.selected, null ) ) );
	const influences = new UINumber( 4 ).setPrecision( 0 ).setRange( 1, 4 ).setStep( 1 ).setWidth( '56px' );
	influences.dom.setAttribute( 'aria-label', 'Max bone influences' );
	binding.add( rigRow, new UIRow().add( new UIText( 'Influences' ).setClass( 'Label' ), influences ), new UIRow().add( bind, clear ), new UIRow().add( paint, resetWeights ) );
	panel.add( binding );
	const collider = SidebarRigCollider( editor, run );
	panel.add( collider );
	const status = document.createElement( 'div' );
	status.setAttribute( 'role', 'status' );
	panel.dom.appendChild( status );
	let rig, bone;
	let boundObject, boundData;

	function pointFields( host, label, change ) {

		const row = new UIRow().add( new UIText( label ).setClass( 'Label' ) );
		const fields = [ 'X', 'Y', 'Z' ].map( axis => {

			const field = new UINumber( 0 ).setPrecision( 3 ).setWidth( '56px' ).onChange( change );
			field.dom.setAttribute( 'aria-label', label + ' ' + axis );
			row.add( field );
			return field;

		} );
		host.add( row );
		return fields;

	}

	function run( action ) {

		status.textContent = '';
		try { action(); }
		catch ( error ) { sync(); status.textContent = error.message; }

	}

	function saveRest() {

		if ( ! bone ) return;
		const points = {
			head: head.map( input => input.getValue() ),
			tail: tail.map( input => input.getValue() )
		};
		run( () => ( editor.viewTools.armature.editing ? editRigSpaceBoneRest : editBoneRest )( editor, bone, points ) );

	}

	function sync() {

		const object = editor.selected;
		rig = armatureOf( object );
		bone = rig && object.isBone ? object : null;
		pose.setDisplay( rig ? '' : 'none' );
		const rigs = ! rig && canDeformWithArmature( object ) ? sceneArmatures( editor.scene ) : [];
		updateBinding( object, rigs );
		physics.setObject( bone );
		ik.setObject( bone );
		constraints.setObject( editor.viewTools?.armature.editing ? null : bone );
		collider.setObject( object, rigs.length > 0 );
		if ( ! rig ) return;
		const options = [ new Option( rig.name, rig.uuid ) ];
		for ( const child of armatureBones( rig ) ) {

			let depth = 0;
			for ( let parent = child.parent; parent !== rig; parent = parent.parent ) depth ++;
			options.push( new Option( ' '.repeat( depth ) + child.name, child.uuid ) );

		}
		picker.replaceChildren( ...options );
		picker.value = ( bone || rig ).uuid;
		const locked = hasRestriction( bone || rig, 'locked' ) || hasRestriction( bone || rig, 'disabled' );
		const rigLocked = hasRestriction( rig, 'locked' ) || hasRestriction( rig, 'disabled' );
		const workspace = editor.viewTools?.armature;
		const posing = workspace?.mode === 'pose';
		editMode.setDisabled( rigLocked || workspace?.editing );
		poseMode.setDisabled( rigLocked || posing );
		root.setDisabled( rigLocked || posing );
		extrude.setDisplay( bone ? '' : 'none' ).setDisabled( locked || posing );
		reset.setDisabled( locked );
		const rest = bone?.userData.armatureBone;
		restPanel.setDisplay( rest && ! posing ? '' : 'none' );
		offsetsPanel.setDisplay( rest && posing ? '' : 'none' );
		if ( rest && posing ) {

			const transform = bonePoseOffsets( THREE, bone );
			for ( const [ key, fields ] of Object.entries( offsets ) ) fields.forEach( ( field, axis ) => field.setValue(
				key === 'rotation' ? THREE.MathUtils.radToDeg( transform[ key ][ axis ] ) : transform[ key ][ axis ]
			).setDisabled( locked ) );

		} else if ( rest ) {

			const frame = workspace?.editing ? boneRestFrames( THREE, rig ).get( bone ) : null;
			const start = frame ? frame.head.toArray() : rest.position;
			const end = frame ? frame.tail.toArray() : boneRestTail( THREE, rest );
			for ( let axis = 0; axis < 3; axis ++ ) {

				head[ axis ].setValue( start[ axis ] ).setDisabled( locked );
				tail[ axis ].setValue( end[ axis ] ).setDisabled( locked );

			}
			roll.setValue( THREE.MathUtils.radToDeg( rest.roll ) ).setDisabled( locked );
			const candidates = armatureBones( rig ).filter( candidate => ! bone.getObjectById( candidate.id ) && candidate.userData.armatureBone );
			parent.replaceChildren( new Option( 'None', rig.uuid ), ...candidates.map( item => new Option( item.name, item.uuid ) ) );
			parent.value = bone.parent.uuid;
			parent.disabled = locked;
			connected.checked = rest.connected;
			connected.disabled = locked || bone.parent === rig;

		}

	}

	function updateBinding( object, rigs ) {

		const data = object?.userData.armatureBinding;
		const supportsGeometry = ! rig && canDeformWithArmature( object );
		const visible = ! rig && ( rigs.length > 0 || !! data );
		binding.setDisplay( visible ? '' : 'none' );
		if ( ! visible ) return;
		const picked = boundObject === object && boundData === data ? rigPicker.value : data?.rig;
		const options = rigs.map( item => new Option( item.name || 'Armature', item.uuid ) );
		if ( data && ! rigs.some( item => item.uuid === data.rig ) ) options.unshift( new Option( 'Missing armature', data.rig ) );
		rigPicker.replaceChildren( ...options );
		if ( options.some( option => option.value === picked ) ) rigPicker.value = picked;
		if ( boundObject !== object || boundData !== data ) influences.setValue( data?.influences ?? 4 );
		boundObject = object;
		boundData = data;
		const locked = hasRestriction( object, 'locked' ) || hasRestriction( object, 'disabled' );
		rigPicker.disabled = locked || ! rigs.length;
		influences.setDisabled( locked || ! supportsGeometry );
		bind.setDisabled( locked || ! rigs.some( item => item.uuid === rigPicker.value ) );
		clear.setDisplay( data ? '' : 'none' ).setDisabled( locked );
		paint.setDisplay( data ? '' : 'none' ).setDisabled( locked || ! rigs.some( item => item.uuid === data?.rig ) );
		resetWeights.setDisplay( data?.weightSamples ? '' : 'none' ).setDisabled( locked );

	}

	picker.onchange = () => { status.textContent = ''; editor.selectByUuid( picker.value ); };
	rigPicker.onchange = sync;
	editor.signals.objectSelected.add( () => { status.textContent = ''; sync(); } );
	editor.signals.sceneGraphChanged.add( sync );
	editor.signals.transformSettingsChanged.add( key => { if ( key === 'armatureMode' ) sync(); } );
	editor.signals.objectChanged.add( object => { if ( object === editor.selected || armatureOf( object ) === rig && rig ) sync(); } );
	sync();
	return panel;

}
