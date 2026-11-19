import { SidebarModifiers } from './Sidebar.Modifiers.js?v=poly-context';
import { canModify } from './modeling/Modifiers.js?v=poly-context';
import { SidebarAnimationClips } from './Sidebar.AnimationClips.js';
import { UIPanel, UITabbedPanel } from './libs/ui.js';

import { SidebarObject } from './Sidebar.Object.js?v=unified-sync';
import { SidebarGeometry } from './Sidebar.Geometry.js?v=outline-brushes';
import { SidebarMaterial } from './Sidebar.Material.js?v=material-look-layout';
import { SidebarModeling } from './Sidebar.Modeling.js?v=stroke-edit';
import { editableMesh } from './modeling/ModelViewport.js?v=stroke-edit';
import { canMaskLight } from './modeling/LightMask.js?v=mask-editor';
import { isProjector } from './assets/Projector.js';
import { SidebarScript } from './Sidebar.Script.js?v=component-layout';
import { icon } from './Glyphs.js?v=mode-shelves';

function SidebarProperties( editor, sceneSettings ) {

	const strings = editor.strings;

	const container = new UITabbedPanel();
	container.setId( 'properties' );
	const strip = container.tabsDiv.dom;
	strip.setAttribute( 'role', 'tablist' );
	strip.setAttribute( 'aria-label', 'Property categories' );
	strip.setAttribute( 'aria-orientation', 'vertical' );

	container.addTab( 'objectTab', strings.getKey( 'sidebar/properties/object' ), new SidebarObject( editor ), 'sidebar/properties/object' );
	container.addTab( 'geometryTab', strings.getKey( 'sidebar/properties/geometry' ), new SidebarGeometry( editor ), 'sidebar/properties/geometry' );
	container.addTab( 'materialTab', strings.getKey( 'sidebar/properties/material' ), new SidebarMaterial( editor ), 'sidebar/properties/material' );
	const scripts = new SidebarScript( editor );
	container.addTab( 'scriptTab', strings.getKey( 'sidebar/properties/script' ), scripts, 'sidebar/properties/script' );
	container.addTab( 'modelingTab', 'Modeling', new SidebarModeling( editor ), 'sidebar/properties/modeling' );
	container.addTab( 'modifiersTab', 'Modifiers', new SidebarModifiers( editor ), 'sidebar/properties/modifiers' );
	container.addTab( 'animationsTab', 'Animations', new SidebarAnimationClips( editor ), 'sidebar/properties/animations' );
	const toolPanel = new UIPanel().addClass( 'active-tool-properties' );
	toolPanel.dom.setAttribute( 'role', 'region' );
	toolPanel.dom.setAttribute( 'aria-label', 'Tool properties' );
	container.addTab( 'toolTab', 'Tool', toolPanel, 'sidebar/properties/tool' );
	editor.modeling.reveal = () => container.select( 'modelingTab' );
	editor.revealComponents = () => { container.select( 'scriptTab' ); scripts.openComponentPicker(); };
	container.select( 'objectTab' );

	for ( const tab of container.tabs ) tab.dom.addEventListener( 'dragenter', event => {
		if ( event.dataTransfer.types.includes( 'application/x-threeditor-asset' ) ) container.select( tab.dom.id );
	} );

	let previousSelection;
	function toggleTabs( object ) {

		const scene = ! object || object === editor.scene;
		const visible = {
			sceneTab: true,
			objectTab: ! scene,
			geometryTab: !! object?.geometry,
			materialTab: !! object && ( !! object.material || object.isGroup && ! isProjector( object ) ),
			scriptTab: !! object && object !== editor.camera,
			modelingTab: !! object && ( !! object.geometry?.userData.modeling || editableMesh( object ) || canMaskLight( object ) ),
			modifiersTab: !! object && canModify( object ),
			animationsTab: !! object?.animations.length,
			toolTab: !! editor.viewTools.toolPropertiesMode
		};
		for ( const tab of container.tabs ) tab.setHidden( ! visible[ tab.dom.id ] );
		if ( scene && previousSelection !== object && container.selected !== 'toolTab' || ! visible[ container.selected ] ) container.select( scene ? 'sceneTab' : 'objectTab' );
		else if ( ! scene && ( ! previousSelection || previousSelection === editor.scene ) && container.selected === 'sceneTab' ) container.select( 'objectTab' );
		previousSelection = object;

	}

	editor.signals.objectSelected.add( toggleTabs );
	let previousTool;
	editor.updateToolProperties = ( force = false ) => {

		const tool = editor.viewTools.toolPropertiesMode;
		if ( ! force && tool === previousTool ) return;
		editor.viewTools.buildToolProperties( toolPanel.dom );
		toggleTabs( editor.selected );
		if ( tool && tool !== previousTool ) container.select( 'toolTab' );
		previousTool = tool;

	};

	toggleTabs( editor.selected );

	return container;

}

export { SidebarProperties };
