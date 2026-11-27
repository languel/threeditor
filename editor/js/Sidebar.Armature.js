import * as THREE from 'three';
import { UIButton, UINumber, UIPanel, UIRow, UIText } from './libs/ui.js';
import { SidebarBonePhysics, SidebarRigCollider } from './Sidebar.RigPhysics.js';
import { SidebarArmatureIK } from './Sidebar.ArmatureIK.js';
import { hasRestriction } from './ObjectRestrictions.js';
import { armatureBones, armatureOf, boneRestTail, isArmature } from './rigging/Armature.js';
import { canDeformWithArmature } from './rigging/ArmatureDeformation.js';
import { addRigBone, bindArmature, editBoneRest, resetArmaturePose } from './rigging/ArmatureTools.js';

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
	pose.add( new UIRow().add( root, extrude ), new UIRow().add( reset ) );

	const restPanel = new UIPanel();
	pose.add( restPanel );
	const head = pointFields( 'Rest Head' );
	const tail = pointFields( 'Rest Tail' );
	const roll = new UINumber( 0 ).setPrecision( 2 ).setUnit( '°' ).setWidth( '64px' ).onChange( saveRest );
	roll.dom.setAttribute( 'aria-label', 'Bone roll degrees' );
	restPanel.add( new UIRow().add( new UIText( 'Roll' ).setClass( 'Label' ), roll ) );
	const physics = SidebarBonePhysics( editor, run );
	const ik = SidebarArmatureIK( editor, run );
	pose.add( ik, physics );
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
	const influences = new UINumber( 4 ).setPrecision( 0 ).setRange( 1, 4 ).setStep( 1 ).setWidth( '56px' );
	influences.dom.setAttribute( 'aria-label', 'Max bone influences' );
	binding.add( rigRow, new UIRow().add( new UIText( 'Influences' ).setClass( 'Label' ), influences ), new UIRow().add( bind, clear ) );
	panel.add( binding );
	const collider = SidebarRigCollider( editor, run );
	panel.add( collider );
	const status = document.createElement( 'div' );
	status.setAttribute( 'role', 'status' );
	panel.dom.appendChild( status );
	let rig, bone;
	let boundObject, boundData;

	function pointFields( label ) {

		const row = new UIRow().add( new UIText( label ).setClass( 'Label' ) );
		const fields = [ 'X', 'Y', 'Z' ].map( axis => {

			const field = new UINumber( 0 ).setPrecision( 3 ).setWidth( '56px' ).onChange( saveRest );
			field.dom.setAttribute( 'aria-label', label + ' ' + axis );
			row.add( field );
			return field;

		} );
		restPanel.add( row );
		return fields;

	}

	function run( action ) {

		status.textContent = '';
		try { action(); }
		catch ( error ) { sync(); status.textContent = error.message; }

	}

	function saveRest() {

		if ( ! bone ) return;
		run( () => editBoneRest( editor, bone, {
			head: head.map( input => input.getValue() ),
			tail: tail.map( input => input.getValue() ),
			roll: THREE.MathUtils.degToRad( roll.getValue() )
		} ) );

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
		root.setDisabled( hasRestriction( rig, 'locked' ) || hasRestriction( rig, 'disabled' ) );
		extrude.setDisplay( bone ? '' : 'none' ).setDisabled( locked );
		reset.setDisabled( locked );
		const rest = bone?.userData.armatureBone;
		restPanel.setDisplay( rest ? '' : 'none' );
		if ( rest ) {

			const end = boneRestTail( THREE, rest );
			for ( let axis = 0; axis < 3; axis ++ ) {

				head[ axis ].setValue( rest.position[ axis ] ).setDisabled( locked );
				tail[ axis ].setValue( end[ axis ] ).setDisabled( locked );

			}
			roll.setValue( THREE.MathUtils.radToDeg( rest.roll ) ).setDisabled( locked );

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

	}

	picker.onchange = () => { status.textContent = ''; editor.selectByUuid( picker.value ); };
	rigPicker.onchange = sync;
	editor.signals.objectSelected.add( () => { status.textContent = ''; sync(); } );
	editor.signals.sceneGraphChanged.add( sync );
	editor.signals.objectChanged.add( object => { if ( object === editor.selected || armatureOf( object ) === rig && rig ) sync(); } );
	sync();
	return panel;

}
