import { embedResources } from './SingleHtml.js';

const stateId = 'threeditor-state';
const base = new URL( 'https://threeditor.invalid/editor/' );

function serializeState( state ) {

	return JSON.stringify( state ).replace( /</g, '\\u003c' );

}

async function snapshotEditor( editor ) {

	const scene = JSON.parse( JSON.stringify( editor.toJSON() ) );
	const resources = new Map();
	const files = [];
	for ( const [ path, { file, batch } ] of editor.sourceFiles || [] ) {

		resources.set( 'editor/assets/' + path, file );
		files.push( { path, name: file.name, type: file.type, lastModified: file.lastModified, batch } );

	}

	const keys = [ 'project/title', 'project/renderer/antialias', 'project/presentationEditVisible', 'settings/theme', 'settings/userThemes', 'settings/history', 'settings/autoHideMenubar', 'settings/keymapPreset', 'settings/keymapOverrides', 'settings/keymapMigrated', 'settings/emulateThreeButtonMouse', 'settings/codeEditor', 'language' ];
	const config = Object.fromEntries( keys.map( ( key ) => [ key, editor.config.getKey( key ) ] ) );
	return { scene, files, assets: await embedResources( { resources } ), config };

}

async function openPortableSession( modules ) {

	const template = document.documentElement.outerHTML;
	const state = JSON.parse( document.getElementById( stateId ).textContent );
	const { scene, config, files, assets, compiled, threeDefs } = state;
	const sourceFiles = new Map( await Promise.all( files.map( async ( { path, name, type, lastModified, batch } ) => {

		const blob = await ( await fetch( assets[ 'editor/assets/' + path ] ) ).blob();
		return [ path, { file: new File( [ blob ], name, { type, lastModified } ), batch } ];

	} ) ) );
	const compiledScripts = new Map( compiled );

	function url( value ) {

		const resolved = new URL( value, base );
		if ( resolved.origin !== base.origin ) return value;
		return assets[ decodeURIComponent( resolved.pathname.slice( 1 ) ) ] || value;

	}

	return {
		scene, config, sourceFiles, url, threeDefs,
		install( THREE ) {

			THREE.DefaultLoadingManager.setURLModifier( url );
			const request = window.fetch.bind( window );
			window.fetch = ( input, options ) => request( typeof input === 'string' ? url( input ) : input, options );

		},
		importModule( path ) {

			const load = modules.get( path );
			if ( ! load ) return Promise.reject( new Error( 'Module was not packaged in this HTML: ' + path ) );
			return load();

		},
		prepareScript: ( source ) => compiledScripts.get( source ) || source,
		async save( editor ) {

			const next = await snapshotEditor( editor );
			// Retain built-in resources and assets used by the original script bundle.
			next.assets = { ...assets, ...next.assets };
			next.compiled = compiled;
			next.threeDefs = threeDefs;
			const page = new DOMParser().parseFromString( template, 'text/html' );
			page.getElementById( stateId ).textContent = serializeState( next );
			return new Blob( [ '<!DOCTYPE html>\n', page.documentElement.outerHTML ], { type: 'text/html' } );

		}
	};

}

export { stateId, serializeState, snapshotEditor, openPortableSession };
