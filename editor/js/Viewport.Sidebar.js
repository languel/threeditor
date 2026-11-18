import { UIPanel, UIRow, UIText, UINumber } from './libs/ui.js';
import { ObjectTransformControls, TransformAxis } from './ObjectTransformControls.js';
import { modelButton } from './modeling/ModelControls.js';

export function ViewportSidebar( editor, viewport, header, layout, render ) {

	const panel = new UIPanel().setId( 'viewport-item-panel' ).addClass( 'viewport-item-panel' );
	panel.dom.setAttribute( 'role', 'region' );
	panel.dom.setAttribute( 'aria-label', 'Viewport Item' );
	panel.dom.hidden = true;
	viewport.appendChild( panel.dom );
	const heading = new UIText( 'Item' ).addClass( 'viewport-item-heading' );
	panel.add( heading );

	const transform = new ObjectTransformControls( editor, 'Location' );
	const objectFields = new UIPanel().add( ...transform.rows );
	const pointRow = new UIRow().add( new UIText( 'Median' ).setClass( 'Label' ) );
	const pointFields = [ 'X', 'Y', 'Z' ].map( ( axis, index ) => {

		const input = new UINumber().setPrecision( 3 );
		input.dom.setAttribute( 'aria-label', 'Median ' + axis );
		input.onChange( () => {

			const model = editor.modeling;
			if ( ! model.editMode || ! model.canEdit() || model.drag || model.gesture || ! model.indices.length ) return;
			const selected = model.indices.slice();
			const offset = input.getValue() - coordinate( model, index );
			if ( ! Number.isFinite( offset ) || Math.abs( offset ) < 1e-9 || ( model.planar && index === 2 ) ) return;
			model.edit( 'Move selected points', data => {

				for ( const point of selected ) data.points[ point ][ index ] += offset;

			} );

		} );
		return input;

	} );
	pointRow.add( ...pointFields.map( ( field, index ) => TransformAxis( 'XYZ'[ index ], field ) ) );
	const empty = new UIText();
	panel.add( objectFields, pointRow, empty );

	const viewportControls = header.querySelector( '.viewport-controls' );
	const button = modelButton( viewportControls, 'Viewport Sidebar', 'panel', toggle );
	button.classList.add( 'viewport-item-toggle' );
	button.title = 'Viewport Sidebar (N)';
	button.setAttribute( 'aria-controls', panel.dom.id );
	button.setAttribute( 'aria-expanded', 'false' );
	let placedArea, placedGizmo;
	const navigationGizmo = () => viewport.querySelector( '#viewHelper:not([hidden])' );

	function coordinate( model, axis ) {

		return model.indices.reduce( ( sum, index ) => sum + model.data.points[ index ][ axis ], 0 ) / model.indices.length;

	}

	function refresh() {

		if ( panel.dom.hidden ) return;
		const model = editor.modeling;
		const object = editor.selected;
		const edit = model.editMode;
		const showPoints = edit && model.canEdit() && model.indices.length > 0;
		const showObject = ! edit && object && ! object.isScene;
		objectFields.setDisplay( showObject ? '' : 'none' );
		pointRow.setDisplay( showPoints ? '' : 'none' );
		empty.setDisplay( showPoints || showObject ? 'none' : '' ).setValue( edit ? 'Select points' : 'Select an object' );
		if ( showObject ) transform.update( object );
		if ( showPoints ) pointFields.forEach( ( input, axis ) => {

			input.setDisabled( axis === 2 && model.planar );
			input.setValue( coordinate( model, axis ) );

		} );

	}

	function place() {

		if ( panel.dom.hidden ) return;
		const frame = layout.navigation;
		placedArea = frame?.area;
		placedGizmo = navigationGizmo();
		panel.dom.toggleAttribute( 'inert', ! frame );
		panel.dom.style.visibility = frame ? '' : 'hidden';
		if ( ! frame ) return;
		const { x, y, width, height } = frame.area;
		const viewTop = viewport.getBoundingClientRect().top;
		const chromeBottom = Math.max( viewportControls.getBoundingClientRect().bottom,
			header.querySelector( '#toolbar' )?.getBoundingClientRect().bottom || 0,
			placedGizmo?.getBoundingClientRect().bottom || 0 );
		const top = Math.max( y, chromeBottom - viewTop ) + 6;
		const right = Math.max( viewport.clientWidth - x - width, viewport.clientWidth - header.offsetLeft - header.offsetWidth ) + 6;
		panel.dom.style.top = top + 'px';
		panel.dom.style.right = right + 'px';
		panel.dom.style.width = Math.max( 0, Math.min( 240, width - 16 ) ) + 'px';
		panel.dom.style.maxHeight = Math.max( 0, y + height - top - 6 ) + 'px';

	}

	function toggle() {

		panel.dom.hidden = ! panel.dom.hidden;
		button.setAttribute( 'aria-expanded', String( ! panel.dom.hidden ) );
		refresh();
		render();
		place();

	}

	const signals = editor.signals;
	signals.objectSelected.add( refresh );
	signals.refreshSidebarObject3D.add( object => { if ( object === editor.selected ) refresh(); } );
	signals.objectChanged.add( object => {

		for ( let selected = editor.selected; selected; selected = selected.parent ) {

			if ( selected === object ) { refresh(); break; }

		}

	} );
	signals.windowResize.add( place );
	signals.sceneRendered.add( () => {

		if ( panel.dom.hidden ) return;
		const area = layout.navigation?.area;
		if ( placedGizmo !== navigationGizmo() || Boolean( area ) !== Boolean( placedArea ) ||
			( area && [ 'x', 'y', 'width', 'height' ].some( key => area[ key ] !== placedArea[ key ] ) ) ) place();

	} );
	new ResizeObserver( place ).observe( header );
	return { toggle, refresh, get open() { return ! panel.dom.hidden; } };

}
