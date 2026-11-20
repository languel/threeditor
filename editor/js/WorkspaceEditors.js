import { icon } from './Glyphs.js?v=editor-glyphs';
import { hasLightView } from './modeling/LightView.js';

const groups = [
	[ 'General', [
		[ 'viewport', '3D Viewport', 'editorViewport' ],
		[ 'image', 'Image & Vector', 'editorImage', 'editor' ],
		[ 'uv', 'UV Editor', 'editorUV', 'editor' ],
		[ 'mask', 'Mask Editor', 'toolMask', 'editor' ],
		[ 'warp', 'Projection Warp', 'placePlane', 'editor' ]
	] ],
	[ 'Animation', [ [ 'timeline', 'Timeline', 'editorTimeline' ] ] ],
	[ 'Scripting', [ [ 'script', 'Script Window', 'editorScript', 'editor' ] ] ],
	[ 'Data', [
		[ 'outliner', 'Outliner', 'editorOutliner' ],
		[ 'properties', 'Properties', 'editorProperties' ],
		[ 'assets', 'Asset Browser', 'editorAssets', 'properties' ],
		[ 'streams', 'Streams', 'streams', 'properties' ],
		[ 'project', 'Project', 'editorProject', 'properties' ],
		[ 'settings', 'Settings', 'settings', 'properties' ]
	] ]
];
const types = new Map( groups.flatMap( ( [ , choices ] ) => choices.map( choice => [ choice[ 0 ], choice ] ) ) );

export function WorkspaceEditors( editor, sidebar, viewport, timeline, ...dockDividers ) {

	const slots = {};
	const surfaces = { viewport, timeline, ...sidebar.areaEditors };
	const picker = document.createElement( 'dialog' );
	picker.className = 'workspace-editor-menu';
	picker.setAttribute( 'aria-label', 'Choose editor' );
	document.body.appendChild( picker );
	let currentTrigger;

	function refreshSlot( slot ) {

		const id = slot.dom.dataset.overlayEditor || slot.editor;
		if ( slot.trigger.dataset.type === id ) return;
		const [ , label, glyph ] = types.get( id ) || [ '', 'Choose Editor', 'editorTypes' ];
		slot.trigger.dataset.type = id;
		slot.trigger.innerHTML = icon( glyph ) + icon( 'down' );
		slot.trigger.title = label + ' · Editor Type';

	}

	const layout = editor.viewLayout;
	const flat = editor.editWorkspace;
	const panes = {};
	const borrowed = new Map();
	let autoSplit = false;
	let activePane = 'director';
	const base = slot => slot.key ? 'viewport' : '';
	const allSlots = () => [ ...Object.values( slots ), ...Object.values( panes ) ];
	const viewportSlot = () => Object.values( slots ).find( slot => slot.editor === 'viewport' );

	function makeSlot( name, key ) {

		const dom = document.createElement( 'div' );
		dom.id = 'workspace-' + name;
		dom.className = 'workspace-editor-slot';
		const trigger = document.createElement( 'button' );
		trigger.type = 'button';
		trigger.dataset.uiRaw = 'keep';
		trigger.className = 'workspace-editor-trigger';
		trigger.setAttribute( 'aria-haspopup', 'dialog' );
		trigger.setAttribute( 'aria-label', 'Editor type for ' + ( key ? name.replace( '-pane', ' pane' ) : types.get( name )[ 1 ] ) );
		const slot = { dom, trigger, key };
		trigger.addEventListener( 'click', () => {

			if ( key ) activePane = key;
			openPicker( slot );

		} );
		dom.append( trigger );
		return slot;

	}

	function mount( slot, id ) {

		slot.editor = slot.dom.dataset.editor = id;
		const surface = slot.key && id === 'viewport' ? undefined : surfaces[ id ];
		if ( surface && surface.parentElement !== slot.dom ) {

			if ( slot.dom.moveBefore && surface.isConnected === slot.dom.isConnected ) slot.dom.moveBefore( surface, slot.trigger );
			else slot.dom.insertBefore( surface, slot.trigger );

		}
		refreshSlot( slot );

	}

	for ( const [ name, element ] of Object.entries( surfaces ) ) {

		const slot = slots[ name ] = makeSlot( name );
		element.before( slot.dom );
		element.classList.add( 'workspace-editor-surface' );
		mount( slot, name );

	}
	for ( const key of [ 'director', 'source' ] ) {

		const slot = panes[ key ] = makeSlot( key + '-pane', key );
		slot.dom.classList.add( 'workspace-split-pane' );
		slot.dom.hidden = true;
		viewport.append( slot.dom );
		mount( slot, 'viewport' );

	}

	function release( slot ) {

		const id = slot.editor;
		if ( ! id || id === 'viewport' ) return;
		const previous = borrowed.get( id );
		const home = [ previous, slots[ id ], ...Object.values( slots ) ].find( area => area && ! area.editor );
		if ( home ) mount( home, id );
		else surfaces[ id ].remove();
		borrowed.delete( id );
		mount( slot, base( slot ) );

	}

	function choose( slot, id, kind ) {

		picker.close();
		if ( kind === 'editor' ) {

			if ( slot.key ) {

				release( slot );
				flat.openIn( id, slot.dom );

			} else flat.open( id );
			return;

		}
		if ( slot.dom.dataset.overlayEditor ) {

			if ( slot.key ) autoSplit = false;
			flat.close( !! slot.key );

		}
		const target = kind || id;
		if ( slot.editor !== target ) {

			if ( slot.key ) {

				release( slot );
				if ( target !== 'viewport' ) {

					const other = allSlots().find( area => area.editor === target );
					if ( other ) {

						if ( ! other.key ) borrowed.set( target, other );
						mount( other, base( other ) );

					}
					mount( slot, target );

				}

			} else {

				const other = allSlots().find( area => area.editor === target &&
					( target !== 'viewport' || ! area.key ) );
				const displaced = slot.editor;
				if ( other?.key && displaced === 'viewport' ) {

					join( other.key );
					if ( kind === 'properties' ) sidebar.select( id );
					return;

				}
				if ( other?.key ) {

					borrowed.delete( target );
					mount( other, displaced || 'viewport' );
					if ( displaced ) borrowed.set( displaced, slot );

				} else if ( other ) mount( other, displaced );
				mount( slot, target );

			}

		}
		if ( kind === 'properties' ) sidebar.select( id );
		editor.signals.windowResize.dispatch();

	}

	function target() {

		editor.workspaceArea?.reveal( viewportSlot().dom );
		if ( flat.host?.classList.contains( 'workspace-split-pane' ) ) return flat.host;
		if ( ! editor.viewportSplit ) {

			autoSplit = true;
			editor.setViewportSplit( true, 'vertical' );

		}
		const slot = panes.source.editor === 'viewport' ? panes.source : panes.director;
		release( slot );
		return slot.dom;

	}

	function closed( host ) {

		if ( autoSplit && Object.values( panes ).some( slot => slot.dom === host ) &&
			Object.values( panes ).every( slot => slot.editor === 'viewport' ) ) {

			autoSplit = false;
			editor.setViewportSplit( false );

		}

	}

	function join( key ) {

		const slot = panes[ key ];
		const main = viewportSlot();
		const mode = slot.dom.dataset.overlayEditor;
		const id = slot.editor;
		autoSplit = false;
		if ( mode ) flat.placeDock( main.dom );
		if ( ! mode && id === 'viewport' && key === 'director' ) editor.setViewportCamera( editor.camera.uuid );
		editor.setViewportSplit( false );
		if ( ! mode && id !== 'viewport' ) choose( main, id );
		editor.signals.windowResize.dispatch();

	}

	function showMenu( position ) {

		const actions = [
			{ label: 'Vertical Split', run: () => split( 'vertical' ) },
			{ label: 'Horizontal Split', run: () => split( 'horizontal' ) }
		];
		if ( editor.viewportSplit ) {

			const keys = layout.swapped ? [ 'source', 'director' ] : [ 'director', 'source' ];
			const sides = editor.viewportSplitAxis === 'horizontal' ? [ 'Top', 'Bottom' ] : [ 'Left', 'Right' ];
			sides.forEach( ( side, index ) => {

				actions.push( { label: 'Change ' + side + ' Editor…', run: () => openPicker( panes[ keys[ index ] ] ) } );

			} );
			sides.forEach( ( side, index ) => {

				actions.push( { label: 'Join · Keep ' + side, run: () => join( keys[ index ] ) } );

			} );
			actions.push( { label: 'Swap Areas', run: () => {

				autoSplit = false;
				layout.swapped = ! layout.swapped;
				editor.signals.viewportCameraChanged.dispatch();

			} } );
			const active = activePane;
			actions.push( { label: 'Close Active Area', run: () => join( keys.find( key => key !== active ) ) } );

		}
		editor.contextMenu.show( 'Split View', actions, position );

	}

	function split( axis ) {

		autoSplit = false;
		if ( flat.host === viewport.parentElement ) flat.placeDock( panes.source.dom );
		if ( ! editor.viewportSplit && ! editor.viewportSource && editor.viewportCamera === editor.camera &&
			! panes.source.dom.dataset.overlayEditor ) {

			if ( hasLightView( editor.selected ) ) editor.setViewportSource( editor.selected );
			else if ( editor.activeSceneCamera ) editor.setViewportCamera( editor.activeSceneCamera.uuid );

		}
		editor.setViewportSplit( true, axis );
		editor.signals.windowResize.dispatch();

	}

	for ( const divider of [ layout.divider, ...dockDividers ] ) {

		divider.setAttribute( 'aria-haspopup', 'dialog' );
		divider.addEventListener( 'keydown', event => {

			if ( event.key !== 'ContextMenu' && ! ( event.shiftKey && event.key === 'F10' ) ) return;
			event.preventDefault();
			event.stopPropagation();
			const bounds = divider.getBoundingClientRect();
			showMenu( { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } );

		} );
		divider.addEventListener( 'contextmenu', event => {

			event.preventDefault();
			event.stopPropagation();
			showMenu( { x: event.clientX, y: event.clientY } );

		} );

	}
	viewport.addEventListener( 'pointerdown', event => {

		if ( ! editor.viewportSplit || event.target.closest( '.viewport-header, .viewport-split-divider' ) ) return;
		activePane = layout.at( event.clientX, event.clientY, 'area' )?.key || activePane;

	}, true );
	layout.isViewportPane = key => ! editor.viewportSplit ||
		( panes[ key ].editor === 'viewport' && ! panes[ key ].dom.dataset.overlayEditor );
	editor.splitWorkspace = { target, closed, showMenu, split, join };
	const header = viewport.querySelector( '.viewport-header' );
	const headerControls = header.querySelectorAll( '.viewport-controls, .viewport-tool-panel, #toolbar, .viewport-tool-context' );
	function syncPanes() {

		const enabled = editor.viewportSplit;
		if ( viewport.hasAttribute( 'data-workspace-split' ) !== enabled ) {

			viewport.toggleAttribute( 'data-workspace-split', enabled );
			queueMicrotask( () => editor.signals.windowResize.dispatch() );

		}
		document.body.classList.toggle( 'workspace-split', enabled );
		if ( ! enabled ) {

			autoSplit = false;
			layout.swapped = false;
			activePane = layout.activeKey = 'director';
			if ( flat.host?.classList.contains( 'workspace-split-pane' ) ) flat.close();
			for ( const slot of Object.values( panes ) ) {

				slot.dom.hidden = true;
				release( slot );

			}
			return;

		}
		const top = Math.max( ...Array.from( headerControls, item => item.offsetTop + item.offsetHeight ) );
		viewport.style.setProperty( '--workspace-split-header', top + 'px' );
		const toolArea = layout.frames.find( frame => frame.director && layout.isViewportPane( frame.key ) )?.area;
		viewport.toggleAttribute( 'data-split-tools', !! toolArea );
		if ( toolArea ) {

			viewport.style.setProperty( '--workspace-tools-x', toolArea.x + 'px' );
			viewport.style.setProperty( '--workspace-tools-y', Math.max( top, toolArea.y ) + 'px' );

		}
		for ( const slot of Object.values( panes ) ) {

			const area = layout.frames.find( frame => frame.key === slot.key )?.area;
			slot.dom.hidden = ! area;
			if ( ! area ) continue;
			const y = Math.max( top, area.y );
			Object.assign( slot.dom.style, {
				left: area.x + 'px', top: y + 'px', width: area.width + 'px',
				height: Math.max( 0, area.y + area.height - y ) + 'px'
			} );
			refreshSlot( slot );

		}

	}
	new ResizeObserver( syncPanes ).observe( header );
	editor.signals.sceneRendered.add( syncPanes );
	editor.signals.viewportCameraChanged.add( syncPanes );

	function openPicker( slot, trigger = slot.trigger ) {

		if ( picker.open || editor.viewTools.pointer || editor.modeling.gesture || editor.modeling.drag ||
			editor.modalTransform.active || editor.flyControls.active || document.body.classList.contains( 'presenting' ) ) return;
		currentTrigger = trigger;
		const activeType = slot.dom.dataset.overlayEditor ||
			( slot.editor === 'properties' && types.get( sidebar.selected )?.[ 3 ] === 'properties' ? sidebar.selected : slot.editor );
		picker.replaceChildren();
		for ( const [ label, choices ] of groups ) {

			const section = document.createElement( 'section' );
			const heading = document.createElement( 'div' );
			heading.textContent = label;
			section.appendChild( heading );
			for ( const [ id, title, glyph, kind ] of choices ) {

				const button = document.createElement( 'button' );
				button.type = 'button';
				button.dataset.uiRaw = 'keep';
				button.innerHTML = icon( glyph );
				button.append( title );
				button.disabled = kind === 'editor' && ! editor.editWorkspace.available( id );
				button.setAttribute( 'aria-pressed', String( activeType === id ) );
				button.addEventListener( 'click', () => choose( slot, id, kind ) );
				section.appendChild( button );

			}
			picker.appendChild( section );

		}
		picker.showModal();
		const anchor = trigger.getBoundingClientRect();
		const bounds = picker.getBoundingClientRect();
		const { clientWidth, clientHeight } = document.documentElement;
		picker.style.left = Math.max( 4, Math.min( anchor.left, clientWidth - bounds.width - 4 ) ) + 'px';
		const below = anchor.bottom + 4;
		picker.style.top = Math.max( 4, below + bounds.height <= clientHeight ? below : anchor.top - bounds.height - 4 ) + 'px';
		( picker.querySelector( 'button[aria-pressed="true"]:enabled' ) || picker.querySelector( 'button:enabled' ) )?.focus();

	}
	picker.addEventListener( 'click', event => { if ( event.target === picker ) picker.close(); } );
	picker.addEventListener( 'close', () => currentTrigger?.focus( { preventScroll: true } ) );
	editor.signals.windowResize.add( () => {

		for ( const slot of allSlots() ) refreshSlot( slot );

	} );
	return slots;

}
