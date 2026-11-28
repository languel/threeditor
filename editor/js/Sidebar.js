import { UITabbedPanel } from './libs/ui.js';
import { icon, KEY_ICONS } from './Glyphs.js?v=transform-gizmos';

import { SidebarScene } from './Sidebar.Scene.js?v=editor-panes';
import { SidebarProperties } from './Sidebar.Properties.js?v=apply-transforms';
import { SidebarProject } from './Sidebar.Project.js';
import { SidebarSettings } from './Sidebar.Settings.js?v=transform-gizmos';
import { SidebarStreams } from './Sidebar.Streams.js';
import { SidebarAssets } from './Sidebar.Assets.js?v=image-textures';

function Sidebar( editor ) {

	const strings = editor.strings;

	const container = new UITabbedPanel();
	container.setId( 'sidebar' );
	container.panelsDiv.setId( 'properties' );

	const { outlinerArea, settings: sceneSettings } = new SidebarScene( editor, () => {

		editor.editWorkspace.closeHost( inspector.parentElement );
		container.select( 'sceneTab' );

	} );
	const sidebarProperties = new SidebarProperties( editor, sceneSettings, container );
	container.properties = sidebarProperties;
	const inspector = document.createElement( 'section' );
	inspector.className = 'sidebar-inspector TabbedPanel';
	inspector.setAttribute( 'aria-label', 'Properties and project panels' );
	inspector.append( container.tabsDiv.dom, container.panelsDiv.dom );
	container.areaEditors = { outliner: outlinerArea, properties: inspector };
	const divider = document.createElement( 'div' );
	divider.className = 'sidebar-area-divider';
	divider.tabIndex = 0;
	divider.setAttribute( 'role', 'separator' );
	divider.setAttribute( 'aria-label', 'Resize Outliner' );
	divider.setAttribute( 'aria-orientation', 'horizontal' );
	divider.setAttribute( 'aria-controls', 'outliner' );
	container.dom.append( outlinerArea, divider, inspector );
	const outlinerHeight = () => container.dom.firstElementChild.clientHeight;
	let start;
	function resizeOutliner( height ) {

		const max = Math.max( 70, Math.floor( container.dom.clientHeight * .68 ) );
		const pixels = Math.max( 70, Math.min( max, Math.round( height ) ) );
		container.dom.style.setProperty( '--outliner-height', pixels + 'px' );
		divider.setAttribute( 'aria-valuemin', '70' );
		divider.setAttribute( 'aria-valuemax', String( max ) );
		divider.setAttribute( 'aria-valuenow', String( pixels ) );

	}
	divider.addEventListener( 'pointerdown', event => {

		if ( event.button !== 0 ) return;
		start = { y: event.clientY, height: outlinerHeight() };
		divider.setPointerCapture( event.pointerId );

	} );
	divider.addEventListener( 'pointermove', event => {

		if ( divider.hasPointerCapture( event.pointerId ) ) resizeOutliner( start.height + event.clientY - start.y );

	} );
	divider.addEventListener( 'keydown', event => {

		if ( ! [ 'ArrowUp', 'ArrowDown' ].includes( event.key ) ) return;
		event.preventDefault();
		resizeOutliner( outlinerHeight() + ( event.key === 'ArrowUp' ? - 16 : 16 ) );

	} );
	new ResizeObserver( () => {

		if ( container.dom.clientHeight ) {

			const height = outlinerHeight();
			divider.setAttribute( 'aria-valuemin', '70' );
			divider.setAttribute( 'aria-valuemax', String( Math.max( 70, Math.floor( container.dom.clientHeight * .68 ) ) ) );
			divider.setAttribute( 'aria-valuenow', String( height ) );

		}

	} ).observe( container.dom );
	const project = new SidebarProject( editor );
	const settings = new SidebarSettings( editor );

	container.addTab( 'assets', 'Assets', new SidebarAssets( editor ), 'assets' );
	container.addTab( 'streams', 'Streams', new SidebarStreams( editor ), 'streams' );
	container.addTab( 'project', strings.getKey( 'sidebar/project' ), project, 'sidebar/project' );
	container.addTab( 'settings', strings.getKey( 'sidebar/settings' ), settings, 'sidebar/settings' );
	const rail = container.tabsDiv.dom;
	rail.setAttribute( 'role', 'tablist' );
	rail.setAttribute( 'aria-label', 'Sidebar panels' );
	rail.setAttribute( 'aria-orientation', 'vertical' );
	for ( const [ index, tab ] of container.tabs.entries() ) {

		const node = tab.dom;
		const label = node.textContent;
		const glyph = node.id === 'sceneTab' ? 'shadingWire' : KEY_ICONS.get( node.dataset.glyphKey ) || node.dataset.glyphKey;
		node.innerHTML = icon( glyph );
		node.style.removeProperty( 'display' );
		node.style.removeProperty( 'cursor' );
		node.title = label;
		node.setAttribute( 'role', 'tab' );
		node.setAttribute( 'aria-label', label );
		const panel = container.panels[ index ].dom;
		panel.setAttribute( 'role', 'tabpanel' );
		panel.setAttribute( 'aria-label', label );

	}
	const selectTab = container.select.bind( container );
	container.select = id => {

		// The existing Properties command reopens the most recent property category.
		if ( id === 'scene' ) id = sidebarProperties.selected;
		if ( sidebarProperties.tabs.some( tab => tab.dom.id === id ) ) sidebarProperties.selected = id;
		for ( const tab of container.tabs ) {

			const selected = tab.dom.id === id;
			tab.dom.setAttribute( 'aria-selected', String( selected ) );
			tab.dom.tabIndex = selected ? 0 : -1;

		}
		return selectTab( id );

	};
	rail.addEventListener( 'keydown', event => {

		const tabs = container.tabs.filter( tab => ! tab.isHidden() ).map( tab => tab.dom );
		const current = tabs.indexOf( event.target );
		if ( current < 0 ) return;
		let target;
		switch ( event.key ) {

			case 'ArrowUp': target = tabs[ ( current + tabs.length - 1 ) % tabs.length ]; break;
			case 'ArrowDown': target = tabs[ ( current + 1 ) % tabs.length ]; break;
			case 'Home': target = tabs[ 0 ]; break;
			case 'End': target = tabs.at( -1 ); break;
			case 'Enter': case ' ': target = tabs[ current ]; break;
			default: return;

		}
		event.preventDefault();
		container.select( target.id );
		target.focus();

	} );
	container.select( 'scene' );
	editor.revealToolProperties = () => {

		if ( ! editor.viewTools.toolPropertiesMode ) return;
		sidebarProperties.select( 'toolTab' );

	};

	// Reveal inspector tabs while an asset is being dragged, so texture slots
	// remain reachable from the Assets tab without opening a separate window.
	for ( const tab of container.tabs ) tab.dom.addEventListener( 'dragenter', event => {
		if ( event.dataTransfer.types.includes( 'application/x-threeditor-asset' ) ) container.select( tab.dom.id );
	} );

	return container;

}

export { Sidebar };
