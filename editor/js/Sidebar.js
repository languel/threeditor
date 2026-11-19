import { UITabbedPanel } from './libs/ui.js';

import { SidebarScene } from './Sidebar.Scene.js?v=script-window';
import { SidebarProperties } from './Sidebar.Properties.js?v=uv-anchors';
import { SidebarProject } from './Sidebar.Project.js';
import { SidebarSettings } from './Sidebar.Settings.js?v=unified-sync';
import { SidebarStreams } from './Sidebar.Streams.js';
import { SidebarAssets } from './Sidebar.Assets.js?v=projector-shadows';

function Sidebar( editor ) {

	const strings = editor.strings;

	const container = new UITabbedPanel();
	container.setId( 'sidebar' );
	const selectTab = container.select.bind( container );
	container.select = function ( id ) {

		container.dom.classList.toggle( 'assets-active', id === 'assets' );
		return selectTab( id );

	};

	const { outlinerArea, settings: sceneSettings } = new SidebarScene( editor );
	const sidebarProperties = new SidebarProperties( editor, sceneSettings );
	container.properties = sidebarProperties;
	const divider = document.createElement( 'div' );
	divider.className = 'sidebar-area-divider';
	divider.tabIndex = 0;
	divider.setAttribute( 'role', 'separator' );
	divider.setAttribute( 'aria-label', 'Resize Outliner' );
	divider.setAttribute( 'aria-orientation', 'horizontal' );
	divider.setAttribute( 'aria-controls', 'outliner' );
	container.dom.prepend( outlinerArea, divider );
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
		start = { y: event.clientY, height: outlinerArea.clientHeight };
		divider.setPointerCapture( event.pointerId );

	} );
	divider.addEventListener( 'pointermove', event => {

		if ( divider.hasPointerCapture( event.pointerId ) ) resizeOutliner( start.height + event.clientY - start.y );

	} );
	divider.addEventListener( 'keydown', event => {

		if ( ! [ 'ArrowUp', 'ArrowDown' ].includes( event.key ) ) return;
		event.preventDefault();
		resizeOutliner( outlinerArea.clientHeight + ( event.key === 'ArrowUp' ? - 16 : 16 ) );

	} );
	new ResizeObserver( () => {

		if ( container.dom.clientHeight ) {

			const height = outlinerArea.clientHeight;
			divider.setAttribute( 'aria-valuemin', '70' );
			divider.setAttribute( 'aria-valuemax', String( Math.max( 70, Math.floor( container.dom.clientHeight * .68 ) ) ) );
			divider.setAttribute( 'aria-valuenow', String( height ) );

		}

	} ).observe( outlinerArea );
	const project = new SidebarProject( editor );
	const settings = new SidebarSettings( editor );

	container.addTab( 'scene', 'Properties', sidebarProperties, 'sidebar/scene' );
	container.addTab( 'assets', 'Assets', new SidebarAssets( editor ), 'assets' );
	container.addTab( 'streams', 'Streams', new SidebarStreams( editor ), 'streams' );
	container.addTab( 'project', strings.getKey( 'sidebar/project' ), project, 'sidebar/project' );
	container.addTab( 'settings', strings.getKey( 'sidebar/settings' ), settings, 'sidebar/settings' );
	container.select( 'scene' );

	// Reveal inspector tabs while an asset is being dragged, so texture slots
	// remain reachable from the Assets tab without opening a separate window.
	for ( const tab of container.tabs ) tab.dom.addEventListener( 'dragenter', event => {
		if ( event.dataTransfer.types.includes( 'application/x-threeditor-asset' ) ) container.select( tab.dom.id );
	} );

	return container;

}

export { Sidebar };
