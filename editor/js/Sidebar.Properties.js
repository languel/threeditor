import { SidebarModifiers } from './Sidebar.Modifiers.js?v=poly-context';
import { canModify } from './modeling/Modifiers.js?v=poly-context';
import { SidebarAnimationClips } from './Sidebar.AnimationClips.js';
import { UITabbedPanel } from './libs/ui.js';

import { SidebarObject } from './Sidebar.Object.js?v=mask-editor';
import { SidebarGeometry } from './Sidebar.Geometry.js?v=outline-brushes';
import { SidebarMaterial } from './Sidebar.Material.js?v=material-look-layout';
import { SidebarModeling } from './Sidebar.Modeling.js?v=brush-shortcuts';
import { editableMesh } from './modeling/ModelViewport.js?v=tool-layout';
import { canMaskLight } from './modeling/LightMask.js?v=mask-editor';
import { isProjector } from './assets/Projector.js';
import { SidebarScript } from './Sidebar.Script.js?v=dda-cinema';

function SidebarProperties( editor ) {

	const strings = editor.strings;

	const container = new UITabbedPanel();
	container.setId( 'properties' );

	container.addTab( 'objectTab', strings.getKey( 'sidebar/properties/object' ), new SidebarObject( editor ), 'sidebar/properties/object' );
	container.addTab( 'geometryTab', strings.getKey( 'sidebar/properties/geometry' ), new SidebarGeometry( editor ), 'sidebar/properties/geometry' );
	container.addTab( 'materialTab', strings.getKey( 'sidebar/properties/material' ), new SidebarMaterial( editor ), 'sidebar/properties/material' );
	const scripts = new SidebarScript( editor );
	container.addTab( 'scriptTab', strings.getKey( 'sidebar/properties/script' ), scripts, 'sidebar/properties/script' );
	container.addTab( 'modelingTab', 'Modeling', new SidebarModeling( editor ), 'sidebar/properties/modeling' );
	container.addTab( 'modifiersTab', 'Modifiers', new SidebarModifiers( editor ), 'sidebar/properties/modifiers' );
	container.addTab( 'animationsTab', 'Animations', new SidebarAnimationClips( editor ), 'sidebar/properties/animations' );
	editor.modeling.reveal = () => container.select( 'modelingTab' );
	editor.revealComponents = () => { container.select( 'scriptTab' ); scripts.openComponentPicker(); };
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
	const modifiersTab = getTabByTabId( container.tabs, 'modifiersTab' );
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

		modifiersTab.setHidden( ! canModify( object ) );
		if ( container.selected === 'modifiersTab' && modifiersTab.isHidden() ) container.select( 'objectTab' );

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
