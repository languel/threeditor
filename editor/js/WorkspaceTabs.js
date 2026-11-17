import { icon } from './Glyphs.js?v=mode-shelves';
import { canMaskLight } from './modeling/LightMask.js?v=mask-editor';

export function WorkspaceTabs( editor, sidebar, sidebarDock ) {

	const strip = document.createElement( 'nav' );
	strip.className = 'workspace-tabs';
	strip.setAttribute( 'aria-label', 'Workspaces' );
	const view = editor.viewTools;
	const flat = editor.editWorkspace;

	function show3D( mode ) {

		flat.close();
		editor.codePanel.toggle( false );
		if ( mode ) view.setWorkspaceMode( mode );

	}

	function showProperty( id ) {

		const tab = sidebar.properties.tabs.find( tab => tab.dom.id === id );
		if ( tab && ! tab.isHidden() ) {

			sidebar.select( 'scene' );
			sidebarDock.toggle( true );
			sidebar.properties.select( id );

		}

	}

	const workspaces = [
		[ 'Layout', 'editorTypes', () => {

			show3D( 'object' );
			editor.timeline.compact();

		} ],
		[ 'Modeling', 'meshBuild', () => show3D( 'edit' ) ],
		[ 'Sculpting', 'sculptTool', () => show3D( 'sculpt' ) ],
		[ 'UV Editing', 'toolGrid', () => {

			editor.codePanel.toggle( false );
			if ( flat.mode !== 'uv' ) {

				view.setWorkspaceMode( 'edit' );
				flat.open( 'uv' );

			}

		} ],
		[ 'Image & Vector', 'pathDraw', () => { editor.codePanel.toggle( false ); flat.open( 'image' ); } ],
		[ 'Paint', 'surfaceBrush', () => show3D( 'paint' ) ],
		[ 'Shading', 'shadingMaterial', () => {

			show3D( 'object' );
			editor.setViewportShading( 'materials' );
			showProperty( 'materialTab' );

		} ],
		[ 'Animation', 'play', () => {

			show3D( 'object' );
			editor.timeline.reveal();
			editor.signals.animationPanelResized.dispatch( Math.min( 240, Math.round( window.innerHeight * .3 ) ) );

		} ],
		[ 'Scripting', 'code', () => {

			flat.close();
			editor.codePanel.toggle( true );

		} ],
		[ 'Projection', 'toolMask', () => {

			show3D( 'object' );
			const light = [ editor.selected, editor.viewportSource ].find( canMaskLight );
			if ( light ) {

				editor.setViewportSource( light );
				editor.setViewportSplit( true );
				showProperty( 'modelingTab' );

			}

		} ]
	];
	const buttons = new Map();
	for ( const [ label, glyph, open ] of workspaces ) {

		const button = document.createElement( 'button' );
		button.type = 'button';
		button.title = label;
		button.setAttribute( 'aria-label', label );
		button.setAttribute( 'aria-pressed', String( label === 'Layout' ) );
		button.innerHTML = icon( glyph );
		const text = document.createElement( 'span' );
		text.textContent = label;
		button.append( text );
		button.onclick = () => {

			if ( label === 'Sculpting' && ! editor.modeling.canSculptTarget( editor.selected ) ) return;
			open();
			for ( const other of buttons.values() ) other.setAttribute( 'aria-pressed', String( button === other ) );
			const room = strip.getBoundingClientRect();
			const bounds = button.getBoundingClientRect();
			if ( bounds.left < room.left ) strip.scrollLeft -= room.left - bounds.left;
			if ( bounds.right > room.right ) strip.scrollLeft += bounds.right - room.right;

		};
		buttons.set( label, button );
		strip.append( button );
		editor.keymap.register( {
			id: 'workspace.' + glyph, label: 'Workspace · ' + label, category: 'Workspaces', defaults: {},
			available: () => ! button.disabled,
			run: () => button.click()
		} );

	}
	function updateAvailability() {

		const button = buttons.get( 'Sculpting' );
		button.disabled = ! editor.modeling.canSculptTarget( editor.selected );
		button.title = button.disabled ? 'Sculpting · Select an editable mesh' : 'Sculpting';

	}
	editor.signals.objectSelected.add( updateAvailability );
	editor.signals.objectChanged.add( updateAvailability );
	updateAvailability();
	return strip;

}
