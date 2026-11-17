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
		await page.getByLabel( '2D Editors', { exact: true } ).click();
		await page.getByRole( 'button', { name: 'Image and vector mode' } ).click();
		await page.getByRole( 'button', { name: 'Draw rectangle' } ).click();
		const drawing = await page.getByLabel( 'Vector drawing canvas' ).boundingBox();
		const start = [ drawing.x + drawing.width * .4, drawing.y + drawing.height * .4 ];
		const end = [ drawing.x + drawing.width * .6, drawing.y + drawing.height * .6 ];
		await page.mouse.move( ...start );
		await page.mouse.down();
		await page.mouse.move( ...end, { steps: 5 } );
		await page.mouse.up();
		await page.getByRole( 'button', { name: 'Create scene curve' } ).click();
		await page.getByRole( 'button', { name: 'Apply drawing' } ).click();
		const contour = await page.evaluate( () => {

			const curve = editor.scene.getObjectByName( 'Contour 1' );
			const drawing = editor.scene.userData.vectorDrawing.shapes[ 0 ];
			return { actual: curve.geometry.userData.modeling.points, expected: drawing.points.map( ( [ u, v ] ) => [ 2 * u - 1, 1 - 2 * v, 0 ] ) };

		} );
		assert.deepEqual( contour.actual, contour.expected );
		await page.getByLabel( 'Image & Vector', { exact: true } ).click();
		await page.getByRole( 'button', { name: '3D View', exact: true } ).click();
		await page.evaluate( () => {

			const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshStandardMaterial() );
			mesh.name = 'Receiver';
			editor.addObject( mesh );
			editor.select( mesh );

		} );
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
		await page.keyboard.press( '1' );
		assert.equal( await page.evaluate( () => editor.modeling.selectionMode ), 'vertex' );
		await page.getByRole( 'button', { name: 'Box select (B)', exact: true } ).focus();
		await page.keyboard.press( 'a' );
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
		const mode = page.getByRole( 'combobox', { name: 'Interaction mode', exact: true } );
		await mode.selectOption( 'paint' );
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
			if ( cm ) cm.setValue( source );
			else {

				const input = document.querySelector( '#code-text' );
				input.value = source;
				input.dispatchEvent( new Event( 'input' ) );

			}

		}, source );
		const tilt = page.locator( '.script-component' ).getByLabel( 'tilt', { exact: true } );
		await tilt.fill( '0.5' );
		await tilt.press( 'Enter' );
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
