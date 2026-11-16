import { icon } from './Glyphs.js?v=model-transform';

import { modelSnapMode, modelSnapTargets } from './modeling/ModelSnap.js';

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
				[ 'auto', 'Default', 'toolSelect' ], [ 'bounds', 'Bounds center', 'pivotBox' ],
				[ 'median', editor.modeling?.object ? 'Median point' : 'Median origins', 'pivotMedian' ], [ 'active', editor.modeling?.object ? 'Active point' : 'Active origin', 'pivotActive' ],
				[ 'origin', 'World origin', 'pivotOrigin' ]
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

	const dialog = document.createElement( 'dialog' );
	dialog.className = 'transform-pie';
	document.body.appendChild( dialog );
	const buttons = new Map();
	let opener;
	let entries = [];
	dialog.addEventListener( 'click', event => { if ( event.target === dialog ) dialog.close(); } );
	dialog.addEventListener( 'close', () => {

		opener?.setAttribute( 'aria-expanded', 'false' );

	} );
	dialog.addEventListener( 'keydown', event => {

		const index = [ ...'1234567890' ].indexOf( event.key );
		if ( Number.isInteger( index ) && entries[ index ] ) {

			event.preventDefault();
			entries[ index ].click();

		}

	} );
	signals.startPlayer.add( () => { if ( dialog.open ) dialog.close(); } );

	function open( kind, position ) {

		if ( editor.modeling?.gesture || editor.modeling?.drag || editor.modalTransform?.active || editor.flyControls?.active || document.body.classList.contains( 'presenting' ) ) return;
		if ( dialog.open ) return;
		const definition = configs[ kind ];
		opener = buttons.get( kind );
		opener.setAttribute( 'aria-expanded', 'true' );
		dialog.replaceChildren();
		dialog.classList.toggle( 'transform-snap-pie', kind === 'snap' );
		dialog.setAttribute( 'aria-label', definition.label );
		const wheel = document.createElement( 'div' );
		wheel.className = 'transform-pie-wheel';
		const center = document.createElement( kind === 'snap' ? 'button' : 'span' );
		if ( kind === 'snap' ) {

			center.type = 'button';
			center.onclick = () => { dialog.close(); toggleSnap(); };

		}
		center.className = 'transform-pie-center';
		center.textContent = kind === 'snap' ? ( config.getKey( 'settings/transformSnap' ) == null ? 'Snap off' : 'Snap on' ) : definition.label;
		wheel.appendChild( center );
		const choices = definition.choices();
		entries = choices.map( ( [ label, glyph, apply, active ], index ) => {

			const button = document.createElement( 'button' );
			button.type = 'button';
			button.className = 'transform-pie-choice';
			button.innerHTML = icon( glyph );
			const caption = document.createElement( 'span' );
			caption.textContent = label;
			const hint = document.createElement( 'kbd' );
			hint.textContent = '1234567890'[ index ];
			button.append( caption, hint );
			button.setAttribute( 'aria-label', label );
			if ( active !== undefined ) button.setAttribute( 'aria-pressed', String( active ) );
			const angle = index / choices.length * Math.PI * 2 - Math.PI / 2;
			button.style.left = 50 + 32 * Math.cos( angle ) + '%';
			button.style.top = 50 + 34 * Math.sin( angle ) + '%';
			button.onclick = () => {

				dialog.close();
				apply();

			};
			wheel.appendChild( button );
			return button;

		} );
		dialog.appendChild( wheel );
		const rect = document.getElementById( 'viewport' ).getBoundingClientRect();
		const [ x, y ] = position || pointer || [ rect.left + rect.width / 2, rect.top + rect.height / 2 ];
		const clamp = ( value, size, half ) => Math.max( Math.min( half, size / 2 ), Math.min( value, size - half ) );
		dialog.style.left = clamp( x, window.innerWidth, kind === 'snap' ? 264 : 175 ) + 'px';
		dialog.style.top = clamp( y, window.innerHeight, kind === 'snap' ? 165 : 135 ) + 'px';
		dialog.showModal();

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

		const button = document.createElement( 'button' );
		button.type = 'button';
		button.className = 'Button transform-setting';
		button.setAttribute( 'aria-label', definition.label );
		button.setAttribute( 'aria-haspopup', 'dialog' );
		button.setAttribute( 'aria-expanded', 'false' );
		button.onclick = () => {

			const rect = button.getBoundingClientRect();
			open( kind, [ rect.left + rect.width / 2, rect.top - 118 ] );

		};
		buttons.set( kind, button );
		if ( kind === 'snap' ) toolbar.appendChild( magnet );
		toolbar.appendChild( button );

	}
	refresh();
	signals.transformSettingsChanged.add( refresh );
	editor.openTransformPie = open;

}
