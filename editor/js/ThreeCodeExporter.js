// three.js code exporter (experiment addition, not part of upstream three.js editor).
// Turns the editor scene into readable, commented JavaScript in the style of the lessons.
import { scriptSourceForExecution, serializeScript } from './ScriptParams.js';
import { hasRestriction } from './ObjectRestrictions.js';
import { cameraControllerSettings } from './CameraControllerScript.js';

const TONE = { 1: 'LinearToneMapping', 2: 'ReinhardToneMapping', 3: 'CineonToneMapping', 4: 'ACESFilmicToneMapping', 6: 'AgXToneMapping', 7: 'NeutralToneMapping' };
const RESERVED = new Set( [ 'scene', 'camera', 'renderer', 'controls', 'THREE', 'mixers', 'gltfLoader', 'objLoader', 'last', 'pmrem', 'dt', 't' ] );
const MODEL_RE = /\.(glb|gltf|obj|vrm)$/i;

const n = ( v ) => {

	const r = Math.round( v * 10000 ) / 10000;
	return String( Object.is( r, - 0 ) ? 0 : r );

};

const hex = ( c ) => '0x' + c.getHexString();
const q = ( s ) => JSON.stringify( s );
const vec = ( a, b, c ) => `${ n( a ) }, ${ n( b ) }, ${ n( c ) }`;

const MAP_KEYS = [ 'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap' ];
const COLOR_MAPS = new Set( [ 'map', 'emissiveMap' ] );
const base = ( p ) => String( p ).split( '/' ).pop();

function drawable( image ) {

	if ( ! image ) return false;
	const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
	return ! ! w && ! ! h && ! image.data && ( image instanceof HTMLImageElement || image instanceof HTMLCanvasElement || ( typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap ) || ( typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas ) );

}

// Returns { code, assets }. assets = [{ path, file } | { path, texture }], paths relative to the exported page.
function generateThreeCode( editor ) {

	const assets = [];
	const assetIssues = [];
	const texVars = new Map();
	const texLines = [];
	const usedPaths = new Set();
	let usesTextures = false;

	const scene = editor.scene;
	const routedObjects = new Set( ( scene.userData.streamRoutes || [] ).filter( route => route?.target?.kind === 'object' ).map( route => route.target.uuid ) );
	scene.traverse( object => {
		if ( editor.scripts?.[ object.uuid ]?.some( script => script.assetBehavior === 'stream' ) ) routedObjects.add( object.uuid );
		for ( const uuid of Object.values( object.userData.vrmBones || {} ) ) routedObjects.add( uuid );
	} );
	const camera = editor.mainCamera || editor.viewportCamera || editor.camera;
	const controllerSettings = cameraControllerSettings( editor, camera );
	const controllerMode = controllerSettings.mode;
	const useController = controllerMode && controllerMode !== 'none';
	const followUuid = controllerSettings.follow;
	const followTargets = new Set( Object.values( editor.cameras || {} ).map( camera => cameraControllerSettings( editor, camera ).follow ).filter( Boolean ) );
	const config = editor.config;
	const lines = [];
	const used = new Set( RESERVED );
	const imports = new Set();
	const out = ( s = '' ) => lines.push( s );
	let needsMixers = false;

	function ident( object, fallback ) {

		let base = ( object.name || '' ).replace( /\.(glb|gltf|obj|vrm)$/i, '' ).replace( /[^A-Za-z0-9]+(.)?/g, ( m, c ) => c ? c.toUpperCase() : '' );
		if ( base === '' ) base = fallback;
		else if ( /^[0-9]/.test( base ) ) base = fallback + base;
		base = base[ 0 ].toLowerCase() + base.slice( 1 );
		let name = base, i = 2;
		while ( used.has( name ) ) name = base + ( i ++ );
		used.add( name );
		return name;

	}

	function geometry( g ) {

		const p = g.parameters || {};
		const a = ( ...keys ) => keys.map( ( k ) => p[ k ] ).filter( ( v ) => v !== undefined ).map( ( v ) => typeof v === 'boolean' ? v : n( v ) ).join( ', ' );
		switch ( g.type ) {

			case 'BoxGeometry': return `new THREE.BoxGeometry(${ a( 'width', 'height', 'depth' ) })`;
			case 'SphereGeometry': return `new THREE.SphereGeometry(${ a( 'radius', 'widthSegments', 'heightSegments' ) })`;
			case 'CylinderGeometry': return `new THREE.CylinderGeometry(${ a( 'radiusTop', 'radiusBottom', 'height', 'radialSegments', 'heightSegments' ) })`;
			case 'PlaneGeometry': return `new THREE.PlaneGeometry(${ a( 'width', 'height' ) })`;
			case 'CircleGeometry': return `new THREE.CircleGeometry(${ a( 'radius', 'segments' ) })`;
			case 'RingGeometry': return `new THREE.RingGeometry(${ a( 'innerRadius', 'outerRadius', 'thetaSegments' ) })`;
			case 'TorusGeometry': return `new THREE.TorusGeometry(${ a( 'radius', 'tube', 'radialSegments', 'tubularSegments' ) })`;
			case 'TorusKnotGeometry': return `new THREE.TorusKnotGeometry(${ a( 'radius', 'tube', 'tubularSegments', 'radialSegments', 'p', 'q' ) })`;
			case 'CapsuleGeometry': return `new THREE.CapsuleGeometry(${ a( 'radius', 'height', 'capSegments', 'radialSegments' ) })`;
			case 'IcosahedronGeometry': case 'OctahedronGeometry': case 'TetrahedronGeometry': case 'DodecahedronGeometry':
				return `new THREE.${ g.type }(${ a( 'radius', 'detail' ) })`;

		}

		// Anything else: inline the raw buffers so the scene still reproduces.
		const arr = ( attr ) => '[' + Array.from( attr.array, n ).join( ', ' ) + ']';
		let s = '(() => {\n    const g = new THREE.BufferGeometry();\n';
		s += `    g.setAttribute('position', new THREE.Float32BufferAttribute(${ arr( g.attributes.position ) }, 3));\n`;
		if ( g.attributes.normal ) s += `    g.setAttribute('normal', new THREE.Float32BufferAttribute(${ arr( g.attributes.normal ) }, 3));\n`;
		if ( g.attributes.uv ) s += `    g.setAttribute('uv', new THREE.Float32BufferAttribute(${ arr( g.attributes.uv ) }, 2));\n`;
		if ( g.index ) s += `    g.setIndex([${ Array.from( g.index.array ).join( ', ' ) }]);\n`;
		return s + '    return g;\n  })()';

	}

	function textureRef( tex, key ) {

		if ( texVars.has( tex.uuid ) ) return texVars.get( tex.uuid );
		const pixels = tex.isDataTexture && ArrayBuffer.isView( tex.image?.data ) ? tex.image.data : null;
		const sourcePath = tex.userData?.sourceAssetPath;
		const sourceFile = ! pixels && /\.(png|jpe?g|webp)$/i.test( sourcePath || '' ) ? editor.sourceFiles?.get( sourcePath )?.file : null;
		const reuse = tex.userData?.assetPath || ( sourceFile && 'assets/' + sourcePath );
		if ( ! reuse && ! pixels && ! drawable( tex.image ) ) {

			assetIssues.push( `Cannot package texture "${ tex.name || key }". Replace it with an imported image.` );
			texLines.push( `// Unsupported texture "${ tex.name || key }" skipped` );
			texVars.set( tex.uuid, null );
			return null;

		}

		let file = base( tex.sourceFile || tex.name || key || 'texture' );
		if ( pixels ) file = file.replace( /\.[^.]*$/, '' ) + '.bin';
		else if ( ! /\.(png|jpe?g|webp)$/i.test( file ) ) file = file.replace( /\.[^.]*$/, '' ) + '.png';
		let path = reuse || 'assets/' + file, i = 2;
		while ( ! reuse && ( usedPaths.has( path ) || editor.sourceFiles?.has( path.slice( 7 ) ) ) ) path = 'assets/' + file.replace( /(\.[^.]+)$/, `_${ i ++ }$1` );
		usedPaths.add( path );
		assets.push( { path, texture: tex, reuse: !! reuse, file: pixels ? new Blob( [ pixels ] ) : sourceFile } );

		const v = ident( { name: base( path ).replace( /\.[^.]+$/, '' ) }, 'texture' );
		texVars.set( tex.uuid, v );
		if ( pixels ) {

			texLines.push( `const ${ v } = new THREE.DataTexture(new ${ pixels.constructor.name }(await (await fetch(${ q( path ) })).arrayBuffer()), ${ tex.image.width }, ${ tex.image.height }, ${ tex.format }, ${ tex.type });` );
			texLines.push( `${ v }.needsUpdate = true;` );

		} else {

			usesTextures = true;
			texLines.push( `const ${ v } = textureLoader.load(${ q( path ) });` );

		}

		if ( tex.colorSpace || COLOR_MAPS.has( key ) ) texLines.push( `${ v }.colorSpace = ${ q( tex.colorSpace || 'srgb' ) };` );
		if ( tex.userData?.mediaBinding ) texLines.push( `${ v }.userData.mediaBinding = ${ q( tex.userData.mediaBinding ) };` );
		if ( tex.mapping !== 300 ) texLines.push( `${ v }.mapping = ${ tex.mapping };` );
		if ( pixels ) {

			texLines.push( `${ v }.minFilter = ${ tex.minFilter };` );
			texLines.push( `${ v }.magFilter = ${ tex.magFilter };` );

		}
		if ( tex.wrapS === 1000 || tex.wrapT === 1000 ) texLines.push( `${ v }.wrapS = ${ v }.wrapT = THREE.RepeatWrapping;` );
		if ( tex.repeat.x !== 1 || tex.repeat.y !== 1 ) texLines.push( `${ v }.repeat.set(${ n( tex.repeat.x ) }, ${ n( tex.repeat.y ) });` );
		if ( tex.flipY === false ) texLines.push( `${ v }.flipY = false;` );
		return v;

	}

	function material( m ) {

		if ( m.isShaderMaterial ) return `new THREE.ShaderMaterial(${ q( { vertexShader: m.vertexShader, fragmentShader: m.fragmentShader, uniforms: m.uniforms, side: m.side, transparent: m.transparent } ) })`;
		const props = [];
		const add = ( k, v ) => props.push( `${ k }: ${ v }` );
		if ( m.color ) add( 'color', hex( m.color ) );
		for ( const key of MAP_KEYS ) {

			if ( m[ key ] && m[ key ].isTexture ) {

				const v = textureRef( m[ key ], key );
				if ( v ) add( key, v );

			}

		}

		if ( m.isMeshStandardMaterial || m.isMeshPhysicalMaterial ) {

			add( 'roughness', n( m.roughness ) );
			add( 'metalness', n( m.metalness ) );

		}

		if ( m.emissive && m.emissive.getHex() !== 0 ) {

			add( 'emissive', hex( m.emissive ) );
			if ( m.emissiveIntensity !== 1 ) add( 'emissiveIntensity', n( m.emissiveIntensity ) );

		}

		if ( m.isMeshPhongMaterial ) add( 'shininess', n( m.shininess ) );
		if ( m.flatShading ) add( 'flatShading', 'true' );
		if ( m.wireframe ) add( 'wireframe', 'true' );
		if ( m.transparent || m.opacity < 1 ) {

			add( 'transparent', 'true' );
			add( 'opacity', n( m.opacity ) );

		}

		if ( m.side === 1 ) add( 'side', 'THREE.BackSide' );
		if ( m.side === 2 ) add( 'side', 'THREE.DoubleSide' );
		const ok = [ 'MeshBasicMaterial', 'MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshPhongMaterial', 'MeshLambertMaterial', 'MeshToonMaterial', 'MeshNormalMaterial', 'LineBasicMaterial', 'PointsMaterial' ];
		const t = ok.includes( m.type ) ? m.type : 'MeshStandardMaterial';
		return `new THREE.${ t }({ ${ props.join( ', ' ) } })`;

	}

	function transform( name, o ) {

		if ( o.isCamera || o.userData.assetObject || followTargets.has( o.uuid ) || routedObjects.has( o.uuid ) ) out( `${ name }.uuid = ${ q( o.uuid ) };` );
		if ( o.userData.asset ) out( `${ name }.userData.asset = ${ q( o.userData.asset ) };` );
		if ( o.userData.assetObject ) out( `${ name }.userData.assetObject = ${ q( o.userData.assetObject ) };` );
		if ( o.userData.vrmBones ) out( `${ name }.userData.vrmBones = ${ q( o.userData.vrmBones ) };` );
		if ( o.userData.vrmRest ) out( `${ name }.userData.vrmRest = ${ q( o.userData.vrmRest ) };` );
		if ( o.isCamera && o.userData.threeditor?.cameraController ) {

			out( `${ name }.userData.threeditor = ${ q( o.userData.threeditor ) };` );

		}
		if ( o.isCamera && o.zoom !== 1 ) out( `${ name }.zoom = ${ n( o.zoom ) }; ${ name }.updateProjectionMatrix();` );
		if ( o.position.lengthSq() > 0 ) out( `${ name }.position.set(${ vec( o.position.x, o.position.y, o.position.z ) });` );
		if ( o.rotation.x || o.rotation.y || o.rotation.z ) out( `${ name }.rotation.set(${ vec( o.rotation.x, o.rotation.y, o.rotation.z ) });   // radians` );
		if ( o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1 ) out( `${ name }.scale.set(${ vec( o.scale.x, o.scale.y, o.scale.z ) });` );
		if ( o.castShadow ) out( `${ name }.castShadow = true;` );
		if ( o.receiveShadow ) out( `${ name }.receiveShadow = true;` );
		if ( o.visible === false || o.userData.threeditor?.disabled === true ) out( `${ name }.visible = false;` );

	}

	const assetBehaviors = [];
	function emitAssetBehavior( object, name ) {
		if ( hasRestriction( object, 'disabled' ) ) return false;
		const scripts = editor.scripts?.[ object.uuid ]?.filter( script => script.assetBehavior && script.assetBehavior !== 'stream' && script.enabled !== false ) || [];
		for ( const script of scripts ) {
			assetBehaviors.push( { object: name, script: { ...serializeScript( script ), source: scriptSourceForExecution( script ) } } );
			for ( const [ path, entry ] of editor.sourceFiles || [] ) {
				if ( ! script.source.includes( JSON.stringify( 'assets/' + path ) ) || usedPaths.has( 'assets/' + path ) ) continue;
				usedPaths.add( 'assets/' + path ); assets.push( { path: 'assets/' + path, file: entry.file } );
			}
		}
		return scripts.some( script => script.assetBehavior === 'model' );
	}

	function emitModel( o, parent ) {

		const name = ident( o, 'model' );
		const sourceName = o.userData?.sourceFile || o.name;
		const isObj = /\.obj$/i.test( sourceName );
		const preferred = o.userData?.sourceAssetPath;
		const key = editor.sourceFiles?.has( preferred ) ? preferred :
			[ ...( editor.sourceFiles?.keys() || [] ) ].find( ( k ) => k === sourceName || k.endsWith( '/' + sourceName ) );
		const modelPath = key || preferred || sourceName;
		const file = 'assets/' + modelPath;
		const entry = editor.sourceFiles?.get( key );
		if ( entry ) {

			for ( const k of entry.batch ) {

				const p = 'assets/' + k;
				const file = editor.sourceFiles.get( k )?.file;
				if ( file && ! usedPaths.has( p ) ) {

					usedPaths.add( p );
					assets.push( { path: p, file } );

				}

			}

		}

		out( `// Imported model: ${ file }` );
		if ( isObj ) {

			imports.add( 'OBJLoader' );
			out( `const ${ name } = await objLoader.loadAsync(${ q( file ) });` );

		} else {

			imports.add( 'GLTFLoader' );
			out( `const ${ name }Gltf = await gltfLoader.loadAsync(${ q( file ) });` );
			out( `const ${ name } = ${ name }Gltf.scene;` );
			out( `${ name }.animations = ${ name }Gltf.animations;` );

		}

		if ( o.name ) out( `${ name }.name = ${ q( o.name ) };` );
		transform( name, o );
		if ( o.userData.assetObject?.stripPresentation ) out( `{const discard=[]; ${ name }.traverse(node=>{if(node.isCamera||node.isLight||node.isHelper)discard.push(node);}); for(const node of discard)node.removeFromParent();}` );
		function emitModelChildOverrides( node, reference ) {

			node.children.forEach( ( child, index ) => {

				const childReference = `${ reference }.children[${ index }]`;
				const guardedReference = childReference.replaceAll( '.children[', '?.children[' );
				if ( followTargets.has( child.uuid ) || routedObjects.has( child.uuid ) ) out( `if (${ guardedReference }) ${ childReference }.uuid = ${ q( child.uuid ) };` );
				if ( child.userData.threeditor?.disabled === true ) out( `if (${ guardedReference }) ${ childReference }.visible = false;` );
				emitModelChildOverrides( child, childReference );

			} );

		}
		emitModelChildOverrides( o, name );
		out( `${ parent }.add(${ name });` );
		const clips = o.animations || [];
		const hasAssetBehavior = emitAssetBehavior( o, name );
		if ( clips.length > 0 && ! isObj && ! hasAssetBehavior && ! hasRestriction( o, 'disabled' ) ) {

			needsMixers = true;
			out( `// Animations in this file: ${ clips.map( ( c ) => q( c.name ) ).join( ', ' ) }` );
			out( `const ${ name }Mixer = new THREE.AnimationMixer(${ name });` );
			out( `mixers.push(${ name }Mixer);` );
			clips.forEach( ( c, i ) => {

				out( `${ i === 0 ? '' : '// ' }${ name }Mixer.clipAction(THREE.AnimationClip.findByName(${ name }Gltf.animations, ${ q( c.name ) })).play();` );

			} );

		}

		out();

	}

	const ranges = {}; // object uuid -> [first, last] line index within the scene section

	function emitObject( o, parent ) {

		const from = lines.length;
		const r = emitObjectInner( o, parent );
		if ( lines.length > from ) ranges[ o.uuid ] = [ from, lines.length - 1 ];
		return r;

	}

	function emitObjectInner( o, parent ) {

		if ( o.isHelper ) return;
		if ( MODEL_RE.test( o.userData?.sourceFile || o.name ) && o.children.length > 0 ) return emitModel( o, parent );

		let name;
		if ( o.isMesh || o.isPoints || o.isLine ) {

			name = ident( o, o.isMesh ? 'mesh' : 'obj' );
			const C = o.isMesh ? 'Mesh' : o.isPoints ? 'Points' : o.isLineSegments ? 'LineSegments' : 'Line';
			const m = Array.isArray( o.material ) ? o.material[ 0 ] : o.material;
			out( `const ${ name } = new THREE.${ C }(\n  ${ geometry( o.geometry ) },\n  ${ material( m ) }\n);` );

		} else if ( o.isLight ) {

			name = ident( o, 'light' );
			const l = o;
			const I = n( l.intensity );
			switch ( true ) {

				case l.isAmbientLight: out( `const ${ name } = new THREE.AmbientLight(${ hex( l.color ) }, ${ I });` ); break;
				case l.isDirectionalLight: out( `const ${ name } = new THREE.DirectionalLight(${ hex( l.color ) }, ${ I });` ); break;
				case l.isHemisphereLight: out( `const ${ name } = new THREE.HemisphereLight(${ hex( l.color ) }, ${ hex( l.groundColor ) }, ${ I });` ); break;
				case l.isPointLight: out( `const ${ name } = new THREE.PointLight(${ hex( l.color ) }, ${ I }, ${ n( l.distance ) }, ${ n( l.decay ) });` ); break;
				case l.isSpotLight: out( `const ${ name } = new THREE.SpotLight(${ hex( l.color ) }, ${ I }, ${ n( l.distance ) }, ${ n( l.angle ) }, ${ n( l.penumbra ) }, ${ n( l.decay ) });` ); break;
				default: out( `// Unsupported light type ${ l.type } skipped` ); return;

			}

		} else if ( o.isPerspectiveCamera ) {

			name = ident( o, 'camera' );
			out( `const ${ name } = new THREE.PerspectiveCamera(${ n( o.fov ) }, ${ n( o.aspect ) }, ${ n( o.near ) }, ${ n( o.far ) });` );

		} else if ( o.isOrthographicCamera ) {

			name = ident( o, 'camera' );
			out( `const ${ name } = new THREE.OrthographicCamera(${ [ o.left, o.right, o.top, o.bottom, o.near, o.far ].map( n ).join( ', ' ) });` );

		} else if ( o.isSprite ) {

			name = ident( o, 'sprite' );
			const map = o.material.map && textureRef( o.material.map, 'map' );
			out( `const ${ name } = new THREE.Sprite(new THREE.SpriteMaterial({ color: ${ hex( o.material.color ) }${ map ? ', map: ' + map : '' } }));` );

		} else if ( o.isGroup || o.isObject3D ) {

			name = ident( o, 'group' );
			out( `const ${ name } = new THREE.${ o.isGroup ? 'Group' : 'Object3D' }();` );

		} else {

			out( `// Unsupported object ${ o.type } "${ o.name }" skipped` );
			return;

		}

		if ( o.name ) out( `${ name }.name = ${ q( o.name ) };` );
		transform( name, o );
		if ( o.isLight && o.castShadow && o.shadow ) {

			const s = o.shadow;
			if ( s.camera?.isOrthographicCamera ) out( `${ name }.shadow.camera.left = ${ n( s.camera.left ) }; ${ name }.shadow.camera.right = ${ n( s.camera.right ) }; ${ name }.shadow.camera.top = ${ n( s.camera.top ) }; ${ name }.shadow.camera.bottom = ${ n( s.camera.bottom ) };` );
			if ( s.mapSize.x !== 512 ) out( `${ name }.shadow.mapSize.set(${ s.mapSize.x }, ${ s.mapSize.y });` );

		}

		out( `${ parent }.add(${ name });` );
		if ( o.isDirectionalLight || o.isSpotLight ) {

			const t = o.target.position;
			if ( t.lengthSq() > 0 ) out( `${ name }.target.position.set(${ vec( t.x, t.y, t.z ) });\n${ parent }.add(${ name }.target);` );

		}

		emitAssetBehavior( o, name );
		out();
		for ( const c of o.children ) emitObject( c, name );

	}

	// Build the body first so we know which imports are needed.

if ( scene.userData.threeditor?.disabled === true ) out( 'scene.visible = false;' );

	if ( scene.background ) {

		if ( scene.background.isColor ) out( `scene.background = new THREE.Color(${ hex( scene.background ) });` );
		else {

			const texture = textureRef( scene.background, 'background' );
			if ( texture ) {

				out( `scene.background = ${ texture };` );
				out( `scene.backgroundIntensity = ${ n( scene.backgroundIntensity ) };` );
				out( `scene.backgroundBlurriness = ${ n( scene.backgroundBlurriness ) };` );
				out( `scene.backgroundRotation.set(${ vec( scene.backgroundRotation.x, scene.backgroundRotation.y, scene.backgroundRotation.z ) });` );

			}

		}

	}

	if ( scene.fog ) {

		if ( scene.fog.isFogExp2 ) out( `scene.fog = new THREE.FogExp2(${ hex( scene.fog.color ) }, ${ n( scene.fog.density ) });   // colour, density` );
		else out( `scene.fog = new THREE.Fog(${ hex( scene.fog.color ) }, ${ n( scene.fog.near ) }, ${ n( scene.fog.far ) });   // colour, near, far` );

	}

	if ( scene.environment && ! scene.environment.isRenderTargetTexture ) {

		const texture = textureRef( scene.environment, 'environment' );
		if ( texture ) {

			out( `scene.environment = ${ texture };` );
			out( `scene.environmentIntensity = ${ n( scene.environmentIntensity ) };` );
			out( `scene.environmentRotation.set(${ vec( scene.environmentRotation.x, scene.environmentRotation.y, scene.environmentRotation.z ) });` );

		}

	} else if ( scene.environment && editor.environmentType !== 'Default' ) {

		assetIssues.push( 'Cannot package the environment render target. Replace it with an imported environment texture.' );

	}

	if ( lines.length > 0 ) out();

	// Recreate procedural lighting on the exported renderer. The editor's PMREM texture
	// belongs to its own renderer, while imported environment textures are saved above.
	const environmentClass = editor.environmentType === 'Default' &&
		( ! scene.environment || scene.environment.isRenderTargetTexture ) &&
		( ! scene.background || scene.background.isColor ) ?
		( scene.background ? 'ColorEnvironment' : 'RoomEnvironment' ) : null;

	if ( MODEL_RE.test( scene.userData?.sourceFile || scene.name ) && scene.children.length > 0 ) emitModel( scene, 'scene' );
	else for ( const c of scene.children ) emitObject( c, 'scene' );

	const sceneLines = lines.splice( 0, lines.length );
	const shift = texLines.length > 0 ? texLines.length + 2 : 0;
	if ( texLines.length > 0 ) sceneLines.unshift( '// Textures (image files live in assets/)', ...texLines, '' );

	const tm = config.getKey( 'project/renderer/toneMapping' );
	const target = editor.controls?.getCenter?.( camera ) || editor.controls?.center || { x: 0, y: 0, z: 0 };
	const position = camera.getWorldPosition( camera.position.clone() );
	const rotation = camera.getWorldQuaternion( camera.quaternion.clone() );
	const orthoCenter = camera.isOrthographicCamera ? ( camera.left + camera.right ) / 2 : 0;
	const orthoHalfHeight = camera.isOrthographicCamera ? ( camera.top - camera.bottom ) / 2 : 0;

	const head = [];
	head.push( '// Generated by the three.js editor fork ("three.js code" exporter). Edit freely: every line is plain three.js.' );
	head.push( `import * as THREE from 'three';` );
	if ( useController ) head.push( `import { createCameraController } from 'three/addons/controls/CameraController.js';` );
	for ( const i of imports ) head.push( `import { ${ i } } from 'three/addons/loaders/${ i }.js';` );
	if ( imports.has( 'GLTFLoader' ) ) {

		head.push( "import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';" );
		head.push( "import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';" );
		head.push( "import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';" );

	}

	if ( environmentClass ) head.push( `import { ${ environmentClass } } from 'three/addons/environments/${ environmentClass }.js';` );
	head.push( '' );
	head.push( '// @key Scene and camera | The scene holds what exists; the camera says where we look from.' );
	head.push( 'const scene = new THREE.Scene();' );
	if ( camera.isOrthographicCamera ) {

		const halfWidth = `${ orthoHalfHeight } * innerWidth / innerHeight`;
		head.push( `const camera = new THREE.OrthographicCamera(${ orthoCenter } - ${ halfWidth }, ${ orthoCenter } + ${ halfWidth }, ${ camera.top }, ${ camera.bottom }, ${ camera.near }, ${ camera.far });` );

	} else {

		head.push( `const camera = new THREE.PerspectiveCamera(${ camera.fov }, innerWidth / innerHeight, ${ camera.near }, ${ camera.far });` );

	}
	head.push( `camera.position.set(${ vec( position.x, position.y, position.z ) });` );
	head.push( `camera.quaternion.set(${ [ rotation.x, rotation.y, rotation.z, rotation.w ].map( n ).join( ', ' ) }).normalize();` );
	if ( camera.zoom !== 1 ) {

		head.push( `camera.zoom = ${ camera.zoom };` );
		head.push( 'camera.updateProjectionMatrix();' );

	}
	head.push( '// @/key' );
	head.push( '' );
	head.push( '// @key Renderer | Draws the scene, seen through the camera, onto a canvas element.' );
	head.push( `const renderer = new THREE.WebGLRenderer({ antialias: ${ config.getKey( 'project/renderer/antialias' ) }, reversedDepthBuffer: true });` );
	head.push( 'renderer.setSize(innerWidth, innerHeight);' );
	head.push( 'renderer.setPixelRatio(devicePixelRatio);' );
	if ( TONE[ tm ] ) head.push( `renderer.toneMapping = THREE.${ TONE[ tm ] };` );
	if ( config.getKey( 'project/renderer/shadows' ) ) head.push( 'renderer.shadowMap.enabled = true;' );
	head.push( 'document.body.append(renderer.domElement);   // domElement is the <canvas>' );
	head.push( '// @/key' );
	head.push( '' );
	if ( imports.has( 'GLTFLoader' ) ) {

		head.push( 'const gltfLoader = new GLTFLoader();' );
		head.push( "gltfLoader.setDRACOLoader(new DRACOLoader().setDecoderPath('./lib/codecs/draco/gltf/'));" );
		head.push( "gltfLoader.setKTX2Loader(new KTX2Loader().setTranscoderPath('./lib/codecs/basis/').detectSupport(renderer));" );
		head.push( 'gltfLoader.setMeshoptDecoder(MeshoptDecoder);' );

	}
	if ( imports.has( 'OBJLoader' ) ) head.push( 'const objLoader = new OBJLoader();' );
	if ( usesTextures ) head.push( 'const textureLoader = new THREE.TextureLoader();' );
	if ( needsMixers ) head.push( 'const mixers = [];   // one AnimationMixer per animated model' );
	if ( imports.size > 0 || needsMixers || usesTextures ) head.push( '' );
	head.push( '// @key Scene contents | Objects, lights and their hierarchy (add() puts a child inside a parent).' );

	const tail = [];
	if ( assetBehaviors.length ) head.push( 'const assetUpdates = [];' );

	tail.push( '// @/key' );
	for ( const { object, script } of assetBehaviors ) {
		tail.push( `{ // Attached editable asset behavior: ${ script.name }` );
		tail.push( `const behavior = (function(THREE,params,player){\n${ script.source }\nreturn {init:typeof init==='function'?init:null,update:typeof update==='function'?update:null,stop:typeof stop==='function'?stop:null};}).call(${ object },THREE,${ q( script.parameters || {} ) },{dom:document.body});` );
		tail.push( `behavior.init?.call(${ object }); assetUpdates.push(event=>behavior.update?.call(${ object },event));` );
		tail.push( '}' );
	}

	tail.push( '' );
	if ( useController ) {

		const follow = controllerMode === 'thirdPerson' && followUuid ? `, follow: scene.getObjectByProperty('uuid', ${ q( followUuid ) })` : '';
		const options = { ...controllerSettings };
		delete options.follow;
		tail.push( `const controls = createCameraController(camera, renderer.domElement, { ...${ q( options ) }, target: [${ vec( target.x, target.y, target.z ) }]${ follow } });` );

	}
	if ( environmentClass ) {

		tail.push( '// Recreate the editor’s Default environment after setting the background.' );
		tail.push( '{' );
		tail.push( `  const environment = new ${ environmentClass }(${ scene.background ? 'scene.background' : '' });` );
		tail.push( '  const pmrem = new THREE.PMREMGenerator(renderer);' );
		tail.push( '  scene.environment = pmrem.fromScene(environment, 0.04).texture;' );
		tail.push( '  environment.dispose();' );
		tail.push( '  pmrem.dispose();' );
		tail.push( '}' );
		if ( scene.environmentIntensity !== 1 ) tail.push( `scene.environmentIntensity = ${ n( scene.environmentIntensity ) };` );
		const rotation = scene.environmentRotation;
		if ( rotation.x || rotation.y || rotation.z ) tail.push( `scene.environmentRotation.set(${ vec( rotation.x, rotation.y, rotation.z ) });` );
		tail.push( '' );

	}

	tail.push( `addEventListener('resize', () => {` );
	if ( camera.isOrthographicCamera ) {

		tail.push( `  const halfWidth = ${ orthoHalfHeight } * innerWidth / innerHeight;` );
		tail.push( `  camera.left = ${ orthoCenter } - halfWidth;` );
		tail.push( `  camera.right = ${ orthoCenter } + halfWidth;` );

	} else {

		tail.push( '  camera.aspect = innerWidth / innerHeight;' );

	}
	tail.push( '  camera.updateProjectionMatrix();' );
	tail.push( '  renderer.setSize(innerWidth, innerHeight);' );
	tail.push( '});' );
	tail.push( '' );
	tail.push( '// @key The loop | Called every frame with the time in milliseconds.' );
	tail.push( 'let last = performance.now();' );
	tail.push( 'renderer.setAnimationLoop((t) => {' );
	if ( needsMixers || useController || assetBehaviors.length ) {

		tail.push( '  const dt = (t - last) / 1000;   // seconds since the previous frame' );
		if ( needsMixers ) tail.push( '  for (const m of mixers) m.update(dt);' );

	}

	if ( assetBehaviors.length ) tail.push( '  for (const update of assetUpdates) update({time:t,delta:dt*1000});' );
	tail.push( '  last = t;' );
	if ( useController ) tail.push( '  controls.update(dt);' );
	tail.push( '  renderer.render(scene, camera);' );
	tail.push( '});' );
	tail.push( '// @/key' );

	const offset = head.length + shift;
	for ( const k in ranges ) ranges[ k ] = [ ranges[ k ][ 0 ] + offset, ranges[ k ][ 1 ] + offset ];

	return { code: [ ...head, ...sceneLines, ...tail ].join( '\n' ) + '\n', assets, ranges, assetIssues };

}

function exportThreeCode( editor ) {

	return generateThreeCode( editor ).code;

}

// Turns the asset list into Blobs (textures are re-encoded from their in-memory image).
async function assetsToBlobs( assets, store = new Map() ) {

	const map = new Map();
	for ( const a of assets ) {

		if ( a.reuse && store.has( a.path ) ) {

			map.set( a.path, store.get( a.path ) );
			continue;

		}

		if ( a.file ) {

			map.set( a.path, a.file );
			continue;

		}

		const img = a.texture.image;
		if ( ! drawable( img ) ) throw new Error( 'Missing texture image for ' + a.path );
		const canvas = document.createElement( 'canvas' );
		canvas.width = img.naturalWidth || img.width;
		canvas.height = img.naturalHeight || img.height;
		canvas.getContext( '2d' ).drawImage( img, 0, 0 );
		const jpeg = /\.jpe?g$/i.test( a.path );
		const blob = await new Promise( ( r ) => canvas.toBlob( r, jpeg ? 'image/jpeg' : /\.webp$/i.test( a.path ) ? 'image/webp' : 'image/png', 0.92 ) );
		if ( ! blob ) throw new Error( 'Could not encode ' + a.path );
		map.set( a.path, blob );

	}

	return map;

}

// Runs the "Scene contents" section of the code and returns a THREE.Scene, with loaders that resolve assets/ paths
// through `resolve(path) -> url` and tag models/textures with their source file so they re-export.
async function buildSceneFromCode( code, resolve, env = {} ) {

	const m = code.match( /\/\/ @key Scene contents[^\n]*\n([\s\S]*?)\n\/\/ @\/key/ );
	if ( ! m ) throw new Error( 'Could not find the "// @key Scene contents" ... "// @/key" section.' );

	const THREE = await import( 'three' );
	const { GLTFLoader } = await import( 'three/addons/loaders/GLTFLoader.js' );
	const { OBJLoader } = await import( 'three/addons/loaders/OBJLoader.js' );
	const { RoomEnvironment } = await import( 'three/addons/environments/RoomEnvironment.js' );
	const { ColorEnvironment } = await import( 'three/addons/environments/ColorEnvironment.js' );

	const manager = new THREE.LoadingManager();
	manager.setURLModifier( ( url ) => resolve( url ) || url );
	let loadError;
	manager.onError = ( url ) => { loadError ??= new Error( 'Could not load asset: ' + url ); };

	const pending = [];

	class TagTextureLoader extends THREE.TextureLoader {

		load( url, onLoad, onProgress, onError ) {

			let finish;
			pending.push( new Promise( ( resolve ) => { finish = resolve; } ) );
			const t = super.load( url, ( tex ) => {

				try {

					onLoad?.( tex );

				} catch ( error ) {

					loadError ??= error;

				} finally {

					finish();

				}

			}, onProgress, ( error ) => {

				loadError ??= new Error( 'Could not load texture: ' + url );
				try {

					onError?.( error );

				} finally {

					finish();

				}

			} );
			t.sourceFile = base( url );
			const key = String( url ).replace( /^\.?\//, '' );
			if ( key.startsWith( 'assets/' ) ) t.userData.assetPath = key;
			return t;

		}

	}

	class TagGLTFLoader extends GLTFLoader {

		async loadAsync( url, onProgress ) {

			const g = await super.loadAsync( url, onProgress );
			g.scene.name = base( url );
			g.scene.userData.sourceFile = base( url );
			g.scene.userData.sourceAssetPath = String( url ).replace( /^(?:\.\/)?assets\//, '' );
			g.scene.animations = g.animations;
			return g;

		}

	}

	class TagOBJLoader extends OBJLoader {

		async loadAsync( url, onProgress ) {

			const o = await super.loadAsync( url, onProgress );
			o.name = base( url );
			o.userData.sourceFile = base( url );
			o.userData.sourceAssetPath = String( url ).replace( /^(?:\.\/)?assets\//, '' );
			return o;

		}

	}

	const scene = new THREE.Scene();
	const mixers = [];
	const AsyncFunction = Object.getPrototypeOf( async function () {} ).constructor;
	// The section may also touch things defined above it in the full program (camera, renderer, controls, pmrem).
	// Give it harmless stand-ins: the real viewport renderer is read-only here so the editor view can't be altered.
	const camera = env.camera ? env.camera.clone() : new THREE.PerspectiveCamera();
	const real = env.renderer;
	const renderer = new Proxy( {}, {
		get: ( _, k ) => {

			if ( real && k in real ) {

				const v = real[ k ];
				if ( typeof v !== 'function' ) return v;
				if ( [ 'setSize', 'setPixelRatio', 'setAnimationLoop', 'render', 'dispose', 'setViewport', 'setClearColor' ].includes( k ) ) return () => {};
				return v.bind( real );

			}

			return () => {};

		},
		set: () => true
	} );
	const controls = { target: new THREE.Vector3(), update() {}, enabled: true };
	const pmrem = real ? new THREE.PMREMGenerator( real ) : { fromScene: () => ( { texture: null } ), dispose() {} };

	try {

		const run = new AsyncFunction( 'THREE', 'scene', 'gltfLoader', 'objLoader', 'textureLoader', 'mixers', 'camera', 'renderer', 'controls', 'pmrem', 'RoomEnvironment', 'ColorEnvironment', 'fetch', m[ 1 ] );
		await run( THREE, scene, new TagGLTFLoader( manager ), new TagOBJLoader( manager ), new TagTextureLoader( manager ), mixers, camera, renderer, controls, pmrem, RoomEnvironment, ColorEnvironment, ( url, options ) => fetch( resolve( url ) || url, options ) );
		// Load callbacks can request additional textures.
		for ( let i = 0; i < pending.length; i ++ ) await pending[ i ];
		if ( loadError ) throw loadError;
		return scene;

	} finally {

		pmrem.dispose();

	}

}

export { exportThreeCode, generateThreeCode, assetsToBlobs, buildSceneFromCode };
