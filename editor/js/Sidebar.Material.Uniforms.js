import { UICheckbox, UIColor, UIDiv, UINumber, UIRow, UIText } from './libs/ui.js';
import { addTimelineKey } from './animation/TimelineKeyControl.js';
import { SetMaterialUniformCommand, uniformValue } from './commands/SetMaterialUniformCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { stockLookFields } from './StockMaterialLooks.js?v=look-controls';

function SidebarMaterialUniforms( editor ) {

	const panel = new UIDiv();
	let slots = [];
	let layout = '';
	let refreshFields = [];

	function targets( property, label ) {

		return slots.map( ( { object, slot } ) => ( {
			kind: 'uniform', object: object.uuid, slot, property, label
		} ) );

	}

	function read( material, property ) {

		return uniformValue( material.uniforms[ property ] );

	}

	panel.update = ( entries, look ) => {

		const seen = new Set();
		slots = entries.filter( ( { material } ) => {

			if ( ! material.uniforms || seen.has( material ) ) return false;
			seen.add( material );
			return true;

		} );
		const fields = stockLookFields( look );
		const keys = Object.keys( look ? fields : slots[ 0 ]?.material.uniforms || {} ).filter( property => {

			return slots.length && slots.every( ( { material } ) => {

				const value = material.uniforms[ property ]?.value;
				return Number.isFinite( value ) || typeof value === 'boolean' || value?.isColor;

			} );

		} );
		const signature = JSON.stringify( [ look, keys.map( key => [ key, typeof slots[ 0 ].material.uniforms[ key ].value ] ),
			slots.map( ( { object, slot, material } ) => [ object.uuid, slot, material.uuid ] ) ] );
		if ( signature !== layout ) {

			layout = signature;
			panel.clear();
			refreshFields = [];
			for ( const property of keys ) {

				const field = Object.hasOwn( fields, property ) ? fields[ property ] : undefined;
				const name = field?.label || property;
				const first = slots[ 0 ].material.uniforms[ property ].value;
				const input = first?.isColor ? new UIColor() : typeof first === 'boolean' ? new UICheckbox() : new UINumber().setWidth( '62px' ).setPrecision( 3 )
					.setScrubDefault( field ? Number( field.initial ) : first ).setStep( field ? field.step * 16 : 1 )
					.setNudge( field?.step ?? 0.01 ).setRange( field?.min ?? - Infinity, field?.max ?? Infinity );
				const label = new UIText( name ).setClass( 'Label' );
				label.dom.title = name;
				const row = new UIRow().addClass( 'material-look-parameter' );
				row.add( label, input );
				panel.add( row );
				input.dom.setAttribute( 'aria-label', name );
				const refresh = () => {

					if ( input.dom.matches( ':focus, :active' ) ) return;
					const value = read( slots[ 0 ].material, property );
					const mixed = slots.some( ( { material } ) => read( material, property ) !== value );
					input.setValue( value );
					input.dom.title = mixed ? name + ' · Mixed values' : name;
					if ( mixed && ! first?.isColor && typeof first !== 'boolean' ) {

						input.dom.value = '';
						input.dom.placeholder = 'Mixed';

					}

				};
				const change = () => {

					const value = input.getValue();
					const commands = slots.filter( ( { material } ) => read( material, property ) !== value ).map( ( { object, slot } ) =>
						new SetMaterialUniformCommand( editor, object, slot, property, value ) );
					if ( ! commands.length ) return;
					editor.execute( commands.length === 1 ? commands[ 0 ] : new MultiCmdsCommand( editor, commands ), 'Set ' + name );

				};
				first?.isColor ? input.onInput( change ) : input.onChange( change );
				addTimelineKey( editor, label, name, () => targets( property, name ), { field: input, display: refresh } );
				refreshFields.push( refresh );

			}

		}
		for ( const refresh of refreshFields ) refresh();

	};

	return panel;

}

export { SidebarMaterialUniforms };
