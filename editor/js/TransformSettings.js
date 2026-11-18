import { shadingModes } from './ViewportShading.js';
import { icon } from './Glyphs.js?v=poly-context';

import { modelSnapMode, modelSnapTargets } from './modeling/ModelSnap.js';
import { cursorSnapActions } from './modeling/CursorSnap.js';

// Keep the four Blender shading choices on their familiar compass points.
const shadingPiePositions = [ [ 50, 16 ], [ 82, 50 ], [ 50, 84 ], [ 18, 50 ], [ 74, 69 ] ];

export function transformSnapStep( config, held = false ) {

	const value = modelSnapMode( config, held );
	return value === 'grid' || value === 'increment' ? config.getKey( 'settings/gridStep' ) : Number.isFinite( value ) ? value : null;

}

export function addTransformSettings( editor, toolbar ) {

	const { config, signals } = editor;
	let pointer = null;
	window.addEventListener( 'pointermove', event => {

		if ( event.target.closest?.( '#viewport' ) ) pointer = [ event.clientX, event.clientY ];

	}, { passive: true } );

	const configs = {
		mode: {
			label: 'Interaction mode',
			choices: () => {

				const model = editor.modeling;
				const current = editor.viewTools.mode === 'paint' ? 'paint' : model.editMode ?
					( model.brush && model.brush !== 'freehand' ? 'sculpt' : 'edit' ) : 'object';
				return [
					[ 'Object Mode', 'objectMode', 'object' ],
					[ 'Edit Mode', 'editMode', 'edit' ],
					[ 'Sculpt Mode', 'sculptTool', 'sculpt' ],
					[ 'Surface Paint', 'surfaceBrush', 'paint' ]
				].map( ( [ label, glyph, mode ] ) => [ label, glyph, () => editor.viewTools.setWorkspaceMode( mode ), current === mode,
					mode === 'sculpt' && ! model.canEditTarget( editor.selected ) ] );

			}
		},
		navigation: {
			label: 'View navigation',
			choices: () => [
				[ 'Top', 'up', 'viewTop' ], [ 'Frame Selected', 'frame', 'focus' ],
				[ 'Right', 'objectMode', 'viewRight' ], [ 'Back', 'objectMode', 'viewBack' ],
				[ 'Bottom', 'down', 'viewBottom' ], [ 'Front', 'objectMode', 'viewFront' ],
				[ 'Left', 'objectMode', 'viewLeft' ], [ 'Camera', 'camera', 'viewCamera' ]
			].map( ( [ label, glyph, action ] ) => [ label, glyph, () => editor.keymap.run( action ) ] )
		},
		shading: {
			label: 'Viewport shading',
			choices: () => shadingModes.filter( ( [ mode ] ) => mode !== 'normals' ).map( ( [ mode, label, glyph ] ) =>
				[ label, glyph, () => editor.setViewportShading( mode ), editor.viewportShading === mode ] )
		},
		placement: {
			label: 'Placement', glyph: 'placePlane',
			choices: () => [
				[ 'object', 'Object plane', 'placePlane' ], [ 'view', 'View plane', 'preview' ],
				[ 'ground', 'Ground plane', 'groundPlane' ], [ 'surface', 'Mesh surface', 'snapFace' ], [ 'surfacePerpendicular', 'Surface perpendicular', 'surfacePerpendicular' ]
			].map( ( [ value, label, glyph ] ) => [ label, glyph, () => change( 'modelPlacement', value ),
				( config.getKey( 'settings/modelPlacement' ) || 'object' ) === value ] )
		},
		grid: {
			label: 'Grid', glyph: 'toolGrid',
			choices: () => [
				[ config.getKey( 'settings/gridVisible' ) ? 'Hide grid' : 'Show grid', 'toolGrid', () => change( 'gridVisible', ! config.getKey( 'settings/gridVisible' ) ) ],
				... [ .1, .5, 1, 5 ].map( step => [ step + ' units', 'toolGrid', () => {

					config.setKey( 'settings/gridVisible', true );
					change( 'gridStep', step );

				}, config.getKey( 'settings/gridVisible' ) && config.getKey( 'settings/gridStep' ) === step ] )
			]
		},
		snap: {
			label: 'Snap target', glyph: 'toolSnap',
			choices: () => modelSnapTargets.map( ( [ value, label, glyph ] ) => [
				label, glyph, () => {
					config.setKey( 'settings/transformSnapTarget', value );
					change( 'transformSnap', value );
				}, config.getKey( 'settings/transformSnap' ) === value
			] )
		},
		cursorSnap: {
			label: 'Snap',
			choices: () => cursorSnapActions( editor )
		},
		orientation: {
			label: 'Transform orientation', glyph: 'orientGlobal',
			choices: () => [
				[ 'global', 'Global', 'orientGlobal' ], [ 'local', 'Local', 'orientLocal' ],
				[ 'normal', 'Normal', 'orientNormal' ], [ 'view', 'View', 'preview' ],
				[ 'parent', 'Parent', 'orientParent' ]
			].map( ( [ value, label, glyph ] ) => [ label, glyph, () => change( 'transformOrientation', value ),
				( config.getKey( 'settings/transformOrientation' ) || 'global' ) === value ] )
		},
		pivot: {
			label: 'Transform pivot', glyph: 'pivotBox',
			choices: () => [
				[ 'auto', 'Default', 'toolSelect' ], [ 'bounds', 'Bounds center', 'pivotBox' ], [ 'bottom', 'Bounds bottom center', 'pivotBottom' ],
				[ 'median', editor.modeling?.object ? 'Median point' : 'Median origins', 'pivotMedian' ], [ 'active', editor.modeling?.object ? 'Active point' : 'Active origin', 'pivotActive' ],
				[ 'origin', 'World origin', 'orientGlobal' ], [ 'cursor', '3D Cursor', 'pivotOrigin' ]
			].map( ( [ value, label, glyph ] ) => [ label, glyph, () => change( 'transformPivot', value ), config.getKey( 'settings/transformPivot' ) === value ] )
		}
	};

	function change( key, value ) {

		config.setKey( 'settings/' + key, value );
		signals.transformSettingsChanged.dispatch( key );

	}

	const magnet = document.createElement( 'button' );
	magnet.type = 'button';
	magnet.className = 'Button transform-setting transform-magnet';
	magnet.innerHTML = icon( 'magnet' );
	magnet.setAttribute( 'aria-label', 'Toggle snapping' );
	magnet.title = 'Toggle snapping';
	function toggleSnap() {

		const current = config.getKey( 'settings/transformSnap' );
		if ( current != null ) config.setKey( 'settings/transformSnapTarget', current );
		change( 'transformSnap', current == null ? modelSnapMode( config, true ) : null );

	}
	magnet.onclick = toggleSnap;
	editor.toggleTransformSnap = toggleSnap;
	editor.toggleTransformGrid = () => change( 'gridVisible', ! config.getKey( 'settings/gridVisible' ) );

	const dialog = document.createElement( 'dialog' );
	dialog.className = 'transform-pie';
	document.body.appendChild( dialog );
	const buttons = new Map();
	let opener, previousFocus;
	let entries = [];

	function close() {

		dialog.close();
		opener?.setAttribute( 'aria-expanded', 'false' );
		if ( dialog.contains( document.activeElement ) ) {

			if ( previousFocus?.isConnected && previousFocus !== document.body ) previousFocus.focus( { preventScroll: true } );
			else document.activeElement.blur();

		}

	}

	dialog.addEventListener( 'click', event => { if ( event.target === dialog ) close(); } );
	dialog.addEventListener( 'cancel', event => { event.preventDefault(); close(); } );
	dialog.addEventListener( 'keydown', event => {

		if ( event.key === 'Escape' ) {

			event.preventDefault();
			close();
			return;

		}
		const index = [ ...'1234567890' ].indexOf( event.key );
		if ( entries[ index ] ) {

			event.preventDefault();
			entries[ index ].click();
			return;

		}
		const directions = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
		if ( ! Object.hasOwn( directions, event.key ) ) return;
		event.preventDefault();
		const current = entries.indexOf( document.activeElement );
		const direction = directions[ event.key ];
		entries[ current < 0 ? ( direction > 0 ? 0 : entries.length - 1 ) :
			( current + direction + entries.length ) % entries.length ]?.focus();

	} );
	signals.startPlayer.add( () => { if ( dialog.open ) close(); } );

	function open( kind, dropdown = false ) {

		if ( editor.modeling?.gesture || editor.modeling?.drag || editor.modalTransform?.active || editor.flyControls?.active || document.body.classList.contains( 'presenting' ) ) return;
		if ( dialog.open ) return;
		previousFocus = document.activeElement;
		const definition = configs[ kind ];
		opener = buttons.get( kind );
		opener?.setAttribute( 'aria-expanded', 'true' );
		dialog.replaceChildren();
		dialog.classList.toggle( 'transform-dropdown', dropdown );
		dialog.classList.toggle( 'transform-snap-pie', ! dropdown && [ 'snap', 'cursorSnap' ].includes( kind ) );
		dialog.classList.toggle( 'transform-shading-pie', ! dropdown && kind === 'shading' );
		dialog.setAttribute( 'aria-label', definition.label );
		const wheel = document.createElement( 'div' );
		wheel.className = 'transform-pie-wheel';
		const center = document.createElement( [ 'snap', 'navigation' ].includes( kind ) ? 'button' : 'span' );
		if ( kind === 'snap' ) {

			center.type = 'button';
			center.onclick = () => { close(); toggleSnap(); };

		}
		if ( kind === 'navigation' ) {

			center.type = 'button';
			center.onclick = () => { close(); editor.keymap.run( 'projection' ); };
			center.title = 'Toggle perspective / orthographic (Numpad 5)';
			center.setAttribute( 'aria-label', center.title );

		}
		center.className = 'transform-pie-center';
		center.textContent = kind === 'navigation' ? ( editor.camera.isOrthographicCamera ? 'Orthographic' : 'Perspective' ) :
			kind === 'snap' ? ( config.getKey( 'settings/transformSnap' ) == null ? 'Snap off' : 'Snap on' ) : definition.label;
		if ( ! dropdown || kind === 'snap' ) wheel.appendChild( center );
		const choices = definition.choices();
		entries = choices.map( ( [ label, glyph, apply, active, disabled ], index ) => {

			const button = document.createElement( 'button' );
			button.type = 'button';
			button.disabled = Boolean( disabled );
			button.className = 'transform-pie-choice';
			button.innerHTML = icon( glyph );
			const caption = document.createElement( 'span' );
			caption.textContent = label;
			const hint = document.createElement( 'kbd' );
			hint.textContent = '1234567890'[ index ];
			button.appendChild( caption );
			if ( ! dropdown ) button.appendChild( hint );
			button.setAttribute( 'aria-label', label );
			if ( active !== undefined ) button.setAttribute( 'aria-pressed', String( active ) );
			const angle = index / choices.length * Math.PI * 2 - Math.PI / 2;
			if ( ! dropdown ) {

				const [ x, y ] = kind === 'shading' ? shadingPiePositions[ index ] :
					[ 50 + 32 * Math.cos( angle ), 50 + 34 * Math.sin( angle ) ];
				button.style.left = x + '%';
				button.style.top = y + '%';

			}
			button.onclick = () => {

				close();
				apply();

			};
			wheel.appendChild( button );
			return button;

		} );
		dialog.appendChild( wheel );
		dialog.showModal();
		const bounds = dialog.getBoundingClientRect();
		if ( dropdown ) {

			const anchor = opener.getBoundingClientRect();
			dialog.style.left = Math.max( 4, Math.min( anchor.left, window.innerWidth - bounds.width - 4 ) ) + 'px';
			dialog.style.top = ( anchor.bottom + bounds.height + 4 <= window.innerHeight ? anchor.bottom + 4 :
				Math.max( 4, anchor.top - bounds.height - 4 ) ) + 'px';

		} else {

			const rect = document.getElementById( 'viewport' ).getBoundingClientRect();
			const [ x, y ] = pointer || [ rect.left + rect.width / 2, rect.top + rect.height / 2 ];
			const clamp = ( value, size, half ) => Math.max( Math.min( half, size / 2 ), Math.min( value, size - half ) );
			dialog.style.left = clamp( x, window.innerWidth, bounds.width / 2 ) + 'px';
			dialog.style.top = clamp( y, window.innerHeight, bounds.height / 2 ) + 'px';

		}
		const selected = entries.find( button => button.getAttribute( 'aria-pressed' ) === 'true' );
		( selected || entries[ 0 ] )?.focus( { preventScroll: true } );

	}

	function refresh() {

		magnet.setAttribute( 'aria-pressed', String( config.getKey( 'settings/transformSnap' ) != null ) );
		for ( const [ kind, button ] of buttons ) {

			const definition = configs[ kind ];
			const selected = definition.choices().find( choice => choice[ 3 ] );
			button.innerHTML = icon( selected?.[ 1 ] || definition.glyph );
			button.title = selected ? definition.label + ' · ' + selected[ 0 ] : definition.label;

		}

	}

	for ( const [ kind, definition ] of Object.entries( configs ) ) {

		if ( [ 'mode', 'shading', 'navigation', 'cursorSnap' ].includes( kind ) ) continue;

		const button = document.createElement( 'button' );
		button.type = 'button';
		button.className = 'Button transform-setting';
		button.setAttribute( 'aria-label', definition.label );
		button.setAttribute( 'aria-haspopup', 'dialog' );
		button.setAttribute( 'aria-expanded', 'false' );
		button.onclick = () => open( kind, true );
		buttons.set( kind, button );
		if ( kind === 'snap' ) toolbar.appendChild( magnet );
		toolbar.appendChild( button );

	}
	refresh();
	signals.transformSettingsChanged.add( refresh );
	editor.openTransformPie = kind => open( kind );

}
