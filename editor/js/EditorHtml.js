import { collectPlayableProject, inlineScriptDependencies } from './Publish.js';
import { embedResources, loadEsbuild } from './SingleHtml.js';
import { stateId, serializeState, snapshotEditor } from './PortableSession.js';
import buildThreeDefs from './libs/tern-threejs/build-defs.js';

const base = new URL( '../', import.meta.url );
const decoderFiles = [
	'draco/draco_decoder.js', 'draco/draco_decoder.wasm', 'draco/draco_wasm_wrapper.js',
	'draco/gltf/draco_decoder.js', 'draco/gltf/draco_decoder.wasm', 'draco/gltf/draco_wasm_wrapper.js',
	'basis/basis_transcoder.js', 'basis/basis_transcoder.wasm'
];

async function read( url ) {

	const response = await fetch( url );
	if ( ! response.ok ) throw new Error( 'Could not package ' + url + ' (HTTP ' + response.status + ')' );
	return response;

}

function escapeScript( text ) {

	return text.replace( /<\/script/gi, '<\\/script' );

}

async function exportEditorHtml( editor ) {

	const [ state, { project, scripts, title }, source, esbuild ] = await Promise.all( [
		snapshotEditor( editor ),
		collectPlayableProject( editor ),
		read( new URL( 'index.html', base ) ).then( response => response.text() ),
		loadEsbuild()
	] );

	const page = new DOMParser().parseFromString( source, 'text/html' );
	const importMap = JSON.parse( page.querySelector( 'script[type="importmap"]' ).textContent ).imports;
	importMap[ 'three/tsl' ] = '../build/three.tsl.js';
	const prefixes = Object.keys( importMap ).filter( key => key.endsWith( '/' ) );

	const css = await Promise.all( [ ...page.querySelectorAll( 'link[rel="stylesheet"]' ) ].map( async ( link ) => {

		const href = new URL( link.getAttribute( 'href' ), base );
		return ( await read( href ) ).text();

	} ) );
	const scriptsInOrder = await Promise.all( [ ...page.querySelectorAll( 'script[src]' ) ].map( async ( script ) => {

		const url = new URL( script.getAttribute( 'src' ), base );
		return ( await read( url ) ).text();

	} ) );

	const core = await ( await read( new URL( '../build/three.core.js', base ) ) ).text();
	state.threeDefs = buildThreeDefs( core );
	const resourcePaths = [
		'js/libs/language-worker.js', 'js/libs/language-types.json',
		...decoderFiles.map( file => '../examples/jsm/libs/' + file ),
		...Array.from( [ 'arkanoid', 'camera', 'particles', 'pong', 'shaders' ], name => 'examples/' + name + '.app.json' ),
		...Array.from( [ 'translate', 'rotate', 'scale' ], name => 'images/' + name + '.svg' )
	];
	const builtIn = new Map( await Promise.all( resourcePaths.map( async ( path ) => {

		const url = new URL( path, base );
		const archivePath = new URL( path, 'https://threeditor.invalid/editor/' ).pathname.slice( 1 );
		return [ archivePath, await ( await read( url ) ).blob() ];

	} ) ) );
	const embedded = await embedResources( project );
	state.assets = {
		...Object.fromEntries( Object.entries( embedded ).map( ( [ path, value ] ) => [ 'editor/' + path, value ] ) ),
		...await embedResources( { resources: builtIn } ),
		...state.assets
	};

	const originals = scripts.map( ( { script } ) => script.source );
	const modulePaths = inlineScriptDependencies( scripts, embedded );
	state.compiled = scripts.map( ( { script }, i ) => [ originals[ i ], script.source ] )
		.filter( ( [ original, compiled ] ) => original !== compiled );

	function editorSpecifier( path ) {

		if ( path.startsWith( 'lib/addons/' ) ) return 'three/addons/' + path.slice( 'lib/addons/'.length );
		if ( path === 'lib/three.module.js' ) return 'three';
		if ( path === 'lib/three.webgpu.js' ) return 'three/webgpu';
		if ( path === 'lib/three.tsl.js' ) return 'three/tsl';
		return 'scene-module:' + path;

	}

	const loaders = [ ...modulePaths ].map( path => `[${ JSON.stringify( path ) }, () => import(${ JSON.stringify( editorSpecifier( path ) ) })]` );
	const entry = `
import { startEditor } from './js/EditorApp.js';
import { openPortableSession } from './js/PortableSession.js';
await startEditor(await openPortableSession(new Map([${ loaders.join( ', ' ) }])));
`;
	const result = await esbuild.build( {
		stdin: { contents: entry, sourcefile: 'editor.html', loader: 'js', resolveDir: '/' },
		bundle: true, minify: true, format: 'esm', write: false, legalComments: 'inline',
		plugins: [ {
			name: 'editor-package',
			setup( build ) {

				build.onResolve( { filter: /.*/ }, ( args ) => {

					const path = args.path;
					const prefix = prefixes.find( key => path.startsWith( key ) );
					const mapped = importMap[ path ] || ( prefix ? importMap[ prefix ] + path.slice( prefix.length ) : null );
					if ( mapped ) return { path: new URL( mapped, base ).href, namespace: 'editor' };
					if ( path.startsWith( 'scene-module:' ) ) return { path: path.slice( 'scene-module:'.length ), namespace: 'scene' };
					if ( args.namespace === 'scene' ) {

						const archivePath = new URL( path, 'https://threeditor.invalid/' + args.importer ).pathname.slice( 1 );
						if ( archivePath.startsWith( 'lib/' ) ) {

							const specifier = editorSpecifier( archivePath );
							if ( specifier !== 'scene-module:' + archivePath ) {

								const url = specifier.startsWith( 'three/addons/' ) ?
									importMap[ 'three/addons/' ] + specifier.slice( 'three/addons/'.length ) : importMap[ specifier ];
								return { path: new URL( url, base ).href, namespace: 'editor' };

							}

						}
						return { path: archivePath, namespace: 'scene' };

					}
					return { path: new URL( path, args.namespace === 'editor' ? args.importer : base ).href, namespace: 'editor' };

				} );
				build.onLoad( { filter: /.*/, namespace: 'editor' }, async ( { path } ) => {

					return { contents: await ( await read( path ) ).text(), loader: 'js' };

				} );
				build.onLoad( { filter: /.*/, namespace: 'scene' }, ( { path } ) => {

					const bytes = project.files.get( path );
					if ( ! bytes ) throw new Error( 'Missing packaged module ' + path );
					let contents = new TextDecoder().decode( bytes );
					for ( const { start, end, path: asset } of project.directReferences.get( path ) || [] ) {

						contents = contents.slice( 0, start ) + JSON.stringify( embedded[ asset ] ) + contents.slice( end );

					}
					return { contents, loader: 'js' };

				} );

			}
		} ]
	} );

	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ title.replaceAll( '&', '&amp;' ).replaceAll( '<', '&lt;' ) }</title>
<style>${ css.join( '\n' ) }</style>
</head><body>
<script type="application/json" id="${ stateId }">${ serializeState( state ) }</script>
${ scriptsInOrder.map( text => '<script>' + escapeScript( text ) + '</script>' ).join( '\n' ) }
<script type="module">${ escapeScript( result.outputFiles[ 0 ].text ) }</script>
</body></html>
`;
	return new Blob( [ html ], { type: 'text/html' } );

}

export { exportEditorHtml };
