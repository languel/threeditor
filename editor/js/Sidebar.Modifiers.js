import { UIPanel } from './libs/ui.js';
import { modelButton } from './modeling/ModelControls.js?v=modifiers';
import { MODIFIERS, canModify, createModifier, setModifierStack, applyModifier } from './modeling/Modifiers.js?v=poly-context';
import { hasRestriction } from './ObjectRestrictions.js';

export function SidebarModifiers( editor ) {

	const panel = new UIPanel();
	panel.dom.className = 'modifier-panel';
	const status = document.createElement( 'p' ); status.setAttribute( 'role', 'status' );
	const body = document.createElement( 'div' ); panel.dom.append( status, body );
	function run( action ) { try { status.textContent = ''; action(); } catch ( error ) { status.textContent = error.message; } }
	function draw() {

		body.replaceChildren();
		const object = editor.selected;
		if ( ! canModify( object ) ) return;
		const locked = hasRestriction( object, 'locked' );
		const add = document.createElement( 'select' ); add.className = 'Select'; add.setAttribute( 'aria-label', 'Add modifier' );
		add.append( new Option( 'Add modifier…', '' ) );
		for ( const [ type, def ] of Object.entries( MODIFIERS ) ) if ( ( ! def.curveOnly || object.isLine ) && ( ! def.meshOnly || object.isMesh ) ) add.append( new Option( def.name, type ) );
		add.disabled = locked;
		add.onchange = () => run( () => setModifierStack( editor, object, [ ...( object.userData.modifiers || [] ), createModifier( add.value ) ], undefined, 'Add modifier' ) );
		body.append( add );
		const stack = object.userData.modifiers || [];
		const change = ( index, mutate ) => run( () => { const next = structuredClone( stack ); mutate( next[ index ], next ); setModifierStack( editor, object, next ); } );
		stack.forEach( ( modifier, index ) => {

			const section = document.createElement( 'details' ); section.open = true; section.className = 'modifier-entry';
			const summary = document.createElement( 'summary' ); summary.textContent = modifier.name; section.append( summary );
			const actions = document.createElement( 'div' ); actions.className = 'modifier-actions'; section.append( actions );
			const enabled = document.createElement( 'input' ); enabled.type = 'checkbox'; enabled.checked = modifier.enabled; enabled.disabled = locked;
			enabled.setAttribute( 'aria-label', 'Enable ' + modifier.name ); enabled.title = 'Enable ' + modifier.name;
			enabled.onchange = () => change( index, mod => { mod.enabled = enabled.checked; } ); actions.append( enabled );
			modelButton( actions, 'Move modifier up', 'modifierUp', () => change( index, ( mod, next ) => { [ next[ index - 1 ], next[ index ] ] = [ mod, next[ index - 1 ] ]; } ), locked || ! index );
			modelButton( actions, 'Move modifier down', 'modifierDown', () => change( index, ( mod, next ) => { [ next[ index + 1 ], next[ index ] ] = [ mod, next[ index + 1 ] ]; } ), locked || index === stack.length - 1 );
			modelButton( actions, 'Apply through this modifier', 'apply', () => run( () => applyModifier( editor, object, index ) ), locked );
			modelButton( actions, 'Remove modifier', 'remove', () => change( index, ( mod, next ) => next.splice( index, 1 ) ), locked );
			for ( const [ key, value ] of Object.entries( modifier.params ) ) {

				const label = document.createElement( 'label' ); label.className = 'modifier-param';
				const text = document.createElement( 'span' ); text.textContent = key.replace( /([a-z])([A-Z])/g, '$1 $2' ).replace( /^./, c => c.toUpperCase() ) + ( key.startsWith( 'rotation' ) ? ' (°)' : '' );
				const input = document.createElement( 'input' ); input.disabled = locked; input.setAttribute( 'aria-label', modifier.name + ' ' + key );
				input.type = typeof value === 'boolean' ? 'checkbox' : 'number'; input.className = 'Input'; input.step = 'any';
				if ( input.type === 'checkbox' ) input.checked = value; else input.value = value;
				input.onchange = () => change( index, mod => { mod.params[ key ] = input.type === 'checkbox' ? input.checked : input.valueAsNumber; } );
				label.append( text, input ); section.append( label );

			}
			body.append( section );

		} );

	}
	editor.signals.objectSelected.add( draw );
	editor.signals.objectChanged.add( object => { if ( object === editor.selected ) draw(); } );
	editor.signals.geometryChanged.add( object => { if ( object === editor.selected ) draw(); } );
	return panel;

}
