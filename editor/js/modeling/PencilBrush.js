import { modelButton, modelField } from './ModelControls.js';
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

	return editor.pencilBrush ||= { name: 'Pen', size: 8, strength: 1, hardness: 1, color: '#ffae66' };

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

export function brushPalette( editor, host, changed = () => {}, vector = false ) {

	const brush = pencilBrush( editor );
	const palette = document.createElement( 'div' );
	palette.className = 'pencil-brush-palette';
	palette.setAttribute( 'role', 'group' );
	palette.setAttribute( 'aria-label', 'Pencil brush palette' );
	host.append( palette );
	palette.classList.toggle( 'pencil-vector-settings', vector );
	const presets = document.createElement( 'div' );
	presets.className = 'pencil-brush-presets';
	palette.append( presets );
	const fields = [
		[ 'color', 'Brush color', 'color', 'color' ],
		[ 'size', 'Brush size (px)', 'brushWidth', 'number', 1, 256 ],
		[ 'strength', 'Brush strength', 'opacity', 'number', .01, 1 ],
		[ 'hardness', 'Brush hardness', 'brush', 'number', 0, 1 ]
	].filter( ( [ key ] ) => ! vector || key === 'color' || key === 'strength' ).map( ( [ key, name, glyph, type, min, max ] ) => {

		const input = modelField( palette, name, glyph, type, brush[ key ] );
		if ( type === 'number' ) Object.assign( input, { min, max, step: key === 'size' ? 1 : .05 } );
		input.onchange = () => {

			if ( type === 'color' ) brush.color = input.value;
			else if ( Number.isFinite( input.valueAsNumber ) ) brush[ key ] = Math.max( min, Math.min( max, input.valueAsNumber ) );
			refresh(); changed();

		};
		return [ key, input ];

	} );
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

		for ( const [ key, input ] of fields ) input.value = brush[ key ];
		for ( const [ name, button ] of buttons ) button.setAttribute( 'aria-pressed', String( brush.name === name ) );

	}
	refresh();
	return { element: palette, refresh };

}
