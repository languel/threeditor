import { UIButton, UICheckbox, UINumber, UIPanel, UIRow, UISelect, UIText } from './libs/ui.js';
import { hasRestriction } from './ObjectRestrictions.js';
import { createBoneIKTarget, setBoneIK } from './rigging/ArmatureTools.js';
import { ikSettings, resolveIK } from './rigging/ArmatureIK.js';

export function SidebarArmatureIK( editor, run ) {

	const panel = new UIPanel();
	const target = new UISelect();
	const pole = new UISelect();
	const chainLength = new UINumber( 2 ).setPrecision( 0 ).setRange( 0, 64 ).setStep( 1 ).setWidth( '60px' );
	const iterations = new UINumber( 32 ).setPrecision( 0 ).setRange( 1, 128 ).setStep( 1 ).setWidth( '60px' );
	const influence = new UINumber( 1 ).setPrecision( 3 ).setRange( 0, 1 ).setStep( .05 ).setWidth( '60px' );
	const useTail = new UICheckbox( true );
	const checks = new UIPanel();
	const status = new UIText();
	let bone;

	function row( label, input ) {

		input.dom.setAttribute( 'aria-label', label );
		input.onChange( save );
		return new UIRow().add( new UIText( label ).setClass( 'Label' ), input );

	}

	const create = new UIButton( 'Add IK Target' ).onClick( () => run( () => createBoneIKTarget( editor, bone ) ) );
	panel.add( new UIRow().add( create ), row( 'IK Target', target ), checks, status );
	checks.add( row( 'Pole Target', pole ), row( 'Chain Length', chainLength ), row( 'IK Iterations', iterations ),
		row( 'IK Influence', influence ), row( 'Use Bone Tail', useTail ) );
	chainLength.dom.title = 'Zero includes the whole chain.';

	function save() {

		if ( ! bone ) return;
		run( () => setBoneIK( editor, bone, {
			target: target.getValue(), pole: pole.getValue(), chainLength: chainLength.getValue(), iterations: iterations.getValue(),
			influence: influence.getValue(), useTail: useTail.getValue()
		} ) );

	}

	function choices( input, items, value, empty ) {

		const options = [ new Option( empty, '' ), ...items.map( item => new Option( item.name || item.type, item.uuid ) ) ];
		if ( value && ! items.some( item => item.uuid === value ) ) options.push( new Option( 'Missing target', value ) );
		input.dom.replaceChildren( ...options );
		input.setValue( value || '' );

	}

	panel.setObject = object => {

		bone = object?.userData.armatureBone ? object : null;
		panel.setDisplay( bone ? '' : 'none' );
		if ( ! bone ) return;
		const settings = ikSettings( bone.userData.armatureIK );
		const locked = hasRestriction( bone, 'locked' ) || hasRestriction( bone, 'disabled' );
		const dynamic = bone.userData.armaturePhysics?.mode === 'dynamic';
		const items = [];
		editor.scene.traverse( item => {

			if ( item !== bone && item !== editor.scene && ! item.userData.runtimeOnly && ! hasRestriction( item, 'disabled' ) ) items.push( item );

		} );
		choices( target, items, settings?.target, 'None' );
		choices( pole, items, settings?.pole, 'None' );
		chainLength.setValue( settings?.chainLength ?? 2 );
		iterations.setValue( settings?.iterations ?? 32 );
		influence.setValue( settings?.influence ?? 1 );
		useTail.setValue( settings?.useTail ?? true );
		create.setDisplay( settings ? 'none' : '' ).setDisabled( locked || dynamic );
		checks.setDisplay( settings ? '' : 'none' );
		for ( const input of [ target, pole, chainLength, iterations, influence, useTail ] ) input.setDisabled( locked );
		status.setValue( settings ? resolveIK( editor.scene, bone, settings ).error || '' : '' );

	};
	return panel;

}
