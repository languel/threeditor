import { icon } from '../Glyphs.js?v=transform-gizmos';
import { hasRestriction } from '../ObjectRestrictions.js';
import { canEditLightMask } from './LightMask.js?v=projector-shadows';
import { editableMesh } from './ModelViewport.js?v=transform-gizmos';
import { isProjector } from '../assets/Projector.js?v=projector-shadows';
import { modelButton } from './ModelControls.js?v=color-sampler';
import { openMaskEditor } from './MaskEditor.js?v=expressive-pencil';
import { openUVEditor } from './UVEditor.js?v=texture-projection';

export function createEditWorkspace( editor ) {

	const sessions = new Map();
	const names = { mask: 'Mask', image: 'Image & Vector', uv: 'UV', warp: 'Warp', script: 'Script Window' };
	let current, requestedHost, nextId = 0;

	function makeDock() {

		const dock = document.createElement( 'section' );
		nextId ++;
		dock.id = nextId === 1 ? 'editor-2d' : 'editor-2d-' + nextId;
		dock.className = 'viewport-edit-workspace';
		const header = document.createElement( 'div' );
		header.className = 'editor-2d-header';
		const title = document.createElement( 'span' );
		const target = document.createElement( 'span' );
		target.className = 'editor-2d-target';
		header.append( title, target );
		const session = { dock, title, target };
		const screen = document.createElement( 'div' );
		screen.className = 'viewport-edit-content';
		dock.append( header, screen );
		session.screen = screen;
		const activate = () => {
			if ( current === session ) return;
			current = session;
			refresh();
			editor.signals.windowResize.dispatch();
		};
		dock.addEventListener( 'focusin', activate );
		dock.addEventListener( 'pointerdown', activate );
		for ( const event of [ 'mousedown', 'touchstart', 'dblclick', 'contextmenu', 'drop' ] ) dock.addEventListener( event, e => e.stopPropagation() );
		dock.addEventListener( 'keydown', event => event.stopPropagation() );
		return session;

	}

	const first = makeDock();
	first.dock.hidden = true;
	const picker = document.createElement( 'details' );
	picker.className = 'editor-picker';
	const summary = document.createElement( 'summary' );
	summary.innerHTML = icon( 'editorViewport' );
	summary.title = 'Editor Type';
	summary.setAttribute( 'aria-label', 'Editor Type' );
	picker.append( summary );
	const modes = document.createElement( 'div' );
	modes.className = 'viewport-edit-modes';
	modes.setAttribute( 'role', 'group' );
	modes.setAttribute( 'aria-label', 'Editor workspace' );
	picker.append( modes );
	const light = () => [ editor.selected, editor.viewportSource, current?.object ].find( canEditLightMask );
	const mesh = () => [ editor.selected, current?.object ].find( object => editableMesh( object ) && ! hasRestriction( object, 'locked' ) && ! hasRestriction( object, 'disabled' ) );
	const projector = () => [ editor.selected, editor.viewportSource, current?.object ].find( object => isProjector( object ) && canEditLightMask( object ) );
	const sceneButton = modelButton( modes, '3D View', 'editorViewport', () => { picker.open = false; closeSession( current ); } );
	const maskButton = modelButton( modes, 'Mask mode', 'toolMask', () => switchMode( 'mask', light(), openMaskEditor ) );
	const imageButton = modelButton( modes, 'Image and vector mode', 'editorImage', () => switchMode( 'image', null, () => openMaskEditor( editor, null, false, true ) ) );
	const uvButton = modelButton( modes, 'UV mode', 'editorUV', () => switchMode( 'uv', mesh(), openUVEditor ) );
	const warpButton = modelButton( modes, 'Projection warp mode', 'placePlane', () => switchMode( 'warp', projector(), openUVEditor ) );
	const scriptButton = modelButton( modes, 'Script Window', 'editorScript', () => editor.codePanel.open() );
	const buttons = { mask: maskButton, image: imageButton, uv: uvButton, warp: warpButton, script: scriptButton };
	function switchMode( mode, object, open ) {

		picker.open = false;
		if ( current?.mode !== mode || current.object !== object ) open( editor, object );
		else if ( ! current.host.classList.contains( 'workspace-split-pane' ) ) placeDock( editor.splitWorkspace.target(), current );

	}
	function open( mode ) {

		const existing = sessions.get( mode );
		if ( existing && ! requestedHost && ! existing.host.classList.contains( 'workspace-split-pane' ) ) {

			placeDock( editor.splitWorkspace.target(), existing );
			return true;

		}
		if ( existing && ! requestedHost ) {

			current = existing;
			refresh();
			editor.signals.windowResize.dispatch();
			return true;

		}
		const button = buttons[ mode ];
		if ( mode === 'uv' && button.disabled && current?.mode !== 'uv' ) {

			const hint = document.createElement( 'p' );
			hint.textContent = 'Select an editable mesh to view its UVs.';
			editor.editWorkspace.mount( 'uv', null, hint, () => {} );
			return true;

		}
		if ( ! button || button.disabled ) return false;
		button.click();
		return true;

	}
	function sessionAt( area ) {

		return [ ...sessions.values() ].find( session => session.host === area );

	}

	function placeDock( area, session = current ) {

		if ( ! session || ! area ) return;
		const previous = sessionAt( area );
		if ( previous && previous !== session ) closeSession( previous, true );
		if ( session.host !== area ) {

			if ( session.host ) delete session.host.dataset.paneEditor;
			session.host = area;
			area.dataset.paneEditor = session.mode;
			if ( area.moveBefore && session.dock.isConnected ) area.moveBefore( session.dock, null );
			else area.append( session.dock );

		}
		current = session;
		refresh();
		editor.signals.windowResize.dispatch();

	}

	function openIn( mode, area ) {

		const existing = sessions.get( mode );
		if ( existing ) {

			placeDock( area, existing );
			return true;

		}
		requestedHost = area;
		try { return open( mode ); } finally { requestedHost = undefined; }

	}
	function refresh() {

		maskButton.disabled = ! light();
		uvButton.disabled = ! mesh();
		warpButton.disabled = ! projector();
		sceneButton.hidden = ! current;
		summary.title = current ? names[ current.mode ] : 'Editor Type';
		summary.setAttribute( 'aria-label', summary.title );
		for ( const [ mode, button ] of Object.entries( buttons ) ) button.setAttribute( 'aria-pressed', String( current?.mode === mode ) );

	}
	window.addEventListener( 'pointerdown', event => {

		if ( picker.open && ! picker.contains( event.target ) ) picker.open = false;

	}, true );
	picker.addEventListener( 'keydown', event => {

		if ( event.key !== 'Escape' || ! picker.open ) return;
		event.stopPropagation();
		picker.open = false;
		summary.focus();

	} );
	function closeSession( session, replacing = false ) {

		if ( ! session || sessions.get( session.mode ) !== session ) return;
		const area = session.host;
		session.dispose();
		sessions.delete( session.mode );
		delete area.dataset.paneEditor;
		session.host = undefined;
		session.screen.replaceChildren();
		session.dock.hidden = true;
		session.dock.remove();
		if ( current === session ) current = [ ...sessions.values() ].at( -1 );
		refresh();
		if ( ! replacing ) editor.splitWorkspace?.closed( area );
		editor.signals.windowResize.dispatch();

	}

	function close() {

		for ( const session of [ ...sessions.values() ] ) closeSession( session );

	}

	editor.signals.objectSelected.add( object => {

		const uv = sessions.get( 'uv' );
		if ( uv && object && uv.object !== object && editableMesh( object ) && ! hasRestriction( object, 'locked' ) &&
			! hasRestriction( object, 'disabled' ) && ! uv.isDirty?.() ) {

			const active = current;
			requestedHost = uv.host;
			try { openUVEditor( editor, object, { focus: false } ); } finally { requestedHost = undefined; }
			if ( active !== uv && sessions.get( active?.mode ) === active ) current = active;

		}
		refresh();

	} );
	for ( const name of [ 'objectChanged', 'viewportCameraChanged' ] ) editor.signals[ name ].add( refresh );
	for ( const name of [ 'editorCleared', 'projectLoaded', 'startPlayer' ] ) editor.signals[ name ].add( close );
	editor.signals.objectRemoved.add( object => {

		for ( const session of [ ...sessions.values() ] ) if ( session.object &&
			( session.object === object || object.getObjectById( session.object.id ) ) ) closeSession( session );

	} );
	refresh();
	return {
		picker, open, openIn, placeDock,
		available: mode => mode === 'uv' || !! buttons[ mode ] && ! buttons[ mode ].disabled,
		hasMode: mode => sessions.has( mode ),
		closeMode: mode => closeSession( sessions.get( mode ) ),
		closeHost: ( area, replacing ) => closeSession( sessionAt( area ), replacing ),
		sessionAt,
		get host() { return current?.host; },
		get mode() { return current?.mode; },
		get exclusive() { return ! editor.viewportSplit && !! sessionAt( editor.viewLayout.viewport.parentElement ); },
		close,
		mount( mode, object, content, dispose, isDirty ) {

			const previous = sessions.get( mode );
			const area = requestedHost || editor.splitWorkspace.target();
			const displaced = sessionAt( area );
			const available = previous || displaced || ( first.host ? makeDock() : first );
			if ( previous ) closeSession( previous, true );
			if ( displaced && displaced !== previous ) closeSession( displaced, true );
			if ( ! requestedHost ) {

				if ( editor.modeling.gesture?.modal ) editor.modeling.finishTransform( false );
				editor.modeling.releaseDrag();

			}
			const session = Object.assign( available, { mode, object, dispose, isDirty } );
			sessions.set( mode, session );
			session.dock.dataset.editorMode = mode;
			session.dock.setAttribute( 'aria-label', mode === 'script' ? names[ mode ] : names[ mode ] + ' editor area' );
			session.title.textContent = names[ mode ];
			session.target.textContent = object?.name || object?.type || '';
			session.target.title = session.target.textContent;
			session.screen.append( content );
			session.dock.hidden = false;
			picker.open = false;
			placeDock( area, session );

		}
	};

}
