import { modelButton, modelField } from './ModelControls.js?v=pencil-stroke-depth';
import { icon } from '../Glyphs.js?v=pencil-stroke-depth';
import { StrokeSampler } from './StrokeSampler.js';

// Size, strength and tip hardness from ThreeGrease's natural-media set.
const tips = [
	[ 'Pen', 8, 1, 1 ],
	[ 'Ink Rough', 20, 1, .9, .12, .85, 0 ],
	[ 'Marker', 30, .9, .85, .1, .45, .7 ],
	[ 'Charcoal', 26, .85, .55, .16, .6, 0 ],
	[ 'Airbrush', 46, .25, .15, .3 ],
	[ 'Pencil Soft', 10, .85, .7 ],
	[ 'Pencil Hard', 5, .7, 1 ],
	[ 'Ink Pooling', 14, 1, .95 ],
	[ 'Brush Pen', 26, 1, .85 ],
	[ 'Chalk', 30, .8, .4, .14, .75, .3 ],
	[ 'Dry Brush', 34, .9, .5, .2, .5, 0 ],
	[ 'Fading Marker', 24, .95, .8 ],
	[ 'Calligraphy', 22, 1, 1, .06, .25, .9 ]
];

export function brushFill( context, radius, color, hardness ) {

	if ( hardness >= 1 ) return color;
	const gradient = context.createRadialGradient( 0, 0, radius * hardness, 0, 0, radius );
	gradient.addColorStop( 0, color );
	gradient.addColorStop( 1, color + '00' );
	return gradient;

}

export function pencilBrush( editor ) {

	return editor.pencilBrush ||= { name: 'Pen', size: 8, strength: 1, hardness: 1, color: '#ffae66', stabilize: false, stabilizeRadius: 30, smoothing: 0, simplify: 0, guide: 'off', guideAngle: 0 };

}

export function brushDab( context, x, y, pressure, brush, erase = false ) {

	const radius = Math.max( .5, brush.size * Math.max( .2, pressure ) / 2 );
	context.save();
	context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
	context.globalAlpha = brush.strength;
	context.translate( x, y );
	context.rotate( brush.angle || 0 );
	context.scale( 1, brush.aspect || 1 );
	context.fillStyle = brushFill( context, radius, brush.color, brush.hardness );
	context.beginPath();
	context.arc( 0, 0, radius, 0, Math.PI * 2 );
	context.fill();
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

export function brushPalette( editor, host, changed = () => {}, { vectorOnly = false, strokeOptions = false } = {} ) {

	const brush = pencilBrush( editor );
	const palette = document.createElement( 'div' );
	palette.className = 'pencil-brush-palette';
	palette.setAttribute( 'role', 'group' );
	palette.setAttribute( 'aria-label', 'Pencil brush palette' );
	host.append( palette );
	const presets = document.createElement( 'div' );
	presets.className = 'pencil-brush-presets';
	palette.append( presets );
	const fields = [
		[ 'color', 'Brush color', 'color', 'color' ],
		[ 'size', 'Brush size (px)', 'brushWidth', 'number', 1, 256 ],
		[ 'strength', 'Brush strength', 'opacity', 'number', .01, 1 ],
		[ 'hardness', 'Brush hardness', 'brush', 'number', 0, 1 ]
	].filter( ( [ key ] ) => ! vectorOnly || key === 'color' || key === 'strength' ).map( ( [ key, name, glyph, type, min, max ] ) => {

		const input = modelField( palette, name, glyph, type, brush[ key ] );
		if ( type === 'number' ) Object.assign( input, { min, max, step: key === 'size' ? 1 : .05 } );
		input.onchange = () => {

			if ( type === 'color' ) brush.color = input.value;
			else if ( Number.isFinite( input.valueAsNumber ) ) brush[ key ] = Math.max( min, Math.min( max, input.valueAsNumber ) );
			input.value = brush[ key ];
			refresh(); changed();

		};
		return [ key, input ];

	} );
	let settings, guide;
	if ( strokeOptions ) {

		settings = document.createElement( 'details' );
		settings.className = 'pencil-stroke-settings';
		const summary = document.createElement( 'summary' );
		summary.innerHTML = icon( 'toolActions' );
		summary.title = 'Pencil stroke settings';
		summary.setAttribute( 'aria-label', summary.title );
		const controls = document.createElement( 'div' );
		controls.className = 'pencil-stroke-options';
		settings.append( summary, controls );
		settings.addEventListener( 'keydown', event => {

			if ( ! settings.open || event.key !== 'Escape' ) return;
			event.preventDefault();
			event.stopPropagation();
			settings.open = false;
			summary.focus();

		} );
		palette.append( settings );
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
		for ( const [ key, label, glyph, min, max, step ] of [
			[ 'guideAngle', 'Guide angle (°)', 'rotate', -180, 180, 1 ],
			[ 'stabilizeRadius', 'Stabilizer radius (px)', 'brushWidth', 1, 100, 1 ],
			[ 'smoothing', 'Stroke smoothing', 'sculptSmooth', 0, 1, .05 ],
			[ 'simplify', 'Simplify tolerance (px)', 'toolPath', 0, 10, .25 ]
		] ) {

			const input = modelField( controls, label, glyph, 'number', brush[ key ] );
			Object.assign( input, { min, max, step } );
			input.onchange = () => {

				if ( Number.isFinite( input.valueAsNumber ) ) brush[ key ] = Math.max( min, Math.min( max, input.valueAsNumber ) );
				input.value = brush[ key ];
				refresh(); changed();

			};
			fields.push( [ key, input ] );

		}
		fields.push( [ 'stabilize', stabilizer ] );

	}

	const buttons = tips.map( ( [ name, size, strength, hardness, spacing = .12, aspect = 1, angle = 0 ] ) => {

		const button = modelButton( presets, name, 'brush', () => {

			Object.assign( brush, { name, size, strength, hardness, spacing, aspect, angle } );
			refresh(); changed();

		} );
		const sample = document.createElement( 'canvas' );
		sample.width = 44;
		sample.height = 24;
		sample.setAttribute( 'aria-hidden', 'true' );
		button.prepend( sample );
		const context = sample.getContext( '2d' );
		const style = { size: Math.min( 17, size * .58 ), strength, hardness, spacing, aspect, angle, color: '#263449' };
		const draw = brushStroke( style, 7, 16, .7, ( x, y, pressure ) => brushDab( context, x, y, pressure, style ) );
		for ( let x = 8; x < 38; x ++ ) draw( x, 12 + Math.sin( x / 5 ) * 4, .35 + .65 * Math.sin( x / 15 ) );
		return [ name, button ];

	} );
	function refresh() {

		for ( const [ key, input ] of fields ) {

			if ( input.type === 'checkbox' ) input.checked = brush[ key ];
			else if ( document.activeElement !== input ) input.value = brush[ key ];
			if ( key === 'stabilizeRadius' ) input.disabled = ! brush.stabilize;
			if ( key === 'guideAngle' ) input.disabled = brush.guide !== 'parallel';

		}
		if ( guide ) guide.value = brush.guide;
		for ( const [ name, button ] of buttons ) button.setAttribute( 'aria-pressed', String( brush.name === name ) );

	}
	refresh();
	return { element: palette, refresh, showStrokeOptions( visible ) { if ( settings ) settings.hidden = ! visible; } };

}
