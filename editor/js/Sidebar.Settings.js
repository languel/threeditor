import { UIDiv, UIPanel, UIRow, UISelect, UIText } from './libs/ui.js';
import { UIBoolean } from './libs/ui.three.js';

import { SidebarSettingsShortcuts } from './Sidebar.Settings.Shortcuts.js';
import { SidebarSettingsHistory } from './Sidebar.Settings.History.js';

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
	autosave.onChange( function () {

		const value = this.getValue();
		config.setKey( 'autosave', value );
		if ( value ) signals.sceneGraphChanged.dispatch();

	} );
	signals.savingStarted.add( () => autosave.text.setTextDecoration( 'underline' ) );
	signals.savingFinished.add( () => autosave.text.setTextDecoration( 'none' ) );
	addSection( strings.getKey( 'sidebar/settings/general' ), general, true );

	const themeLabel = strings.getKey( 'sidebar/settings/theme' );
	const theme = new UISelect().setWidth( '150px' );
	theme.dom.setAttribute( 'aria-label', themeLabel );
	theme.setOptions( {
		system: strings.getKey( 'sidebar/settings/theme/system' ),
		light: strings.getKey( 'sidebar/settings/theme/light' ),
		dark: strings.getKey( 'sidebar/settings/theme/dark' )
	} );
	theme.setValue( config.getKey( 'settings/theme' ) );
	theme.onChange( function () {

		config.setKey( 'settings/theme', this.getValue() );
		signals.themeChanged.dispatch();

	} );
	addSection( themeLabel, new UIPanel().add( theme ), true );

	addSection( strings.getKey( 'sidebar/settings/shortcuts' ), new SidebarSettingsShortcuts( editor ) );
	addSection( strings.getKey( 'sidebar/history' ), new SidebarSettingsHistory( editor ) );

	return container;

}

export { SidebarSettings };
