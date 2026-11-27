// The line protocol matches p5comp's named signals and its bare-number sketches.
function serialValues( line ) {

	const numeric = Number( line );
	if ( line.trim() && Number.isFinite( numeric ) ) return { value: numeric };
	return Object.fromEntries( Array.from( line.matchAll( /([A-Za-z_]\w*)(?:\s*[:=]\s*|\s+)([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)/gi ), match => [ match[ 1 ], Number( match[ 2 ] ) ] ).filter( ( [ , value ] ) => Number.isFinite( value ) ) );

}

function midiTopics( data ) {

	const [ status, number, value ] = data;
	const channel = ( status & 15 ) + 1;
	switch ( status & 240 ) {

		case 176: return { [ 'midi.cc.' + channel + '.' + number ]: value };
		case 128:
		case 144: return { [ 'midi.note.' + channel + '.' + number ]: ( status & 240 ) === 128 ? 0 : value };
		case 224: return { [ 'midi.bend.' + channel ]: ( ( value << 7 ) | number ) - 8192 };
		default: return {};

	}

}

class SerialDevice {

	constructor( bus, report ) { this.bus = bus; this.report = report; }
	port = null;
	writer = null;
	reader = null;
	pending = new Map();
	drain = null;
	closing = false;
	#epoch = 0;

	async connect( baudRate ) {

		if ( this.port || this.opening ) return;
		if ( ! Number.isInteger( baudRate ) || baudRate <= 0 ) throw new Error( 'Enter a positive whole-number baud rate.' );
		if ( ! navigator.serial ) throw new Error( 'Web Serial requires a supported browser on HTTPS or localhost.' );
		this.opening = true;
		const epoch = this.#epoch;
		try {

			const port = await navigator.serial.requestPort();
			if ( epoch !== this.#epoch ) return;
			await port.open( { baudRate } );
			if ( epoch !== this.#epoch ) { await port.close(); return; }
			if ( ! port.readable || ! port.writable ) {

				await port.close();
				throw new Error( 'Serial port is not readable and writable.' );

			}
			this.port = port;
			this.writer = port.writable.getWriter();
			this.reader = port.readable.getReader();
			this.readTask = this.read( this.reader );
			this.report( 'Connected at ' + baudRate + ' baud' );

		} finally { this.opening = false; }

	}

	async read( reader ) {

		const decoder = new TextDecoder();
		let buffer = '';
		try {

			while ( true ) {

				const { value, done } = await reader.read();
				if ( done ) break;
				buffer += decoder.decode( value, { stream: true } );
				const lines = buffer.split( '\n' );
				buffer = lines.pop().slice( - 8192 );
				for ( const raw of lines ) {

					const line = raw.trim();
					if ( ! line ) continue;
					this.bus.publish( 'serial.line', line );
					for ( const [ key, number ] of Object.entries( serialValues( line ) ) ) this.bus.publish( 'serial.' + key, number );

				}

			}

		} catch ( error ) { if ( ! this.closing ) this.report( error.message ); }
		finally { reader.releaseLock(); }
		if ( ! this.closing ) void this.disconnect().catch( error => this.report( error.message ) );

	}

	send( line, key = '' ) {

		if ( ! this.writer || this.closing ) return;
		this.pending.set( key, String( line ).replace( /[\r\n]/g, '' ) + '\n' );
		if ( this.drain ) return;
		const writer = this.writer;
		const encoder = new TextEncoder();
		this.drain = ( async () => {

			while ( this.pending.size ) {

				const [ name, value ] = this.pending.entries().next().value;
				this.pending.delete( name );
				await writer.write( encoder.encode( value ) );

			}

		} )().catch( error => this.report( error.message ) ).finally( () => { this.drain = null; } );

	}

	async disconnect() {

		this.#epoch ++;
		if ( ! this.port || this.closing ) return;
		this.closing = true;
		try {

			await this.reader?.cancel().catch( () => {} );
			await this.readTask;
			this.pending.clear();
			await this.drain;
			this.writer?.releaseLock();
			await this.port.close();

		} finally {

			this.port = this.reader = this.writer = null;
			this.closing = false;
			this.bus.clear( 'serial.' );
			this.report( 'Disconnected' );

		}

	}

}

class MidiDevice {

	constructor( bus, portsChanged, received = () => {} ) {

		this.bus = bus;
		this.portsChanged = portsChanged;
		this.received = received;

	}

	#epoch = 0;
	#sounding = new Map();

	async connect() {

		if ( this.access || this.opening ) return;
		if ( ! navigator.requestMIDIAccess ) throw new Error( 'Web MIDI requires a supported browser on HTTPS or localhost.' );
		const epoch = this.#epoch;
		this.opening = true;
		try {

			const access = await navigator.requestMIDIAccess( { sysex: false } );
			if ( epoch !== this.#epoch ) return;
			this.access = access;
			access.onstatechange = () => this.portsChanged( access );
			this.portsChanged( access );

		} finally { this.opening = false; }

	}

	selectInput( id ) {

		const next = this.access?.inputs.get( id );
		if ( this.input === next ) return;
		if ( this.input ) {

			this.input.onmidimessage = null;
			void this.input.close?.().catch( () => {} );

		}
		this.bus.clear( 'midi.' );
		this.input = next;
		if ( next ) next.onmidimessage = event => {

			this.bus.publish( 'midi.message', Array.from( event.data ) );
			for ( const [ topic, value ] of Object.entries( midiTopics( event.data ) ) ) this.bus.publish( topic, value );
			this.received( event.data );

		};

	}

	selectOutput( id ) {

		const next = this.access?.outputs.get( id );
		if ( this.output === next ) return;
		this.releaseNotes();
		void this.output?.close?.().catch( () => {} );
		this.output = next;

	}

	send( message ) {

		if ( ! this.output ) return false;
		this.output.send( message );
		return true;

	}

	sendNote( channel, note, velocity ) {

		if ( ! this.send( [ ( velocity > 0 ? 143 : 127 ) + channel, note, velocity ] ) ) return false;
		const id = channel + ':' + note;
		if ( velocity ) this.#sounding.set( id, [ 127 + channel, note, 0 ] );
		else this.#sounding.delete( id );
		return true;

	}

	releaseNotes() {

		for ( const message of this.#sounding.values() ) {

			try { this.output.send( message ); } catch { /* The port may have been unplugged. */ }

		}
		this.#sounding.clear();

	}

	disconnect() {

		this.#epoch ++;
		if ( this.access ) this.access.onstatechange = null;
		this.access = null;
		this.selectInput();
		this.selectOutput();
		this.portsChanged( null );

	}

}

function bindDeviceOutputs( bus, serial, midi, armed ) {

	const byte = value => Math.max( 0, Math.min( 127, Math.round( value ) ) );
	if ( serial ) bus.outputs.set( 'serial', ( target, value ) => {

		if ( ! armed() || ! serial.writer || serial.closing ) return false;
		const text = Number( value.toFixed( 4 ) );
		serial.send( target.key ? target.key + ':' + text : text, target.key );
		return true;

	} );
	if ( midi ) {

		bus.outputs.set( 'midi.cc', ( target, value ) => armed() && midi.send( [ 175 + target.channel, target.controller, byte( value ) ] ) );
		bus.outputs.set( 'midi.note', ( target, value ) => armed() && midi.sendNote( target.channel, target.note, byte( value ) ) );

	}

}

export { SerialDevice, MidiDevice, bindDeviceOutputs, serialValues, midiTopics };
