import { TSL } from 'three/webgpu';
import { SetMaterialValueCommand } from '../commands/SetMaterialValueCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { bindGraphHistory } from './GraphWorkspace.js';
import { NodeGraphEditor } from './NodeGraphEditor.js';
import { compileShaderGraph, createShaderGraph, SHADER_DOMAIN } from './ShaderNodes.js';

export function openShaderGraph( editor ) {

	const panel = document.createElement( 'div' );
	panel.className = 'node-domain-editor';
	const toolbar = document.createElement( 'div' );
	toolbar.className = 'node-graph-toolbar node-domain-target';
	const title = document.createElement( 'span' );
	const slots = document.createElement( 'select' );
	slots.className = 'Select';
	slots.setAttribute( 'aria-label', 'Shader material slot' );
	function button( label, action ) {

		const button = document.createElement( 'button' );
		button.type = 'button';
		button.className = 'Button';
		button.textContent = label;
		button.onclick = action;
		return button;

	}
	const create = button( 'New shader graph', () => save( createShaderGraph( '#' + material.color.getHexString() ) ) );
	const remove = button( 'Remove shader graph', () => save() );
	const enable = button( 'Use WebGPU', async () => {

		enable.disabled = true;
		try {

			await editor.setProjectRenderer( 'WebGPURenderer' );
			sync();
			if ( ! editor.renderer?.isWebGPURenderer ) report( 'The WebGPU renderer could not start.' );

		} finally {

			enable.disabled = false;

		}

	} );
	toolbar.append( title, slots, create, remove, enable );
	const status = document.createElement( 'div' );
	status.className = 'node-graph-status';
	status.setAttribute( 'role', 'status' );
	const canvas = NodeGraphEditor( SHADER_DOMAIN, { onChange: save, onError: report } );
	panel.append( toolbar, canvas.dom, status );
	let object, material, graph, editable, queued, disposed, validationError;
	let slot = 0;

	function report( message ) {

		status.textContent = message;
		status.classList.add( 'is-error' );

	}

	function save( next, layoutOnly = false ) {

		try {

			if ( ! editable || editor.selected !== object || editor.getObjectMaterial( object, slot ) !== material ) return;
			if ( next && ! layoutOnly ) compileShaderGraph( TSL, next, material );
			const metadata = { ...material.userData };
			if ( next ) metadata.shaderGraph = next;
			else delete metadata.shaderGraph;
			const cmd = new SetMaterialValueCommand( editor, object, 'userData', metadata, slot );
			cmd.updatable = false;
			editor.execute( cmd, layoutOnly ? 'Move node' : 'Edit shader graph' );
			sync();

		} catch ( error ) {

			report( error.message );
			canvas.setGraph( graph, editable, false );

		}

	}

	function sync() {

		const selected = editor.selected;
		const list = selected?.isMesh ? [ selected.material ].flat() : [];
		if ( object !== selected || slot >= list.length ) slot = 0;
		const next = list[ slot ];
		const supported = !! next?.isMeshStandardMaterial && ! next.isNodeMaterial;
		const nextGraph = supported ? next.userData?.shaderGraph : undefined;
		const canEdit = supported && ! hasRestriction( selected, 'locked' ) && ! hasRestriction( selected, 'disabled' );
		const resetView = selected !== object || next !== material;
		const changed = resetView || nextGraph !== graph || editable !== canEdit;
		object = selected;
		material = next;
		graph = nextGraph;
		editable = canEdit;
		if ( resetView || slots.options.length !== list.length ) {

			slots.replaceChildren( ...list.map( ( item, i ) => new Option( item?.name || 'Slot ' + ( i + 1 ), i ) ) );

		}
		slots.value = String( slot );
		slots.hidden = list.length < 2;
		title.textContent = material?.name || object?.name || 'Material';
		create.hidden = ! supported || !! graph;
		remove.hidden = ! graph;
		create.disabled = remove.disabled = ! canEdit;
		enable.hidden = !! editor.renderer?.isWebGPURenderer;
		canvas.dom.hidden = ! graph;
		status.classList.remove( 'is-error' );
		if ( changed ) {

			validationError = '';
			try {

				canvas.setGraph( graph, editable, resetView );
				if ( graph ) validationError = compileShaderGraph( TSL, graph, material ).missing || '';

			} catch ( error ) {

				validationError = error.message;

			}

		}
		if ( validationError ) report( validationError );
		else if ( ! supported ) status.textContent = 'Select a mesh with a Standard or Physical material.';
		else if ( ! editable ) status.textContent = 'This mesh is locked or disabled.';
		else if ( ! graph ) status.textContent = 'Create a graph for this material.';
		else if ( ! editor.renderer?.isWebGPURenderer ) status.textContent = 'Use WebGPU to preview shader nodes.';
		else status.textContent = 'Connect a node to Material Output to shade the selected material.';

	}

	slots.onchange = () => { slot = Number( slots.value ); sync(); };
	bindGraphHistory( editor, panel );
	function queueSync() {

		if ( queued ) return;
		queued = true;
		queueMicrotask( () => { queued = false; if ( ! disposed ) sync(); } );

	}
	const signals = [ 'objectSelected', 'objectChanged', 'materialChanged', 'rendererUpdated' ].map( key => editor.signals[ key ] );
	for ( const signal of signals ) signal.add( queueSync );
	sync();
	editor.editWorkspace.mount( 'shader', null, panel, () => {

		disposed = true;
		for ( const signal of signals ) signal.remove( queueSync );
		canvas.dispose();

	} );
	if ( ! [ 'materials', 'preview' ].includes( editor.viewportShading ) ) editor.setViewportShading( 'materials' );

}
