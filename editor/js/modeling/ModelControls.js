import { icon } from '../Glyphs.js?v=uv-seams';

function labelContent( node, label, glyph ) {

	const image = document.createElement( 'span' );
	image.className = 'model-control-icon';
	image.innerHTML = icon( glyph );
	const text = document.createElement( 'span' );
	text.className = 'model-control-label';
	text.textContent = label;
	node.append( image, text );
	node.title = label;

}

export function modelButton( parent, label, glyph, action, disabled = false ) {

	const button = document.createElement( 'button' );
	button.type = 'button';
	button.className = 'Button model-control-button';
	button.setAttribute( 'aria-label', label );
	button.disabled = disabled;
	labelContent( button, label, glyph );
	button.onclick = action;
	parent.append( button );
	return button;

}

export function modelField( parent, name, glyph, type, value ) {

	const label = document.createElement( 'label' );
	label.className = 'model-control-field';
	labelContent( label, name, glyph );
	const input = document.createElement( 'input' );
	input.type = type;
	input.setAttribute( 'aria-label', name );
	if ( type === 'checkbox' ) input.checked = !! value;
	else input.value = value;
	if ( type === 'number' ) input.step = 'any';
	label.append( input );
	parent.append( label );
	return input;

}
