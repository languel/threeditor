import { UIColor, UINumber, UIRow, UIText } from './libs/ui.js';
import { SetMaterialColorCommand } from './commands/SetMaterialColorCommand.js';
import { SetMaterialValueCommand } from './commands/SetMaterialValueCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';

function SidebarMaterialColorProperty( editor, property, name ) {

	const signals = editor.signals;

	const container = new UIRow();
	container.add( new UIText( name ).setClass( 'Label' ) );

	const color = new UIColor().onInput( onChange );
	container.add( color );

	// Three.js colors are RGB; transparency belongs to the material as a whole.
	let alpha;
	let alphaValue;
	if ( property === 'color' ) {

		const control = document.createElement( 'span' );
		control.className = 'color-alpha';
		alpha = document.createElement( 'input' );
		alpha.type = 'range';
		alpha.min = '0';
		alpha.max = '100';
		alpha.step = '1';
		alpha.setAttribute( 'aria-label', 'Material color opacity' );
		alpha.title = 'Material opacity';
		alphaValue = document.createElement( 'output' );
		alpha.addEventListener( 'input', () => { alphaValue.textContent = alpha.value + '%'; } );
		alpha.addEventListener( 'change', () => {

			const value = Number( alpha.value ) / 100;
			const commands = [];
			if ( material.opacity !== value ) commands.push( new SetMaterialValueCommand( editor, object, 'opacity', value, materialSlot ) );
			if ( value < 1 && ! material.transparent ) commands.push( new SetMaterialValueCommand( editor, object, 'transparent', true, materialSlot ) );
			if ( commands.length === 1 ) editor.execute( commands[ 0 ] );
			if ( commands.length > 1 ) editor.execute( new MultiCmdsCommand( editor, commands ) );

		} );
		control.append( alpha, alphaValue );
		container.dom.appendChild( control );

	}

	let intensity;

	if ( property === 'emissive' ) {

		intensity = new UINumber( 1 ).setWidth( '30px' ).setRange( 0, Infinity ).onChange( onChange );
		container.add( intensity );

	}

	let object = null;
	let materialSlot = null;
	let material = null;

	function onChange() {

		if ( material[ property ].getHex() !== color.getHexValue() ) {

			editor.execute( new SetMaterialColorCommand( editor, object, property, color.getHexValue(), materialSlot ) );

		}

		if ( intensity !== undefined ) {

			if ( material[ `${ property }Intensity` ] !== intensity.getValue() ) {

				editor.execute( new SetMaterialValueCommand( editor, object, `${ property }Intensity`, intensity.getValue(), materialSlot ) );

			}

		}

	}

	function update( currentObject, currentMaterialSlot = 0 ) {

		object = currentObject;
		materialSlot = currentMaterialSlot;

		if ( object === null ) return;
		if ( object.material === undefined ) return;

		material = editor.getObjectMaterial( object, materialSlot );

		if ( property in material ) {

			color.setHexValue( material[ property ].getHexString() );
			if ( alpha ) {

				alpha.value = Math.round( material.opacity * 100 );
				alphaValue.textContent = alpha.value + '%';
				alpha.parentElement.style.display = 'opacity' in material && 'transparent' in material ? '' : 'none';

			}

			if ( intensity !== undefined ) {

				intensity.setValue( material[ `${ property }Intensity` ] );

			}

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

export { SidebarMaterialColorProperty };
