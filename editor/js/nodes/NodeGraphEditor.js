import { addNode, bypassNodes, connectNodes, disconnectInput, indexGraph, removeNode } from './NodeGraph.js';
import { copyNodes, cutsWire, makeLinks, pasteNodes, swapNode, wireBend } from './NodeGraphEdits.js';
import { createNodeCatalog } from './NodeCatalog.js';
import { registerGraphKeyboard } from './GraphKeyboard.js';

let clipboard;

const PORT_COLORS = {
	geometry: '#59c6a1', points: '#83d5bf', instances: '#30dcc6', number: '#91a8ff', field: '#70baff', color: '#f3bd72', vec2: '#d2a6ef', vec3: '#b799ed',
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

export function NodeGraphEditor( rootDomain, { onChange, onError, inputOptions, decorateInput } ) {

	const dom = document.createElement( 'div' );
	dom.className = 'node-graph';
	const toolbar = element( 'div', 'node-graph-toolbar', dom );
	const back = element( 'button', 'Button', toolbar, 'Back to parent' );
	back.type = 'button';
	back.hidden = true;
	const scopeLabel = element( 'span', 'node-graph-scope', toolbar );
	scopeLabel.hidden = true;
	const palette = element( 'button', 'Button', toolbar, 'Add node…' );
	palette.type = 'button';
	palette.setAttribute( 'aria-label', 'Add node' );
	palette.setAttribute( 'aria-haspopup', 'dialog' );
	palette.title = 'Add node (Shift+A)';
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
	let root, graph, domain, editable, armed, gesture, needsFrame, pointer, placement, boxSelect, addAt, addPort, swapId;
	let selected = new Set();
	const scopePath = [];
	const cards = new Map();
	const socketButtons = new WeakMap();
	const catalog = createNodeCatalog( insertNode, () => { if ( board.isConnected ) board.focus( { preventScroll: true } ); } );

	function selectScope( resetView ) {

		placement = undefined;
		board.removeAttribute( 'data-placing' );
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
			board.setAttribute( 'aria-label', domain.label + ' canvas' );

		}
		back.hidden = scopeLabel.hidden = scopePath.length === 0;
		scopeLabel.textContent = scopePath.length ? domain.label : '';
		if ( resetView ) {

			selected.clear();
			needsFrame = true;

		}
		gesture = null;
		placement = undefined;
		render();

	}

	back.onclick = () => {

		const node = scopePath.pop();
		selectScope( true );
		select( cards.has( node ) ? node : undefined );
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
		function wire( from, to, type, pending = false, muted = false ) {

			if ( ! from || ! to ) return;
			const bend = wireBend( from, to );
			context.beginPath();
			context.moveTo( from.x, from.y );
			context.bezierCurveTo( from.x + bend, from.y, to.x - bend, to.y, to.x, to.y );
			context.strokeStyle = muted ? '#c77777' : portColor( type );
			context.lineWidth = pending ? 2.5 : 2;
			context.setLineDash( pending || muted ? [ 5, 4 ] : [] );
			context.stroke();

		}
		for ( const { from, to, muted } of graph?.links || [] ) {

			const output = portCenter( from, 'output', rect );
			const input = portCenter( to, 'input', rect );
			wire( output, input, cards.get( from.node )?.output.get( from.socket )?.dataset.type, false, muted ||
				cards.get( from.node )?.node.muted || cards.get( to.node )?.node.muted );

		}
		if ( gesture?.stroke ) {

			context.beginPath();
			for ( const p of gesture.stroke ) context.lineTo( p.x, p.y );
			context.strokeStyle = '#f5a593';
			context.lineWidth = 2;
			context.setLineDash( [ 4, 4 ] );
			context.stroke();

		}
		if ( gesture?.box && gesture.moved ) {

			const { start, pointer } = gesture;
			context.setLineDash( [] );
			context.fillStyle = '#92bcff2e';
			context.strokeStyle = '#92bcff';
			context.lineWidth = 1;
			context.fillRect( start.x, start.y, pointer.x - start.x, pointer.y - start.y );
			context.strokeRect( start.x, start.y, pointer.x - start.x, pointer.y - start.y );

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

	function frameAll( onlySelected = false ) {

		const { clientWidth: width, clientHeight: height } = board;
		if ( ! graph?.nodes.length || ! width || ! height ) return;
		let left = Infinity, top = Infinity, right = - Infinity, bottom = - Infinity;
		const nodes = onlySelected ? graph.nodes.filter( node => selected.has( node.id ) ) : graph.nodes;
		if ( ! nodes.length ) return;
		for ( const node of nodes ) {

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

	function drawSelection() {

		for ( const [ key, card ] of cards ) card.dom.classList.toggle( 'is-selected', selected.has( key ) );
		remove.disabled = ! editable || ! [ ...selected ].some( id => ! domain.nodes.get( cards.get( id )?.node.type )?.fixed );

	}

	function select( id, toggle = false ) {

		if ( ! toggle ) selected.clear();
		if ( id && toggle && selected.has( id ) ) selected.delete( id );
		else if ( id ) selected.add( id );
		drawSelection();

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

			if ( ! selected.has( node.id ) ) select( node.id );
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

			if ( spec.maxLength === 256 ) row.classList.add( 'wide-value' );
			const value = node.values[ name ] ?? spec.default;
			const options = spec.options?.map( option => [ option, option ] ) ?? inputOptions?.( spec, value );
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
			decorateInput?.( input, row, spec, def );

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
			const mutedInputs = new Set( graph.links.filter( link => link.muted ).map( link => link.to.node + '\0' + link.to.socket ) );
			const outputs = new Map();
			for ( const { from } of graph.links ) {

				if ( ! outputs.has( from.node ) ) outputs.set( from.node, new Set() );
				outputs.get( from.node ).add( from.socket );

			}
			for ( const node of graph.nodes ) {

				const def = domain.nodes.get( node.type );
				const dom = element( 'div', 'node-graph-card', world );
				dom.dataset.node = node.id;
				dom.classList.toggle( 'is-muted', node.muted === true );
				dom.style.left = node.x + 'px';
				dom.style.top = node.y + 'px';
				element( 'div', 'node-graph-card-title', dom, def.label );
				const card = { node, dom, input: new Map(), output: new Map() };
				cards.set( node.id, card );
				for ( const [ name, spec ] of Object.entries( def.outputs || {} ) ) socketRow( card, node, def, name, spec, 'output', outputs.get( node.id )?.has( name ) ?? false );
				for ( const [ name, spec ] of Object.entries( def.inputs || {} ) ) socketRow( card, node, def, name, spec, 'input',
					inputs.get( node.id ).has( name ) && ! mutedInputs.has( node.id + '\0' + name ) );
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
		selected = new Set( [ ...selected ].filter( id => cards.has( id ) ) );
		drawSelection();
		arm( null );
		if ( focus ) {

			const next = [ ...world.querySelectorAll( '[data-focus]' ) ].find( control => control.dataset.focus === focus );
			( next && ! next.disabled ? next : board ).focus( { preventScroll: true } );

		}
		if ( needsFrame ) frameAll();
		updateView();

	}

	function openCatalog( anchor = pointer, port, replace ) {

		const bounds = board.getBoundingClientRect();
		const trigger = palette.getBoundingClientRect();
		addAt = anchor ?? { x: bounds.width / 2, y: bounds.height / 2 };
		addPort = port;
		swapId = replace;
		catalog.show( domain, anchor ? bounds.left + anchor.x : trigger.left, anchor ? bounds.top + anchor.y : trigger.bottom + 4,
			def => ! port || Object.values( ( port.direction === 'output' ? def.inputs : def.outputs ) || {} ).some( socket => socket.type === port.type ),
			swapId ? 'Swap node' : 'Add node' );

	}

	function insertNode( type ) {

		if ( ! editable || ! graph ) return;
		if ( swapId ) {

			edit( draft => swapNode( draft, domain, swapId, type ) );
			swapId = undefined;
			return;

		}
		try {

			const original = graph, originalSelection = selected;
			const draft = structuredClone( graph );
			const x = ( addAt.x - view.x ) / view.scale;
			const y = ( addAt.y - view.y ) / view.scale;
			const node = addNode( draft, type, Math.round( x ), Math.round( y ), domain );
			if ( addPort ) {

				const output = addPort.direction === 'output';
				const def = domain.nodes.get( type );
				const [ socket ] = Object.entries( ( output ? def.inputs : def.outputs ) || {} ).find( ( [ , spec ] ) => spec.type === addPort.type );
				const existing = { node: addPort.node, socket: addPort.socket };
				const added = { node: node.id, socket };
				connectNodes( draft, domain, output ? existing : added, output ? added : existing );

			}
			graph = draft;
			selected = new Set( [ node.id ] );
			startPlacement( original, originalSelection, true, addAt );

		} catch ( error ) { onError( error.message ); }
		addPort = undefined;

	}

	const removable = () => new Set( [ ...selected ].filter( id => cards.has( id ) && ! domain.nodes.get( cards.get( id ).node.type ).fixed ) );
	function deleteSelected( reconnect = false ) {

		const ids = removable();
		if ( ! ids.size ) return;
		edit( draft => {

			if ( reconnect ) Object.assign( draft, bypassNodes( draft, domain, ids ) );
			else for ( const id of ids ) removeNode( draft, id );

		} );

	}

	function detach( draft, ids ) {

		draft.links = draft.links.filter( link => ! ids.has( link.from.node ) && ! ids.has( link.to.node ) );

	}

	function beginPlacement( copies ) {

		const original = graph;
		const originalSelection = selected;
		if ( copies ) {

			graph = structuredClone( graph );
			selected = pasteNodes( graph, domain, copies, 18, 18 );

		}
		if ( ! selected.size ) {

			graph = original;
			selected = originalSelection;
			return;

		}
		startPlacement( original, originalSelection, !! copies, pointer || { x: board.clientWidth / 2, y: board.clientHeight / 2 } );

	}

	function startPlacement( original, originalSelection, copies, start ) {

		placement = {
			original, originalSelection, copies, start,
			nodes: graph.nodes.filter( node => selected.has( node.id ) )
		};
		board.setAttribute( 'data-placing', '' );
		render();
		board.focus( { preventScroll: true } );

	}

	function moveNodes( nodes, dx, dy ) {

		return nodes.map( node => {

			const x = Math.round( node.x + dx / view.scale ), y = Math.round( node.y + dy / view.scale );
			const card = cards.get( node.id ).dom;
			card.style.left = x + 'px';
			card.style.top = y + 'px';
			return { id: node.id, x, y };

		} );

	}

	function assignPositions( draft, positions ) {

		const byId = new Map( positions.map( position => [ position.id, position ] ) );
		for ( const node of draft.nodes ) if ( byId.has( node.id ) ) Object.assign( node, byId.get( node.id ) );

	}

	function insertionFor( positions ) {

		if ( positions?.length !== 1 ) return;
		const id = positions[ 0 ].id;
		if ( graph.links.some( link => link.from.node === id || link.to.node === id ) ) return;
		const card = cards.get( id );
		const def = domain.nodes.get( card.node.type );
		const boardRect = board.getBoundingClientRect(), rect = card.dom.getBoundingClientRect();
		const x = rect.left - boardRect.left, y = rect.top - boardRect.top;
		const right = x + rect.width, bottom = y + rect.height;
		const outline = [ { x, y }, { x: right, y }, { x: right, y: bottom }, { x, y: bottom }, { x, y } ];
		const inside = point => point.x >= x && point.x <= right && point.y >= y && point.y <= bottom;
		for ( const link of graph.links ) {

			if ( link.muted ) continue;
			const from = portCenter( link.from, 'output', boardRect ), to = portCenter( link.to, 'input', boardRect );
			const type = cards.get( link.from.node )?.output.get( link.from.socket )?.dataset.type;
			const input = Object.entries( def.inputs || {} ).find( ( [ , spec ] ) => spec.type === type );
			const output = Object.entries( def.outputs || {} ).find( ( [ , spec ] ) => spec.type === type );
			if ( input && output && from && to && ( inside( from ) && inside( to ) || cutsWire( outline, from, to ) ) ) {

				return { id, input: input[ 0 ], output: output[ 0 ], link };

			}

		}

	}

	function insertOnWire( draft, { id, input, output, link } ) {

		disconnectInput( draft, link.to );
		connectNodes( draft, domain, link.from, { node: id, socket: input } );
		connectNodes( draft, domain, { node: id, socket: output }, link.to );

	}

	function finishPlacement( confirm ) {

		const { original, originalSelection, copies, positions, nodes } = placement;
		const preview = graph;
		const insertion = confirm && insertionFor( positions ?? ( copies ? nodes : undefined ) );
		placement = undefined;
		board.removeAttribute( 'data-placing' );
		graph = original;
		if ( ! confirm ) {

			selected = originalSelection;
			render();
			return;

		}
		if ( ! copies && ! positions ) return;
		edit( draft => {

			if ( copies ) Object.assign( draft, preview );
			if ( positions ) assignPositions( draft, positions );
			if ( insertion ) insertOnWire( draft, insertion );

		}, ! copies && ! insertion );

	}

	palette.onclick = () => openCatalog( null );
	remove.onclick = () => deleteSelected();
	frame.onclick = () => frameAll();
	board.addEventListener( 'focusin', event => {

		const id = event.target.closest( '.node-graph-card' )?.dataset.node;
		if ( id && ! selected.has( id ) ) select( id );

	} );
	registerGraphKeyboard( dom, event => {

		if ( ! graph ) return false;
		const key = event.key.toLowerCase();
		const mod = event.ctrlKey || event.metaKey;
		if ( placement ) {

			if ( key === 'escape' || key === 'enter' ) finishPlacement( key === 'enter' );
			return true;

		}
		if ( gesture ) {

			if ( key !== 'escape' ) return false;
			gesture = undefined;
			render();
			return true;

		}
		if ( key === 'escape' && ( armed || boxSelect ) ) { arm( null ); boxSelect = false; return true; }
		if ( key === 'home' ) { frameAll(); return true; }
		if ( event.code === 'NumpadDecimal' ) { frameAll( true ); return true; }
		if ( key === 'a' && ! event.shiftKey && ! mod ) {

			selected = new Set( event.altKey ? [] : graph.nodes.map( node => node.id ) );
			drawSelection();
			return true;

		}
		if ( key === 'b' && ! mod ) { boxSelect = true; return true; }
		if ( mod && key === 'c' && selected.size ) { clipboard = copyNodes( graph, selected ); return true; }
		if ( ! editable ) return false;
		if ( ! mod && ( key === 'a' && event.shiftKey || key === 'f3' ) ) openCatalog();
		else if ( key === 'x' || key === 'delete' || key === 'backspace' ) deleteSelected( key === 'x' && mod );
		else if ( ! mod && key === 'g' && selected.size ) beginPlacement();
		else if ( ! mod && key === 'd' && event.shiftKey && removable().size ) beginPlacement( copyNodes( graph, removable() ) );
		else if ( ! mod && key === 's' && event.shiftKey && removable().size === 1 ) openCatalog( undefined, undefined, [ ...removable() ][ 0 ] );
		else if ( mod && key === 'v' && clipboard ) beginPlacement( clipboard );
		else if ( ! mod && ( key === 'j' || key === 'f' ) && selected.size > 1 ) edit( draft => {

			if ( ! makeLinks( draft, domain, selected, event.shiftKey ) ) throw new Error( 'No compatible sockets could be linked.' );

		} );
		else if ( ! mod && key === 'm' && removable().size ) edit( draft => {

			const ids = removable();
			const mute = draft.nodes.some( node => ids.has( node.id ) && ! node.muted );
			for ( const node of draft.nodes ) if ( ids.has( node.id ) ) node.muted = mute;

		} );
		else return false;
		return true;

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
	board.addEventListener( 'contextmenu', event => { if ( event.ctrlKey || placement ) event.preventDefault(); } );
	board.addEventListener( 'pointerdown', event => {

		pointer = point( event );
		if ( placement && ( event.button === 0 || event.button === 2 ) ) {

			event.preventDefault();
			finishPlacement( event.button === 0 );
			return;

		}
		const cutting = editable && event.ctrlKey && event.button === 2;
		if ( ! graph || gesture || ! cutting && event.button !== 0 && event.button !== 1 ) return;
		const card = cards.get( event.target.closest( '.node-graph-card' )?.dataset.node );
		const port = socketButtons.get( event.target.closest( '.node-graph-port' ) );
		const box = boxSelect && event.button === 0;
		boxSelect = false;
		const pan = ! box && ! cutting && ( event.button === 1 || ! card );
		const dragNode = ! box && ! cutting && !! card && editable && !! event.target.closest( '.node-graph-card-title' );
		if ( event.button === 0 && ! box && ( ! card || event.shiftKey || ! selected.has( card.node.id ) ) ) select( card?.node.id, event.shiftKey );
		if ( ! pan && ! dragNode && ! cutting && ! box && ( ! port || ! editable ) ) return;
		const capture = pan || dragNode || cutting || box;
		if ( capture ) {

			event.preventDefault();
			board.focus( { preventScroll: true } );
			arm( null );
			board.setPointerCapture( event.pointerId );

		}
		gesture = {
			pointer, start: pointer, x: view.x, y: view.y, id: event.pointerId, pan, box, extend: event.shiftKey,
			nodes: dragNode ? graph.nodes.filter( node => selected.has( node.id ) ) : [],
			port: capture ? null : port, stroke: cutting ? [ pointer ] : null, mute: event.altKey && cutting,
			moveOutputs: event.ctrlKey && port?.direction === 'output',
			detach: event.altKey && dragNode, captured: capture
		};

	} );
	board.addEventListener( 'pointermove', event => {

		pointer = point( event );
		if ( placement ) {

			placement.positions = moveNodes( placement.nodes, pointer.x - placement.start.x, pointer.y - placement.start.y );
			drawWires();
			return;

		}
		if ( gesture?.id !== event.pointerId ) return;
		const p = gesture.pointer = pointer;
		const dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
		if ( ! gesture.moved && Math.hypot( dx, dy ) < 4 ) return;
		if ( ! gesture.moved && ! gesture.captured ) board.setPointerCapture( event.pointerId );
		gesture.moved = true;
		if ( gesture.pan ) {

			view.x = gesture.x + dx;
			view.y = gesture.y + dy;
			updateView();
			return;

		}
		if ( gesture.nodes.length ) gesture.positions = moveNodes( gesture.nodes, dx, dy );
		if ( gesture.stroke ) {

			const last = gesture.stroke.at( -1 );
			if ( Math.hypot( p.x - last.x, p.y - last.y ) >= 3 ) gesture.stroke.push( p );

		}
		drawWires();

	} );
	board.addEventListener( 'pointerup', event => {

		if ( gesture?.id !== event.pointerId ) return;
		const { port, positions, moved, stroke, mute, detach: detachLinks, box, extend, start, moveOutputs } = gesture;
		gesture = null;
		const end = point( event );
		const insertion = ! detachLinks && insertionFor( positions );
		if ( positions ) edit( draft => {

			assignPositions( draft, positions );
			if ( detachLinks ) detach( draft, selected );
			else if ( insertion ) insertOnWire( draft, insertion );

		}, ! detachLinks && ! insertion );
		if ( stroke && moved ) {

			if ( Math.hypot( end.x - stroke.at( -1 ).x, end.y - stroke.at( -1 ).y ) > 0 ) stroke.push( end );
			const bounds = board.getBoundingClientRect();
			const hit = new Set();
			graph.links.forEach( ( link, i ) => {

				const from = portCenter( link.from, 'output', bounds );
				const to = portCenter( link.to, 'input', bounds );
				if ( from && to && cutsWire( stroke, from, to ) ) hit.add( i );

			} );
			if ( hit.size ) edit( draft => {

				draft.links = mute ? draft.links.map( ( link, i ) => hit.has( i ) ? { ...link, muted: ! link.muted } : link )
					: draft.links.filter( ( _, i ) => ! hit.has( i ) );

			} );

		}
		if ( box ) {

			const bounds = board.getBoundingClientRect();
			if ( ! extend ) selected.clear();
			for ( const [ id, card ] of cards ) {

				const rect = card.dom.getBoundingClientRect();
				if ( rect.right - bounds.left >= Math.min( start.x, end.x ) && rect.left - bounds.left <= Math.max( start.x, end.x ) &&
					rect.bottom - bounds.top >= Math.min( start.y, end.y ) && rect.top - bounds.top <= Math.max( start.y, end.y ) ) selected.add( id );

			}
			drawSelection();

		}
		if ( port && moved ) {

			const hit = document.elementFromPoint( event.clientX, event.clientY );
			const target = socketButtons.get( hit?.closest( '.node-graph-port' ) );
			const source = port.direction === 'input' && graph.links.find( link => link.to.node === port.node && link.to.socket === port.socket );
			if ( target && target !== port && source && target.direction === 'input' ) edit( draft => {

				disconnectInput( draft, port );
				connectNodes( draft, domain, source.from, { node: target.node, socket: target.socket } );

			} );
			else if ( moveOutputs && target?.direction === 'output' && target !== port ) edit( draft => {

				const links = draft.links.filter( link => link.from.node === port.node && link.from.socket === port.socket );
				for ( const link of links ) connectNodes( draft, domain, { node: target.node, socket: target.socket }, link.to );

			} );
			else if ( target ) connect( port, target );
			else if ( source ) {

				edit( draft => disconnectInput( draft, port ) );

			} else if ( hit && board.contains( hit ) && ! hit.closest( '.node-graph-card' ) ) openCatalog( end, port );
			arm( null );

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
		dispose() { catalog.dispose(); resize.disconnect(); }
	};

}
