// Raw <button>, <select>, <input> and <textarea> elements built by panels (Streams, Assets, dialogs...) adopt the
// shared Button / Select / Input classes so they follow the same theme: transparent buttons and dropdowns,
// borderless filled value fields, accent-coloured numbers.
const skip = 'button, select, input, textarea';
const excluded = '#menubar, .panel-toggles, #toolbar, .CodeMirror, .cm-editor, .asset-card, .example-library, .TabbedPanel .Tabs, .outliner-toggle, .Outliner, .Select, .Button, .Input, .TextArea, .Listbox';
const textTypes = new Set( [ 'text', 'search', 'url', 'email', 'password', 'tel', 'number', '' ] );

function adopt( element ) {

	if ( element.dataset.uiRaw === 'keep' || element.closest( excluded ) ) return;
	if ( element.className && /\b(Select|Button|Input|TextArea)\b/.test( element.className ) ) return;
	const tag = element.localName;
	if ( tag === 'button' ) element.classList.add( 'Button' );
	else if ( tag === 'select' ) element.classList.add( 'Select' );
	else if ( tag === 'textarea' ) element.classList.add( 'TextArea' );
	else if ( tag === 'input' && textTypes.has( ( element.getAttribute( 'type' ) || '' ).toLowerCase() ) ) {

		element.classList.add( 'Input' );
		if ( element.type === 'number' ) element.classList.add( 'Number' );

	}

}

function scan( root ) {

	if ( root.nodeType !== 1 ) return;
	if ( root.matches( skip ) ) adopt( root );
	for ( const element of root.querySelectorAll( skip ) ) adopt( element );

}

export function applyUIConsistency() {

	scan( document.body );
	let queued = false;
	const pending = new Set();
	new MutationObserver( records => {

		for ( const record of records ) for ( const node of record.addedNodes ) pending.add( node );
		if ( queued ) return;
		queued = true;
		requestAnimationFrame( () => { queued = false; for ( const node of pending ) scan( node ); pending.clear(); } );

	} ).observe( document.body, { childList: true, subtree: true } );

}
