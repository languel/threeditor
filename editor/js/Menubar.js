import { UIPanel } from './libs/ui.js';

import { MenubarAdd } from './Menubar.Add.js';
import { MenubarEdit } from './Menubar.Edit.js';
import { MenubarFile } from './Menubar.File.js';
import { MenubarView } from './Menubar.View.js';
import { MenubarRender } from './Menubar.Render.js';
import { MenubarHelp } from './Menubar.Help.js';

function Menubar( editor, { sidebar, sidebarDock, timelineDock, toolbar } ) {

	const container = new UIPanel();
	container.setId( 'menubar' );

	container.add( new MenubarFile( editor ) );
	container.add( new MenubarEdit( editor ) );
	container.add( new MenubarAdd( editor ) );
	container.add( new MenubarView( editor ) );
	container.add( new MenubarRender( editor ) );

	const code = new UIPanel();
	code.setClass( 'menu' );
	const codeTitle = new UIPanel();
	codeTitle.setClass( 'title' );
	codeTitle.setTextContent( 'Code' );
	codeTitle.dom.id = 'menu-code';
	codeTitle.dom.style.cursor = 'pointer';
	codeTitle.dom.addEventListener( 'click', () => editor.codePanel.toggle() );
	code.add( codeTitle );
	container.add( code );
	container.add( new MenubarHelp( editor ) );

	const toggles = document.createElement( 'div' );
	toggles.className = 'panel-toggles';
	toggles.setAttribute( 'role', 'group' );
	toggles.setAttribute( 'aria-label', 'Workspace controls' );
	container.dom.appendChild( toggles );

	function iconButton( label, path ) {

		const button = document.createElement( 'button' );
		button.type = 'button';
		button.title = label;
		button.setAttribute( 'aria-label', label );
		button.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${ path }</svg>`;
		toggles.appendChild( button );
		return button;

	}

	iconButton( 'Open asset browser', '<path d="M2 6h6l2-3h8v14H2z"/><path d="M2 7h16"/>' ).addEventListener( 'click', () => editor.assetBrowser.reveal() );

	const frame = '<rect x="2.5" y="3.5" width="15" height="13" rx="2"/>';
	editor.codePanel.dock.bindToggle( iconButton( 'Toggle Code panel', frame + '<path d="M7.5 4v12"/>' ) );
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
