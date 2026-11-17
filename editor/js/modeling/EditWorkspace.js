import { hasRestriction } from '../ObjectRestrictions.js';
import { canEditLightMask } from './LightMask.js?v=mask-editor';
import { editableMesh } from './ModelViewport.js?v=mesh-build';
import { isProjector } from '../assets/Projector.js?v=mask-editor';
import { modelButton } from './ModelControls.js';
import { openMaskEditor } from './MaskEditor.js?v=mesh-build';
import { openUVEditor } from './UVEditor.js?v=docked-2d';

export function createEditWorkspace( editor, viewport ) {

	const dock = document.createElement( 'section' );
	dock.className = 'viewport-edit-workspace';
	dock.hidden = true;
	const picker = document.createElement( 'details' );
	picker.className = 'viewport-editor-picker';
	const summary = document.createElement( 'summary' );
	summary.textContent = '2D Editors';
	picker.append( summary );
	const modes = document.createElement( 'div' );
	modes.className = 'viewport-edit-modes';
	modes.setAttribute( 'role', 'group' );
	modes.setAttribute( 'aria-label', 'Editor workspace' );
	const screen = document.createElement( 'div' );
	screen.className = 'viewport-edit-content';
	dock.append( screen );
	picker.append( modes );
	viewport.append( dock, picker );
	let current;
	const light = () => [ editor.selected, editor.viewportSource, current?.object ].find( canEditLightMask );
	const mesh = () => [ editor.selected, current?.object ].find( object => editableMesh( object ) && ! hasRestriction( object, 'locked' ) && ! hasRestriction( object, 'disabled' ) );
	const projector = () => [ editor.selected, editor.viewportSource, current?.object ].find( object => isProjector( object ) && canEditLightMask( object ) );
	const sceneButton = modelButton( modes, '3D View', 'objectMode', () => { picker.open = false; close(); } );
	const maskButton = modelButton( modes, 'Mask mode', 'toolMask', () => switchMode( 'mask', light(), openMaskEditor ) );
	const imageButton = modelButton( modes, 'Image and vector mode', 'surface', () => switchMode( 'image', null, () => openMaskEditor( editor, null, false, true ) ) );
	const uvButton = modelButton( modes, 'UV mode', 'toolGrid', () => switchMode( 'uv', mesh(), openUVEditor ) );
	const warpButton = modelButton( modes, 'Projection warp mode', 'placePlane', () => switchMode( 'warp', projector(), openUVEditor ) );
	const buttons = { mask: maskButton, image: imageButton, uv: uvButton, warp: warpButton };
	function switchMode( mode, object, open ) {

		picker.open = false;
		if ( current?.mode !== mode || current.object !== object ) open( editor, object );

	}
	function refresh() {

		maskButton.disabled = ! light();
		uvButton.disabled = ! mesh();
		warpButton.disabled = ! projector();
		sceneButton.hidden = ! current;
		summary.textContent = current ? { mask: 'Mask', image: 'Image & Vector', uv: 'UV', warp: 'Warp' }[ current.mode ] : '2D Editors';
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
	function close() {

		if ( ! current ) return;
		current.dispose();
		current = undefined;
		screen.replaceChildren();
		dock.hidden = true;
		viewport.classList.remove( 'editing-2d' );
		refresh();

	}
	for ( const name of [ 'objectSelected', 'objectChanged', 'viewportCameraChanged' ] ) editor.signals[ name ].add( refresh );
	for ( const name of [ 'editorCleared', 'projectLoaded', 'startPlayer' ] ) editor.signals[ name ].add( close );
	editor.signals.objectRemoved.add( object => {

		if ( current?.object && ( current.object === object || object.getObjectById( current.object.id ) ) ) close();

	} );
	for ( const event of [ 'mousedown', 'touchstart', 'dblclick', 'contextmenu', 'drop' ] ) dock.addEventListener( event, e => e.stopPropagation() );
	dock.addEventListener( 'keydown', event => {

		event.stopPropagation();
		if ( event.key === 'Escape' && ! event.defaultPrevented ) close();

	} );
	refresh();
	return {
		get mode() { return current?.mode; },
		close,
		mount( mode, object, content, dispose ) {

			close();
			editor.viewTools.setMode( '' );
			if ( editor.modeling.gesture?.modal ) editor.modeling.finishTransform( false );
			editor.modeling.releaseDrag();
			current = { mode, object, dispose };
			screen.append( content );
			picker.open = false;
			dock.hidden = false;
			viewport.classList.add( 'editing-2d' );
			refresh();

		}
	};

}
