// Docked, live "three.js code" panel (experiment addition).
// Scene -> code: regenerated whenever the scene changes (unless you have unapplied edits).
// Code -> scene: Apply (or Auto-apply) re-runs the "Scene contents" section and swaps the editor scene.

// It is also the editor for attached object scripts and material shaders (replaces the stock popup).
// The scene code is mirrored into a generated "scene.js" script on the Scene (editor.scripts[scene.uuid]).
// The view follows the selection: nothing -> scene code; object with a script -> that script; otherwise the
// scene code scrolled to the object's lines.

import { generateThreeCode, assetsToBlobs, exportThreeArchive, exportThreeHtml, buildSceneFromCode } from './ThreeCodeExporter.js';
import { SetScriptValueCommand } from './commands/SetScriptValueCommand.js';
import { SetMaterialValueCommand } from './commands/SetMaterialValueCommand.js';
import buildThreeDefs from './libs/tern-threejs/build-defs.js';

function CodePanel( editor ) {

	const signals = editor.signals;
	const strings = editor.strings;

	const dom = document.createElement( 'div' );
	dom.id = 'code-panel';
	dom.style.display = 'none';

	const bar = document.createElement( 'div' );
	bar.className = 'code-bar';
	const status = document.createElement( 'div' );
	status.className = 'code-status';
	const host = document.createElement( 'div' );
	host.className = 'code-host';
	const head = document.createElement( 'div' );
	head.className = 'code-target';
	const backBtn = document.createElement( 'button' );
	backBtn.textContent = '← Scene';
	backBtn.className = 'Button';
	backBtn.title = 'Back to the scene code';
	const label = document.createElement( 'span' );
	const select = document.createElement( 'select' );
	head.append( backBtn, label, select );
	dom.append( bar, head, status, host );

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
	let target = { kind: 'scene' }; // or { kind: 'script', object, script } / { kind: 'glsl', object, key } / { kind: 'json', object }
	let sceneText = '';
	let ranges = {};
	let focusMark = null;
	let saveTimer = 0;
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
	const regenBtn = button( 'Regenerate', 'code-regen', 'Throw away edits and rebuild the code from the scene', () => {

		showScene( editor.selected );
		regenerate( true );

	} );
	const sceneOnly = [ applyBtn, autoLabel, regenBtn ];
	const sceneCode = () => target.kind === 'scene' ? getCode() : sceneText;
	const isOpen = () => dom.style.display !== 'none';

	// --- scene script (generated code mirrored onto the Scene) ---

	const sceneScript = () => ( editor.scripts[ editor.scene.uuid ] || [] ).find( ( s ) => s.generated );

	function ensureSceneScript( source ) {

		if ( ! editor.scripts ) editor.scripts = {};
		let s = sceneScript();
		if ( s ) {

			if ( source !== undefined ) s.source = source;
			return s;

		}

		s = { name: 'scene.js', source: source ?? sceneText, generated: true };
		( editor.scripts[ editor.scene.uuid ] ||= [] ).unshift( s );
		signals.scriptAdded.dispatch( s );
		return s;

	}

	// --- views ---

	function clearErrors() {

		if ( ! cm ) return;
		while ( errorLines.length > 0 ) cm.removeLineClass( errorLines.shift(), 'background', 'errorLine' );
		while ( widgets.length > 0 ) cm.removeLineWidget( widgets.shift() );

	}

	function setMode( mode ) {

		if ( cm ) cm.setOption( 'mode', mode === 'json' ? { name: 'javascript', json: true } : mode );

	}

	function refreshHead() {

		const isScene = target.kind === 'scene';
		backBtn.style.display = isScene ? 'none' : '';
		for ( const el of sceneOnly ) el.style.display = isScene ? '' : 'none';
		select.style.display = 'none';

		const sel = editor.selected;
		if ( isScene ) {

			label.textContent = sel && sel !== editor.scene && sel !== editor.camera ? 'Scene · ' + ( sel.name || sel.type ) : 'Scene';

		} else if ( target.kind === 'script' ) {

			label.textContent = ( target.object.name || target.object.type ) + ' / ' + ( target.script.name || 'script' );
			const scripts = ( editor.scripts[ target.object.uuid ] || [] ).filter( ( s ) => ! s.generated );
			if ( scripts.length > 1 ) {

				select.replaceChildren( ...scripts.map( ( s, i ) => new Option( s.name || 'script ' + ( i + 1 ), String( i ) ) ) );
				select.value = String( scripts.indexOf( target.script ) );
				select.style.display = '';

			}

		} else {

			const m = target.object.material;
			const what = { vertexShader: 'script/title/vertexShader', fragmentShader: 'script/title/fragmentShader', programInfo: 'script/title/programInfo' }[ target.key ];
			label.textContent = ( m && m.name || target.object.name || 'Material' ) + ' / ' + strings.getKey( what );

		}

	}

	function focusObject( object ) {

		if ( focusMark ) {

			focusMark.clear();
			focusMark = null;

		}

		const r = object && ! dirty && ranges[ object.uuid ];
		if ( ! r || ! cm ) return;
		focusMark = cm.markText( { line: r[ 0 ], ch: 0 }, { line: r[ 1 ] + 1, ch: 0 }, { className: 'code-focus' } );
		cm.scrollIntoView( { from: { line: r[ 0 ], ch: 0 }, to: { line: Math.min( r[ 1 ], r[ 0 ] + 12 ), ch: 0 } }, 60 );

	}

	function leaveScene() {

		if ( target.kind === 'scene' ) sceneText = getCode();
		if ( focusMark ) {

			focusMark.clear();
			focusMark = null;

		}

		clearTimeout( saveTimer );
		clearErrors();

	}

	function showScene( object ) {

		if ( target.kind !== 'scene' ) {

			clearTimeout( saveTimer );
			clearErrors();
			target = { kind: 'scene' };
			setMode( 'javascript' );
			setCode( sceneText );
			if ( cm ) cm.clearHistory();
			setStatus( dirty ? 'Edited.' : 'In sync with the scene.' );

		}

		refreshHead();
		focusObject( object === editor.scene || object === editor.camera ? null : object );

	}

	function showSource( next, mode, source, message ) {

		leaveScene();
		target = next;
		setMode( mode );
		setCode( source );
		if ( cm ) cm.clearHistory();
		refreshHead();
		setStatus( message );
		if ( mode === 'javascript' ) loadThreeDefs();

	}

	function showScript( object, script ) {

		showSource( { kind: 'script', object, script }, 'javascript', script.source, 'Script: changes are saved as you type.' );

	}

	function showShader( object, key ) {

		const m = object.material;
		if ( ! m ) return;

		if ( key === 'programInfo' ) {

			const json = { defines: m.defines, uniforms: m.uniforms, attributes: m.attributes };
			showSource( { kind: 'json', object, key }, 'json', JSON.stringify( json, null, '\t' ), 'Program info: changes are saved as you type.' );

		} else {

			showSource( { kind: 'glsl', object, key }, 'glsl', m[ key ] || '', 'Shader: changes are compiled as you type.' );

		}

	}

	// Selection follows: nothing -> scene; object with a script -> that script; otherwise the object's lines in the scene code.
	function follow( object, force ) {

		if ( ! isOpen() ) return;
		if ( ! force && target.kind !== 'scene' && object && target.object === object ) return;

		if ( ! object || object === editor.scene || object === editor.camera ) return showScene( null );

		const scripts = ( editor.scripts[ object.uuid ] || [] ).filter( ( s ) => ! s.generated );
		if ( scripts.length > 0 ) {

			return showScript( object, target.kind === 'script' && scripts.includes( target.script ) ? target.script : scripts[ 0 ] );

		}

		showScene( object );

	}

	backBtn.onclick = () => showScene( editor.selected );
	select.onchange = () => {

		const scripts = ( editor.scripts[ target.object.uuid ] || [] ).filter( ( s ) => ! s.generated );
		if ( scripts[ select.value ] ) showScript( target.object, scripts[ select.value ] );

	};

	// --- saving script / shader edits back ---

	const errorLines = [];
	const widgets = [];

	function validate( string ) {

		if ( ! cm ) return true;

		return cm.operation( () => {

			let valid;
			let errors = [];
			clearErrors();

			if ( target.kind === 'script' ) {

				try {

					errors = window.esprima.parse( string, { tolerant: true } ).errors;

				} catch ( error ) {

					errors.push( { lineNumber: error.lineNumber - 1, message: error.message } );

				}

				for ( const error of errors ) error.message = error.message.replace( /Line [0-9]+: /, '' );

			} else if ( target.kind === 'json' ) {

				window.jsonlint.parseError = ( message, info ) => {

					errors.push( { lineNumber: info.loc.first_line - 1, message: message.split( '\n' )[ 3 ] } );

				};

				try {

					window.jsonlint.parse( string );

				} catch ( error ) {

					// ignore failed error recovery

				}

			} else if ( target.kind === 'glsl' ) {

				const { object, key } = target;
				object.material[ key ] = string;
				object.material.needsUpdate = true;
				signals.materialChanged.dispatch( object, 0 );

				valid = true;
				const parseMessage = /^(?:ERROR|WARNING): \d+:(\d+): (.*)/g;

				for ( const program of viewportRenderer ? viewportRenderer.info.programs : [] ) {

					const diagnostics = program.diagnostics;
					if ( diagnostics === undefined || diagnostics.material !== object.material ) continue;
					if ( ! diagnostics.runnable ) valid = false;

					const info = diagnostics[ key ];
					const lineOffset = info.prefix.split( /\r\n|\r|\n/ ).length;
					let parsed;
					while ( ( parsed = parseMessage.exec( info.log ) ) !== null ) errors.push( { lineNumber: parsed[ 1 ] - lineOffset, message: parsed[ 2 ] } );
					break;

				}

			}

			for ( const error of errors ) {

				const message = document.createElement( 'div' );
				message.className = 'esprima-error';
				message.textContent = error.message;
				const line = Math.max( error.lineNumber, 0 );
				errorLines.push( line );
				cm.addLineClass( line, 'background', 'errorLine' );
				widgets.push( cm.addLineWidget( line, message ) );

			}

			if ( errors.length > 0 ) setStatus( errors[ 0 ].message + ( errors.length > 1 ? ` (+${ errors.length - 1 } more)` : '' ), true );
			return valid !== undefined ? valid : errors.length === 0;

		} );

	}

	function saveTarget() {

		const value = getCode();
		if ( ! validate( value ) ) return;

		const { kind, object } = target;

		if ( kind === 'script' ) {

			if ( value !== target.script.source ) editor.execute( new SetScriptValueCommand( editor, object, target.script, 'source', value ) );

		} else if ( kind === 'json' ) {

			const json = JSON.parse( value );
			for ( const key of [ 'defines', 'uniforms', 'attributes' ] ) {

				if ( JSON.stringify( object.material[ key ] ) !== JSON.stringify( json[ key ] ) ) {

					const cmd = new SetMaterialValueCommand( editor, object, key, json[ key ] );
					cmd.updatable = false;
					editor.execute( cmd );

				}

			}

		}

		setStatus( 'Saved ✓ ' + new Date().toLocaleTimeString() );

	}

	// --- autocomplete (three.js API defs are built lazily from the library) ---

	let server = null;
	let threeDefsRequested = false;

	async function loadThreeDefs() {

		if ( threeDefsRequested || ! cm || ! window.CodeMirror.TernServer ) return;
		threeDefsRequested = true;

		try {

			server = new window.CodeMirror.TernServer( { caseInsensitive: true } );
			const source = await ( await fetch( new URL( '../build/three.core.js', document.baseURI ).href ) ).text();
			server.server.defs.push( buildThreeDefs( source ) );
			server.server.reset();

			cm.addKeyMap( {
				'Ctrl-Space': ( c ) => server.complete( c ),
				'Ctrl-I': ( c ) => server.showType( c ),
				'Ctrl-O': ( c ) => server.showDocs( c ),
				'Alt-.': ( c ) => server.jumpToDef( c ),
				'Alt-,': ( c ) => server.jumpBack( c ),
				'Ctrl-Q': ( c ) => server.rename( c ),
				'Ctrl-.': ( c ) => server.selectName( c )
			} );
			cm.on( 'cursorActivity', ( c ) => { if ( target.kind === 'script' ) server.updateArgHints( c ); } );
			cm.on( 'keypress', ( c, kb ) => { if ( target.kind === 'script' && /[\w.]/.test( kb.key ) ) server.complete( c ); } );

		} catch ( error ) {

			console.warn( 'CodePanel: Failed to build three.js autocomplete defs.', error );

		}

	}
	button( 'Copy', 'code-copy', 'Copy to clipboard', async () => {

		try {

			await navigator.clipboard.writeText( getCode() );

		} catch ( e ) {

			textarea.value = getCode();
			textarea.select();
			document.execCommand( 'copy' );

		}

	} );
	button( '.js', 'code-dl-js', 'Download main.js', () => editor.utils.save( new Blob( [ sceneCode() ], { type: 'text/javascript' } ), 'scene.js' ) );
	button( '.html', 'code-dl-html', 'Single HTML page that loads three from a CDN (no textures/models)', () => editor.utils.save( new Blob( [ exportThreeHtml( sceneCode(), 'cdn' ) ], { type: 'text/html' } ), 'scene.html' ) );
	button( '.zip', 'code-dl-zip', 'Standalone archive: page, code, textures, models and a local copy of three.js', async () => {

		try {

			setStatus( 'Building archive…' );
			const blobs = await assetsReady;
			const zip = await exportThreeArchive( sceneCode(), blobs );
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

		if ( target.kind !== 'scene' ) {

			clearTimeout( saveTimer );
			saveTimer = setTimeout( saveTarget, 300 );
			return;

		}

		dirty = true;
		ensureSceneScript( getCode() );
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
		sceneText = result.code;
		ranges = result.ranges;
		ensureSceneScript( result.code );
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
		if ( target.kind === 'scene' ) {

			setCode( result.code );
			dirty = false;
			clearTimeout( applyTimer );
			setStatus( 'In sync with the scene.' );
			focusObject( editor.selected );

		} else {

			dirty = false;
			clearTimeout( applyTimer );

		}

	}

	async function apply() {

		clearTimeout( applyTimer );
		applying = true;
		try {

			await assetsReady;
			const next = await buildSceneFromCode( sceneCode(), resolve, { camera: editor.camera, renderer: viewportRenderer } );
			const selectedName = editor.selected && editor.selected.name;

			// scripts follow their objects (by name) because Apply rebuilds the objects with new uuids
			const kept = [];
			editor.scene.traverse( ( o ) => {

				const list = o !== editor.scene && editor.scripts[ o.uuid ];
				if ( list && list.length > 0 ) kept.push( { uuid: o.uuid, name: o.name, list } );

			} );

			signals.sceneGraphChanged.active = false;
			for ( const child of [ ...editor.scene.children ] ) editor.removeObject( child );
			editor.scene.background = next.background;
			editor.scene.fog = next.fog;
			editor.deselect();
			while ( next.children.length > 0 ) editor.addObject( next.children[ 0 ] );

			for ( const k of kept ) {

				delete editor.scripts[ k.uuid ];
				const again = k.name && editor.scene.getObjectByName( k.name );
				if ( again ) editor.scripts[ again.uuid ] = k.list;

			}

			ensureSceneScript( sceneCode() );
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

	function syncClosed() {

		if ( dirty ) return;

		try {

			const result = generateThreeCode( editor );
			sceneText = result.code;
			ranges = result.ranges;
			ensureSceneScript( result.code );

		} catch ( e ) {

			console.warn( 'CodePanel: scene script sync failed', e );

		}

	}

	function schedule() {

		if ( applying ) return;
		clearTimeout( timer );
		timer = setTimeout( () => isOpen() ? regenerate( false ) : syncClosed(), isOpen() ? 250 : 600 );

	}

	for ( const s of [ 'objectAdded', 'objectChanged', 'objectRemoved', 'geometryChanged', 'materialChanged', 'sceneGraphChanged', 'sceneFogChanged', 'sceneFogSettingsChanged', 'sceneBackgroundChanged', 'refreshSidebarObject3D', 'editorCleared' ] ) {

		signals[ s ].add( schedule );

	}

	signals.objectSelected.add( ( object ) => {

		follow( object );
		if ( isOpen() ) refreshHead();

	} );

	signals.editScript.add( ( object, script ) => {

		if ( ! isOpen() ) open();

		if ( typeof script === 'object' ) {

			if ( script.generated ) showScene( object );
			else showScript( object, script );

		} else {

			showShader( object, script );

		}

	} );

	signals.scriptRemoved.add( ( script ) => {

		if ( target.script === script ) follow( editor.selected, true );

	} );

	signals.editorCleared.add( () => {

		if ( target.kind !== 'scene' ) showScene( null );

	} );

	for ( const s of [ 'objectChanged', 'scriptChanged', 'materialChanged' ] ) signals[ s ].add( () => { if ( isOpen() ) refreshHead(); } );

	setTimeout( syncClosed, 0 );

	// Layout: the panel docks to the left of the viewport.
	const MIN_WIDTH = 280;
	let WIDTH = Math.max( MIN_WIDTH, parseInt( localStorage.getItem( 'threejs-editor/code-panel-width' ) ) || 520 );
	const shifted = [ 'viewport', 'player' ];

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

	function open() {

		layout( true );
		regenerate( false );

	}

	function toggle( force ) {

		const next = force === undefined ? dom.style.display === 'none' : force;
		if ( next ) {

			open();
			follow( editor.selected, true );

		} else {

			layout( false );

		}

	}

	const getPublishInputs = async () => {

		if ( sceneCode().trim() === '' ) regenerate( true );
		return { code: sceneCode(), blobs: await assetsReady };

	};

	return { dom, getPublishInputs, toggle, apply, regenerate, isOpen: () => dom.style.display !== 'none' };

}

export { CodePanel };
