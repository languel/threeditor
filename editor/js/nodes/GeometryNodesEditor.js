import { GEOMETRY_DOMAIN, GEOMETRY_MODIFIER, hasSimulation, planGeometryGraph } from './GeometryNodes.js';
import { NodeGraphEditor } from './NodeGraphEditor.js';
import { canModify, createModifier, setModifierStack } from '../modeling/Modifiers.js?v=poly-context';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { comboFromEvent } from '../Keymap.js?v=transform-gizmos';

export function openGeometryNodes( editor ) {

	const panel = document.createElement( 'div' );
	panel.className = 'geometry-nodes-editor';
	const controls = document.createElement( 'div' );
	controls.className = 'node-graph-toolbar geometry-nodes-target';
	const target = document.createElement( 'span' );
	const choose = document.createElement( 'select' );
	choose.className = 'Select';
	choose.setAttribute( 'aria-label', 'Geometry Nodes modifier' );
	const create = document.createElement( 'button' );
	create.type = 'button';
	create.className = 'Button';
	create.textContent = 'New graph';
	controls.append( target, choose, create );
	const status = document.createElement( 'div' );
	status.className = 'node-graph-status';
	status.setAttribute( 'role', 'status' );
	let object, modifier, canEdit, queued, closed;
	const graphEditor = NodeGraphEditor( GEOMETRY_DOMAIN, { onChange: save, onError: error } );
	panel.append( controls, graphEditor.dom, status );

	function error( message ) {

		status.textContent = message;
		status.classList.add( 'is-error' );

	}

	function save( graph, layoutOnly ) {

		if ( editor.selected !== object || ! canEdit || hasRestriction( object, 'locked' ) ||
			hasRestriction( object, 'disabled' ) ) return;
		const stack = object.userData.modifiers;
		if ( ! stack.includes( modifier ) ) return;
		planGeometryGraph( graph );
		const next = stack.map( item => item === modifier ? { ...item, params: { ...item.params, graph } } : item );
		if ( layoutOnly ) {

			const command = new SetValueCommand( editor, object, 'userData', { ...object.userData, modifiers: next } );
			command.updatable = false;
			editor.execute( command, 'Move node' );

		} else {

			setModifierStack( editor, object, next, undefined, 'Edit geometry nodes' );

		}
		sync( modifier.id );

	}

	function sync( preferred = modifier?.id ) {

		const selected = editor.selected;
		const supported = !! selected?.isMesh && canModify( selected );
		const locked = hasRestriction( selected, 'locked' ) || hasRestriction( selected, 'disabled' );
		const graphs = supported ? ( selected.userData.modifiers || [] ).filter( item => item.type === GEOMETRY_MODIFIER ) : [];
		const next = graphs.find( item => item.id === preferred ) || graphs[ 0 ];
		const resetView = object !== selected || modifier?.id !== next?.id;
		const editable = supported && ! locked;
		const changed = resetView || next !== modifier || canEdit !== editable;
		object = selected;
		modifier = next;
		canEdit = editable;
		target.textContent = supported ? selected.name || selected.type : 'No editable mesh selected';
		target.title = target.textContent;
		create.hidden = ! supported || !! next;
		create.disabled = ! canEdit;
		choose.hidden = graphs.length < 2;
		choose.replaceChildren( ...graphs.map( ( item, i ) => new Option( item.name + ' ' + ( i + 1 ), item.id ) ) );
		choose.value = next?.id || '';
		if ( ! changed ) return;

		status.classList.remove( 'is-error' );
		graphEditor.dom.hidden = ! next;
		try {

			const graph = next?.params.graph;
			const plan = next && planGeometryGraph( graph );
			graphEditor.setGraph( graph, canEdit, resetView );
			if ( locked && supported ) status.textContent = 'This mesh is locked or disabled.';
			else if ( ! next ) status.textContent = supported ? 'Create a graph to process this mesh.' : 'Select a mesh to start a geometry graph.';
			else if ( ! next.enabled ) status.textContent = 'This modifier is disabled.';
			else if ( plan.missing ) status.textContent = plan.missing + ' Showing modifier input.';
			else if ( hasSimulation( plan ) ) status.textContent = 'Play Scene to run the simulation.';
			else status.textContent = 'Drag between sockets or click a socket at each end.';

		} catch ( problem ) {

			graphEditor.setGraph( null, false, true );
			graphEditor.dom.hidden = true;
			error( problem.message );

		}

	}

	create.onclick = () => {

		if ( ! canEdit || object !== editor.selected ) return;
		try {

			const nodeModifier = createModifier( GEOMETRY_MODIFIER );
			setModifierStack( editor, object, [ ...( object.userData.modifiers || [] ), nodeModifier ], undefined, 'Add geometry nodes' );
			sync( nodeModifier.id );

		} catch ( problem ) {

			error( problem.message );

		}

	};
	choose.onchange = () => sync( choose.value );
	panel.addEventListener( 'keydown', event => {

		if ( event.defaultPrevented || event.repeat || event.isComposing || event.target.closest( 'input, select' ) ) return;
		const combo = comboFromEvent( event );
		if ( ! combo ) return;
		if ( combo === editor.keymap.combo( 'undo' ) ) editor.undo();
		else if ( combo === editor.keymap.combo( 'redo' ) ) editor.redo();
		else return;
		event.preventDefault();

	} );
	function scheduleSync() {

		if ( queued ) return;
		queued = true;
		queueMicrotask( () => {

			queued = false;
			if ( ! closed ) sync();

		} );

	}
	const signals = [ 'objectSelected', 'objectChanged', 'geometryChanged' ].map( key => editor.signals[ key ] );
	for ( const signal of signals ) signal.add( scheduleSync );
	editor.geometryNodesEditor = { selectModifier: sync };
	sync();
	editor.editWorkspace.mount( 'nodes', null, panel, () => {

		closed = true;
		delete editor.geometryNodesEditor;
		for ( const signal of signals ) signal.remove( scheduleSync );
		graphEditor.dispose();

	} );

}
