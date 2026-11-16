import { landmarkDiagram, landmarkGroups, landmarkName } from './TopicLandmarks.js';

const inputTopic = /^input\.(.+?)\.(vision|video|audio)\.(.+)$/;
const coordinate = /^vision\.(pose|leftHand|rightHand|hand|face|iris\.(?:left|right))\.(\d+)\.([xyz])$/;

function topicParts( topic ) {

	const match = inputTopic.exec( topic );
	return match ? { source: match[ 1 ], channel: match[ 2 ] + '.' + match[ 3 ] } : { source: '', channel: topic };

}

function channelLabel( channel ) {

	const point = coordinate.exec( channel );
	if ( point ) {

		const [ , group, index, axis ] = point;
		const name = landmarkName( group, Number( index ) ) || 'Landmark ' + index;
		return landmarkGroups[ group ] + ' · ' + name + ' · ' + axis.toUpperCase();

	}
	if ( channel.startsWith( 'vision.face.blendshape.' ) ) return 'Face expression · ' + channel.split( '.' ).at( - 1 );
	return channel;

}

function element( parent, tag, text = '', className = '' ) {

	const node = document.createElement( tag );
	node.textContent = text;
	node.className = className;
	parent.append( node );
	return node;

}

function action( parent, text, callback ) {

	const button = element( parent, 'button', text, 'Button' );
	button.type = 'button';
	button.onclick = callback;
	return button;

}

function select( parent, label ) {

	const wrap = element( parent, 'label', label );
	return element( wrap, 'select', '', 'Select' );

}

export function createTopicPicker( bus, sourceName, savedTopics, inputIds ) {

	const dialog = document.createElement( 'dialog' );
	dialog.className = 'stream-topic-picker';
	dialog.setAttribute( 'aria-label', 'Choose a stream topic' );

	const header = element( dialog, 'header' );
	element( header, 'strong', 'Choose a stream topic' );
	action( header, 'Close', () => dialog.close() );
	const filters = element( dialog, 'div', '', 'stream-topic-filters' );
	const source = select( filters, 'Input' );
	const mode = select( filters, 'Browse' );
	mode.add( new Option( 'Channels', '' ) );
	for ( const [ value, name ] of Object.entries( landmarkGroups ) ) mode.add( new Option( name, value ) );

	const channels = element( dialog, 'section' );
	const search = element( channels, 'input', '', 'Input' );
	search.type = 'search';
	search.placeholder = 'Search names or topics';
	search.setAttribute( 'aria-label', search.placeholder );
	const results = element( channels, 'div', '', 'stream-topic-results' );

	const landmarks = element( dialog, 'section', '', 'stream-topic-landmarks' );
	const diagram = element( landmarks, 'div', '', 'stream-topic-diagram' );
	const canvas = element( diagram, 'canvas' );
	canvas.setAttribute( 'aria-hidden', 'true' );
	const point = select( landmarks, 'Landmark' );
	const axes = element( landmarks, 'div', '', 'stream-topic-axes' );
	let field, options, anchor;
	let shown = 80;

	function choose( topic ) {

		field.value = topic;
		field.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		dialog.close();

	}

	function renderChannels() {

		const terms = search.value.toLowerCase().trim().split( /\s+/ );
		const matches = options.filter( option => ( source.value === '*' || option.source === source.value ) &&
			terms.every( term => option.search.includes( term ) ) );
		results.replaceChildren();
		for ( const option of matches.slice( 0, shown ) ) {

			const button = action( results, '', () => choose( option.topic ) );
			button.title = option.topic;
			button.setAttribute( 'aria-pressed', String( option.topic === field.value ) );
			element( button, 'span', option.label );
			if ( option.source ) element( button, 'small', sourceName( option.source ) );
			else if ( option.topic.startsWith( 'vision.' ) ) element( button, 'small', 'Global tracking' );
			const sample = bus.get( option.topic );
			if ( Number.isFinite( sample ) ) element( button, 'small', Number( sample.toPrecision( 4 ) ).toString(), 'stream-topic-value' );

		}
		if ( matches.length === 0 ) element( results, 'p', search.value ? 'No matching channels.' : 'No channels published or saved for this input.' );
		if ( matches.length > shown ) action( results, 'Show more channels (' + ( matches.length - shown ) + ' remaining)', () => {

			const scroll = results.scrollTop;
			const firstNew = shown;
			shown += 80;
			renderChannels();
			results.children[ firstNew ].focus( { preventScroll: true } );
			results.scrollTop = scroll;

		} );

	}

	function renderAxes() {

		const prefix = source.value && source.value !== '*' ? 'input.' + source.value + '.' : '';
		const base = prefix + 'vision.' + mode.value + '.' + point.value + '.';
		axes.replaceChildren();
		for ( const axis of [ 'x', 'y', 'z' ] ) {

			const channel = base + axis;
			const sample = bus.get( channel );
			const label = axis.toUpperCase() + ( Number.isFinite( sample ) ? ' · ' + Number( sample.toPrecision( 4 ) ) : '' );
			const control = action( axes, label, () => choose( channel ) );
			control.title = channel;
			control.setAttribute( 'aria-pressed', String( field.value === channel ) );

		}
		for ( const dot of diagram.querySelectorAll( 'button' ) ) dot.setAttribute( 'aria-pressed', String( dot.dataset.index === point.value ) );

	}

	function renderLandmarks() {

		const { size: [ width, height ], points, links } = landmarkDiagram( mode.value );
		diagram.replaceChildren( canvas );
		diagram.style.aspectRatio = width + ' / ' + height;
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext( '2d' );
		const positions = new Map( points.map( ( [ index, , x, y ] ) => [ index, [ x, y ] ] ) );
		ctx.strokeStyle = getComputedStyle( dialog ).color;
		ctx.globalAlpha = 0.45;
		ctx.lineWidth = 2;
		ctx.beginPath();
		for ( const [ a, b ] of links ) {

			ctx.moveTo( ...positions.get( a ) );
			ctx.lineTo( ...positions.get( b ) );

		}
		ctx.stroke();
		point.replaceChildren( ...points.map( ( [ index, name ] ) => new Option( name + ' (' + index + ')', index ) ) );
		const selected = coordinate.exec( topicParts( field.value ).channel );
		if ( selected?.[ 1 ] === mode.value ) {

			if ( ! positions.has( Number( selected[ 2 ] ) ) ) point.add( new Option( 'Landmark ' + selected[ 2 ], selected[ 2 ] ) );
			point.value = selected[ 2 ];

		}

		for ( const [ index, name, x, y ] of points ) {

			const dot = action( diagram, '', () => { point.value = String( index ); renderAxes(); } );
			dot.title = name;
			dot.setAttribute( 'aria-label', name );
			dot.tabIndex = - 1;
			dot.dataset.index = index;
			dot.style.left = x / width * 100 + '%';
			dot.style.top = y / height * 100 + '%';

		}
		renderAxes();

	}

	function resetChannels() {

		shown = 80;
		renderChannels();
		results.scrollTop = 0;

	}

	function render() {

		channels.hidden = Boolean( mode.value );
		landmarks.hidden = ! mode.value;
		source.options[ 0 ].disabled = Boolean( mode.value );
		if ( mode.value ) {

			if ( source.value === '*' ) source.value = '';
			renderLandmarks();

		} else resetChannels();

	}

	source.onchange = () => { if ( mode.value ) renderAxes(); else resetChannels(); };
	mode.onchange = render;
	search.oninput = resetChannels;
	point.onchange = renderAxes;
	dialog.addEventListener( 'close', () => { if ( ! dialog.open ) { dialog.remove(); anchor.focus(); } } );

	return ( target, opener, numeric ) => {

		field = target;
		anchor = opener;
		const topics = new Set( [ ...bus.topics(), ...savedTopics(), field.value.trim() ].filter( Boolean ) );
		options = [];
		for ( const topic of topics ) {

			const { source, channel } = topicParts( topic );
			const sample = bus.get( topic );
			if ( numeric && sample !== undefined && ! Number.isFinite( sample ) && topic !== field.value.trim() ) continue;
			const label = channelLabel( channel );
			options.push( { topic, source, label, search: ( topic + ' ' + label + ' ' + sourceName( source ) ).toLowerCase() } );

		}
		options.sort( ( a, b ) => a.label.localeCompare( b.label, undefined, { numeric: true } ) );
		const selected = topicParts( field.value.trim() );
		const sources = new Set( inputIds() );
		for ( const topic of topics ) {

			const { source: id } = topicParts( topic );
			if ( id ) sources.add( id );

		}
		source.replaceChildren( new Option( 'All inputs & topics', '*' ), new Option( 'Global topics', '' ),
			...Array.from( sources, id => new Option( sourceName( id ), id ) ) );
		source.value = selected.source || '*';
		search.value = '';
		const landmark = coordinate.exec( selected.channel );
		mode.value = landmark?.[ 1 ] || '';
		if ( landmark ) source.value = selected.source;
		document.body.append( dialog );
		dialog.showModal();
		render();
		( mode.value ? point : search ).focus();

	};

}

export function streamTopicLabel( topic, sourceName ) {

	const { source, channel } = topicParts( topic );
	return [ source && sourceName( source ), channelLabel( channel ) ].filter( Boolean ).join( ' · ' );

}
