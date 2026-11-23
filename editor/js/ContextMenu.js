import { originActions } from './modeling/OriginActions.js?v=poly-context';
import { outlineActions } from './modeling/OutlineActions.js?v=pencil-layout';
import { formatCombo } from './Keymap.js';
import { changeParent } from './ObjectParenting.js?v=editor-panes';
import { SetValueCommand } from './commands/SetValueCommand.js';

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
	viewport.addEventListener( 'pointerdown', event => {

		rightDown = event.button === 2 && event.buttons === 2 && ! event.ctrlKey && event.target === editor.renderer?.domElement ?
			{ id: event.pointerId, x: event.clientX, y: event.clientY } : null;

	}, true );
	const moved = event => Math.hypot( event.clientX - rightDown.x, event.clientY - rightDown.y ) > 4;
	window.addEventListener( 'pointerup', event => {

		if ( rightDown?.id !== event.pointerId || event.button !== 2 ) return;
		const directClick = ! moved( event ) && event.target === editor.renderer?.domElement && ! event.ctrlKey;
		rightDown = null;
		if ( ! directClick || editor.flyControls?.active || editor.modalTransform?.active || editor.modeling?.gesture ||
			performance.now() < ( editor.suppressContextMenuUntil || 0 ) ) return;
		pointer = { x: event.clientX, y: event.clientY };
		openObject( pointer );

	}, true );
	window.addEventListener( 'pointercancel', event => {

		if ( rightDown?.id === event.pointerId ) rightDown = null;

	}, true );
	window.addEventListener( 'pointermove', event => {

		if ( rightDown?.id === event.pointerId && event.buttons & 2 && moved( event ) ) rightDown = null;

	}, true );
	viewport.addEventListener( 'pointermove', event => {

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
			const terms = search.value.toLowerCase().match( /\S+/g ) || [];
			let lastSection = '';
			for ( const action of actions ) {

				const text = ( action.label + ' ' + ( action.section || '' ) ).toLowerCase();
				if ( ! terms.every( term => text.includes( term ) ) ) continue;
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
			if ( ! list.childElementCount ) {

				const empty = document.createElement( 'div' );
				empty.className = 'context-menu-section';
				empty.setAttribute( 'role', 'status' );
				empty.textContent = 'No matches';
				list.appendChild( empty );

			}

		}
		search.addEventListener( 'input', draw );
		menu.addEventListener( 'keydown', navigate );
		draw();
		openAt( position );
		search.focus();

	}

	function openAt( position ) {

		menu.hidden = false;
		const rect = viewport.getBoundingClientRect();
		const x = position?.x ?? rect.left + rect.width / 2;
		const y = position?.y ?? rect.top + rect.height / 2;
		menu.style.left = Math.max( 4, Math.min( x, window.innerWidth - menu.offsetWidth - 4 ) ) + 'px';
		menu.style.top = Math.max( 4, Math.min( y, window.innerHeight - menu.offsetHeight - 4 ) ) + 'px';
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
		const next = event.key === 'ArrowDown' ? index + 1 : ( index <= 0 ? buttons.length - 1 : index - 1 );
		buttons[ next % buttons.length ].focus();

	}

	function openAdd( position ) {

		const category = 'Menu · ' + editor.strings.getKey( 'menubar/add' );
		show( 'Add', editor.keymap.actions.filter( action => action.category === category && editor.keymap.actionAvailable( action.id ) ), position );

	}

	function openSeparate( position ) {

		const model = editor.modeling;
		if ( ! model.canSeparate ) return;
		const materials = model.object.material;
		const options = [
			[ 'Selection', 'selection', ! model.selectedSurfaceFaces().length ],
			[ 'By Material', 'material', ! Array.isArray( materials ) || materials.length < 2 ],
			[ 'By Loose Parts', 'loose', false ]
		];
		show( 'Separate', options.map( ( [ label, mode, disabled ] ) =>
			( { label, disabled, run: () => editor.viewTools.run( () => model.separate( mode ) ) } ) ), position );

	}

	function openParent( clearing, position ) {

		const choices = clearing ? [ [ 'Clear Parent', 'keepLocal' ], [ 'Clear and Keep Transform', 'keepWorld' ] ] :
			[ [ 'Object (Keep Transform)', 'keepWorld' ], [ 'Object (Without Inverse)', 'withoutInverse' ] ];
		show( clearing ? 'Clear Parent' : 'Set Parent', choices.map( ( [ label, mode ] ) => ( {
			label, run: () => editor.viewTools.run( () => changeParent( editor, clearing, mode ) )
		} ) ), position );

	}

	function openRename( position ) {

		const object = editor.selector.selection.at( -1 );
		previousFocus = document.activeElement;
		menu.setAttribute( 'aria-label', 'Rename Object' );
		const form = document.createElement( 'form' );
		const caption = document.createElement( 'label' );
		caption.className = 'context-menu-title';
		caption.textContent = 'Object Name';
		const name = document.createElement( 'input' );
		name.className = 'Input context-menu-search';
		name.value = object.name;
		caption.appendChild( name );
		const submit = document.createElement( 'button' );
		submit.className = 'Button';
		submit.textContent = 'Rename';
		form.append( caption, submit );
		form.onsubmit = event => {

			event.preventDefault();
			const value = name.value.trim();
			if ( value && value !== object.name && editor.selector.selection.at( -1 ) === object &&
				editor.keymap.actionAvailable( 'renameObject' ) ) {

				const command = new SetValueCommand( editor, object, 'name', value );
				command.updatable = false;
				editor.execute( command, 'Rename Object' );

			}
			close();

		};
		menu.replaceChildren( form );
		menu.addEventListener( 'keydown', navigate );
		openAt( position || pointer );
		name.focus();
		name.select();

	}

	function openObject( position ) {

		const model = editor.modeling;
		const edit = model.editMode && model.object && ! editor.viewTools.mode;
		const ids = edit ? [ 'translate', 'rotate', 'scale' ] : editor.selected ? [ 'translate', 'rotate', 'scale', 'focus', 'duplicate', 'delete' ] : [];
		const actions = ids.map( id => editor.keymap.actions.find( action => action.id === id ) ).filter( Boolean );
		for ( const id of [ 'renameObject', 'parentObject', 'clearParent' ] ) {

			if ( editor.keymap.actionAvailable( id ) ) actions.push( { ...editor.keymap.actions.find( action => action.id === id ), section: 'Hierarchy' } );

		}
		if ( editor.keymap.actionAvailable( 'joinMeshes' ) ) actions.unshift( editor.keymap.actions.find( action => action.id === 'joinMeshes' ) );
		if ( edit ) {

			if ( model.canInsertPrimitive ) actions.push( { label: 'Add Mesh…', section: 'Mesh operations', run: () => openAdd( position ) } );
			actions.push( ...model.actions().map( action => ( { ...action, section: 'Mesh operations' } ) ) );
			if ( model.canSeparate ) actions.push( { label: 'Separate…', section: 'Mesh operations', run: () => openSeparate( position ) } );
			actions.push( { label: 'Select all', section: 'Selection', run: () => model.selectPoints( true ) },
				{ label: 'Deselect all', section: 'Selection', run: () => model.selectPoints( false ) } );
			for ( const id of [ 'selectLinked', 'selectMore', 'selectLess', 'invertMeshSelection' ] ) {

				const action = editor.keymap.actions.find( action => action.id === id );
				if ( editor.keymap.actionAvailable( id ) ) actions.push( { ...action, section: 'Selection' } );

			}

		} else if ( editor.selected?.userData.measurement ) {

			actions.unshift( { label: 'Edit measurement', run: () => editor.viewTools.setWorkspaceMode( 'edit' ) } );

		} else actions.unshift( { label: 'Add…', run: () => openAdd( position ) }, ...outlineActions( editor, editor.selected ) );
		actions.push( ...originActions( editor ) );
		if ( editor.selected ) for ( const [ value, label ] of [ [ 'bounds', 'Bounds center' ], [ 'bottom', 'Bounds bottom center' ], [ 'median', 'Median' ], [ 'active', 'Active element' ], [ 'origin', 'World origin' ], [ 'cursor', '3D Cursor' ] ] ) actions.push( {

			label: 'Pivot: ' + label, section: 'Transform pivot', run: () => {

				editor.config.setKey( 'settings/transformPivot', value );
				editor.signals.transformSettingsChanged.dispatch( 'transformPivot' );

			}

		} );
		show( edit ? 'Edit geometry' : editor.selected?.name || 'Scene', actions, position );
	}

	function openPalette() {

		const rect = viewport.getBoundingClientRect();
		const actions = editor.keymap.actions.filter( action => ! [ 'palette', 'paletteAlternate' ].includes( action.id ) && editor.keymap.actionAvailable( action.id ) && editor.keymap.inArea( action ) ).map( action => ( { ...action, section: action.section || action.category } ) );
		if ( ! document.body.dataset.maximizedArea ) {

			const areaPointer = pointer;
			const section = 'Viewport areas';
			actions.push(
				{ label: 'Vertical Split', section, run: () => editor.splitWorkspace.split( 'vertical' ) },
				{ label: 'Horizontal Split', section, run: () => editor.splitWorkspace.split( 'horizontal' ) }
			);
			if ( editor.viewportSplit ) actions.push( { label: 'Close Area', section, run: () => editor.viewLayout.closeArea( areaPointer ) } );

		}
		show( 'Command palette', actions, { x: rect.left + rect.width / 2 - 115, y: rect.top + Math.min( 90, rect.height / 4 ) } );

	}

	viewport.addEventListener( 'contextmenu', event => {

		if ( event.target === editor.renderer?.domElement ) event.preventDefault();

	} );
	document.addEventListener( 'pointerdown', event => { if ( ! menu.hidden && ! menu.contains( event.target ) ) close( false ); }, true );
	return { openAdd, openObject, openPalette, openSeparate, openParent, openRename, show, close };

}

export { ContextMenu };
