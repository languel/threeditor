// Start the editor server, then run with Playwright installed locally or on NODE_PATH.
// EDITOR_URL and CHROME_CHANNEL can override the local development defaults.
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs/promises' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { execFileSync } = require( 'node:child_process' );
const { chromium } = require( 'playwright' );

async function check() {

	const browser = await chromium.launch( { channel: process.env.CHROME_CHANNEL || 'chrome', args: [ '--enable-unsafe-swiftshader' ] } );
	const folder = await fs.mkdtemp( path.join( os.tmpdir(), 'threeditor-workspace-' ) );
	try {

		const page = await browser.newPage( { viewport: { width: 1440, height: 900 } } );
		const errors = [];
		page.on( 'pageerror', error => errors.push( error.message ) );
		await page.goto( process.env.EDITOR_URL || 'http://127.0.0.1:5300/editor/' );
		await page.waitForFunction( async () => window.editor?.renderer && await editor.startupReady.then( () => true ) );
		const workspaces = page.getByRole( 'navigation', { name: 'Workspaces' } );
		const layoutWorkspace = workspaces.getByRole( 'button', { name: 'Layout', exact: true } );
		assert.equal( await layoutWorkspace.getAttribute( 'aria-pressed' ), 'true' );
		await workspaces.getByRole( 'button', { name: 'UV Editing', exact: true } ).click();
		await page.getByText( 'Select an editable mesh to view its UVs.', { exact: true } ).waitFor();
		await layoutWorkspace.click();
		assert.equal( await page.locator( '#editor-2d' ).isVisible(), false );
		await page.getByLabel( '2D Editors', { exact: true } ).click();
		await page.getByRole( 'button', { name: 'Image and vector mode' } ).click();
		const twoD = page.locator( '#editor-2d' );
		const liveViewport = page.locator( '#viewport' );
		const splitDivider = page.getByRole( 'separator', { name: 'Resize 2D and 3D areas' } );
		assert.equal( await splitDivider.isVisible(), true );
		const originalEditorWidth = ( await twoD.boundingBox() ).width;
		await splitDivider.press( 'ArrowRight' );
		assert.ok( ( await twoD.boundingBox() ).width > originalEditorWidth );
		assert.equal( await liveViewport.isVisible(), true );
		await page.getByRole( 'button', { name: 'Draw rectangle' } ).click();
		const drawing = await page.getByLabel( 'Vector drawing canvas' ).boundingBox();
		const start = [ drawing.x + drawing.width * .4, drawing.y + drawing.height * .4 ];
		const end = [ drawing.x + drawing.width * .6, drawing.y + drawing.height * .6 ];
		await page.mouse.move( ...start );
		await page.mouse.down();
		await page.mouse.move( ...end, { steps: 5 } );
		await page.mouse.up();
		await page.mouse.dblclick( ( start[ 0 ] + end[ 0 ] ) / 2, start[ 1 ] );
		await page.getByRole( 'button', { name: 'Create scene curve' } ).click();
		await page.getByRole( 'button', { name: 'Apply drawing' } ).click();
		const contour = await page.evaluate( () => {

			const curve = editor.scene.getObjectByName( 'Contour 1' );
			const drawing = editor.scene.userData.vectorDrawing.shapes[ 0 ];
			return { actual: curve.geometry.userData.modeling.points, expected: drawing.points.map( ( [ u, v ] ) => [ 2 * u - 1, 1 - 2 * v, 0 ] ) };

		} );
		assert.deepEqual( contour.actual, contour.expected );
		assert.equal( contour.actual.length, 5 );
		await page.getByRole( 'group', { name: 'Workspace controls' } ).getByLabel( 'Image & Vector', { exact: true } ).click();
		await page.getByRole( 'button', { name: '3D View', exact: true } ).click();
		await page.locator( '#viewport' ).hover();
		const edgePoint = await page.evaluate( () => {

			const path = editor.scene.getObjectByName( 'Contour 1' );
			editor.select( path );
			editor.viewTools.setWorkspaceMode( 'edit' );
			editor.camera.position.set( 0, 0, 3 );
			editor.camera.up.set( 0, 1, 0 );
			editor.camera.lookAt( 0, 0, 0 );
			editor.signals.cameraChanged.dispatch( editor.camera );
			const model = editor.modeling;
			const { width, height, left, top } = model.rect();
			const last = model.data.points.length - 1;
			const a = model.project( model.data.points[ last ], width, height );
			const b = model.project( model.data.points[ 0 ], width, height );
			return [ left + ( a[ 0 ] + b[ 0 ] ) / 2, top + ( a[ 1 ] + b[ 1 ] ) / 2 ];

		} );
		await page.mouse.dblclick( ...edgePoint );
		const outlinePoints = () => page.evaluate( () => editor.modeling.data.points.length );
		assert.equal( await outlinePoints(), 6 );
		await page.evaluate( () => editor.undo() );
		assert.equal( await outlinePoints(), 5 );
		await page.evaluate( () => editor.redo() );
		assert.equal( await outlinePoints(), 6 );
		await page.keyboard.press( 'F3' );
		const contourPalette = page.getByRole( 'dialog', { name: 'Command palette' } );
		await contourPalette.getByRole( 'searchbox' ).fill( 'Toggle outline smoothing' );
		await page.keyboard.press( 'Enter' );
		const onCurve = await page.evaluate( () => {

			const model = editor.modeling;
			const curve = new THREE.CatmullRomCurve3( model.data.points.map( point => new THREE.Vector3( ...point ) ), true );
			const { left, top, width, height } = model.rect();
			const [ x, y ] = model.project( curve.getPoint( 0.24 ).toArray(), width, height );
			return [ left + x, top + y ];

		} );
		assert.equal( await page.evaluate( () => editor.modeling.data.smooth ), true );
		await page.mouse.dblclick( ...onCurve );
		assert.equal( await outlinePoints(), 7 );
		await page.evaluate( () => editor.viewTools.setWorkspaceMode( 'object' ) );
		await page.evaluate( () => {

			const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshStandardMaterial() );
			mesh.name = 'Receiver';
			editor.addObject( mesh );
			editor.select( mesh );

		} );
		const properties = page.getByRole( 'tablist', { name: 'Property categories' } );
		assert.equal( await properties.getByRole( 'tab', { name: 'Object', exact: true } ).getAttribute( 'aria-selected' ), 'true' );
		assert.equal( await page.getByRole( 'tabpanel', { name: 'Scene', exact: true } ).count(), 0 );
		await properties.getByRole( 'tab', { name: 'Scene', exact: true } ).click();
		assert.equal( await page.getByRole( 'tabpanel', { name: 'Scene', exact: true } ).getByText( 'Bloom', { exact: true } ).isVisible(), true );
		await properties.getByRole( 'tab', { name: 'Object', exact: true } ).click();
		const outlinerSearch = page.getByRole( 'searchbox', { name: 'Search Outliner' } );
		const outliner = page.getByRole( 'region', { name: 'Outliner', exact: true } );
		await outlinerSearch.fill( 'Receiver' );
		assert.equal( await outliner.getByText( 'Receiver', { exact: true } ).count(), 1 );
		assert.equal( await outliner.getByText( 'Contour 1', { exact: true } ).count(), 0 );
		await outlinerSearch.fill( '' );
		assert.equal( await outliner.getByText( 'Contour 1', { exact: true } ).count(), 1 );
		const divider = page.getByRole( 'separator', { name: 'Resize Outliner' } );
		const oldHeight = ( await outliner.boundingBox() ).height;
		await divider.press( 'ArrowDown' );
		assert.ok( ( await outliner.boundingBox() ).height > oldHeight );
		await page.locator( '#viewport' ).click( { position: { x: 240, y: 115 } } );
		await page.evaluate( () => editor.select( editor.scene.getObjectByName( 'Receiver' ) ) );
		await page.getByLabel( '2D Editors', { exact: true } ).click();
		await page.getByRole( 'button', { name: 'UV mode', exact: true } ).click();
		await page.getByRole( 'region', { name: 'UV editor', exact: true } ).waitFor();
		assert.equal( await twoD.locator( '.editor-2d-target' ).textContent(), 'Receiver' );
		await page.evaluate( () => {

			const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshStandardMaterial() );
			mesh.name = 'Second UV receiver';
			editor.addObject( mesh );
			editor.select( mesh );

		} );
		assert.equal( await twoD.locator( '.editor-2d-target' ).textContent(), 'Second UV receiver' );
		await twoD.getByRole( 'button', { name: 'Auto layout' } ).click();
		await page.evaluate( () => editor.select( editor.scene.getObjectByName( 'Receiver' ) ) );
		assert.equal( await twoD.locator( '.editor-2d-target' ).textContent(), 'Second UV receiver' );
		await liveViewport.hover();
		await page.evaluate( () => document.activeElement.blur() );
		await page.keyboard.press( 'Tab' );
		assert.equal( await page.evaluate( () => editor.viewTools.workspaceMode ), 'edit' );
		assert.equal( await splitDivider.isVisible(), true );
		await page.keyboard.press( 'Tab' );
		await twoD.getByRole( 'button', { name: 'Show 3D view alongside' } ).click();
		assert.equal( await liveViewport.isVisible(), false );
		await twoD.getByRole( 'button', { name: 'Show 3D view alongside' } ).click();
		await twoD.getByRole( 'button', { name: 'Close editor area' } ).click();
		await page.evaluate( () => editor.removeObject( editor.scene.getObjectByName( 'Second UV receiver' ) ) );
		await liveViewport.hover();
		await page.keyboard.press( 'z' );
		await page.getByRole( 'dialog', { name: 'Viewport shading' } ).getByRole( 'button', { name: 'Wireframe' } ).click();
		assert.equal( await page.evaluate( () => editor.viewportShading ), 'wireframe' );
		await page.keyboard.press( 'Shift+z' );
		await page.keyboard.press( 'Control+Tab' );
		const modePie = page.getByRole( 'dialog', { name: 'Interaction mode', exact: true } );
		await modePie.getByRole( 'button', { name: 'Edit Mode', exact: true } ).click();
		assert.equal( await page.getByRole( 'combobox', { name: 'Interaction mode', exact: true } ).inputValue(), 'edit' );
		await page.keyboard.press( 'F3' );
		const palette = page.getByRole( 'dialog', { name: 'Command palette' } );
		await palette.getByRole( 'searchbox' ).fill( 'Box select' );
		await page.keyboard.press( 'ArrowDown' );
		await page.keyboard.press( 'Enter' );
		assert.equal( await page.evaluate( () => editor.modeling.selectionTool ), 'box' );
		const shelf = page.getByRole( 'group', { name: 'Tool shelf', exact: true } );
		const mode = page.getByRole( 'combobox', { name: 'Interaction mode', exact: true } );
		assert.deepEqual( await mode.locator( 'option' ).allTextContents(), [ 'Object Mode', 'Edit Mode', 'Sculpt Mode', 'Paint Mode' ] );
		await mode.selectOption( 'sculpt' );
		await shelf.getByRole( 'button', { name: 'Smooth', exact: true } ).click();
		assert.equal( await shelf.getByRole( 'button', { name: 'Smooth', exact: true } ).getAttribute( 'aria-pressed' ), 'true' );
		assert.equal( await shelf.getByRole( 'button', { name: 'Draw path', exact: true } ).count(), 0 );
		assert.equal( await shelf.getByRole( 'button', { pressed: true } ).count(), 1 );
		await mode.selectOption( 'object' );
		assert.equal( await shelf.getByRole( 'button', { name: 'Smooth', exact: true } ).count(), 0 );
		await mode.selectOption( 'sculpt' );
		assert.equal( await page.evaluate( () => editor.modeling.brush ), 'smooth' );
		await mode.selectOption( 'edit' );
		assert.equal( await shelf.getByRole( 'button', { name: 'Box select (B)', exact: true } ).getAttribute( 'aria-pressed' ), 'true' );
		await page.locator( '#viewport' ).hover();
		await page.keyboard.press( 't' );
		assert.equal( await shelf.isVisible(), false );
		assert.equal( await page.locator( '#toolbar' ).isVisible(), true );
		await page.keyboard.press( 't' );
		assert.equal( await shelf.isVisible(), true );
		await page.keyboard.press( '1' );
		assert.equal( await page.evaluate( () => editor.modeling.selectionMode ), 'vertex' );
		await page.getByRole( 'button', { name: 'Box select (B)', exact: true } ).focus();
		await page.keyboard.press( 'a' );
		const elements = await page.evaluate( () => editor.modeling.indices.length );
		assert.ok( elements > 0 );
		await page.locator( '#outliner' ).hover();
		await page.keyboard.press( 'Delete' );
		await page.keyboard.press( 'Escape' );
		await page.keyboard.press( '2' );
		assert.deepEqual( await page.evaluate( () => [ editor.modeling.indices.length, editor.modeling.selectionMode ] ), [ elements, 'vertex' ] );
		await page.keyboard.press( 'F3' );
		await palette.getByRole( 'searchbox' ).fill( 'Box select' );
		assert.equal( await palette.getByRole( 'button', { name: /Box select/ } ).count(), 0 );
		await page.keyboard.press( 'Escape' );
		await page.locator( '#viewport' ).hover();
		await page.keyboard.press( 'g' );
		await page.waitForFunction( () => editor.modeling.gesture?.modal );
		await page.keyboard.press( 'x' );
		await page.keyboard.press( '0' );
		await page.keyboard.press( '.' );
		await page.keyboard.press( '2' );
		await page.waitForFunction( () => editor.modeling.gesture?.numeric === '0.2' );
		await page.keyboard.press( 'Enter' );
		await page.waitForFunction( () => ! editor.modeling.gesture );
		const edited = await page.evaluate( () => Array.from( editor.selected.geometry.attributes.position.array ) );
		assert.ok( Math.max( ...edited ) > .65, 'Edit-mode transform changed mesh coordinates' );
		await page.evaluate( () => document.activeElement.blur() );
		await page.keyboard.press( 'Tab' );
		await mode.selectOption( 'paint' );
		assert.equal( await shelf.getByRole( 'button', { name: 'Surface paint brush', exact: true, pressed: true } ).count(), 1 );
		assert.equal( await page.evaluate( () => editor.viewportShading ), 'materials' );
		const center = await page.evaluate( () => {

			const screen = editor.renderer.domElement.getBoundingClientRect();
			const p = new THREE.Vector3( .2, 0, 0 ).project( editor.camera );
			return [ screen.left + ( 1 + p.x ) * screen.width / 2, screen.top + ( 1 - p.y ) * screen.height / 2 ];

		} );
		for ( const [ index, medium ] of [ 'texture', 'vector', 'splat' ].entries() ) {

			await page.getByLabel( 'Brush output' ).selectOption( medium );
			const [ x, y ] = center;
			await page.mouse.move( x - 12, y + index * 4 );
			await page.mouse.down();
			await page.mouse.move( x + 12, y + index * 4, { steps: 8 } );
			await page.mouse.up();

		}
		await mode.selectOption( 'object' );
		await page.evaluate( () => editor.select( editor.scene.getObjectByName( 'Receiver' ) ) );
		await page.locator( '.Tab#scriptTab' ).click();
		await page.getByText( 'Add Script', { exact: true } ).click();
		const source = [
			'// @param tilt = 0.25',
			'function update() {',
			' this.rotation.z = params.tilt;',
			' const splats = this.getObjectByName("SplatMesh");',
			' if (splats?.isInitialized) window.workspaceCheck = { tilt: this.rotation.z, x: this.position.x,',
			'   splats: splats.numSplats, texture: this.material.map?.image?.width,',
			'   points: this.getObjectByName("Surface path")?.geometry.userData.modeling.points.length };',
			'}'
		].join( '\n' );
		await page.evaluate( source => {

			const cm = document.querySelector( '#code-panel .CodeMirror' )?.CodeMirror;
			if ( cm ) {

				cm.setValue( source );
				cm.setCursor( cm.lastLine(), 1 );
				cm.focus();

			}
			else {

				const input = document.querySelector( '#code-text' );
				input.value = source;
				input.dispatchEvent( new Event( 'input' ) );
				input.focus();
				input.setSelectionRange( source.length, source.length );

			}

		}, source );
		await page.locator( '#viewport' ).hover();
		await page.keyboard.press( 'Enter' );
		await page.keyboard.type( '// g1' );
		await page.keyboard.press( 'Backspace' );
		const typed = await page.evaluate( () => document.querySelector( '#code-panel .CodeMirror' )?.CodeMirror.getValue() ?? document.querySelector( '#code-text' ).value );
		assert.equal( typed, source + '\n// g' );
		assert.equal( await page.evaluate( () => editor.selected?.name ), 'Receiver' );
		const tilt = page.locator( '.script-component' ).getByLabel( 'tilt', { exact: true } );
		await tilt.fill( '0.5' );
		await tilt.press( 'Enter' );
		const animationWorkspace = workspaces.getByRole( 'button', { name: 'Animation', exact: true } );
		await animationWorkspace.click();
		assert.equal( await animationWorkspace.getAttribute( 'aria-pressed' ), 'true' );
		assert.ok( ( await page.locator( '#animation' ).boundingBox() ).height > 180 );
		const keyPosition = x => page.evaluate( x => {

			const mesh = editor.scene.getObjectByName( 'Receiver' );
			mesh.position.x = x;
			mesh.updateMatrixWorld();
			editor.timeline.insertKey( { kind: 'object', object: mesh.uuid, property: 'position' } );

		}, x );
		await keyPosition( 0 );
		const frame = page.getByLabel( 'Frame', { exact: true } );
		await frame.fill( '30' );
		await frame.press( 'Enter' );
		await keyPosition( 1 );
		await page.evaluate( () => document.activeElement.blur() );
		const keyCount = () => page.evaluate( () => editor.scene.userData.timeline.clips[ 0 ].tracks[ 0 ].keys.length );
		await page.getByRole( 'button', { name: 'Keyframe 30', exact: true } ).click();
		await page.keyboard.press( 'Escape' );
		await page.keyboard.press( 'Delete' );
		assert.equal( await keyCount(), 2 );
		assert.equal( await page.evaluate( () => editor.selected?.name ), 'Receiver' );
		await page.locator( '.scene-timeline-clip' ).first().click();
		await page.getByRole( 'button', { name: 'Keyframe 30', exact: true } ).click();
		await page.keyboard.press( 'Delete' );
		assert.equal( await keyCount(), 1 );
		await page.evaluate( () => editor.undo() );
		assert.equal( await keyCount(), 2 );
		await page.evaluate( async () => {

			editor.animationCommands.animationStop();
			const save = JSON.stringify( editor.toJSON() );
			editor.clear();
			await editor.fromJSON( JSON.parse( save ) );

		} );
		const actual = await page.evaluate( () => Array.from( editor.scene.getObjectByName( 'Receiver' ).geometry.attributes.position.array ) );
		assert.deepEqual( actual, edited );
		const [ download ] = await Promise.all( [ page.waitForEvent( 'download' ), page.evaluate( async () => {

			const { exportPlayableScene } = await import( new URL( 'js/Publish.js', document.baseURI ).href );
			const { zip } = await exportPlayableScene( editor );
			const a = document.createElement( 'a' );
			a.href = URL.createObjectURL( zip );
			a.download = 'workspace.zip';
			a.click();

		} ) ] );
		const archive = path.join( folder, 'workspace.zip' );
		await download.saveAs( archive );
		execFileSync( 'unzip', [ '-q', archive, '-d', folder ] );
		const published = await browser.newPage();
		published.on( 'pageerror', error => errors.push( error.message ) );
		await published.route( 'http://workspace.test/**', async route => {

			const resource = decodeURIComponent( new URL( route.request().url() ).pathname.slice( 1 ) ) || 'index.html';
			await route.fulfill( { path: path.join( folder, resource ) } );

		} );
		await published.goto( 'http://workspace.test/' );
		await published.waitForFunction( () => window.workspaceCheck?.x > .05 );
		const result = await published.evaluate( () => window.workspaceCheck );
		assert.equal( result.tilt, .5 );
		assert.ok( result.splats > 0 && result.points >= 2 && result.texture === 1024 );
		assert.deepEqual( errors, [] );
		console.log( 'Published workspace passed', result );

	} finally {

		await browser.close();
		await fs.rm( folder, { recursive: true, force: true } );

	}

}
check().catch( error => { console.error( error ); process.exitCode = 1; } );
