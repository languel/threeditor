import { originActions } from './modeling/OriginActions.js?v=poly-context';
import { outlineActions } from './modeling/OutlineActions.js?v=mask-editor';
import { formatCombo } from './Keymap.js?v=workspace-modes';

function ContextMenu( editor, viewport ) {

	const menu = document.createElement( 'div' );
	menu.className = 'context-menu';
	menu.hidden = true;
	menu.setAttribute( 'role', 'dialog' );
	menu.setAttribute( 'aria-label', 'Context menu' );
	document.body.appendChild( menu );
	let pointer = null;
	let previousFocus = null;
	let rightDown = null;
	let rightDragged = false;
	viewport.addEventListener( 'pointerdown', event => {

		if ( event.button === 2 ) { rightDown = { x: event.clientX, y: event.clientY }; rightDragged = false; }

	}, true );

	viewport.addEventListener( 'pointermove', event => {

		if ( rightDown && event.buttons & 2 && Math.hypot( event.clientX - rightDown.x, event.clientY - rightDown.y ) > 4 ) rightDragged = true;
		if ( ! menu.hidden || event.target.closest( 'button, input, select' ) ) return;
		pointer = { x: event.clientX, y: event.clientY };

	} );

	function close( restore = true ) {

		if ( menu.hidden ) return;
		menu.hidden = true;
		if ( restore && previousFocus?.isConnected ) previousFocus.focus();
		previousFocus = null;

	}

	function show( title, actions, position = pointer ) {

		if ( editor.flyControls?.active || editor.modalTransform?.active || document.body.classList.contains( 'presenting' ) ) return;
		previousFocus = document.activeElement;
		menu.replaceChildren();
		menu.setAttribute( 'aria-label', title );
		const heading = document.createElement( 'div' );
		heading.className = 'context-menu-title';
		heading.textContent = title;
		const search = document.createElement( 'input' );
		search.className = 'Input context-menu-search';
		search.type = 'search';
		search.placeholder = 'Search…';
		search.setAttribute( 'aria-label', 'Search ' + title );
		const list = document.createElement( 'div' );
		list.className = 'context-menu-list';
		menu.append( heading, search, list );
		function draw() {

			list.replaceChildren();
			const query = search.value.trim().toLowerCase();
			let lastSection = '';
			for ( const action of actions ) {

				if ( query && ! ( action.label + ' ' + ( action.section || '' ) ).toLowerCase().includes( query ) ) continue;
				if ( action.section && action.section !== lastSection ) {

					lastSection = action.section;
					const section = document.createElement( 'div' );
					section.className = 'context-menu-section';
					section.textContent = action.section;
					list.appendChild( section );

				}
				const button = document.createElement( 'button' );
				button.type = 'button';
				button.className = 'context-menu-item';
				button.textContent = action.label;
				button.disabled = !! action.disabled;
				if ( title === 'Command palette' && editor.keymap.combo( action.id ) ) {

					const key = document.createElement( 'span' );
					key.className = 'context-menu-key';
					key.textContent = formatCombo( editor.keymap.combo( action.id ) );
					button.appendChild( key );

				}
				button.addEventListener( 'click', () => { close(); action.run(); } );
				list.appendChild( button );

			}

		}
		search.addEventListener( 'input', draw );
		menu.addEventListener( 'keydown', navigate );
		draw();
		menu.hidden = false;
		const rect = viewport.getBoundingClientRect();
		const x = position?.x ?? rect.left + rect.width / 2;
		const y = position?.y ?? rect.top + rect.height / 2;
		menu.style.left = Math.max( 4, Math.min( x, window.innerWidth - menu.offsetWidth - 4 ) ) + 'px';
		menu.style.top = Math.max( 4, Math.min( y, window.innerHeight - menu.offsetHeight - 4 ) ) + 'px';
		search.focus();

	}

	function navigate( event ) {

		if ( event.key === 'Escape' ) { event.preventDefault(); event.stopPropagation(); close(); return; }
		if ( ! [ 'ArrowDown', 'ArrowUp', 'Enter' ].includes( event.key ) ) return;
		const buttons = [ ...menu.querySelectorAll( '.context-menu-item:not(:disabled)' ) ];
		if ( ! buttons.length ) return;
		if ( event.key === 'Enter' && event.target.matches( 'input' ) ) { event.preventDefault(); buttons[ 0 ].click(); return; }
		if ( event.key === 'Enter' ) return;
		event.preventDefault();
		const index = buttons.indexOf( document.activeElement );
		if ( index < 0 ) {
			buttons[ event.key === 'ArrowDown' ? 0 : buttons.length - 1 ].focus();
			return;
		}
		buttons[ ( index + ( event.key === 'ArrowDown' ? 1 : buttons.length - 1 ) ) % buttons.length ].focus();

	}

	function openAdd( position ) {

		show( 'Add', editor.keymap.actions.filter( action => action.category === 'Menu · ' + editor.strings.getKey( 'menubar/add' ) ), position );

	}

	function openObject( position ) {

		const model = editor.modeling;
		const edit = model.editMode && model.object && ! editor.viewTools.mode;
		const ids = edit ? [ 'translate', 'rotate', 'scale' ] : editor.selected ? [ 'translate', 'rotate', 'scale', 'focus', 'duplicate', 'delete' ] : [];
		const actions = ids.map( id => editor.keymap.actions.find( action => action.id === id ) ).filter( Boolean );
		if ( edit ) {

			const tools = [ 'selectVertex', 'selectEdge', 'selectFace', 'boxSelect', 'lassoSelect', 'circleSelect', 'invertElements' ];
			actions.push( ...editor.keymap.actions.filter( action => tools.includes( action.id ) && editor.keymap.actionAvailable( action.id ) )
				.map( action => ( { ...action, section: 'Selection' } ) ) );
			actions.push( ...model.actions().map( action => ( { ...action, section: 'Mesh operations' } ) ) );
			actions.push( { label: 'Select all', section: 'Selection', run: () => model.selectPoints( true ) },
				{ label: 'Deselect all', section: 'Selection', run: () => model.selectPoints( false ) } );

		} else if ( editor.selected?.userData.measurement ) {

			actions.unshift( { label: 'Edit measurement', run: () => editor.viewTools.setWorkspaceMode( 'edit' ) } );

		} else actions.unshift( { label: 'Add…', run: () => openAdd( position ) }, ...outlineActions( editor, editor.selected ) );
		actions.push( ...originActions( editor ) );
		if ( editor.selected ) for ( const [ value, label ] of [ [ 'bounds', 'Bounds center' ], [ 'bottom', 'Bounds bottom center' ], [ 'median', 'Median' ], [ 'active', 'Active element' ], [ 'origin', 'World origin' ] ] ) actions.push( {

			label: 'Pivot: ' + label, section: 'Transform pivot', run: () => {

				editor.config.setKey( 'settings/transformPivot', value );
				editor.signals.transformSettingsChanged.dispatch( 'transformPivot' );

			}

		} );
		show( edit ? 'Edit geometry' : editor.selected?.name || 'Scene', actions, position );
	}

	function openPalette() {

		const rect = viewport.getBoundingClientRect();
		const actions = editor.keymap.actions.filter( action => ! [ 'palette', 'paletteAlternate' ].includes( action.id ) && editor.keymap.actionAvailable( action.id ) ).map( action => ( { ...action, section: action.section || action.category } ) );
		if ( ! editor.editWorkspace.mode ) {

			const areaPointer = pointer;
			const section = 'Viewport areas';
			actions.push(
				{ label: 'Vertical Split', section, run: () => editor.setViewportSplit( true, 'vertical' ) },
				{ label: 'Horizontal Split', section, run: () => editor.setViewportSplit( true, 'horizontal' ) }
			);
			if ( editor.viewportSplit ) actions.push( { label: 'Close Area', section, run: () => editor.viewLayout.closeArea( areaPointer ) } );

		}
		show( 'Command palette', actions, { x: rect.left + rect.width / 2 - 115, y: rect.top + Math.min( 90, rect.height / 4 ) } );

	}

	viewport.addEventListener( 'contextmenu', event => {

		if ( event.target.tagName !== 'CANVAS' || editor.flyControls?.active || editor.modalTransform?.active ) return;
		event.preventDefault();
		if ( rightDragged || performance.now() < ( editor.suppressContextMenuUntil || 0 ) ) { rightDown = null; return; }
		rightDown = null;
		pointer = { x: event.clientX, y: event.clientY };
		openObject( pointer );

	} );
	document.addEventListener( 'pointerdown', event => { if ( ! menu.hidden && ! menu.contains( event.target ) ) close( false ); }, true );
	return { openAdd, openObject, openPalette, show, close };

}

export { ContextMenu };
