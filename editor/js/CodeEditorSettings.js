const defaults = { font: 'Menlo', fontSize: 13, ligatures: false, completion: true, lint: true, lineNumbers: true, folding: true, wrap: false };
const fonts = [ 'Menlo', 'Monaco', 'SF Mono', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Source Code Pro', 'IBM Plex Mono', 'Consolas', 'Courier New' ];

function codeEditorSettings( editor ) {

	return { ...defaults, ...editor.config.getKey( 'settings/codeEditor' ) };

}

function setCodeEditorSettings( editor, changes ) {

	editor.config.setKey( 'settings/codeEditor', { ...codeEditorSettings( editor ), ...changes } );
	document.dispatchEvent( new CustomEvent( 'threeditor-code-settings' ) );

}

export { codeEditorSettings, setCodeEditorSettings, fonts };
