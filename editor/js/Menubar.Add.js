import * as THREE from 'three';

import { UIPanel } from './libs/ui.js';

import { projectorScript } from './assets/Projector.js?v=projector-shadows';
import { AddScriptCommand } from './commands/AddScriptCommand.js';
import { AddObjectCommand } from './commands/AddObjectCommand.js';
import { SetGeometryCommand } from './commands/SetGeometryCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { meshPrimitives } from './modeling/MeshPrimitives.js?v=uv-sculpt';
import { createEmpty, emptyDisplays } from './modeling/ReferenceObjects.js';
import { addEmptyImage, chooseImageReference, chooseReferenceFile } from './assets/ReferenceAssets.js';
import { createRig } from './rigging/ArmatureTools.js';

import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

function MenubarAdd( editor ) {

	const strings = editor.strings;
	const atCursor = object => {

		object.position.add( editor.cursor );
		return new AddObjectCommand( editor, object );

	};

	const label = strings.getKey( 'menubar/add' );
	const actions = [];
	function add( name, run, section = label, primitive = false ) {

		const available = () => ! editor.modeling.editMode || ( primitive && editor.modeling.canInsertPrimitive );
		const action = { label: name, section, available, run: () => { if ( available() ) run(); } };
		actions.push( action );
		return action;

	}

	function submenu( name, entries ) {

		return { label: name, children: entries.map( ( [ text, run ] ) => add( text, run, name ) ) };

	}

	const group = add( strings.getKey( 'menubar/add/group' ), () => {

		const group = new THREE.Group();
		group.name = 'Group';
		editor.execute( atCursor( group ) );

	} );
	const empty = submenu( 'Empty', emptyDisplays.map( ( [ style, name ] ) => [ name, () => editor.execute( atCursor( createEmpty( style ) ) ) ] ) );
	const image = submenu( 'Image', [
		[ 'Reference…', () => chooseImageReference( editor ) ],
		[ 'Background…', () => chooseImageReference( editor, 'back' ) ],
		[ 'Mesh Plane…', () => chooseImageReference( editor, 'mesh' ) ],
		[ 'Empty Image', () => addEmptyImage( editor ) ]
	] );
	const references = submenu( 'Modeling Reference', [
		[ 'Point Cloud…', () => chooseReferenceFile( editor, '.ply,.pcd,.xyz' ) ],
		[ 'Gaussian Splat…', () => chooseReferenceFile( editor, '.ply,.splat,.spz,.sog,.rad' ) ],
		[ 'OpenVDB…', () => chooseReferenceFile( editor, '.vdb' ) ]
	] );

	const mesh = { label: strings.getKey( 'menubar/add/mesh' ), children: [] };
	const curve = { label: 'Curve', children: [] };
	for ( const [ kind, name, category ] of [ [ 'path', 'Editable path', curve ], [ 'shape', 'Editable shape', curve ], [ 'mesh', 'Editable mesh', mesh ] ] ) {

		category.children.push( add( name, () => {

			editor.modeling.create( kind );
			editor.modeling.show?.();

		}, category.label ) );

	}

	for ( const [ kind, name, build, fields ] of meshPrimitives ) {

		const translated = strings.getKey( 'menubar/add/mesh/' + kind );
		const label = translated === '???' ? name : translated;
		mesh.children.push( add( label, () => editor.viewTools.run( () => {

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

		} ), mesh.label, true ) );

	}

	const sprite = add( strings.getKey( 'menubar/add/mesh/sprite' ), () => {

		const sprite = new THREE.Sprite( new THREE.SpriteMaterial() );
		sprite.name = 'Sprite';

		editor.execute( atCursor( sprite ) );

	} );

	const text = add( strings.getKey( 'menubar/add/text' ), () => {

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
	const lights = { label: strings.getKey( 'menubar/add/light' ), children: [] };

	// Light / Ambient

	lights.children.push( add( strings.getKey( 'menubar/add/light/ambient' ), () => {

		const color = 0x222222;

		const light = new THREE.AmbientLight( color );
		light.name = 'AmbientLight';

		editor.execute( atCursor( light ) );

	}, lights.label ) );

	// Light / Directional

	lights.children.push( add( strings.getKey( 'menubar/add/light/directional' ), () => {

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

	}, lights.label ) );

	// Light / Hemisphere

	lights.children.push( add( strings.getKey( 'menubar/add/light/hemisphere' ), () => {

		const skyColor = 0x00aaff;
		const groundColor = 0xffaa00;
		const intensity = 1;

		const light = new THREE.HemisphereLight( skyColor, groundColor, intensity );
		light.name = 'HemisphereLight';

		light.position.set( 0, 10, 0 );

		editor.execute( atCursor( light ) );

	}, lights.label ) );

	// Light / Point

	lights.children.push( add( strings.getKey( 'menubar/add/light/point' ), () => {

		const color = 0xffffff;
		const intensity = 1;
		const distance = 0;

		const light = new THREE.PointLight( color, intensity, distance );
		light.name = 'PointLight';

		editor.execute( atCursor( light ) );

	}, lights.label ) );

	// Light / Spot

	lights.children.push( add( strings.getKey( 'menubar/add/light/spot' ), () => {

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

	}, lights.label ) );

	// Light / Projector

	lights.children.push( add( 'Projector', () => {

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

	}, lights.label ) );

	const cameras = { label: strings.getKey( 'menubar/add/camera' ), children: [] };

	// Camera / Orthographic

	cameras.children.push( add( strings.getKey( 'menubar/add/camera/orthographic' ), () => {

		const aspect = editor.camera.isPerspectiveCamera
			? editor.camera.aspect
			: ( editor.camera.right - editor.camera.left ) / ( editor.camera.top - editor.camera.bottom );
		const camera = new THREE.OrthographicCamera( - aspect, aspect );
		camera.name = 'OrthographicCamera';

		editor.execute( atCursor( camera ) );

	}, cameras.label ) );

	// Camera / Perspective

	cameras.children.push( add( strings.getKey( 'menubar/add/camera/perspective' ), () => {

		const camera = new THREE.PerspectiveCamera();
		camera.name = 'PerspectiveCamera';

		editor.execute( atCursor( camera ) );

	}, cameras.label ) );

	const armature = add( 'Armature', () => createRig( editor ) );
	editor.sceneAddMenu = { label, actions, items: [ mesh, curve, text, sprite, armature, empty, image, references, lights, cameras, group ] };

	const container = new UIPanel().setClass( 'menu scene-add-menu' );
	container.dom.dataset.sceneAddMenu = 'true';
	const trigger = document.createElement( 'button' );
	trigger.type = 'button';
	trigger.className = 'title';
	trigger.dataset.glyphKey = 'menubar/add';
	trigger.textContent = label;
	trigger.setAttribute( 'aria-label', label );
	trigger.setAttribute( 'aria-haspopup', 'dialog' );
	trigger.setAttribute( 'aria-expanded', 'false' );
	trigger.addEventListener( 'click', () => {

		if ( trigger.getAttribute( 'aria-expanded' ) === 'true' ) editor.contextMenu?.close();
		else {

			const bounds = trigger.getBoundingClientRect();
			editor.contextMenu?.openAdd( { x: bounds.left, y: bounds.bottom }, trigger );

		}

	} );
	container.dom.appendChild( trigger );

	return container;

}

export { MenubarAdd };
