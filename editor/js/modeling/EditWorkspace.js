import { icon } from '../Glyphs.js?v=editor-glyphs';
import { hasRestriction } from '../ObjectRestrictions.js';
import { canEditLightMask } from './LightMask.js?v=projector-shadows';
import { editableMesh } from './ModelViewport.js?v=sculpt-targets';
import { isProjector } from '../assets/Projector.js?v=projector-shadows';
import { modelButton } from './ModelControls.js?v=color-sampler';
import { openMaskEditor } from './MaskEditor.js?v=short-strokes';
import { openUVEditor } from './UVEditor.js?v=pencil-reference';

export function createEditWorkspace( editor ) {

	const dock = document.createElement( 'section' );
	dock.id = 'editor-2d';
	dock.className = 'viewport-edit-workspace';
	dock.hidden = true;
	const header = document.createElement( 'div' );
	header.className = 'editor-2d-header';
	const title = document.createElement( 'span' );
	const target = document.createElement( 'span' );
	target.className = 'editor-2d-target';
	header.append( title, target );
	modelButton( header, 'Close editor area', 'exitTool', () => close() );
	dock.append( header );
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
	const screen = document.createElement( 'div' );
	screen.className = 'viewport-edit-content';
	dock.append( screen );
	picker.append( modes );
	let current, host, requestedHost;
	const names = { mask: 'Mask', image: 'Image & Vector', uv: 'UV', warp: 'Warp', script: 'Script Window' };
	const light = () => [ editor.selected, editor.viewportSource, current?.object ].find( canEditLightMask );
	const mesh = () => [ editor.selected, current?.object ].find( object => editableMesh( object ) && ! hasRestriction( object, 'locked' ) && ! hasRestriction( object, 'disabled' ) );
	const projector = () => [ editor.selected, editor.viewportSource, current?.object ].find( object => isProjector( object ) && canEditLightMask( object ) );
	const sceneButton = modelButton( modes, '3D View', 'editorViewport', () => { picker.open = false; close(); } );
	const maskButton = modelButton( modes, 'Mask mode', 'toolMask', () => switchMode( 'mask', light(), openMaskEditor ) );
	const imageButton = modelButton( modes, 'Image and vector mode', 'editorImage', () => switchMode( 'image', null, () => openMaskEditor( editor, null, false, true ) ) );
	const uvButton = modelButton( modes, 'UV mode', 'editorUV', () => switchMode( 'uv', mesh(), openUVEditor ) );
	const warpButton = modelButton( modes, 'Projection warp mode', 'placePlane', () => switchMode( 'warp', projector(), openUVEditor ) );
	const scriptButton = modelButton( modes, 'Script Window', 'editorScript', () => editor.codePanel.open() );
	const buttons = { mask: maskButton, image: imageButton, uv: uvButton, warp: warpButton, script: scriptButton };
	function switchMode( mode, object, open ) {

		picker.open = false;
		if ( current?.mode !== mode || current.object !== object ) open( editor, object );

	}
	function open( mode ) {

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
	function exclusive() {

		return !! current && host === editor.viewLayout.viewport.parentElement;

	}

	function placeDock( nextHost ) {

		if ( host ) delete host.dataset.overlayEditor;
		host = nextHost;
		if ( host ) {

			host.dataset.overlayEditor = current.mode;
			host.appendChild( dock );

		} else if ( dock.parentElement !== document.body ) document.body.appendChild( dock );

	}

	function openIn( mode, area ) {

		if ( current?.mode === mode ) {

			placeDock( area );
			editor.signals.windowResize.dispatch();
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
		title.textContent = current ? names[ current.mode ] : '';
		if ( current ) dock.dataset.editorMode = current.mode;
		else delete dock.dataset.editorMode;
		dock.setAttribute( 'aria-label', current?.mode === 'script' ? title.textContent : current ? title.textContent + ' editor area' : '2D editor area' );
		target.textContent = current?.object?.name || current?.object?.type || '';
		target.title = target.textContent;
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
	function close( replacing = false ) {

		if ( ! current ) return;
		const previousHost = host;
		current.dispose();
		current = undefined;
		screen.replaceChildren();
		dock.hidden = true;
		placeDock();
		refresh();
		if ( ! replacing ) editor.splitWorkspace?.closed( previousHost );
		editor.signals.windowResize.dispatch();

	}
	editor.signals.objectSelected.add( object => {

		if ( current?.mode === 'uv' && ( ! exclusive() || ! current.object ) && object && current.object !== object && mesh() === object && ! current.isDirty?.() ) {

			requestedHost = host;
			try { openUVEditor( editor, object, { focus: false } ); } finally { requestedHost = undefined; }

		} else refresh();

	} );
	for ( const name of [ 'objectChanged', 'viewportCameraChanged' ] ) editor.signals[ name ].add( refresh );
	for ( const name of [ 'editorCleared', 'projectLoaded', 'startPlayer' ] ) editor.signals[ name ].add( () => close() );
	editor.signals.objectRemoved.add( object => {

		if ( current?.object && ( current.object === object || object.getObjectById( current.object.id ) ) ) close();

	} );
	for ( const event of [ 'mousedown', 'touchstart', 'dblclick', 'contextmenu', 'drop' ] ) dock.addEventListener( event, e => e.stopPropagation() );
	dock.addEventListener( 'keydown', event => {

		event.stopPropagation();
		if ( event.key === 'Escape' && ! event.defaultPrevented && ! event.target.closest?.( '.CodeMirror' ) ) close();

	} );
	refresh();
	return {
		picker, dock, open, openIn, placeDock,
		available: mode => mode === 'uv' || !! buttons[ mode ] && ! buttons[ mode ].disabled,
		get host() { return host; },
		get mode() { return current?.mode; },
		get exclusive() { return exclusive(); },
		close,
		mount( mode, object, content, dispose, isDirty ) {

			const area = requestedHost || editor.splitWorkspace?.target();
			close( true );
			editor.viewTools.setMode( '' );
			if ( editor.modeling.gesture?.modal ) editor.modeling.finishTransform( false );
			editor.modeling.releaseDrag();
			current = { mode, object, dispose, isDirty };
			placeDock( area );
			screen.append( content );
			picker.open = false;
			dock.hidden = false;
			refresh();
			editor.signals.windowResize.dispatch();

		}
	};

}
