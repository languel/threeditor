export function PrimitiveAdjustment( editor, viewport ) {

	const button = document.createElement( 'button' );
	button.type = 'button';
	button.className = 'Button primitive-adjust-trigger';
	button.textContent = 'Adjust Last Operation';
	button.setAttribute( 'aria-haspopup', 'dialog' );
	button.hidden = true;
	button.onclick = open;
	viewport.append( button );
	const dialog = document.createElement( 'dialog' );
	dialog.className = 'primitive-adjust-dialog';
	dialog.setAttribute( 'aria-label', 'Adjust Last Operation' );
	document.body.append( dialog );
	let current;

	function available() {

		return !! current && editor.history.undos.at( -1 ) === current.command && ! editor.history.historyDisabled &&
			! editor.editWorkspace.exclusive && ! editor.viewTools.mode && ! editor.modalTransform.active && current.available();

	}

	function refresh() {

		const enabled = available();
		button.hidden = ! enabled;
		if ( ! enabled && dialog.open ) dialog.close();

	}

	function record( label, fields, build, operation ) {

		if ( ! operation ) return;
		current = { ...operation, label, fields, build, values: Object.fromEntries( fields.map( field => [ field.id, field.value ] ) ) };
		refresh();

	}

	function open() {

		if ( ! available() || dialog.open ) return;
		const operation = current;
		const form = document.createElement( 'form' );
		const title = document.createElement( 'h2' );
		title.textContent = operation.label;
		form.append( title );
		const inputs = new Map();
		for ( const field of operation.fields ) {

			const label = document.createElement( 'label' );
			label.textContent = field.label;
			const input = document.createElement( 'input' );
			input.type = 'number';
			input.className = 'Input';
			input.min = field.min;
			input.max = field.max;
			input.step = field.step;
			input.required = true;
			input.value = operation.values[ field.id ];
			label.append( input );
			form.append( label );
			inputs.set( field.id, input );

		}
		const feedback = document.createElement( 'output' );
		feedback.setAttribute( 'role', 'status' );
		const controls = document.createElement( 'footer' );
		const cancel = document.createElement( 'button' );
		cancel.className = 'Button';
		cancel.type = 'button';
		cancel.textContent = 'Cancel';
		cancel.onclick = () => dialog.close();
		const apply = document.createElement( 'button' );
		apply.className = 'Button';
		apply.type = 'submit';
		apply.textContent = 'Apply';
		controls.append( cancel, apply );
		form.append( feedback, controls );
		form.onsubmit = event => {

			event.preventDefault();
			if ( operation !== current || ! available() ) { dialog.close(); return; }
			const values = Object.fromEntries( [ ...inputs ].map( ( [ id, input ] ) => [ id, input.valueAsNumber ] ) );
			try {

				if ( Object.keys( values ).some( id => values[ id ] !== operation.values[ id ] ) ) {

					editor.history.reviseLast( operation.command, () => operation.replace( operation.build( values ) ) );
					operation.values = values;

				}
				dialog.close();

			} catch ( error ) {

				feedback.textContent = error.message;

			}

		};
		dialog.replaceChildren( form );
		dialog.showModal();
		inputs.values().next().value?.select();

	}

	const { signals } = editor;
	signals.historyChanged.add( refresh );
	signals.objectSelected.add( refresh );
	signals.startPlayer.add( refresh );
	for ( const signal of [ signals.editorCleared, signals.projectLoaded ] ) signal.add( () => { current = null; refresh(); } );
	return { available, refresh, open, record };

}
