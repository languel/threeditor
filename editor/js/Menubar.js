import { WorkspaceTabs } from './WorkspaceTabs.js?v=script-window';
import { UIPanel } from './libs/ui.js';

import { MenubarAdd } from './Menubar.Add.js?v=unified-sync';
import { MenubarEdit } from './Menubar.Edit.js?v=unified-sync';
import { MenubarFile } from './Menubar.File.js?v=projector-mapping';
import { MenubarView } from './Menubar.View.js?v=unified-sync';
import { MenubarRender } from './Menubar.Render.js?v=scene-timeline';
import { MenubarHelp } from './Menubar.Help.js';
import { formatCombo } from './Keymap.js?v=script-window';

function Menubar( editor, { sidebar, sidebarDock, timelineDock, toolbar } ) {

	const container = new UIPanel();
	container.setId( 'menubar' );

	const menus = new UIPanel().setClass( 'app-menus' );
	container.add( menus );
	menus.add( new MenubarFile( editor ) );
	menus.add( new MenubarEdit( editor ) );
	menus.add( new MenubarAdd( editor ) );
	menus.add( new MenubarView( editor ) );
	menus.add( new MenubarRender( editor ) );

	menus.add( new MenubarHelp( editor ) );
	container.dom.append( WorkspaceTabs( editor, sidebar, sidebarDock ) );

	const toggles = document.createElement( 'div' );
	toggles.className = 'panel-toggles';
	toggles.setAttribute( 'role', 'group' );
	toggles.setAttribute( 'aria-label', 'Workspace controls' );
	container.dom.appendChild( toggles );
	toggles.prepend( editor.editWorkspace.picker );

	function iconButton( label, path ) {

		const button = document.createElement( 'button' );
		button.type = 'button';
		button.title = label;
		button.setAttribute( 'aria-label', label );
		button.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${ path }</svg>`;
		toggles.appendChild( button );
		return button;

	}

	const playGlyph = '<path d="M6 4.5 16 10 6 15.5Z"/>';
	const stopGlyph = '<rect x="5" y="5" width="10" height="10" rx="1"/>';
	const playScene = iconButton( 'Play Scene', playGlyph );
	playScene.classList.add( 'workspace-play-scene' );
	playScene.setAttribute( 'aria-controls', 'player' );
	playScene.addEventListener( 'click', () => editor.keymap.run( 'play' ) );
	function syncPlayer( playing ) {

		const label = playing ? 'Stop Scene' : 'Play Scene';
		playScene.setAttribute( 'aria-label', label );
		playScene.setAttribute( 'aria-pressed', String( playing ) );
		playScene.querySelector( 'svg' ).innerHTML = playing ? stopGlyph : playGlyph;
		const binding = editor.keymap.combo( 'play' );
		playScene.title = label + ( binding ? ' (' + formatCombo( binding ) + ')' : '' );

	}
	editor.signals.startPlayer.add( () => syncPlayer( true ) );
	editor.signals.stopPlayer.add( () => syncPlayer( false ) );
	editor.keymap.listeners.add( () => syncPlayer( playScene.getAttribute( 'aria-pressed' ) === 'true' ) );
	syncPlayer( false );

	iconButton( 'Open asset browser', '<path d="M2 6h6l2-3h8v14H2z"/><path d="M2 7h16"/>' ).addEventListener( 'click', () => editor.assetBrowser.reveal() );

	const frame = '<rect x="2.5" y="3.5" width="15" height="13" rx="2"/>';
	sidebarDock.bindToggle( iconButton( 'Toggle right sidebar', frame + '<path d="M12.5 4v12"/>' ) );
	timelineDock.bindToggle( iconButton( 'Toggle animation timeline', frame + '<path d="M3 12h14"/>' ) );

	const toolbarButton = iconButton( 'Toggle transform toolbar', '<rect x="2.5" y="6" width="15" height="8" rx="2"/><path d="M7.5 8v4m5-4v4"/>' );
	toolbarButton.setAttribute( 'aria-controls', toolbar.id );
	toolbarButton.setAttribute( 'aria-pressed', 'true' );
	toolbarButton.addEventListener( 'click', () => {

		toolbar.hidden = ! toolbar.hidden;
		toolbarButton.setAttribute( 'aria-pressed', String( ! toolbar.hidden ) );

	} );

	const gearPath = '<path d="m8 2.5-.4 2-1.7 1-1.9-.7-2 3.4 1.5 1.4v2l-1.5 1.4 2 3.4 1.9-.7 1.7 1 .4 2h4l.4-2 1.7-1 1.9.7 2-3.4-1.5-1.4v-2l1.5-1.4-2-3.4-1.9.7-1.7-1-.4-2z"/><circle cx="10" cy="10" r="2.5"/>';
	const settingsButton = iconButton( editor.strings.getKey( 'sidebar/settings' ), gearPath );
	settingsButton.setAttribute( 'aria-controls', sidebar.dom.id );
	settingsButton.addEventListener( 'click', () => {

		sidebar.select( 'settings' );
		sidebarDock.toggle( true );

	} );

	return container;

}

export { Menubar };
