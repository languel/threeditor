import { parse } from './libs/acorn/acorn.mjs';
import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';

const root = new URL( '../../', import.meta.url );
const archive = new URL( 'https://publish.invalid/project/' );
const addons = 'lib/addons/';
const modules = {
	three: 'lib/three.module.js',
	'three/webgpu': 'lib/three.webgpu.js',
	'three/tsl': 'lib/three.tsl.js'
};
const instructions = 'Extract this archive and serve the folder over HTTP.\n\nRun python3 -m http.server 8000 here and open http://localhost:8000.\n';
const escapeHTML = ( text ) => text.replaceAll( '&', '&amp;' ).replaceAll( '<', '&lt;' ).replaceAll( '>', '&gt;' );
const property = ( node ) => node?.type === 'MemberExpression' ? ( node.computed ? node.property.value : node.property.name ) : node?.name;

async function read( url ) {

	const response = await fetch( url );
	if ( ! response.ok ) throw new Error( 'Could not read ' + url.pathname + ' (HTTP ' + response.status + ').' );
	return response.blob();

}

function archivePath( path, from ) {

	const url = new URL( path, new URL( from, archive ) );
	if ( /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test( path ) || ! url.href.startsWith( archive.href ) || url.pathname.endsWith( '/' ) ) {

		throw new Error( `Dependency "${ path }" in ${ from } needs a file inside the published folder.` );

	}

	const entry = decodeURIComponent( url.pathname.slice( archive.pathname.length ) );
	if ( entry.includes( '\\' ) || entry.split( '/' ).some( ( segment ) => ! segment || segment === '.' || segment === '..' ) ) {

		throw new Error( 'Invalid dependency path: ' + path );

	}

	return entry;

}

function packageFiles( assets, webgpu = false ) {

	const files = new Map();
	const resources = new Map();
	const directReferences = new Map();
	const checked = new Set();
	const imports = { 'three/addons/': './' + addons };

	async function put( path, blob ) {

		files.set( path, new Uint8Array( await blob.arrayBuffer() ) );

	}

	async function copy( path, repoPath, resource = false ) {

		const blob = await read( new URL( repoPath, root ) );
		await put( path, blob );
		if ( resource ) resources.set( path, blob );
		return blob;

	}

	async function asset( path, from, usedBy = from ) {

		if ( path === '' || /^data:/i.test( path ) ) return;
		const entry = archivePath( path, from );
		const blob = assets.get( entry );
		if ( files.has( entry ) ) {

			if ( blob && ! resources.has( entry ) ) resources.set( entry, blob );
			return entry;

		}
		if ( ! blob ) {

			throw new Error( `Missing "${ entry }" (used by ${ usedBy }). Import the file and its companion files, then publish again.` );

		}

		await put( entry, blob );
		resources.set( entry, blob );

		if ( /\.(gltf|glb)$/i.test( entry ) ) {

			let json;
			if ( /\.glb$/i.test( entry ) ) {

				const bytes = files.get( entry );
				const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );
				if ( bytes.length < 20 || view.getUint32( 0, true ) !== 0x46546c67 ||
					view.getUint32( 4, true ) !== 2 || view.getUint32( 16, true ) !== 0x4e4f534a ||
					view.getUint32( 12, true ) > bytes.length - 20 ) throw new Error( 'Invalid GLB: ' + entry );
				json = JSON.parse( new TextDecoder().decode( bytes.subarray( 20, 20 + view.getUint32( 12, true ) ) ) );

			} else {

				json = JSON.parse( await blob.text() );

			}

			for ( const item of [ ...( json.buffers || [] ), ...( json.images || [] ) ] ) {

				if ( item.uri ) await asset( item.uri, entry );

			}

		}

		return entry;

	}

	async function moduleFile( specifier, from ) {

		let path;
		if ( Object.hasOwn( modules, specifier ) ) {

			path = specifier === 'three' && webgpu ? modules[ 'three/webgpu' ] : modules[ specifier ];
			imports[ specifier ] = './' + path;

		} else if ( specifier.startsWith( 'three/addons/' ) ) {

			path = archivePath( './' + specifier.slice( 'three/addons/'.length ), addons + 'index.js' );
			if ( ! path.startsWith( addons ) ) throw new Error( 'Invalid three.js addon path: ' + specifier );

		} else if ( /^\.{1,2}\//.test( specifier ) ) {

			path = archivePath( specifier, from );

		} else {

			throw new Error( `Cannot package import "${ specifier }" in ${ from }. Use a local module or a vendored three.js addon.` );

		}

		if ( checked.has( path ) ) return path;
		checked.add( path );
		const repoPath = path.startsWith( addons ) ? 'examples/jsm/' + path.slice( addons.length ) :
			Object.values( modules ).includes( path ) || path === 'lib/three.core.js' ? 'build/' + path.slice( 4 ) : null;
		const blob = repoPath ? await copy( path, repoPath ) : assets.get( path );
		if ( ! blob ) throw new Error( `Missing module "${ path }" (imported by ${ from }). Import it with your project files.` );
		if ( ! repoPath ) await put( path, blob );

		await inspect( await blob.text(), path, { runtime: ! repoPath } );
		return path;

	}

	async function inspect( code, from, { runtime = true, script = false } = {} ) {

		let tree;
		try {

			tree = parse( code, { ecmaVersion: 'latest', sourceType: script ? 'script' : 'module', allowReturnOutsideFunction: script, locations: runtime } );

		} catch ( error ) {

			throw new Error( `${ from }: ${ error.message }` );

		}

		const dependencies = [];
		const references = [];
		const moduleReferences = [];
		const staticPath = ( node ) => node?.type === 'Literal' && typeof node.value === 'string' ? node.value :
			node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[ 0 ].value.cooked : undefined;
		const scriptModule = script ? 'js/app.js' : from;
		const isModuleURL = ( node ) => node?.type === 'MemberExpression' &&
			node.object.type === 'MetaProperty' && node.object.meta.name === 'import' && property( node ) === 'url';

		function literal( node, use ) {

			const value = staticPath( node );
			if ( value === undefined ) throw new Error( `${ from }:${ node?.loc?.start.line || 1 }: use a literal path for ${ use } when publishing.` );
			return value;

		}

		function visit( node ) {

			if ( node.source && ( node.type === 'ImportDeclaration' || node.type.startsWith( 'Export' ) ) ) {

				dependencies.push( () => moduleFile( node.source.value, scriptModule ) );

			} else if ( node.type === 'ImportExpression' && ( runtime || staticPath( node.source ) !== undefined ) ) {

				dependencies.push( async () => {

					const path = await moduleFile( literal( node.source, 'import()' ), scriptModule );
					if ( script ) moduleReferences.push( { start: node.start, end: node.end, path } );

				} );

			}

			if ( runtime ) {

				const name = property( node.callee );
				let input;
				let base = 'index.html';

				if ( node.type === 'CallExpression' && [ 'fetch', 'load', 'loadAsync', 'importScripts' ].includes( name ) ) {

					input = node.arguments[ 0 ];

				} else if ( node.type === 'CallExpression' && name === 'open' && /^(?:GET|POST|PUT|PATCH|HEAD|DELETE)$/i.test( staticPath( node.arguments[ 0 ] ) || '' ) ) {

					input = node.arguments[ 1 ];

				} else if ( node.type === 'NewExpression' && [ 'Worker', 'SharedWorker', 'Audio' ].includes( name ) ) {

					input = node.arguments[ 0 ];

				} else if ( node.type === 'NewExpression' && name === 'URL' && isModuleURL( node.arguments[ 1 ] ) ) {

					input = node.arguments[ 0 ];
					base = scriptModule;

				} else if ( node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && property( node.left ) === 'src' ) {

					input = node.right;

				}

				if ( input && ! ( input.type === 'NewExpression' && property( input.callee ) === 'URL' ) ) {

					for ( const item of input.type === 'ArrayExpression' ? input.elements : [ input ] ) {

						dependencies.push( async () => {

							const path = await asset( literal( item, name || '.src' ), base, from );
							if ( path && name !== 'load' && name !== 'loadAsync' ) references.push( { start: item.start, end: item.end, path } );

						} );

					}

				}

			}

			for ( const child of Object.values( node ) ) {

				if ( Array.isArray( child ) ) {

					for ( const item of child ) if ( item?.type ) visit( item );

				} else if ( child?.type ) {

					visit( child );

				}

			}

		}

		visit( tree );
		for ( const load of dependencies ) await load();
		if ( ! script && references.length ) directReferences.set( from, references.sort( ( a, b ) => b.start - a.start ) );
		return { references, moduleReferences };

	}

	async function finish() {

		await copy( 'LICENSE-three.txt', 'LICENSE' );
		return new Blob( [ zipSync( Object.fromEntries( files ) ) ], { type: 'application/zip' } );

	}

	return { files, resources, directReferences, asset, copy, moduleFile, inspect, imports, finish };

}

async function collectSourceProject( code, assets ) {

	const project = packageFiles( assets );
	await project.inspect( code, 'main.js' );

	const codecFiles = {
		DRACOLoader: [ 'draco/gltf/draco_decoder.js', 'draco/gltf/draco_decoder.wasm', 'draco/gltf/draco_wasm_wrapper.js' ],
		KTX2Loader: [ 'basis/basis_transcoder.js', 'basis/basis_transcoder.wasm' ]
	};
	for ( const [ loader, paths ] of Object.entries( codecFiles ) ) {

		if ( ! project.files.has( addons + 'loaders/' + loader + '.js' ) ) continue;
		for ( const path of paths ) await project.copy( 'lib/codecs/' + path, 'examples/jsm/libs/' + path, true );

	}

	return project;

}

async function exportThreeArchive( code, assets ) {

	const project = await collectSourceProject( code, assets );
	project.files.set( 'main.js', strToU8( code ) );
	project.files.set( 'index.html', strToU8( `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>three.js scene</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#111}canvas{display:block}</style>
<script type="importmap">${ JSON.stringify( { imports: project.imports } ) }</script>
</head><body>
<script type="module" src="./main.js"></script>
</body></html>
` ) );
	project.files.set( 'README.txt', strToU8( instructions + '\nEdit main.js to change the scene.\n' ) );
	return project.finish();

}

async function collectPlayableProject( editor ) {

	const output = editor.toJSON();
	delete output.history;
	output.metadata.type = 'App';
	const app = JSON.parse( JSON.stringify( output ) );
	const scripts = [];

	const assets = new Map();
	for ( const [ path, { file } ] of editor.sourceFiles || [] ) assets.set( 'assets/' + path, file );
	const project = packageFiles( assets, app.project.renderer === 'WebGPURenderer' );

	for ( const object of [ app.scene, app.camera ] ) {

		for ( const image of object.images || [] ) {

			for ( const url of Array.isArray( image.url ) ? image.url : [ image.url ] ) {

				if ( typeof url === 'string' && url !== '' ) await project.asset( url, 'app.json' );
				else if ( ! url?.data ) throw new Error( `Image ${ image.uuid } could not be serialized. Replace it with an imported image.` );

			}

		}

	}

	for ( const objectScripts of Object.values( app.scripts ) ) {

		for ( const script of objectScripts ) {

			if ( script.generated || script.enabled === false ) continue;
			const dependencies = await project.inspect( script.source, script.name || 'Object script', { script: true } );
			scripts.push( { script, ...dependencies } );

		}

	}

	await project.moduleFile( 'three', 'index.html' );
	if ( app.project.renderer === 'WebGPURenderer' ) await project.moduleFile( 'three/webgpu', 'js/app.js' );
	await project.moduleFile( 'three/addons/environments/ColorEnvironment.js', 'index.html' );
	await project.moduleFile( 'three/addons/environments/RoomEnvironment.js', 'index.html' );
	await project.moduleFile( 'three/addons/geometries/TextGeometry.js', 'index.html' );
	await project.moduleFile( 'three/addons/controls/CameraController.js', 'js/app.js' );
	await project.copy( 'js/app.js', 'editor/js/libs/app.js' );
	await project.copy( 'ScriptParams.js', 'editor/js/ScriptParams.js' );
	await project.copy( 'libs/acorn/acorn.mjs', 'editor/js/libs/acorn/acorn.mjs' );
	await project.copy( 'js/app-bootstrap.js', 'editor/js/libs/app-bootstrap.js' );

	const title = editor.config.getKey( 'project/title' ) || 'untitled';
	return { project, app, scripts, title };

}

async function exportPlayableScene( editor ) {

	const { project, app, title } = await collectPlayableProject( editor );
	const template = await ( await read( new URL( 'editor/js/libs/app/index.html', root ) ) ).text();
	const editButton = editor.config.getKey( 'project/editable' ) ? `
			const edit = document.createElement( 'a' );
			edit.href = 'https://threejs.org/editor/#file=' + new URL( 'app.json', location.href ).href;
			edit.style.cssText = 'position:absolute;bottom:20px;right:20px;padding:10px 16px;color:#fff;border:1px solid #fff;border-radius:20px;text-decoration:none';
			edit.target = '_blank';
			edit.textContent = 'EDIT';
			document.body.appendChild( edit );` : '';
	const html = template
		.replace( '<!-- title -->', () => escapeHTML( title ) )
		.replace( '<!-- importmap -->', () => JSON.stringify( { imports: project.imports } ) )
		.replace( '/* edit button */', () => editButton );
	project.files.set( 'index.html', strToU8( html ) );
	project.files.set( 'app.json', strToU8( JSON.stringify( app ) ) );
	project.files.set( 'README.txt', strToU8( instructions ) );
	return { zip: await project.finish(), filename: title + '.zip' };

}

async function exportPlayableHtml( editor ) {

	const { embedResources, bundleSingleHtml } = await import( './SingleHtml.js' );
	const { project, app, scripts, title } = await collectPlayableProject( editor );
	const embedded = await embedResources( project );
	const imports = inlineScriptDependencies( scripts, embedded );

	const modules = [ ...imports ].map( ( path ) => `[${ JSON.stringify( path ) }, () => import(${ JSON.stringify( './' + path ) })]` );
	const code = `
import { playApp } from './js/app-bootstrap.js';
const app = JSON.parse(document.getElementById('publish-app').textContent);
${ modules.length ? `const imports = new Map([${ modules.join( ', ' ) }]);` : '' }
await playApp(app${ modules.length ? ', (path) => imports.get(path)()' : '' });
`;
	return bundleSingleHtml( code, project, embedded, { title, app } );

}

function inlineScriptDependencies( scripts, embedded ) {

	const imports = new Set();

	for ( const { script, references, moduleReferences } of scripts ) {

		const edits = references.map( ( { start, end, path } ) => ( { start, end, text: JSON.stringify( embedded[ path ] ) } ) );
		for ( const { start, end, path } of moduleReferences ) {

			imports.add( path );
			edits.push( { start, end, text: `__publishImport(${ JSON.stringify( path ) })` } );

		}

		for ( const { start, end, text } of edits.sort( ( a, b ) => b.start - a.start ) ) {

			script.source = script.source.slice( 0, start ) + text + script.source.slice( end );

		}

	}

	return imports;

}

export { exportThreeArchive, exportPlayableScene, exportPlayableHtml, collectPlayableProject, inlineScriptDependencies };
