import { addProjectorTargetControl, openUVEditor } from './modeling/UVEditor.js?v=brush-response';
import { UIPanel } from './libs/ui.js';
import { isProjector } from './assets/Projector.js';
import { canEditLightMask } from './modeling/LightMask.js?v=mask-editor';
import { openMaskEditor } from './modeling/MaskEditor.js?v=brush-response';
import { hasRestriction, isVisible } from './ObjectRestrictions.js';
import { isClosedOutline } from './modeling/ModelGeometry.js?v=top-toolbar';
import { editableMesh } from './modeling/ModelViewport.js?v=brush-response';
import { modelButton, modelField } from './modeling/ModelControls.js?v=tool-layout';

function element( tag, text, parent ) {

	const node = document.createElement( tag );
	if ( text ) node.textContent = text;
	parent?.append( node );
	return node;

}

function field( label, glyph, parent, type, value, change ) {

	const input = modelField( parent, label, glyph, type, value );
	input.onchange = () => change( type === 'checkbox' ? input.checked : input.valueAsNumber );
	return input;

}

export function SidebarModeling( editor ) {

	const panel = new UIPanel();
	panel.dom.className = 'modeling-panel';
	const tools = editor.modeling;
	const status = element( 'p', '', panel.dom );
	status.setAttribute( 'role', 'status' );
	const body = element( 'div', null, panel.dom );
	const run = action => {

		try { status.textContent = ''; action(); }
		catch ( error ) { status.textContent = error.message; }

	};

	function draw() {

		const object = editor.selected;
		body.replaceChildren();
		if ( ! object || hasRestriction( object, 'locked' ) || ! isVisible( object ) ) return;
		if ( canEditLightMask( object ) ) {

			const actions = element( 'div', null, body );
			actions.className = 'modeling-actions';
			modelButton( actions, 'Open 2D mask editor', 'toolMask', () => openMaskEditor( editor, object ) );
			modelButton( actions, 'Pick scene outline', 'toolSelect', () => openMaskEditor( editor, object, true ) );
			if ( isProjector( object ) ) addProjectorTargetControl( editor, object, body, run );
			return;

		}
		if ( ! object.geometry?.userData.modeling && ! editableMesh( object ) ) return;
		if ( editableMesh( object ) ) modelButton( body, 'Edit UVs', 'toolGrid', () => openUVEditor( editor, object ) );
		if ( tools.object !== object ) {

			modelButton( body, 'Edit points', 'editMode', () => run( () => tools.start( object ) ) );
			return;

		}
		const { data, indices } = tools;
		const actions = element( 'div', null, body );
		actions.className = 'modeling-actions';
		modelButton( actions, 'Object mode', 'objectMode', () => tools.stop() );
		for ( const { label, glyph, run: action, disabled, pressed } of tools.actions() ) {

			const control = modelButton( actions, label, glyph, () => run( action ), disabled );
			if ( pressed !== undefined ) control.setAttribute( 'aria-pressed', String( pressed ) );

		}
		element( 'p', tools.adding ? 'Click the viewport to place points.' :
			'Shift-click to extend the selection. Use the viewport gizmo to move, rotate, or scale points.', body ).className = 'modeling-instructions';
		const count = element( 'output', indices.length ? indices.length + ' selected' : data.points.length + ' points', body );
		count.className = 'modeling-instructions';
		if ( indices.length === 1 ) {

			const coords = element( 'div', null, body );
			coords.className = 'modeling-coordinates';
			for ( const [ i, axis ] of ( tools.planar ? [ 'X', 'Y' ] : [ 'X', 'Y', 'Z' ] ).entries() ) {

				field( axis, '', coords, 'number', Number( data.points[ indices[ 0 ] ][ i ].toFixed( 4 ) ), value => run( () => {

					if ( Number.isFinite( value ) ) tools.edit( 'Set point coordinate', next => { next.points[ indices[ 0 ] ][ i ] = value; } );

				} ) );

			}

		}
		if ( data.kind === 'path' || data.kind === 'shape' ) {

			field( 'Smooth curve', 'toolPath', body, 'checkbox', data.smooth, value => tools.edit( 'Set curve interpolation', next => { next.smooth = value; } ) );
			if ( data.kind === 'path' ) {

				field( 'Closed path', 'toolMask', body, 'checkbox', data.closed, value => tools.edit( 'Set path closure', next => { next.closed = value; } ) );
				field( 'Constrain to local XY', 'toolGrid', body, 'checkbox', data.planar, value => tools.edit( 'Set path editing plane', next => {

					next.planar = value;
					if ( value ) next.points.forEach( point => { point[ 2 ] = 0; } );

				} ) );

			} else {

				field( 'Extrusion depth', 'extrude', body, 'number', data.depth, value => run( () => {

					if ( ! Number.isFinite( value ) || value < 0 ) throw new Error( 'Enter a depth of zero or greater.' );
					tools.edit( 'Set shape depth', next => { next.depth = value; } );

				} ) ).min = 0;

			}
		}

	}

	tools.onChange = draw;
	editor.signals.objectSelected.add( () => { status.textContent = ''; draw(); } );
	editor.signals.objectChanged.add( ( object, attribute ) => {

		if ( object === editor.selected && attribute === 'userData' ) draw();

	} );
	return panel;

}
