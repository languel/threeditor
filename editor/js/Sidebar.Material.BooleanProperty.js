import { addTimelineKey } from './animation/TimelineKeyControl.js';
import { UICheckbox, UIRow, UIText } from './libs/ui.js';
import { SetMaterialValueCommand } from './commands/SetMaterialValueCommand.js';

function SidebarMaterialBooleanProperty( editor, property, name ) {

	const signals = editor.signals;

	const container = new UIRow();
	const label = new UIText( name ).setClass( 'Label' );
	container.add( label );

	const boolean = new UICheckbox().setLeft( '100px' ).onChange( onChange );
	container.add( boolean );

	let object = null;
	let materialSlot = null;
	let material = null;

	addTimelineKey( editor, label, name, () => object && ( { object: object.uuid, kind: 'material', slot: materialSlot, property,
		label: 'Material ' + ( materialSlot + 1 ) + ' · ' + property } ),
	{ field: boolean, display: value => boolean.setValue( value ) } );


	function onChange() {

		if ( material[ property ] !== boolean.getValue() ) {

			editor.execute( new SetMaterialValueCommand( editor, object, property, boolean.getValue(), materialSlot ) );

		}

	}

	function update( currentObject, currentMaterialSlot = 0 ) {

		object = currentObject;
		materialSlot = currentMaterialSlot;

		if ( object === null ) return;
		if ( object.material === undefined ) return;

		material = editor.getObjectMaterial( object, materialSlot );

		if ( property in material ) {

			boolean.setValue( material[ property ] );
			container.setDisplay( '' );

		} else {

			container.setDisplay( 'none' );

		}

	}

	//

	signals.objectSelected.add( update );
	signals.materialChanged.add( update );

	return container;

}

export { SidebarMaterialBooleanProperty };
