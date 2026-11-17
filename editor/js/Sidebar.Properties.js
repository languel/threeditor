import { SidebarAnimationClips } from './Sidebar.AnimationClips.js';
import { UITabbedPanel } from './libs/ui.js';

import { SidebarObject } from './Sidebar.Object.js?v=mask-editor';
import { SidebarGeometry } from './Sidebar.Geometry.js?v=outline-brushes';
import { SidebarMaterial } from './Sidebar.Material.js?v=material-look-layout';
import { SidebarModeling } from './Sidebar.Modeling.js?v=mesh-build';
import { editableMesh } from './modeling/ModelViewport.js?v=mesh-build';
import { canMaskLight } from './modeling/LightMask.js?v=mask-editor';
import { isProjector } from './assets/Projector.js';
import { SidebarScript } from './Sidebar.Script.js?v=dda-cinema';

function SidebarProperties( editor ) {

	const strings = editor.strings;

	const container = new UITabbedPanel();
	container.setId( 'properties' );

	container.addTab( 'objectTab', strings.getKey( 'sidebar/properties/object' ), new SidebarObject( editor ) );
	container.addTab( 'geometryTab', strings.getKey( 'sidebar/properties/geometry' ), new SidebarGeometry( editor ) );
	container.addTab( 'materialTab', strings.getKey( 'sidebar/properties/material' ), new SidebarMaterial( editor ) );
	container.addTab( 'scriptTab', strings.getKey( 'sidebar/properties/script' ), new SidebarScript( editor ) );
	container.addTab( 'modelingTab', 'Modeling', new SidebarModeling( editor ) );
	container.addTab( 'animationsTab', 'Animations', new SidebarAnimationClips( editor ) );
	editor.modeling.reveal = () => container.select( 'modelingTab' );
	container.select( 'objectTab' );

	for ( const tab of container.tabs ) tab.dom.addEventListener( 'dragenter', event => {
		if ( event.dataTransfer.types.includes( 'application/x-threeditor-asset' ) ) container.select( tab.dom.id );
	} );

	function getTabByTabId( tabs, tabId ) {

		return tabs.find( function ( tab ) {

			return tab.dom.id === tabId;

		} );

	}

	const geometryTab = getTabByTabId( container.tabs, 'geometryTab' );
	const materialTab = getTabByTabId( container.tabs, 'materialTab' );
	const modelingTab = getTabByTabId( container.tabs, 'modelingTab' );
	const scriptTab = getTabByTabId( container.tabs, 'scriptTab' );
	const animationsTab = getTabByTabId( container.tabs, 'animationsTab' );

	function toggleTabs( object ) {

		container.setHidden( object === null );

		if ( object === null ) return;

		geometryTab.setHidden( ! object.geometry );

		materialTab.setHidden( ! object.material && ( ! object.isGroup || isProjector( object ) ) );

		scriptTab.setHidden( object === editor.camera );
		animationsTab.setHidden( ! object.animations.length );
		if ( container.selected === 'animationsTab' && animationsTab.isHidden() ) container.select( 'objectTab' );

		modelingTab.setHidden( ! object.geometry?.userData.modeling && ! editableMesh( object ) && ! canMaskLight( object ) );

		// set active tab

		if ( container.selected === 'geometryTab' ) {

			container.select( geometryTab.isHidden() ? 'objectTab' : 'geometryTab' );

		} else if ( container.selected === 'materialTab' ) {

			container.select( materialTab.isHidden() ? 'objectTab' : 'materialTab' );

		} else if ( container.selected === 'modelingTab' ) {

			container.select( modelingTab.isHidden() ? 'objectTab' : 'modelingTab' );

		} else if ( container.selected === 'scriptTab' ) {

			container.select( scriptTab.isHidden() ? 'objectTab' : 'scriptTab' );

		}

	}

	editor.signals.objectSelected.add( toggleTabs );

	toggleTabs( editor.selected );

	return container;

}

export { SidebarProperties };
