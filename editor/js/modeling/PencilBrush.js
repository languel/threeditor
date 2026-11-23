import { modelButton, modelField } from './ModelControls.js?v=pencil-stroke-depth';
import { grainOpacity, grainTileSize } from './PencilGrain.js?v=expressive-pencil';
import { StrokeSampler } from './StrokeSampler.js';
import { icon } from '../Glyphs.js?v=pencil-reference';

// Size, strength and tip hardness from ThreeGrease's natural-media set.
const tips = [
	[ 'Pen', 8, 1, 1 ],
	[ 'Ink Rough', 20, 1, .9, .12, .85, 0, 0.55, 7, 'fiber' ],
	[ 'Marker', 30, .9, .85, .1, .45, .7, 0.1, 4, 'paper' ],
	[ 'Charcoal', 26, .85, .55, .16, .6, 0, 0.9, 10, 'speckle' ],
	[ 'Airbrush', 46, .25, .15, .3, 1, 0, 0.22, 3, 'paper' ],
	[ 'Pencil Soft', 10, .85, .7, .12, 1, 0, 0.48, 9, 'paper' ],
	[ 'Pencil Hard', 5, .7, 1, .12, 1, 0, 0.62, 13, 'paper' ],
	[ 'Ink Pooling', 14, 1, .95 ],
	[ 'Brush Pen', 26, 1, .85, .1, .8, 0, .28, 8, 'fiber' ],
	[ 'Chalk', 30, .8, .4, .14, .75, .3, 0.8, 14, 'speckle' ],
	[ 'Dry Brush', 34, .9, .5, .2, .5, 0, 0.95, 18, 'fiber' ],
	[ 'Fading Marker', 24, .95, .8 ],
	[ 'Calligraphy', 22, 1, 1, .06, .25, .9 ]
];
const tipProfiles = {
	'Brush Pen': { taperStart: .18, taperEnd: .3, sizeResponse: 1.5 },
	'Ink Rough': { taperStart: .12, taperEnd: .24 },
	'Dry Brush': { taperStart: .1, taperEnd: .28 }
};
const profileDefaults = { taperStart: 0, taperEnd: 0, sizeResponse: 1, opacityResponse: 1 };

function brushFill( context, radius, color, hardness ) {

	if ( hardness >= 1 ) return color;
	const gradient = context.createRadialGradient( 0, 0, radius * hardness, 0, 0, radius );
	gradient.addColorStop( 0, color );
	gradient.addColorStop( 1, color + '00' );
	return gradient;

}

export function pencilBrush( editor ) {

	return editor.pencilBrush ||= { ...profileDefaults, name: 'Pen', size: 8, strength: 1, hardness: 1, spacing: .12, aspect: 1, angle: 0, pressureSize: true, pressureOpacity: false, grain: 0, grainScale: 6, grainPattern: 'paper', color: '#71bce7', stabilize: false, stabilizeRadius: 30, smoothing: 0, simplify: 0, guide: 'off', guideAngle: 0 };

}

const brushImages = new Map();

function brushImage( brush, tip ) {

	const { color, hardness, grain, grainPattern, grainScale } = brush;
	const key = [ color, grain, grainPattern, tip ? hardness : '', tip ? grainScale : '' ].join( '/' );
	if ( brushImages.has( key ) ) return brushImages.get( key );
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = tip ? 96 : grainTileSize;
	const context = canvas.getContext( '2d' );
	const image = context.createImageData( canvas.width, canvas.height );
	const tint = Number.parseInt( color.slice( 1 ), 16 );
	const tile = grainOpacity( grain, grainPattern );
	const repeat = ( grainScale || 6 ) / 8;
	for ( let y = 0; y < canvas.height; y ++ ) for ( let x = 0; x < canvas.width; x ++ ) {

		const index = ( y * canvas.width + x ) * 4;
		const u = ( x + .5 ) / canvas.width, v = ( y + .5 ) / canvas.height;
		const radius = tip ? 2 * Math.hypot( u - .5, v - .5 ) : 0;
		const feather = tip ? Math.min( 1, Math.max( 0, ( 1 - radius ) / Math.max( .015, 1 - hardness ) ) ) : 1;
		const gx = tip ? Math.floor( u * repeat * grainTileSize ) % grainTileSize : x;
		const gy = tip ? Math.floor( v * repeat * grainTileSize ) % grainTileSize : y;
		image.data[ index ] = tint >> 16 & 255;
		image.data[ index + 1 ] = tint >> 8 & 255;
		image.data[ index + 2 ] = tint & 255;
		image.data[ index + 3 ] = tile[ gy * grainTileSize + gx ] * feather;

	}
	context.putImageData( image, 0, 0 );
	if ( brushImages.size >= 64 ) brushImages.delete( brushImages.keys().next().value );
	brushImages.set( key, canvas );
	return canvas;

}

export function brushGrainTile( color, brush, diameter ) {

	if ( ! ( brush?.grain > 0 ) ) return null;
	const size = Math.max( 1, diameter * 8 / ( brush.grainScale || 6 ) );
	return { image: brushImage( { ...brush, color }, false ), size };

}

export function brushGrainFill( context, color, brush, diameter ) {

	const tile = brushGrainTile( color, brush, diameter );
	if ( ! tile ) return color;
	const pattern = context.createPattern( tile.image, 'repeat' );
	pattern.setTransform( new DOMMatrix().scale( tile.size / grainTileSize ) );
	return pattern;

}

export function drawBrushTip( context, radius, brush ) {

	context.rotate( brush.angle || 0 );
	context.scale( 1, brush.aspect || 1 );
	if ( brush.grain > 0 ) {

		context.drawImage( brushImage( brush, true ), -radius, -radius, radius * 2, radius * 2 );
		return;

	}
	context.fillStyle = brushFill( context, radius, brush.color, brush.hardness ?? 1 );
	context.beginPath();
	context.arc( 0, 0, radius, 0, Math.PI * 2 );
	context.fill();

}

export function brushDab( context, x, y, pressure, brush, erase = false ) {

	const radius = Math.max( .5, brush.size * brushSizeFactor( brush, pressure ) / 2 );
	context.save();
	context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
	context.globalAlpha = brush.strength * brushOpacityFactor( brush, pressure );
	context.translate( x, y );
	drawBrushTip( context, radius, brush );
	context.restore();

}

export function brushStroke( brush, x, y, pressure, dab ) {

	const spacing = Math.max( 1, brush.size * ( brush.spacing ?? .12 ) );
	const sampler = new StrokeSampler( x, y, pressure, spacing );
	dab( x, y, pressure );
	return ( nextX, nextY, nextPressure ) => sampler.move( nextX, nextY, nextPressure, dab );

}

export function brushPressure( event ) {

	return event.pointerType === 'pen' && Number.isFinite( event.pressure ) ? Math.max( 0, Math.min( 1, event.pressure ) ) : 1;

}

export function brushSizeFactor( brush, pressure ) {

	return brush.pressureSize === false ? 1 : Math.max( .2, pressure ** ( brush.sizeResponse ?? 1 ) );

}

export function brushOpacityFactor( brush, pressure ) {

	return brush.pressureOpacity ? pressure ** ( brush.opacityResponse ?? 1 ) : 1;

}

export function useBrushShortcut( editor, event ) {

	if ( event.metaKey || event.ctrlKey || event.altKey ) return false;
	const smaller = event.code === 'BracketLeft' || [ '[', '{' ].includes( event.key );
	const larger = event.code === 'BracketRight' || [ ']', '}' ].includes( event.key );
	if ( ! smaller && ! larger ) return false;
	const brush = pencilBrush( editor );
	if ( event.shiftKey ) brush.strength = Math.round( Math.max( .01, Math.min( 1, brush.strength + ( smaller ? -.05 : .05 ) ) ) * 100 ) / 100;
	else brush.size = Math.max( 1, Math.min( 256, Math.round( brush.size * ( smaller ? 1 / 1.2 : 1.2 ) ) ) );
	return true;

}

const brushPresetsKey = 'settings/pencilPresets';

function drawBrushSample( canvas, brush ) {

	const context = canvas.getContext( '2d' );
	const style = { ...brush, size: Math.min( 17, brush.size * .58 ) };
	context.clearRect( 0, 0, canvas.width, canvas.height );
	const dab = brushStroke( style, 7, 16, .7, ( x, y, pressure ) => {

		const u = ( x - 7 ) / 30;
		const start = brush.taperStart ? Math.min( 1, u / brush.taperStart ) : 1;
		const end = brush.taperEnd ? Math.min( 1, ( 1 - u ) / brush.taperEnd ) : 1;
		const t = Math.min( start, end );
		brushDab( context, x, y, pressure, { ...style, size: style.size * ( .12 + .88 * t * t * ( 3 - 2 * t ) ) } );

	} );
	for ( let x = 8; x < 38; x ++ ) dab( x, 12 + Math.sin( x / 5 ) * 4, .35 + .65 * Math.sin( x / 15 ) );

}

function nameBrushPreset( suggested, exists, savePreset ) {

	const dialog = document.createElement( 'dialog' );
	dialog.className = 'project-save-dialog';
	dialog.setAttribute( 'aria-label', 'Save brush preset' );
	const form = document.createElement( 'form' );
	const title = document.createElement( 'h2' );
	title.textContent = 'Save brush preset';
	const label = document.createElement( 'label' );
	label.textContent = 'Preset name';
	const name = document.createElement( 'input' );
	Object.assign( name, { required: true, maxLength: 48, value: suggested } );
	label.append( name );
	const cancel = document.createElement( 'button' );
	cancel.type = 'button';
	cancel.textContent = 'Cancel';
	cancel.onclick = () => dialog.close();
	const save = document.createElement( 'button' );
	save.type = 'submit';
	const update = () => {

		name.setCustomValidity( '' );
		save.textContent = exists( name.value.trim() ) ? 'Update preset' : 'Save preset';

	};
	name.addEventListener( 'input', update );
	form.onsubmit = event => {

		event.preventDefault();
		const value = name.value.trim();
		if ( ! value || tips.some( ( [ name ] ) => name.toLowerCase() === value.toLowerCase() ) ) {

			name.setCustomValidity( value ? 'Choose a different name from the built-in presets.' : 'Enter a preset name.' );
			name.reportValidity();
			return;

		}
		savePreset( value );
		dialog.close();

	};
	const actions = document.createElement( 'div' );
	actions.className = 'project-save-actions';
	actions.append( cancel, save );
	form.append( title, label, actions );
	dialog.append( form );
	dialog.onclose = () => dialog.remove();
	dialog.addEventListener( 'keydown', event => event.stopPropagation() );
	update();
	document.body.append( dialog );
	dialog.showModal();
	name.select();

}

export function pencilDropdown( host, label, choices, read, write ) {

	const button = modelButton( host, label, choices[ 0 ][ 2 ], () => {

		if ( menu.matches( ':popover-open' ) ) { menu.hidePopover(); return; }
		const anchor = button.getBoundingClientRect();
		menu.showPopover( { source: button } );
		const { width, height } = menu.getBoundingClientRect();
		menu.style.left = Math.max( 4, Math.min( anchor.left, window.innerWidth - width - 4 ) ) + 'px';
		const top = anchor.top >= height + 4 ? anchor.top - height - 4 : Math.min( anchor.bottom + 4, window.innerHeight - height - 4 );
		menu.style.top = Math.max( 4, top ) + 'px';
		rows.find( row => row.getAttribute( 'aria-pressed' ) === 'true' )?.focus( { preventScroll: true } );

	} );
	button.setAttribute( 'aria-haspopup', 'true' );
	button.setAttribute( 'aria-expanded', 'false' );
	button.dataset.pencilChoice = '';
	button.refreshPencilChoice = refresh;
	const menu = document.createElement( 'div' );
	menu.className = 'transform-dropdown pencil-dropdown-menu';
	menu.setAttribute( 'popover', 'auto' );
	menu.setAttribute( 'role', 'group' );
	menu.setAttribute( 'aria-label', label + ' choices' );
	host.append( menu );
	const rows = choices.map( ( [ value, caption, glyph ] ) => {

		const row = document.createElement( 'button' );
		row.type = 'button';
		row.className = 'transform-pie-choice';
		row.innerHTML = icon( glyph );
		const text = document.createElement( 'span' );
		text.textContent = caption;
		row.append( text );
		row.onclick = () => { menu.hidePopover(); write( value ); refresh(); button.focus( { preventScroll: true } ); };
		menu.append( row );
		return row;

	} );
	menu.addEventListener( 'toggle', () => button.setAttribute( 'aria-expanded', String( menu.matches( ':popover-open' ) ) ) );
	menu.onkeydown = event => {

		const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
		if ( ! direction ) return;
		event.preventDefault();
		const index = rows.indexOf( document.activeElement );
		rows[ ( index + direction + rows.length ) % rows.length ].focus();

	};
	function refresh() {

		const value = read();
		const [ , caption, glyph ] = choices.find( option => option[ 0 ] === value ) || choices[ 0 ];
		button.querySelector( '.model-control-icon' ).innerHTML = icon( glyph );
		button.title = label + ' · ' + caption;
		rows.forEach( ( row, i ) => row.setAttribute( 'aria-pressed', String( choices[ i ][ 0 ] === value ) ) );

	}
	refresh();
	return refresh;

}

export function brushPalette( editor, host, changed = () => {}, {
	strokeOptions = false, singleRow = false, curveCleanup = true, dabSpacing = true, quick = false, taper = false, addPlacementControls, addStrokeControls
} = {} ) {

	const brush = pencilBrush( editor );
	const palette = document.createElement( 'div' );
	palette.className = 'pencil-brush-palette';
	palette.setAttribute( 'role', 'group' );
	palette.setAttribute( 'aria-label', 'Pencil brush palette' );
	host.append( palette );
	const presets = document.createElement( 'div' );
	presets.className = 'pencil-brush-presets';
	let summaryCanvas;
	if ( singleRow ) {

		const picker = document.createElement( 'details' );
		picker.className = 'pencil-tip-picker';
		const summary = document.createElement( 'summary' );
		summary.setAttribute( 'aria-label', 'Brush presets' );
		summaryCanvas = document.createElement( 'canvas' );
		summaryCanvas.width = 44;
		summaryCanvas.height = 24;
		summaryCanvas.setAttribute( 'aria-hidden', 'true' );
		summary.append( summaryCanvas );
		picker.append( summary, presets );
		picker.onkeydown = event => {

			if ( event.key === 'Escape' && picker.open ) {
				event.stopPropagation();
				picker.open = false;
				summary.focus();
			}

		};
		palette.append( picker );

	} else palette.append( presets );
	const fieldRow = document.createElement( 'div' );
	fieldRow.className = 'pencil-brush-fields';
	if ( singleRow ) {

		fieldRow.addEventListener( 'wheel', event => {

			if ( event.ctrlKey || event.metaKey || Math.abs( event.deltaX ) >= Math.abs( event.deltaY ) || fieldRow.scrollWidth <= fieldRow.clientWidth ) return;
			fieldRow.scrollLeft += event.deltaY * ( event.deltaMode === 1 ? 16 : 1 );
			event.preventDefault();

		}, { passive: false } );

	}
	palette.append( fieldRow );
	addPlacementControls?.( fieldRow );
	const emptyPresets = [];
	const savedBrushes = () => editor.config.getKey( brushPresetsKey ) || emptyPresets;
	const findPreset = name => savedBrushes().find( item => item.name.toLowerCase() === name.toLowerCase() );
	const recallPreset = name => {

		const saved = findPreset( name );
		if ( ! saved ) return;
		Object.assign( brush, profileDefaults, saved );
		refresh(); changed();

	};
	const userPresets = document.createElement( 'select' );
	userPresets.setAttribute( 'aria-label', 'Saved brush presets' );
	userPresets.title = 'Saved brush presets';
	userPresets.onchange = () => recallPreset( userPresets.value );
	fieldRow.append( userPresets );
	modelButton( fieldRow, 'Save brush preset', 'save', () => {

		const stored = findPreset( brush.name );
		nameBrushPreset( stored?.name || brush.name + ' custom', value => Boolean( findPreset( value ) ), value => {

			const existing = findPreset( value );
			const snapshot = { ...brush, name: existing?.name || value };
			const records = savedBrushes();
			editor.config.setKey( brushPresetsKey, existing ? records.map( item => item === existing ? snapshot : item ) : [ ...records, snapshot ] );
			brush.name = snapshot.name;
			refresh(); changed();

		} );

	} );
	const restorePreset = modelButton( fieldRow, 'Restore saved brush preset', 'undo', () => recallPreset( brush.name ) );
	const removePreset = modelButton( fieldRow, 'Delete saved brush preset', 'delete', () => {

		editor.config.setKey( brushPresetsKey, savedBrushes().filter( item => item.name !== brush.name ) );
		refresh(); changed();

	} );
	if ( quick ) for ( const control of [ userPresets, restorePreset, removePreset ] ) control.remove();
	if ( quick ) fieldRow.querySelector( '[aria-label="Save brush preset"]' ).remove();
	palette.addEventListener( 'focusin', refresh );

	const tipOptions = new Set( [ 'spacing', 'aspect', 'angle', 'pressureSize', 'pressureOpacity', 'sizeResponse', 'opacityResponse', 'taperStart', 'taperEnd' ] );
	const displayValue = key => key === 'angle' ? Math.round( brush.angle * 180 / Math.PI ) : brush[ key ];
	const fields = [
		[ 'color', 'Brush color', 'color', 'color' ],
		[ 'size', 'Brush size (px)', 'brushWidth', 'number', 1, 256 ],
		[ 'strength', 'Brush strength', 'opacity', 'number', .01, 1 ],
		[ 'hardness', 'Brush hardness', 'brush', 'number', 0, 1 ],
		[ 'grain', 'Brush grain', 'toolGrid', 'number', 0, 1 ],
		[ 'grainScale', 'Grain scale', 'scale', 'number', 1, 30 ],
		[ 'spacing', 'Brush spacing (× size)', 'toolPath', 'number', .02, 2 ],
		[ 'aspect', 'Brush tip aspect', 'scale', 'number', .1, 1 ],
		[ 'angle', 'Brush tip angle (°)', 'rotate', 'number', -180, 180 ],
		[ 'pressureSize', 'Use pen pressure for size', 'brushWidth', 'checkbox' ],
		[ 'sizeResponse', 'Size pressure response', 'brushWidth', 'number', .25, 3 ],
		[ 'pressureOpacity', 'Use pen pressure for opacity', 'opacity', 'checkbox' ],
		[ 'opacityResponse', 'Opacity pressure response', 'opacity', 'number', .25, 3 ],
		[ 'taperStart', 'Start taper', 'toolPath', 'number', 0, .5 ],
		[ 'taperEnd', 'End taper', 'toolPath', 'number', 0, .5 ]
	].filter( ( [ key ] ) => quick ? [ 'color', 'size', 'strength' ].includes( key ) :
		( dabSpacing || key !== 'spacing' ) && ( taper || ! key.startsWith( 'taper' ) ) ).map( ( [ key, name, glyph, type, min, max ] ) => {

		const input = modelField( fieldRow, name, glyph, type, displayValue( key ) );
		if ( type === 'number' ) {

			const step = key === 'size' || key === 'angle' ? 1 : key === 'grainScale' ? .5 : key === 'spacing' ? .01 : .05;
			Object.assign( input, { min, max, step } );
			input.dataset.scrubSensitivity = key === 'size' ? '.5' : key === 'grainScale' ? '.2' : key === 'angle' ? '.5' : '.005';

		}
		input.onchange = () => {

			if ( type === 'color' ) brush.color = input.value;
			else if ( type === 'checkbox' ) brush[ key ] = input.checked;
			else if ( Number.isFinite( input.valueAsNumber ) ) {

				const value = Math.max( min, Math.min( max, input.valueAsNumber ) );
				brush[ key ] = key === 'angle' ? value * Math.PI / 180 : value;

			}
			if ( type !== 'checkbox' ) input.value = displayValue( key );
			refresh(); changed();

		};
		return [ key, input ];

	} );
	const pattern = document.createElement( 'select' );
	pattern.setAttribute( 'aria-label', 'Brush grain pattern' );
	pattern.title = 'Brush grain pattern';
	for ( const [ id, label ] of [ [ 'paper', 'Paper' ], [ 'fiber', 'Fibers' ], [ 'speckle', 'Speckles' ], [ 'canvas', 'Canvas weave' ] ] ) pattern.append( new Option( label, id ) );
	pattern.onchange = () => { brush.grainPattern = pattern.value; refresh(); changed(); };
	if ( ! quick ) fieldRow.append( pattern );
	let settings, guide;
	if ( strokeOptions ) {

		settings = document.createElement( 'div' );
		settings.className = 'pencil-inline-stroke-options';
		settings.setAttribute( 'role', 'group' );
		settings.setAttribute( 'aria-label', 'Pencil stroke settings' );
		fieldRow.append( settings );
		const controls = settings;
		const stabilizer = modelField( controls, 'Stabilize strokes', 'toolPath', 'checkbox', brush.stabilize );
		stabilizer.onchange = () => { brush.stabilize = stabilizer.checked; refresh(); changed(); };

		guide = document.createElement( 'select' );
		guide.setAttribute( 'aria-label', 'Pencil drawing guide' );
		guide.title = 'Pencil drawing guide';
		for ( const [ id, label ] of [
			[ 'off', 'Freehand' ], [ 'circle', 'Circular' ], [ 'radial', 'Radial' ],
			[ 'parallel', 'Parallel' ], [ 'grid', 'Grid axes' ], [ 'iso', 'Isometric' ]
		] ) guide.append( new Option( label, id ) );
		guide.onchange = () => { brush.guide = guide.value; refresh(); changed(); };
		controls.append( guide );
		addStrokeControls?.( controls );
		for ( const [ key, label, glyph, min, max, step ] of [
			[ 'guideAngle', 'Guide angle (°)', 'rotate', -180, 180, 1 ],
			[ 'stabilizeRadius', 'Stabilizer radius (px)', 'brushWidth', 1, 100, 1 ],
			[ 'smoothing', 'Stroke smoothing', 'sculptSmooth', 0, 1, .05 ],
			[ 'simplify', 'Simplify tolerance (px)', 'toolPath', 0, 10, .25 ]
		] ) {

			if ( ! curveCleanup && ( key === 'smoothing' || key === 'simplify' ) ) continue;

			const input = modelField( controls, label, glyph, 'number', brush[ key ] );
			Object.assign( input, { min, max, step } );
			input.dataset.scrubSensitivity = String( step / 5 );
			input.onchange = () => {

				if ( Number.isFinite( input.valueAsNumber ) ) brush[ key ] = Math.max( min, Math.min( max, input.valueAsNumber ) );
				input.value = brush[ key ];
				refresh(); changed();

			};
			fields.push( [ key, input ] );

		}
		fields.push( [ 'stabilize', stabilizer ] );

	}

	const buttons = tips.map( ( [ name, size, strength, hardness, spacing = .12, aspect = 1, angle = 0, grain = 0, grainScale = 6, grainPattern = 'paper' ] ) => {

		const tip = { ...profileDefaults, ...tipProfiles[ name ], name, size, strength, hardness, spacing, aspect, angle, grain, grainScale, grainPattern };
		const button = modelButton( presets, name, 'brush', () => {

			Object.assign( brush, tip );
			if ( singleRow ) {

				presets.parentElement.open = false;
				presets.previousSibling.focus();

			}
			refresh(); changed();

		} );
		const sample = document.createElement( 'canvas' );
		sample.width = 44;
		sample.height = 24;
		sample.setAttribute( 'aria-hidden', 'true' );
		button.prepend( sample );
		drawBrushSample( sample, { ...tip, color: '#263449' } );
		return [ name, button ];

	} );
	let renderedPresets, lastPreview;
	function refresh() {

		for ( const [ key, input ] of fields ) {

			if ( input.type === 'checkbox' ) input.checked = brush[ key ];
			else if ( document.activeElement !== input ) input.value = displayValue( key );
			if ( key === 'guideAngle' ) input.disabled = brush.guide !== 'parallel';
			if ( key === 'sizeResponse' ) input.disabled = ! brush.pressureSize;
			if ( key === 'opacityResponse' ) input.disabled = ! brush.pressureOpacity;

		}
		if ( guide ) guide.value = brush.guide;
		pattern.value = brush.grainPattern;
		const records = savedBrushes();
		if ( renderedPresets !== records ) {

			renderedPresets = records;
			userPresets.replaceChildren( new Option( 'Saved brushes', '' ), ...records.map( item => new Option( item.name, item.name ) ) );
			userPresets.hidden = ! records.length;

		}
		const saved = records.some( item => item.name === brush.name );
		if ( userPresets.value !== ( saved ? brush.name : '' ) ) userPresets.value = saved ? brush.name : '';
		restorePreset.style.display = removePreset.style.display = saved ? '' : 'none';
		for ( const [ name, button ] of buttons ) button.setAttribute( 'aria-pressed', String( brush.name === name ) );
		if ( summaryCanvas ) {

			const preview = [ brush.name, brush.color, brush.size, brush.strength, brush.hardness, brush.spacing, brush.aspect, brush.angle,
				brush.grain, brush.grainScale, brush.grainPattern, brush.pressureSize, brush.pressureOpacity,
				brush.sizeResponse, brush.opacityResponse, brush.taperStart, brush.taperEnd ].join( '/' );
			if ( preview !== lastPreview ) {

				lastPreview = preview;
				drawBrushSample( summaryCanvas, brush );
				summaryCanvas.parentElement.title = 'Brush presets · ' + brush.name;

			}

		}

	}
	refresh();
	return { element: palette, refresh, showStrokeOptions( visible ) { if ( settings ) settings.hidden = ! visible; },
		showTipOptions( visible ) {
			for ( const [ key, input ] of fields ) if ( tipOptions.has( key ) ) input.parentElement.hidden = ! visible;
		}
	};

}
