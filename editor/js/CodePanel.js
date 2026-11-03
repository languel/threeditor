// Docked, live "three.js code" panel (experiment addition).
// Scene -> code: regenerated whenever the scene changes (unless you have unapplied edits).
// Code -> scene: Apply (or Auto-apply) re-runs the "Scene contents" section and swaps the editor scene.

import { generateThreeCode, assetsToBlobs, exportThreeArchive, exportThreeHtml, buildSceneFromCode } from './ThreeCodeExporter.js';

function CodePanel( editor ) {

	const signals = editor.signals;

	const dom = document.createElement( 'div' );
	dom.id = 'code-panel';
	dom.style.display = 'none';

	const bar = document.createElement( 'div' );
	bar.className = 'code-bar';
	const status = document.createElement( 'div' );
	status.className = 'code-status';
	const host = document.createElement( 'div' );
	host.className = 'code-host';
	dom.append( bar, status, host );

	const button = ( label, id, title, fn ) => {

		const b = document.createElement( 'button' );
		b.textContent = label;
		b.id = id;
		b.className = 'Button';
		b.title = title;
		b.onclick = fn;
		bar.appendChild( b );
		return b;

	};

	let viewportRenderer = null;
	signals.rendererCreated.add( ( r ) => { viewportRenderer = r; } );

	// Clicking outside the panel (e.g. in the viewport) hands the keyboard back to the editor shortcuts
	document.addEventListener( 'pointerdown', ( e ) => {

		if ( ! dom.contains( e.target ) && dom.contains( document.activeElement ) ) document.activeElement.blur();

	}, true );

	signals.windowResize.add( () => { if ( cm ) cm.refresh(); } );

	let cm = null;
	let dirty = false; // code edited but not applied yet
	let applying = false;
	let setting = false;
	let assets = [];
	let assetsReady = Promise.resolve( new Map() );
	let urls = new Map();
	const store = new Map(); // path -> Blob, survives regeneration so reloaded textures keep their bytes
	let timer = 0;
	let applyTimer = 0;

	const textarea = document.createElement( 'textarea' );
	textarea.id = 'code-text';
	textarea.spellcheck = false;

	if ( window.CodeMirror ) {

		cm = window.CodeMirror( host, { value: '', mode: 'javascript', lineNumbers: true, matchBrackets: true, indentWithTabs: false, tabSize: 2, indentUnit: 2, theme: 'editor' } );
		cm.on( 'change', onEdit );

	} else {

		host.appendChild( textarea );
		textarea.addEventListener( 'input', onEdit );

	}

	const getCode = () => cm ? cm.getValue() : textarea.value;

	function setCode( value ) {

		setting = true;
		if ( cm ) cm.setValue( value ); else textarea.value = value;
		setting = false;

	}

	function setStatus( text, error = false ) {

		status.textContent = text;
		status.classList.toggle( 'error', error );

	}

	const applyBtn = button( 'Apply ▶', 'code-apply', 'Run the code and replace the scene (Ctrl/Cmd+Enter)', () => apply() );
	const autoLabel = document.createElement( 'label' );
	const auto = document.createElement( 'input' );
	auto.type = 'checkbox';
	auto.id = 'code-auto';
	auto.checked = true;
	autoLabel.append( auto, ' auto' );
	autoLabel.title = 'Apply automatically while typing';
	bar.appendChild( autoLabel );
	button( 'Regenerate', 'code-regen', 'Throw away edits and rebuild the code from the scene', () => regenerate( true ) );
	button( 'Copy', 'code-copy', 'Copy to clipboard', async () => {

		try {

			await navigator.clipboard.writeText( getCode() );

		} catch ( e ) {

			textarea.value = getCode();
			textarea.select();
			document.execCommand( 'copy' );

		}

	} );
	button( '.js', 'code-dl-js', 'Download main.js', () => editor.utils.save( new Blob( [ getCode() ], { type: 'text/javascript' } ), 'scene.js' ) );
	button( '.html', 'code-dl-html', 'Single HTML page that loads three from a CDN (no textures/models)', () => editor.utils.save( new Blob( [ exportThreeHtml( getCode(), 'cdn' ) ], { type: 'text/html' } ), 'scene.html' ) );
	button( '.zip', 'code-dl-zip', 'Standalone archive: page, code, textures, models and a local copy of three.js', async () => {

		try {

			setStatus( 'Building archive…' );
			const blobs = await assetsReady;
			const zip = await exportThreeArchive( getCode(), blobs );
			editor.utils.save( zip, 'three-scene.zip' );
			setStatus( 'Archive saved (' + Math.round( zip.size / 1024 ) + ' KB, ' + blobs.size + ' asset files).' );

		} catch ( e ) {

			setStatus( 'Archive failed: ' + e.message, true );

		}

	} );

	dom.addEventListener( 'keydown', ( e ) => {

		if ( ( e.metaKey || e.ctrlKey ) && e.key === 'Enter' ) {

			e.preventDefault();
			apply();

		}

		e.stopPropagation(); // keep editor shortcuts (delete, w/e/r) out of the code box

	} );

	function onEdit() {

		if ( setting || applying ) return;
		dirty = true;
		setStatus( 'Edited. ' + ( auto.checked ? 'Applying…' : 'Press Apply (Ctrl/Cmd+Enter) to update the scene.' ) );
		clearTimeout( applyTimer );
		if ( auto.checked ) applyTimer = setTimeout( apply, 700 );

	}

	function resolve( url ) {

		const key = String( url ).replace( /^\.?\//, '' );
		return urls.get( key );

	}

	function regenerate( force ) {

		if ( dirty && ! force ) {

			setStatus( 'Scene changed, but the code has unapplied edits. Regenerate to overwrite them.' );
			return;

		}

		const result = generateThreeCode( editor );
		assets = result.assets;
		assetsReady = assetsToBlobs( assets, store ).then( ( map ) => {

			for ( const [ p, b ] of map ) {

				if ( store.get( p ) !== b ) {

					store.set( p, b );
					urls.set( p, URL.createObjectURL( b ) );

				}

			}

			return new Map( [ ...map ].filter( ( [ p ] ) => assets.some( ( a ) => a.path === p ) ) );

		} ).catch( ( e ) => {

			setStatus( 'Asset export failed: ' + e.message, true );
			return new Map();

		} );
		setCode( result.code );
		dirty = false;
		clearTimeout( applyTimer );
		setStatus( 'In sync with the scene.' );

	}

	async function apply() {

		clearTimeout( applyTimer );
		applying = true;
		try {

			await assetsReady;
			const next = await buildSceneFromCode( getCode(), resolve, { camera: editor.camera, renderer: viewportRenderer } );
			const selectedName = editor.selected && editor.selected.name;

			signals.sceneGraphChanged.active = false;
			for ( const child of [ ...editor.scene.children ] ) editor.removeObject( child );
			editor.scene.background = next.background;
			editor.scene.fog = next.fog;
			editor.deselect();
			while ( next.children.length > 0 ) editor.addObject( next.children[ 0 ] );
			signals.sceneGraphChanged.active = true;
			signals.sceneGraphChanged.dispatch();

			if ( selectedName ) {

				const again = editor.scene.getObjectByName( selectedName );
				if ( again ) editor.select( again );

			}

			// Force the viewport and sidebar to pick up the new materials/textures without needing a click.
			editor.scene.traverse( ( o ) => {

				for ( const m of [ o.material ].flat() ) if ( m ) m.needsUpdate = true;

			} );
			signals.materialChanged.dispatch( editor.scene );
			requestAnimationFrame( () => {

				signals.materialChanged.dispatch( editor.scene );
				if ( editor.selected ) signals.objectSelected.dispatch( editor.selected );

			} );

			dirty = false;
			setStatus( 'Applied ✓ ' + new Date().toLocaleTimeString() );

		} catch ( e ) {

			signals.sceneGraphChanged.active = true;
			setStatus( 'Error: ' + e.message, true );
			console.warn( e );

		} finally {

			applying = false;

		}

	}

	function schedule() {

		if ( dom.style.display === 'none' || applying ) return;
		clearTimeout( timer );
		timer = setTimeout( () => regenerate( false ), 250 );

	}

	for ( const s of [ 'objectAdded', 'objectChanged', 'objectRemoved', 'geometryChanged', 'materialChanged', 'sceneGraphChanged', 'sceneFogChanged', 'sceneFogSettingsChanged', 'sceneBackgroundChanged', 'refreshSidebarObject3D' ] ) {

		signals[ s ].add( schedule );

	}

	// Layout: the panel docks to the left of the viewport.
	const MIN_WIDTH = 280;
	let WIDTH = Math.max( MIN_WIDTH, parseInt( localStorage.getItem( 'threejs-editor/code-panel-width' ) ) || 520 );
	const shifted = [ 'viewport', 'player', 'script' ];

	function layout( open ) {

		dom.style.display = open ? '' : 'none';
		dom.style.width = WIDTH + 'px';
		for ( const id of shifted ) {

			const el = document.getElementById( id );
			if ( el ) el.style.left = open ? WIDTH + 'px' : '';

		}

		const toolbar = document.getElementById( 'toolbar' );
		const sidebar = document.getElementById( 'sidebar' );
		if ( toolbar && sidebar ) {

			const left = open ? WIDTH : 0;
			toolbar.style.left = ( left + ( document.body.offsetWidth - left - sidebar.offsetWidth ) / 2 ) + 'px';

		}

		signals.windowResize.dispatch();
		if ( cm ) cm.refresh();

	}

	const handle = document.createElement( 'div' );
	handle.id = 'code-resizer';
	dom.appendChild( handle );

	handle.addEventListener( 'pointerdown', ( e ) => {

		if ( e.isPrimary === false ) return;
		e.preventDefault();
		handle.setPointerCapture( e.pointerId );
		handle.classList.add( 'active' );
		const move = ( ev ) => {

			const max = Math.max( MIN_WIDTH, document.body.offsetWidth - 335 - 100 );
			WIDTH = Math.round( Math.min( max, Math.max( MIN_WIDTH, ev.clientX ) ) );
			layout( true );

		};

		const up = () => {

			handle.classList.remove( 'active' );
			handle.removeEventListener( 'pointermove', move );
			handle.removeEventListener( 'pointerup', up );
			localStorage.setItem( 'threejs-editor/code-panel-width', String( WIDTH ) );

		};

		handle.addEventListener( 'pointermove', move );
		handle.addEventListener( 'pointerup', up );

	} );

	function toggle( force ) {

		const open = force === undefined ? dom.style.display === 'none' : force;
		layout( open );
		if ( open ) regenerate( false );

	}

	const getPublishInputs = async () => {

		if ( getCode().trim() === '' ) regenerate( true );
		return { code: getCode(), blobs: await assetsReady };

	};

	return { dom, getPublishInputs, toggle, apply, regenerate, isOpen: () => dom.style.display !== 'none' };

}

export { CodePanel };
