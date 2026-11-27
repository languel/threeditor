import { LOGIC_DOMAIN } from '../nodes/LogicNodes.js';
import { expandNodeGroups } from '../nodes/NodeGroups.js';
import { MidiDevice, SerialDevice, bindDeviceOutputs } from './DeviceStreams.js';
import { MediaStreams } from './MediaStreams.js';

function playerStreamNeeds( scene ) {

	const needs = { midi: false, serial: false, output: false, media: new Map() };
	function addTopic( topic ) {

		const match = /^(?:input\.([^.]+)\.)?(midi|serial|audio|video|vision)\.(.*)$/.exec( topic?.trim?.() );
		if ( ! match ) return;
		const [ , source = '', type, channel ] = match;
		if ( type === 'midi' || type === 'serial' ) {

			needs[ type ] = true;
			return;

		}

		if ( ! needs.media.has( source ) ) needs.media.set( source, { camera: false, microphone: false, trackers: new Set() } );
		const media = needs.media.get( source );
		if ( type === 'audio' ) media.microphone = true;
		else media.camera = true;
		if ( type !== 'vision' ) return;
		const group = channel.split( '.' )[ 0 ];
		if ( [ 'pose', 'hand', 'face' ].includes( group ) ) media.trackers.add( group );
		else if ( group === 'iris' ) media.trackers.add( 'face' );
		else media.trackers.add( 'holistic' );

	}

	function addOutput( kind ) {

		if ( kind === 'midi.cc' || kind === 'midi.note' ) needs.midi = true;
		else if ( kind === 'serial' ) needs.serial = true;
		else return;
		needs.output = true;

	}

	scene.traverse( object => {

		let graph = object.userData?.logicGraph;
		try { graph = expandNodeGroups( graph, LOGIC_DOMAIN ); } catch { /* The player reports invalid graphs when loading Logic Nodes. */ }
		for ( const node of Array.isArray( graph?.nodes ) ? graph.nodes : [] ) {

			if ( ! node || node.muted || ! LOGIC_DOMAIN.nodes.has( node.type ) ) continue;
			if ( [ 'logic.midiCC', 'logic.midiNote', 'logic.midiBend' ].includes( node.type ) ) needs.midi = true;
			if ( node.type === 'logic.serialValue' ) needs.serial = true;
			if ( node.type === 'logic.sendCC' || node.type === 'logic.sendNote' ) addOutput( 'midi.cc' );
			if ( node.type === 'logic.sendSerial' ) addOutput( 'serial' );
			if ( node.type === 'logic.landmark' ) {

				const { source = '', group = 'pose' } = node.values || {};
				addTopic( ( source ? 'input.' + source + '.' : '' ) + 'vision.' + group + '.' );

			}

			if ( node.type === 'logic.publishStream' ) continue;
			const socket = LOGIC_DOMAIN.nodes.get( node.type ).inputs?.topic;
			if ( ! socket ) continue;
			addTopic( node.values?.topic ?? socket.default );
			if ( Array.isArray( graph.links ) && graph.links.some( link => ! link?.muted && link?.to?.node === node.id && link.to.socket === 'topic' ) ) {

				for ( const topic of [ 'midi.message', 'serial.line', 'audio.rms', 'vision.' ] ) addTopic( topic );

			}

		}

		const { streamRoutes, streamEvents } = object.userData || {};
		for ( const entries of [ streamRoutes, streamEvents ] ) for ( const entry of Array.isArray( entries ) ? entries : [] ) {

			if ( ! entry || entry.enabled === false ) continue;
			addTopic( entry.source );
			addTopic( entry.fallback );
			addOutput( entry.target?.kind || entry.action?.kind );

		}

	} );

	return needs;

}

function element( parent, tag, text, attributes = {} ) {

	const el = document.createElement( tag );
	if ( text ) el.textContent = text;
	for ( const [ key, value ] of Object.entries( attributes ) ) el.setAttribute( key, value );
	parent.append( el );
	return el;

}

function controls( panel, title ) {

	const group = element( panel, 'fieldset' );
	element( group, 'legend', title );
	const status = element( group, 'output', 'Disconnected', { role: 'status' } );
	const report = message => { status.textContent = message; };
	function button( title, action ) {

		const control = element( group, 'button', title, { type: 'button' } );
		control.onclick = async () => {

			control.disabled = true;
			try { await action(); }
			catch ( error ) { report( error.message ); }
			finally { control.disabled = false; }

		};
		return control;

	}

	return { group, report, button };

}

function portOptions( control, ports ) {

	const previous = control.value;
	control.replaceChildren( new Option( 'None', '' ) );
	for ( const port of ports?.values() || [] ) if ( port.state === 'connected' ) control.add( new Option( port.name || port.id, port.id ) );
	control.value = ports?.get( previous )?.state === 'connected' ? previous : '';

}

function mediaControls( panel, bus, source, config, primary ) {

	const { camera, microphone, trackers } = config;
	const title = camera ? ( microphone ? 'Camera and microphone' : 'Camera' ) : 'Microphone';
	const ui = controls( panel, source ? title + ' (' + source + ')' : title );
	const media = new MediaStreams( bus, source, () => primary, false );
	const video = document.createElement( 'video' );
	video.playsInline = true;
	let selector, frame, epoch = 0;
	if ( trackers.size ) {

		selector = element( element( ui.group, 'label', 'Tracker' ), 'select' );
		for ( const [ value, label ] of [ [ 'holistic', 'Holistic' ], [ 'pose', 'Pose' ], [ 'hand', 'Hand' ], [ 'face', 'Face' ] ] ) selector.add( new Option( label, value ) );
		selector.value = trackers.size === 1 ? [ ...trackers ][ 0 ] : 'holistic';

	}

	function stop() {

		epoch ++;
		cancelAnimationFrame( frame );
		void media.track( '' );
		media.stop();
		if ( selector ) selector.disabled = false;
		ui.report( 'Disconnected' );

	}

	function tick( now ) {

		try {

			media.tick( now );
			frame = requestAnimationFrame( tick );

		} catch ( error ) {

			stop();
			ui.report( error.message );

		}

	}

	ui.button( 'Start ' + title.toLowerCase(), async () => {

		stop();
		const version = epoch;
		if ( selector ) selector.disabled = true;
		ui.report( 'Waiting for permission…' );
		try {

			if ( ! navigator.mediaDevices?.getUserMedia ) throw new Error( 'Camera and microphone access requires HTTPS or localhost.' );
			await media.start( video, { camera, microphone } );
			if ( version !== epoch ) return;
			const mode = selector?.value;
			if ( mode ) {

				ui.report( 'Loading ' + mode + ' tracker…' );
				await media.track( mode );
				if ( version !== epoch ) return;

			}
			ui.report( mode ? 'Tracking ' + mode : 'Connected' );
			frame = requestAnimationFrame( tick );

		} catch ( error ) {

			if ( version !== epoch ) return;
			stop();
			throw error;

		}

	} );
	ui.button( 'Stop ' + title.toLowerCase(), stop );
	return stop;

}

function mountPlayerStreams( parent, scene, bus ) {

	const needs = playerStreamNeeds( scene );
	if ( ! needs.midi && ! needs.serial && ! needs.media.size ) return;

	element( document.head, 'style', `
		.player-streams{position:fixed;top:12px;right:12px;z-index:2;max-width:min(22rem,calc(100% - 24px));max-height:calc(100% - 24px);box-sizing:border-box;overflow:auto;padding:8px 10px;border:1px solid #666;border-radius:5px;background:#202124;color:#fff;font:13px system-ui,sans-serif;color-scheme:dark}
		.player-streams summary{cursor:pointer}
		.player-streams fieldset{min-width:0;margin:8px 0 0;border:1px solid #666;border-radius:3px;overflow-wrap:anywhere}
		.player-streams label,.player-streams output{display:block;margin:4px 0}
		.player-streams input,.player-streams select{margin-inline-start:6px;max-width:100%}
		.player-streams button{margin:3px 6px 0 0;font:inherit}
	` );
	const panel = element( parent, 'details', '', { class: 'player-streams', 'data-player-controls': '' } );
	element( panel, 'summary', 'Live inputs' );
	let armed, midi, serial;
	const stop = [];
	if ( needs.midi ) {

		const ui = controls( panel, 'MIDI' );
		const input = element( element( ui.group, 'label', 'Input' ), 'select' );
		const output = needs.output ? element( element( ui.group, 'label', 'Output' ), 'select' ) : null;
		midi = new MidiDevice( bus, access => {

			portOptions( input, access?.inputs );
			midi.selectInput( input.value );
			if ( output ) {

				portOptions( output, access?.outputs );
				midi.selectOutput( output.value );

			}
			input.disabled = ! access;
			if ( output ) output.disabled = ! access;

		} );
		if ( output ) output.onchange = () => midi.selectOutput( output.value );
		input.onchange = () => midi.selectInput( input.value );
		function disconnect() { midi.disconnect(); ui.report( 'Disconnected' ); }
		disconnect();
		ui.button( 'Connect MIDI', async () => { await midi.connect(); if ( midi.access ) ui.report( 'Select a MIDI port' ); } );
		ui.button( 'Disconnect MIDI', disconnect );
		stop.push( disconnect );

	}

	if ( needs.serial ) {

		const ui = controls( panel, 'Web Serial' );
		const baud = element( element( ui.group, 'label', 'Baud rate' ), 'input', '', { type: 'number', min: '1', step: '1', value: '9600' } );
		serial = new SerialDevice( bus, ui.report );
		ui.button( 'Connect serial', () => serial.connect( baud.valueAsNumber ) );
		ui.button( 'Disconnect serial', async () => { await serial.disconnect(); ui.report( 'Disconnected' ); } );
		stop.push( () => { void serial.disconnect().catch( error => ui.report( error.message ) ); } );

	}

	if ( needs.output ) {

		const label = element( panel, 'label' );
		armed = element( label, 'input', '', { type: 'checkbox' } );
		label.append( ' Arm hardware output' );
		armed.onchange = () => { if ( ! armed.checked ) midi?.releaseNotes(); };
		bindDeviceOutputs( bus, serial, midi, () => armed.checked );

	}

	const primary = needs.media.has( '' ) ? '' : needs.media.keys().next().value;
	for ( const [ source, config ] of needs.media ) stop.push( mediaControls( panel, bus, source, config, primary === source ) );

	window.addEventListener( 'pagehide', () => {

		if ( armed ) { armed.checked = false; midi?.releaseNotes(); }
		for ( const close of stop ) close();

	} );

}

export { mountPlayerStreams, playerStreamNeeds };
