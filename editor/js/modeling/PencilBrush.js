import { modelButton, modelField } from './ModelControls.js?v=pencil-stroke-depth';
import { grainOpacity, grainTileSize } from './PencilGrain.js';
import { StrokeSampler } from './StrokeSampler.js';

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
	[ 'Brush Pen', 26, 1, .85 ],
	[ 'Chalk', 30, .8, .4, .14, .75, .3, 0.8, 14, 'speckle' ],
	[ 'Dry Brush', 34, .9, .5, .2, .5, 0, 0.95, 18, 'fiber' ],
	[ 'Fading Marker', 24, .95, .8 ],
	[ 'Calligraphy', 22, 1, 1, .06, .25, .9 ]
];

function brushFill( context, radius, color, hardness ) {

	if ( hardness >= 1 ) return color;
	const gradient = context.createRadialGradient( 0, 0, radius * hardness, 0, 0, radius );
	gradient.addColorStop( 0, color );
	gradient.addColorStop( 1, color + '00' );
	return gradient;

}

export function pencilBrush( editor ) {

	return editor.pencilBrush ||= { name: 'Pen', size: 8, strength: 1, hardness: 1, grain: 0, grainScale: 6, grainPattern: 'paper', color: '#ffae66', stabilize: false, stabilizeRadius: 30, smoothing: 0, simplify: 0, guide: 'off', guideAngle: 0 };

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

	const radius = Math.max( .5, brush.size * Math.max( .2, pressure ) / 2 );
	context.save();
	context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
	context.globalAlpha = brush.strength;
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

	return event.pointerType === 'pen' ? event.pressure || .5 : 1;

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

export function brushPalette( editor, host, changed = () => {}, { strokeOptions = false, singleRow = false, addStrokeControls } = {} ) {

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
	const fields = [
		[ 'color', 'Brush color', 'color', 'color' ],
		[ 'size', 'Brush size (px)', 'brushWidth', 'number', 1, 256 ],
		[ 'strength', 'Brush strength', 'opacity', 'number', .01, 1 ],
		[ 'hardness', 'Brush hardness', 'brush', 'number', 0, 1 ],
		[ 'grain', 'Brush grain', 'toolGrid', 'number', 0, 1 ],
		[ 'grainScale', 'Grain scale', 'scale', 'number', 1, 30 ]
	].map( ( [ key, name, glyph, type, min, max ] ) => {

		const input = modelField( fieldRow, name, glyph, type, brush[ key ] );
		if ( type === 'number' ) {

			Object.assign( input, { min, max, step: key === 'size' ? 1 : key === 'grainScale' ? .5 : .05 } );
			input.dataset.scrubSensitivity = key === 'size' ? '.5' : key === 'grainScale' ? '.2' : '.005';

		}
		input.onchange = () => {

			if ( type === 'color' ) brush.color = input.value;
			else if ( Number.isFinite( input.valueAsNumber ) ) brush[ key ] = Math.max( min, Math.min( max, input.valueAsNumber ) );
			input.value = brush[ key ];
			refresh(); changed();

		};
		return [ key, input ];

	} );
	const pattern = document.createElement( 'select' );
	pattern.setAttribute( 'aria-label', 'Brush grain pattern' );
	pattern.title = 'Brush grain pattern';
	for ( const [ id, label ] of [ [ 'paper', 'Paper' ], [ 'fiber', 'Fibers' ], [ 'speckle', 'Speckles' ] ] ) pattern.append( new Option( label, id ) );
	pattern.onchange = () => { brush.grainPattern = pattern.value; refresh(); changed(); };
	fieldRow.append( pattern );
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

		const button = modelButton( presets, name, 'brush', () => {

			Object.assign( brush, { name, size, strength, hardness, spacing, aspect, angle, grain, grainScale, grainPattern } );
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
		const context = sample.getContext( '2d' );
		const style = { size: Math.min( 17, size * .58 ), strength, hardness, spacing, aspect, angle, grain, grainScale, grainPattern, color: '#263449' };
		const draw = brushStroke( style, 7, 16, .7, ( x, y, pressure ) => brushDab( context, x, y, pressure, style ) );
		for ( let x = 8; x < 38; x ++ ) draw( x, 12 + Math.sin( x / 5 ) * 4, .35 + .65 * Math.sin( x / 15 ) );
		return [ name, button, sample ];

	} );
	function refresh() {

		for ( const [ key, input ] of fields ) {

			if ( input.type === 'checkbox' ) input.checked = brush[ key ];
			else if ( document.activeElement !== input ) input.value = brush[ key ];
			if ( key === 'stabilizeRadius' ) input.disabled = ! brush.stabilize;
			if ( key === 'guideAngle' ) input.disabled = brush.guide !== 'parallel';

		}
		if ( guide ) guide.value = brush.guide;
		pattern.value = brush.grainPattern;
		for ( const [ name, button, sample ] of buttons ) {

			button.setAttribute( 'aria-pressed', String( brush.name === name ) );
			if ( summaryCanvas && brush.name === name ) {

				const context = summaryCanvas.getContext( '2d' );
				context.clearRect( 0, 0, summaryCanvas.width, summaryCanvas.height );
				context.drawImage( sample, 0, 0 );
				summaryCanvas.parentElement.title = 'Brush presets · ' + name;

			}

		}

	}
	refresh();
	return { element: palette, refresh, showStrokeOptions( visible ) { if ( settings ) settings.hidden = ! visible; } };

}
