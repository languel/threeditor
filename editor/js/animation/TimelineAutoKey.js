import { DEFAULT_POSTPROCESSING } from '../PostProcessing.js';
import { availableTargets, readValue } from './TimelineBindings.js?v=timeline-autokey';
import { scriptParams, scriptParamValue } from '../ScriptParams.js';
import { targetId } from './TimelineData.js';

const transforms = { SetPositionCommand: 'Position', SetRotationCommand: 'Rotation', SetScaleCommand: 'Scale' };
const propertyKinds = {
	SetValueCommand: 'object', SetColorCommand: 'object', SetShadowValueCommand: 'shadow',
	SetGeometryValueCommand: 'geometry', SetMaterialValueCommand: 'material', SetMaterialColorCommand: 'material',
	SetMaterialVectorCommand: 'material', SetMaterialUniformCommand: 'uniform'
};

function changed( targets, previous, next ) {

	return targets.map( target => ( { target, previous: previous( target ), value: next( target ) } ) )
		.filter( sample => sample.value !== undefined && JSON.stringify( sample.previous ) !== JSON.stringify( sample.value ) )
		.map( ( { target, value } ) => ( { target, value } ) );

}

function encoded( value ) {

	if ( Array.isArray( value ) ) return value.every( item => Number.isFinite( item ) ) ? value.slice() : undefined;
	return readValue( value );

}

function collect( editor, command ) {

	if ( command.type === 'MultiCmdsCommand' ) return command.cmdArray.flatMap( item => collect( editor, item ) );
	const { type, attributeName, object, oldValue, newValue, property, script } = command;
	if ( type === 'SetTextureParametersCommand' ) {

		const selected = editor.selected;
		if ( ! selected ) return [];
		const targets = availableTargets( selected, editor.scripts ).filter( target => target.kind === 'texture' &&
			editor.getObjectMaterial( selected, target.slot )?.[ target.map ] === command.texture &&
			Object.hasOwn( command.newParameters, target.property ) );
		const tuple = value => value && typeof value === 'object' ? [ value.x, value.y ] : value;
		return changed( targets, target => encoded( tuple( command.oldParameters[ target.property ] ) ),
			target => encoded( tuple( command.newParameters[ target.property ] ) ) );

	}
	if ( ! object || ! ( Object.hasOwn( transforms, type ) || Object.hasOwn( propertyKinds, type ) || type === 'SetScriptValueCommand' ) ) return [];
	// Scene userData is also used by timeline commands and unrelated scene settings.
	if ( type === 'SetValueCommand' && attributeName === 'userData' ) {

		if ( ! object.isScene && oldValue?.armatureConstraints !== newValue?.armatureConstraints ) {

			const targets = availableTargets( object, editor.scripts ).filter( target => target.kind === 'constraint' );
			const influence = ( data, target ) => {

				const entry = data?.armatureConstraints?.find?.( entry => entry?.id === target.constraintId );
				return entry ? entry.influence ?? 1 : undefined;

			};
			return changed( targets, target => influence( oldValue, target ), target => influence( newValue, target ) );

		}
		if ( ! object.isScene || oldValue?.postprocessing === newValue?.postprocessing ) return [];
		const targets = availableTargets( object, editor.scripts ).filter( target => target.kind === 'effect' );
		const effect = ( data, target ) => data?.postprocessing?.[ target.property ] ?? DEFAULT_POSTPROCESSING[ target.property ];
		return changed( targets, target => effect( oldValue, target ), target => effect( newValue, target ) );

	}

	const candidates = availableTargets( object, editor.scripts );
	if ( type === 'SetScriptValueCommand' ) {

		if ( attributeName !== 'paramValues' ) return [];
		const index = editor.scripts[ object.uuid ]?.indexOf( script );
		const fields = new Map( scriptParams( script.source ).map( field => [ field.name, field ] ) );
		const targets = candidates.filter( target => target.kind === 'script' && target.index === index );
		const param = ( values, target ) => scriptParamValue( { paramValues: values }, fields.get( target.property ) );
		return changed( targets, target => param( oldValue, target ), target => param( newValue, target ) );

	}
	const transform = transforms[ type ];
	const name = transform?.toLowerCase() || property || attributeName;
	const kind = transform ? 'object' : propertyKinds[ type ];
	const slot = Math.max( 0, command.slot ?? command.materialSlot ?? 0 );
	const targets = candidates.filter( target => target.kind === kind && target.property === name &&
		( target.slot === undefined || target.slot === slot ) );
	const color = type === 'SetColorCommand' || type === 'SetMaterialColorCommand';
	const value = color ? hex => '#' + Number( hex ).toString( 16 ).padStart( 6, '0' ) : encoded;
	return changed( targets, () => value( transform ? command[ 'old' + transform ] : oldValue ),
		() => value( transform ? command[ 'new' + transform ] : newValue ) );

}

export function autoKeySamples( editor, command ) {

	return [ ...new Map( collect( editor, command ).map( sample => [ targetId( sample.target ), sample ] ) ).values() ];

}
