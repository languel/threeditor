import { UIDiv, UIPanel, UIRow, UISelect, UIText } from './libs/ui.js';
import { presets, resolveTheme, uiStyles, resolveUIStyle, uiFonts, resolveUIFont } from './Theme.js';
import { UIBoolean } from './libs/ui.three.js';

import { SidebarSettingsShortcuts } from './Sidebar.Settings.Shortcuts.js';
import { SidebarSettingsHistory } from './Sidebar.Settings.History.js';
import { codeEditorSettings, setCodeEditorSettings, fonts } from './CodeEditorSettings.js';

function SidebarSettings( editor ) {

	const { config, signals, strings } = editor;
	const container = new UIDiv().setClass( 'settings' );

	function addSection( label, content, open = false ) {

		const details = document.createElement( 'details' );
		details.className = 'settings-section';
		details.open = open;
		const summary = document.createElement( 'summary' );
		summary.textContent = label;
		details.append( summary, content.dom );
		container.dom.appendChild( details );

	}

	const general = new UIPanel();
	const languageRow = new UIRow();
	const languageLabel = strings.getKey( 'sidebar/settings/language' );
	const language = new UISelect().setWidth( '150px' );
	language.dom.setAttribute( 'aria-label', languageLabel );
	language.setOptions( Object.fromEntries( [ 'en', 'fr', 'zh', 'ja', 'ko', 'fa' ].map( locale => {

		return [ locale, new Intl.DisplayNames( locale, { type: 'language' } ).of( locale ) ];

	} ) ) );
	language.setValue( config.getKey( 'language' ) );
	language.onChange( function () {

		config.setKey( 'language', this.getValue() );

	} );
	languageRow.add( new UIText( languageLabel ).setClass( 'Label' ), language );
	general.add( languageRow );

	const autosave = new UIBoolean( config.getKey( 'autosave' ), strings.getKey( 'sidebar/settings/autosave' ) );
	const autosaveLabel = document.createElement( 'label' );
	autosaveLabel.className = 'settings-checkbox';
	autosaveLabel.appendChild( autosave.dom );
	if ( editor.portable ) {

		autosave.checkbox.dom.disabled = true;
		autosaveLabel.title = 'Use File → Publish → Editable HTML to save changes to this copy';

	}
	general.dom.appendChild( autosaveLabel );

	const autoHideMenubar = new UIBoolean( config.getKey( 'settings/autoHideMenubar' ), 'Auto-hide top menu' );
	const autoHideLabel = document.createElement( 'label' );
	autoHideLabel.className = 'settings-checkbox';
	autoHideLabel.style.display = 'block';
	autoHideLabel.appendChild( autoHideMenubar.dom );
	general.dom.appendChild( autoHideLabel );
	autoHideMenubar.onChange( function () {

		config.setKey( 'settings/autoHideMenubar', this.getValue() );
		signals.menuAutoHideChanged.dispatch();

	} );

	const mouseNavigationRow = new UIRow();
	const mouseNavigation = new UISelect().setOptions( { basic: 'Standard', blender: 'Blender' } );
	mouseNavigation.dom.setAttribute( 'aria-label', 'Mouse navigation' );
	mouseNavigation.dom.title = 'Independent of keyboard shortcuts. Standard: drag to orbit, Shift-drag or right-drag to pan, scroll to zoom.';
	mouseNavigation.setValue( config.getKey( 'settings/mouseNavigation' ) || 'basic' );
	mouseNavigation.onChange( function () {

		config.setKey( 'settings/mouseNavigation', this.getValue() );

	} );
	mouseNavigationRow.add( new UIText( 'Mouse navigation' ).setClass( 'Label' ), mouseNavigation );
	general.add( mouseNavigationRow );

	const uiStyleRow = new UIRow();
	const uiStyle = new UISelect().setOptions( uiStyles );
	uiStyle.dom.setAttribute( 'aria-label', 'Interface style' );
	uiStyle.dom.title = 'Default keeps the current look. Compact is denser with consistent type. Clean keeps comfortable spacing with consistent type.';
	uiStyle.setValue( resolveUIStyle( config ) );
	uiStyle.onChange( function () {

		config.setKey( 'settings/uiStyle', this.getValue() );
		signals.uiStyleChanged.dispatch();

	} );
	uiStyleRow.add( new UIText( 'Interface style' ).setClass( 'Label' ), uiStyle );
	general.add( uiStyleRow );

	const uiFontRow = new UIRow();
	const uiFont = new UISelect().setOptions( uiFonts );
	uiFont.dom.setAttribute( 'aria-label', 'Interface font' );
	uiFont.setValue( resolveUIFont( config ) );
	uiFont.onChange( function () {

		config.setKey( 'settings/uiFont', this.getValue() );
		signals.uiStyleChanged.dispatch();

	} );
	uiFontRow.add( new UIText( 'Interface font' ).setClass( 'Label' ), uiFont );
	general.add( uiFontRow );

	const emulateMouse = new UIBoolean( config.getKey( 'settings/emulateThreeButtonMouse' ), 'Emulate 3-button mouse (Blender)' );
	const emulateMouseLabel = document.createElement( 'label' );
	emulateMouseLabel.className = 'settings-checkbox';
	emulateMouseLabel.style.display = 'block';
	emulateMouseLabel.title = 'Option/Alt + left drag orbits; add Shift to pan or Ctrl/Command to zoom';
	emulateMouseLabel.appendChild( emulateMouse.dom );
	general.dom.appendChild( emulateMouseLabel );
	emulateMouse.onChange( function () {

		config.setKey( 'settings/emulateThreeButtonMouse', this.getValue() );

	} );
	autosave.onChange( function () {

		const value = this.getValue();
		config.setKey( 'autosave', value );
		if ( value ) signals.sceneGraphChanged.dispatch();

	} );
	signals.savingStarted.add( () => autosave.text.setTextDecoration( 'underline' ) );
	signals.savingFinished.add( () => autosave.text.setTextDecoration( 'none' ) );
	addSection( strings.getKey( 'sidebar/settings/general' ), general, true );

	const codeSettings = new UIPanel();
	const codeControls = {};
	function codeRow( label, key, control ) {

		const row = document.createElement( 'label' );
		row.className = 'settings-code-row';
		const text = document.createElement( 'span' );
		text.textContent = label;
		control.setAttribute( 'aria-label', label );
		row.append( text, control );
		codeSettings.dom.appendChild( row );
		codeControls[ key ] = control;
		control.addEventListener( 'change', () => {

			const value = control.type === 'checkbox' ? control.checked : control.type === 'number' ? Math.max( 8, Math.min( 32, Number( control.value ) || 13 ) ) : control.value;
			setCodeEditorSettings( editor, { [ key ]: value } );

		} );

	}
	const font = document.createElement( 'select' );
	for ( const name of fonts ) font.add( new Option( name, name ) );
	codeRow( 'Font', 'font', font );
	const size = document.createElement( 'input' );
	size.type = 'number'; size.min = '8'; size.max = '32'; size.step = '1';
	codeRow( 'Font size', 'fontSize', size );
	for ( const [ key, label ] of [ [ 'ligatures', 'Ligatures' ], [ 'completion', 'Code completion' ], [ 'lint', 'Diagnostics' ], [ 'lineNumbers', 'Line numbers' ], [ 'folding', 'Fold blocks' ], [ 'wrap', 'Wrap lines' ] ] ) {

		const input = document.createElement( 'input' ); input.type = 'checkbox';
		codeRow( label, key, input );

	}
	function refreshCodeSettings() {

		const settings = codeEditorSettings( editor );
		for ( const [ key, control ] of Object.entries( codeControls ) ) {

			if ( control.type === 'checkbox' ) control.checked = settings[ key ]; else control.value = settings[ key ];

		}

	}
	document.addEventListener( 'threeditor-code-settings', refreshCodeSettings );
	refreshCodeSettings();
	addSection( 'Code editor', codeSettings );

	const themeLabel = strings.getKey( 'sidebar/settings/theme' );
	const themePanel = new UIPanel();
	const theme = new UISelect().setWidth( '100%' );
	theme.dom.setAttribute( 'aria-label', themeLabel );

	function refreshThemes() {

		const saved = config.getKey( 'settings/userThemes' ) || {};
		theme.setOptions( {
			system: strings.getKey( 'sidebar/settings/theme/system' ),
			...Object.fromEntries( Object.entries( presets ).map( ( [ id, value ] ) => [ id, value.name ] ) ),
			...Object.fromEntries( Object.keys( saved ).map( name => [ 'user:' + name, name ] ) )
		} );
		theme.setValue( config.getKey( 'settings/theme' ) );

	}

	const fields = [
		[ 'background', 'Panel' ], [ 'surface', 'Surface' ], [ 'text', 'Text' ],
		[ 'accent', 'Accent' ], [ 'viewport', 'Viewport' ], [ 'keyword', 'Keyword' ], [ 'string', 'String' ]
	];
	const inputs = new Map();
	const alphas = new Map();
	const colors = document.createElement( 'div' );
	colors.className = 'theme-colors';
	for ( const [ key, label ] of fields ) {

		const row = document.createElement( 'label' );
		const text = document.createElement( 'span' );
		text.textContent = label;
		const input = document.createElement( 'input' );
		input.type = 'color';
		input.className = 'Color Input';
		input.setAttribute( 'aria-label', label );
		const alpha = document.createElement( 'input' );
		alpha.type = 'number';
		alpha.className = 'theme-alpha';
		alpha.min = '0';
		alpha.max = '100';
		alpha.step = '1';
		alpha.setAttribute( 'aria-label', label + ' opacity percent' );
		alpha.title = 'Opacity (%)';
		const controls = document.createElement( 'span' );
		controls.className = 'theme-color-controls';
		const percent = document.createElement( 'span' );
		percent.textContent = '%';
		percent.setAttribute( 'aria-hidden', 'true' );
		controls.append( input, alpha, percent );
		row.append( text, controls );
		colors.appendChild( row );
		inputs.set( key, input );
		alphas.set( key, alpha );
		const preview = () => {

			const opacity = Math.max( 0, Math.min( 100, Number( alpha.value ) || 0 ) );
			const suffix = opacity === 100 ? '' : Math.round( opacity * 255 / 100 ).toString( 16 ).padStart( 2, '0' );
			document.documentElement.style.setProperty( '--theme-' + key, input.value + suffix );
			if ( key === 'viewport' || key === 'background' ) signals.themePreviewChanged.dispatch();

		};
		input.addEventListener( 'input', preview );
		alpha.addEventListener( 'input', preview );
		alpha.addEventListener( 'change', () => { alpha.value = Math.max( 0, Math.min( 100, Number( alpha.value ) || 0 ) ); } );

	}

	function refreshColors() {

		const selected = resolveTheme( config, window.matchMedia( '(prefers-color-scheme: dark)' ).matches );
		for ( const [ key, input ] of inputs ) {

			const value = selected.colors[ key ];
			input.value = value.slice( 0, 7 );
			alphas.get( key ).value = value.length === 9 ? Math.round( parseInt( value.slice( 7 ), 16 ) / 255 * 100 ) : 100;

		}

	}

	theme.onChange( function () {

		config.setKey( 'settings/theme', this.getValue() );
		signals.themeChanged.dispatch();
		refreshColors();

	} );
	themePanel.add( theme );
	themePanel.dom.appendChild( colors );

	const name = document.createElement( 'input' );
	name.className = 'Input theme-name';
	name.placeholder = 'Theme name';
	name.setAttribute( 'aria-label', 'Theme name' );
	const save = document.createElement( 'button' );
	save.className = 'Button';
	save.textContent = 'Save theme';
	const remove = document.createElement( 'button' );
	remove.className = 'Button';
	remove.textContent = 'Delete';
	remove.title = 'Delete selected saved theme';
	const actions = document.createElement( 'div' );
	actions.className = 'theme-actions';
	actions.append( name, save, remove );
	themePanel.dom.appendChild( actions );

	save.addEventListener( 'click', () => {

		const value = name.value.trim();
		if ( ! value ) {

			name.focus();
			return;

		}

		const current = resolveTheme( config, window.matchMedia( '(prefers-color-scheme: dark)' ).matches );
		const saved = { ...( config.getKey( 'settings/userThemes' ) || {} ) };
		Object.defineProperty( saved, value, { value: { name: value, mode: current.mode, colors: Object.fromEntries( [ ...inputs ].map( ( [ key ] ) => [ key, document.documentElement.style.getPropertyValue( '--theme-' + key ).trim() ] ) ) }, enumerable: true, configurable: true, writable: true } );
		config.setKey( 'settings/userThemes', saved, 'settings/theme', 'user:' + value );
		refreshThemes();
		signals.themeChanged.dispatch();
		name.value = '';

	} );

	remove.addEventListener( 'click', () => {

		const id = config.getKey( 'settings/theme' );
		if ( ! id?.startsWith( 'user:' ) ) return;
		const saved = { ...( config.getKey( 'settings/userThemes' ) || {} ) };
		delete saved[ id.slice( 5 ) ];
		config.setKey( 'settings/userThemes', saved, 'settings/theme', 'system' );
		refreshThemes();
		signals.themeChanged.dispatch();
		refreshColors();

	} );

	signals.themeChanged.add( () => {

		remove.disabled = ! config.getKey( 'settings/theme' )?.startsWith( 'user:' );
		if ( config.getKey( 'settings/theme' ) === 'system' ) refreshColors();

	} );
	refreshThemes();
	refreshColors();
	remove.disabled = ! config.getKey( 'settings/theme' )?.startsWith( 'user:' );
	addSection( themeLabel, themePanel, true );

	addSection( strings.getKey( 'sidebar/settings/shortcuts' ), new SidebarSettingsShortcuts( editor ) );
	addSection( strings.getKey( 'sidebar/history' ), new SidebarSettingsHistory( editor ) );

	return container;

}

export { SidebarSettings };
