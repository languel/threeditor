import { createGeometryGraph, GEOMETRY_DOMAIN, GEOMETRY_MODIFIER, hasSimulation, planGeometryGraph } from './GeometryNodes.js';
import { NodeGraphEditor } from './NodeGraphEditor.js';
import { canModify, createModifier, setModifierStack } from '../modeling/Modifiers.js?v=poly-context';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { bindGraphHistory } from './GraphWorkspace.js';
import { nodeComponentData, supportsNodeComponents } from './NodeComponents.js';

export function addGeometryGraph( editor, object, blank ) {

	if ( object.isMesh && canModify( object ) && ! object.userData.modelReference ) {

		const modifier = createModifier( GEOMETRY_MODIFIER );
		if ( blank ) modifier.params.graph = createGeometryGraph( true );
		setModifierStack( editor, object, [ ...( object.userData.modifiers || [] ), modifier ], undefined, 'Add geometry nodes' );
		return modifier.id;

	}
	const command = new SetValueCommand( editor, object, 'userData', nodeComponentData( object, 'geometry', createGeometryGraph( blank ) ) );
	command.updatable = false;
	editor.execute( command, 'Add geometry nodes' );

}

export function openGeometryNodes( editor ) {

	const panel = document.createElement( 'div' );
	panel.className = 'node-domain-editor';
	const controls = document.createElement( 'div' );
	controls.className = 'node-graph-toolbar node-domain-target';
	const target = document.createElement( 'span' );
	const choose = document.createElement( 'select' );
	choose.className = 'Select';
	choose.setAttribute( 'aria-label', 'Geometry Nodes modifier' );
	const create = document.createElement( 'button' );
	create.type = 'button';
	create.className = 'Button';
	create.textContent = 'New graph';
	const blank = create.cloneNode();
	blank.textContent = 'New blank graph';
	const remove = create.cloneNode();
	remove.textContent = 'Remove graph';
	controls.append( target, choose, create, blank, remove );
	const status = document.createElement( 'div' );
	status.className = 'node-graph-status';
	status.setAttribute( 'role', 'status' );
	let object, modifier, component, canEdit, queued, closed;
	const graphEditor = NodeGraphEditor( GEOMETRY_DOMAIN, { onChange: save, onError: error } );
	panel.append( controls, graphEditor.dom, status );

	function error( message ) {

		status.textContent = message;
		status.classList.add( 'is-error' );

	}

	function save( graph, layoutOnly ) {

		if ( editor.selected !== object || ! canEdit || hasRestriction( object, 'locked' ) ||
			hasRestriction( object, 'disabled' ) ) return;
		if ( component ) {

			if ( graph ) planGeometryGraph( graph );
			const command = new SetValueCommand( editor, object, 'userData', nodeComponentData( object, 'geometry', graph ) );
			command.updatable = false;
			editor.execute( command, layoutOnly ? 'Move node' : graph ? 'Edit geometry nodes' : 'Remove geometry nodes' );
			sync();
			return;

		}
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
		const supported = supportsNodeComponents( editor.scene, selected );
		const locked = hasRestriction( selected, 'locked' ) || hasRestriction( selected, 'disabled' );
		const graphs = supported ? ( selected.userData.modifiers || [] ).filter( item => item.type === GEOMETRY_MODIFIER ) : [];
		const next = graphs.find( item => item.id === preferred ) || graphs[ 0 ];
		const nextComponent = supported ? selected.userData.nodeComponents?.geometry : undefined;
		const resetView = object !== selected || modifier?.id !== next?.id;
		const editable = supported && ! locked;
		const changed = resetView || next !== modifier || nextComponent !== component || canEdit !== editable;
		object = selected;
		modifier = next;
		component = nextComponent;
		canEdit = editable;
		target.textContent = supported ? selected.name || selected.type : 'No object selected';
		target.title = target.textContent;
		create.hidden = blank.hidden = ! supported || !! ( next || component );
		remove.hidden = ! component;
		create.disabled = blank.disabled = remove.disabled = ! canEdit;
		choose.hidden = graphs.length < 2;
		choose.replaceChildren( ...graphs.map( ( item, i ) => new Option( item.name + ' ' + ( i + 1 ), item.id ) ) );
		choose.value = next?.id || '';
		if ( ! changed ) return;

		status.classList.remove( 'is-error' );
		const graph = component || next?.params.graph;
		graphEditor.dom.hidden = ! graph;
		try {

			const plan = graph && planGeometryGraph( graph );
			graphEditor.setGraph( graph, canEdit, resetView );
			const problem = component && editor.nodeComponentRuntime.error( object );
			if ( problem ) error( problem );
			else if ( locked && supported ) status.textContent = 'This object is locked or disabled.';
			else if ( ! graph ) status.textContent = supported ? 'Choose a host input or start with a blank graph.' : 'Select a scene object to attach a geometry graph.';
			else if ( next?.enabled === false && ! component ) status.textContent = 'This modifier is disabled.';
			else if ( plan.missing ) status.textContent = plan.missing;
			else if ( hasSimulation( plan ) ) status.textContent = 'Play Scene to run the simulation.';
			else status.textContent = 'Drag between sockets or click a socket at each end.';

		} catch ( problem ) {

			graphEditor.setGraph( null, false, true );
			graphEditor.dom.hidden = true;
			error( problem.message );

		}

	}

	function createGraph( blank ) {

		if ( ! canEdit || object !== editor.selected ) return;
		try {

			sync( addGeometryGraph( editor, object, blank ) );

		} catch ( problem ) {

			error( problem.message );

		}

	}
	create.onclick = () => createGraph( false );
	blank.onclick = () => createGraph( true );
	remove.onclick = () => save();
	choose.onchange = () => sync( choose.value );
	bindGraphHistory( editor, panel );
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
