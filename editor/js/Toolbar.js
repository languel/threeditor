import { icon } from './Glyphs.js?v=mode-shelves';
import { addTransformSettings } from './TransformSettings.js?v=editor-glyphs';
import { UIPanel, UIButton } from './libs/ui.js';

function Toolbar( editor ) {

	const signals = editor.signals;
	const strings = editor.strings;

	const container = new UIPanel();
	container.setId( 'toolbar' );

	const tools = editor.viewTools.transformTools;
	const modes = new Map( [ [ 'translate', 'move' ], [ 'rotate', 'rotate' ], [ 'scale', 'scale' ] ].map( ( [ mode, glyph ] ) => {

		const button = new UIButton();
		button.dom.title = strings.getKey( 'toolbar/' + mode );
		button.dom.setAttribute( 'aria-label', button.dom.title );
		button.dom.innerHTML = icon( glyph );
		button.onClick( () => signals.transformModeChanged.dispatch( mode ) );
		tools.append( button.dom );
		return [ mode, button.dom ];

	} ) );
	const updateMode = mode => {

		for ( const [ id, button ] of modes ) button.setAttribute( 'aria-pressed', String( id === mode ) );

	};
	updateMode( 'translate' );
	signals.transformModeChanged.add( updateMode );

	addTransformSettings( editor, container.dom );
	return container;

}

export { Toolbar };
