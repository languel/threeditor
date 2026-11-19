import { UINumber, UIInteger } from './libs/ui.js';

let installed = false;

// The modifier gesture also works on focused controls and native number inputs.
// Commit once on release so inspectors that rebuild on change keep capture.
export function installNumericScrubbing() {

	if ( installed ) return;
	installed = true;
	for ( const Type of [ UINumber, UIInteger ] ) {

		const setValue = Type.prototype.setValue;
		Type.prototype.setValue = function ( value ) {

			this.dom.numericControl = this;
			return setValue.call( this, value );

		};

	}
	let gesture, suppressContext;
	const hinted = new WeakSet();
	document.addEventListener( 'pointerover', event => {

		const input = event.target;
		if ( ! input.matches?.( 'input[type="number"], input.Number' ) || hinted.has( input ) ) return;
		hinted.add( input );
		input.title = ( input.title ? input.title + '\n' : '' ) + 'Cmd-drag to adjust; Shift-drag for fine adjustment; Ctrl-drag to snap. Escape cancels.';

	}, true );
	function write( state, value ) {

		if ( state.control ) state.control.setValue( value );
		else state.input.value = String( value );

	}
	function finish( event, cancel = false ) {

		if ( ! gesture || event.pointerId !== undefined && gesture.id !== event.pointerId ) return;
		const state = gesture; gesture = undefined;
		if ( cancel ) write( state, state.start );
		if ( state.input.hasPointerCapture( state.id ) ) state.input.releasePointerCapture( state.id );
		state.input.style.cursor = state.cursor;
		if ( ! cancel && state.travel >= 2 && Number.parseFloat( state.input.value ) !== state.start ) {

			state.input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
			state.input.dispatchEvent( new Event( 'change', { bubbles: true } ) );

		}
		else if ( ! cancel && state.travel < 2 ) { state.input.focus(); state.input.select(); }

	}
	document.addEventListener( 'pointerdown', event => {

		const input = event.target;
		if ( gesture || event.button !== 0 || ! ( event.metaKey || event.ctrlKey || event.shiftKey ) ||
			! input.matches?.( 'input[type="number"], input.Number' ) || input.disabled || input.readOnly ) return;
		const start = Number.parseFloat( input.value );
		if ( ! Number.isFinite( start ) ) return;
		const control = input.numericControl;
		const configured = control?.step ?? Number( input.step );
		const step = Number.isFinite( configured ) && configured > 0 ? configured : 1;
		const sensitivity = Number( input.dataset?.scrubSensitivity );
		gesture = { input, control, step, sensitivity: sensitivity > 0 ? sensitivity : step / 50, start, raw: start, id: event.pointerId, x: event.clientX, y: event.clientY, travel: 0,
			min: control?.scrubRange?.[ 0 ] ?? control?.min ?? ( input.min !== '' ? Number( input.min ) : - Infinity ),
			max: control?.scrubRange?.[ 1 ] ?? control?.max ?? ( input.max !== '' ? Number( input.max ) : Infinity ),
			precision: control instanceof UIInteger ? 0 : control?.precision ?? 6, cursor: input.style.cursor };
		event.preventDefault(); event.stopImmediatePropagation();
		input.style.cursor = 'ew-resize'; input.setPointerCapture( event.pointerId );
		suppressContext = { input, until: performance.now() + 1000 };

	}, true );
	document.addEventListener( 'pointermove', event => {

		const state = gesture;
		if ( ! state || state.id !== event.pointerId ) return;
		event.preventDefault(); event.stopImmediatePropagation();
		const dx = event.clientX - state.x, dy = event.clientY - state.y;
		state.x = event.clientX; state.y = event.clientY; state.travel += Math.abs( dx ) + Math.abs( dy );
		if ( state.travel < 2 ) return;
		state.raw = Math.min( state.max, Math.max( state.min, state.raw + ( dx - dy ) * state.sensitivity / ( event.shiftKey ? 10 : 1 ) ) );
		const step = state.step * ( event.shiftKey ? .1 : 1 );
		const value = event.ctrlKey ? Math.round( state.raw / step ) * step : state.raw;
		write( state, Number( Math.min( state.max, Math.max( state.min, value ) ).toFixed( state.precision ) ) );
		suppressContext.until = performance.now() + 1000;

	}, true );
	for ( const type of [ 'pointerup', 'pointercancel', 'lostpointercapture' ] ) document.addEventListener( type, event => {

		if ( gesture?.id !== event.pointerId ) return;
		event.preventDefault(); event.stopImmediatePropagation(); finish( event, type !== 'pointerup' );

	}, true );
	window.addEventListener( 'keydown', event => {

		if ( ! gesture || event.key !== 'Escape' ) return;
		event.preventDefault(); event.stopImmediatePropagation(); finish( event, true );

	}, true );
	window.addEventListener( 'blur', event => finish( event, true ) );
	document.addEventListener( 'contextmenu', event => {

		if ( gesture?.input === event.target || suppressContext?.input === event.target && suppressContext.until > performance.now() ) { event.preventDefault(); event.stopImmediatePropagation(); }

	}, true );

}
