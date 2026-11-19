// Script Window for generated scene source, object scripts, and shader programs.
// Scene -> code: regenerated whenever the scene changes (unless you have unapplied edits).
// Code -> scene: Apply (or Auto-apply) re-runs the "Scene contents" section and swaps the editor scene.

// It is also the editor for attached object scripts and material shaders (replaces the stock popup).
// The applied scene code is mirrored into a generated "scene.js" script on the Scene (editor.scripts[scene.uuid]).
// The view follows the selection: nothing -> scene code; object with a script -> that script; otherwise the
// scene code scrolled to the object's lines.

import { Color } from 'three';
import { generateThreeCode, assetsToBlobs, buildSceneFromCode } from './ThreeCodeExporter.js';
import { SetScriptValueCommand } from './commands/SetScriptValueCommand.js';
import { SetMaterialValueCommand } from './commands/SetMaterialValueCommand.js';
import { codeEditorSettings, setCodeEditorSettings } from './CodeEditorSettings.js';
import { createCodeLanguageService } from './CodeLanguageService.js';
import { modelButton } from './modeling/ModelControls.js?v=coverage-overlay';
import { parse } from './libs/acorn/acorn.mjs';

function CodePanel( editor ) {

	const signals = editor.signals;
	const strings = editor.strings;

	const dom = document.createElement( 'div' );
	dom.id = 'script-window';

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
	const browse = modelButton( head, 'Browse code documents', 'assets', browseDocuments );
	browse.setAttribute( 'aria-haspopup', 'dialog' );
	const pin = modelButton( head, 'Pin code document', 'uvPin', () => {

		pinned = ! pinned;
		pin.setAttribute( 'aria-pressed', String( pinned ) );
		if ( ! pinned ) follow( editor.selected );
		refreshHead();

	} );
	pin.setAttribute( 'aria-pressed', 'false' );
	const label = document.createElement( 'span' );
	label.className = 'code-document-label';
	const select = document.createElement( 'select' );
	select.setAttribute( 'aria-label', 'Object script' );
	head.append( backBtn, label, select );
	dom.append( bar, head, host, status );

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

	let viewportRenderer = editor.renderer || null;
	signals.rendererCreated.add( ( r ) => { viewportRenderer = r; } );

	// Clicking outside the panel (e.g. in the viewport) hands the keyboard back to the editor shortcuts
	document.addEventListener( 'pointerdown', ( e ) => {

		if ( ! dom.contains( e.target ) && dom.contains( document.activeElement ) ) document.activeElement.blur();

	}, true );

	signals.windowResize.add( () => { if ( cm ) cm.refresh(); } );

	let cm = null;
	let dirty = false; // code edited but not applied yet
	let applying = false;
	let editRevision = 0;
	let suppressSceneSync = false;
	let setting = false;
	let assetsReady = Promise.resolve( new Map() );
	let urls = new Map();
	const store = new Map(); // path -> Blob, survives regeneration so reloaded textures keep their bytes
	let timer = 0;
	let applyTimer = 0;
	let target = { kind: 'scene' }; // or { kind: 'script', object, script } / { kind: 'glsl', object, key, slot, material: m } / { kind: 'json', object }
	let sceneText = '';
	let ranges = {};
	let focusMark = null;
	let saveTimer = 0;
	let targetDirty = false;
	let documents = new WeakMap();
	let sceneView;
	let projectRevision = 0;
	let pinned = false;
	let choosingDocument = false;
	const textarea = document.createElement( 'textarea' );
	textarea.id = 'code-text';
	textarea.spellcheck = false;

	if ( window.CodeMirror ) {

		cm = window.CodeMirror( host, { value: '', mode: 'javascript', lineNumbers: true, matchBrackets: true, indentWithTabs: false, tabSize: 2, indentUnit: 2, theme: 'editor' } );
		const input = cm.getInputField();
		input.spellcheck = false;
		input.setAttribute( 'autocorrect', 'off' );
		input.setAttribute( 'autocapitalize', 'off' );
		input.setAttribute( 'autocomplete', 'off' );
		cm.on( 'change', onEdit );

	} else {

		host.appendChild( textarea );
		textarea.addEventListener( 'input', onEdit );

	}

	const getCode = () => cm ? cm.getValue() : textarea.value;

	function refreshCodeSettings() {

		const settings = codeEditorSettings( editor );
		host.style.setProperty( '--code-font', `"${ settings.font.replaceAll( '"', '' ) }", monospace` );
		host.style.setProperty( '--code-font-size', `${ settings.fontSize }px` );
		host.style.setProperty( '--code-ligatures', settings.ligatures ? 'normal' : 'none' );
		if ( cm ) {

			cm.setOption( 'lineNumbers', settings.lineNumbers );
			cm.setOption( 'lineWrapping', settings.wrap );
			cm.setOption( 'foldGutter', settings.folding );
			cm.setOption( 'gutters', [ ...( settings.lineNumbers ? [ 'CodeMirror-linenumbers' ] : [] ), ...( settings.folding ? [ 'CodeMirror-foldgutter' ] : [] ) ] );
			cm.refresh();

		} else {

			textarea.wrap = settings.wrap ? 'soft' : 'off';

		}

	}
	document.addEventListener( 'threeditor-code-settings', refreshCodeSettings );
	refreshCodeSettings();

	async function transformCode( kind ) {

		if ( target.kind === 'glsl' || target.kind === 'json' ) {

			setStatus( 'Format and minimize currently support JavaScript only.', true );
			return;

		}
		const before = getCode();
		const currentTarget = target;
		const selected = cm ? cm.somethingSelected() : textarea.selectionStart !== textarea.selectionEnd;
		const from = cm ? cm.indexFromPos( cm.getCursor( 'from' ) ) : textarea.selectionStart;
		const to = cm ? cm.indexFromPos( cm.getCursor( 'to' ) ) : textarea.selectionEnd;
		try {

			const tools = await import( './libs/code-tools.js' );
			let result;
			if ( kind === 'format' ) result = await tools.formatCode( before, selected ? { from, to } : null );
			else {

				const source = selected ? before.slice( from, to ) : before;
				const minimized = await tools.minifyCode( source );
				result = selected ? before.slice( 0, from ) + minimized + before.slice( to ) : minimized;

			}
			if ( target !== currentTarget ) return;
			if ( getCode() !== before ) { setStatus( 'Code changed while the operation was running; try again.', true ); return; }
			if ( cm ) cm.replaceRange( result, { line: 0, ch: 0 }, cm.posFromIndex( before.length ), '+input' );
			else { textarea.value = result; onEdit(); }

		} catch ( error ) {

			setStatus( `${ kind === 'format' ? 'Format' : 'Minimize' } failed: ${ error.message.split( '\n' )[ 0 ] }`, true );

		}

	}

	function setCode( value ) {

		if ( getCode() === value ) return;
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
	auto.checked = false;
	auto.addEventListener( 'change', () => {

		clearTimeout( applyTimer );
		scheduleAutoApply();

	} );
	const autoText = document.createElement( 'span' );
	autoText.className = 'glyph-auto';
	autoText.textContent = 'auto';
	autoLabel.append( auto, autoText );
	autoLabel.title = 'Apply valid scene code after a pause while typing';
	bar.appendChild( autoLabel );
	const regenBtn = button( 'Regenerate', 'code-regen', 'Throw away edits and rebuild the code from the scene', () => {

		showScene( editor.selected );
		regenerate( true );

	} );
	const sceneOnly = [ applyBtn, autoLabel, regenBtn ];
	const sceneCode = () => target.kind === 'scene' ? getCode() : sceneText;
	const isOpen = () => editor.editWorkspace.mode === 'script';

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

		const sel = pinned ? null : editor.selected;
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

			const m = target.material;
			const what = { vertexShader: 'script/title/vertexShader', fragmentShader: 'script/title/fragmentShader', programInfo: 'script/title/programInfo' }[ target.key ];
			label.textContent = ( m && m.name || target.object.name || 'Material' ) + ' / ' + strings.getKey( what );

		}
		label.title = label.textContent;

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

	function captureView() {

		const text = getCode();
		const view = cm ? {
			selection: cm.listSelections(), history: cm.getHistory(), scroll: cm.getScrollInfo()
		} : {
			selection: [ textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection ],
			scroll: { left: textarea.scrollLeft, top: textarea.scrollTop }
		};
		return { text, ...view };

	}

	function restoreView( view ) {

		if ( cm ) {

			cm.clearHistory();
			if ( view ) {

				if ( view.text === getCode() ) cm.setHistory( view.history );
				cm.setSelections( view.selection );
				cm.scrollTo( view.scroll.left, view.scroll.top );

			} else cm.setCursor( 0, 0 );

		} else if ( view ) {

			textarea.setSelectionRange( ...view.selection );
			textarea.scrollLeft = view.scroll.left;
			textarea.scrollTop = view.scroll.top;

		} else textarea.setSelectionRange( 0, 0 );

	}

	function sourceViews( entry ) {

		const owner = entry.script || entry.material;
		if ( ! documents.has( owner ) ) documents.set( owner, new Map() );
		return documents.get( owner );

	}

	function leaveDocument() {

		clearTimeout( applyTimer );
		if ( target.kind === 'scene' ) {

			sceneText = getCode();
			sceneView = captureView();

		} else {

			flushTarget();
			sourceViews( target ).set( target.key || 'source', {
				view: captureView(), base: readTargetSource( target ), dirty: targetDirty,
				status: status.textContent, error: status.classList.contains( 'error' )
			} );

		}
		if ( focusMark ) {

			focusMark.clear();
			focusMark = null;

		}
		clearErrors();

	}

	function showScene( object ) {

		if ( target.kind !== 'scene' ) {

			leaveDocument();
			target = { kind: 'scene' };
			targetDirty = false;
			setMode( 'javascript' );
			setCode( sceneText );
			restoreView( sceneView );
			setStatus( dirty ? 'Edited.' : 'In sync with the scene.' );
			scheduleAutoApply();
			scheduleLint();

		}

		refreshHead();
		focusObject( object === editor.scene || object === editor.camera ? null : object );

	}

	function readTargetSource( entry ) {

		if ( entry.kind === 'script' ) return entry.script.source;
		if ( entry.kind === 'glsl' ) return entry.material[ entry.key ] || '';
		const { material } = entry;
		const uniforms = Object.fromEntries( Object.entries( material.uniforms ).map( ( [ name, uniform ] ) => [
			name, uniform.value?.isColor ? { ...uniform, value: '#' + uniform.value.getHexString() } : uniform
		] ) );
		return JSON.stringify( { defines: material.defines, uniforms, attributes: material.attributes }, null, '\t' );

	}

	function showSource( next, mode, message ) {

		leaveDocument();
		target = next;
		const source = readTargetSource( target );
		const stored = sourceViews( target ).get( target.key || 'source' );
		targetDirty = Boolean( stored?.dirty );
		setMode( mode );
		setCode( targetDirty ? stored.view.text : source );
		restoreView( stored?.view );
		refreshHead();
		if ( targetDirty && stored.base !== source ) setStatus( 'Saved source changed. Your draft is still open.', true );
		else if ( targetDirty ) setStatus( stored.status || 'Unapplied draft.', stored.error );
		else setStatus( message );
		scheduleLint();

	}

	function showScript( object, script ) {

		showSource( { kind: 'script', object, script }, 'javascript', 'Script: changes are saved as you type.' );

	}

	function showShader( object, key, slot = 0 ) {

		const m = editor.getObjectMaterial( object, slot );
		if ( ! m?.isShaderMaterial ) return;

		const kind = key === 'programInfo' ? 'json' : 'glsl';
		showSource( { kind, object, key, slot, material: m }, kind,
			kind === 'json' ? 'Program info: changes are saved as you type.' : 'Shader: changes are compiled as you type.' );
	}

	function browseDocuments() {

		const actions = [ { label: 'Scene source', section: 'Scene', run: () => chooseDocument( editor.scene ) } ];
		const scripts = [], shaders = [];
		const collect = object => {

			if ( object.userData.runtimeOnly ) return;
			const path = [];
			for ( let parent = object; parent && parent !== editor.scene; parent = parent.parent ) path.unshift( parent.name || parent.type );
			const name = path.join( ' / ' ) || object.name || 'Scene';
			for ( const script of editor.scripts[ object.uuid ] || [] ) {

				if ( script.generated ) continue;
				scripts.push( { label: name + ' / ' + ( script.name || 'Script' ), section: 'Object scripts', run: () => chooseDocument( object, script ) } );

			}
			const materials = [].concat( object.material || [] );
			materials.forEach( ( material, slot ) => {

				if ( ! material?.isShaderMaterial ) return;
				const slotName = materials.length > 1 ? ' / ' + ( material.name || 'Material ' + ( slot + 1 ) ) : '';
				for ( const [ key, shader ] of [ [ 'vertexShader', 'Vertex shader' ], [ 'fragmentShader', 'Fragment shader' ], [ 'programInfo', 'Program info' ] ] ) {

					shaders.push( { label: name + slotName + ' / ' + shader, section: 'Shaders', run: () => chooseDocument( object, key, slot ) } );

				}

			} );

		};
		editor.scene.traverse( collect );
		if ( ! editor.camera.parent ) collect( editor.camera );
		const bounds = browse.getBoundingClientRect();
		browse.focus();
		editor.contextMenu.show( 'Code documents', [ ...actions, ...scripts, ...shaders ], { x: bounds.left, y: bounds.bottom + 4 } );

	}

	function chooseDocument( object, script, slot ) {

		if ( ! isOpen() ) return;
		if ( object !== editor.scene && object !== editor.camera && editor.objectByUuid( object.uuid ) !== object ) return;
		if ( ! script ) showScene( null );
		else {

			if ( typeof script === 'object' && ! editor.scripts[ object.uuid ]?.includes( script ) ) return;
			if ( ! pinned ) {

				choosingDocument = true;
				try { editor.select( object ); }
				finally { choosingDocument = false; }

			}
			signals.editScript.dispatch( object, script, slot );

		}
		if ( cm ) cm.focus(); else textarea.focus();

	}

	// Selection follows: nothing -> scene; object with a script -> that script; otherwise the object's lines in the scene code.
	function follow( object, force ) {

		if ( ! isOpen() || choosingDocument || pinned && ! force ) return;
		if ( ! force && object && target.object === object && (
			target.kind === 'script' ? editor.scripts[ object.uuid ]?.includes( target.script ) :
				target.material && editor.getObjectMaterial( object, target.slot ) === target.material
		) ) return;

		if ( pinned || ! object || object === editor.scene || object === editor.camera ) return showScene( null );

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

	function shaderDiagnostics( object, material, key, source ) {

		if ( ! viewportRenderer?.isWebGLRenderer || ! object.isMesh ) return null;
		const candidate = material.clone();
		candidate[ key ] = source;
		const probe = object.clone( false );
		probe.material = candidate;
		const debug = viewportRenderer.debug;
		const onError = debug.onShaderError;
		debug.onShaderError = () => {};
		try {

			viewportRenderer.compile( probe, editor.viewportCamera, editor.scene );
			const program = viewportRenderer.properties.get( candidate ).currentProgram;
			program?.getUniforms();
			return program?.diagnostics || null;

		} finally {

			debug.onShaderError = onError;
			candidate.dispose();

		}

	}

	function validate( string ) {

		const check = () => {

			let valid = true;
			const errors = [];
			clearErrors();

			if ( target.kind === 'script' || target.kind === 'json' ) {

				try {

					if ( target.kind === 'json' ) JSON.parse( string );
					else parse( string, { ecmaVersion: 'latest', allowReturnOutsideFunction: true } );

				} catch ( error ) {

					errors.push( { lineNumber: ( error.loc?.line || 1 ) - 1, message: error.message } );
					valid = false;

				}

			} else if ( target.kind === 'glsl' ) {

				const { object, key, slot, material } = target;
				if ( editor.getObjectMaterial( object, slot ) !== material ) return false;
				try {

					const diagnostics = shaderDiagnostics( object, material, key, string );
					valid = ! diagnostics || diagnostics.runnable;
					if ( ! valid ) {

						const info = diagnostics[ key ];
						const offset = info.prefix.split( /\r\n|\r|\n/ ).length;
						for ( const match of info.log.matchAll( /^ERROR: \d+:(\d+):\s*(.*)/gm ) ) {

							errors.push( { lineNumber: Number( match[ 1 ] ) - offset, message: match[ 2 ] } );

						}
						if ( ! errors.length ) errors.push( { lineNumber: 0, message: diagnostics.programLog || 'Shader compilation failed.' } );

					}

				} catch ( error ) {

					valid = false;
					errors.push( { lineNumber: 0, message: error.message } );

				}

			}

			if ( cm ) for ( const error of errors ) {

				const message = document.createElement( 'div' );
				message.className = 'esprima-error';
				message.textContent = error.message;
				const line = Math.max( 0, Math.min( cm.lastLine(), error.lineNumber ) );
				errorLines.push( line );
				cm.addLineClass( line, 'background', 'errorLine' );
				widgets.push( cm.addLineWidget( line, message ) );

			}
			if ( errors.length > 0 ) setStatus( errors[ 0 ].message + ( errors.length > 1 ? ` (+${ errors.length - 1 } more)` : '' ), true );
			return valid;

		};
		return cm ? cm.operation( check ) : check();

	}

	function saveTarget() {

		const value = getCode();
		if ( ! validate( value ) ) {
			if ( ! status.classList.contains( 'error' ) ) setStatus( 'Source could not be applied. The draft is kept.', true );
			return;
		}

		const { kind, object } = target;

		if ( kind === 'script' ) {

			if ( value !== target.script.source ) editor.execute( new SetScriptValueCommand( editor, object, target.script, 'source', value ) );

		} else if ( kind === 'glsl' ) {

			const { material, slot, key } = target;
			if ( value !== material[ key ] ) editor.execute( new SetMaterialValueCommand( editor, object, key, value, slot ) );

		} else if ( kind === 'json' ) {

			const { material, slot } = target;
			if ( editor.getObjectMaterial( object, slot ) !== material ) return;
			const json = JSON.parse( value );
			if ( json.uniforms && typeof json.uniforms === 'object' ) {

				for ( const [ name, uniform ] of Object.entries( json.uniforms ) ) {

					const previous = Object.hasOwn( material.uniforms, name ) ? material.uniforms[ name ] : undefined;
					if ( previous && JSON.stringify( previous ) === JSON.stringify( uniform ) ) json.uniforms[ name ] = previous;
					else if ( typeof uniform?.value === 'string' && /^#[\da-f]{6}$/i.test( uniform.value ) ) uniform.value = new Color( uniform.value );

				}

			}
			for ( const key of [ 'defines', 'uniforms', 'attributes' ] ) {

				if ( JSON.stringify( material[ key ] ) !== JSON.stringify( json[ key ] ) ) {

					const cmd = new SetMaterialValueCommand( editor, object, key, json[ key ], slot );
					cmd.updatable = false;
					editor.execute( cmd );

				}

			}

		}

		targetDirty = false;
		setStatus( 'Saved ✓ ' + new Date().toLocaleTimeString() );

	}

	// --- autocomplete (three.js API defs are built lazily from the library) ---

	const askLanguage = createCodeLanguageService( editor );
	let lintTimer = 0;
	let lintMarks = [];
	const shaderWords = 'attribute uniform varying in out const float int uint bool vec2 vec3 vec4 ivec2 ivec3 ivec4 mat2 mat3 mat4 sampler2D samplerCube void if else for return gl_Position gl_FragColor gl_FragCoord gl_PointCoord gl_PointSize position normal uv projectionMatrix modelMatrix modelViewMatrix viewMatrix normalMatrix cameraPosition texture texture2D textureCube mix clamp smoothstep step dot cross normalize length distance reflect refract pow sin cos tan abs min max mod fract floor ceil sqrt inversesqrt discard'.split( ' ' );
	function shaderHint( c ) {

		const cursor = c.getCursor(), token = c.getTokenAt( cursor );
		const start = token.start, word = token.string.slice( 0, cursor.ch - start );
		return { list: shaderWords.filter( entry => entry.startsWith( word ) && entry !== word ), from: { line: cursor.line, ch: start }, to: cursor };

	}
	if ( cm ) cm.addKeyMap( { 'Shift-Ctrl-Space': c => {

		if ( ! codeEditorSettings( editor ).completion ) return;
		if ( target.kind === 'glsl' ) c.showHint( { hint: shaderHint, completeSingle: false } ); else if ( target.kind !== 'json' ) c.showHint( { hint: semanticHint, completeSingle: false } );

	} } );
	if ( cm ) cm.on( 'inputRead', ( c, change ) => {

		if ( target.kind !== 'glsl' || ! codeEditorSettings( editor ).completion || change.origin !== '+input' || ! /^[A-Za-z_]$/.test( change.text[ 0 ] ) ) return;
		if ( ! c.state.completionActive ) c.showHint( { hint: shaderHint, completeSingle: false } );

	} );

	async function semanticHint( c ) {

		const cursor = c.getCursor(), source = c.getValue(), position = c.indexFromPos( cursor );
		const token = c.getTokenAt( cursor );
		if ( /comment|string/.test( token.type || '' ) ) return null;
		const match = /[\w$]*$/.exec( source.slice( 0, position ) );
		const from = position - match[ 0 ].length;
		try {

			const entries = await askLanguage( source, 'completion', position );
			if ( c.getValue() !== source || c.indexFromPos( c.getCursor() ) !== position ) return null;
			return { from: c.posFromIndex( from ), to: cursor, list: entries.filter( item => item.label.toLowerCase().startsWith( match[ 0 ].toLowerCase() ) ).map( item => ( { text: item.apply, displayText: item.label } ) ) };

		} catch ( error ) {

			console.warn( 'Code completion unavailable:', error.message );
			return null;

		}

	}
	function scheduleLint() {

		clearTimeout( lintTimer );
		for ( const mark of lintMarks ) mark.clear();
		lintMarks = [];
		if ( ! cm || ! codeEditorSettings( editor ).lint || ! [ 'scene', 'script' ].includes( target.kind ) ) return;
		const source = getCode(), currentTarget = target;
		lintTimer = setTimeout( async () => {

			try {

				const diagnostics = await askLanguage( source, 'diagnostics' );
				if ( getCode() !== source || target !== currentTarget || ! codeEditorSettings( editor ).lint ) return;
				for ( const diagnostic of diagnostics ) {

					const mark = cm.markText( cm.posFromIndex( diagnostic.from ), cm.posFromIndex( diagnostic.from + diagnostic.length ), { className: 'code-lint-error', attributes: { title: diagnostic.message } } );
					lintMarks.push( mark );

				}
				if ( diagnostics.length ) setStatus( diagnostics[ 0 ].message, true );

			} catch ( error ) { console.warn( 'Code diagnostics unavailable:', error.message ); }

		}, 1200 );

	}
	if ( cm ) cm.on( 'inputRead', ( c, change ) => {

		if ( codeEditorSettings( editor ).completion && [ 'scene', 'script' ].includes( target.kind ) && change.origin === '+input' && change.text[ 0 ] === '.' && ! c.state.completionActive ) c.showHint( { hint: semanticHint, completeSingle: false } );

	} );
	document.addEventListener( 'threeditor-code-settings', scheduleLint );
	dom.addEventListener( 'keydown', ( e ) => {

		if ( ( e.metaKey || e.ctrlKey ) && ! e.altKey && ( e.key === '+' || e.key === '=' || e.key === '-' ) ) {

			e.preventDefault();
			const delta = e.key === '-' ? - 1 : 1;
			setCodeEditorSettings( editor, { fontSize: Math.max( 8, Math.min( 32, codeEditorSettings( editor ).fontSize + delta ) ) } );

		} else if ( e.altKey && ! e.metaKey && ! e.ctrlKey && ! e.shiftKey && e.code === 'KeyZ' ) {

			e.preventDefault();
			setCodeEditorSettings( editor, { wrap: ! codeEditorSettings( editor ).wrap } );

		} else if ( e.altKey && ! e.metaKey && ! e.ctrlKey && e.shiftKey && [ 'KeyF', 'KeyM' ].includes( e.code ) ) {

			e.preventDefault();
			transformCode( e.code === 'KeyF' ? 'format' : 'minimize' );

		}

		if ( ( e.metaKey || e.ctrlKey ) && e.key === 'Enter' ) {

			e.preventDefault();
			if ( target.kind === 'scene' ) apply();
			else flushTarget( true );

		}

		if ( e.defaultPrevented ) e.stopPropagation();

	}, true );

	function onEdit() {

		if ( setting ) return;
		editRevision ++;
		scheduleLint();

		if ( target.kind !== 'scene' ) {

			targetDirty = true;
			clearTimeout( saveTimer );
			saveTimer = setTimeout( flushTarget, 300 );
			return;

		}

		dirty = true;
		setStatus( auto.checked ? 'Editing draft. Current scene stays active.' : 'Edited. Press Apply (Ctrl/Cmd+Enter) to update the scene.' );
		clearTimeout( applyTimer );
		clearTimeout( timer );
		timer = 0;
		scheduleAutoApply();

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
		const revision = projectRevision;
		assetsReady = assetsToBlobs( result.assets, store ).then( ( map ) => {

			if ( revision !== projectRevision ) return new Map();
			for ( const [ p, b ] of map ) {

				if ( store.get( p ) !== b ) {

					store.set( p, b );
					urls.set( p, URL.createObjectURL( b ) );

				}

			}

			return map;

		} ).catch( ( e ) => {

			if ( revision === projectRevision && target.kind === 'scene' ) setStatus( 'Asset export failed: ' + e.message, true );
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

	function scheduleAutoApply() {

		clearTimeout( applyTimer );
		if ( isOpen() && target.kind === 'scene' && auto.checked && dirty ) applyTimer = setTimeout( autoApply, 700 );

	}

	function autoApply() {

		if ( isOpen() && target.kind === 'scene' && auto.checked && dirty ) apply( true );

	}

	async function apply( automatic = false ) {

		clearTimeout( applyTimer );
		if ( applying ) {

			if ( auto.checked ) applyTimer = setTimeout( autoApply, 700 );
			return { ok: false, error: 'An apply is already in progress.' };

		}
		const revision = editRevision;
		const source = sceneCode();
		const applyingTarget = target;
		const scripts = editor.scripts;
		const isCurrent = () => revision === editRevision && target === applyingTarget && source === sceneCode() && scripts === editor.scripts && ( ! automatic || auto.checked );
		applying = true;
		try {

			parse( source, { ecmaVersion: 'latest', sourceType: 'module' } );
			await assetsReady;
			const next = await buildSceneFromCode( source, resolve, { camera: editor.camera, renderer: viewportRenderer } );
			if ( ! isCurrent() ) return { ok: false, error: 'Draft changed while applying.' };
			clearTimeout( timer );
			timer = 0;
			const selectedName = editor.selected && editor.selected.name;
			const viewportCamera = editor.viewportCamera;
			const cameraCenter = ( editor.controls.getCenter?.( viewportCamera ) || editor.controls.center ).clone();

			// scripts follow their objects (by name) because Apply rebuilds the objects with new uuids
			const kept = [];
			editor.scene.traverse( ( o ) => {

				const list = o !== editor.scene && editor.scripts[ o.uuid ];
				if ( list && list.length > 0 ) kept.push( { uuid: o.uuid, name: o.name, list } );

			} );

			signals.sceneGraphChanged.active = false;
			for ( const child of [ ...editor.scene.children ] ) editor.removeObject( child );
			editor.scene.background = next.background;
			editor.scene.environment = next.environment;
			editor.scene.fog = next.fog;
			editor.deselect();
			while ( next.children.length > 0 ) editor.addObject( next.children[ 0 ] );
			const rebuiltCamera = editor.cameras[ viewportCamera.uuid ];
			if ( rebuiltCamera && rebuiltCamera !== editor.viewportCamera ) {

				editor.controls.getCenter?.( rebuiltCamera ).copy( cameraCenter );
				editor.setViewportCamera( rebuiltCamera.uuid );

			}

			for ( const k of kept ) {

				delete editor.scripts[ k.uuid ];
				const again = k.name && editor.scene.getObjectByName( k.name );
				if ( again ) editor.scripts[ again.uuid ] = k.list;

			}

			ensureSceneScript( source );
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

				suppressSceneSync = true;
				signals.materialChanged.dispatch( editor.scene );
				if ( editor.selected ) signals.objectSelected.dispatch( editor.selected );
				suppressSceneSync = false;

			} );

			dirty = false;
			setStatus( 'Applied ✓ ' + new Date().toLocaleTimeString() );
			return { ok: true };

		} catch ( e ) {

			signals.sceneGraphChanged.active = true;
			if ( isCurrent() ) setStatus( 'Current scene kept. ' + e.message, true );
			console.warn( e );
			return { ok: false, error: e.message };

		} finally {

			applying = false;

		}

	}

	function syncClosed() {

		if ( dirty ) return;

		try {

			const result = generateThreeCode( editor );
			sceneText = result.code;
			if ( target.kind === 'scene' ) setCode( result.code );
			ranges = result.ranges;
			ensureSceneScript( result.code );

		} catch ( e ) {

			console.warn( 'CodePanel: scene script sync failed', e );

		}

	}

	function schedule() {

		if ( applying || suppressSceneSync ) return;
		clearTimeout( timer );
		timer = setTimeout( () => {

			timer = 0;
			if ( isOpen() ) regenerate( false );
			else syncClosed();

		}, isOpen() ? 250 : 600 );

	}

	for ( const s of [ 'objectAdded', 'objectChanged', 'objectRemoved', 'geometryChanged', 'materialChanged', 'sceneGraphChanged', 'sceneFogChanged', 'sceneFogSettingsChanged', 'sceneBackgroundChanged', 'sceneEnvironmentChanged', 'cameraChanged', 'cameraResetted', 'viewportCameraChanged', 'refreshSidebarObject3D', 'editorCleared' ] ) {

		signals[ s ].add( schedule );

	}

	for ( const signal of [ signals.scriptAdded, signals.scriptChanged, signals.scriptRemoved ] ) {

		signal.add( script => { if ( script.cameraController ) schedule(); } );

	}

	signals.objectSelected.add( ( object ) => {

		follow( object );
		if ( isOpen() ) refreshHead();

	} );

	function open( { followSelection = true } = {} ) {

		if ( isOpen() ) return;
		editor.workspaceArea?.reveal( editor.editWorkspace.dock );
		editor.editWorkspace.mount( 'script', null, dom, () => {

			clearTimeout( applyTimer );
			flushTarget();

		} );
		if ( followSelection ) {

			if ( ! dirty ) regenerate( false );
			follow( editor.selected );

		}
		cm?.refresh();
		scheduleAutoApply();

	}

	function close() {

		if ( isOpen() ) editor.editWorkspace.close();

	}

	function flushTarget( retry = false ) {

		if ( ! saveTimer && ! ( retry && targetDirty ) ) return;
		clearTimeout( saveTimer );
		saveTimer = 0;
		if ( target.kind === 'script' && ! editor.scripts[ target.object.uuid ]?.includes( target.script ) ) return;
		if ( target.kind !== 'scene' ) saveTarget();

	}

	function toggleScript( object, script ) {

		const sameTarget = ( pinned || editor.selected === object ) && ( script.generated ? target.kind === 'scene' :
			target.kind === 'script' && target.object === object && target.script === script );
		if ( sameTarget ) {

			if ( isOpen() ) close();
			else open( { followSelection: false } );
			return;

		}
		editor.select( object );
		signals.editScript.dispatch( object, script );

	}

	signals.editScript.add( ( object, script, materialSlot ) => {

		open( { followSelection: false } );
		if ( typeof script === 'object' ) {

			if ( script.generated ) showScene( object );
			else if ( target.script !== script || target.object !== object ) showScript( object, script );

		} else {

			showShader( object, script, materialSlot );

		}

	} );

	signals.objectRemoved.add( object => {

		if ( target.object && object.getObjectById( target.object.id ) ) showScene( null );

	} );

	signals.scriptRemoved.add( ( script ) => {

		if ( target.script === script ) follow( editor.selected, true );

	} );

	function resetDocuments() {

		clearTimeout( saveTimer );
		clearTimeout( applyTimer );
		saveTimer = 0;
		projectRevision ++;
		assetsReady = Promise.resolve( new Map() );
		for ( const url of urls.values() ) URL.revokeObjectURL( url );
		urls.clear();
		store.clear();
		dirty = targetDirty = pinned = false;
		pin.setAttribute( 'aria-pressed', 'false' );
		sceneText = '';
		sceneView = undefined;
		documents = new WeakMap();
		target = { kind: 'scene' };
		clearErrors();
		setMode( 'javascript' );
		setCode( '' );
		restoreView();
		scheduleLint();
		schedule();

	}
	signals.editorCleared.add( resetDocuments );
	signals.projectLoaded.add( resetDocuments );

	function syncActiveSource() {

		if ( ! isOpen() || targetDirty || target.kind === 'scene' ) return;
		const source = readTargetSource( target );
		if ( source === getCode() ) return;
		const view = captureView();
		clearErrors();
		setCode( source );
		restoreView( view );
		setStatus( 'Source updated.' );
		scheduleLint();

	}
	signals.scriptChanged.add( ( script, attribute ) => {

		if ( target.kind === 'script' && target.script === script && attribute === 'source' ) syncActiveSource();

	} );
	signals.materialChanged.add( () => {

		if ( ! target.material ) return;
		if ( editor.getObjectMaterial( target.object, target.slot ) === target.material ) syncActiveSource();
		else showScene( null );

	} );

	for ( const s of [ 'objectChanged', 'scriptChanged', 'materialChanged' ] ) signals[ s ].add( () => { if ( isOpen() ) refreshHead(); } );

	setTimeout( syncClosed, 0 );

	const getPublishInputs = async () => {

		const generated = generateThreeCode( editor );
		const current = sceneCode();
		const code = ! current.trim() || ( ! dirty && timer ) ? generated.code : current;
		if ( code === generated.code && generated.assetIssues.length ) throw new Error( generated.assetIssues.join( '\n' ) );

		const files = [ ...( editor.sourceFiles || [] ) ];
		const cached = new Map( store );
		const blobs = await assetsToBlobs( generated.assets, cached );
		if ( dirty ) for ( const [ path, blob ] of cached ) if ( ! blobs.has( path ) ) blobs.set( path, blob );
		for ( const [ path, { file } ] of files ) {

			if ( ! blobs.has( 'assets/' + path ) ) blobs.set( 'assets/' + path, file );

		}

		return { code, blobs };

	};

	async function applySceneSource( source ) {

		showScene( editor.selected );
		setCode( source );
		sceneText = source;
		dirty = true;
		return apply();

	}

	return { dom, open, close, getPublishInputs, toggleScript, apply, applySceneSource, regenerate, isOpen, getSceneSource: sceneCode };

}

export { CodePanel };
