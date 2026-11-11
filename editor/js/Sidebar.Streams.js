import { drawStreamPreview } from './streams/LandmarkPreview.js';
import { isInputAsset, isMovingAsset, isStillInput } from './assets/AssetController.js';
import { fileKind } from './assets/AssetLibrary.js';
import { openAssetBrowser, textureEntries } from './AssetBrowser.js';
import { scriptParams } from './ScriptParams.js';
import { AnimationClip, QuaternionKeyframeTrack } from 'three';
import { UIPanel } from './libs/ui.js';
import { SetValueCommand } from './commands/SetValueCommand.js';
import { SerialDevice, midiTopics } from './streams/DeviceStreams.js';
import { MediaStreams } from './streams/MediaStreams.js';
import { objectChannels } from './streams/StreamRouter.js?v=drivers';

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
	const available = new Map();
	let previewAvailable = true;
	const sourceSelect = select( mediaPanel, 'Assigned input', [] );
	let primary = '';
	const sourceRank = entry => entry.kind === 'webcam' ? 0 : entry.kind === 'microphone' ? 1 : isMovingAsset( entry ) ? 2 : entry.kind === 'audio' ? 3 : 4;

	function rebuildSelects() {

		const oldSource = sourceSelect.value;
		const oldVision = visionInput.value;
		const entries = [ ...available.values() ].sort( ( a, b ) =>
			( inputs.has( a.id ) ? 0 : 1 ) - ( inputs.has( b.id ) ? 0 : 1 ) ||
			sourceRank( a ) - sourceRank( b ) ||
			a.title.localeCompare( b.title )
		);

		const populate = ( control, list, previous ) => {

			control.replaceChildren(
				new Option( 'Choose input…', '' ),
				...list.map( item => new Option( inputs.has( item.id ) ? item.title + ' (active)' : item.title, item.id ) )
			);
			if ( previous && list.some( item => item.id === previous ) ) control.value = previous;

		};

		populate( sourceSelect, entries, inputs.has( oldSource ) ? oldSource : '' );
		const visual = entries.filter( item => ! item.audioOnly );
		const fallbackVision = inputs.has( oldVision ) ? oldVision : ( oldVision && visual.some( i => i.id === oldVision ) ? oldVision : ( [ ...inputs ].find( ( [ , item ] ) => ! item.options.audioOnly )?.[ 0 ] || '' ) );
		populate( visionInput, visual, fallbackVision );
		choosePreview();

	}

	async function refreshAvailableSources() {

		const next = new Map();
		const add = entry => {

			if ( ! entry?.id || ! entry.title || next.has( entry.id ) ) return;
			const audioOnly = entry.kind === 'microphone' || entry.kind === 'audio';
			next.set( entry.id, { ...entry, audioOnly } );

		};

		for ( const [ id, item ] of inputs ) {

			add( { id, title: item.title, kind: item.options.camera ? 'webcam' : item.options.microphone ? 'microphone' : item.options.audioOnly ? 'audio' : item.options.still ? 'texture' : 'video', options: item.options } );

		}

		if ( editor.assetBrowser?.library ) {

			try {

				for ( const record of await editor.assetBrowser.library.all() ) {

					if ( isInputAsset( record ) ) add( { id: record.id, title: record.title, kind: record.kind, deviceId: record.deviceId, file: record.file } );

				}

			} catch { /* storage unavailable */ }

		}

		for ( const [ path, entry ] of editor.sourceFiles || [] ) {

			const record = { ...entry.asset, id: 'project:' + path, title: editor.scene.userData.assetLabels?.files?.[ path ] || entry.file.name, kind: entry.asset?.kind || fileKind( entry.file ), file: entry.file };
			if ( isInputAsset( record ) ) add( record );

		}

		textureEntries( editor ).forEach( ( entry, i ) => {

			add( { id: 'scene-texture:' + i, title: editor.scene.userData.assetLabels?.files?.[ entry.texture.uuid ] || entry.name, kind: 'texture', texture: entry.texture } );

		} );

		if ( navigator.mediaDevices?.enumerateDevices ) {

			try {

				const devices = await navigator.mediaDevices.enumerateDevices();
				const knownVideoIds = new Set( [ ...next.values() ].filter( e => e.kind === 'webcam' && e.deviceId ).map( e => e.deviceId ) );
				const knownAudioIds = new Set( [ ...next.values() ].filter( e => e.kind === 'microphone' && e.deviceId ).map( e => e.deviceId ) );
				const hasAnyWebcam = [ ...next.values() ].some( e => e.kind === 'webcam' );
				const hasAnyMic = [ ...next.values() ].some( e => e.kind === 'microphone' );

				for ( const device of devices ) {

					if ( device.kind === 'videoinput' && device.deviceId && ! knownVideoIds.has( device.deviceId ) ) {

						add( { id: 'device:webcam:' + device.deviceId, title: device.label || 'Webcam', kind: 'webcam', deviceId: device.deviceId } );
						knownVideoIds.add( device.deviceId );

					} else if ( device.kind === 'audioinput' && device.deviceId && ! knownAudioIds.has( device.deviceId ) ) {

						add( { id: 'device:microphone:' + device.deviceId, title: device.label || 'Microphone', kind: 'microphone', deviceId: device.deviceId } );
						knownAudioIds.add( device.deviceId );

					}

				}
				if ( ! hasAnyWebcam && devices.some( d => d.kind === 'videoinput' ) ) add( { id: 'device:webcam:default', title: 'Default webcam', kind: 'webcam' } );
				if ( ! hasAnyMic && devices.some( d => d.kind === 'audioinput' ) ) add( { id: 'device:microphone:default', title: 'Default microphone', kind: 'microphone' } );

			} catch { /* mediaDevices unavailable */ }

		}

		available.clear();
		for ( const [ id, entry ] of next ) available.set( id, entry );
		rebuildSelects();

	}

	function refreshInputs() {

		for ( const [ id, item ] of inputs ) {

			if ( ! available.has( id ) ) available.set( id, { id, title: item.title, kind: item.options.camera ? 'webcam' : item.options.microphone ? 'microphone' : item.options.audioOnly ? 'audio' : item.options.still ? 'texture' : 'video', audioOnly: !! item.options.audioOnly } );

		}
		rebuildSelects();

	}

	let activatingTracking = false;
	async function activateSource( id ) {

		if ( ! id ) return null;
		if ( inputs.has( id ) ) return inputs.get( id );
		const entry = available.get( id );
		if ( ! entry ) return null;
		if ( editor.assetBrowser && ! id.startsWith( 'device:' ) && editor.assetBrowser.records.has( id ) ) {

			const materialized = await editor.assetBrowser.materialize( id );
			await editor.assignMediaAsset( materialized );

		} else {

			await editor.assignMediaAsset( {
				record: { id: entry.id, title: entry.title, kind: entry.kind, deviceId: entry.deviceId },
				file: entry.file,
				texture: entry.texture
			} );

		}
		return inputs.get( id ) || null;

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
	sourceSelect.onchange = async () => {

		const id = sourceSelect.value;
		if ( id && ! inputs.has( id ) ) {

			try { await activateSource( id ); }
			catch ( error ) { mediaStatus.textContent = error.message; sourceSelect.value = primary || ''; return; }

		}
		choosePreview();
		showSettings();

	};
	async function startMedia( options, id = crypto.randomUUID(), title = 'Input' ) {

		if ( inputs.has( id ) ) {

			sourceSelect.value = id;
			if ( ! options.audioOnly && ! visionInput.value ) visionInput.value = id;
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
		if ( ! options.audioOnly && ! visionInput.value ) visionInput.value = id;
		choosePreview();
		showSettings();
		try { await media.start( video, options ); }
		catch ( error ) { media.stop(); video.remove(); inputs.delete( id ); refreshInputs(); throw error; }
		item.busy = false;
		refreshInputs();
		sourceSelect.value = id;
		if ( ! options.audioOnly && ! visionInput.value ) visionInput.value = id;
		choosePreview();
		if ( visionEnabled.checked && ! tracking && ! activatingTracking ) await updateTracking();
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
		sourceSelect.value = '';
		if ( visionInput.value === id ) visionInput.value = '';
		refreshInputs();
		mediaStatus.textContent = 'Input unassigned';

	}, mediaStatus );
	// A new scene or loaded project releases every camera, microphone and media input.
	async function clearInputs() {

		if ( tracking ) { visionEnabled.checked = false; await updateTracking(); }
		for ( const item of inputs.values() ) { item.media.stop(); item.video.remove(); }
		inputs.clear();
		sourceSelect.value = '';
		visionInput.value = '';
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
		if ( visionEnabled.checked ) {

			if ( ! visionInput.value ) {

				const activeVisual = [ ...inputs ].find( ( [ , item ] ) => ! item.options.audioOnly )?.[ 0 ];
				if ( activeVisual ) visionInput.value = activeVisual;
				else if ( visionInput.options.length > 1 ) visionInput.value = visionInput.options[ 1 ].value;

			}
			if ( visionInput.value && ! inputs.has( visionInput.value ) ) {

				visionStatus.textContent = 'Starting input…';
				activatingTracking = true;
				try { await activateSource( visionInput.value ); }
				catch ( error ) {

					if ( version === trackingVersion ) { visionEnabled.checked = false; visionStatus.textContent = error.message; }
					return;

				} finally { activatingTracking = false; }
				if ( version !== trackingVersion ) return;

			}

		}
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
	visionInput.onchange = async () => {

		const id = visionInput.value;
		if ( id && ! inputs.has( id ) ) {

			visionStatus.textContent = 'Starting input…';
			activatingTracking = true;
			try { await activateSource( id ); }
			catch ( error ) { visionStatus.textContent = error.message; visionInput.value = ''; return; }
			finally { activatingTracking = false; }

		}
		await updateTracking();

	};
	visionEnabled.onchange = mode.onchange = updateTracking;
	const reloadSources = () => { void refreshAvailableSources(); };
	editor.assetBrowser?.library?.onChange( reloadSources );
	for ( const sig of [ 'assetsChanged', 'projectLoaded', 'editorCleared', 'sceneGraphChanged' ] ) editor.signals[ sig ].add( reloadSources );
	mediaPanel.addEventListener( 'toggle', () => { if ( mediaPanel.open ) reloadSources(); } );
	vision.addEventListener( 'toggle', () => { if ( vision.open ) reloadSources(); } );
	reloadSources();
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
	const kind = select( routes, 'Destination', [
		[ 'object', 'Scene object' ], [ 'param', 'Script parameter' ], [ 'morph', 'Morph target' ],
		[ 'scene', 'Scene property' ], [ 'serial', 'Serial line' ], [ 'topic', 'Mapped topic' ],
		[ 'midi.cc', 'MIDI CC' ], [ 'midi.note', 'MIDI note' ]
	] );
	const object = select( routes, 'Object', [] );
	const property = select( routes, 'Property', Object.keys( objectChannels ).map( name => [ name, name ] ) );
	const routeScript = select( routes, 'Script', [] );
	const routeParam = select( routes, 'Parameter', [] );
	const routeMorph = select( routes, 'Morph', [] );
	const sceneProperty = select( routes, 'Scene prop', [
		[ 'environmentIntensity', 'environmentIntensity' ], [ 'fog.density', 'fog.density' ],
		[ 'fog.near', 'fog.near' ], [ 'fog.far', 'fog.far' ], [ 'background.hue', 'background.hue' ],
		[ 'postprocessing.bloomStrength', 'postprocessing.bloomStrength' ],
		[ 'postprocessing.focus', 'postprocessing.focus' ],
		[ 'postprocessing.aperture', 'postprocessing.aperture' ]
	] );
	const key = input( routes, 'Serial key', '' );
	const mapped = input( routes, 'Mapped topic', 'map.' );
	const channel = input( routes, 'MIDI channel', '1', 'number' );
	const number = input( routes, 'CC / note', '1', 'number' );
	const ranges = node( 'div', '', routes );
	ranges.className = 'stream-ranges';
	const bounds = [ [ 'In min', 0 ], [ 'In max', 1 ], [ 'Out min', 0 ], [ 'Out max', 1 ] ].map( ( [ label, value ] ) => input( ranges, label, value, 'number' ) );
	for ( const field of bounds ) field.step = 'any';
	const curve = select( routes, 'Curve', [
		[ 'linear', 'Linear' ], [ 'smoothstep', 'Smoothstep' ], [ 'easeIn', 'Ease in' ],
		[ 'easeOut', 'Ease out' ], [ 'abs', 'Abs' ], [ 'step', 'Step (>= 0.5)' ]
	] );
	const smooth = input( routes, 'Smooth', '0', 'number' );
	smooth.min = 0; smooth.max = 0.98; smooth.step = 0.05;
	const clamp = input( routes, 'Clamp', '', 'checkbox' );
	clamp.checked = true;
	let editing = - 1;
	const getRoutes = () => editor.scene.userData.streamRoutes || [];

	function populateObjectChoices( control ) {

		const previous = control.value;
		control.replaceChildren( new Option( 'Choose object', '' ) );
		editor.scene.traverse( item => { if ( item !== editor.scene ) control.add( new Option( item.name || item.type, item.uuid ) ); } );
		control.value = previous;

	}
	function populateScriptsFor( uuid, scriptSel, paramSel ) {

		const prevScript = scriptSel.value, prevParam = paramSel.value;
		const scripts = editor.scripts[ uuid ] || [];
		scriptSel.replaceChildren( ...scripts.map( ( s, i ) => new Option( s.name || 'Script ' + ( i + 1 ), String( i ) ) ) );
		if ( scripts[ Number( prevScript ) ] ) scriptSel.value = prevScript;
		const chosen = scripts[ Number( scriptSel.value || 0 ) ];
		const fields = chosen ? scriptParams( chosen.source ) : [];
		paramSel.replaceChildren( ...fields.map( f => new Option( f.label || f.name, f.name ) ) );
		if ( fields.some( f => f.name === prevParam ) ) paramSel.value = prevParam;

	}
	function populateMorphsFor( uuid, morphSel ) {

		const prev = morphSel.value;
		const item = uuid ? editor.scene.getObjectByProperty( 'uuid', uuid ) : null;
		const dict = item?.morphTargetDictionary;
		const names = dict ? Object.keys( dict ) : Array.from( { length: item?.morphTargetInfluences?.length || 0 }, ( _, i ) => String( i ) );
		morphSel.replaceChildren( ...names.map( name => new Option( name, name ) ) );
		if ( names.includes( prev ) ) morphSel.value = prev;

	}

	function visibility() {

		object.parentElement.hidden = ! [ 'object', 'param', 'morph' ].includes( kind.value );
		property.parentElement.hidden = kind.value !== 'object';
		routeScript.parentElement.hidden = routeParam.parentElement.hidden = kind.value !== 'param';
		routeMorph.parentElement.hidden = kind.value !== 'morph';
		sceneProperty.parentElement.hidden = kind.value !== 'scene';
		key.parentElement.hidden = kind.value !== 'serial';
		mapped.parentElement.hidden = kind.value !== 'topic';
		for ( const control of [ channel, number ] ) control.parentElement.hidden = ! kind.value.startsWith( 'midi.' );
		if ( kind.value === 'param' ) populateScriptsFor( object.value, routeScript, routeParam );
		if ( kind.value === 'morph' ) populateMorphsFor( object.value, routeMorph );

	}
	object.onchange = () => { populateScriptsFor( object.value, routeScript, routeParam ); populateMorphsFor( object.value, routeMorph ); };
	routeScript.onchange = () => populateScriptsFor( object.value, routeScript, routeParam );

	const eventsPanel = section( panel.dom, 'Events', false );
	const eventStatus = node( 'output', '', eventsPanel );
	const eventList = node( 'div', '', eventsPanel );
	const eventSource = input( eventsPanel, 'Source / event', '' );
	eventSource.setAttribute( 'list', suggestions.id );
	eventSource.onfocus = () => suggestions.replaceChildren( ...bus.topics().map( name => new Option( name ) ) );
	const eventFallback = input( eventsPanel, 'Preview fallback', '' );
	const eventTrigger = select( eventsPanel, 'Trigger', [
		[ 'rising', 'Crosses above' ], [ 'falling', 'Crosses below' ], [ 'enter', 'Enters range' ],
		[ 'exit', 'Exits range' ], [ 'match', 'Matches text' ], [ 'change', 'On change' ], [ 'event', 'Named event' ]
	] );
	const eventThreshold = input( eventsPanel, 'Threshold', '0.5', 'number' ); eventThreshold.step = 'any';
	const eventHigh = input( eventsPanel, 'Range max', '1', 'number' ); eventHigh.step = 'any';
	const eventMatch = input( eventsPanel, 'Match text', '' );
	const eventCooldown = input( eventsPanel, 'Cooldown (ms)', '0', 'number' ); eventCooldown.min = 0; eventCooldown.step = 50;
	const eventAction = select( eventsPanel, 'Action', [
		[ 'emit', 'Emit named event' ], [ 'toggleVisible', 'Toggle visibility' ],
		[ 'setProperty', 'Set object property' ], [ 'addProperty', 'Add to object property' ],
		[ 'setParam', 'Set script parameter' ], [ 'topic', 'Publish map.* topic' ],
		[ 'serial', 'Serial line' ], [ 'midi.cc', 'MIDI CC' ], [ 'midi.note', 'MIDI note' ]
	] );
	const eventName = input( eventsPanel, 'Event name', '' );
	const eventObject = select( eventsPanel, 'Object', [] );
	const eventProperty = select( eventsPanel, 'Property', Object.keys( objectChannels ).map( name => [ name, name ] ) );
	const eventScript = select( eventsPanel, 'Script', [] );
	const eventParam = select( eventsPanel, 'Parameter', [] );
	const eventToggle = input( eventsPanel, 'Toggle boolean', '', 'checkbox' );
	const eventValue = input( eventsPanel, 'Value', '1' );
	const eventKey = input( eventsPanel, 'Serial key', '' );
	const eventTopic = input( eventsPanel, 'Mapped topic', 'map.' );
	const eventChannel = input( eventsPanel, 'MIDI channel', '1', 'number' );
	const eventNumber = input( eventsPanel, 'CC / note', '1', 'number' );
	let editingEvent = - 1;
	const getEvents = () => editor.scene.userData.streamEvents || [];

	function eventVisibility() {

		const trig = eventTrigger.value, act = eventAction.value;
		eventFallback.parentElement.hidden = trig === 'event';
		eventThreshold.parentElement.hidden = ! [ 'rising', 'falling', 'enter', 'exit' ].includes( trig );
		eventHigh.parentElement.hidden = ! [ 'enter', 'exit' ].includes( trig );
		eventMatch.parentElement.hidden = trig !== 'match';
		eventName.parentElement.hidden = act !== 'emit';
		eventObject.parentElement.hidden = ! [ 'toggleVisible', 'setProperty', 'addProperty', 'setParam' ].includes( act );
		eventProperty.parentElement.hidden = ! [ 'setProperty', 'addProperty' ].includes( act );
		eventScript.parentElement.hidden = eventParam.parentElement.hidden = eventToggle.parentElement.hidden = act !== 'setParam';
		eventKey.parentElement.hidden = act !== 'serial';
		eventTopic.parentElement.hidden = act !== 'topic';
		eventChannel.parentElement.hidden = eventNumber.parentElement.hidden = ! act.startsWith( 'midi.' );
		eventValue.parentElement.hidden = act === 'toggleVisible' || ( act === 'setParam' && eventToggle.checked );
		if ( act === 'setParam' ) populateScriptsFor( eventObject.value, eventScript, eventParam );

	}
	eventTrigger.onchange = eventAction.onchange = eventToggle.onchange = eventVisibility;
	eventObject.onchange = () => populateScriptsFor( eventObject.value, eventScript, eventParam );
	eventScript.onchange = () => populateScriptsFor( eventObject.value, eventScript, eventParam );

	function refresh() {

		populateObjectChoices( object );
		populateObjectChoices( eventObject );
		populateScriptsFor( object.value, routeScript, routeParam );
		populateMorphsFor( object.value, routeMorph );
		populateScriptsFor( eventObject.value, eventScript, eventParam );

		list.replaceChildren();
		getRoutes().forEach( ( route, index ) => {

			const targetLabel = route.target.param || route.target.morph || route.target.property || route.target.topic || route.target.kind;
			const label = route.source + ' → ' + targetLabel;
			button( list, label, () => {

				editing = index;
				topic.value = route.source;
				fallback.value = route.fallback || '';
				kind.value = route.target.kind;
				object.value = route.target.uuid || '';
				populateScriptsFor( object.value, routeScript, routeParam );
				populateMorphsFor( object.value, routeMorph );
				property.value = route.target.property || 'position.x';
				routeScript.value = String( route.target.scriptIndex ?? 0 );
				populateScriptsFor( object.value, routeScript, routeParam );
				routeParam.value = route.target.param || '';
				routeMorph.value = route.target.morph || '';
				sceneProperty.value = route.target.property || 'environmentIntensity';
				key.value = route.target.key || '';
				mapped.value = route.target.topic || 'map.';
				channel.value = route.target.channel || 1;
				number.value = route.target.controller ?? route.target.note ?? 1;
				[ ...( route.input || [ 0, 1 ] ), ...( route.output || [ 0, 1 ] ) ].forEach( ( value, i ) => { bounds[ i ].value = value; } );
				curve.value = route.curve || 'linear';
				smooth.value = route.smooth || 0;
				clamp.checked = route.clamp !== false;
				visibility();
				status.textContent = 'Editing driver ' + ( index + 1 );

			}, status );

		} );

		eventList.replaceChildren();
		getEvents().forEach( ( rule, index ) => {

			const actionLabel = rule.action?.name || rule.action?.param || rule.action?.property || rule.action?.topic || rule.action?.kind;
			button( eventList, `${ rule.source } [${ rule.trigger }] → ${ actionLabel }`, () => {

				editingEvent = index;
				eventSource.value = rule.source || '';
				eventFallback.value = rule.fallback || '';
				eventTrigger.value = rule.trigger || 'rising';
				eventThreshold.value = rule.threshold ?? 0.5;
				eventHigh.value = rule.high ?? 1;
				eventMatch.value = rule.match ?? '';
				eventCooldown.value = rule.cooldown ?? 0;
				const act = rule.action || { kind: 'emit' };
				eventAction.value = act.kind || 'emit';
				eventName.value = act.name || '';
				eventObject.value = act.uuid || '';
				populateScriptsFor( eventObject.value, eventScript, eventParam );
				eventProperty.value = act.property || 'position.x';
				eventScript.value = String( act.scriptIndex ?? 0 );
				populateScriptsFor( eventObject.value, eventScript, eventParam );
				eventParam.value = act.param || '';
				eventToggle.checked = !! act.toggle;
				eventValue.value = act.value ?? '1';
				eventKey.value = act.key || '';
				eventTopic.value = act.topic || 'map.';
				eventChannel.value = act.channel || 1;
				eventNumber.value = act.controller ?? act.note ?? 1;
				eventVisibility();
				eventStatus.textContent = 'Editing event ' + ( index + 1 );

			}, eventStatus );

		} );

	}
	function save( next ) {

		const command = new SetValueCommand( editor, editor.scene, 'userData', { ...editor.scene.userData, streamRoutes: next } );
		command.updatable = false;
		editing = - 1;
		editor.execute( command );
		refresh();

	}
	function saveEvents( next ) {

		const command = new SetValueCommand( editor, editor.scene, 'userData', { ...editor.scene.userData, streamEvents: next } );
		command.updatable = false;
		editingEvent = - 1;
		editor.execute( command );
		refresh();

	}
	function parseActionValue( raw ) {

		if ( raw === 'true' ) return true;
		if ( raw === 'false' ) return false;
		const num = Number( raw );
		return raw.trim() !== '' && Number.isFinite( num ) ? num : raw;

	}
	function buildEventAction() {

		const action = { kind: eventAction.value };
		if ( action.kind === 'emit' ) {

			if ( ! eventName.value.trim() ) throw new Error( 'Enter an event name.' );
			action.name = eventName.value.trim();
			if ( eventValue.value.trim() ) action.value = parseActionValue( eventValue.value );

		} else if ( action.kind === 'toggleVisible' ) {

			if ( ! eventObject.value ) throw new Error( 'Choose an object.' );
			action.uuid = eventObject.value;

		} else if ( action.kind === 'setProperty' || action.kind === 'addProperty' ) {

			if ( ! eventObject.value ) throw new Error( 'Choose an object.' );
			const val = Number( eventValue.value );
			if ( ! Number.isFinite( val ) ) throw new Error( 'Enter a numeric value.' );
			Object.assign( action, { uuid: eventObject.value, property: eventProperty.value, value: val } );

		} else if ( action.kind === 'setParam' ) {

			if ( ! eventObject.value || ! eventParam.value ) throw new Error( 'Choose an object and script parameter.' );
			Object.assign( action, { uuid: eventObject.value, scriptIndex: Number( eventScript.value || 0 ), param: eventParam.value, toggle: eventToggle.checked } );
			if ( ! action.toggle ) action.value = parseActionValue( eventValue.value );

		} else if ( action.kind === 'topic' ) {

			if ( ! /^map\.[\w.-]+$/.test( eventTopic.value ) ) throw new Error( 'Use a map.name topic.' );
			action.topic = eventTopic.value;
			action.value = parseActionValue( eventValue.value );

		} else if ( action.kind === 'serial' ) {

			action.key = eventKey.value.trim();
			action.value = parseActionValue( eventValue.value );

		} else if ( action.kind.startsWith( 'midi.' ) ) {

			action.channel = Number( eventChannel.value );
			const id = Number( eventNumber.value );
			if ( ! Number.isInteger( action.channel ) || action.channel < 1 || action.channel > 16 || ! Number.isInteger( id ) || id < 0 || id > 127 ) throw new Error( 'Use channel 1–16 and a CC or note from 0–127.' );
			action[ action.kind === 'midi.cc' ? 'controller' : 'note' ] = id;
			action.value = Number( eventValue.value || 127 );

		}
		return action;

	}

	kind.onchange = visibility;
	button( routes, 'New', () => { editing = - 1; topic.value = fallback.value = ''; status.textContent = 'New driver'; }, status );
	button( routes, 'Save route', () => {

		const [ a, b, c, d ] = bounds.map( field => field.valueAsNumber );
		if ( ! topic.value.trim() || ! [ a, b, c, d ].every( Number.isFinite ) || a === b ) throw new Error( 'Enter a topic and a valid input and output range.' );
		const target = { kind: kind.value };
		if ( target.kind === 'object' ) {

			if ( ! object.value ) throw new Error( 'Choose an object.' );
			Object.assign( target, { uuid: object.value, property: property.value } );

		} else if ( target.kind === 'param' ) {

			if ( ! object.value || ! routeParam.value ) throw new Error( 'Choose an object and script parameter.' );
			Object.assign( target, { uuid: object.value, scriptIndex: Number( routeScript.value || 0 ), param: routeParam.value } );

		} else if ( target.kind === 'morph' ) {

			if ( ! object.value || ! routeMorph.value ) throw new Error( 'Choose an object and morph target.' );
			Object.assign( target, { uuid: object.value, morph: routeMorph.value } );

		} else if ( target.kind === 'scene' ) {

			target.property = sceneProperty.value;

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
		const route = { source: topic.value.trim(), fallback: fallback.value.trim(), input: [ a, b ], output: [ c, d ], curve: curve.value, smooth: Number( smooth.value ) || 0, clamp: clamp.checked, target };
		const next = [ ...getRoutes() ];
		next[ editing === - 1 ? next.length : editing ] = route;
		save( next );
		status.textContent = 'Saved';

	}, status );
	button( routes, 'Delete route', () => {

		if ( editing !== - 1 ) save( getRoutes().filter( ( _, index ) => index !== editing ) );
		status.textContent = '';

	}, status );

	button( eventsPanel, 'New', () => { editingEvent = - 1; eventSource.value = eventFallback.value = eventName.value = ''; eventStatus.textContent = 'New event rule'; }, eventStatus );
	button( eventsPanel, 'Save event', () => {

		if ( ! eventSource.value.trim() ) throw new Error( 'Enter a source topic or event name.' );
		const rule = {
			source: eventSource.value.trim(),
			fallback: eventFallback.value.trim(),
			trigger: eventTrigger.value,
			threshold: Number( eventThreshold.value ),
			high: Number( eventHigh.value ),
			match: eventMatch.value,
			cooldown: Math.max( 0, Number( eventCooldown.value ) || 0 ),
			action: buildEventAction()
		};
		const next = [ ...getEvents() ];
		next[ editingEvent === - 1 ? next.length : editingEvent ] = rule;
		saveEvents( next );
		eventStatus.textContent = 'Saved';

	}, eventStatus );
	button( eventsPanel, 'Delete event', () => {

		if ( editingEvent !== - 1 ) saveEvents( getEvents().filter( ( _, index ) => index !== editingEvent ) );
		eventStatus.textContent = '';

	}, eventStatus );
	button( eventsPanel, 'Test fire', () => {

		const action = buildEventAction();
		if ( action.kind === 'emit' ) bus.emit( action.name, { value: action.value ?? 1 }, true );
		else {

			const testName = 'test.' + Date.now();
			const temp = [ ...getEvents(), { source: testName, trigger: 'event', action } ];
			const prev = editor.scene.userData.streamEvents;
			editor.scene.userData.streamEvents = temp;
			bus.emit( testName, { value: action.value ?? 1 }, true );
			bus.tick( editor.scene );
			editor.scene.userData.streamEvents = prev;
			editor.signals.sceneGraphChanged.dispatch();

		}
		eventStatus.textContent = 'Fired';

	}, eventStatus );

	editor.signals.sceneGraphChanged.add( refresh );
	const reset = () => { editing = editingEvent = - 1; capture = undefined; hardware.checked = false; releaseNotes(); bus.clear( 'demo.' ); bus.clear( 'map.' ); refresh(); };
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
	eventVisibility();
	refresh();
	return panel;

}

export { SidebarStreams };
