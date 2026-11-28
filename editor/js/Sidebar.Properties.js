import { SidebarModifiers } from './Sidebar.Modifiers.js?v=poly-context';
import { canModify } from './modeling/Modifiers.js?v=poly-context';
import { SidebarAnimationClips } from './Sidebar.AnimationClips.js';
import { UIPanel } from './libs/ui.js';

import { SidebarObject } from './Sidebar.Object.js?v=image-textures';
import { SidebarGeometry } from './Sidebar.Geometry.js?v=apply-transforms';
import { SidebarMaterial } from './Sidebar.Material.js?v=material-look-layout';
import { SidebarModeling } from './Sidebar.Modeling.js?v=transform-gizmos';
import { editableMesh } from './modeling/ModelViewport.js?v=transform-gizmos';
import { canMaskLight } from './modeling/LightMask.js?v=mask-editor';
import { isProjector } from './assets/Projector.js';
import { SidebarScript } from './Sidebar.Script.js?v=component-layout';
import { hasArmatureTools, SidebarArmature } from './Sidebar.Armature.js?v=armature-x-mirror';
import { armatureOf } from './rigging/Armature.js';
import { canOwnConstraints } from './rigging/ArmatureConstraints.js';
import { SidebarConstraints } from './Sidebar.Constraints.js';
function SidebarProperties( editor, sceneSettings, container ) {

	const strings = editor.strings;

	container.addTab( 'sceneTab', strings.getKey( 'sidebar/scene' ), sceneSettings, 'sidebar/scene' );
	container.addTab( 'objectTab', strings.getKey( 'sidebar/properties/object' ), new SidebarObject( editor ), 'sidebar/properties/object' );
	container.addTab( 'armatureTab', 'Armature', new SidebarArmature( editor ) );
	container.addTab( 'constraintsTab', 'Constraints', new SidebarConstraints( editor ), 'sidebar/properties/constraints' );
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

	const properties = { tabs: [ ...container.tabs ], selected: 'objectTab', select: id => container.select( id ) };
	container.select( properties.selected );

	function rememberTab( id, reveal = false ) {

		properties.selected = id;
		if ( reveal || properties.tabs.some( tab => tab.dom.id === container.selected ) ) container.select( id );

	}

	let previousSelection;
	function toggleTabs( object ) {

		const scene = ! object || object === editor.scene;
		const visible = {
			sceneTab: true,
			objectTab: ! scene,
			armatureTab: hasArmatureTools( editor.scene, object ),
			constraintsTab: canOwnConstraints( object ) && ! object.isBone,
			geometryTab: !! object?.geometry,
			materialTab: !! object && ( !! object.material || object.isGroup && ! isProjector( object ) ),
			scriptTab: !! object && object !== editor.camera,
			modelingTab: !! object && ( !! object.geometry?.userData.modeling || editableMesh( object ) || canMaskLight( object ) ),
			modifiersTab: !! object && canModify( object ),
			animationsTab: !! object?.animations.length,
			toolTab: !! editor.viewTools.toolPropertiesMode
		};
		for ( const tab of properties.tabs ) tab.setHidden( ! visible[ tab.dom.id ] );
		if ( object === editor.scene && previousSelection !== object ) rememberTab( 'sceneTab', true );
		else if ( armatureOf( object ) && armatureOf( previousSelection ) !== armatureOf( object ) ) rememberTab( 'armatureTab', true );
		else if ( scene && previousSelection !== object && properties.selected !== 'toolTab' || ! visible[ properties.selected ] ) {

			rememberTab( scene ? 'sceneTab' : 'objectTab' );

		} else if ( ! scene && ( ! previousSelection || previousSelection === editor.scene ) && properties.selected === 'sceneTab' ) rememberTab( 'objectTab' );
		previousSelection = object;

	}

	editor.signals.objectSelected.add( toggleTabs );
	let previousTool;
	editor.updateToolProperties = ( force = false ) => {

		const tool = editor.viewTools.toolPropertiesMode;
		if ( ! force && tool === previousTool ) return;
		editor.viewTools.buildToolProperties( toolPanel.dom );
		toggleTabs( editor.selected );
		if ( tool && tool !== previousTool ) rememberTab( 'toolTab' );
		previousTool = tool;

	};
	editor.signals.objectSelected.add( () => {

		if ( editor.viewTools.toolPropertiesMode === 'sculpt' ) editor.updateToolProperties( true );

	} );

	toggleTabs( editor.selected );

	return properties;

}

export { SidebarProperties };
