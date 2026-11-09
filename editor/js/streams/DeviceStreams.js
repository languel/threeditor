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

	async connect( baudRate ) {

		if ( this.port || this.opening ) return;
		if ( ! navigator.serial ) throw new Error( 'Web Serial requires a supported browser on HTTPS or localhost.' );
		this.opening = true;
		try {

			const port = await navigator.serial.requestPort();
			await port.open( { baudRate } );
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

export { SerialDevice, serialValues, midiTopics };
