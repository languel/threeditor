import { modelButton } from './ModelControls.js?v=uv-seams';

export const selectionTools2D = [
	[ 'select', 'Select', 'toolSelect' ], [ 'box', 'Box Select', 'selectBox' ],
	[ 'circle', 'Circle Select', 'selectCircle' ], [ 'lasso', 'Lasso Select', 'selectLasso' ]
];

export const transformTools2D = [
	[ 'move', 'Move', 'move' ], [ 'rotate', 'Rotate', 'rotate' ], [ 'scale', 'Scale', 'scale' ]
];

export function createCanvasShelf( canvas, entries, onChange, label ) {

	const element = document.createElement( 'div' );
	element.className = 'editor-2d-tools canvas-tool-shelf';
	element.setAttribute( 'role', 'group' );
	element.setAttribute( 'aria-label', label );
	const buttons = new Map();
	for ( const [ id, name, glyph ] of entries ) buttons.set( id, modelButton( element, name, glyph, () => {

		onChange( id );
		canvas.focus( { preventScroll: true } );

	} ) );
	return { element, update( active ) {

		for ( const [ id, button ] of buttons ) button.setAttribute( 'aria-pressed', String( id === active ) );

	} };

}

export function canvasView( canvas, draw, isPan ) {

	let scale = 1, x = 0, y = 0, pan;
	const pixels = event => {

		const rect = canvas.getBoundingClientRect();
		return [ ( event.clientX - rect.left ) * canvas.width / rect.width, ( event.clientY - rect.top ) * canvas.height / rect.height ];

	};
	const point = event => {

		const [ px, py ] = pixels( event );
		return [ ( px - x ) / scale, ( py - y ) / scale ];

	};
	canvas.addEventListener( 'wheel', event => {

		event.preventDefault();
		const [ px, py ] = pixels( event );
		const [ u, v ] = point( event );
		const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
		scale = Math.max( .25, Math.min( 16, scale * Math.exp( -delta * .0015 ) ) );
		x = px - u * scale;
		y = py - v * scale;
		draw();

	}, { passive: false } );
	canvas.addEventListener( 'pointerdown', event => {

		if ( event.button !== 1 && ( event.button !== 0 || ! isPan() ) ) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		canvas.focus( { preventScroll: true } );
		pan = { id: event.pointerId, start: pixels( event ), x, y };
		canvas.setPointerCapture( event.pointerId );

	}, true );
	canvas.addEventListener( 'pointermove', event => {

		if ( pan?.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		const [ px, py ] = pixels( event );
		x = pan.x + px - pan.start[ 0 ];
		y = pan.y + py - pan.start[ 1 ];
		draw();

	}, true );
	for ( const type of [ 'pointerup', 'pointercancel', 'lostpointercapture' ] ) canvas.addEventListener( type, event => {

		if ( pan?.id !== event.pointerId ) return;
		event.stopImmediatePropagation();
		pan = null;

	}, true );
	return {
		point,
		apply( context ) { context.translate( x, y ); context.scale( scale, scale ); },
		fit() { scale = 1; x = y = 0; draw(); },
		get scale() { return scale; }
	};

}

export function transformCanvasPoint( tool, point, from, to, pivot ) {

	if ( tool === 'move' ) return point.map( ( value, i ) => value + to[ i ] - from[ i ] );
	const ax = from[ 0 ] - pivot[ 0 ], ay = from[ 1 ] - pivot[ 1 ];
	const bx = to[ 0 ] - pivot[ 0 ], by = to[ 1 ] - pivot[ 1 ];
	const dx = point[ 0 ] - pivot[ 0 ], dy = point[ 1 ] - pivot[ 1 ];
	if ( tool === 'scale' ) {

		const start = Math.hypot( ax, ay );
		const factor = Math.max( .001, start < .005 ? 1 + ( to[ 0 ] - from[ 0 ] ) * 4 : Math.hypot( bx, by ) / start );
		return [ pivot[ 0 ] + dx * factor, pivot[ 1 ] + dy * factor ];

	}
	const angle = Math.hypot( ax, ay ) < .005 ? ( to[ 0 ] - from[ 0 ] ) * Math.PI * 2 : Math.atan2( by, bx ) - Math.atan2( ay, ax );
	const cos = Math.cos( angle ), sin = Math.sin( angle );
	return [ pivot[ 0 ] + dx * cos - dy * sin, pivot[ 1 ] + dx * sin + dy * cos ];

}
