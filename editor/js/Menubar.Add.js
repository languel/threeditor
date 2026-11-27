import * as THREE from 'three';

import { UIPanel, UIRow } from './libs/ui.js';

import { projectorScript } from './assets/Projector.js?v=projector-shadows';
import { AddScriptCommand } from './commands/AddScriptCommand.js';
import { AddObjectCommand } from './commands/AddObjectCommand.js';
import { SetGeometryCommand } from './commands/SetGeometryCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { meshPrimitives } from './modeling/MeshPrimitives.js?v=uv-sculpt';
import { createEmpty, emptyDisplays } from './modeling/ReferenceObjects.js';
import { addEmptyImage, chooseImageReference, chooseReferenceFile } from './assets/ReferenceAssets.js';

import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

function MenubarAdd( editor ) {

	const strings = editor.strings;
	const atCursor = object => {

		object.position.add( editor.cursor );
		return new AddObjectCommand( editor, object );

	};

	const container = new UIPanel();
	container.setClass( 'menu' );
	container.dom.dataset.sceneAddMenu = 'true';

	const title = new UIPanel();
	title.setClass( 'title' );
	title.setTextContent( strings.getKey( 'menubar/add' ) );
	title.dom.dataset.glyphKey = 'menubar/add';
	container.add( title );

	const options = new UIPanel();
	options.setClass( 'options' );
	container.add( options );

	// Group

	let option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/add/group' ) );
	option.onClick( function () {

		const mesh = new THREE.Group();
		mesh.name = 'Group';

		editor.execute( atCursor( mesh ) );

	} );
	options.add( option );

	function submenu( label, actions ) {

		const title = new UIRow().setTextContent( label ).addClass( 'option' ).addClass( 'submenu-title' );
		const menu = new UIPanel().setPosition( 'fixed' ).addClass( 'options' ).setDisplay( 'none' );
		title.add( menu );
		title.onMouseOver( () => {

			const { top, right } = title.dom.getBoundingClientRect();
			menu.setLeft( right + 'px' ).setTop( Math.min( top, window.innerHeight - actions.length * 28 - 8 ) + 'px' ).setDisplay( 'block' );

		} );
		title.onMouseOut( () => menu.setDisplay( 'none' ) );
		for ( const [ text, run ] of actions ) menu.add( new UIRow().setClass( 'option' ).setTextContent( text ).onClick( run ) );
		options.add( title );

	}

	submenu( 'Empty', emptyDisplays.map( ( [ style, name ] ) => [ name, () => editor.execute( atCursor( createEmpty( style ) ) ) ] ) );
	submenu( 'Image', [
		[ 'Reference…', () => chooseImageReference( editor ) ],
		[ 'Background…', () => chooseImageReference( editor, 'back' ) ],
		[ 'Mesh Plane…', () => chooseImageReference( editor, 'mesh' ) ],
		[ 'Empty Image', () => addEmptyImage( editor ) ]
	] );
	submenu( 'Modeling Reference', [
		[ 'Point Cloud…', () => chooseReferenceFile( editor, '.ply,.pcd,.xyz' ) ],
		[ 'Gaussian Splat…', () => chooseReferenceFile( editor, '.ply,.splat,.spz,.sog,.rad' ) ],
		[ 'OpenVDB…', () => chooseReferenceFile( editor, '.vdb' ) ]
	] );

	// Mesh

	const meshSubmenuTitle = new UIRow().setTextContent( strings.getKey( 'menubar/add/mesh' ) ).addClass( 'option' ).addClass( 'submenu-title' );
	meshSubmenuTitle.onMouseOver( function () {

		const { top, right } = meshSubmenuTitle.dom.getBoundingClientRect();
		const { paddingTop } = getComputedStyle( this.dom );
		meshSubmenu.setLeft( right + 'px' );
		meshSubmenu.setTop( top - parseFloat( paddingTop ) + 'px' );
		meshSubmenu.setStyle( 'max-height', [ `calc( 100vh - ${top}px )` ] );
		meshSubmenu.setDisplay( 'block' );

	} );
	meshSubmenuTitle.onMouseOut( function () {

		meshSubmenu.setDisplay( 'none' );

	} );
	options.add( meshSubmenuTitle );

	const meshSubmenu = new UIPanel().setPosition( 'fixed' ).addClass( 'options' ).setDisplay( 'none' );
	meshSubmenuTitle.add( meshSubmenu );

	for ( const [ kind, label ] of [ [ 'path', 'Editable path' ], [ 'shape', 'Editable shape' ], [ 'mesh', 'Editable mesh' ] ] ) {

		option = new UIRow().setClass( 'option' ).setTextContent( label );
		option.onClick( () => {

			editor.modeling.create( kind );
			editor.modeling.show?.();

		} );
		meshSubmenu.add( option );

	}

	for ( const [ kind, name, build, fields ] of meshPrimitives ) {

		const translated = strings.getKey( 'menubar/add/mesh/' + kind );
		const label = translated === '???' ? name : translated;
		option = new UIRow().setClass( 'option' ).setTextContent( label );
		option.dom.dataset.meshPrimitive = 'true';
		option.onClick( () => editor.viewTools.run( () => {

			const model = editor.modeling;
			const blender = editor.keymap.preset === 'blender';
			const rebuild = values => build( THREE, blender, values );
			if ( model.editMode && ! model.canInsertPrimitive ) return;
			const geometry = build( THREE, blender );
			if ( model.editMode ) {

				let edit;
				try { edit = model.insertPrimitive( label, geometry ); }
				finally { geometry.dispose(); }
				if ( edit ) editor.primitiveAdjustment.record( 'Add ' + label, fields( blender ), rebuild, {
					...edit,
					replace: next => {

						try { edit.replace( next ); }
						finally { next.dispose(); }

					}
				} );
				return;

			}
			const mesh = new THREE.Mesh( geometry, new THREE.MeshStandardMaterial() );
			mesh.name = blender ? name : kind === 'box' ? 'Box' : kind === 'sphere' ? 'Sphere' : name;
			const command = atCursor( mesh );
			editor.execute( command );
			editor.primitiveAdjustment.record( 'Add ' + label, fields( blender ), rebuild, {
				command,
				available: () => !model.editMode && editor.selected === mesh && !! mesh.parent,
				replace: next => new SetGeometryCommand( editor, mesh, next ).execute()
			} );

		} ) );
		meshSubmenu.add( option );

	}

	// Mesh / Sprite

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/add/mesh/sprite' ) );
	option.onClick( function () {

		const sprite = new THREE.Sprite( new THREE.SpriteMaterial() );
		sprite.name = 'Sprite';

		editor.execute( atCursor( sprite ) );

	} );
	meshSubmenu.add( option );

	// Mesh / Text

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/add/text' ) );
	option.onClick( function () {

		const loader = new FontLoader();
		loader.load( '../examples/fonts/helvetiker_bold.typeface.json', function ( font ) {

			const text = 'THREE.JS';

			const geometry = new TextGeometry( text, {
				text: text,
				font,
				size: 1,
				depth: 0.5,
				curveSegments: 4,

				bevelEnabled: false,
				bevelThickness: 0.1,
				bevelSize: 0.01,
				bevelOffset: 0,
				bevelSegments: 3

			} );

			const mesh = new THREE.Mesh( geometry, new THREE.MeshStandardMaterial() );
			mesh.name = 'Text';

			editor.execute( atCursor( mesh ) );

		} );

	} );
	meshSubmenu.add( option );

	// Light

	const lightSubmenuTitle = new UIRow().setTextContent( strings.getKey( 'menubar/add/light' ) ).addClass( 'option' ).addClass( 'submenu-title' );
	lightSubmenuTitle.onMouseOver( function () {

		const { top, right } = lightSubmenuTitle.dom.getBoundingClientRect();
		const { paddingTop } = getComputedStyle( this.dom );

		lightSubmenu.setLeft( right + 'px' );
		lightSubmenu.setTop( top - parseFloat( paddingTop ) + 'px' );
		lightSubmenu.setStyle( 'max-height', [ `calc( 100vh - ${top}px )` ] );
		lightSubmenu.setDisplay( 'block' );

	} );
	lightSubmenuTitle.onMouseOut( function () {

		lightSubmenu.setDisplay( 'none' );

	} );
	options.add( lightSubmenuTitle );

	const lightSubmenu = new UIPanel().setPosition( 'fixed' ).addClass( 'options' ).setDisplay( 'none' );
	lightSubmenuTitle.add( lightSubmenu );

	// Light / Ambient

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/add/light/ambient' ) );
	option.onClick( function () {

		const color = 0x222222;

		const light = new THREE.AmbientLight( color );
		light.name = 'AmbientLight';

		editor.execute( atCursor( light ) );

	} );
	lightSubmenu.add( option );

	// Light / Directional

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/add/light/directional' ) );
	option.onClick( function () {

		const color = 0xffffff;
		const intensity = 1;

		const light = new THREE.DirectionalLight( color, intensity );
		light.name = 'DirectionalLight';
		light.target.name = 'DirectionalLight Target';

		light.position.set( 5, 10, 7.5 );

		editor.execute( new MultiCmdsCommand( editor, [
			atCursor( light.target ),
			atCursor( light )
		] ) );

	} );
	lightSubmenu.add( option );

	// Light / Hemisphere

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/add/light/hemisphere' ) );
	option.onClick( function () {

		const skyColor = 0x00aaff;
		const groundColor = 0xffaa00;
		const intensity = 1;

		const light = new THREE.HemisphereLight( skyColor, groundColor, intensity );
		light.name = 'HemisphereLight';

		light.position.set( 0, 10, 0 );

		editor.execute( atCursor( light ) );

	} );
	lightSubmenu.add( option );

	// Light / Point

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/add/light/point' ) );
	option.onClick( function () {

		const color = 0xffffff;
		const intensity = 1;
		const distance = 0;

		const light = new THREE.PointLight( color, intensity, distance );
		light.name = 'PointLight';

		editor.execute( atCursor( light ) );

	} );
	lightSubmenu.add( option );

	// Light / Spot

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/add/light/spot' ) );
	option.onClick( function () {

		const color = 0xffffff;
		const intensity = 1;
		const distance = 0;
		const angle = Math.PI * 0.1;
		const penumbra = 0;

		const light = new THREE.SpotLight( color, intensity, distance, angle, penumbra );
		light.name = 'SpotLight';
		light.target.name = 'SpotLight Target';

		light.position.set( 5, 10, 7.5 );

		editor.execute( new MultiCmdsCommand( editor, [
			atCursor( light.target ),
			atCursor( light )
		] ) );

	} );
	lightSubmenu.add( option );

	// Light / Projector

	option = new UIRow().setClass( 'option' ).setTextContent( 'Projector' );
	option.onClick( function () {

		const rig = new THREE.Group();
		rig.name = 'Projector';
		rig.userData.assetObject = { type: 'projector' };
		rig.position.set( 0, 2, 4 );
		rig.rotation.x = - Math.atan2( 2, 4 );
		const command = new MultiCmdsCommand( editor, [
			atCursor( rig ),
			new AddScriptCommand( editor, rig, projectorScript() )
		] );
		command.name = 'Add Projector';
		editor.execute( command );

	} );
	lightSubmenu.add( option );

	// Camera

	const cameraSubmenuTitle = new UIRow().setTextContent( strings.getKey( 'menubar/add/camera' ) ).addClass( 'option' ).addClass( 'submenu-title' );
	cameraSubmenuTitle.onMouseOver( function () {

		const { top, right } = cameraSubmenuTitle.dom.getBoundingClientRect();
		const { paddingTop } = getComputedStyle( this.dom );

		cameraSubmenu.setLeft( right + 'px' );
		cameraSubmenu.setTop( top - parseFloat( paddingTop ) + 'px' );
		cameraSubmenu.setStyle( 'max-height', [ `calc( 100vh - ${top}px )` ] );
		cameraSubmenu.setDisplay( 'block' );

	} );
	cameraSubmenuTitle.onMouseOut( function () {

		cameraSubmenu.setDisplay( 'none' );

	} );
	options.add( cameraSubmenuTitle );

	const cameraSubmenu = new UIPanel().setPosition( 'fixed' ).addClass( 'options' ).setDisplay( 'none' );
	cameraSubmenuTitle.add( cameraSubmenu );

	// Camera / Orthographic

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/add/camera/orthographic' ) );
	option.onClick( function () {

		const aspect = editor.camera.isPerspectiveCamera
			? editor.camera.aspect
			: ( editor.camera.right - editor.camera.left ) / ( editor.camera.top - editor.camera.bottom );
		const camera = new THREE.OrthographicCamera( - aspect, aspect );
		camera.name = 'OrthographicCamera';

		editor.execute( atCursor( camera ) );

	} );
	cameraSubmenu.add( option );

	// Camera / Perspective

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/add/camera/perspective' ) );
	option.onClick( function () {

		const camera = new THREE.PerspectiveCamera();
		camera.name = 'PerspectiveCamera';

		editor.execute( atCursor( camera ) );

	} );
	cameraSubmenu.add( option );

	const canUse = row => ! editor.modeling.editMode || ( row.dataset.meshPrimitive && editor.modeling.canInsertPrimitive );
	title.onMouseOver( () => {

		for ( const row of options.dom.querySelectorAll( ':is(.option, .inactive):not(.submenu-title)' ) ) {

			row.classList.toggle( 'option', Boolean( canUse( row ) ) );
			row.classList.toggle( 'inactive', ! canUse( row ) );

		}

	} );
	options.dom.addEventListener( 'click', event => {

		const row = event.target.closest( ':is(.option, .inactive):not(.submenu-title)' );
		if ( row && ! canUse( row ) ) event.stopImmediatePropagation();

	}, true );

	return container;

}

export { MenubarAdd };
