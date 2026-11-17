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
import { icon } from './Glyphs.js?v=mode-shelves';

function SidebarProperties( editor, sceneSettings ) {

	const strings = editor.strings;

	const container = new UITabbedPanel();
	container.setId( 'properties' );
	const strip = container.tabsDiv.dom;
	strip.setAttribute( 'role', 'tablist' );
	strip.setAttribute( 'aria-label', 'Property categories' );
	strip.setAttribute( 'aria-orientation', 'vertical' );

	const selectTab = container.select.bind( container );
	container.select = id => {

		const result = selectTab( id );
		for ( const tab of container.tabs ) {

			tab.dom.setAttribute( 'aria-selected', String( tab.dom.id === id ) );
			tab.dom.tabIndex = tab.dom.id === id ? 0 : -1;

		}
		return result;

	};
	function addTab( id, label, glyph, panel ) {

		container.addTab( id, label, panel );
		const tab = container.tabs.at( -1 ).dom;
		tab.title = label;
		tab.setAttribute( 'role', 'tab' );
		tab.setAttribute( 'aria-label', label );
		tab.innerHTML = icon( glyph );
		const page = container.panels.at( -1 ).dom;
		page.setAttribute( 'role', 'tabpanel' );
		page.setAttribute( 'aria-label', label );
		const header = document.createElement( 'div' );
		header.className = 'property-title';
		header.textContent = label;
		page.prepend( header );

	}
	addTab( 'sceneTab', 'Scene', 'scene', sceneSettings );
	addTab( 'objectTab', strings.getKey( 'sidebar/properties/object' ), 'objectMode', new SidebarObject( editor ) );
	addTab( 'geometryTab', strings.getKey( 'sidebar/properties/geometry' ), 'editMode', new SidebarGeometry( editor ) );
	addTab( 'materialTab', strings.getKey( 'sidebar/properties/material' ), 'shadingMaterial', new SidebarMaterial( editor ) );
	addTab( 'scriptTab', 'Components', 'code', new SidebarScript( editor ) );
	addTab( 'modelingTab', 'Modeling', 'meshBuild', new SidebarModeling( editor ) );
	addTab( 'modifiersTab', 'Modifiers', 'modifiers', new SidebarModifiers( editor ) );
	addTab( 'animationsTab', 'Animations', 'play', new SidebarAnimationClips( editor ) );
	editor.modeling.reveal = () => container.select( 'modelingTab' );
	strip.addEventListener( 'keydown', event => {

		const tabs = container.tabs.filter( tab => ! tab.isHidden() ).map( tab => tab.dom );
		const index = tabs.indexOf( event.target );
		if ( index < 0 ) return;
		let next;
		if ( event.key === 'ArrowUp' ) next = tabs[ ( index + tabs.length - 1 ) % tabs.length ];
		if ( event.key === 'ArrowDown' ) next = tabs[ ( index + 1 ) % tabs.length ];
		if ( event.key === 'Home' ) next = tabs[ 0 ];
		if ( event.key === 'End' ) next = tabs.at( -1 );
		if ( ! next ) return;
		event.preventDefault();
		container.select( next.id );
		next.focus();

	} );

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
			animationsTab: !! object?.animations.length
		};
		for ( const tab of container.tabs ) tab.setHidden( ! visible[ tab.dom.id ] );
		if ( scene && previousSelection !== object || ! visible[ container.selected ] ) container.select( scene ? 'sceneTab' : 'objectTab' );
		else if ( ! scene && ( ! previousSelection || previousSelection === editor.scene ) && container.selected === 'sceneTab' ) container.select( 'objectTab' );
		previousSelection = object;

	}

	editor.signals.objectSelected.add( toggleTabs );

	toggleTabs( editor.selected );

	return container;

}

export { SidebarProperties };
