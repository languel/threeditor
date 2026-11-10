import { drawStreamPreview } from './streams/LandmarkPreview.js';
import { isStillInput } from './assets/AssetController.js';
import { openAssetBrowser } from './AssetBrowser.js';
import { AnimationClip, QuaternionKeyframeTrack } from 'three';
import { UIPanel } from './libs/ui.js';
import { SetValueCommand } from './commands/SetValueCommand.js';
import { SerialDevice, midiTopics } from './streams/DeviceStreams.js';
import { MediaStreams } from './streams/MediaStreams.js';
import { objectChannels } from './streams/StreamRouter.js';

function node( type, text, parent ) {

	const element = document.createElement( type );
	if ( text ) element.textContent = text;
	parent?.append( element );
	return element;

}

function input( parent, label, value, type = 'text' ) {

	const control = node( 'input', '', node( 'label', label, parent ) );
	control.type = type;
	control.value = value;
	return control;

}

function select( parent, label, entries ) {

	const control = node( 'select', '', node( 'label', label, parent ) );
	for ( const [ value, text ] of entries ) control.add( new Option( text, value ) );
	return control;

}

function button( parent, title, run, status ) {

	const control = node( 'button', title, parent );
	control.type = 'button';
	control.onclick = async () => {

		control.disabled = true;
		try { await run(); }
		catch ( error ) { status.textContent = error.message; }
		finally { control.disabled = false; }

	};
	return control;

}

function section( parent, title, open = false ) {

	const element = node( 'details', '', parent );
	element.open = open;
	node( 'summary', title, element );
	return element;

}

function SidebarStreams( editor ) {

	const bus = editor.streams;
	const panel = new UIPanel().setClass( 'stream-panel' );
	const hardware = input( panel.dom, 'Arm routed hardware output', '', 'checkbox' );
	const serial = section( panel.dom, 'Web Serial' );
	const serialStatus = node( 'output', 'Disconnected', serial );
	const baud = input( serial, 'Baud', '9600', 'number' );
	const line = input( serial, 'Send line', '' );
	const serialDevice = new SerialDevice( bus, message => { serialStatus.textContent = message; } );
	button( serial, 'Connect', () => serialDevice.connect( Number( baud.value ) ), serialStatus );
	button( serial, 'Disconnect', () => serialDevice.disconnect(), serialStatus );
	button( serial, 'Send', () => serialDevice.send( line.value ), serialStatus );
	bus.outputs.set( 'serial', ( target, value ) => {

		if ( ! hardware.checked || ! serialDevice.writer ) return false;
		const text = Number( value.toFixed( 4 ) );
		serialDevice.send( target.key ? target.key + ':' + text : text, target.key );

	} );
	const monitor = node( 'output', '', serial );
	bus.subscribe( 'serial.line', value => { if ( serial.open ) monitor.textContent = value; } );

	const midi = section( panel.dom, 'MIDI' );
	const midiStatus = node( 'output', 'Disconnected', midi );
	const midiInput = select( midi, 'Input', [] );
	const midiOutput = select( midi, 'Output', [] );
	const bytes = input( midi, 'Send hex', 'B0 01 40' );
	let access, listening;
	const sounding = new Map();
	function releaseNotes() {

		for ( const [ port, notes ] of sounding ) for ( const [ , message ] of notes ) {

			try { port.send( message ); } catch { /* The port may have been unplugged. */ }

		}
		sounding.clear();

	}
	hardware.onchange = () => { if ( ! hardware.checked ) releaseNotes(); };
	midiOutput.onchange = releaseNotes;
	function listen() {

		if ( listening ) listening.onmidimessage = null;
		bus.clear( 'midi.' );
		listening = access?.inputs.get( midiInput.value );
		if ( listening ) listening.onmidimessage = event => {

			bus.publish( 'midi.message', Array.from( event.data ) );
			for ( const [ topic, value ] of Object.entries( midiTopics( event.data ) ) ) bus.publish( topic, value );
			if ( midi.open ) midiStatus.textContent = Array.from( event.data, n => n.toString( 16 ).padStart( 2, '0' ) ).join( ' ' );

		};

	}
	function midiPorts() {

		for ( const [ control, ports ] of [ [ midiInput, access.inputs ], [ midiOutput, access.outputs ] ] ) {

			const previous = control.value;
			control.replaceChildren( new Option( 'None', '' ) );
			for ( const port of ports.values() ) if ( port.state === 'connected' ) control.add( new Option( port.name || port.id, port.id ) );
			control.value = [ ...control.options ].some( option => option.value === previous ) ? previous : '';

		}
		listen();

	}
	function sendMIDI( message ) {

		const port = access?.outputs.get( midiOutput.value );
		if ( ! port ) return false;
		port.send( message );
		return true;

	}
	button( midi, 'Connect', async () => {

		if ( ! navigator.requestMIDIAccess ) throw new Error( 'Web MIDI requires a supported browser on HTTPS or localhost.' );
		access = await navigator.requestMIDIAccess( { sysex: false } );
		access.onstatechange = midiPorts;
		midiPorts();
		midiStatus.textContent = 'Select an input or output';

	}, midiStatus );
	button( midi, 'Disconnect', () => {

		if ( access ) access.onstatechange = null;
		const port = access?.outputs.get( midiOutput.value );
		port?.clear();
		releaseNotes();
		access = null;
		midiInput.replaceChildren();
		midiOutput.replaceChildren();
		listen();
		midiStatus.textContent = 'Disconnected';

	}, midiStatus );
	midiInput.onchange = listen;
	button( midi, 'Send', () => {

		const parts = bytes.value.trim().split( /\s+/ );
		if ( ! parts.every( part => /^[\da-f]{2}$/i.test( part ) ) ) throw new Error( 'Enter space-separated hex bytes.' );
		sendMIDI( parts.map( part => parseInt( part, 16 ) ) );

	}, midiStatus );
	const byte = value => Math.max( 0, Math.min( 127, Math.round( value ) ) );
	bus.outputs.set( 'midi.cc', ( target, value ) => hardware.checked && sendMIDI( [ 175 + target.channel, target.controller, byte( value ) ] ) );
	bus.outputs.set( 'midi.note', ( target, value ) => {

		const port = access?.outputs.get( midiOutput.value );
		if ( ! hardware.checked || ! port ) return false;
		const velocity = byte( value );
		port.send( [ ( velocity > 0 ? 143 : 127 ) + target.channel, target.note, velocity ] );
		if ( ! sounding.has( port ) ) sounding.set( port, new Map() );
		const notes = sounding.get( port );
		const id = target.channel + ':' + target.note;
		if ( velocity ) notes.set( id, [ 127 + target.channel, target.note, 0 ] );
		else notes.delete( id );
		return true;

	} );

	const mediaPanel = section( panel.dom, 'Audio and video' );
	const mediaStatus = node( 'output', 'Stopped', mediaPanel );
	let preview = node( 'canvas', '', mediaPanel );
	preview.hidden = true;
	preview.setAttribute( 'aria-label', 'Assigned input preview' );
	const mediaRack = node( 'div', '', document.body );
	mediaRack.className = 'stream-media-rack';
	mediaRack.setAttribute( 'aria-hidden', 'true' );
	const inputs = new Map();
	let previewAvailable = true;
	const sourceSelect = select( mediaPanel, 'Assigned input', [] );
	let primary = '';
	function refreshInputs() {

		const old = sourceSelect.value;
		for ( const control of [ sourceSelect, visionInput ] ) {

			const previous = control.value;
			const options = [ ...inputs ].filter( ( [ , item ] ) => control === sourceSelect || ! item.options.audioOnly );
			control.replaceChildren( ...options.map( ( [ id, item ] ) => new Option( item.title, id ) ) );
			if ( options.some( ( [ id ] ) => id === previous ) ) control.value = previous;

		}
		if ( inputs.has( old ) ) sourceSelect.value = old;
		choosePreview();

	}
	function choosePreview() {

		if ( primary !== sourceSelect.value ) {

			bus.clear( 'video.' );
			bus.clear( 'audio.' );
			primary = sourceSelect.value;
			inputs.get( primary )?.media.refreshFrame();
			let context = preview.getContext( '2d' );
			if ( ! context ) {

				const replacement = preview.cloneNode( false );
				preview.replaceWith( replacement );
				preview = replacement;
				context = preview.getContext( '2d' );

			}
			previewAvailable = !! context;
			if ( context ) context.clearRect( 0, 0, preview.width, preview.height );
			else console.warn( 'Streams: input preview is unavailable because a 2D canvas could not be created.' );

		}
		const item = inputs.get( primary );
		preview.hidden = ! item || !! item.options.audioOnly || ! previewAvailable;
		mediaStatus.textContent = item ? item.title + ( item.busy ? ' · Connecting…' : item.media.paused ? ' · Paused' : ' · Active' ) + ( ! previewAvailable && ! item.options.audioOnly ? ' · Preview unavailable' : '' ) : 'No asset assigned';
		pauseInput.disabled = ! item || item.busy;
		pauseInput.textContent = item?.media.paused ? 'Resume input' : 'Pause input';

	}
	sourceSelect.onchange = choosePreview;
	async function startMedia( options, id = crypto.randomUUID(), title = 'Input' ) {

		if ( inputs.has( id ) ) {

			sourceSelect.value = id;
			choosePreview();
			return id;

		}
		const video = document.createElement( options.still ? 'img' : 'video' );
		mediaRack.append( video );
		video.playsInline = true;
		video.controls = false;
		video.loop = !! options.file;

		const media = new MediaStreams( bus, id, () => primary === id );
		try { Object.assign( media.settings, JSON.parse( localStorage.getItem( 'threeditor/inputSettings/' + id ) || '{}' ) ); } catch { /* ignore bad saved settings */ }
		const item = { title, video, media, options, busy: true };
		inputs.set( id, item );
		refreshInputs();
		sourceSelect.value = id;
		choosePreview();
		showSettings();
		try { await media.start( video, options ); }
		catch ( error ) { media.stop(); video.remove(); inputs.delete( id ); refreshInputs(); throw error; }
		item.busy = false;
		refreshInputs();
		sourceSelect.value = id;
		choosePreview();
		if ( visionEnabled.checked && ! tracking ) await updateTracking();
		return id;

	}
	editor.getMediaInput = id => inputs.get( id )?.media.element;
	editor.getMediaFrame = id => inputs.get( id )?.media.frame;
	editor.setMediaInputSettings = ( id, values ) => {

		const item = inputs.get( id );
		if ( item ) item.media.setSettings( values );
		try { localStorage.setItem( 'threeditor/inputSettings/' + id, JSON.stringify( { ...( item?.media.settings || {} ), ...values } ) ); } catch { /* storage unavailable */ }
		if ( id === sourceSelect.value ) showSettings();

	};
	editor.assignMediaAsset = ( { record, file, texture } ) => {

		const { id, title, kind, deviceId } = record;
		const options = kind === 'webcam' ? { camera: true, deviceId } :
			kind === 'microphone' ? { microphone: true, deviceId, audioOnly: true } : isStillInput( record ) ? { file, image: texture?.image, still: true } : { file, audioOnly: kind === 'audio' };
		return startMedia( options, id, title );

	};
	button( mediaPanel, 'Assign asset…', () => openAssetBrowser( editor, { kind: 'input', onPick: editor.assignMediaAsset } ), mediaStatus );
	const pauseInput = button( mediaPanel, 'Pause input', async () => {

		const item = inputs.get( sourceSelect.value );
		if ( ! item || item.busy ) return;
		item.busy = true;
		try {

			if ( item.media.paused ) await item.media.resume( item.video, item.options );
			else item.media.pause();

		} finally {

			item.busy = false;
			choosePreview();

		}

	}, mediaStatus );
	pauseInput.disabled = true;
	// Input settings: flip, rotate and crop for the selected input. Saved per input id.
	const settingsPanel = section( mediaPanel, 'Input settings' );
	const flipX = input( settingsPanel, 'Flip horizontal', '', 'checkbox' ), flipY = input( settingsPanel, 'Flip vertical', '', 'checkbox' );
	const rotate = select( settingsPanel, 'Rotate', [ [ 0, '0°' ], [ 90, '90°' ], [ 180, '180°' ], [ 270, '270°' ] ] );
	const crops = Object.fromEntries( [ 'left', 'top', 'right', 'bottom' ].map( edge => { const c = input( settingsPanel, 'Crop ' + edge, 0, 'range' ); c.min = 0; c.max = 90; c.step = 1; return [ edge, c ]; } ) );
	const settingsKey = id => 'threeditor/inputSettings/' + id;
	function readSettings() { return { flipX: flipX.checked, flipY: flipY.checked, rotate: Number( rotate.value ), ...Object.fromEntries( Object.entries( crops ).map( ( [ edge, c ] ) => [ edge, c.value / 100 ] ) ) }; }
	function showSettings() {
		const item = inputs.get( sourceSelect.value ), t = item?.media.settings;
		for ( const c of [ flipX, flipY, rotate, ...Object.values( crops ) ] ) c.disabled = ! item;
		if ( ! t ) return;
		flipX.checked = t.flipX; flipY.checked = t.flipY; rotate.value = t.rotate;
		for ( const edge in crops ) crops[ edge ].value = Math.round( t[ edge ] * 100 );
	}
	function applySettings() {
		const id = sourceSelect.value, item = inputs.get( id ); if ( ! item ) return;
		item.media.setSettings( readSettings() );
		try { localStorage.setItem( settingsKey( id ), JSON.stringify( item.media.settings ) ); } catch { /* storage unavailable */ }
	}
	for ( const c of [ flipX, flipY, rotate, ...Object.values( crops ) ] ) c.addEventListener( 'input', applySettings );
	button( settingsPanel, 'Reset input settings', () => { flipX.checked = flipY.checked = false; rotate.value = 0; for ( const c of Object.values( crops ) ) c.value = 0; applySettings(); }, mediaStatus );
	sourceSelect.addEventListener( 'change', showSettings );
	button( mediaPanel, 'Unassign input', async () => {

		const id = sourceSelect.value;
		const item = inputs.get( id );
		if ( ! item || item.busy ) return;
		if ( tracking === item.media ) {

			visionEnabled.checked = false;
			await updateTracking();

		}
		item.media.stop();
		item.video.remove();
		inputs.delete( id );
		refreshInputs();
		mediaStatus.textContent = 'Input unassigned';

	}, mediaStatus );
	// A new scene or loaded project releases every camera, microphone and media input.
	async function clearInputs() {

		if ( tracking ) { visionEnabled.checked = false; await updateTracking(); }
		for ( const item of inputs.values() ) { item.media.stop(); item.video.remove(); }
		inputs.clear();
		refreshInputs();
		mediaStatus.textContent = 'No asset assigned';
		choosePreview();

	}
	editor.signals.editorCleared.add( () => clearInputs().catch( () => {} ) );
	button( mediaPanel, 'Enable instrument sound', async () => {

		bus.audio ||= new AudioContext();
		await bus.audio.resume();
		mediaStatus.textContent = 'Instrument sound enabled';

	}, mediaStatus );

	const vision = section( panel.dom, 'MediaPipe' );
	const visionStatus = node( 'output', 'Stopped', vision );
	const visionInput = select( vision, 'Input stream', [] );
	const mode = select( vision, 'Tracker', [ [ 'holistic', 'Holistic' ], [ 'pose', 'Pose' ], [ 'hand', 'Hand' ], [ 'face', 'Face' ] ] );
	const visionEnabled = input( vision, 'Enable MediaPipe', '', 'checkbox' );
	let visualizer = node( 'canvas', '', vision );
	visualizer.hidden = true;
	visualizer.setAttribute( 'aria-label', 'MediaPipe landmark preview' );
	let tracking, trackingVersion = 0;
	async function updateTracking() {

		const version = ++ trackingVersion;
		if ( tracking ) await tracking.track( '' );
		if ( version !== trackingVersion ) return;
		tracking = visionEnabled.checked ? inputs.get( visionInput.value )?.media : null;
		if ( ! tracking ) { visionStatus.textContent = visionEnabled.checked ? 'Choose an input stream' : 'Stopped'; return; }
		visionStatus.textContent = 'Loading tracker…';
		try {

			await tracking.track( mode.value );
			if ( version === trackingVersion ) visionStatus.textContent = 'Tracking ' + mode.value;

		} catch ( error ) {

			if ( version !== trackingVersion ) return;
			visionEnabled.checked = false;
			void tracking.track( '' );
			tracking = null;
			visionStatus.textContent = error.message;

		}

	}
	visionEnabled.onchange = visionInput.onchange = mode.onchange = updateTracking;
	let capture;
	button( vision, 'Record motion', () => {

		if ( capture ) return;
		if ( bus.playing ) throw new Error( 'Stop Play to record into the editor scene.' );
		const root = editor.selected;
		const ids = Object.values( root?.userData.vrmBones || {} );
		if ( ! ids.length ) throw new Error( 'Select a humanoid avatar first.' );
		if ( ! bus.get( 'vision.pose.landmarks' ) ) throw new Error( 'Start Pose tracking first.' );
		const bones = ids.map( id => root.getObjectByProperty( 'uuid', id ) ).filter( Boolean );
		capture = { root, start: performance.now(), times: [], tracks: bones.map( bone => ( { bone, values: [] } ) ) };
		visionStatus.textContent = 'Recording motion…';

	}, visionStatus );
	function finishCapture() {

		if ( ! capture ) return;
		const { root, times, tracks } = capture;
		capture = undefined;
		if ( times.length < 2 ) { visionStatus.textContent = 'No motion captured'; return; }
		const clip = new AnimationClip( 'Pose capture ' + ( root.animations.length + 1 ), -1, tracks.map( ( { bone, values } ) =>
			new QuaternionKeyframeTrack( bone.uuid + '.quaternion', times, values ) ) );
		const command = new SetValueCommand( editor, root, 'animations', [ ...root.animations, clip ] );
		command.updatable = false;
		editor.execute( command );
		visionStatus.textContent = 'Saved ' + clip.name;

	}
	button( vision, 'Save motion clip', finishCapture, visionStatus );
	// Poll devices independently of the editor canvas, which can be covered by Play.
	window.setInterval( () => {

		try {

			const now = performance.now();
			for ( const { media } of inputs.values() ) media.tick( now );
			// preview: ensure 2d context is available before drawing (canvas may lose context under WebGL pressure)
			if ( mediaPanel.open && ! preview.hidden ) {

				let ctx = preview.getContext( '2d' );
				if ( ! ctx ) {

					const replacement = preview.cloneNode( false );
					preview.parentNode?.replaceChild( replacement, preview );
					preview = replacement;
					ctx = preview.getContext( '2d' );

				}
				drawStreamPreview( preview, inputs.get( primary )?.media.frame );

			}
			if ( vision.open ) {

				const input = inputs.get( visionInput.value )?.media;
				// visualizer: ensure 2d context is available before drawing
				let vctx = visualizer.getContext( '2d' );
				if ( ! vctx ) {

					const vreplacement = visualizer.cloneNode( false );
					visualizer.parentNode?.replaceChild( vreplacement, visualizer );
					visualizer = vreplacement;
					vctx = visualizer.getContext( '2d' );

				}
				visualizer.hidden = ! input || ! drawStreamPreview( visualizer, input.frame, topic => bus.get( input.prefix + topic ) );

			}
			if ( capture && ! bus.playing && bus.get( 'vision.pose.landmarks' ) ) {

				capture.times.push( ( now - capture.start ) / 1000 );
				for ( const track of capture.tracks ) track.values.push( ...track.bone.quaternion );
				if ( now - capture.start >= 60000 ) finishCapture();

			}

		}
		catch ( error ) { visionEnabled.checked = false; void updateTracking(); visionStatus.textContent = error.message; }

	}, 50 );

	const routes = section( panel.dom, 'Routes', true );
	const status = node( 'output', '', routes );
	const list = node( 'div', '', routes );
	const topic = input( routes, 'Source topic', '' );
	const suggestions = node( 'datalist', '', routes );
	suggestions.id = 'stream-topics';
	topic.setAttribute( 'list', suggestions.id );
	topic.onfocus = () => suggestions.replaceChildren( ...bus.topics().map( name => new Option( name ) ) );
	const fallback = input( routes, 'Preview fallback', '' );
	const kind = select( routes, 'Destination', [ [ 'object', 'Scene object' ], [ 'serial', 'Serial line' ], [ 'topic', 'Mapped topic' ], [ 'midi.cc', 'MIDI CC' ], [ 'midi.note', 'MIDI note' ] ] );
	const object = select( routes, 'Object', [] );
	const property = select( routes, 'Property', Object.keys( objectChannels ).map( name => [ name, name ] ) );
	const key = input( routes, 'Serial key', '' );
	const mapped = input( routes, 'Mapped topic', 'map.' );
	const channel = input( routes, 'MIDI channel', '1', 'number' );
	const number = input( routes, 'CC / note', '1', 'number' );
	const ranges = node( 'div', '', routes );
	ranges.className = 'stream-ranges';
	const bounds = [ [ 'In min', 0 ], [ 'In max', 1 ], [ 'Out min', 0 ], [ 'Out max', 1 ] ].map( ( [ label, value ] ) => input( ranges, label, value, 'number' ) );
	for ( const field of bounds ) field.step = 'any';
	const clamp = input( routes, 'Clamp', '', 'checkbox' );
	clamp.checked = true;
	let editing = - 1;
	const getRoutes = () => editor.scene.userData.streamRoutes || [];
	function visibility() {

		for ( const control of [ object, property ] ) control.parentElement.hidden = kind.value !== 'object';
		key.parentElement.hidden = kind.value !== 'serial';
		mapped.parentElement.hidden = kind.value !== 'topic';
		for ( const control of [ channel, number ] ) control.parentElement.hidden = ! kind.value.startsWith( 'midi.' );

	}
	function refresh() {

		const previous = object.value;
		object.replaceChildren( new Option( 'Choose object', '' ) );
		editor.scene.traverse( item => { if ( item !== editor.scene ) object.add( new Option( item.name || item.type, item.uuid ) ); } );
		object.value = previous;
		list.replaceChildren();
		getRoutes().forEach( ( route, index ) => {

			const label = route.source + ' → ' + ( route.target.property || route.target.kind );
			button( list, label, () => {

				editing = index;
				topic.value = route.source;
				fallback.value = route.fallback || '';
				kind.value = route.target.kind;
				object.value = route.target.uuid || '';
				property.value = route.target.property || 'position.x';
				key.value = route.target.key || '';
				mapped.value = route.target.topic || 'map.';
				channel.value = route.target.channel || 1;
				number.value = route.target.controller ?? route.target.note ?? 1;
				[ ...( route.input || [ 0, 1 ] ), ...( route.output || [ 0, 1 ] ) ].forEach( ( value, i ) => { bounds[ i ].value = value; } );
				clamp.checked = route.clamp !== false;
				visibility();
				status.textContent = 'Editing route ' + ( index + 1 );

			}, status );

		} );

	}
	function save( next ) {

		const command = new SetValueCommand( editor, editor.scene, 'userData', { ...editor.scene.userData, streamRoutes: next } );
		command.updatable = false;
		editing = - 1;
		editor.execute( command );
		refresh();

	}
	kind.onchange = visibility;
	button( routes, 'New', () => { editing = - 1; topic.value = fallback.value = ''; status.textContent = 'New route'; }, status );
	button( routes, 'Save route', () => {

		const [ a, b, c, d ] = bounds.map( field => field.valueAsNumber );
		if ( ! topic.value.trim() || ! [ a, b, c, d ].every( Number.isFinite ) || a === b ) throw new Error( 'Enter a topic and a valid input and output range.' );
		const target = { kind: kind.value };
		if ( target.kind === 'object' ) {

			if ( ! object.value ) throw new Error( 'Choose an object.' );
			Object.assign( target, { uuid: object.value, property: property.value } );

		} else if ( target.kind === 'serial' ) target.key = key.value.trim();
		else if ( target.kind === 'topic' ) {

			if ( ! /^map\.[\w.-]+$/.test( mapped.value ) || [ topic.value, fallback.value ].some( name => name.trim().startsWith( 'map.' ) ) ) {
				throw new Error( 'Map a device or script topic to a new map.name topic.' );
			}
			target.topic = mapped.value;

		} else {

			target.channel = Number( channel.value );
			const id = Number( number.value );
			if ( ! Number.isInteger( target.channel ) || target.channel < 1 || target.channel > 16 || ! Number.isInteger( id ) || id < 0 || id > 127 ) throw new Error( 'Use channel 1–16 and a CC or note from 0–127.' );
			target[ target.kind === 'midi.cc' ? 'controller' : 'note' ] = id;

		}
		const route = { source: topic.value.trim(), fallback: fallback.value.trim(), input: [ a, b ], output: [ c, d ], clamp: clamp.checked, target };
		const next = [ ...getRoutes() ];
		next[ editing === - 1 ? next.length : editing ] = route;
		save( next );
		status.textContent = 'Saved';

	}, status );
	button( routes, 'Delete route', () => {

		if ( editing !== - 1 ) save( getRoutes().filter( ( _, index ) => index !== editing ) );
		status.textContent = '';

	}, status );
	editor.signals.sceneGraphChanged.add( refresh );
	const reset = () => { editing = -1; capture = undefined; hardware.checked = false; releaseNotes(); bus.clear( 'demo.' ); bus.clear( 'map.' ); refresh(); };
	editor.signals.projectLoaded.add( reset );
	editor.signals.stopPlayer.add( releaseNotes );
	editor.signals.editorCleared.add( reset );
	editor.signals.objectRemoved.add( object => {

		if ( capture && object.getObjectByProperty( 'uuid', capture.root.uuid ) ) capture = undefined;

	} );
	editor.signals.objectChanged.add( ( object, attribute ) => {

		if ( object === editor.scene && attribute === 'userData' ) refresh();

	} );
	bus.addEventListener( 'outputerror', event => { status.textContent = event.detail.message; } );
	visibility();
	refresh();
	return panel;

}

export { SidebarStreams };
