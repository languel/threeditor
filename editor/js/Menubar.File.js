import { UIPanel, UIRow, UIHorizontalRule } from './libs/ui.js';
import { PropertyBinding } from 'three';
import { createExampleLibrary } from './ExampleLibrary.js';
import { openAssetBrowser } from './AssetBrowser.js';

function MenubarFile( editor ) {

	const strings = editor.strings;

	const saveArrayBuffer = editor.utils.saveArrayBuffer;
	const saveString = editor.utils.saveString;

	const container = new UIPanel();
	container.setClass( 'menu' );

	const title = new UIPanel();
	title.setClass( 'title' );
	title.setTextContent( strings.getKey( 'menubar/file' ) );
	title.dom.dataset.glyphKey = 'menubar/file';
	container.add( title );

	const options = new UIPanel();
	options.setClass( 'options' );
	container.add( options );

	// New Project

	const newProjectSubmenuTitle = new UIRow().setTextContent( strings.getKey( 'menubar/file/new' ) ).addClass( 'option' ).addClass( 'submenu-title' );
	newProjectSubmenuTitle.onMouseOver( function () {

		const { top, right } = this.dom.getBoundingClientRect();
		const { paddingTop } = getComputedStyle( this.dom );
		newProjectSubmenu.setLeft( right + 'px' );
		newProjectSubmenu.setTop( top - parseFloat( paddingTop ) + 'px' );
		newProjectSubmenu.setDisplay( 'block' );

	} );
	newProjectSubmenuTitle.onMouseOut( function () {

		newProjectSubmenu.setDisplay( 'none' );

	} );
	options.add( newProjectSubmenuTitle );

	const newProjectSubmenu = new UIPanel().setPosition( 'fixed' ).addClass( 'options' ).setDisplay( 'none' );
	newProjectSubmenuTitle.add( newProjectSubmenu );

	// New Project / Empty

	let option = new UIRow().setTextContent( strings.getKey( 'menubar/file/new/empty' ) ).setClass( 'option' );
	option.onClick( function () {

		if ( confirm( strings.getKey( 'prompt/file/open' ) ) ) {

			editor.clear();

		}

	} );
	newProjectSubmenu.add( option );

	// Examples are folders, including the browser's named User projects.

	const exampleLibrary = createExampleLibrary( editor );
	editor.saveProject = exampleLibrary.save;
	const examplesTitle = new UIRow().setTextContent( 'Examples' ).addClass( 'option' ).addClass( 'submenu-title' );
	const examplesPanel = new UIPanel().setPosition( 'fixed' ).addClass( 'options' ).addClass( 'examples-panel' ).setDisplay( 'none' );
	examplesPanel.dom.appendChild( exampleLibrary.dom );
	examplesTitle.add( examplesPanel );
	examplesTitle.onMouseOver( function () {

		const { top, right } = this.dom.getBoundingClientRect();
		examplesPanel.setDisplay( 'block' );
		const width = examplesPanel.dom.offsetWidth;
		examplesPanel.setLeft( Math.min( right, window.innerWidth - width - 8 ) + 'px' );
		examplesPanel.setTop( Math.max( 8, Math.min( top, window.innerHeight - examplesPanel.dom.offsetHeight - 8 ) ) + 'px' );

	} );
	examplesTitle.dom.addEventListener( 'mouseenter', () => exampleLibrary.refresh() );
	examplesTitle.onMouseOut( () => examplesPanel.setDisplay( 'none' ) );
	options.add( examplesTitle );

	// Open

	const openProjectForm = document.createElement( 'form' );
	openProjectForm.style.display = 'none';
	document.body.appendChild( openProjectForm );

	const openProjectInput = document.createElement( 'input' );
	openProjectInput.multiple = false;
	openProjectInput.type = 'file';
	openProjectInput.accept = '.json';
	openProjectInput.addEventListener( 'change', async function () {

		const file = openProjectInput.files[ 0 ];

		if ( file === undefined ) return;

		try {

			const json = JSON.parse( await file.text() );

			async function onEditorCleared() {

				await editor.fromJSON( json );

				editor.signals.editorCleared.remove( onEditorCleared );

			}

			editor.signals.editorCleared.add( onEditorCleared );

			editor.clear();

		} catch ( e ) {

			alert( strings.getKey( 'prompt/file/failedToOpenProject' ) );
			console.error( e );

		} finally {

			openProjectForm.reset();

		}

	} );

	openProjectForm.appendChild( openProjectInput );

	option = new UIRow()
		.addClass( 'option' )
		.setTextContent( strings.getKey( 'menubar/file/open' ) )
		.onClick( function () {

			if ( confirm( strings.getKey( 'prompt/file/open' ) ) ) {

				openProjectInput.click();

			}

		} );

	options.add( option );

	// Save

	option = new UIRow()
		.addClass( 'option' )
		.setTextContent( strings.getKey( 'menubar/file/save' ) )
		.onClick( exampleLibrary.save );

	options.add( option );

	//

	options.add( new UIHorizontalRule() );

	// Import

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/file/import' ) );
	option.onClick( function () {

		openAssetBrowser( editor, {
			kind: 'import',
			onPick: ( { path } ) => editor.loader.loadAsset( path ),
			onUpload: files => editor.loader.loadFiles( files )
		} );

	} );
	options.add( option );

	// Export

	const fileExportSubmenuTitle = new UIRow().setTextContent( strings.getKey( 'menubar/file/export' ) ).addClass( 'option' ).addClass( 'submenu-title' );
	fileExportSubmenuTitle.onMouseOver( function () {

		const { top, right } = this.dom.getBoundingClientRect();
		const { paddingTop } = getComputedStyle( this.dom );
		fileExportSubmenu.setLeft( right + 'px' );
		fileExportSubmenu.setTop( top - parseFloat( paddingTop ) + 'px' );
		fileExportSubmenu.setDisplay( 'block' );

	} );
	fileExportSubmenuTitle.onMouseOut( function () {

		fileExportSubmenu.setDisplay( 'none' );

	} );
	options.add( fileExportSubmenuTitle );

	const fileExportSubmenu = new UIPanel().setPosition( 'fixed' ).addClass( 'options' ).setDisplay( 'none' );
	fileExportSubmenuTitle.add( fileExportSubmenu );

	// Export DRC

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'DRC' );
	option.onClick( async function () {

		const object = editor.selected;

		if ( object === null || object.isMesh === undefined ) {

			alert( strings.getKey( 'prompt/file/export/noMeshSelected' ) );
			return;

		}

		const { DRACOExporter } = await import( 'three/addons/exporters/DRACOExporter.js' );

		const exporter = new DRACOExporter();

		const options = {
			decodeSpeed: 5,
			encodeSpeed: 5,
			encoderMethod: DRACOExporter.MESH_EDGEBREAKER_ENCODING,
			quantization: [ 16, 8, 8, 8, 8 ],
			exportUvs: true,
			exportNormals: true,
			exportColor: object.geometry.hasAttribute( 'color' )
		};

		const result = await exporter.parseAsync( object, options );
		saveArrayBuffer( result, 'model.drc' );

	} );
	fileExportSubmenu.add( option );

	// Export GLB

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'GLB' );
	option.onClick( async function () {

		const scene = editor.scene;

		if ( needsUniqueNames( scene ) ) { // see #25179

			if ( confirm( strings.getKey( 'prompt/file/export/duplicateNames' ) ) === false ) return;

			ensureUniqueNames( scene );

		}

		const animations = getAnimations( scene );

		const optimizedAnimations = [];

		for ( const animation of animations ) {

			optimizedAnimations.push( animation.clone().optimize() );

		}

		const { GLTFExporter } = await import( 'three/addons/exporters/GLTFExporter.js' );

		const exporter = new GLTFExporter();

		exporter.parse( scene, function ( result ) {

			saveArrayBuffer( result, 'scene.glb' );

		}, undefined, { binary: true, animations: optimizedAnimations } );

	} );
	fileExportSubmenu.add( option );

	// Export GLTF

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'GLTF' );
	option.onClick( async function () {

		const scene = editor.scene;

		if ( needsUniqueNames( scene ) ) { // see #25179

			if ( confirm( strings.getKey( 'prompt/file/export/duplicateNames' ) ) === false ) return;

			ensureUniqueNames( scene );

		}

		const animations = getAnimations( scene );

		const optimizedAnimations = [];

		for ( const animation of animations ) {

			optimizedAnimations.push( animation.clone().optimize() );

		}

		const { GLTFExporter } = await import( 'three/addons/exporters/GLTFExporter.js' );

		const exporter = new GLTFExporter();

		exporter.parse( scene, function ( result ) {

			saveString( JSON.stringify( result, null, 2 ), 'scene.gltf' );

		}, undefined, { animations: optimizedAnimations } );


	} );
	fileExportSubmenu.add( option );

	// Export OBJ

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'OBJ' );
	option.onClick( async function () {

		const object = editor.selected;

		if ( object === null ) {

			alert( strings.getKey( 'prompt/file/export/noObjectSelected' ) );
			return;

		}

		const { OBJExporter } = await import( 'three/addons/exporters/OBJExporter.js' );

		const exporter = new OBJExporter();

		saveString( exporter.parse( object ), 'model.obj' );

	} );
	fileExportSubmenu.add( option );

	// Export PLY (ASCII)

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'PLY' );
	option.onClick( async function () {

		const { PLYExporter } = await import( 'three/addons/exporters/PLYExporter.js' );

		const exporter = new PLYExporter();

		exporter.parse( editor.scene, function ( result ) {

			saveArrayBuffer( result, 'model.ply' );

		} );

	} );
	fileExportSubmenu.add( option );

	// Export PLY (BINARY)

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'PLY (BINARY)' );
	option.onClick( async function () {

		const { PLYExporter } = await import( 'three/addons/exporters/PLYExporter.js' );

		const exporter = new PLYExporter();

		exporter.parse( editor.scene, function ( result ) {

			saveArrayBuffer( result, 'model-binary.ply' );

		}, { binary: true } );

	} );
	fileExportSubmenu.add( option );

	// Export STL (ASCII)

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'STL' );
	option.onClick( async function () {

		const { STLExporter } = await import( 'three/addons/exporters/STLExporter.js' );

		const exporter = new STLExporter();

		saveString( exporter.parse( editor.scene ), 'model.stl' );

	} );
	fileExportSubmenu.add( option );

	// Export STL (BINARY)

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'STL (BINARY)' );
	option.onClick( async function () {

		const { STLExporter } = await import( 'three/addons/exporters/STLExporter.js' );

		const exporter = new STLExporter();

		saveArrayBuffer( exporter.parse( editor.scene, { binary: true } ), 'model-binary.stl' );

	} );
	fileExportSubmenu.add( option );

	// Export USDZ

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'USDZ' );
	option.onClick( async function () {

		const { USDZExporter } = await import( 'three/addons/exporters/USDZExporter.js' );

		const exporter = new USDZExporter();

		saveArrayBuffer( await exporter.parseAsync( editor.scene ), 'model.usdz' );

	} );
	fileExportSubmenu.add( option );

	// Publish (experiment addition)

	const publishTitle = new UIRow().setTextContent( 'Publish' ).addClass( 'option' ).addClass( 'submenu-title' );
	publishTitle.onMouseOver( function () {

		const { top, right } = publishTitle.dom.getBoundingClientRect();
		const { paddingTop } = getComputedStyle( publishTitle.dom );
		publishSubmenu.setLeft( right + 'px' );
		publishSubmenu.setTop( top - parseFloat( paddingTop ) + 'px' );
		publishSubmenu.setDisplay( 'block' );

	} );
	publishTitle.onMouseOut( function () {

		publishSubmenu.setDisplay( 'none' );

	} );
	options.add( publishTitle );

	const publishSubmenu = new UIPanel().setPosition( 'fixed' ).addClass( 'options' ).setDisplay( 'none' );
	publishTitle.add( publishSubmenu );

	function publishOption( label, handler ) {

		const row = new UIRow().setClass( 'option' ).setTextContent( label );
		row.onClick( async function () {

			try {

				await handler();

			} catch ( e ) {

				console.error( e );
				alert( 'Publish failed: ' + e.message );

			}

		} );
		publishSubmenu.add( row );

	}

	publishOption( 'Scene JavaScript (.js)', async function () {

		const { code } = await editor.codePanel.getPublishInputs();
		editor.utils.save( new Blob( [ code ], { type: 'text/javascript' } ), 'scene.js' );

	} );

	if ( ! editor.portable ) {

		publishOption( 'Source project (.zip)', async function () {

			const { code, blobs } = await editor.codePanel.getPublishInputs();
			const { exportThreeArchive } = await import( './Publish.js' );
			editor.utils.save( await exportThreeArchive( code, blobs ), 'three-scene.zip' );

		} );

		publishOption( 'Playable scene (.zip)', async function () {

			const { exportPlayableScene } = await import( './Publish.js' );
			const { zip, filename } = await exportPlayableScene( editor );
			editor.utils.save( zip, filename );

		} );

		publishOption( 'Playable HTML (esbuild)', async function () {

			const { exportPlayableHtml } = await import( './Publish.js' );
			editor.utils.save( await exportPlayableHtml( editor ), 'three-scene-playable.html' );

		} );

	}

	publishOption( 'Editable HTML (esbuild)', async function () {

		const html = editor.portable ? await editor.portable.save( editor ) :
			await ( await import( './EditorHtml.js' ) ).exportEditorHtml( editor );
		editor.utils.save( html, 'three-scene-editable.html' );

	} );

	//

	function getAnimations( scene ) {

		const animations = [];

		scene.traverse( function ( object ) {

			animations.push( ... object.animations );

		} );

		return animations;

	}

	function needsUniqueNames( scene ) {

		const usedNames = new Set();
		let duplicate = false;
		let animated = false;

		scene.traverse( function ( object ) {

			if ( object.animations.length > 0 ) animated = true;

			if ( object.name === '' ) return;

			if ( usedNames.has( object.name ) ) duplicate = true;

			usedNames.add( object.name );

		} );

		return duplicate && animated;

	}

	// Gives every object a unique name and keeps the animation tracks that
	// reference them by name in sync. The renamed scene mirrors the result of a
	// glTF round-trip, where the loader makes all names unique, too.

	function ensureUniqueNames( scene ) {

		// Resolve each track's target object up front, scoped to the object that
		// owns the clip. This disambiguates colliding names before they change.

		const trackBindings = [];

		scene.traverse( function ( owner ) {

			for ( const clip of owner.animations ) {

				for ( const track of clip.tracks ) {

					const nodeName = PropertyBinding.parseTrackName( track.name ).nodeName;
					const target = PropertyBinding.findNode( owner, nodeName );

					// References by UUID stay valid, so only track name-based ones.

					if ( target !== null && target.name === nodeName ) {

						trackBindings.push( { track, target, nodeName } );

					}

				}

			}

		} );

		// Assign a unique name to every named object.

		let changed = false;
		const usedNames = new Set();

		scene.traverse( function ( object ) {

			if ( object.name === '' ) return;

			if ( usedNames.has( object.name ) ) {

				let suffix = 1, name;
				do {

					name = object.name + '_' + ( suffix ++ );

				} while ( usedNames.has( name ) );

				object.name = name;
				changed = true;

			}

			usedNames.add( object.name );

		} );

		if ( changed === false ) return;

		// Point the affected tracks at their renamed targets.

		for ( const { track, target, nodeName } of trackBindings ) {

			if ( target.name !== nodeName ) {

				track.name = target.name + track.name.slice( nodeName.length );

			}

		}

		editor.signals.sceneGraphChanged.dispatch();

	}

	return container;

}

export { MenubarFile };
