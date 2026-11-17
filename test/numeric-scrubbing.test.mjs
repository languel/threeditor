import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UINumber, UIInteger } from '../editor/js/libs/ui.js';
import { installNumericScrubbing } from '../editor/js/NumericScrubbing.js';

test( 'Modifier scrubbing handles focused numbers, fine motion, snapping, bounds and cancellation as one change', () => {

	class Input extends EventTarget {

		style = {}; value = ''; min = ''; max = ''; step = ''; captured = null;
		setAttribute() {}
		matches() { return true; }
		setPointerCapture( id ) { this.captured = id; }
		hasPointerCapture( id ) { return this.captured === id; }
		releasePointerCapture() { this.captured = null; }
		focus() { document.activeElement = this; }
		select() {}

	}
	globalThis.document = Object.assign( new EventTarget(), { createElement: () => new Input(), activeElement: null } );
	globalThis.window = new EventTarget();
	try {

		installNumericScrubbing();
		const number = new UINumber( .15 ).setPrecision( 3 ).setRange( 0, 2 );
		number.dom.focus();
		const changes = []; number.onChange( () => changes.push( number.getValue() ) );
		const send = ( type, properties = {}, field = number.dom ) => {

			const event = Object.assign( new Event( type, { cancelable: true } ), { pointerId: 1, button: 0, clientX: 0, clientY: 0, ...properties } );
			Object.defineProperty( event, 'target', { value: field } );
			document.dispatchEvent( event );

		};
		send( 'pointerdown', { metaKey: true } );
		send( 'pointermove', { metaKey: true, clientX: 50 } );
		assert.equal( number.getValue(), 1.15 ); assert.equal( changes.length, 0 );
		send( 'pointerup' ); assert.deepEqual( changes, [ 1.15 ] );
		send( 'pointerdown', { shiftKey: true } ); send( 'pointermove', { shiftKey: true, clientX: 50 } ); send( 'pointerup' );
		assert.equal( number.getValue(), 1.25 );
		send( 'pointerdown', { ctrlKey: true } ); send( 'pointermove', { ctrlKey: true, clientX: 5 } ); send( 'pointerup' );
		assert.equal( number.getValue(), 1 );
		send( 'pointerdown', { metaKey: true } ); send( 'pointermove', { metaKey: true, clientX: 500 } );
		assert.equal( number.getValue(), 2 ); send( 'pointercancel' );
		assert.equal( number.getValue(), 1 ); assert.equal( changes.length, 3 ); assert.equal( number.dom.captured, null );
		const integer = new UIInteger( 10 );
		send( 'pointerdown', { shiftKey: true }, integer.dom ); send( 'pointermove', { shiftKey: true, clientX: 50 }, integer.dom ); send( 'pointerup', {}, integer.dom );
		assert.equal( integer.getValue(), 10 );

	} finally {

		delete globalThis.document; delete globalThis.window;

	}

} );
