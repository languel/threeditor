import { Vector3 } from 'three';

class ViewportLabels {

	constructor( editor, viewport ) {

		this.editor = editor;
		const canvas = this.canvas = document.createElement( 'canvas' );
		canvas.className = 'viewport-labels';
		canvas.setAttribute( 'aria-hidden', 'true' );
		canvas.hidden = true;
		viewport.appendChild( canvas );
		this.context = canvas.getContext( '2d' );
		this.anchor = new Vector3();

	}

	draw( frames, width, height ) {

		const { canvas, context, editor, anchor } = this;
		canvas.hidden = ! editor.config.getKey( 'settings/showObjectNames' );
		if ( canvas.hidden || ! context ) return;

		const ratio = window.devicePixelRatio || 1;
		const pixelWidth = Math.round( width * ratio ), pixelHeight = Math.round( height * ratio );
		if ( canvas.width !== pixelWidth ) canvas.width = pixelWidth;
		if ( canvas.height !== pixelHeight ) canvas.height = pixelHeight;
		context.setTransform( ratio, 0, 0, ratio, 0, 0 );
		context.clearRect( 0, 0, width, height );
		context.font = '12px system-ui, sans-serif';
		context.textBaseline = 'middle';
		context.textAlign = 'center';

		const selection = new Set( editor.selector.selection );
		const named = [];
		function visit( object ) {

			if ( ! object.visible || object.userData.runtimeOnly || object.userData.threeditor?.disabled ) return;
			if ( object.name.trim() ) named.push( object );
			for ( const child of object.children ) visit( child );

		}
		for ( const object of editor.scene.children ) visit( object );
		named.sort( ( a, b ) => Number( selection.has( b ) ) - Number( selection.has( a ) ) );

		for ( const { camera, rect, source } of frames ) {

			const placed = [];
			const { x, y, width, height } = rect;
			context.save();
			context.beginPath();
			context.rect( x, y, width, height );
			context.clip();
			for ( const object of named ) {

				if ( object === camera || object === source || ! camera.layers.test( object.layers ) ) continue;
				anchor.setFromMatrixPosition( object.matrixWorld ).project( camera );
				if ( ! Number.isFinite( anchor.z ) || anchor.z < - 1 || anchor.z > 1 || Math.abs( anchor.x ) > 1 || Math.abs( anchor.y ) > 1 ) continue;

				const labelWidth = Math.min( context.measureText( object.name ).width + 10, width );
				const left = Math.max( x, Math.min( x + ( anchor.x + 1 ) * width / 2 - labelWidth / 2, x + width - labelWidth ) );
				const top = Math.max( y, Math.min( y + ( 1 - anchor.y ) * height / 2 - 20, y + height - 18 ) );
				if ( placed.some( label => left < label.right && left + labelWidth > label.left && top < label.bottom && top + 18 > label.top ) ) continue;
				placed.push( { left, top, right: left + labelWidth, bottom: top + 18 } );

				context.fillStyle = 'rgba(12, 16, 24, 0.82)';
				context.fillRect( left, top, labelWidth, 18 );
				context.fillStyle = selection.has( object ) ? '#ffd282' : '#fff';
				context.fillText( object.name, left + labelWidth / 2, top + 9, Math.max( 1, labelWidth - 10 ) );

			}
			context.restore();

		}

	}

}

export { ViewportLabels };
