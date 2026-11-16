import { icon } from '../Glyphs.js?v=timeline-glyphs';

const controls = new WeakMap();
const fields = new WeakMap();
let hovered;

export function addTimelineKey( editor, anchor, label, target, { field = anchor, display } = {} ) {

	const button = document.createElement( 'button' );
	button.type = 'button';
	button.className = 'timeline-key-dot';
	button.innerHTML = icon( 'keyframe' );
	button.setAttribute( 'aria-label', 'Keyframe ' + label );
	button.title = 'Keyframe ' + label + ' · Shift-click to arm for recording';
	( anchor.dom || anchor ).after( button );

	const node = field.dom || field;
	const entry = { button, target, node, display };
	controls.set( button, entry );
	fields.set( node, entry );
	fields.set( anchor.dom || anchor, entry );
	fields.set( button, entry );
	button.onclick = event => {

		const property = target();
		if ( event.shiftKey ) editor.timeline?.toggleArmed( property );
		else editor.timeline?.toggleKey( property );

	};
	refreshKeyControl( editor.timeline, entry );

}

export function hoveredTimelineProperty() {

	return hovered?.isConnected ? fields.get( hovered )?.target() : undefined;

}

function refreshKeyControl( timeline, entry ) {

	const { button, target, node, display } = entry;

	const property = target();
	const state = property && timeline?.keyState( property );
	button.disabled = ! state?.available;
	button.dataset.keyState = state?.keyed ? 'key' : state?.animated ? 'animated' : 'unkeyed';
	button.classList.toggle( 'armed', !! state?.armed );
	button.setAttribute( 'aria-pressed', String( !! state?.keyed ) );
	if ( ( state?.animated || entry.animated ) && display && ! node.matches( ':focus-within, :active' ) && state?.value !== undefined ) display( state.value );
	entry.animated = state?.animated;

}

export function refreshTimelineKeyControls( timeline ) {

	for ( const button of document.querySelectorAll( '.timeline-key-dot' ) ) {

		refreshKeyControl( timeline, controls.get( button ) );

	}

}

export function watchTimelineFields( root ) {

	root.addEventListener( 'pointerover', event => {

		hovered = event.target;
		while ( hovered && ! fields.has( hovered ) ) hovered = hovered.parentElement;

	} );
	root.addEventListener( 'pointerleave', () => { hovered = undefined; } );

}
