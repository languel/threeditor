import { addNode, connectNodes, disconnectInput, indexGraph, removeNode } from './NodeGraph.js';

const PORT_COLORS = {
	geometry: '#59c6a1', number: '#91a8ff', field: '#70baff', color: '#f3bd72', vec2: '#d2a6ef', vec3: '#b799ed',
	boolean: '#f792a5', string: '#8cdbd1', object: '#efdb8b', event: '#ffad73'
};
const portColor = type => Object.hasOwn( PORT_COLORS, type ) ? PORT_COLORS[ type ] : '#b0a8c6';

function element( tag, className, parent, text ) {

	const node = document.createElement( tag );
	node.className = className;
	if ( text ) node.textContent = text;
	parent.append( node );
	return node;

}

export function NodeGraphEditor( rootDomain, { onChange, onError, inputOptions } ) {

	const dom = document.createElement( 'div' );
	dom.className = 'node-graph';
	const toolbar = element( 'div', 'node-graph-toolbar', dom );
	const back = element( 'button', 'Button', toolbar, 'Back to parent' );
	back.type = 'button';
	back.hidden = true;
	const scopeLabel = element( 'span', 'node-graph-scope', toolbar );
	scopeLabel.hidden = true;
	const palette = element( 'select', 'Select', toolbar );
	palette.setAttribute( 'aria-label', 'Add node' );
	const remove = element( 'button', 'Button', toolbar, 'Delete node' );
	const frame = element( 'button', 'Button', toolbar, 'Frame all' );
	remove.type = frame.type = 'button';
	const board = element( 'div', 'node-graph-board', dom );
	board.tabIndex = 0;
	const wires = element( 'canvas', 'node-graph-wires', board );
	wires.setAttribute( 'aria-hidden', 'true' );
	const world = element( 'div', 'node-graph-world', board );
	const context = wires.getContext( '2d' );
	const view = { x: 0, y: 0, scale: 1 };
	let root, graph, domain, editable, selected, armed, gesture, needsFrame;
	const scopePath = [];
	const cards = new Map();
	const socketButtons = new WeakMap();

	function selectScope( resetView ) {

		graph = root;
		let nextDomain = rootDomain;
		for ( let i = 0; i < scopePath.length; i ++ ) {

			const node = graph?.nodes.find( item => item.id === scopePath[ i ] );
			const body = nextDomain.nodes.get( node?.type )?.bodyDomain?.();
			if ( ! body || ! node.body ) {

				// An undo step can remove a zone while its body is open.
				scopePath.length = i;
				resetView = true;
				break;

			}
			graph = node.body;
			nextDomain = body;

		}
		if ( domain !== nextDomain ) {

			domain = nextDomain;
			palette.replaceChildren( new Option( 'Add node…', '' ) );
			const groups = new Map();
			for ( const [ type, def ] of domain.nodes ) {

				if ( def.fixed ) continue;
				if ( ! groups.has( def.category ) ) {

					const group = element( 'optgroup', '', palette );
					group.label = def.category;
					groups.set( def.category, group );

				}
				groups.get( def.category ).append( new Option( def.label, type ) );

			}
			board.setAttribute( 'aria-label', domain.label + ' canvas' );

		}
		back.hidden = scopeLabel.hidden = scopePath.length === 0;
		scopeLabel.textContent = scopePath.length ? domain.label : '';
		if ( resetView ) {

			selected = null;
			needsFrame = true;

		}
		gesture = null;
		render();

	}

	back.onclick = () => {

		const node = scopePath.pop();
		selectScope( true );
		select( cards.has( node ) ? node : null );
		board.focus( { preventScroll: true } );

	};

	function point( event ) {

		const rect = board.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };

	}

	function portCenter( endpoint, direction, rect ) {

		const socket = cards.get( endpoint.node )?.[ direction ].get( endpoint.socket );
		if ( ! socket ) return;
		const bounds = socket.getBoundingClientRect();
		return { x: bounds.left - rect.left + bounds.width / 2, y: bounds.top - rect.top + bounds.height / 2 };

	}

	function drawWires() {

		const rect = board.getBoundingClientRect();
		const dpr = window.devicePixelRatio;
		const width = Math.round( rect.width * dpr );
		const height = Math.round( rect.height * dpr );
		if ( wires.width !== width || wires.height !== height ) {

			wires.width = width;
			wires.height = height;

		}
		context.setTransform( dpr, 0, 0, dpr, 0, 0 );
		context.clearRect( 0, 0, rect.width, rect.height );
		function wire( from, to, type, pending = false ) {

			if ( ! from || ! to ) return;
			const bend = Math.max( 26, Math.abs( to.x - from.x ) * .5 );
			context.beginPath();
			context.moveTo( from.x, from.y );
			context.bezierCurveTo( from.x + bend, from.y, to.x - bend, to.y, to.x, to.y );
			context.strokeStyle = portColor( type );
			context.lineWidth = pending ? 2.5 : 2;
			context.setLineDash( pending ? [ 5, 4 ] : [] );
			context.stroke();

		}
		for ( const { from, to } of graph?.links || [] ) {

			const output = portCenter( from, 'output', rect );
			const input = portCenter( to, 'input', rect );
			wire( output, input, cards.get( from.node )?.output.get( from.socket )?.dataset.type );

		}
		if ( gesture?.port && gesture.moved ) {

			const { port, pointer } = gesture;
			const start = portCenter( port, port.direction, rect );
			wire( port.direction === 'output' ? start : pointer, port.direction === 'input' ? start : pointer, port.type, true );

		}

	}

	function updateView() {

		world.style.transform = 'translate(' + view.x + 'px, ' + view.y + 'px) scale(' + view.scale + ')';
		board.style.backgroundPosition = view.x + 'px ' + view.y + 'px';
		board.style.backgroundSize = 20 * view.scale + 'px ' + 20 * view.scale + 'px';
		drawWires();

	}

	function frameAll() {

		const { clientWidth: width, clientHeight: height } = board;
		if ( ! graph?.nodes.length || ! width || ! height ) return;
		let left = Infinity, top = Infinity, right = - Infinity, bottom = - Infinity;
		for ( const node of graph.nodes ) {

			const card = cards.get( node.id ).dom;
			left = Math.min( left, node.x );
			top = Math.min( top, node.y );
			right = Math.max( right, node.x + card.offsetWidth );
			bottom = Math.max( bottom, node.y + card.offsetHeight );

		}
		view.scale = Math.min( 1, Math.max( .2, Math.min( ( width - 38 ) / ( right - left ), ( height - 38 ) / ( bottom - top ) ) ) );
		view.x = ( width - ( right + left ) * view.scale ) / 2;
		view.y = ( height - ( bottom + top ) * view.scale ) / 2;
		needsFrame = false;
		updateView();

	}

	function select( id ) {

		selected = id;
		for ( const [ key, card ] of cards ) card.dom.classList.toggle( 'is-selected', key === id );
		remove.disabled = ! editable || ! id || domain.nodes.get( cards.get( id ).node.type ).fixed === true;

	}

	function arm( port ) {

		armed = port;
		for ( const card of cards.values() ) for ( const direction of [ 'input', 'output' ] ) {

			for ( const button of card[ direction ].values() ) {

				const socket = socketButtons.get( button );
				button.setAttribute( 'aria-pressed', String( socket === port ) );
				button.classList.toggle( 'is-compatible', !! port && socket.direction !== port.direction && socket.type === port.type );

			}

		}

	}

	function edit( mutate, layoutOnly = false ) {

		if ( ! graph || ! editable ) return;
		try {

			const draft = structuredClone( root );
			const scope = scopePath.reduce( ( current, id ) => current.nodes.find( node => node.id === id ).body, draft );
			mutate( scope );
			onChange( draft, layoutOnly );

		} catch ( error ) {

			render();
			onError( error.message );

		}

	}

	function connect( first, second ) {

		arm( null );
		if ( first.direction === second.direction ) return;
		const endpoint = ( { node, socket } ) => ( { node, socket } );
		const [ from, to ] = first.direction === 'output' ? [ first, second ] : [ second, first ];
		edit( draft => connectNodes( draft, domain, endpoint( from ), endpoint( to ) ) );

	}

	function socketRow( card, node, def, name, spec, direction, connected ) {

		const row = element( 'div', 'node-graph-row ' + direction, card.dom );
		const button = element( 'button', 'node-graph-port', row );
		button.type = 'button';
		button.dataset.uiRaw = 'keep';
		button.dataset.type = spec.type;
		button.dataset.focus = [ node.id, direction, name ].join( '/' );
		button.style.setProperty( '--port-color', portColor( spec.type ) );
		button.classList.toggle( 'is-linked', connected );
		button.setAttribute( 'aria-label', def.label + ' / ' + spec.label + ' ' + direction );
		button.title = spec.label + ' · ' + spec.type + ' ' + direction;
		button.disabled = ! editable;
		const port = { node: node.id, socket: name, direction, type: spec.type };
		socketButtons.set( button, port );
		card[ direction ].set( name, button );
		button.onclick = () => {

			select( node.id );
			if ( armed && armed.direction !== direction ) connect( armed, port );
			else arm( armed === port ? null : port );

		};
		element( 'span', 'node-graph-socket-label', row, spec.label );
		if ( direction !== 'input' ) return;
		if ( connected ) {

			const unlink = element( 'button', 'node-graph-unlink', row, '×' );
			unlink.type = 'button';
			unlink.dataset.uiRaw = 'keep';
			unlink.title = 'Disconnect ' + spec.label;
			unlink.setAttribute( 'aria-label', 'Disconnect ' + def.label + ' / ' + spec.label );
			unlink.disabled = ! editable;
			unlink.onclick = () => edit( draft => disconnectInput( draft, port ) );

		} else if ( Object.hasOwn( spec, 'default' ) ) {

			const value = node.values[ name ] ?? spec.default;
			const options = inputOptions?.( spec, value );
			const input = element( options ? 'select' : 'input', options ? 'Select' : 'Input', row );
			if ( options ) {

				input.append( ...options.map( ( [ value, label ] ) => new Option( label, value ) ) );

			} else if ( typeof value === 'number' ) {

				input.type = 'number';
				input.step = 'any';
				if ( spec.min !== undefined ) input.min = spec.min;
				if ( spec.max !== undefined ) input.max = spec.max;

			} else if ( spec.type === 'boolean' ) {

				input.type = 'checkbox';
				input.checked = value;

			} else if ( spec.type === 'color' ) {

				input.type = 'color';

			} else if ( spec.maxLength !== undefined ) {

				input.maxLength = spec.maxLength;

			}
			if ( input.type !== 'checkbox' ) input.value = value;
			input.disabled = ! editable;
			input.dataset.focus = [ node.id, 'value', name ].join( '/' );
			input.setAttribute( 'aria-label', def.label + ' / ' + spec.label );
			input.onchange = () => edit( draft => {

				const target = draft.nodes.find( item => item.id === node.id );
				if ( input.type === 'number' ) target.values[ name ] = input.valueAsNumber;
				else if ( input.type === 'checkbox' ) target.values[ name ] = input.checked;
				else target.values[ name ] = input.value;

			} );
			if ( ! options ) input.onkeydown = event => { if ( event.key === 'Enter' ) input.blur(); };

		}

	}

	function render() {

		const focus = dom.contains( document.activeElement ) && document.activeElement.dataset.focus;
		cards.clear();
		world.replaceChildren();
		palette.disabled = ! editable;
		frame.disabled = ! graph;
		if ( graph ) {

			const { inputs } = indexGraph( graph, domain );
			const outputs = new Map();
			for ( const { from } of graph.links ) {

				if ( ! outputs.has( from.node ) ) outputs.set( from.node, new Set() );
				outputs.get( from.node ).add( from.socket );

			}
			for ( const node of graph.nodes ) {

				const def = domain.nodes.get( node.type );
				const dom = element( 'div', 'node-graph-card', world );
				dom.dataset.node = node.id;
				dom.style.left = node.x + 'px';
				dom.style.top = node.y + 'px';
				element( 'div', 'node-graph-card-title', dom, def.label );
				const card = { node, dom, input: new Map(), output: new Map() };
				cards.set( node.id, card );
				for ( const [ name, spec ] of Object.entries( def.outputs || {} ) ) socketRow( card, node, def, name, spec, 'output', outputs.get( node.id )?.has( name ) ?? false );
				for ( const [ name, spec ] of Object.entries( def.inputs || {} ) ) socketRow( card, node, def, name, spec, 'input', inputs.get( node.id ).has( name ) );
				if ( def.bodyDomain && node.body ) {

					const body = element( 'button', 'Button node-graph-open-body', dom, 'Open body' );
					body.type = 'button';
					body.setAttribute( 'aria-label', 'Open ' + def.label + ' body' );
					body.onclick = () => {

						scopePath.push( node.id );
						selectScope( true );
						back.focus( { preventScroll: true } );

					};

				}

			}

		}
		select( cards.has( selected ) ? selected : null );
		arm( null );
		if ( focus ) {

			const next = [ ...world.querySelectorAll( '[data-focus]' ) ].find( control => control.dataset.focus === focus );
			( next && ! next.disabled ? next : board ).focus( { preventScroll: true } );

		}
		if ( needsFrame ) frameAll();
		updateView();

	}

	palette.onchange = () => {

		const type = palette.value;
		palette.value = '';
		if ( ! type ) return;
		edit( draft => {

			const x = ( board.clientWidth / 2 - view.x ) / view.scale - 90;
			let y = ( board.clientHeight / 2 - view.y ) / view.scale - 40;
			for ( const { node, dom } of cards.values() ) {

				if ( x <= node.x + dom.offsetWidth + 16 && x + dom.offsetWidth + 16 >= node.x ) {

					y = Math.max( y, node.y + dom.offsetHeight + 18 );

				}

			}
			selected = addNode( draft, type, Math.round( x ), Math.round( y ), domain ).id;

		} );
		const card = cards.get( selected );
		if ( card ) {

			const limit = board.clientHeight - 16 - Math.min( card.dom.offsetHeight * view.scale, board.clientHeight - 32 );
			view.y = Math.min( view.y, limit - card.node.y * view.scale );
			updateView();

		}

	};
	function deleteSelected() {

		if ( ! remove.disabled ) edit( draft => removeNode( draft, selected ) );

	}
	remove.onclick = deleteSelected;
	frame.onclick = frameAll;
	board.addEventListener( 'focusin', event => {

		const id = event.target.closest( '.node-graph-card' )?.dataset.node;
		if ( id ) select( id );

	} );
	board.addEventListener( 'keydown', event => {

		if ( event.key === 'Escape' && armed ) arm( null );
		if ( ( event.key === 'Delete' || event.key === 'Backspace' ) && ! event.target.closest( 'input, select' ) ) {

			event.preventDefault();
			if ( ! gesture ) deleteSelected();

		}

	} );
	board.addEventListener( 'wheel', event => {

		if ( event.target.closest( 'input, select' ) ) return;
		event.preventDefault();
		const p = point( event );
		const scale = Math.max( .2, Math.min( 2, view.scale * Math.exp( - event.deltaY * .002 ) ) );
		view.x = p.x - ( p.x - view.x ) * scale / view.scale;
		view.y = p.y - ( p.y - view.y ) * scale / view.scale;
		view.scale = scale;
		updateView();

	}, { passive: false } );
	board.addEventListener( 'pointerdown', event => {

		if ( ! graph || gesture || ( event.button !== 0 && event.button !== 1 ) ) return;
		const card = cards.get( event.target.closest( '.node-graph-card' )?.dataset.node );
		const port = socketButtons.get( event.target.closest( '.node-graph-port' ) );
		const pan = event.button === 1 || ! card;
		const dragNode = !! card && editable && !! event.target.closest( '.node-graph-card-title' );
		if ( event.button === 0 ) select( card?.node.id );
		if ( ! pan && ! dragNode && ( ! port || ! editable ) ) return;
		if ( pan || dragNode ) {

			event.preventDefault();
			board.focus( { preventScroll: true } );
			arm( null );

		}
		gesture = { pointer: point( event ), x: view.x, y: view.y, id: event.pointerId, pan, card, port: pan ? null : port };
		gesture.start = gesture.pointer;
		if ( pan || dragNode ) board.setPointerCapture( event.pointerId );

	} );
	board.addEventListener( 'pointermove', event => {

		if ( gesture?.id !== event.pointerId ) return;
		const p = gesture.pointer = point( event );
		const dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
		if ( ! gesture.moved && Math.hypot( dx, dy ) < 4 ) return;
		if ( ! gesture.moved ) board.setPointerCapture( event.pointerId );
		gesture.moved = true;
		if ( gesture.pan ) {

			view.x = gesture.x + dx;
			view.y = gesture.y + dy;
			updateView();
			return;

		}
		if ( ! gesture.port ) {

			const { card } = gesture;
			gesture.position = { x: Math.round( card.node.x + dx / view.scale ), y: Math.round( card.node.y + dy / view.scale ) };
			card.dom.style.left = gesture.position.x + 'px';
			card.dom.style.top = gesture.position.y + 'px';

		}
		drawWires();

	} );
	board.addEventListener( 'pointerup', event => {

		if ( gesture?.id !== event.pointerId ) return;
		const { card, port, position, moved } = gesture;
		gesture = null;
		if ( position ) edit( draft => Object.assign( draft.nodes.find( node => node.id === card.node.id ), position ), true );
		if ( port && moved ) {

			const hit = document.elementFromPoint( event.clientX, event.clientY )?.closest( '.node-graph-port' );
			const target = socketButtons.get( hit );
			if ( target ) connect( port, target );
			else arm( null );

		}
		drawWires();

	} );
	function cancelPointer( event ) {

		if ( gesture?.id !== event.pointerId ) return;
		gesture = null;
		render();

	}
	board.addEventListener( 'pointercancel', cancelPointer );
	board.addEventListener( 'lostpointercapture', cancelPointer );
	board.addEventListener( 'pointerleave', event => {

		if ( ! board.hasPointerCapture( event.pointerId ) ) cancelPointer( event );

	} );
	const resize = new ResizeObserver( () => { if ( needsFrame ) frameAll(); else drawWires(); } );
	resize.observe( board );
	return {
		dom,
		setGraph( next, canEdit, resetView ) {

			root = next;
			editable = canEdit;
			if ( resetView ) scopePath.length = 0;
			selectScope( resetView );

		},
		dispose: () => resize.disconnect()
	};

}
