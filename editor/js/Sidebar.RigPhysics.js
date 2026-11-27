import { UICheckbox, UINumber, UIPanel, UIRow, UISelect, UIText } from './libs/ui.js';
import { hasRestriction } from './ObjectRestrictions.js';
import { bonePhysicsSettings } from './rigging/ArmaturePhysicsConfig.js';
import { setBonePhysics, setRigCollider } from './rigging/ArmatureTools.js';

const defaults = bonePhysicsSettings( { mode: 'dynamic' } );

export function SidebarBonePhysics( editor, run ) {

	const panel = new UIPanel();
	let bone;
	const mode = new UISelect().setOptions( { off: 'Off', kinematic: 'Kinematic capsule', dynamic: 'Dynamic capsule' } );
	row( 'Bone Physics', mode );
	const fields = [
		[ 'radius', 'Capsule Radius', .005, 100 ],
		[ 'mass', 'Mass', .01, 1e4 ],
		[ 'damping', 'Damping', 0, 100 ],
		[ 'gravity', 'Gravity Scale', - 10, 10 ],
		[ 'min', 'Lower Limit', - 180, 180 ],
		[ 'max', 'Upper Limit', - 180, 180 ]
	].map( ( [ key, title, min, max ] ) => {

		const input = new UINumber( defaults[ key ] ).setPrecision( 3 ).setRange( min, max ).setWidth( '68px' );
		if ( key === 'min' || key === 'max' ) input.setUnit( '°' );
		return { key, input, title };

	} );
	const joint = new UISelect().setOptions( { ball: 'Ball', hinge: 'Hinge', fixed: 'Fixed' } );
	const axis = new UISelect().setOptions( { X: 'X', Y: 'Y', Z: 'Z' } );
	const anchored = new UICheckbox( false );
	const limits = new UICheckbox( false );
	for ( const field of fields.slice( 0, 4 ) ) field.row = row( field.title, field.input );
	const anchorRow = row( 'Anchor Root', anchored );
	const jointRow = row( 'Parent Joint', joint );
	const axisRow = row( 'Hinge Axis', axis );
	const limitsRow = row( 'Hinge Limits', limits );
	for ( const field of fields.slice( 4 ) ) field.row = row( field.title, field.input );

	function row( title, input ) {

		input.dom.setAttribute( 'aria-label', title );
		const label = new UIText( title ).setClass( 'Label' );
		const row = new UIRow().add( label, input );
		input.onChange( save );
		panel.add( row );
		return row;

	}

	function save() {

		if ( ! bone ) return;
		const values = Object.fromEntries( fields.map( field => [ field.key, field.input.getValue() ] ) );
		run( () => setBonePhysics( editor, bone, {
			...values, mode: mode.getValue(), joint: joint.getValue(), axis: axis.getValue(), limits: limits.getValue(), anchored: anchored.getValue()
		} ) );

	}

	panel.setObject = ( object ) => {

		bone = object?.userData.armatureBone ? object : null;
		panel.setDisplay( bone ? '' : 'none' );
		if ( ! bone ) return;
		const saved = bonePhysicsSettings( bone.userData.armaturePhysics );
		const settings = saved || defaults;
		const locked = hasRestriction( bone, 'locked' ) || hasRestriction( bone, 'disabled' );
		const dynamic = saved?.mode === 'dynamic';
		const root = ! bone.parent?.isBone;
		const jointed = dynamic && ( ! root || settings.anchored );
		const hinge = jointed && settings.joint === 'hinge';
		mode.setValue( saved?.mode ?? 'off' ).setDisabled( locked );
		anchored.setValue( settings.anchored ).setDisabled( locked );
		anchorRow.setDisplay( dynamic && root ? '' : 'none' );
		joint.setValue( settings.joint ).setDisabled( locked );
		jointRow.setDisplay( jointed ? '' : 'none' );
		axis.setValue( settings.axis ).setDisabled( locked );
		axisRow.setDisplay( hinge ? '' : 'none' );
		limits.setValue( settings.limits ).setDisabled( locked );
		limitsRow.setDisplay( hinge ? '' : 'none' );
		for ( const { key, row, input } of fields ) {

			const visible = key === 'radius' ? !! saved : key === 'min' || key === 'max' ? hinge && settings.limits : dynamic;
			row.setDisplay( visible ? '' : 'none' );
			input.setValue( settings[ key ] ).setDisabled( locked );

		}

	};
	return panel;

}

export function SidebarRigCollider( editor, run ) {

	const row = new UIRow();
	const select = new UISelect().setOptions( { off: 'Off', fixed: 'Fixed box', kinematic: 'Kinematic box' } );
	select.dom.setAttribute( 'aria-label', 'Rig Collider' );
	let object;
	select.onChange( () => run( () => setRigCollider( editor, object, select.getValue() ) ) );
	row.add( new UIText( 'Rig Collider' ).setClass( 'Label' ), select );
	row.setObject = ( value, hasRigs ) => {

		object = value;
		const collider = object?.userData.armatureCollider;
		const geometry = object?.isMesh && !! object.geometry?.attributes.position?.count;
		row.setDisplay( geometry && hasRigs || collider ? '' : 'none' );
		select.setValue( collider?.mode || 'off' ).setDisabled( hasRestriction( object, 'locked' ) || hasRestriction( object, 'disabled' ) );

	};
	return row;

}
