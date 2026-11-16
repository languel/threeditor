import { Command } from '../Command.js';

function uniformValue( uniform ) {

	return uniform.value?.isColor ? '#' + uniform.value.getHexString() : uniform.value;

}

class SetMaterialUniformCommand extends Command {

	constructor( editor, object, slot, property, value ) {

		super( editor );
		this.type = 'SetMaterialUniformCommand';
		this.name = 'Set shader uniform: ' + property;
		this.object = object;
		this.slot = slot;
		this.property = property;
		this.newValue = value;
		if ( object ) this.oldValue = uniformValue( this.uniform );

	}

	get uniform() {

		return this.editor.getObjectMaterial( this.object, this.slot )?.uniforms?.[ this.property ];

	}

	setValue( value ) {

		const uniform = this.uniform;
		if ( ! uniform ) return;
		if ( uniform.value?.isColor ) uniform.value.set( value );
		else uniform.value = value;
		this.editor.signals.materialChanged.dispatch( this.object, this.slot );
		this.editor.signals.objectChanged.dispatch( this.object );

	}

	execute() {

		this.setValue( this.newValue );

	}

	undo() {

		this.setValue( this.oldValue );

	}

	toJSON() {

		return { ...super.toJSON(), objectUuid: this.object.uuid, slot: this.slot, property: this.property,
			oldValue: this.oldValue, newValue: this.newValue };

	}

	fromJSON( json ) {

		super.fromJSON( json );
		this.object = this.editor.objectByUuid( json.objectUuid );
		this.slot = json.slot;
		this.property = json.property;
		this.oldValue = json.oldValue;
		this.newValue = json.newValue;

	}

}

export { SetMaterialUniformCommand, uniformValue };
