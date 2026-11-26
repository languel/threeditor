import { SetValueCommand } from '../commands/SetValueCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { bindGraphHistory } from './GraphWorkspace.js';
import { NodeGraphEditor } from './NodeGraphEditor.js';
import { createLogicGraph, LOGIC_DOMAIN, planLogicGraph } from './LogicNodes.js';

export function openLogicNodes( editor ) {

	const panel = document.createElement( 'div' );
	panel.className = 'node-domain-editor';
	const toolbar = document.createElement( 'div' );
	toolbar.className = 'node-graph-toolbar node-domain-target';
	const title = document.createElement( 'span' );
	const create = document.createElement( 'button' );
	create.type = 'button';
	create.className = 'Button';
	create.textContent = 'New logic graph';
	create.onclick = () => commit( createLogicGraph() );
	const remove = document.createElement( 'button' );
	remove.type = 'button';
	remove.className = 'Button';
	remove.textContent = 'Remove logic graph';
	remove.onclick = () => commit();
	toolbar.append( title, create, remove );
	const status = document.createElement( 'div' );
	status.className = 'node-graph-status';
	status.setAttribute( 'role', 'status' );
	const view = NodeGraphEditor( LOGIC_DOMAIN, { onChange: commit, onError: report, inputOptions } );
	panel.append( toolbar, view.dom, status );
	let object, graph, editable, references = [], referenceKey, queued, disposed, invalid;

	function inputOptions( spec, value ) {

		if ( spec.type !== 'object' ) return;
		const choices = [ [ '', 'Self' ], ...references ];
		if ( value && ! choices.some( ( [ id ] ) => id === value ) ) choices.push( [ value, 'Missing object' ] );
		return choices;

	}

	function report( message ) {

		status.classList.add( 'is-error' );
		status.textContent = message;

	}

	function commit( next, layoutOnly = false ) {

		try {

			if ( ! editable || object !== editor.selected || hasRestriction( object, 'locked' ) || hasRestriction( object, 'disabled' ) ) return;
			if ( next && ! layoutOnly ) planLogicGraph( next );
			const metadata = { ...object.userData };
			if ( next ) metadata.logicGraph = next;
			else delete metadata.logicGraph;
			const command = new SetValueCommand( editor, object, 'userData', metadata );
			command.updatable = false;
			editor.execute( command, layoutOnly ? 'Move node' : 'Edit logic graph' );
			sync();

		} catch ( error ) {

			view.setGraph( graph, editable, false );
			report( error.message );

		}

	}

	function sync() {

		const selected = editor.selected;
		const supported = !! selected && ! selected.userData.runtimeOnly && editor.scene.getObjectById( selected.id ) === selected;
		const next = supported ? selected.userData.logicGraph : undefined;
		const canEdit = supported && ! hasRestriction( selected, 'locked' ) && ! hasRestriction( selected, 'disabled' );
		const reset = object !== selected;
		const options = [];
		if ( next ) editor.scene.traverse( target => {

			if ( target !== selected && ! target.userData.runtimeOnly ) options.push( [ target.uuid, target.name || target.type ] );

		} );
		const key = JSON.stringify( options );
		const changed = reset || next !== graph || canEdit !== editable || key !== referenceKey;
		object = selected;
		graph = next;
		editable = canEdit;
		references = options;
		referenceKey = key;
		title.textContent = supported ? selected.name || selected.type : 'Logic owner';
		create.hidden = ! supported || !! graph;
		remove.hidden = ! graph;
		create.disabled = remove.disabled = ! editable;
		view.dom.hidden = ! graph;
		status.classList.remove( 'is-error' );
		if ( changed ) {

			invalid = '';
			try {

				if ( graph ) planLogicGraph( graph );
				view.setGraph( graph, editable, reset );

			} catch ( error ) {

				view.setGraph( null, false, true );
				invalid = error.message;

			}

		}
		if ( invalid ) report( invalid );
		else if ( ! supported ) status.textContent = 'Select a scene object or the Scene to attach a logic graph.';
		else if ( ! editable ) status.textContent = 'This object is locked or disabled.';
		else if ( ! graph ) status.textContent = 'Create a graph for this object.';
		else status.textContent = 'Connect an event to an action and choose Play Scene to run it.';

	}

	function queueSync() {

		if ( queued ) return;
		queued = true;
		queueMicrotask( () => { queued = false; if ( ! disposed ) sync(); } );

	}
	const signals = [ 'objectSelected', 'objectChanged', 'sceneGraphChanged' ].map( key => editor.signals[ key ] );
	for ( const signal of signals ) signal.add( queueSync );
	bindGraphHistory( editor, panel );
	sync();
	editor.editWorkspace.mount( 'logic', null, panel, () => {

		disposed = true;
		for ( const signal of signals ) signal.remove( queueSync );
		view.dispose();

	} );

}
