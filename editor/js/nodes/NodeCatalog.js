export function createNodeCatalog( choose, restoreFocus ) {

	const dialog = document.createElement( 'dialog' );
	dialog.className = 'node-catalog';
	dialog.setAttribute( 'aria-label', 'Add node' );
	const search = document.createElement( 'input' );
	search.type = 'search';
	search.className = 'Input';
	search.placeholder = 'Search nodes…';
	search.setAttribute( 'aria-label', 'Search nodes' );
	const body = document.createElement( 'div' );
	body.className = 'node-catalog-body';
	const categories = document.createElement( 'div' );
	categories.className = 'node-catalog-categories';
	const results = document.createElement( 'div' );
	results.className = 'node-catalog-results';
	results.id = 'node-catalog-' + Math.random().toString( 36 ).slice( 2 );
	results.setAttribute( 'role', 'listbox' );
	results.setAttribute( 'aria-label', 'Matching nodes' );
	search.setAttribute( 'role', 'combobox' );
	search.setAttribute( 'aria-controls', results.id );
	search.setAttribute( 'aria-expanded', 'true' );
	body.append( categories, results );
	dialog.append( search, body );
	let choices = [], matches = [], buttons = [], active = 0, category = '';

	function highlight( index ) {

		active = Math.max( 0, Math.min( index, buttons.length - 1 ) );
		buttons.forEach( ( button, i ) => button.setAttribute( 'aria-selected', String( i === active ) ) );
		if ( buttons[ active ] ) {

			search.setAttribute( 'aria-activedescendant', buttons[ active ].id );
			buttons[ active ].scrollIntoView( { block: 'nearest' } );

		} else search.removeAttribute( 'aria-activedescendant' );

	}

	function select( index ) {

		const node = matches[ index ];
		if ( ! node ) return;
		dialog.close();
		choose( node.id );
		restoreFocus();

	}

	function renderResults() {

		const query = search.value.toLowerCase().trim().split( /\s+/ ).filter( Boolean );
		matches = choices.filter( node => {

			const text = ( node.def.label + ' ' + node.def.category + ' ' + ( node.def.keywords || '' ) ).toLowerCase();
			return ( ! category || node.def.category === category ) && query.every( term => text.includes( term ) );

		} );
		buttons = matches.map( ( { def }, i ) => {

			const button = document.createElement( 'button' );
			button.type = 'button';
			button.dataset.uiRaw = 'keep';
			button.tabIndex = -1;
			button.id = results.id + '-' + i;
			button.setAttribute( 'role', 'option' );
			button.textContent = def.label;
			button.onclick = () => select( i );
			return button;

		} );
		results.replaceChildren( ...buttons );
		if ( ! buttons.length ) results.textContent = 'No matching nodes';
		results.scrollTop = 0;
		highlight( 0 );

	}

	search.addEventListener( 'input', renderResults );
	dialog.addEventListener( 'keydown', event => {

		if ( event.key === 'ArrowDown' || event.key === 'ArrowUp' ) {

			event.preventDefault();
			highlight( active + ( event.key === 'ArrowDown' ? 1 : - 1 ) );

		} else if ( event.key === 'Enter' && event.target === search ) {

			event.preventDefault();
			select( active );

		}

	} );
	dialog.addEventListener( 'click', event => { if ( event.target === dialog ) dialog.close(); } );
	dialog.addEventListener( 'cancel', event => {

		event.preventDefault();
		dialog.close();
		restoreFocus();

	} );
	dialog.addEventListener( 'close', () => { if ( ! dialog.open ) { dialog.remove(); restoreFocus(); } } );
	return {
		show( domain, clientX, clientY, compatible = () => true, label = 'Add node' ) {

			if ( dialog.open ) dialog.close();
			choices = [ ...domain.nodes ].filter( ( [ , def ] ) => ! def.fixed && ! def.hidden && compatible( def ) )
				.map( ( [ id, def ] ) => ( { id, def } ) ).sort( ( a, b ) => a.def.label.localeCompare( b.def.label ) );
			category = '';
			dialog.setAttribute( 'aria-label', label );
			search.value = '';
			const names = [ '', ...new Set( choices.map( node => node.def.category ).sort() ) ];
			const tabs = names.map( name => {

				const button = document.createElement( 'button' );
				button.type = 'button';
				button.dataset.uiRaw = 'keep';
				button.textContent = name || 'All nodes';
				button.setAttribute( 'aria-pressed', String( ! name ) );
				button.onclick = () => {

					category = name;
					for ( const tab of tabs ) tab.setAttribute( 'aria-pressed', String( tab === button ) );
					renderResults();
					search.focus();

				};
				return button;

			} );
			categories.replaceChildren( ...tabs );
			document.body.append( dialog );
			dialog.showModal();
			const bounds = dialog.getBoundingClientRect();
			dialog.style.left = Math.max( 4, Math.min( clientX, window.innerWidth - bounds.width - 4 ) ) + 'px';
			dialog.style.top = Math.max( 4, Math.min( clientY, window.innerHeight - bounds.height - 4 ) ) + 'px';
			renderResults();
			search.focus();

		},
		dispose() { dialog.remove(); }
	};

}
