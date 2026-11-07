// Use the editor's local esbuild runtime to package scripts and assets into one page.
let esbuildReady;

async function embedResources( project ) {

	const toDataUri = ( blob ) => new Promise( ( resolve, reject ) => {

		const reader = new FileReader();
		reader.onload = () => resolve( reader.result );
		reader.onerror = reject;
		reader.readAsDataURL( blob );

	} );
	return Object.fromEntries( await Promise.all( [ ...project.resources ].map( async ( [ path, blob ] ) => [ path, await toDataUri( blob ) ] ) ) );

}

const jsonForHtml = ( data ) => JSON.stringify( data ).replace( /</g, '\\u003c' );

async function loadEsbuild() {

	const dir = new URL( './libs/esbuild-wasm/', import.meta.url ).href;
	const esbuild = await import( dir + 'browser.js' );
	esbuildReady = esbuildReady || esbuild.initialize( { wasmURL: dir + 'esbuild.wasm', worker: true } );
	await esbuildReady;
	return esbuild;

}

async function bundleSingleHtml( code, project, embedded, { title, app } ) {

	const esbuild = await loadEsbuild();
	const inlineAssets = ( text, modulePath ) => {

		for ( const { start, end, path } of project.directReferences.get( modulePath ) || [] ) {

			text = text.slice( 0, start ) + JSON.stringify( embedded[ path ] ) + text.slice( end );

		}

		return text;

	};
	const assetSetup = `
import { DefaultLoadingManager as __publishManager } from 'three';
const __publishAssets = JSON.parse(document.getElementById('publish-assets').textContent);
__publishManager.setURLModifier((url) => {
	const base = new URL('./', document.baseURI);
	const resolved = new URL(url, base);
	if (!resolved.href.startsWith(base.href)) return url;
	return __publishAssets[decodeURIComponent(resolved.pathname.slice(base.pathname.length))] || url;
});
`;

	const result = await esbuild.build( {
		stdin: { contents: assetSetup + inlineAssets( code, 'main.js' ), resolveDir: '/', sourcefile: 'main.js', loader: 'js' },
		bundle: true, minify: true, format: 'esm', write: false, legalComments: 'inline',
		define: app ? { __THREEEDITOR_RENDERER__: JSON.stringify( app.project.renderer ) } : {},
		plugins: [ {
			name: 'published-files',
			setup( build ) {

				build.onResolve( { filter: /.*/ }, ( a ) => {

					const addonBase = project.imports[ 'three/addons/' ];
					const specifier = project.imports[ a.path ] || ( a.path.startsWith( 'three/addons/' ) ?
						addonBase + a.path.slice( 'three/addons/'.length ) : a.path );
					const parent = specifier === a.path ? a.importer.replace( /^\/+/, '' ) || 'main.js' : 'main.js';
					const url = new URL( specifier, 'https://publish.invalid/' + parent );
					return { path: decodeURIComponent( url.pathname.slice( 1 ) ), namespace: 'published' };

				} );
				build.onLoad( { filter: /.*/, namespace: 'published' }, ( a ) => {

					const bytes = project.files.get( a.path );
					if ( ! bytes ) throw new Error( 'Missing module ' + a.path );
					const text = new TextDecoder().decode( bytes );
					return { contents: inlineAssets( text, a.path ), loader: 'js' };

				} );

			}
		} ]
	} );

	const js = result.outputFiles[ 0 ].text;

	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ title.replaceAll( '&', '&amp;' ).replaceAll( '<', '&lt;' ) }</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#111}canvas{display:block}</style>
</head><body>
<script type="application/json" id="publish-assets">${ jsonForHtml( embedded ) }</script>
${ app ? '<script type="application/json" id="publish-app">' + jsonForHtml( app ) + '</script>\n' : '' }<script type="module">${ js.replace( /<\/script/gi, '<\\/script' ) }</script>
</body></html>
`;
	return new Blob( [ html ], { type: 'text/html' } );

}

export { loadEsbuild, embedResources, bundleSingleHtml };
