import { icon } from '../Glyphs.js?v=element-select';
import { hasRestriction } from '../ObjectRestrictions.js';
import { canEditLightMask } from './LightMask.js?v=mask-editor';
import { editableMesh } from './ModelViewport.js?v=tool-layout';
import { isProjector } from '../assets/Projector.js?v=mask-editor';
import { modelButton } from './ModelControls.js?v=tool-layout';
import { openMaskEditor } from './MaskEditor.js?v=brush-shortcuts';
import { openUVEditor } from './UVEditor.js?v=mixed-editor-areas';

export function createEditWorkspace( editor, viewport ) {

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
	const splitButton = modelButton( header, 'Show 3D view alongside', 'viewportSplit', () => toggleSplit() );
	modelButton( header, 'Close editor area', 'exitTool', () => close() );
	dock.append( header );
	const divider = document.createElement( 'div' );
	divider.className = 'editor-2d-divider';
	divider.tabIndex = 0;
	divider.setAttribute( 'role', 'separator' );
	divider.setAttribute( 'aria-label', 'Resize 2D and 3D areas' );
	divider.setAttribute( 'aria-orientation', 'vertical' );
	divider.setAttribute( 'aria-controls', 'editor-2d viewport' );
	divider.setAttribute( 'aria-valuemin', '25' );
	divider.setAttribute( 'aria-valuemax', '75' );
	divider.setAttribute( 'aria-valuenow', '50' );
	dock.append( divider );
	const picker = document.createElement( 'details' );
	picker.className = 'editor-picker';
	const summary = document.createElement( 'summary' );
	summary.innerHTML = icon( 'editorTypes' );
	summary.title = '2D Editors';
	summary.setAttribute( 'aria-label', '2D Editors' );
	picker.append( summary );
	const modes = document.createElement( 'div' );
	modes.className = 'viewport-edit-modes';
	modes.setAttribute( 'role', 'group' );
	modes.setAttribute( 'aria-label', 'Editor workspace' );
	const screen = document.createElement( 'div' );
	screen.className = 'viewport-edit-content';
	dock.append( screen );
	picker.append( modes );
	let current;
	let split = false, ratio = .5;
	const names = { mask: 'Mask', image: 'Image & Vector', uv: 'UV', warp: 'Warp' };
	const splitPreference = new Map( [ [ 'uv', true ], [ 'image', true ] ] );
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
	function open( mode ) {

		const button = buttons[ mode ];
		if ( ! button || button.disabled ) return false;
		button.click();
		return true;

	}
	function syncLayout() {

		const occupied = [ 'code-panel', 'sidebar' ].reduce( ( width, id ) => {

			const panel = document.getElementById( id );
			return width + ( panel?.dataset.dock === 'open' ? panel.offsetWidth : 0 );

		}, 0 );
		const canSplit = window.innerWidth - occupied >= 640;
		split = !! ( current && canSplit && splitPreference.get( current.mode ) );
		splitButton.disabled = ! canSplit;
		splitButton.setAttribute( 'aria-pressed', String( split ) );
		divider.hidden = ! split;
		document.body.classList.toggle( 'workspace-2d-split', split );
		viewport.classList.toggle( 'editing-2d', !! current && ! split );

	}
	function toggleSplit() {

		if ( ! current || splitButton.disabled ) return;
		splitPreference.set( current.mode, ! split );
		editor.signals.windowResize.dispatch();

	}
	function resize( next ) {

		ratio = Math.max( .25, Math.min( .75, next ) );
		document.body.style.setProperty( '--editor-split-ratio', ratio );
		divider.setAttribute( 'aria-valuenow', String( Math.round( ratio * 100 ) ) );
		editor.signals.windowResize.dispatch();

	}
	divider.addEventListener( 'pointerdown', event => {

		if ( event.button === 0 ) divider.setPointerCapture( event.pointerId );

	} );
	divider.addEventListener( 'pointermove', event => {

		if ( ! divider.hasPointerCapture( event.pointerId ) ) return;
		const start = dock.getBoundingClientRect().left;
		const end = viewport.getBoundingClientRect().right;
		resize( ( event.clientX - start ) / ( end - start ) );

	} );
	divider.addEventListener( 'keydown', event => {

		if ( ! [ 'ArrowLeft', 'ArrowRight' ].includes( event.key ) ) return;
		event.preventDefault();
		resize( ratio + ( event.key === 'ArrowLeft' ? -.05 : .05 ) );

	} );
	editor.signals.windowResize.add( syncLayout );
	function refresh() {

		maskButton.disabled = ! light();
		uvButton.disabled = ! mesh();
		warpButton.disabled = ! projector();
		sceneButton.hidden = ! current;
		summary.title = current ? names[ current.mode ] : '2D Editors';
		summary.setAttribute( 'aria-label', summary.title );
		title.textContent = current ? names[ current.mode ] : '';
		dock.setAttribute( 'aria-label', current ? title.textContent + ' editor area' : '2D editor area' );
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
	function close() {

		if ( ! current ) return;
		current.dispose();
		current = undefined;
		screen.replaceChildren();
		dock.hidden = true;
		refresh();
		editor.signals.windowResize.dispatch();

	}
	editor.signals.objectSelected.add( object => {

		if ( split && current?.mode === 'uv' && current.object !== object && mesh() === object && ! current.isDirty?.() ) {

			openUVEditor( editor, object, { focus: false } );

		} else refresh();

	} );
	for ( const name of [ 'objectChanged', 'viewportCameraChanged' ] ) editor.signals[ name ].add( refresh );
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
		picker, dock, open, toggleSplit,
		get mode() { return current?.mode; },
		get exclusive() { return !! current && ! split; },
		get canSplit() { return !! current && ! splitButton.disabled; },
		close,
		mount( mode, object, content, dispose, isDirty ) {

			close();
			editor.viewTools.setMode( '' );
			if ( editor.modeling.gesture?.modal ) editor.modeling.finishTransform( false );
			editor.modeling.releaseDrag();
			current = { mode, object, dispose, isDirty };
			screen.append( content );
			picker.open = false;
			dock.hidden = false;
			refresh();
			editor.signals.windowResize.dispatch();

		}
	};

}
