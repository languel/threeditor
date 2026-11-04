// three.js code exporter (experiment addition, not part of upstream three.js editor).
// Turns the editor scene into readable, commented JavaScript in the style of the lessons.

const TONE = { 1: 'LinearToneMapping', 2: 'ReinhardToneMapping', 3: 'CineonToneMapping', 4: 'ACESFilmicToneMapping', 6: 'AgXToneMapping', 7: 'NeutralToneMapping' };
const RESERVED = new Set( [ 'scene', 'camera', 'renderer', 'controls', 'THREE', 'mixers', 'gltfLoader', 'objLoader', 'last', 'pmrem', 'dt', 't' ] );
const MODEL_RE = /\.(glb|gltf|obj)$/i;

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
	const texVars = new Map();
	const texLines = [];
	const usedPaths = new Set();
	let usesTextures = false;

	const scene = editor.scene;
	const camera = editor.camera;
	const config = editor.config;
	const lines = [];
	const used = new Set( RESERVED );
	const imports = new Set();
	const out = ( s = '' ) => lines.push( s );
	let needsMixers = false;

	function ident( object, fallback ) {

		let base = ( object.name || '' ).replace( /\.(glb|gltf|obj)$/i, '' ).replace( /[^A-Za-z0-9]+(.)?/g, ( m, c ) => c ? c.toUpperCase() : '' );
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
		const reuse = tex.userData?.assetPath;
		if ( ! reuse && ! drawable( tex.image ) ) {

			texLines.push( `// texture "${ tex.name || key }" is not an image the exporter can save; skipped` );
			texVars.set( tex.uuid, null );
			return null;

		}

		let file = base( tex.sourceFile || tex.name || key || 'texture' );
		if ( ! /\.(png|jpe?g|webp)$/i.test( file ) ) file = file.replace( /\.[^.]*$/, '' ) + '.png';
		let path = reuse || 'assets/' + file, i = 2;
		while ( ! reuse && usedPaths.has( path ) ) path = 'assets/' + file.replace( /(\.[^.]+)$/, `_${ i ++ }$1` );
		usedPaths.add( path );
		assets.push( { path, texture: tex, reuse: !! reuse } );

		usesTextures = true;
		const v = ident( { name: base( path ).replace( /\.[^.]+$/, '' ) }, 'texture' );
		texVars.set( tex.uuid, v );
		texLines.push( `const ${ v } = textureLoader.load(${ q( path ) });` );
		if ( COLOR_MAPS.has( key ) ) texLines.push( `${ v }.colorSpace = THREE.SRGBColorSpace;   // colour data, not raw numbers` );
		if ( tex.wrapS === 1000 || tex.wrapT === 1000 ) texLines.push( `${ v }.wrapS = ${ v }.wrapT = THREE.RepeatWrapping;` );
		if ( tex.repeat.x !== 1 || tex.repeat.y !== 1 ) texLines.push( `${ v }.repeat.set(${ n( tex.repeat.x ) }, ${ n( tex.repeat.y ) });` );
		if ( tex.flipY === false ) texLines.push( `${ v }.flipY = false;` );
		return v;

	}

	function material( m ) {

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

		if ( o.position.lengthSq() > 0 ) out( `${ name }.position.set(${ vec( o.position.x, o.position.y, o.position.z ) });` );
		if ( o.rotation.x || o.rotation.y || o.rotation.z ) out( `${ name }.rotation.set(${ vec( o.rotation.x, o.rotation.y, o.rotation.z ) });   // radians` );
		if ( o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1 ) out( `${ name }.scale.set(${ vec( o.scale.x, o.scale.y, o.scale.z ) });` );
		if ( o.castShadow ) out( `${ name }.castShadow = true;` );
		if ( o.receiveShadow ) out( `${ name }.receiveShadow = true;` );
		if ( o.visible === false ) out( `${ name }.visible = false;` );

	}

	function emitModel( o, parent ) {

		const name = ident( o, 'model' );
		const sourceName = o.userData?.sourceFile || o.name;
		const isObj = /\.obj$/i.test( sourceName );
		const key = [ ...( editor.sourceFiles?.keys() || [] ) ].find( ( k ) => k === sourceName || k.endsWith( '/' + sourceName ) );
		const file = 'assets/' + ( key || sourceName );
		if ( key ) {

			for ( const k of editor.sourceFiles.get( key ).batch ) {

				const p = 'assets/' + k;
				if ( ! usedPaths.has( p ) ) {

					usedPaths.add( p );
					assets.push( { path: p, file: editor.sourceFiles.get( k ).file } );

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

		}

		transform( name, o );
		out( `${ parent }.add(${ name });` );
		const clips = o.animations || [];
		if ( clips.length > 0 && ! isObj ) {

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
			out( `const ${ name } = new THREE.Sprite(new THREE.SpriteMaterial({ color: ${ hex( o.material.color ) } }));` );

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

		out();
		for ( const c of o.children ) emitObject( c, name );

	}

	// Build the body first so we know which imports are needed.

	if ( scene.background ) {

		if ( scene.background.isColor ) out( `scene.background = new THREE.Color(${ hex( scene.background ) });` );
		else out( '// scene.background is a texture in the editor: load it with THREE.TextureLoader / RGBELoader' );

	}

	if ( scene.fog ) {

		if ( scene.fog.isFogExp2 ) out( `scene.fog = new THREE.FogExp2(${ hex( scene.fog.color ) }, ${ n( scene.fog.density ) });   // colour, density` );
		else out( `scene.fog = new THREE.Fog(${ hex( scene.fog.color ) }, ${ n( scene.fog.near ) }, ${ n( scene.fog.far ) });   // colour, near, far` );

	}

	if ( lines.length > 0 ) out();

	const needsRoomEnv = editor.environmentType === 'Default' && scene.environment && ! scene.background;

	if ( MODEL_RE.test( scene.userData?.sourceFile || scene.name ) && scene.children.length > 0 ) emitModel( scene, 'scene' );
	else for ( const c of scene.children ) emitObject( c, 'scene' );

	const sceneLines = lines.splice( 0, lines.length );
	const shift = texLines.length > 0 ? texLines.length + 2 : 0;
	if ( texLines.length > 0 ) sceneLines.unshift( '// Textures (image files live in assets/)', ...texLines, '' );

	const tm = config.getKey( 'project/renderer/toneMapping' );
	const target = editor.controls ? editor.controls.center : { x: 0, y: 0, z: 0 };

	const head = [];
	head.push( '// Generated by the three.js editor fork ("three.js code" exporter). Edit freely: every line is plain three.js.' );
	head.push( `import * as THREE from 'three';` );
	head.push( `import { OrbitControls } from 'three/addons/controls/OrbitControls.js';` );
	for ( const i of imports ) head.push( `import { ${ i } } from 'three/addons/loaders/${ i }.js';` );
	if ( needsRoomEnv ) head.push( `import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';` );
	head.push( '' );
	head.push( '// @key Scene and camera | The scene holds what exists; the camera says where we look from.' );
	head.push( 'const scene = new THREE.Scene();' );
	head.push( `const camera = new THREE.PerspectiveCamera(${ n( camera.fov ) }, innerWidth / innerHeight, 0.1, 1000);` );
	head.push( `camera.position.set(${ vec( camera.position.x, camera.position.y, camera.position.z ) });` );
	head.push( '// @/key' );
	head.push( '' );
	head.push( '// @key Renderer | Draws the scene, seen through the camera, onto a canvas element.' );
	head.push( `const renderer = new THREE.WebGLRenderer({ antialias: ${ config.getKey( 'project/renderer/antialias' ) } });` );
	head.push( 'renderer.setSize(innerWidth, innerHeight);' );
	head.push( 'renderer.setPixelRatio(devicePixelRatio);' );
	if ( TONE[ tm ] ) head.push( `renderer.toneMapping = THREE.${ TONE[ tm ] };` );
	if ( config.getKey( 'project/renderer/shadows' ) ) head.push( 'renderer.shadowMap.enabled = true;' );
	head.push( 'document.body.append(renderer.domElement);   // domElement is the <canvas>' );
	head.push( '// @/key' );
	head.push( '' );
	head.push( 'const controls = new OrbitControls(camera, renderer.domElement);   // drag to orbit, wheel to zoom' );
	head.push( `controls.target.set(${ vec( target.x, target.y, target.z ) });` );
	head.push( 'controls.update();' );
	head.push( '' );
	if ( needsRoomEnv ) {

		head.push( `// Soft studio reflections for the materials (the editor's "Default" environment)` );
		head.push( 'const pmrem = new THREE.PMREMGenerator(renderer);' );
		head.push( 'scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;' );
		head.push( '' );

	}

	if ( imports.has( 'GLTFLoader' ) ) head.push( 'const gltfLoader = new GLTFLoader();' );
	if ( imports.has( 'OBJLoader' ) ) head.push( 'const objLoader = new OBJLoader();' );
	if ( usesTextures ) head.push( 'const textureLoader = new THREE.TextureLoader();' );
	if ( needsMixers ) head.push( 'const mixers = [];   // one AnimationMixer per animated model' );
	if ( imports.size > 0 || needsMixers || usesTextures ) head.push( '' );
	head.push( '// @key Scene contents | Objects, lights and their hierarchy (add() puts a child inside a parent).' );

	const tail = [];
	tail.push( '// @/key' );
	tail.push( '' );
	tail.push( `addEventListener('resize', () => {` );
	tail.push( '  camera.aspect = innerWidth / innerHeight;' );
	tail.push( '  camera.updateProjectionMatrix();' );
	tail.push( '  renderer.setSize(innerWidth, innerHeight);' );
	tail.push( '});' );
	tail.push( '' );
	tail.push( '// @key The loop | Called every frame with the time in milliseconds.' );
	tail.push( 'let last = performance.now();' );
	tail.push( 'renderer.setAnimationLoop((t) => {' );
	if ( needsMixers ) {

		tail.push( '  const dt = (t - last) / 1000;   // seconds since the previous frame' );
		tail.push( '  for (const m of mixers) m.update(dt);' );

	}

	tail.push( '  last = t;' );
	tail.push( '  controls.update();' );
	tail.push( '  renderer.render(scene, camera);' );
	tail.push( '});' );
	tail.push( '// @/key' );

	const offset = head.length + shift;
	for ( const k in ranges ) ranges[ k ] = [ ranges[ k ][ 0 ] + offset, ranges[ k ][ 1 ] + offset ];

	return { code: [ ...head, ...sceneLines, ...tail ].join( '\n' ) + '\n', assets, ranges };

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
		const canvas = document.createElement( 'canvas' );
		canvas.width = img.naturalWidth || img.width;
		canvas.height = img.naturalHeight || img.height;
		canvas.getContext( '2d' ).drawImage( img, 0, 0 );
		const jpeg = /\.jpe?g$/i.test( a.path );
		const blob = await new Promise( ( r ) => canvas.toBlob( r, jpeg ? 'image/jpeg' : /\.webp$/i.test( a.path ) ? 'image/webp' : 'image/png', 0.92 ) );
		map.set( a.path, blob );
		if ( a.texture.userData ) a.texture.userData.assetPath = a.path;

	}

	return map;

}

const THREE_MAP = { three: './lib/three.module.js', addons: './lib/addons/' };

// Self-contained archive: index.html, main.js, assets/, and a local copy of three + only the addons the code imports.
async function exportThreeArchive( code, blobs, title = 'three.js scene' ) {

	const { zipSync, strToU8 } = await import( 'three/addons/libs/fflate.module.js' );
	const buildBase = new URL( '../../build/', import.meta.url ).href;
	const addonBase = new URL( '../../examples/jsm/', import.meta.url ).href;
	const files = {};
	const getText = async ( url ) => ( await fetch( url ) ).text();

	files[ 'lib/three.module.js' ] = strToU8( await getText( buildBase + 'three.module.js' ) );
	files[ 'lib/three.core.js' ] = strToU8( await getText( buildBase + 'three.core.js' ) );

	const queue = [ ...code.matchAll( /from\s+'three\/addons\/([^']+)'/g ) ].map( ( m ) => m[ 1 ] );
	const seen = new Set();
	while ( queue.length ) {

		const p = queue.pop();
		if ( seen.has( p ) ) continue;
		seen.add( p );
		const text = await getText( addonBase + p );
		files[ 'lib/addons/' + p ] = strToU8( text );
		for ( const m of text.matchAll( /from\s+'(\.{1,2}\/[^']+)'/g ) ) {

			queue.push( new URL( m[ 1 ], 'http://x/' + p ).pathname.slice( 1 ) );

		}

	}

	for ( const [ path, blob ] of blobs ) files[ path ] = new Uint8Array( await blob.arrayBuffer() );

	files[ 'main.js' ] = strToU8( code );
	files[ 'index.html' ] = strToU8( `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ title }</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#111}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":${ q( THREE_MAP.three ) },"three/addons/":${ q( THREE_MAP.addons ) }}}</script>
</head><body>
<script type="module" src="./main.js"></script>
</body></html>
` );
	files[ 'README.txt' ] = strToU8( 'Standalone three.js scene.\n\nModules and file loading need http, so do not double-click index.html. In this folder run:\n\n  python3 -m http.server 8000\n\nand open http://localhost:8000\n\nmain.js is the scene (plain three.js). assets/ holds textures and models. lib/ holds the three.js build (MIT license, see https://threejs.org).\n' );

	return new Blob( [ zipSync( files ) ], { type: 'application/zip' } );

}

// Bundles the code with esbuild-wasm (local copy, runs in the browser) into ONE html file:
// three.js + addons + the scene are inlined, and every asset is embedded as a data: URI.
let esbuildReady;

async function exportSingleHtml( code, blobs, title = 'three.js scene' ) {

	const dir = new URL( './libs/esbuild-wasm/', import.meta.url ).href;
	const esbuild = await import( dir + 'browser.js' );
	esbuildReady = esbuildReady || esbuild.initialize( { wasmURL: dir + 'esbuild.wasm', worker: true } );
	await esbuildReady;

	const buildBase = new URL( '../../build/', import.meta.url ).href;
	const addonBase = new URL( '../../examples/jsm/', import.meta.url ).href;

	const result = await esbuild.build( {
		stdin: { contents: code, resolveDir: '/', sourcefile: 'main.js', loader: 'js' },
		bundle: true, minify: true, format: 'iife', write: false, legalComments: 'none',
		plugins: [ {
			name: 'three-http',
			setup( build ) {

				build.onResolve( { filter: /^three$/ }, () => ( { path: buildBase + 'three.module.js', namespace: 'http' } ) );
				build.onResolve( { filter: /^three\/addons\// }, ( a ) => ( { path: addonBase + a.path.slice( 'three/addons/'.length ), namespace: 'http' } ) );
				build.onResolve( { filter: /.*/, namespace: 'http' }, ( a ) => ( { path: new URL( a.path, a.importer ).href, namespace: 'http' } ) );
				build.onLoad( { filter: /.*/, namespace: 'http' }, async ( a ) => {

					const res = await fetch( a.path );
					if ( ! res.ok ) throw new Error( 'Could not load ' + a.path );
					return { contents: await res.text(), loader: 'js' };

				} );

			}
		} ]
	} );

	let js = result.outputFiles[ 0 ].text;

	const toDataUri = ( blob ) => new Promise( ( resolve, reject ) => {

		const r = new FileReader();
		r.onload = () => resolve( r.result );
		r.onerror = reject;
		r.readAsDataURL( blob );

	} );

	for ( const [ path, blob ] of blobs ) {

		const uri = await toDataUri( blob );
		const escaped = path.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
		js = js.replace( new RegExp( '([\'"`])(\\./)?' + escaped + '\\1', 'g' ), ( m, quote ) => quote + uri + quote );

	}

	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ title }</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#111}canvas{display:block}</style>
</head><body>
<script>${ js.replace( /<\/script/gi, '<\\/script' ) }</script>
</body></html>
`;
	return new Blob( [ html ], { type: 'text/html' } );

}

// Runs the "Scene contents" section of the code and returns a THREE.Scene, with loaders that resolve assets/ paths
// through `resolve(path) -> url` and tag models/textures with their source file so they re-export.
async function buildSceneFromCode( code, resolve, env = {} ) {

	const m = code.match( /\/\/ @key Scene contents[^\n]*\n([\s\S]*?)\n\/\/ @\/key/ );
	if ( ! m ) throw new Error( 'Could not find the "// @key Scene contents" ... "// @/key" section.' );

	const THREE = await import( 'three' );
	const { GLTFLoader } = await import( 'three/addons/loaders/GLTFLoader.js' );
	const { OBJLoader } = await import( 'three/addons/loaders/OBJLoader.js' );

	const manager = new THREE.LoadingManager();
	manager.setURLModifier( ( url ) => resolve( url ) || url );

	const pending = [];

	class TagTextureLoader extends THREE.TextureLoader {

		load( url, onLoad, onProgress, onError ) {

			const done = new Promise( ( resolve ) => {

				const t = super.load( url, ( tex ) => {

					resolve();
					if ( onLoad ) onLoad( tex );

				}, onProgress, ( e ) => {

					resolve();
					if ( onError ) onError( e );

				} );
				this.last = t;

			} );
			pending.push( done );
			const t = this.last;
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
			g.scene.animations = g.animations;
			return g;

		}

	}

	class TagOBJLoader extends OBJLoader {

		async loadAsync( url, onProgress ) {

			const o = await super.loadAsync( url, onProgress );
			o.name = base( url );
			o.userData.sourceFile = base( url );
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

	const run = new AsyncFunction( 'THREE', 'scene', 'gltfLoader', 'objLoader', 'textureLoader', 'mixers', 'camera', 'renderer', 'controls', 'pmrem', m[ 1 ] );
	await run( THREE, scene, new TagGLTFLoader( manager ), new TagOBJLoader( manager ), new TagTextureLoader( manager ), mixers, camera, renderer, controls, pmrem );
	if ( real ) pmrem.dispose();
	await Promise.all( pending ); // let textures finish loading so they don't pop in after the swap
	return scene;

}

// Standalone page that runs the generated code. 'local' = import map pointing at ../build and ../examples/jsm,
// so save the page in a folder that sits next to build/ (the test-models/ folder does).
function exportThreeHtml( code, importBase = 'cdn', title = 'three.js scene' ) {

	const maps = {
		cdn: { three: 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js', addons: 'https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/' },
		local: { three: '../build/three.module.js', addons: '../examples/jsm/' }
	};
	const m = maps[ importBase ];
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ title }</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#111}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":${ q( m.three ) },"three/addons/":${ q( m.addons ) }}}</script>
</head><body>
<!-- Serve over http (e.g. python3 -m http.server); imported models must sit next to this file. -->
<script type="module">
${ code }</script>
</body></html>
`;

}

export { exportThreeCode, generateThreeCode, assetsToBlobs, exportThreeArchive, exportSingleHtml, buildSceneFromCode, exportThreeHtml };
