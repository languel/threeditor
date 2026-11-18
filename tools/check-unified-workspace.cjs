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
		await checkLocalVisibility( page );
		await checkObjectSelection( page );
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

async function checkObjectSelection( page ) {

	const points = await page.evaluate( () => {

		const group = new THREE.Group();
		group.name = 'Selection group';
		group.position.x = - 1;
		const box = new THREE.Mesh( new THREE.BoxGeometry( .25, .25, .25 ), new THREE.MeshBasicMaterial() );
		box.name = 'Child box';
		group.add( box );
		editor.addObject( group );
		const reference = box.clone();
		reference.name = 'Reference box';
		reference.userData.threeditor = { unselectable: true, locked: true };
		editor.addObject( reference, group );
		const right = box.clone();
		right.name = 'Right box';
		right.position.x = 1;
		editor.addObject( right );
		editor.camera.position.set( 0, 0, 5 );
		editor.camera.lookAt( 0, 0, 0 );
		editor.signals.cameraChanged.dispatch( editor.camera );

		const frame = editor.viewLayout.frames[ 0 ];
		const rect = editor.viewLayout.clientRect( frame );
		return [ group, right ].map( object => {

			const p = object.getWorldPosition( new THREE.Vector3() ).project( frame.camera );
			return [ rect.left + ( p.x + 1 ) * rect.width / 2, rect.top + ( 1 - p.y ) * rect.height / 2 ];

		} );

	} );
	const selected = () => page.evaluate( () => editor.selector.selection.map( object => object.name ) );
	const dragBox = async ( [ x, y ] ) => {

		await page.mouse.move( x - 35, y - 35 );
		await page.mouse.down();
		await page.mouse.move( x + 35, y + 35, { steps: 5 } );
		await page.mouse.up();

	};
	await page.mouse.move( ...points[ 0 ] );
	await page.keyboard.press( 'b' );
	await dragBox( points[ 0 ] );
	assert.deepEqual( await selected(), [ 'Selection group', 'Child box' ] );
	await page.keyboard.down( 'Control' );
	await dragBox( points[ 0 ] );
	await page.keyboard.up( 'Control' );
	assert.deepEqual( await selected(), [] );
	await page.keyboard.press( 'c' );
	await page.mouse.click( ...points[ 1 ] );
	assert.deepEqual( await selected(), [ 'Right box' ] );
	const shelf = page.getByRole( 'group', { name: 'Tool shelf' } );
	await shelf.getByRole( 'button', { name: 'Lasso select', exact: true } ).click();
	const [ x, y ] = points[ 0 ];
	await page.mouse.move( x - 35, y - 35 );
	await page.mouse.down();
	await page.mouse.move( x + 35, y - 35 );
	await page.mouse.move( x + 35, y + 35 );
	await page.mouse.move( x - 35, y + 35 );
	await page.mouse.up();
	assert.deepEqual( await selected(), [ 'Selection group', 'Child box' ] );
	await page.keyboard.press( 'b' );
	await page.mouse.move( points[ 1 ][ 0 ] - 35, points[ 1 ][ 1 ] - 35 );
	await page.mouse.down();
	await page.mouse.move( points[ 1 ][ 0 ] + 35, points[ 1 ][ 1 ] + 35 );
	await page.keyboard.press( 'Escape' );
	await page.mouse.up();
	assert.deepEqual( await selected(), [ 'Selection group', 'Child box' ] );
	await page.keyboard.press( 'x' );
	assert.deepEqual( await selected(), [] );
	await page.evaluate( () => editor.undo() );
	assert.equal( await page.evaluate( () => editor.scene.getObjectByName( 'Child box' ).parent.name ), 'Selection group' );
	const rightPanePoint = await page.evaluate( () => {

		editor.setViewportSplit( true, 'vertical' );
		const frame = editor.viewLayout.frames.at( -1 );
		const rect = editor.viewLayout.clientRect( frame );
		const point = editor.scene.getObjectByName( 'Right box' ).getWorldPosition( new THREE.Vector3() ).project( frame.camera );
		return [ rect.left + ( point.x + 1 ) * rect.width / 2, rect.top + ( 1 - point.y ) * rect.height / 2 ];

	} );
	await dragBox( rightPanePoint );
	assert.deepEqual( await selected(), [ 'Right box' ] );
	await page.evaluate( () => {

		editor.setViewportSplit( false );
		editor.clear();

	} );
	await shelf.getByRole( 'button', { name: 'Select & navigate', exact: true } ).click();

}

async function checkLocalVisibility( page ) {

	await page.evaluate( () => {

		const parent = new THREE.Mesh( new THREE.BoxGeometry( 2, 2, .3 ), new THREE.MeshBasicMaterial() );
		parent.name = 'Local View parent';
		const child = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshBasicMaterial() );
		child.name = 'Local View child';
		child.position.z = .8;
		parent.add( child );
		editor.addObject( parent );
		editor.camera.position.set( 0, 0, 5 );
		editor.camera.lookAt( 0, 0, 0 );
		const camera = new THREE.PerspectiveCamera();
		camera.position.copy( editor.camera.position );
		camera.quaternion.copy( editor.camera.quaternion );
		editor.addObject( camera );
		editor.setViewportCamera( camera.uuid );
		editor.setViewportSplit( true, 'vertical' );
		editor.select( child );

	} );
	await page.locator( '#viewport' ).hover();
	await page.keyboard.press( 'F3' );
	await page.getByRole( 'searchbox', { name: 'Search Command palette' } ).fill( 'Toggle Local View' );
	await page.keyboard.press( 'Enter' );
	const state = await page.evaluate( () => {

		const parent = editor.scene.getObjectByName( 'Local View parent' );
		const child = parent.children[ 0 ];
		const frames = editor.viewLayout.frames;
		const renderCameras = new Set();
		parent.onBeforeRender = ( renderer, scene, camera ) => { renderCameras.add( camera.uuid ); };
		editor.signals.cameraChanged.dispatch( editor.camera );
		const scene = editor.toJSON().scene.object;
		return {
			directorPicks: editor.selector.getPointerIntersects( { x: .5, y: .5 }, frames[ 0 ].camera ).map( hit => hit.object.name ),
			directorRendersParent: renderCameras.has( frames[ 0 ].camera.uuid ),
			cameraRendersParent: renderCameras.has( frames[ 1 ].camera.uuid ),
			authoringVisible: parent.visible && child.visible && scene.children.find( object => object.name === parent.name ).visible !== false
		};

	} );
	assert.ok( state.directorPicks.includes( 'Local View child' ) );
	assert.ok( ! state.directorPicks.includes( 'Local View parent' ) );
	assert.equal( state.directorRendersParent, false );
	assert.equal( state.cameraRendersParent, true );
	assert.equal( state.authoringVisible, true );
	await page.getByRole( 'button', { name: 'Exit Local View', exact: true } ).click();
	await page.locator( '#viewport' ).hover();
	await page.keyboard.press( 'h' );
	assert.equal( await page.evaluate( () => editor.objectSelection.candidates().some( object => object.name === 'Local View child' ) ), false );
	await page.keyboard.press( 'Alt+h' );
	assert.equal( await page.evaluate( () => editor.objectSelection.candidates().some( object => object.name === 'Local View child' ) ), true );
	await page.evaluate( () => editor.select( editor.scene.getObjectByName( 'Local View child' ) ) );
	await page.keyboard.press( 'Shift+h' );
	assert.deepEqual( await page.evaluate( () => editor.objectSelection.candidates().map( object => object.name ) ), [ 'Local View child' ] );
	await page.getByRole( 'button', { name: 'Reveal temporarily hidden objects', exact: true } ).click();
	assert.equal( await page.evaluate( () => editor.viewportVisibility.active ), false );
	await page.evaluate( () => {

		editor.setViewportCamera( editor.camera.uuid );
		editor.setViewportSplit( false );
		editor.clear();

	} );

}
check().catch( error => { console.error( error ); process.exitCode = 1; } );
