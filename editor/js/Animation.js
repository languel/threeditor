import { MathUtils } from 'three';
import { UIPanel } from './libs/ui.js';
import { icon } from './Glyphs.js?v=timeline-glyphs';
import { SetValueCommand } from './commands/SetValueCommand.js';
import { availableTargets, authoredParam, discreteTarget, timelineBinding } from './animation/TimelineBindings.js?v=timeline-keying';
import { putKey, targetId, timelineData, timelineEnd } from './animation/TimelineData.js?v=timeline-keying';
import { TimelineRuntime } from './animation/TimelineRuntime.js?v=timeline-keying';
import { refreshTimelineKeyControls, watchTimelineFields } from './animation/TimelineKeyControl.js';

function trackAt( clip, target ) {

	const id = targetId( target );
	return clip?.tracks?.find( track => targetId( track.target ) === id );

}

function holdsValue( target, value ) {

	return discreteTarget( target ) || typeof value === 'boolean' ||
		typeof value === 'string' && ( target.kind === 'script' || ! /^#[\da-f]{6}$/i.test( value ) );

}

function element( tag, parent, text ) {

	const node = document.createElement( tag );
	if ( text ) node.textContent = text;
	parent.appendChild( node );
	return node;

}

function Animation( editor ) {

	const { signals } = editor;
	const container = new UIPanel().setId( 'animation' ).setDisplay( 'flex' );
	const panel = container.dom;
	panel.classList.add( 'scene-timeline' );
	const bar = element( 'div', panel );
	bar.className = 'scene-timeline-bar';
	const params = element( 'div', panel );
	params.className = 'scene-timeline-bar';
	const lanes = element( 'div', panel );
	lanes.className = 'scene-timeline-lanes';

	let time = 0, playing = false, recording = null, previewing = false, loop = false;
	let selection, channel, keyTime, draft, lastFrame;
	const armed = new Map();
	let choices = [];
	const data = () => draft || timelineData( editor.scene );
	const clip = () => data().clips.find( clip => clip.id === selection );
	const context = {
		scene: editor.scene,
		get scripts() { return editor.scripts; },
		object: uuid => editor.camera.uuid === uuid ? editor.camera : editor.objectByUuid( uuid ),
		getParam: ( uuid, index, property ) => editor.streams.getParam?.( uuid, index, property ) ?? authoredParam( editor.scripts, uuid, index, property ),
		setParam: ( ...args ) => editor.assetBrowser?.runtime?.setPreviewParam?.( ...args )
	};
	const runtime = new TimelineRuntime( context );

	function button( parent, label, action, glyph ) {

		const button = element( 'button', parent, glyph ? '' : label );
		button.type = 'button';
		button.className = 'Button';
		button.title = label;
		button.setAttribute( 'aria-label', label );
		if ( glyph ) {
			button.classList.add( 'scene-timeline-glyph-button' );
			button.innerHTML = icon( glyph );
			element( 'span', button, label ).className = 'scene-timeline-label';
		}
		button.onclick = action;
		return button;

	}

	function number( parent, label, value, change, step = '1', glyph ) {

		const wrapper = element( 'label', parent );
		wrapper.title = label;
		if ( glyph ) wrapper.innerHTML = icon( glyph );
		element( 'span', wrapper, label ).className = glyph ? 'scene-timeline-label' : '';

		const input = element( 'input', wrapper );
		input.type = 'number';
		input.setAttribute( 'aria-label', label );
		input.step = step;
		input.value = value;
		input.onchange = () => {

			if ( input.value !== '' && Number.isFinite( input.valueAsNumber ) ) change( input.valueAsNumber );
			refresh();

		};
		return input;

	}

	function stageHeight( height ) {

		document.body.style.setProperty( '--animation-height', height + 'px' );
		signals.animationPanelChanged.dispatch( height );

	}
	signals.animationPanelResized.add( stageHeight );
	stageHeight( 188 );

	const play = button( bar, 'Play timeline', togglePlayback, 'play' );
	button( bar, 'Stop timeline', stop, 'stop' );
	const rec = button( bar, 'Record parameter', toggleRecord, 'record' );
	const loopButton = button( bar, 'Loop timeline', () => {

		loop = ! loop;
		loopButton.setAttribute( 'aria-pressed', String( loop ) );

	}, 'loop' );
	loopButton.setAttribute( 'aria-pressed', 'false' );
	const frame = number( bar, 'Frame', 0, value => seek( Math.max( 0, value ) / data().fps ), '1', 'frame' );
	frame.min = 0;
	const fps = number( bar, 'FPS', 30, value => modify( 'Set timeline frame rate', doc => doc.fps = Math.min( 120, Math.max( 1, Math.round( value ) ) ) ), '1', 'frameRate' );
	fps.min = 1;
	fps.max = 120;
	button( bar, 'Add clip', () => {

		modify( 'Add parameter clip', doc => newClip( doc ) );

	}, 'add' );

	const targetSelect = element( 'select', params );
	targetSelect.setAttribute( 'aria-label', 'Timeline parameter' );
	const armButton = button( params, 'Arm parameter', () => toggleArmed( chosenTarget() ), 'add' );
	const keyButton = button( params, 'Insert keyframe', () => insertKey(), 'keyframe' );
	const armedList = element( 'div', params );
	armedList.className = 'scene-timeline-armed';
	const inspector = element( 'div', params );
	inspector.className = 'scene-timeline-inspector';
	const readout = element( 'output', bar );
	readout.setAttribute( 'aria-live', 'polite' );

	function newClip( doc, animation ) {

		const id = MathUtils.generateUUID();
		selectClip( id );
		const entry = {
			id, name: animation?.name || 'Clip ' + ( doc.clips.length + 1 ), start: snapTime( time ),
			duration: Math.max( 1 / doc.fps, animation?.duration ?? 3 ), tracks: []
		};
		if ( animation ) entry.animation = { object: animation.object, clip: animation.uuid };
		doc.clips.push( entry );
		return entry;

	}

	function selectClip( id ) {

		selection = id;
		channel = keyTime = undefined;

	}

	function snapTime( value ) {

		const fps = data().fps;
		return Math.max( 0, Math.round( value * fps ) / fps );

	}

	function commit( doc, name ) {

		const command = runtime.withBase( () => new SetValueCommand( editor, editor.scene, 'userData',
			{ ...editor.scene.userData, timeline: doc } ) );
		command.updatable = false;
		editor.execute( command, name );

	}

	function modify( name, edit ) {

		if ( recording ) return;
		const doc = structuredClone( data() );
		edit( doc );
		commit( doc, name );
		refresh();

	}

	function chosenTarget() {

		return choices.find( candidate => targetId( candidate ) === targetSelect.value );

	}

	function stableTarget( target ) {

		if ( target?.kind !== 'script' || target.scriptId ) return target;
		const script = editor.scripts[ target.object ]?.[ target.index ];
		if ( ! script ) return;
		const option = [ ...targetSelect.options ].find( item => item.value === targetId( target ) );
		script.timelineId ||= MathUtils.generateUUID();
		if ( option ) {

			const previous = choices.find( item => targetId( item ) === option.value );
			if ( previous ) previous.scriptId = script.timelineId;
			option.value = targetId( { ...target, scriptId: script.timelineId } );

		}
		return { ...target, scriptId: script.timelineId };

	}

	function keyTargets( target ) {

		const targets = target ? [ target ] : armed.size ? [ ...armed.values() ] : [ chosenTarget() ];
		return targets.filter( Boolean ).map( stableTarget ).filter( Boolean ).map( ( { option, ...target } ) => target );

	}

	function toggleArmed( property ) {

		if ( recording || ! property ) return;
		if ( armed.delete( targetId( property ) ) ) return refresh();
		if ( ! timelineBinding( context, property ) ) return;
		const { option, ...target } = stableTarget( property );
		const id = targetId( target );
		if ( ! armed.delete( id ) ) armed.set( id, target );
		refresh();

	}

	function keyAtFrame( track, entry ) {

		return track?.keys.find( key => Math.abs( entry.start + key.time - snapTime( time ) ) < 1e-6 );

	}

	function keyState( target ) {

		const binding = timelineBinding( context, target );
		const entry = editClipFor( target );
		const animated = data().clips.some( clip => trackAt( clip, target ) );
		return { available: !! binding && ! recording, animated, keyed: !! keyAtFrame( trackAt( entry, target ), entry ),
			armed: armed.has( targetId( target ) ), value: binding?.read() };

	}

	function editClipFor( target ) {

		const selected = clip();
		if ( selected && ! selected.animation ) return selected;
		const at = snapTime( time );
		return data().clips.findLast( entry => at >= entry.start && at <= entry.start + entry.duration && trackAt( entry, target ) );

	}

	function toggleKey( target ) {

		if ( ! target || recording ) return;
		const entry = editClipFor( target );
		if ( entry && selection !== entry.id ) selectClip( entry.id );
		const key = keyAtFrame( trackAt( entry, target ), entry );
		if ( ! key ) return insertKey( target );
		modify( 'Delete keyframe', doc => {

			const clip = doc.clips.find( item => item.id === entry.id );
			const track = trackAt( clip, target );
			track.keys = track.keys.filter( item => item.time !== key.time );
			if ( ! track.keys.length ) clip.tracks.splice( clip.tracks.indexOf( track ), 1 );

		} );
		pulse();

	}

	function recordKey( doc, target, value, at, continuous = false ) {

		let entry = doc.clips.find( clip => clip.id === selection && ! clip.animation );
		if ( ! entry || at < entry.start ) entry = newClip( doc );
		const relative = Math.max( 0, at - entry.start );
		entry.duration = Math.max( entry.duration, relative + 1 / doc.fps );
		let track = trackAt( entry, target );
		if ( ! track ) {

			track = { target, keys: [] };
			entry.tracks.push( track );

		}
		const interpolation = holdsValue( target, value ) ? 'hold' : 'linear';
		putKey( track, relative, value, interpolation );
		if ( ! continuous ) {

			channel = targetId( target );
			keyTime = relative;

		}

	}

	function insertKey( property ) {

		if ( recording ) return;
		const samples = keyTargets( property ).map( target => ( { target, value: timelineBinding( context, target )?.read() } ) )
			.filter( sample => sample.value !== undefined );
		if ( ! samples.length ) return;
		const entry = editClipFor( samples[ 0 ].target );
		if ( entry && selection !== entry.id ) selectClip( entry.id );
		modify( samples.length === 1 ? 'Insert keyframe' : 'Insert keyframes', doc => {

			for ( const { target, value } of samples ) recordKey( doc, target, value, snapTime( time ) );

		} );
		pulse();

	}

	function seek( at ) {

		if ( recording ) return;
		playing = false;
		time = at;
		previewing = true;
		signals.timelinePlaybackStarted.dispatch();
		pulse();
		refreshTransport();

	}

	function pulse() {

		runtime.apply( data(), time );
		signals.timelineFrameChanged.dispatch();
		refreshTimelineKeyControls( editor.timeline );

	}

	function stop() {

		if ( recording ) finishRecord();
		playing = previewing = false;
		time = 0;
		runtime.clear();
		signals.timelineFrameChanged.dispatch();
		refreshTimelineKeyControls( editor.timeline );
		refreshTransport();

	}

	function togglePlayback() {

		if ( recording ) return finishRecord();
		const end = timelineEnd( data() );
		if ( ! end ) return;
		playing = ! playing;
		if ( playing ) signals.timelinePlaybackStarted.dispatch();
		if ( playing && time >= end ) time = 0;
		previewing = true;
		refreshTransport();

	}

	function toggleRecord() {

		if ( recording ) return finishRecord();
		const channels = keyTargets().map( target => {

			const binding = timelineBinding( context, target );
			const value = binding?.read();
			return { target, binding, value, last: JSON.stringify( value ) };

		} ).filter( sample => sample.value !== undefined );
		if ( ! channels.length ) return;
		const entry = editClipFor( channels[ 0 ].target );
		if ( entry && selection !== entry.id ) selectClip( entry.id );
		draft = structuredClone( data() );
		recording = { channels, ids: new Set( channels.map( sample => targetId( sample.target ) ) ), frame: Math.round( time * draft.fps ) };
		for ( const { target, value } of channels ) recordKey( draft, target, value, snapTime( time ), true );
		playing = previewing = true;
		signals.timelinePlaybackStarted.dispatch();
		refresh();

	}

	function finishRecord() {

		const title = recording.channels.length === 1 ? recording.channels[ 0 ].target.label : recording.channels.length + ' parameters';
		recording = null;
		playing = false;
		const doc = draft;
		draft = null;
		commit( doc, 'Record ' + title );
		refresh();

	}

	function tick( delta ) {

		if ( ! playing ) return false;
		time += delta;
		if ( recording ) {

			const f = Math.floor( time * draft.fps );
			if ( f > recording.frame ) {

				for ( const sample of recording.channels ) {

					const value = sample.binding.read();
					const text = JSON.stringify( value );
					if ( value === undefined || text === sample.last ) continue;
					const track = trackAt( clip(), sample.target );
					const previous = recording.frame / draft.fps - clip().start;
					const last = JSON.parse( sample.last );
					if ( previous >= 0 ) putKey( track, previous, last, holdsValue( sample.target, last ) ? 'hold' : 'linear' );
					recordKey( draft, sample.target, value, f / draft.fps, true );
					sample.last = text;

				}
				recording.frame = f;

			}
			clip().duration = Math.max( clip().duration, time - clip().start );

		} else {

			const end = timelineEnd( data() );
			if ( time >= end && loop ) time %= end || 1;
			else if ( time >= end ) {

				time = end;
				playing = false;

			}

		}
		runtime.apply( data(), time, recording?.ids );
		if ( recording && Math.floor( time * 10 ) !== Math.floor( ( time - delta ) * 10 ) ) drawLanes();
		refreshTransport();
		refreshTimelineKeyControls( editor.timeline );
		const currentFrame = Math.round( time * data().fps );
		if ( currentFrame !== lastFrame ) {
			lastFrame = currentFrame;
			refreshTimelineKeyControls( editor.timeline );
		}
		return true;

	}

	function refreshTransport() {

		if ( document.activeElement !== frame ) frame.value = Math.round( time * data().fps );
		play.innerHTML = icon( playing ? 'pause' : 'play' );
		play.setAttribute( 'aria-label', playing ? 'Pause timeline' : 'Play timeline' );
		play.title = play.getAttribute( 'aria-label' );
		rec.setAttribute( 'aria-pressed', String( !! recording ) );
		rec.lastElementChild.textContent = recording ? 'Stop recording' : 'Record';
		rec.title = recording ? 'Stop recording' : 'Record parameter';
		rec.setAttribute( 'aria-label', rec.title );
		readout.textContent = recording ? recording.channels.map( sample => sample.target.label ).join( ', ' ) : '';
		for ( const marker of lanes.querySelectorAll( '.scene-timeline-playhead' ) ) marker.style.left = 100 * time / visibleEnd() + '%';

	}

	function visibleEnd() {

		return Math.max( 10, Math.ceil( timelineEnd( data() ) ), Math.ceil( time ) );

	}

	function drawLanes() {

		const scroll = lanes.scrollTop;
		lanes.replaceChildren();
		const end = visibleEnd();
		const row = ( name, classes = '' ) => {

			const line = element( 'div', lanes );
			line.className = 'scene-timeline-row ' + classes;
			const label = element( 'span', line, name );
			label.title = name;
			const lane = element( 'div', line );
			const marker = element( 'span', lane );
			marker.className = 'scene-timeline-playhead';
			marker.style.left = time / end * 100 + '%';
			return lane;

		};
		const ruler = row( 'Time', 'scene-timeline-ruler' );
		const step = Math.max( 1, Math.ceil( end / 10 ) );
		lanes.style.setProperty( '--timeline-tick', ( step / end * 100 ) + '%' );
		for ( let i = 0; i <= end; i += step ) {

			const tick = element( 'span', ruler, i + 's' );
			tick.style.left = i / end * 100 + '%';

		}
		function secondsAt( event, lane ) {

			const rect = lane.getBoundingClientRect();
			return snapTime( MathUtils.clamp( ( event.clientX - rect.left ) / rect.width, 0, 1 ) * end );

		}

		ruler.onpointerdown = event => {

			if ( recording || event.button !== 0 ) return;
			ruler.setPointerCapture( event.pointerId );
			const at = secondsAt( event, ruler );
			playing = false;
			time = at;
			previewing = true;
			signals.timelinePlaybackStarted.dispatch();
			pulse();
			refreshTransport();

		};
		ruler.onpointermove = event => { if ( ruler.hasPointerCapture( event.pointerId ) ) seek( secondsAt( event, ruler ) ); };

		function dragTime( node, lane, original, min, max, apply ) {

			node.onpointerdown = event => {

				if ( recording || event.button !== 0 ) return;
				const anchor = event.clientX, width = lane.getBoundingClientRect().width;
				let next = original;
				node.setPointerCapture( event.pointerId );
				node.onpointermove = move => {

					next = MathUtils.clamp( snapTime( original + ( move.clientX - anchor ) / width * end ), min, max );
					node.style.left = next / end * 100 + '%';

				};
				node.onpointerup = () => {

					node.onpointermove = null;
					if ( next !== original ) apply( next );

				};
				node.onpointercancel = () => {

					node.onpointermove = null;
					node.style.left = original / end * 100 + '%';

				};

			};

		}

		for ( const entry of data().clips ) {

			const lane = row( entry.name, entry.id === selection ? 'selected' : '' );
			const clipButton = button( lane, entry.name, null );
			clipButton.classList.add( 'scene-timeline-clip' );
			clipButton.classList.toggle( 'imported-clip', Boolean( entry.animation ) );
			clipButton.style.left = entry.start / end * 100 + '%';
			clipButton.style.width = entry.duration / end * 100 + '%';
			clipButton.onclick = () => {

				if ( recording ) return;
				selectClip( entry.id );
				refresh();

			};
			dragTime( clipButton, lane, entry.start, 0, Infinity, start => {

				selectClip( entry.id );
				modify( 'Move timeline clip', doc => doc.clips.find( clip => clip.id === entry.id ).start = start );

			} );
			if ( entry.id !== selection ) continue;
			for ( const track of entry.tracks ) {

				const object = context.object( track.target.object );
				const trackLane = row( ( object?.name || object?.type || 'Missing object' ) + ' · ' + track.target.label, 'scene-timeline-track' );
				const id = targetId( track.target );
				for ( const key of track.keys ) {

					const mark = button( trackLane, 'Keyframe ' + Math.round( ( entry.start + key.time ) * data().fps ), () => {

						if ( recording ) return;
						channel = id;
						keyTime = key.time;
						seek( entry.start + key.time );
						refresh();

					} );
					mark.classList.add( 'scene-timeline-key' );
					mark.setAttribute( 'aria-pressed', String( channel === id && keyTime === key.time ) );
					mark.style.left = ( entry.start + key.time ) / end * 100 + '%';
					dragTime( mark, trackLane, entry.start + key.time, entry.start, entry.start + entry.duration, at => {

						channel = id;
						keyTime = at - entry.start;
						modify( 'Move keyframe', doc => {

							const edit = trackAt( doc.clips.find( clip => clip.id === entry.id ), track.target );
							edit.keys = edit.keys.filter( item => item.time !== key.time );
							putKey( edit, keyTime, key.value, key.interpolation );

						} );

					} );

				}

			}

		}
		lanes.scrollTop = scroll;

	}

	function refresh() {

		const previous = targetSelect.value;
		const selectedObjects = editor.selected ? [ editor.selected ] : editor.selector.selection;
		choices = selectedObjects.flatMap( object => availableTargets( object, editor.scripts ).map( target => ( {
			...target,
			option: selectedObjects.length < 2 ? target.label : ( object.name || object.type ) + ' · ' + target.label
		} ) ) );
		targetSelect.replaceChildren( new Option( choices.length ? 'Choose a parameter…' : 'Select an object', '' ),
			...choices.map( target => new Option( target.option, targetId( target ) ) ) );
		targetSelect.value = choices.some( target => targetId( target ) === previous ) ? previous : '';
		if ( ! targetSelect.value && choices.length === 1 ) targetSelect.value = choices[ 0 ] && targetId( choices[ 0 ] );
		syncParameterControls();
		fps.value = data().fps;
		inspector.replaceChildren();
		const entry = clip();
		if ( entry && ! recording ) {

			const edit = ( name, change ) => modify( name, doc => change( doc.clips.find( clip => clip.id === entry.id ) ) );
			const name = element( 'input', inspector );
			name.value = entry.name;
			name.setAttribute( 'aria-label', 'Clip name' );
			name.onchange = () => edit( 'Rename timeline clip', item => item.name = name.value.trim() || item.name );
			number( inspector, 'Start', entry.start, value => edit( 'Move timeline clip', item => item.start = snapTime( value ) ), 'any', 'history' );
			number( inspector, 'Length', entry.duration, value => edit( 'Resize timeline clip', item => {

				item.duration = Math.max( 1 / data().fps, snapTime( value ), ...item.tracks.flatMap( track => track.keys.map( key => key.time ) ) );

			} ), 'any', 'toolMeasure' );
			button( inspector, 'Delete clip', () => modify( 'Delete timeline clip', doc => {

				doc.clips = doc.clips.filter( clip => clip.id !== entry.id );
				selectClip();

			} ), 'delete' );
			const selected = entry.tracks.find( track => targetId( track.target ) === channel )?.keys.find( key => key.time === keyTime );
			if ( selected ) {

				const track = item => item.tracks.find( track => targetId( track.target ) === channel );
				const find = item => track( item ).keys.find( key => key.time === keyTime );
				const value = element( 'input', inspector );
				value.type = typeof selected.value === 'number' ? 'number' : 'text';
				value.step = 'any';
				value.setAttribute( 'aria-label', 'Key value' );
				value.title = 'Key value';
				value.value = Array.isArray( selected.value ) ? selected.value.join( ', ' ) : selected.value;
				value.onchange = () => {

					const text = value.value;
					let next = text;
					if ( typeof selected.value === 'number' ) next = value.valueAsNumber;
					else if ( typeof selected.value === 'boolean' ) next = text === 'true' ? true : text === 'false' ? false : undefined;
					else if ( Array.isArray( selected.value ) ) next = text.split( ',' ).map( part => part.trim() ? Number( part ) : NaN );
					if ( next === undefined || typeof next === 'number' && ! Number.isFinite( next ) ||
						Array.isArray( next ) && ( next.length !== selected.value.length || ! next.every( Number.isFinite ) ) ||
						typeof selected.value === 'string' && /^#[\da-f]{6}$/i.test( selected.value ) && ! /^#[\da-f]{6}$/i.test( text ) ) return refresh();
					edit( 'Set keyframe value', item => find( item ).value = next );

				};
				number( inspector, 'Key time', entry.start + keyTime, value => edit( 'Move keyframe', item => {

					const key = find( item );
					const lane = track( item );
					lane.keys.splice( lane.keys.indexOf( key ), 1 );
					const next = MathUtils.clamp( snapTime( value ) - item.start, 0, item.duration );
					putKey( lane, next, key.value, key.interpolation );
					keyTime = next;

				} ), 'any', 'frame' );
				const interpolation = element( 'select', inspector );
				interpolation.disabled = holdsValue( track( entry ).target, selected.value );
				interpolation.setAttribute( 'aria-label', 'Keyframe interpolation' );
				interpolation.replaceChildren( new Option( 'Linear', 'linear' ), new Option( 'Ease in/out', 'ease' ), new Option( 'Hold', 'hold' ) );
				interpolation.value = selected.interpolation;
				interpolation.onchange = () => edit( 'Set keyframe interpolation', item => find( item ).interpolation = interpolation.value );
				button( inspector, 'Delete keyframe', () => edit( 'Delete keyframe', item => {

					const lane = track( item );
					lane.keys = lane.keys.filter( key => key.time !== keyTime );
					if ( ! lane.keys.length ) item.tracks.splice( item.tracks.indexOf( lane ), 1 );
					keyTime = undefined;

				} ), 'delete' );

			}

		}
		drawLanes();
		refreshTransport();
		refreshTimelineKeyControls( editor.timeline );

	}

	function syncParameterControls() {

		const target = chosenTarget();
		const available = target && timelineBinding( context, target );
		armButton.disabled = ! available || !! recording;
		armButton.setAttribute( 'aria-pressed', String( !! target && armed.has( targetId( target ) ) ) );
		keyButton.disabled = ! ( available || armed.size ) || !! recording;
		rec.disabled = ! ( available || armed.size || recording );
		armedList.replaceChildren();
		for ( const target of armed.values() ) {

			const object = context.object( target.object );
			const name = ( object?.name || object?.type || 'Missing object' ) + ' · ' + target.label;
			const item = button( armedList, name + ' ×', () => toggleArmed( target ) );
			item.title = 'Disarm ' + name;
			item.setAttribute( 'aria-label', item.title );
			item.disabled = !! recording;

		}

	}
	targetSelect.onchange = syncParameterControls;
	for ( const signal of [ signals.objectSelected, signals.scriptAdded, signals.scriptRemoved, signals.materialChanged,
		signals.sceneBackgroundChanged, signals.sceneFogChanged, signals.geometryChanged ] ) signal.add( refresh );
	signals.scriptChanged.add( ( script, attribute ) => {

		if ( attribute !== 'paramValues' && attribute !== 'favoriteParams' ) refresh();

	} );
	signals.objectChanged.add( ( object, attribute ) => {

		if ( object === editor.scene && attribute === 'userData' ) {

			if ( previewing && ! recording ) pulse();
			refresh();

		}

	} );
	function reset() {

		stop();
		armed.clear();
		selectClip();
		refresh();

	}
	signals.projectLoaded.add( reset );
	signals.editorCleared.add( reset );
	signals.startPlayer.add( stop );
	editor.timeline = {
		tick, insertKey, toggleKey, keyState, toggleArmed,
		refreshKeyControls: () => refreshTimelineKeyControls( editor.timeline ),
		withBase: callback => runtime.withBase( callback ),
		addImported: ( object, clip ) => modify( 'Add imported animation clip', doc => newClip( doc,
			{ object: object.uuid, name: clip.name || 'Imported animation', duration: clip.duration, uuid: clip.uuid } ) )
	};
	editor.animationCommands = { animationPlay: togglePlayback, animationPause: () => { if ( recording ) finishRecord(); playing = false; refreshTransport(); }, animationStop: stop };
	watchTimelineFields( document );
	refresh();
	return container;

}

export { Animation };
