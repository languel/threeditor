import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UINumber } from '../editor/js/libs/ui.js';

test( 'Script numbers retain pointer capture and commit one change per scrub', () => {

	class Input extends EventTarget {

		style = {};
		captured = null;
		setAttribute() {}
		setPointerCapture( id ) { this.captured = id; }
		hasPointerCapture( id ) { return this.captured === id; }
		releasePointerCapture() { this.captured = null; }
		focus() { document.activeElement = this; }
		select() {}

	}

	globalThis.document = { createElement: () => new Input(), activeElement: null };
	try {

		const field = new UINumber( 0.2 ).setPrecision( 3 ).setRange( 0, 1 ).setScrubDefault( 0 );
		const changes = [];
		field.onChange( () => changes.push( field.getValue() ) );
		const send = ( type, properties = {} ) => {

			field.dom.dispatchEvent( Object.assign( new Event( type, { cancelable: true } ), {
				pointerId: 1, button: 0, clientX: 0, clientY: 0, ...properties
			} ) );

		};

		field.dom.focus();
		send( 'pointerdown' );
		assert.equal( field.dom.captured, 1 );
		send( 'pointermove', { clientX: 10, clientY: -10 } );
		assert.equal( field.getValue(), 0.6 );
		assert.deepEqual( changes, [] );
		send( 'pointerup' );
		assert.equal( field.dom.captured, null );
		assert.deepEqual( changes, [ 0.6 ] );

		send( 'pointerdown', { shiftKey: true } );
		send( 'pointermove', { clientY: -20, shiftKey: true } );
		assert.equal( field.getValue(), 0.64 );
		send( 'pointercancel' );
		assert.equal( field.getValue(), 0.6 );
		assert.deepEqual( changes, [ 0.6 ] );

		send( 'dblclick', { shiftKey: true } );
		assert.deepEqual( changes, [ 0.6, 0 ] );

	} finally {

		delete globalThis.document;

	}

} );
