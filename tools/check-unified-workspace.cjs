// Start the editor server, then run with Playwright installed locally or on NODE_PATH.
// EDITOR_URL and CHROME_CHANNEL can override the local development defaults.
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs/promises' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { execFileSync } = require( 'node:child_process' );
const { chromium } = require( 'playwright' );

async function checkTextureProjection( page ) {

	const tip = await page.evaluate( () => {

		const receiver = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2, 100, 100 ), new THREE.MeshBasicMaterial() );
		receiver.name = 'Texture projection test';
		editor.addObject( receiver );
		const blocker = new THREE.Mesh( new THREE.PlaneGeometry( 1, 2 ), new THREE.MeshBasicMaterial() );
		blocker.position.set( .5, 0, 1 );
		blocker.userData.threeditor = { locked: true };
		editor.addObject( blocker );
		const scan = new THREE.Points(
			new THREE.BufferGeometry().setAttribute( 'position', new THREE.Float32BufferAttribute( [ 0, 0, -1 ], 3 ) ),
			new THREE.PointsMaterial( { size: 12, sizeAttenuation: false } )
		);
		editor.addObject( scan );
		editor.select( receiver );
		editor.camera.position.set( 0, 0, 5 );
		editor.camera.lookAt( 0, 0, 0 );
		editor.camera.updateMatrixWorld();
		editor.signals.cameraChanged.dispatch( editor.camera );
		const bounds = editor.renderer.domElement.getBoundingClientRect();
		return [ bounds.left + bounds.width / 2, bounds.top + bounds.height / 2 ];

	} );
	await page.getByLabel( 'Interaction mode', { exact: true } ).selectOption( 'paint' );
	await page.getByLabel( 'Brush output' ).selectOption( 'texture' );
	const width = page.getByLabel( 'Brush (px)' );
	await width.fill( '60' );
	await width.press( 'Tab' );
	await page.mouse.click( ...tip );
	const coverage = await page.evaluate( () => {

		const receiver = editor.scene.getObjectByName( 'Texture projection test' );
		const { image } = receiver.material.map;
		const { width, height } = image;
		const data = image.getContext( '2d' ).getImageData( 0, 0, width, height ).data;
		const viewport = editor.renderer.domElement.getBoundingClientRect();
		const interior = 22 * 5 * Math.tan( THREE.MathUtils.degToRad( editor.camera.fov / 2 ) ) / viewport.height * width;
		let visible = 0, painted = 0, hidden = 0;
		for ( let y = 0; y < height; y ++ ) for ( let x = 0; x < width; x ++ ) {

			if ( Math.hypot( x + .5 - width / 2, y + .5 - height / 2 ) >= interior ) continue;
			const marked = data[ ( y * width + x ) * 4 ] < 225;
			if ( x < width / 2 - 4 ) { visible ++; if ( marked ) painted ++; }
			if ( x > width / 2 + 4 && marked ) hidden ++;

		}
		editor.undo();
		return { visible, painted, hidden, undone: ! receiver.material.map };

	} );
	assert.ok( coverage.painted / coverage.visible > .98, 'Dense meshes should receive a solid brush print' );
	assert.equal( coverage.hidden, 0, 'The foreground mesh should occlude the brush' );
	assert.equal( coverage.undone, true );
	await width.fill( '14' );
	await width.press( 'Tab' );
	await page.evaluate( () => editor.clear() );

}

async function checkSelectionShelf( page ) {

	const shelf = page.getByRole( 'group', { name: 'Viewport Toolbar', exact: true } );
	const transforms = shelf.getByRole( 'group', { name: 'Transform tools' } );
	const buttons = await transforms.getByRole( 'button' ).all();
	assert.equal( buttons.length, 3 );
	const positions = await Promise.all( buttons.map( button => button.boundingBox() ) );
	assert.equal( positions[ 0 ].x, positions[ 2 ].x );
	assert.ok( positions[ 0 ].y < positions[ 2 ].y );
	await buttons[ 1 ].click();
	assert.equal( await buttons[ 1 ].getAttribute( 'aria-pressed' ), 'true' );
	await buttons[ 0 ].click();

	for ( const name of [ 'Pencil', 'Measure' ] ) {

		const tool = await shelf.getByRole( 'button', { name, exact: true } ).boundingBox();
		assert.ok( tool.y < positions[ 0 ].y, name + ' sits above the transform tools' );

	}
	await shelf.getByRole( 'button', { name: 'Select · Selection tools', exact: true } ).click();
	const box = page.getByRole( 'group', { name: 'Selection tools', exact: true } ).getByRole( 'button', { name: 'Box select' } );
	assert.equal( await box.evaluate( button => getComputedStyle( button ).display ), 'flex' );
	await box.click();
	const settings = page.locator( '#toolbar' );
	const settingsY = ( await settings.boundingBox() ).y;
	await shelf.getByRole( 'button', { name: 'Measure', exact: true } ).click();
	assert.equal( ( await settings.boundingBox() ).y, settingsY );
	await page.evaluate( () => editor.viewTools.chooseSelectionTool( 'box' ) );
	assert.equal( await shelf.getByRole( 'button', { name: 'Box select · Selection tools' } ).getAttribute( 'aria-pressed' ), 'true' );
	const center = await page.evaluate( () => {

		const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshBasicMaterial() );
		mesh.name = 'Region target';
		editor.addObject( mesh );
		editor.camera.position.set( 0, 0, 6 );
		editor.camera.lookAt( 0, 0, 0 );
		editor.signals.cameraChanged.dispatch( editor.camera );
		const { left, top, width, height } = editor.modeling.rect();
		return [ left + width / 2, top + height / 2 ];

	} );
	await page.mouse.move( center[ 0 ] - 35, center[ 1 ] - 35 );
	await page.mouse.down();
	await page.mouse.move( center[ 0 ] + 35, center[ 1 ] + 35, { steps: 4 } );
	await page.mouse.up();
	assert.equal( await page.evaluate( () => editor.selected?.name ), 'Region target' );
	for ( const [ key, mode ] of [ [ 'w', 'circle' ], [ 'w', 'lasso' ], [ 'w', 'select' ], [ 'Shift+b', 'lasso' ], [ 'w', 'select' ] ] ) {

		await page.keyboard.press( key );
		assert.equal( await page.evaluate( () => editor.modeling.selectionTool ), mode );

	}
	await page.evaluate( () => editor.clear() );

}

async function checkPencilObjectSelection( page ) {

	const [ x, y ] = await page.evaluate( () => {

		const receiver = new THREE.Mesh( new THREE.PlaneGeometry( 10, 10 ), new THREE.MeshBasicMaterial() );
		receiver.name = 'Pencil selection receiver';
		editor.addObject( receiver );
		editor.camera.position.set( 0, 0, 6 );
		editor.camera.lookAt( 0, 0, 0 );
		editor.signals.cameraChanged.dispatch( editor.camera );
		editor.config.setKey( 'settings/modelPlacement', 'surface' );
		editor.signals.transformSettingsChanged.dispatch( 'modelPlacement' );
		const { left, top, width, height } = editor.modeling.rect();
		return [ left + width / 2, top + height / 2 ];

	} );
	const shelf = page.getByRole( 'group', { name: 'Viewport Toolbar', exact: true } );
	const pencil = shelf.getByRole( 'button', { name: 'Pencil', exact: true } );
	await pencil.click();
	await page.getByLabel( 'Brush size (px)', { exact: true } ).fill( '2' );
	await page.getByLabel( 'Brush size (px)', { exact: true } ).press( 'Tab' );
	await page.mouse.move( x + 45, y );
	await page.mouse.down();
	await page.mouse.move( x + 140, y, { steps: 12 } );
	await page.mouse.up();
	await pencil.click();
	await page.mouse.click( x + 88, y + 5 );
	assert.equal( await page.evaluate( () => editor.selected?.name ), 'Pencil stroke' );
	await page.evaluate( () => { editor.deselect(); editor.viewTools.chooseSelectionTool( 'box' ); } );
	await page.mouse.move( x + 83, y - 7 );
	await page.mouse.down();
	await page.mouse.move( x + 93, y + 7, { steps: 4 } );
	await page.mouse.up();
	assert.deepEqual( await page.evaluate( () => editor.selector.selection.map( object => object.name ) ), [ 'Pencil stroke' ] );
	await page.evaluate( () => {

		editor.selected.userData.threeditor = { unselectable: true };
		editor.deselect();
		editor.viewTools.chooseSelectionTool( 'select' );

	} );
	await page.mouse.click( x + 88, y + 5 );
	assert.equal( await page.evaluate( () => editor.selected?.name ), 'Pencil selection receiver' );
	await page.evaluate( () => { editor.pencilBrush.size = 8; editor.clear(); } );

}

async function checkPencil( page ) {

	const center = await page.evaluate( () => {

		const receiver = new THREE.Mesh( new THREE.PlaneGeometry( 5, 5 ), new THREE.MeshBasicMaterial() );
		receiver.name = 'Pencil receiver';
		editor.addObject( receiver );
		editor.select( receiver );
		editor.config.setKey( 'settings/modelPlacement', 'surface' );
		editor.camera.position.set( 0, 0, 6 );
		editor.camera.lookAt( 0, 0, 0 );
		editor.signals.cameraChanged.dispatch( editor.camera );
		const { left, top, width, height } = editor.modeling.rect();
		return [ left + width / 2, top + height / 2 ];

	} );
	const draw = async ( loop ) => {

		const [ x, y ] = center;
		await page.mouse.move( x - 45, y );
		await page.mouse.down();
		await page.mouse.move( x + 45, y, { steps: 12 } );
		if ( loop ) {

			await page.mouse.move( x + 45, y + 55, { steps: 8 } );
			await page.mouse.move( x - 45, y + 55, { steps: 12 } );
			await page.mouse.move( x - 45, y, { steps: 8 } );

		}
		await page.mouse.up();

	};
	await page.getByRole( 'button', { name: 'Pencil', exact: true } ).click();
	await page.getByLabel( 'Brush presets', { exact: true } ).click();
	await page.getByRole( 'button', { name: 'Charcoal', exact: true } ).click();
	const size = page.getByLabel( 'Brush size (px)', { exact: true } );
	const field = await size.boundingBox();
	await page.mouse.move( field.x + field.width / 2, field.y + field.height / 2 );
	await page.keyboard.down( 'Meta' );
	await page.mouse.down();
	await page.mouse.move( field.x + field.width / 2 + 30, field.y + field.height / 2, { steps: 6 } );
	await page.mouse.up();
	await page.keyboard.up( 'Meta' );
	assert.equal( await size.inputValue(), '41' );
	await draw( true );
	assert.deepEqual( await page.evaluate( () => {

		const path = editor.scene.getObjectByName( 'Pencil stroke' );
		const loaded = new THREE.ObjectLoader().parse( path.toJSON() );
		const style = loaded.geometry.userData.modeling.pencilBrush;
		const geometry = loaded.geometry;
		const alpha = Array.from( geometry.attributes.color.array ).filter( ( _, index ) => index % 4 === 3 );
		const scene = new THREE.Scene();
		scene.add( loaded );
		const camera = new THREE.OrthographicCamera( -1, 1, 1, -1, .1, 10 );
		camera.position.z = 3;
		const renderer = editor.renderer;
		const previousTarget = renderer.getRenderTarget();
		const target = new THREE.WebGLRenderTarget( 128, 128 );
		const pixels = new Uint8Array( 32 * 3 * 4 );
		const clear = renderer.getClearColor( new THREE.Color() );
		const clearAlpha = renderer.getClearAlpha();
		try {

			renderer.setClearColor( 0x000000, 0 );
			renderer.setRenderTarget( target );
			renderer.clear();
			renderer.render( scene, camera );
			renderer.readRenderTargetPixels( target, 48, 63, 32, 3, pixels );

		} finally {

			renderer.setRenderTarget( previousTarget );
			renderer.setClearColor( clear, clearAlpha );
			target.dispose();

		}
		const coverage = pixels.filter( ( _, index ) => index % 4 === 3 );
		return [ loaded.isMesh, loaded.material.vertexColors, loaded.material.transparent, geometry.index.count > 0, alpha.includes( 0 ),
			alpha.some( value => Math.abs( value - .85 ) < 1e-5 ), style.grain, style.grainPattern, style.samples.length === geometry.userData.modeling.points.length,
			loaded.material.map?.isDataTexture, Math.max( ...coverage ) > 110 && Math.max( ...coverage ) - Math.min( ...coverage ) > 50 ];

	} ), [ true, true, true, true, true, true, .9, 'speckle', true, true, true ] );
	await page.getByLabel( 'Brush presets', { exact: true } ).click();
	await page.getByRole( 'button', { name: 'Pen', exact: true } ).click();
	assert.deepEqual( await page.evaluate( () => {

		const path = editor.scene.getObjectByName( 'Pencil stroke' );
		return [ path?.parent.name, path?.geometry.userData.modeling.closed ];

	} ), [ 'Pencil receiver', true ] );
	await page.evaluate( () => editor.undo() );
	await page.getByLabel( 'Interaction mode', { exact: true } ).selectOption( 'sculpt' );
	await page.keyboard.press( 'd' );
	await page.getByRole( 'button', { name: 'Placement', exact: true } ).click();
	await page.getByRole( 'button', { name: 'View plane', exact: true } ).click();
	await draw( false );
	assert.deepEqual( await page.evaluate( () => {

		const path = editor.scene.getObjectByName( 'Pencil stroke' );
		return [ path?.parent === editor.scene, path?.geometry.userData.modeling.kind, editor.modeling.brush ];

	} ), [ true, 'path', 'grab' ] );
	await page.keyboard.press( 'Escape' );
	assert.equal( await page.getByLabel( 'Interaction mode', { exact: true } ).inputValue(), 'sculpt' );
	await page.evaluate( () => {

		editor.undo();
		editor.camera.position.set( 0, 5, 6 );
		editor.camera.lookAt( 0, 0, 0 );
		editor.signals.cameraChanged.dispatch( editor.camera );
		editor.config.setKey( 'settings/modelPlacement', 'ground' );
		editor.signals.transformSettingsChanged.dispatch( 'modelPlacement' );

	} );
	await page.keyboard.press( 'd' );
	assert.equal( await page.getByLabel( 'Pencil placement' ).count(), 0 );
	assert.equal( await page.evaluate( () => editor.modeling.placement ), 'ground' );
	await page.mouse.move( ...center );
	const guide = await page.evaluate( () => editor.viewTools.overlay.toDataURL() );
	await page.getByLabel( 'Pencil plane guide' ).uncheck();
	assert.notEqual( await page.evaluate( () => editor.viewTools.overlay.toDataURL() ), guide );
	await page.getByLabel( 'Pencil plane guide' ).check();
	await draw( false );
	assert.equal( await page.evaluate( () => {

		const path = editor.scene.getObjectByName( 'Pencil stroke' );
		return path?.parent === editor.scene && path.geometry.userData.modeling.points.every( point => Math.abs( point[ 1 ] ) < 1e-7 );

	} ), true );
	await page.evaluate( () => {
		editor.camera.position.set( 0, 0, 6 );
		editor.camera.lookAt( 0, 0, 0 );
		editor.signals.cameraChanged.dispatch( editor.camera );
	} );
	await page.getByRole( 'button', { name: 'Paint mesh texture', exact: true } ).click();
	await draw( false );
	assert.equal( await page.evaluate( () => !! editor.scene.getObjectByName( 'Pencil receiver' ).material.map ), true );
	await page.getByRole( 'button', { name: 'Erase mesh texture', exact: true } ).click();
	await draw( false );
	assert.equal( await page.evaluate( () => editor.scene.getObjectByName( 'Pencil receiver' ).material.transparent ), true );
	const anchorPixel = await page.evaluate( () => {

		const source = new THREE.Line( new THREE.BufferGeometry().setFromPoints( [
			new THREE.Vector3( -.6, 0, 2 ), new THREE.Vector3( .6, 0, 2 )
		] ), new THREE.LineBasicMaterial() );
		source.geometry.userData.modeling = { kind: 'path', closed: false, points: [ [ -.6, 0, 2 ], [ .6, 0, 2 ] ] };
		source.name = 'Depth guide';
		editor.addObject( source );
		const bounds = editor.renderer.domElement.getBoundingClientRect();
		return [ bounds.left + bounds.width / 2, bounds.top + bounds.height / 2 ];

	} );
	await page.getByRole( 'button', { name: 'Draw editable stroke', exact: true } ).click();
	await page.getByRole( 'button', { name: 'Placement', exact: true } ).click();
	await page.getByRole( 'button', { name: 'View plane', exact: true } ).click();
	await page.getByLabel( 'Pencil stroke depth' ).selectOption( 'segment' );
	const [ ax, ay ] = anchorPixel;
	await page.mouse.move( ax, ay );
	await page.mouse.down();
	assert.ok( await page.evaluate( () => editor.viewTools.stroke?.anchor?.distanceTo( new THREE.Vector3( 0, 0, 2 ) ) < 1e-6 ) );
	await page.mouse.move( ax, ay + 60, { steps: 7 } );
	await page.mouse.up();
	const depthStroke = await page.evaluate( () => {

		const stroke = editor.scene.children.filter( object => object.userData.pencilStroke ).at( -1 );
		return { uuid: stroke.uuid, z: stroke.geometry.userData.modeling.points.map( point => point[ 2 ] ) };

	} );
	assert.ok( depthStroke.z.length > 2 && depthStroke.z.every( z => Math.abs( z - 2 ) < 1e-6 ), 'Keeps the initial stroke depth away from the anchor ' + JSON.stringify( depthStroke ) );
	await page.getByRole( 'button', { name: 'Erase pencil strokes', exact: true } ).click();
	await page.mouse.click( ax, ay + 45 );
	assert.equal( await page.evaluate( uuid => !! editor.scene.getObjectByProperty( 'uuid', uuid ), depthStroke.uuid ), false );
	await page.evaluate( () => editor.undo() );
	assert.equal( await page.evaluate( uuid => !! editor.scene.getObjectByProperty( 'uuid', uuid ), depthStroke.uuid ), true );
	await page.getByRole( 'button', { name: 'Draw editable stroke', exact: true } ).click();
	await page.getByLabel( 'Pencil stroke depth' ).selectOption( 'off' );
	await page.getByLabel( 'Stabilize strokes' ).check();
	const simplify = page.getByLabel( 'Simplify tolerance (px)' );
	await simplify.fill( '1' );
	await simplify.press( 'Tab' );
	await page.mouse.move( ax, ay );
	await page.mouse.down();
	await page.mouse.move( ax + 10, ay, { steps: 5 } );
	assert.equal( await page.evaluate( () => editor.viewTools.stroke?.marks.values().next().value.points.length ), 1 );
	await page.mouse.move( ax + 110, ay, { steps: 14 } );
	await page.mouse.up();
	assert.equal( await page.evaluate( () => editor.scene.children.filter( object => object.userData.pencilStroke ).at( -1 ).geometry.userData.modeling.points.length ), 2 );
	await page.getByLabel( 'Stabilize strokes' ).uncheck();
	await simplify.fill( '0' );
	await simplify.press( 'Tab' );
	await page.getByLabel( 'Pencil drawing guide' ).selectOption( 'parallel' );
	await page.mouse.move( ax, ay );
	await page.mouse.down();
	await page.mouse.move( ax + 95, ay + 28, { steps: 9 } );
	await page.mouse.up();
	const guided = await page.evaluate( () => editor.scene.children.filter( object => object.userData.pencilStroke ).at( -1 ).geometry.userData.modeling.points );
	assert.ok( guided.length > 2 && guided.every( point => Math.abs( point[ 1 ] - guided[ 0 ][ 1 ] ) < 1e-6 ), JSON.stringify( guided ) );
	await page.evaluate( () => { editor.pencilBrush.guide = 'off'; } );

	await page.evaluate( () => { editor.config.setKey( 'settings/modelPlacement', 'object' ); editor.clear(); } );

}

async function checkPencilSplats( page ) {

	const pixel = await page.evaluate( () => {

		const mesh = new THREE.Mesh( new THREE.PlaneGeometry( 6, 6 ), new THREE.MeshBasicMaterial() );
		mesh.name = 'Pencil splat receiver';
		editor.addObject( mesh );
		editor.camera.position.set( 0, 0, 5 );
		editor.camera.lookAt( 0, 0, 0 );
		editor.signals.cameraChanged.dispatch( editor.camera );
		editor.config.setKey( 'settings/modelPlacement', 'surface' );
		editor.signals.transformSettingsChanged.dispatch( 'modelPlacement' );
		const { left, top, width, height } = editor.renderer.domElement.getBoundingClientRect();
		return [ left + width / 2, top + height / 2 ];

	} );
	await page.getByRole( 'button', { name: 'Pencil', exact: true } ).click();
	await page.getByRole( 'button', { name: 'Draw Pencil splats', exact: true } ).click();
	await page.getByLabel( 'Brush presets', { exact: true } ).click();
	await page.getByRole( 'button', { name: 'Charcoal', exact: true } ).click();
	const draw = async ( offset = 0 ) => {

		await page.mouse.move( pixel[ 0 ] - 45, pixel[ 1 ] + offset );
		await page.mouse.down();
		await page.mouse.move( pixel[ 0 ] + 45, pixel[ 1 ] + offset, { steps: 12 } );
		await page.mouse.up();

	};
	await draw();
	const initialized = () => page.waitForFunction( () => {

		const batch = editor.scene.getObjectByName( 'Pencil splats' );
		const mesh = batch?.getObjectByName( 'SplatMesh' );
		return mesh?.isInitialized && mesh.numSplats * 32 === atob( batch.userData.assetObject.splatData ).length;

	} );
	await initialized();
	const saved = () => page.evaluate( () => editor.scene.getObjectByName( 'Pencil splats' )?.userData.assetObject.splatData );
	const first = await saved();
	const brush = await page.evaluate( () => {

		const batch = editor.scene.getObjectByName( 'Pencil splats' );
		const mesh = batch.getObjectByName( 'SplatMesh' );
		const densities = [];
		let flat = true;
		mesh.forEachSplat( ( _, center, axes, rotation, opacity ) => {

			const normal = new THREE.Vector3( 0, 0, 1 ).applyQuaternion( rotation );
			flat &&= Math.abs( center.z ) < .002 && axes.z < axes.y && axes.y < axes.x && Math.abs( normal.z ) > .98;
			densities.push( opacity );

		} );
		return [ batch.parent.name, densities.length > 50, flat, Math.max( ...densities ) - Math.min( ...densities ) > .15 ];

	} );
	assert.deepEqual( brush, [ 'Pencil splat receiver', true, true, true ] );
	await draw( 35 );
	await initialized();
	const second = await saved();
	assert.ok( second.length > first.length );
	await page.evaluate( () => editor.undo() );
	assert.equal( await saved(), first );
	await page.evaluate( () => editor.redo() );
	assert.equal( await saved(), second );
	await initialized();
	await page.getByRole( 'button', { name: 'Draw editable stroke', exact: true } ).click();
	await page.getByLabel( 'Brush presets', { exact: true } ).click();
	await page.getByRole( 'button', { name: 'Pen', exact: true } ).click();
	await page.evaluate( async () => {

		const project = JSON.parse( JSON.stringify( editor.toJSON() ) );
		editor.clear();
		await editor.fromJSON( project );

	} );
	assert.equal( await saved(), second );
	await initialized();
	await page.evaluate( () => {
		editor.clear();
		editor.config.setKey( 'settings/modelPlacement', 'object' );
		editor.signals.transformSettingsChanged.dispatch( 'modelPlacement' );
	} );

}

async function checkCompactPencil( page ) {

	const originalViewport = page.viewportSize();
	const originalStyle = await page.evaluate( () => {

		const style = editor.config.getKey( 'settings/uiStyle' );
		editor.config.setKey( 'settings/uiStyle', 'compact' );
		editor.signals.uiStyleChanged.dispatch();
		return style;

	} );
	await page.setViewportSize( { width: 640, height: 720 } );
	await page.getByRole( 'button', { name: 'Pencil', exact: true } ).click();
	await page.getByLabel( 'Stroke smoothing', { exact: true } ).scrollIntoViewIfNeeded();
	assert.deepEqual( await page.evaluate( () => {

		const pane = document.querySelector( '#viewport' ).getBoundingClientRect();
		const palette = document.querySelector( '.pencil-brush-palette' ).getBoundingClientRect();
		const inline = document.querySelector( '.pencil-inline-stroke-options' );
		const smoothing = inline.querySelector( '[aria-label="Stroke smoothing"]' ).getBoundingClientRect();
		const scroller = document.querySelector( '.pencil-brush-fields' );
		const scrollBounds = scroller.getBoundingClientRect();
		const row = document.querySelector( '.viewport-pencil-controls' );
		const toolbar = document.querySelector( '.viewport-geometry-tools' ).getBoundingClientRect();
		const { x, right, bottom } = row.getBoundingClientRect();
		return [ palette.right <= pane.right, inline.tagName === 'DIV' && inline.getBoundingClientRect().top >= row.getBoundingClientRect().top,
			smoothing.left >= scrollBounds.left && smoothing.right <= scrollBounds.right, scroller.scrollLeft > 0,
			x >= pane.left && right <= pane.right && bottom <= pane.bottom, getComputedStyle( row ).flexWrap === 'nowrap', toolbar.top < inline.getBoundingClientRect().top ];

	} ), [ true, true, true, true, true, true, true ] );
	await page.getByRole( 'button', { name: 'Pencil', exact: true } ).click();
	await page.setViewportSize( originalViewport );
	await page.evaluate( style => {

		editor.config.setKey( 'settings/uiStyle', style );
		editor.signals.uiStyleChanged.dispatch();

	}, originalStyle );

}

async function checkUVSelection( page ) {

	await page.evaluate( () => {

		editor.setViewportShading( 'solid' );
		editor.modeling.create( 'shape' );
		editor.modeling.setSelectionMode( 'vertex' );
		editor.camera.position.set( 0, 0, 6 );
		editor.camera.lookAt( 0, 0, 0 );
		editor.controls.center.set( 0, 0, 0 );
		editor.signals.cameraChanged.dispatch( editor.camera );

	} );
	const vertex = ( index, previous ) => page.evaluate( ( { index, previous } ) => {

		const model = editor.modeling, { camera, rect } = model.frame;
		const projected = model.object.localToWorld( new THREE.Vector3( ...model.data.points[ index ] ) ).project( camera );
		const local = [ ( projected.x + 1 ) * rect.width / 2, ( 1 - projected.y ) * rect.height / 2 ];
		const { left, top } = model.rect();
		const overlay = model.overlay, context = overlay.getContext( '2d' );
		const bounds = overlay.getBoundingClientRect();
		const pixel = ( [ x, y ] ) => [ ...context.getImageData(
			Math.floor( x * overlay.width / bounds.width ), Math.floor( y * overlay.height / bounds.height ), 1, 1
		).data ];
		return { local, client: [ left + local[ 0 ], top + local[ 1 ] ], color: pixel( local ),
			fringe: pixel( [ local[ 0 ], local[ 1 ] + 4 ] ), previous: previous && pixel( previous ) };

	}, { index, previous } );
	const orange = [ 255, 157, 69, 255 ];
	await page.mouse.click( ...( await vertex( 0 ) ).client );
	assert.deepEqual( ( await vertex( 0 ) ).color, orange );

	await page.getByRole( 'button', { name: 'UV Editing', exact: true } ).click();
	await page.locator( 'body.workspace-2d-split' ).waitFor();
	const split = await vertex( 0 );
	assert.deepEqual( split.color, orange );
	assert.notDeepEqual( split.fringe, orange, 'Vertex selection uses a small dot' );

	const divider = page.getByRole( 'separator', { name: 'Resize editor and 3D areas' } );
	await divider.press( 'ArrowLeft' );
	assert.deepEqual( ( await vertex( 0 ) ).color, orange );
	await divider.press( 'ArrowRight' );

	await page.mouse.move( split.client[ 0 ] + 110, split.client[ 1 ] - 45 );
	await page.mouse.down( { button: 'middle' } );
	await page.mouse.move( split.client[ 0 ] + 146, split.client[ 1 ] - 67, { steps: 5 } );
	await page.mouse.up( { button: 'middle' } );
	const orbited = await vertex( 0, split.local );
	assert.ok( Math.hypot( orbited.local[ 0 ] - split.local[ 0 ], orbited.local[ 1 ] - split.local[ 1 ] ) > 5 );
	assert.deepEqual( orbited.color, orange );
	assert.notDeepEqual( orbited.previous, orange, 'The overlay clears the previous position after navigation' );

	await page.mouse.click( ...( await vertex( 1 ) ).client );
	assert.deepEqual( await page.evaluate( () => editor.modeling.indices ), [ 1 ] );
	assert.deepEqual( ( await vertex( 1 ) ).color, orange );
	await page.keyboard.press( 'Escape' );
	assert.deepEqual( await page.evaluate( () => editor.modeling.indices ), [] );
	assert.equal( await page.getByRole( 'region', { name: 'UV editor area' } ).isVisible(), true );
	await page.getByRole( 'button', { name: 'Close editor area', exact: true } ).click();
	await page.getByRole( 'button', { name: 'Layout', exact: true } ).click();
	await page.evaluate( () => editor.clear() );

}

async function checkUVSeams( page ) {

	await page.evaluate( () => {

		const object = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), new THREE.MeshStandardMaterial() );
		editor.addObject( object );
		editor.select( object );

	} );
	await page.getByRole( 'button', { name: 'UV Editing', exact: true } ).click();
	const uv = page.getByRole( 'region', { name: 'UV editor', exact: true } );
	const apply = uv.getByRole( 'button', { name: 'Apply', exact: true } );
	const unwrap = uv.getByRole( 'button', { name: 'Auto layout', exact: true } );
	await unwrap.click();
	await apply.click();
	assert.equal( await page.evaluate( () => editor.selected.geometry.attributes.uv.count ), 4 );
	await page.evaluate( () => editor.undo() );

	const seam = uv.getByRole( 'button', { name: 'Mark or clear UV seam', exact: true } );
	await seam.click();
	const grid = uv.getByLabel( 'UV grid', { exact: true } );
	const { x, y, width, height } = await grid.boundingBox();
	const center = [ x + width / 2, y + height / 2 ];
	await page.mouse.click( ...center );
	assert.equal( await uv.getByRole( 'status' ).textContent(), 'Seam marked.' );
	await page.mouse.click( ...center );
	assert.equal( await uv.getByRole( 'status' ).textContent(), 'Seam cleared.' );
	await uv.getByRole( 'button', { name: 'Undo UV edit', exact: true } ).click();
	await unwrap.click();
	await apply.click();

	assert.deepEqual( await page.evaluate( () => {

		const geometry = new THREE.ObjectLoader().parse( editor.selected.toJSON() ).geometry;
		const { index, attributes: { uv } } = geometry;
		const corners = [ 1, 2, 3, 5 ].map( offset => [ uv.getX( index.getX( offset ) ), uv.getY( index.getX( offset ) ) ].join( ',' ) );
		return [ uv.count, geometry.userData.uvSeams.length, new Set( corners ).size ];

	} ), [ 6, 1, 4 ] );
	await unwrap.click();
	await apply.click();
	assert.equal( await page.evaluate( () => editor.selected.geometry.attributes.uv.count ), 6 );
	await page.evaluate( () => {

		editor.modeling.setSelectionMode( 'edge' );
		const points = editor.modeling.data.points;
		editor.modeling.applyElementSelection( [ [
			points.findIndex( ( [ x, y ] ) => x === 1 && y === 1 ),
			points.findIndex( ( [ x, y ] ) => x === -1 && y === -1 )
		] ], 'set' );

	} );
	await uv.getByRole( 'button', { name: 'Clear seams on selected 3D edges', exact: true } ).click();
	assert.equal( await uv.getByRole( 'status' ).textContent(), 'Cleared 1 UV seam.' );
	await uv.getByRole( 'button', { name: 'Mark selected 3D edges as seams', exact: true } ).click();
	assert.equal( await uv.getByRole( 'status' ).textContent(), 'Marked 1 UV seam.' );
	await uv.getByRole( 'button', { name: 'Clear seams on selected 3D edges', exact: true } ).click();
	await unwrap.click();
	await apply.click();
	assert.deepEqual( await page.evaluate( () => {

		const geometry = editor.selected.geometry;
		const { index, attributes: { uv } } = geometry;
		const corners = [ 1, 2, 3, 5 ].map( offset => [ uv.getX( index.getX( offset ) ), uv.getY( index.getX( offset ) ) ].join( ',' ) );
		return [ new Set( corners ).size, Boolean( geometry.userData.uvSeams?.length ) ];

	} ), [ 2, false ] );
	await page.getByRole( 'button', { name: 'Layout', exact: true } ).click();
	await page.evaluate( () => editor.clear() );

}

async function checkUVIslands( page ) {

	const coordinates = [ [ .10, .15 ], [ .40, .15 ], [ .40, .45 ], [ .10, .15 ], [ .40, .45 ], [ .10, .45 ],
		[ .40, .45 ], [ .70, .45 ], [ .70, .75 ] ];
	await page.evaluate( coordinates => {

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( coordinates.flatMap( ( [ u, v ] ) => [ u * 3, -v * 3, 0 ] ), 3 ) );
		geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( coordinates.flatMap( ( [ u, v ] ) => [ u, 1 - v ] ), 2 ) );
		const mesh = new THREE.Mesh( geometry, new THREE.MeshStandardMaterial() );
		editor.addObject( mesh );
		editor.select( mesh );

	}, coordinates );
	await page.getByRole( 'button', { name: 'UV Editing', exact: true } ).click();
	const uv = page.getByRole( 'region', { name: 'UV editor', exact: true } );
	const grid = uv.getByLabel( 'UV grid', { exact: true } );
	let bounds = await grid.boundingBox();
	const pixel = ( u, v ) => [ bounds.x + bounds.width * ( 25 + 590 * u ) / 640, bounds.y + bounds.height * ( 25 + 590 * v ) / 640 ];
	const values = () => page.evaluate( () => {

		const coords = editor.selected.geometry.attributes.uv;
		return Array.from( { length: coords.count }, ( _, i ) => [ coords.getX( i ), 1 - coords.getY( i ) ] );

	} );
	const check = async expected => {

		const actual = await values();
		assert.ok( actual.every( ( pair, i ) => pair.every( ( value, axis ) => Math.abs( value - expected[ i ][ axis ] ) < .002 ) ), JSON.stringify( actual ) );

	};
	const frame = () => grid.evaluate( canvas => canvas.toDataURL() );
	const initial = await frame();
	await page.mouse.move( ...pixel( .5, .5 ) );
	await page.mouse.wheel( 70, 45 );
	await page.waitForFunction( previous => document.querySelector( '[aria-label="UV grid"]' ).toDataURL() !== previous, initial );
	await grid.press( 'Home' );
	assert.equal( await frame(), initial );
	// Moving one corner must move the actual welded duplicate and leave
	// the separate island's coincident corner at its original coordinate.
	await uv.getByRole( 'button', { name: 'Edit UV vertices', exact: true } ).click();
	bounds = await grid.boundingBox();
	await page.mouse.move( ...pixel( .40, .45 ) );
	await page.mouse.down();
	await page.mouse.move( ...pixel( .45, .45 ), { steps: 5 } );
	await page.mouse.up();
	await uv.getByRole( 'button', { name: 'Apply', exact: true } ).click();
	await check( coordinates.map( ( [ u, v ], i ) => [ u + ( i === 2 || i === 4 ? .05 : 0 ), v ] ) );
	await page.evaluate( () => editor.undo() );
	await check( coordinates );

	await uv.getByRole( 'button', { name: 'Select UV islands', exact: true } ).click();
	await page.mouse.move( ...pixel( .22, .28 ) );
	await page.mouse.down();
	await page.mouse.move( ...pixel( .27, .28 ), { steps: 5 } );
	await page.mouse.up();
	await uv.getByRole( 'button', { name: 'Apply', exact: true } ).click();
	const first = coordinates.map( ( [ u, v ], i ) => [ u + ( i < 6 ? .05 : 0 ), v ] );
	await check( first );

	await grid.press( 'Escape' );
	await page.mouse.move( ...pixel( .64, .52 ) );
	await grid.press( 'l' );
	await page.mouse.move( ...pixel( .24, .27 ) );
	await grid.press( 'l' );
	await grid.press( 'Shift+l' );
	await page.mouse.move( ...pixel( .64, .52 ) );
	await grid.press( 'g' );
	await page.mouse.move( ...pixel( .64, .57 ), { steps: 5 } );
	await grid.press( 'Enter' );
	await uv.getByRole( 'button', { name: 'Apply', exact: true } ).click();
	await check( first.map( ( [ u, v ], i ) => [ u, v + ( i >= 6 ? .05 : 0 ) ] ) );
	await grid.press( 'Escape' );
	await uv.getByRole( 'button', { name: 'Push UV vertices', exact: true } ).click();
	await uv.getByLabel( 'UV sculpt radius (px)', { exact: true } ).fill( '90' );
	await uv.getByLabel( 'UV sculpt radius (px)', { exact: true } ).press( 'Tab' );
	const beforeSculpt = await values();
	await page.mouse.move( ...pixel( .68, .50 ) );
	await page.mouse.down();
	await page.mouse.move( ...pixel( .75, .50 ), { steps: 5 } );
	await page.mouse.up();
	await uv.getByRole( 'button', { name: 'Apply', exact: true } ).click();
	const afterSculpt = await values();
	assert.deepEqual( afterSculpt.slice( 0, 6 ), beforeSculpt.slice( 0, 6 ) );
	assert.ok( afterSculpt[ 7 ][ 0 ] > beforeSculpt[ 7 ][ 0 ] + .015 );
	await page.evaluate( () => editor.undo() );
	assert.deepEqual( await values(), beforeSculpt );

	await uv.getByRole( 'button', { name: 'Edit UV vertices', exact: true } ).click();
	await page.mouse.click( ...pixel( ...beforeSculpt[ 7 ] ) );
	await grid.press( 'p' );
	await uv.getByRole( 'button', { name: 'Apply', exact: true } ).click();
	assert.deepEqual( await page.evaluate( () => new THREE.ObjectLoader().parse( editor.selected.toJSON() ).geometry.userData.uvPins ), [ 7 ] );
	await uv.getByRole( 'button', { name: 'Auto layout', exact: true } ).click();
	assert.match( await uv.getByRole( 'status' ).textContent(), /Unpin the UV vertices/ );
	await grid.press( 'Escape' );
	await uv.getByRole( 'button', { name: 'Push UV vertices', exact: true } ).click();
	async function pushPinnedCorner() {

		await page.mouse.move( ...pixel( .68, .50 ) );
		await page.mouse.down();
		await page.mouse.move( ...pixel( .75, .50 ), { steps: 5 } );
		await page.mouse.up();

	}
	await pushPinnedCorner();
	await uv.getByRole( 'button', { name: 'Apply', exact: true } ).click();
	assert.deepEqual( ( await values() )[ 7 ], beforeSculpt[ 7 ] );
	await uv.getByRole( 'button', { name: 'Edit UV vertices', exact: true } ).click();
	await page.mouse.click( ...pixel( ...beforeSculpt[ 7 ] ) );
	await grid.press( 'Alt+p' );
	await uv.getByRole( 'button', { name: 'Apply', exact: true } ).click();
	assert.equal( await page.evaluate( () => editor.selected.geometry.userData.uvPins ), undefined );
	await grid.press( 'Escape' );
	await uv.getByRole( 'button', { name: 'Push UV vertices', exact: true } ).click();
	await uv.getByLabel( 'Protect UV island borders', { exact: true } ).check();
	const beforeProtectedStroke = await values();
	await pushPinnedCorner();
	await uv.getByRole( 'button', { name: 'Apply', exact: true } ).click();
	assert.deepEqual( await values(), beforeProtectedStroke );

	await page.getByRole( 'button', { name: 'Layout', exact: true } ).click();
	await page.evaluate( () => editor.clear() );

}

async function checkUVUnwrap( page ) {

	await page.evaluate( () => {

		const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshStandardMaterial() );
		editor.addObject( mesh );
		editor.select( mesh );

	} );
	await page.getByRole( 'button', { name: 'UV Editing', exact: true } ).click();
	const layout = page.getByRole( 'combobox', { name: 'UV layout' } );
	for ( const mode of [ 'smart', 'lightmap', 'box', 'boxNet', 'cylinder', 'sphere', 'view' ] ) {

		await layout.selectOption( mode );
		await page.getByRole( 'button', { name: 'Auto layout' } ).click();
		await page.getByRole( 'button', { name: 'Apply', exact: true } ).click();
		assert.equal( await page.getByRole( 'region', { name: 'UV editor', exact: true } ).getByRole( 'status' ).textContent(), 'UVs applied.', mode );
		const valid = await page.evaluate( () => {

			const { index, groups, attributes: { uv, position } } = editor.selected.geometry;
			return uv.count === position.count && uv.array.every( Number.isFinite ) && ( index?.count ?? position.count ) === 36 && groups.length === 6;

		} );
		assert.equal( valid, true, mode );
		await page.evaluate( () => editor.undo() );

	}
	const tools = page.getByRole( 'group', { name: 'UV tools' } );
	const grid = page.getByLabel( 'UV grid', { exact: true } );
	const bounds = await grid.boundingBox();
	const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
	const original = await page.evaluate( () => Array.from( editor.selected.geometry.attributes.uv.array ) );
	await grid.press( 'a' );
	await tools.getByRole( 'button', { name: 'Move', exact: true } ).click();
	await page.mouse.move( x, y );
	await page.mouse.down();
	await page.mouse.move( x + bounds.width / 12, y, { steps: 3 } );
	await page.mouse.up();
	await page.getByRole( 'button', { name: 'Apply', exact: true } ).click();
	assert.ok( await page.evaluate( previous => editor.selected.geometry.attributes.uv.array.every( ( value, i ) =>
		i % 2 === 0 ? value > previous[ i ] + .08 : Math.abs( value - previous[ i ] ) < 1e-6, previous ), original ) );
	await page.evaluate( () => editor.undo() );
	await tools.getByRole( 'button', { name: 'Pencil', exact: true } ).click();
	await page.mouse.click( x, y );
	assert.deepEqual( await page.evaluate( () => {

		const map = editor.selected.material.map;
		return map ? Array.from( map.image.getContext( '2d' ).getImageData( 512, 512, 1, 1 ).data ) : [];

	} ), [ 255, 174, 102, 255 ] );
	const brushColor = page.getByLabel( 'Brush color', { exact: true } );
	await brushColor.fill( '#123456' );
	await tools.getByRole( 'button', { name: 'Sample Brush Color', exact: true } ).click();
	await page.mouse.click( x, y );
	assert.equal( await brushColor.inputValue(), '#ffae66' );
	assert.equal( await tools.getByRole( 'button', { name: 'Pencil', exact: true } ).getAttribute( 'aria-pressed' ), 'true' );
	await tools.getByRole( 'button', { name: 'Erase Texture', exact: true } ).click();
	await page.mouse.click( x, y );
	assert.equal( await page.evaluate( () => editor.selected.material.map.image.getContext( '2d' ).getImageData( 512, 512, 1, 1 ).data[ 3 ] ), 0 );
	await page.evaluate( () => { editor.undo(); editor.undo(); } );
	assert.equal( await page.evaluate( () => editor.selected.material.map === null ), true );
	await page.getByRole( 'button', { name: 'Layout', exact: true } ).click();
	await page.evaluate( () => editor.clear() );

}

async function checkProjectorEdgeBlend( page ) {

	await page.evaluate( async () => {

		const { projectorScript, upgradeProjectorScript } = await import( new URL( './js/assets/Projector.js?v=projector-shadows', document.baseURI ) );
		const rig = new THREE.Group();
		rig.name = 'Blend projector';
		rig.userData.assetObject = { type: 'projector' };
		rig.userData.projectionMask = { shapes: [
			{ mode: 'cutout', points: [ [ .68, .4 ], [ .76, .4 ], [ .76, .6 ], [ .68, .6 ] ] }
		] };
		const script = projectorScript( null, false, { create: function () {

			const canvas = document.createElement( 'canvas' );
			canvas.width = canvas.height = 64;
			const context = canvas.getContext( '2d' );
			context.fillStyle = '#fff';
			context.fillRect( 0, 0, 64, 64 );
			return { canvas, update() {} };

		} } );
		// Exercise the upgrade path for a saved generated projector.
		script.source = script.source.replace( /^\/\/ @\w+ (?:blend|shadow(?:Resolution|DepthBias|NormalBias|Radius))\w*.*\n/gm, '' )
			.replace( /function applyProjectorEdgeBlend\([\s\S]*?\n}\n/, '' )
			.replace( /^\s*applyProjectorEdgeBlend\( ctx, settings, x, y, w, h \);\n/m, '\n' );
		script.source = script.source.replace( /function configureProjectorShadow\([\s\S]*?\n}\n/, '' )
			.replace( /^\s*configureProjectorShadow\( light, next \);\n/m, '\n' );
		upgradeProjectorScript( script );
		const upgraded = script.source;
		upgradeProjectorScript( script );
		if ( script.source !== upgraded || ! upgraded.includes( '// @param blendGamma = ' ) || ! upgraded.includes( '// @options shadowResolution = ' ) ) throw new Error( 'Edge blend upgrade is not idempotent' );
		script.paramValues = { blendLeft: 20, blendRight: 20, blendTop: 20, blendBottom: 20, blendGamma: 2 };
		editor.addObject( rig );
		editor.addScript( rig, script );
		editor.select( rig );
		editor.scene.userData.mainCamera = rig.uuid;
		editor.scene.userData.mainCameraOutput = 'texture';

	} );
	await page.waitForFunction( () => editor.selected?.projectorOutput?.canvas );
	const values = await page.evaluate( () => {

		const projector = editor.selected;
		const { canvas, x, y, width, height } = projector.projectorOutput;
		const ctx = canvas.getContext( '2d' );
		const pixel = ( u, v ) => ctx.getImageData( Math.floor( x + width * u ), Math.floor( y + height * v ), 1, 1 ).data[ 0 ];
		const sample = [ pixel( .1, .5 ), pixel( .9, .5 ), pixel( .5, .1 ), pixel( .5, .9 ), pixel( .1, .1 ), pixel( .5, .5 ), pixel( .72, .5 ) ];
		const light = projector.children.find( child => child.isSpotLight );
		return { sample, shared: light.map.image === canvas, bias: light.shadow.bias, size: light.shadow.mapSize.x };

	} );
	assert.equal( values.shared, true );
	assert.deepEqual( [ values.bias, values.size ], [ -.0002, 1024 ] );
	await page.locator( '.Tab#scriptTab' ).click();
	await page.getByLabel( 'Shadow map resolution', { exact: true } ).selectOption( '512' );
	for ( const [ name, value ] of [ [ 'Shadow depth bias (millionths)', '-350' ], [ 'Shadow normal bias', '0.025' ], [ 'Shadow filter radius', '3' ] ] ) {

		const control = page.getByLabel( name, { exact: true } );
		await control.fill( value );
		await control.press( 'Enter' );

	}
	assert.deepEqual( await page.evaluate( () => {

		const { shadow } = editor.selected.children.find( child => child.isSpotLight );
		return [ shadow.mapSize.toArray(), shadow.bias, shadow.normalBias, shadow.radius ];

	} ), [ [ 512, 512 ], -.00035, .025, 3 ] );
	assert.ok( values.sample.slice( 0, 4 ).every( value => value >= 60 && value <= 68 ), JSON.stringify( values ) );
	assert.ok( values.sample[ 4 ] >= 13 && values.sample[ 4 ] <= 19 );
	assert.deepEqual( values.sample.slice( 5 ), [ 255, 0 ] );
	await page.getByRole( 'button', { name: 'Play Scene', exact: true } ).click();
	await page.waitForFunction( () => {

		const canvas = document.querySelector( '#player canvas' );
		if ( ! canvas?.width || ! canvas.height || ! canvas.getClientRects().length ) return false;
		const side = Math.min( canvas.width, canvas.height );
		const ctx = canvas.getContext( '2d' );
		if ( ! ctx ) return false;
		const x = ( canvas.width - side ) / 2, y = canvas.height / 2;
		const pixel = u => ctx.getImageData( Math.floor( x + side * u ), Math.floor( y ), 1, 1 ).data[ 0 ];
		return pixel( .1 ) >= 60 && pixel( .1 ) <= 68 && pixel( .5 ) === 255 && pixel( .72 ) === 0;

	} );
	await page.getByRole( 'button', { name: 'Stop Scene', exact: true } ).click();
	await page.evaluate( () => editor.clear() );

}

async function checkTextureBake( page ) {

	const rigId = await page.evaluate( () => {

		const receiver = new THREE.Mesh( new THREE.PlaneGeometry( 4, 4 ), new THREE.MeshStandardMaterial() );
		receiver.name = 'Bake Receiver';
		receiver.receiveShadow = true;
		editor.addObject( receiver );
		const blocker = new THREE.Mesh( new THREE.BoxGeometry( .85, .85, .3 ), new THREE.MeshStandardMaterial() );
		blocker.position.z = 2;
		blocker.castShadow = true;
		editor.addObject( blocker );
		const light = new THREE.DirectionalLight( 0xffffff, 2 );
		light.position.set( 0, 0, 5 );
		light.castShadow = true;
		editor.addObject( light );
		editor.addObject( new THREE.AmbientLight( 0xffffff, .05 ) );
		const rig = new THREE.Group();
		rig.name = 'Bake projector';
		rig.userData.assetObject = { type: 'projector' };
		rig.position.set( 0, 0, 5 );
		rig.projectorFrame = { width: .5, height: .5, range: 15 };
		const canvas = document.createElement( 'canvas' );
		canvas.width = canvas.height = 64;
		const context = canvas.getContext( '2d' );
		context.fillStyle = '#ff2310';
		context.fillRect( 0, 0, 64, 64 );
		rig.projectorOutput = { canvas, x: 0, y: 0, width: 64, height: 64 };
		editor.addObject( rig );
		editor.camera.position.set( 3, 0, 6 );
		editor.camera.lookAt( 0, 0, 0 );
		editor.select( receiver );
		editor.signals.cameraChanged.dispatch( editor.camera );
		return rig.uuid;

	} );
	await page.getByRole( 'button', { name: 'UV Editing', exact: true } ).click();
	await page.getByText( 'Texture Bake', { exact: true } ).click();
	await page.getByLabel( 'Bake resolution', { exact: true } ).selectOption( '256' );
	const bake = async ( pass, label, source ) => {

		await page.getByLabel( 'Bake pass', { exact: true } ).selectOption( pass );
		if ( source ) await page.getByLabel( 'Bake source view', { exact: true } ).selectOption( source );
		await page.getByRole( 'button', { name: 'Bake texture', exact: true } ).click();
		assert.match( await page.getByRole( 'region', { name: 'UV editor', exact: true } ).getByRole( 'status' ).textContent(), /Bake ready/ );
		await page.getByRole( 'button', { name: 'Add baked guide mesh', exact: true } ).click();
		return page.evaluate( label => {

			const guide = editor.scene.getObjectByName( 'Bake Receiver · ' + label );
			const image = guide.material.map.image;
			const context = image.getContext( '2d' );
			const pixel = u => [ ...context.getImageData( Math.floor( u * image.width ), image.height / 2, 1, 1 ).data ];
			const data = [ pixel( .5 ), pixel( .77 ) ];
			editor.undo();
			return data;

		}, label );

	};
	const [ shadow, lit ] = await bake( 'guide', 'Light and shadow guide' );
	assert.equal( shadow[ 3 ], 255, 'The source view can see the cast shadow' );
	assert.ok( lit[ 0 ] > shadow[ 0 ] + 60 && lit[ 3 ] === 255, 'The guide records the shadow: ' + JSON.stringify( { shadow, lit } ) );
	const [ blocked, projected ] = await bake( 'projector', 'Masked projector frame', rigId );
	assert.equal( blocked[ 3 ], 0, 'Occluders block the projector bake' );
	assert.ok( projected[ 0 ] > 235 && projected[ 1 ] < 45 && projected[ 3 ] === 255, 'The bake uses the projector frame' );
	await page.getByRole( 'button', { name: 'Layout', exact: true } ).click();
	await page.evaluate( () => editor.clear() );

}

async function checkOrthographicFly( page ) {

	const initial = await page.evaluate( () => {

		const parent = new THREE.Group();
		parent.position.set( 2, 1, -3 );
		parent.rotation.y = .4;
		const camera = new THREE.OrthographicCamera( -4, 4, 3, -3, .1, 100 );
		camera.name = 'Orthographic fly test';
		parent.add( camera );
		camera.position.copy( parent.worldToLocal( new THREE.Vector3( 0, 10, 0 ) ) );
		camera.up.set( 0, 0, -1 );
		camera.lookAt( 0, 0, 0 );
		editor.addObject( parent );
		editor.setViewportCamera( camera.uuid );
		return { position: camera.position.toArray(), zoom: camera.zoom };

	} );
	// Keep Chromium's real key events, with the same unlocked path as a browser without pointer lock.
	await page.evaluate( () => { editor.renderer.domElement.requestPointerLock = () => Promise.reject( new Error( 'Test unlocked navigation' ) ); } );
	const view = await page.locator( '#viewport' ).boundingBox();
	await page.mouse.move( view.x + view.width / 2, view.y + view.height / 2 );
	const start = () => page.keyboard.press( 'Shift+Backquote' );
	await start();
	await page.getByText( /Fly camera .*W\/S zoom/ ).waitFor();
	await page.keyboard.down( 'w' );
	await page.waitForFunction( zoom => editor.viewportCamera.zoom > zoom * 1.05, initial.zoom );
	await page.keyboard.up( 'w' );
	assert.deepEqual( await page.evaluate( () => editor.viewportCamera.position.toArray() ), initial.position );
	await page.keyboard.down( 's' );
	await page.waitForFunction( zoom => editor.viewportCamera.zoom < zoom, initial.zoom );
	await page.keyboard.up( 's' );
	await page.keyboard.down( 'e' );
	await page.waitForFunction( () => editor.viewportCamera.getWorldPosition( new THREE.Vector3() ).z < -.06 );
	await page.keyboard.up( 'e' );
	assert.ok( Math.abs( await page.evaluate( () => editor.viewportCamera.getWorldPosition( new THREE.Vector3() ).y ) - 10 ) < 1e-8 );
	await page.keyboard.press( 'Escape' );
	const capture = () => page.evaluate( () => ( {
		position: editor.viewportCamera.position.toArray(), zoom: editor.viewportCamera.zoom,
		projection: editor.viewportCamera.projectionMatrix.elements[ 0 ]
	} ) );
	const canceled = await capture();
	assert.deepEqual( canceled.position, initial.position );
	assert.equal( canceled.zoom, initial.zoom );

	await start();
	await page.keyboard.down( 'w' );
	await page.waitForFunction( zoom => editor.viewportCamera.zoom > zoom * 1.05, initial.zoom );
	await page.keyboard.up( 'w' );
	await page.keyboard.press( 'Enter' );
	const accepted = await capture();
	assert.ok( accepted.projection > canceled.projection );
	await page.evaluate( () => editor.undo() );
	assert.deepEqual( await capture(), canceled );
	await page.evaluate( () => editor.redo() );
	assert.deepEqual( await capture(), accepted );
	await page.evaluate( () => { delete editor.renderer.domElement.requestPointerLock; editor.clear(); } );

}

async function checkModalTransforms( page ) {

	const view = await page.evaluate( () => {

		const cube = new THREE.Mesh( new THREE.BoxGeometry( 2, 2, 2 ), new THREE.MeshStandardMaterial() );
		const target = new THREE.Mesh( new THREE.BoxGeometry( .2, .2, .2 ), new THREE.MeshStandardMaterial() );
		target.position.x = 2.15;
		const source = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 1 ), new THREE.MeshStandardMaterial() );
		source.position.set( -2.15, 0, -1 );
		editor.addObject( source );
		editor.addObject( cube );
		editor.addObject( target );
		editor.select( cube );
		editor.camera.position.set( 0, 0, 9 );
		editor.camera.lookAt( 0, 0, 0 );
		editor.signals.cameraChanged.dispatch( editor.camera );
		editor.config.setKey( 'settings/transformSnapTarget', 'object' );
		editor.config.setKey( 'settings/transformSnap', null );
		const { left, top, width, height } = editor.modeling.rect();
		const projectX = ( x, z ) => left + ( new THREE.Vector3( x, 0, z ).project( editor.camera ).x + 1 ) * width / 2;
		return { x: left + width / 2, y: top + height / 2, targetX: projectX( 2.15, 0 ), sourceX: projectX( -2.15, -.5 ) };

	} );
	const pose = () => page.evaluate( () => [ editor.selected.position.toArray(), editor.selected.rotation.toArray().slice( 0, 3 ) ] );
	await page.mouse.move( view.x, view.y );
	await page.keyboard.press( 'g' );
	await page.mouse.down( { button: 'middle' } );
	await page.mouse.move( view.x + 26, view.y, { steps: 4 } );
	await page.mouse.up( { button: 'middle' } );
	await page.mouse.move( view.x + 43, view.y + 23, { steps: 4 } );
	const [ constrained ] = await pose();
	assert.ok( constrained[ 0 ] > .1 );
	assert.equal( constrained[ 1 ], 0 );
	await page.keyboard.press( 'Escape' );

	await page.mouse.move( view.x, view.y );
	await page.keyboard.press( 'g' );
	await page.keyboard.down( 'Alt' );
	await page.mouse.down();
	await page.mouse.move( view.x + 30, view.y, { steps: 4 } );
	await page.keyboard.up( 'Alt' );
	await page.mouse.up();
	const altDragPose = await pose();
	assert.equal( await page.evaluate( () => editor.modalTransform.active ), false );
	await page.mouse.move( view.x + 40, view.y + 20, { steps: 4 } );
	assert.deepEqual( await pose(), altDragPose );
	assert.ok( altDragPose[ 0 ][ 0 ] > .1 );
	assert.deepEqual( altDragPose[ 0 ].slice( 1 ), [ 0, 0 ] );
	await page.evaluate( () => editor.undo() );

	await page.mouse.move( view.x, view.y );
	await page.keyboard.press( 'g' );
	await page.mouse.move( view.x + 10, view.y + 12, { steps: 3 } );
	const beforeLock = await pose();
	await page.keyboard.down( 'Alt' );
	await page.mouse.move( view.x + 40, view.y + 12, { steps: 4 } );
	assert.deepEqual( await pose(), beforeLock );
	await page.getByText( /X axis selected · release Alt to lock/ ).waitFor();
	await page.keyboard.up( 'Alt' );
	await page.getByText( /X axis locked/ ).waitFor();
	await page.mouse.move( view.x + 52, view.y + 46, { steps: 4 } );
	const [ lockedMove ] = await pose();
	assert.ok( lockedMove[ 0 ] > beforeLock[ 0 ][ 0 ] + .05 );
	assert.deepEqual( lockedMove.slice( 1 ), beforeLock[ 0 ].slice( 1 ) );
	await page.keyboard.press( 'Escape' );

	await page.mouse.move( view.x, view.y );
	await page.keyboard.press( 'r' );
	await page.keyboard.press( 'r' );
	await page.mouse.move( view.x + 32, view.y + 21, { steps: 4 } );
	const [ , rotation ] = await pose();
	assert.ok( rotation[ 0 ] > .08 && rotation[ 1 ] > .08 );
	await page.keyboard.press( 'g' );
	await page.keyboard.press( 'x' );
	await page.keyboard.press( '1' );
	await page.keyboard.press( 'Enter' );
	assert.deepEqual( await pose(), [ [ 1, 0, 0 ], rotation ] );
	await page.evaluate( () => editor.undo() );
	assert.deepEqual( await pose(), [ [ 0, 0, 0 ], [ 0, 0, 0 ] ] );

	await page.mouse.move( view.x, view.y );
	await page.keyboard.press( 'g' );
	await page.keyboard.press( 'b' );
	await page.getByText( /Click a reference point in the scene/ ).waitFor();
	await page.mouse.click( view.sourceX, view.y );
	const marker = page.locator( '.transform-snap-base:visible' );
	await marker.waitFor();
	const sourceMarker = await marker.boundingBox();
	await page.mouse.move( view.targetX, view.y, { steps: 5 } );
	assert.ok( ( await marker.boundingBox() ).x > sourceMarker.x + 25 );
	const [ snapped ] = await pose();
	assert.ok( Math.abs( snapped[ 0 ] - 4.3 ) < .02 && Math.abs( snapped[ 2 ] - .5 ) < .01 );
	await page.keyboard.down( 'Control' );
	assert.ok( Math.abs( ( await pose() )[ 0 ][ 2 ] ) < .01 );
	await page.keyboard.up( 'Control' );
	assert.ok( Math.abs( ( await pose() )[ 0 ][ 2 ] - .5 ) < .01 );
	await page.keyboard.press( 'Escape' );
	await page.evaluate( () => {

		editor.config.setKey( 'settings/transformSnap', null );
		editor.config.setKey( 'settings/transformSnapTarget', 'grid' );
		editor.viewTools.setWorkspaceMode( 'edit' );
		editor.modeling.selectPoints( true );

	} );
	await page.mouse.move( view.x, view.y );
	await page.keyboard.press( 'g' );
	await page.keyboard.down( 'Alt' );
	await page.keyboard.down( 'Shift' );
	await page.mouse.move( view.x + 30, view.y, { steps: 4 } );
	await page.keyboard.up( 'Alt' );
	await page.keyboard.up( 'Shift' );
	await page.getByText( /XZ plane locked/ ).waitFor();
	assert.equal( await page.evaluate( () => editor.modeling.gesture.axis ), 'XZ' );
	await page.keyboard.press( 'b' );
	await page.mouse.click( view.sourceX, view.y );
	assert.ok( Math.abs( await page.evaluate( () => editor.modeling.gesture.snapBase.z ) + .5 ) < 1e-6 );
	await page.keyboard.press( 'Escape' );
	await page.evaluate( () => editor.config.setKey( 'settings/transformSnap', null ) );

	await page.mouse.move( view.x, view.y );
	await page.keyboard.press( 'r' );
	await page.keyboard.press( 'r' );
	await page.mouse.move( view.x + 30, view.y + 20, { steps: 4 } );
	const draft = await page.evaluate( () => editor.modeling.gesture.draft.points );
	assert.equal( await page.evaluate( () => editor.modeling.gesture.trackball ), true );
	assert.ok( await page.evaluate( () => editor.modeling.pointsChanged( editor.modeling.gesture ) ) );
	await page.keyboard.press( 'g' );
	await page.keyboard.press( 'x' );
	await page.keyboard.press( '1' );
	await page.keyboard.press( 'Enter' );
	const moved = await page.evaluate( () => editor.modeling.data.points );
	assert.ok( moved.every( ( point, i ) => Math.abs( point[ 0 ] - draft[ i ][ 0 ] - 1 ) < 1e-6 ) );
	await page.evaluate( () => { editor.undo(); editor.viewTools.setWorkspaceMode( 'object' ); } );

	await page.mouse.move( view.x, view.y );
	await page.keyboard.down( 'Control' );
	await page.mouse.down();
	await page.mouse.move( view.x + 30, view.y, { steps: 3 } );
	await page.keyboard.up( 'Control' );
	await page.mouse.up();
	await page.evaluate( ( { x, y } ) => editor.renderer.domElement.dispatchEvent( new MouseEvent( 'contextmenu', {
		bubbles: true, cancelable: true, button: 2, clientX: x + 30, clientY: y
	} ) ), view );
	const menu = page.locator( '.context-menu' );
	assert.equal( await menu.isVisible(), false );
	await page.mouse.move( view.x, view.y );
	await page.mouse.down( { button: 'right' } );
	await page.mouse.move( view.x + 20, view.y, { steps: 3 } );
	await page.mouse.up( { button: 'right' } );
	assert.equal( await menu.isVisible(), false );
	await page.mouse.click( view.x, view.y, { button: 'right' } );
	assert.equal( await menu.isVisible(), true );
	await page.keyboard.press( 'Escape' );
	await page.evaluate( () => editor.clear() );

}

async function checkViewportControls( page ) {

	await page.evaluate( () => {

		const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshStandardMaterial() );
		mesh.name = 'Viewport controls test';
		mesh.rotation.order = 'ZYX';
		editor.addObject( mesh );
		editor.select( mesh );

	} );
	const item = page.getByRole( 'region', { name: 'Viewport Item', exact: true } );
	const toggle = page.getByRole( 'button', { name: 'Viewport Sidebar', exact: true } );
	const viewport = page.locator( '#viewport' );
	const shelf = page.getByRole( 'group', { name: 'Viewport Toolbar', exact: true } );
	const showShelf = page.getByRole( 'button', { name: 'Show Viewport Toolbar', exact: true } );
	const overlays = page.getByRole( 'button', { name: 'Toggle Viewport Overlays', exact: true } );
	const hoverView = async () => {

		const rect = await viewport.boundingBox();
		await page.mouse.move( rect.x + rect.width * .45, rect.y + rect.height * .6 );

	};
	await hoverView();
	await page.keyboard.press( 't' );
	assert.equal( await shelf.isVisible(), false );
	assert.equal( await page.locator( '#toolbar' ).isVisible(), true );
	await showShelf.click();
	assert.equal( await shelf.isVisible(), true );
	await page.locator( '#outliner' ).hover();
	await page.keyboard.press( 't' );
	assert.equal( await shelf.isVisible(), true );
	await hoverView();
	await page.evaluate( () => editor.setViewportObjectNames( true ) );
	const gridDrawn = () => page.evaluate( () => {

		const renderer = editor.renderer;
		const render = renderer.render;
		let drawn = false;
		renderer.render = function ( object, ...args ) {

			drawn ||= object.isGroup === true && object.children.length > 0 && object.children.every( child => child.type === 'GridHelper' );
			return render.call( this, object, ...args );

		};
		try { editor.signals.viewportOverlaysChanged.dispatch(); }
		finally { renderer.render = render; }
		return drawn;

	} );
	assert.equal( await gridDrawn(), true );
	await page.keyboard.press( 'Shift+Alt+z' );
	assert.equal( await overlays.getAttribute( 'aria-pressed' ), 'false' );
	assert.equal( await gridDrawn(), false );
	assert.equal( await page.locator( '.viewport-labels' ).isVisible(), false );
	assert.equal( await page.locator( '.viewport-tool-overlay' ).isVisible(), false );
	assert.equal( await page.evaluate( () => editor.viewportShading ), 'solid' );
	await overlays.click();
	assert.equal( await gridDrawn(), true );
	assert.equal( await page.locator( '.viewport-labels' ).isVisible(), true );
	assert.equal( await page.locator( '.viewport-tool-overlay' ).isVisible(), true );
	await page.evaluate( () => editor.setViewportObjectNames( false ) );
	await hoverView();
	await page.keyboard.press( 'n' );
	assert.equal( await item.isVisible(), true );
	assert.equal( await page.locator( '#sidebar' ).isVisible(), true );
	const x = item.getByLabel( 'Location X', { exact: true } );
	await x.fill( '0.005' );
	await x.press( 'Enter' );
	assert.equal( await page.evaluate( () => editor.selected.position.x ), .005 );
	assert.equal( Number( await page.locator( '#properties' ).getByLabel( 'Position X', { exact: true } ).inputValue() ), .005 );
	const z = item.getByLabel( 'Rotation Z', { exact: true } );
	await z.fill( '0.4' );
	await z.press( 'Enter' );
	assert.ok( Math.abs( await page.evaluate( () => editor.selected.rotation.z ) - .4 * Math.PI / 180 ) < 1e-9 );
	assert.equal( await page.evaluate( () => editor.selected.rotation.order ), 'ZYX' );
	await page.evaluate( () => { document.activeElement.blur(); editor.undo(); } );
	assert.equal( await page.evaluate( () => editor.selected.rotation.z ), 0 );
	await hoverView();
	await page.keyboard.press( 'Tab' );
	await page.keyboard.press( 'a' );
	const median = item.getByLabel( 'Median X', { exact: true } );
	await median.fill( '0.25' );
	await median.press( 'Enter' );
	const coordinates = await page.evaluate( () => {

		const { indices, data } = editor.modeling;
		return [ indices.reduce( ( sum, index ) => sum + data.points[ index ][ 0 ], 0 ) / indices.length, editor.selected.position.x ];

	} );
	assert.deepEqual( coordinates, [ .25, .005 ] );
	await page.evaluate( () => document.activeElement.blur() );
	await page.keyboard.press( 'Tab' );
	assert.equal( await x.isVisible(), true );
	assert.equal( await median.isVisible(), false );
	await page.keyboard.press( 'n' );
	assert.equal( await item.isVisible(), false );
	await page.setViewportSize( { width: 390, height: 844 } );
	await toggle.click();
	const narrow = await viewport.boundingBox(), panel = await item.boundingBox();
	assert.ok( panel.x >= narrow.x && panel.x + panel.width <= narrow.x + narrow.width );
	assert.ok( panel.y >= narrow.y && panel.y + panel.height <= narrow.y + narrow.height );
	assert.ok( panel.height >= 155, 'Numeric controls need room below the header at a narrow width' );
	await toggle.click();
	await page.setViewportSize( { width: 1440, height: 900 } );
	await page.evaluate( () => editor.clear() );

}

async function checkPaintGestures( page ) {

	const ends = await page.evaluate( () => {

		const camera = editor.camera;
		camera.position.set( 0, 0, 5 );
		camera.lookAt( 0, 0, 0 );
		camera.updateMatrixWorld();
		editor.signals.cameraChanged.dispatch( camera );
		const rect = editor.renderer.domElement.getBoundingClientRect();
		return [ -.6, .6 ].map( ( x, index ) => {

			const receiver = new THREE.Mesh( new THREE.PlaneGeometry( 1, 1 ), new THREE.MeshBasicMaterial() );
			receiver.name = 'Paint receiver ' + index;
			receiver.position.x = x;
			receiver.scale.set( 1, 1.2, 1 );
			editor.addObject( receiver );
			const point = receiver.position.clone().project( camera );
			return [ rect.left + ( 1 + point.x ) * rect.width / 2, rect.top + ( 1 - point.y ) * rect.height / 2 ];

		} );

	} );
	const mode = page.getByLabel( 'Interaction mode', { exact: true } );
	await mode.selectOption( 'paint' );
	const output = page.getByLabel( 'Brush output' );
	const [ start, end ] = ends;
	const paint = async ( yOffset, cancel = false ) => {

		await page.mouse.move( start[ 0 ], start[ 1 ] + yOffset );
		await page.mouse.down();
		await page.mouse.move( end[ 0 ], end[ 1 ] + yOffset, { steps: 12 } );
		if ( cancel ) await page.keyboard.press( 'Escape' );
		await page.mouse.up();

	};
	for ( const medium of [ 'texture', 'vector' ] ) {

		await output.selectOption( medium );
		const hasPaint = () => page.evaluate( medium => [ 0, 1 ].map( index => {

			const receiver = editor.scene.getObjectByName( 'Paint receiver ' + index );
			return medium === 'texture' ? !! receiver.material.map :
				receiver.children.some( child => child.isLine && child.userData.surfaceMark && ! child.userData.runtimeOnly );

		} ), medium );
		const before = await page.evaluate( () => editor.history.undos.length );
		await paint( 0, true );
		assert.deepEqual( await hasPaint(), [ false, false ] );
		assert.equal( await page.evaluate( () => editor.history.undos.length ), before );
		await paint( 0 );
		assert.deepEqual( await hasPaint(), [ true, true ] );
		await page.evaluate( () => editor.undo() );
		assert.deepEqual( await hasPaint(), [ false, false ] );
		await page.evaluate( () => editor.redo() );
		assert.deepEqual( await hasPaint(), [ true, true ] );
		await page.evaluate( () => editor.undo() );

	}
	await output.selectOption( 'splat' );
	const batches = () => page.evaluate( () => [ 0, 1 ].map( index => {

		const receiver = editor.scene.getObjectByName( 'Paint receiver ' + index );
		return receiver.children.filter( child => child.userData.assetObject?.paintBatch ).map( object => ( {
			uuid: object.uuid, data: object.userData.assetObject.splatData
		} ) );

	} ) );
	const waitForSplats = () => page.waitForFunction( () => [ 0, 1 ].every( index => {

		const receiver = editor.scene.getObjectByName( 'Paint receiver ' + index );
		const batch = receiver.children.find( child => child.userData.assetObject?.paintBatch );
		const mesh = batch?.getObjectByName( 'SplatMesh' );
		return mesh?.isInitialized && mesh.numSplats * 32 === atob( batch.userData.assetObject.splatData ).length;

	} ) );

	await paint( -8 );
	await waitForSplats();
	const first = await batches();
	assert.deepEqual( first.map( list => list.length ), [ 1, 1 ] );
	await page.getByLabel( 'Color', { exact: true } ).fill( '#f18b43' );
	await paint( -8 );
	await waitForSplats();
	const second = await batches();
	assert.deepEqual( second.map( list => list.length ), [ 1, 1 ] );
	for ( let i = 0; i < 2; i ++ ) {

		assert.equal( second[ i ][ 0 ].uuid, first[ i ][ 0 ].uuid );
		const initial = atob( first[ i ][ 0 ].data ), appended = atob( second[ i ][ 0 ].data );
		assert.ok( appended.length > initial.length );
		assert.ok( appended.startsWith( initial ) );
		assert.notEqual( appended.slice( initial.length + 24, initial.length + 27 ), initial.slice( 24, 27 ) );

	}
	const history = await page.evaluate( () => editor.history.undos.length );
	await paint( 25, true );
	assert.deepEqual( await batches(), second );
	assert.equal( await page.evaluate( () => editor.history.undos.length ), history );
	assert.equal( await page.evaluate( () => editor.viewTools.stroke ), null );
	await page.evaluate( () => editor.undo() );
	assert.deepEqual( await batches(), first );
	await waitForSplats();
	await page.evaluate( () => editor.redo() );
	assert.deepEqual( await batches(), second );
	await waitForSplats();
	await mode.selectOption( 'object' );
	await page.evaluate( async () => {

		const save = JSON.stringify( editor.toJSON() );
		editor.clear();
		await editor.fromJSON( JSON.parse( save ) );

	} );
	assert.deepEqual( await batches(), second );
	await waitForSplats();
	const attached = await page.evaluate( () => {

		const receiver = editor.scene.getObjectByName( 'Paint receiver 0' );
		const batch = receiver.children.find( child => child.userData.assetObject?.paintBatch );
		const mesh = batch.getObjectByName( 'SplatMesh' );
		const sample = new THREE.Vector3();
		mesh.forEachSplat( ( index, center ) => { if ( index === 0 ) sample.copy( center ); } );
		const before = mesh.localToWorld( sample.clone() );
		receiver.rotation.z = .45;
		receiver.scale.y = 1.8;
		receiver.position.y = .4;
		const actual = mesh.localToWorld( sample.clone() );
		return actual.distanceTo( before ) > .2 && actual.distanceTo( receiver.localToWorld( sample ) ) < 1e-7;

	} );
	assert.equal( attached, true );
	await page.evaluate( () => editor.clear() );

}

async function checkSplatFilters( page ) {

	await page.evaluate( async () => {

		const { splatScript } = await import( new URL( 'js/assets/SplatObjects.js', document.baseURI ).href );
		const bytes = new Uint8Array( 96 );
		const packed = new DataView( bytes.buffer );
		for ( const [ i, [ size, opacity ] ] of [ [ .02, 250 ], [ .12, 64 ], [ .4, 250 ] ].entries() ) {

			const offset = i * 32;
			packed.setFloat32( offset, i - 1, true );
			for ( let axis = 0; axis < 3; axis ++ ) packed.setFloat32( offset + 12 + 4 * axis, size, true );
			bytes.set( [ 255, 255, 255, opacity, 255, 128, 128, 128 ], offset + 24 );

		}
		const object = new THREE.Group();
		object.userData.assetObject = { type: 'splat', splatData: btoa( String.fromCharCode( ...bytes ) ) };
		editor.addObject( object );
		editor.addScript( object, splatScript( null ) );
		editor.select( object );

	} );
	await page.waitForFunction( () => editor.selected.getObjectByName( 'SplatMesh' )?.isInitialized );
	await page.locator( '.Tab#scriptTab' ).click();
	const inspect = () => page.evaluate( () => {

		const mesh = editor.selected.getObjectByName( 'SplatMesh' );
		const opacities = [];
		mesh.forEachSplat( ( i, center, scale, rotation, opacity ) => { opacities.push( [ center.x, opacity ] ); } );
		return { opacities: opacities.sort( ( a, b ) => a[ 0 ] - b[ 0 ] ), points: editor.selected.getObjectByName( 'SplatPoints' )?.geometry.attributes.position.count };

	} );
	const before = await inspect();
	const change = async ( field, value ) => {

		const control = page.getByLabel( field, { exact: true } );
		await control.fill( value );
		await control.press( 'Enter' );

	};
	await change( 'Min. opacity (confidence proxy)', '0.5' );
	assert.deepEqual( ( await inspect() ).opacities.map( entry => entry[ 1 ] > 0 ), [ true, false, true ] );
	await change( 'Max. splat size (0 = off)', '0.2' );
	assert.deepEqual( ( await inspect() ).opacities.map( entry => entry[ 1 ] > 0 ), [ true, false, false ] );
	await page.getByRole( 'switch', { name: 'Points only', exact: true } ).click();
	assert.equal( ( await inspect() ).points, 1 );
	await change( 'Min. splat size (0 = off)', '0.05' );
	assert.equal( ( await inspect() ).points, 0 );
	await page.evaluate( () => editor.undo() );
	assert.equal( ( await inspect() ).points, 1 );
	await change( 'Min. opacity (confidence proxy)', '0' );
	await change( 'Max. splat size (0 = off)', '0' );
	assert.deepEqual( await inspect(), { ...before, points: 3 } );
	await page.evaluate( () => editor.clear() );

}

async function checkScriptParameterLayout( page ) {

	await page.evaluate( async () => {

		const { splatScript } = await import( new URL( 'js/assets/SplatObjects.js', document.baseURI ).href );
		const { name, source } = splatScript( null );
		const object = new THREE.Group();
		editor.addObject( object );
		editor.addScript( object, { name, source: source.split( 'let splat,' )[ 0 ] + '\nconst unkeyed = 1; /* 0..2 */' } );
		editor.select( object );

	} );
	await page.locator( '.Tab#scriptTab' ).click();
	const component = page.getByRole( 'group', { name: 'Gaussian Splat', exact: true } );
	const points = component.getByRole( 'switch', { name: 'Points only', exact: true } );
	await points.waitFor();
	assert.equal( await points.isChecked(), false );
	await points.press( 'Space' );
	assert.equal( await points.isChecked(), true );
	assert.equal( await page.evaluate( () => editor.scripts[ editor.selected.uuid ][ 0 ].paramValues.pointCloud ), true );
	await page.evaluate( () => editor.undo() );
	assert.equal( await points.isChecked(), false );
	const style = await page.evaluate( () => editor.config.getKey( 'settings/uiStyle' ) );
	for ( const mode of [ 'compact', 'clean' ] ) {

		await page.evaluate( mode => { editor.config.setKey( 'settings/uiStyle', mode ); editor.signals.uiStyleChanged.dispatch(); }, mode );
		const rows = await component.locator( '.script-parameter-row' ).evaluateAll( rows => rows.map( row => {

			const value = row.querySelector( '.script-param-value' ).getBoundingClientRect();
			const key = row.querySelector( '.timeline-key-dot' )?.getBoundingClientRect();
			return { value: value.left, key: key?.left, fits: value.right <= row.getBoundingClientRect().right + 1 };

		} ) );
		assert.ok( rows.length >= 5 );
		assert.ok( rows.every( row => row.fits && row.value === rows[ 0 ].value ) );
		assert.ok( rows.filter( row => row.key !== undefined ).every( row => row.key === rows[ 0 ].key ) );
		assert.ok( ( await points.boundingBox() ).width >= 24 );

	}
	await page.evaluate( style => {

		editor.config.setKey( 'settings/uiStyle', style );
		editor.signals.uiStyleChanged.dispatch();
		editor.clear();

	}, style );

}

async function checkComponents( page ) {

	await page.evaluate( () => {

		for ( const name of [ 'Component source', 'Component target' ] ) {

			const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshStandardMaterial() );
			mesh.name = name;
			editor.addObject( mesh );

		}
		editor.select( editor.scene.getObjectByName( 'Component source' ) );

	} );
	await page.locator( '.Tab#scriptTab' ).click();
	const add = page.getByRole( 'button', { name: 'Add Component', exact: true } );
	const picker = page.getByRole( 'dialog', { name: 'Add Component', exact: true } );
	await add.click();
	await picker.getByRole( 'button', { name: 'Spin', exact: true } ).click();
	const speed = page.getByLabel( 'Degrees per second', { exact: true } );
	await speed.fill( '90' );
	await speed.press( 'Enter' );
	await page.evaluate( () => {

		const object = editor.scene.getObjectByName( 'Component source' );
		const script = editor.scripts[ object.uuid ][ 0 ];
		editor.timeline.insertKey( { kind: 'script', object: object.uuid, index: 0, scriptId: script.timelineId, property: 'speed' } );
		editor.select( editor.scene.getObjectByName( 'Component target' ) );

	} );
	await page.keyboard.press( 'F3' );
	const palette = page.getByRole( 'dialog', { name: 'Command palette' } );
	await palette.getByRole( 'searchbox' ).fill( 'Add Component' );
	await palette.getByRole( 'button', { name: 'Add Component', exact: true } ).click();
	const search = picker.getByRole( 'searchbox', { name: 'Search Add Component' } );
	await search.fill( 'Spin Component source' );
	await search.press( 'Enter' );
	assert.equal( await picker.isVisible(), false );
	assert.equal( Number( await speed.inputValue() ), 90 );
	const identities = await page.evaluate( () => [ 'Component source', 'Component target' ].map( name => {

		const object = editor.scene.getObjectByName( name );
		const script = editor.scripts[ object.uuid ][ 0 ];
		return [ script.timelineId, script.paramValues.speed ];

	} ) );
	assert.ok( identities.every( ( [ id ] ) => id ) );
	assert.notEqual( identities[ 0 ][ 0 ], identities[ 1 ][ 0 ] );
	await speed.fill( '-120' );
	await speed.press( 'Enter' );
	const header = page.getByRole( 'group', { name: 'Spin', exact: true } );
	await header.hover();
	await page.keyboard.press( 'Control+Space' );
	const previous = page.getByRole( 'button', { name: 'Back to Previous' } );
	assert.equal( await previous.isVisible(), true );
	await header.getByRole( 'button', { name: 'Edit', exact: true } ).click();
	assert.equal( await previous.isVisible(), false );
	await page.locator( '#script-window .code-target' ).getByText( /Component target.*Spin/ ).waitFor();
	await page.evaluate( () => {

		const cm = document.querySelector( '#script-window .CodeMirror' ).CodeMirror;
		cm.setValue( cm.getValue() + '\n// Script Window draft' );
		cm.setCursor( 2, 3 );
		// Switch editors before the debounced autosave runs.
		document.querySelector( '.workspace-tabs [aria-label="Layout"]' ).click();

	} );
	assert.ok( await page.evaluate( () => editor.scripts[ editor.selected.uuid ][ 0 ].source.endsWith( '// Script Window draft' ) ) );
	await page.getByRole( 'button', { name: 'Scripting', exact: true } ).click();
	assert.deepEqual( await page.evaluate( () => {

		const { line, ch } = document.querySelector( '#script-window .CodeMirror' ).CodeMirror.getCursor();
		return [ line, ch ];

	} ), [ 2, 3 ] );
	await page.getByRole( 'button', { name: 'Close editor area' } ).click();
	await page.getByRole( 'checkbox', { name: 'Enable Spin' } ).uncheck();
	const reloaded = await page.evaluate( async () => {

		const json = JSON.stringify( editor.toJSON() );
		editor.clear();
		await editor.fromJSON( JSON.parse( json ) );
		const source = editor.scene.getObjectByName( 'Component source' );
		const target = editor.scene.getObjectByName( 'Component target' );
		editor.select( target );
		return [ source, target ].map( object => {

			const script = editor.scripts[ object.uuid ][ 0 ];
			return [ script.timelineId, script.paramValues.speed, script.enabled ];

		} );

	} );
	assert.deepEqual( reloaded, [ [ identities[ 0 ][ 0 ], 90, true ], [ identities[ 1 ][ 0 ], -120, false ] ] );
	await page.locator( '.Tab#scriptTab' ).click();
	await page.evaluate( () => {

		window.componentTurns = {};
		for ( const name of [ 'Component source', 'Component target' ] ) editor.addScript( editor.scene.getObjectByName( name ), {
			name: 'Probe', source: 'function update() { window.componentTurns[this.name] = this.rotation.y; }'
		} );
	} );
	await page.getByRole( 'button', { name: 'Play Scene', exact: true } ).click();
	await page.waitForFunction( () => window.componentTurns[ 'Component source' ] > .04 && window.componentTurns[ 'Component target' ] === 0 );
	await page.getByRole( 'button', { name: 'Stop Scene', exact: true } ).click();
	await page.getByRole( 'checkbox', { name: 'Enable Spin' } ).check();
	await page.evaluate( () => {

		window.componentTurns = {};
		editor.signals.startPlayer.dispatch();

	} );
	await page.waitForFunction( () => window.componentTurns[ 'Component source' ] > .04 && window.componentTurns[ 'Component target' ] < -.04 );
	await page.evaluate( () => {

		editor.signals.stopPlayer.dispatch();
		editor.clear();

	} );

}

async function checkHierarchy( page ) {

	const original = await page.evaluate( () => {

		editor.config.setKey( 'settings/history', true );
		const parent = new THREE.Group();
		parent.name = 'Parent test';
		parent.position.set( 1, 2, 3 );
		parent.rotation.set( .2, -.4, .1 );
		parent.scale.setScalar( 1.5 );
		const children = [ 'First child', 'Second child' ].map( ( name, index ) => {

			const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshBasicMaterial() );
			mesh.name = name;
			mesh.position.set( index * 2, index - 1, 0 );
			mesh.rotation.set( -.3, .1, .6, 'ZYX' );
			editor.addObject( mesh );
			mesh.updateWorldMatrix( true, false );
			return mesh;

		} );
		editor.addObject( parent );
		editor.selector.setSelection( [ ...children, parent ] );
		return { worlds: children.map( object => object.matrixWorld.toArray() ), order: editor.scene.children.map( object => object.name ) };

	} );
	const view = await page.locator( '#viewport' ).boundingBox();
	await page.mouse.move( view.x + view.width * .45, view.y + view.height * .55 );
	const parentMenu = page.getByRole( 'dialog', { name: 'Set Parent', exact: true } );
	await page.evaluate( () => editor.scene.getObjectByName( 'Parent test' ).scale.set( 1, 2, 3 ) );
	await page.keyboard.press( 'Control+p' );
	await parentMenu.getByRole( 'button', { name: 'Object (Keep Transform)', exact: true } ).click();
	assert.equal( await page.evaluate( () => editor.history.undos.length ), 0 );
	assert.deepEqual( await page.evaluate( () => editor.scene.children.map( object => object.name ) ), original.order );
	await page.evaluate( () => editor.scene.getObjectByName( 'Parent test' ).scale.setScalar( 1.5 ) );
	await page.keyboard.press( 'Control+p' );
	await parentMenu.getByRole( 'button', { name: 'Object (Keep Transform)', exact: true } ).click();
	const hierarchy = () => page.evaluate( () => {

		const children = [ 'First child', 'Second child' ].map( name => editor.scene.getObjectByName( name ) );
		children.forEach( object => object.updateWorldMatrix( true, false ) );
		return {
			parents: children.map( object => object.parent.name ),
			worlds: children.map( object => object.matrixWorld.toArray() ),
			order: editor.scene.children.map( object => object.name )
		};

	} );
	const assertWorld = matrices => matrices.forEach( ( matrix, index ) => {

		assert.ok( matrix.every( ( value, entry ) => Math.abs( value - original.worlds[ index ][ entry ] ) < 1e-9 ) );

	} );
	const parented = await hierarchy();
	assert.deepEqual( parented.parents, [ 'Parent test', 'Parent test' ] );
	assertWorld( parented.worlds );
	await page.evaluate( async () => {

		const saved = JSON.parse( JSON.stringify( editor.toJSON() ) );
		editor.clear();
		await editor.fromJSON( saved );

	} );
	assertWorld( ( await hierarchy() ).worlds );
	await page.evaluate( () => editor.undo() );
	assert.deepEqual( ( await hierarchy() ).order, original.order );
	await page.evaluate( () => editor.redo() );
	assertWorld( ( await hierarchy() ).worlds );
	await page.evaluate( () => editor.selector.setSelection( [ 'First child', 'Second child' ].map( name => editor.scene.getObjectByName( name ) ) ) );
	await page.keyboard.press( 'Alt+p' );
	await page.getByRole( 'dialog', { name: 'Clear Parent', exact: true } ).getByRole( 'button', { name: 'Clear and Keep Transform', exact: true } ).click();
	const cleared = await hierarchy();
	assert.equal( cleared.parents[ 0 ], cleared.parents[ 1 ] );
	assert.notEqual( cleared.parents[ 0 ], 'Parent test' );
	assertWorld( cleared.worlds );
	await page.keyboard.press( 'F2' );
	const rename = page.getByRole( 'dialog', { name: 'Rename Object', exact: true } );
	const name = rename.getByRole( 'textbox', { name: 'Object Name' } );
	assert.equal( await name.inputValue(), 'Second child' );
	await name.fill( 'Renamed child' );
	await name.press( 'Enter' );
	assert.equal( await page.locator( '#outliner' ).getByText( 'Renamed child', { exact: true } ).isVisible(), true );
	await page.evaluate( () => { editor.undo(); editor.undo(); } );
	assert.deepEqual( ( await hierarchy() ).parents, [ 'Parent test', 'Parent test' ] );
	assertWorld( ( await hierarchy() ).worlds );
	await page.evaluate( () => {

		editor.config.setKey( 'settings/history', false );
		editor.clear();

	} );

}

async function checkDuplication( page ) {

	const source = await page.evaluate( () => {

		editor.config.setKey( 'settings/history', true );
		const stage = new THREE.Group();
		stage.name = 'Duplicate stage';
		stage.rotation.y = .3;
		stage.scale.setScalar( 1.5 );
		const actor = new THREE.Group();
		actor.name = 'Actor';
		stage.add( actor );
		const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshStandardMaterial() );
		mesh.name = 'Actor mesh';
		mesh.geometry.userData.points = [ 4, 5 ];
		actor.add( mesh );
		const rigGeometry = new THREE.BufferGeometry().copy( new THREE.BoxGeometry() );
		const vertices = rigGeometry.attributes.position.count;
		const weights = new Float32Array( vertices * 4 );
		for ( let index = 0; index < vertices; index ++ ) weights[ index * 4 ] = 1;
		rigGeometry.setAttribute( 'skinIndex', new THREE.Uint16BufferAttribute( new Uint16Array( vertices * 4 ), 4 ) );
		rigGeometry.setAttribute( 'skinWeight', new THREE.Float32BufferAttribute( weights, 4 ) );
		const rig = new THREE.SkinnedMesh( rigGeometry, mesh.material );
		rig.name = 'Actor rig';
		const bone = new THREE.Bone();
		bone.name = 'Actor bone';
		rig.add( bone );
		rig.bind( new THREE.Skeleton( [ bone ] ) );
		actor.add( rig );
		const runtime = new THREE.Object3D();
		runtime.userData.runtimeOnly = true;
		actor.add( runtime );
		const lamp = new THREE.SpotLight();
		lamp.name = 'Actor lamp';
		lamp.target.name = 'Actor lamp target';
		stage.add( lamp, lamp.target );
		editor.addObject( stage );
		const script = { name: 'Spin', source: '// @param speed = 1\nfunction update() {}', paramValues: { speed: 2 }, timelineId: 'source-spin' };
		editor.addScript( mesh, script );
		const animation = new THREE.AnimationClip( 'Actor motion', 1, [ new THREE.NumberKeyframeTrack( 'Actor.position[y]', [ 0, 1 ], [ 0, 1 ] ) ] );
		actor.animations.push( animation );
		editor.scene.userData.timeline = { fps: 30, clips: [ {
			id: 'source-clip', name: 'Spin animation', start: 0, duration: 2,
			animation: { object: actor.uuid, clip: animation.uuid },
			tracks: [ { target: { kind: 'script', object: mesh.uuid, property: 'speed', index: 0, scriptId: script.timelineId },
				keys: [ { time: 0, value: 3 }, { time: 1, value: 6 } ] } ]
		} ] };
		editor.signals.objectChanged.dispatch( editor.scene, 'userData' );
		editor.selector.setSelection( [ actor, mesh, lamp ] );
		return actor.getWorldPosition( new THREE.Vector3() ).toArray();

	} );
	const viewport = await page.locator( '#viewport' ).boundingBox();
	await page.mouse.move( viewport.x + viewport.width * .5, viewport.y + viewport.height * .55 );
	await page.keyboard.press( 'Shift+d' );
	assert.equal( await page.evaluate( () => editor.modalTransform.active ), true );
	await page.keyboard.press( 'x' );
	await page.keyboard.press( '2' );
	await page.keyboard.press( 'Enter' );
	const inspectCopies = () => page.evaluate( () => {

		const source = editor.scene.getObjectByName( 'Actor' );
		const actor = editor.scene.getObjectByName( 'Actor.001' );
		const mesh = actor.getObjectByName( 'Actor mesh' );
		const original = source.getObjectByName( 'Actor mesh' );
		const lamp = editor.scene.getObjectByName( 'Actor lamp.001' );
		const script = editor.scripts[ mesh.uuid ][ 0 ];
		const clip = editor.scene.userData.timeline.clips[ 1 ];
		const track = clip.tracks[ 0 ];
		const rig = actor.getObjectByName( 'Actor rig' );
		const animation = actor.animations[ 0 ];
		return {
			parent: actor.parent.name, rootPosition: actor.getWorldPosition( new THREE.Vector3() ).toArray(),
			independent: mesh.geometry !== original.geometry && mesh.geometry.userData.points !== original.geometry.userData.points,
			sharedMaterial: mesh.material === original.material,
			children: actor.children.map( child => child.name ),
			scriptId: script.timelineId, parameter: script.paramValues.speed,
			timeline: track.target.object === mesh.uuid && track.target.scriptId === script.timelineId,
			animation: clip.animation.object === actor.uuid && clip.animation.clip === animation.uuid && animation.tracks[ 0 ].name === 'Actor.001.position[y]',
			rig: rig.skeleton.bones[ 0 ] === rig.getObjectByName( 'Actor bone' ) &&
				rig.skeleton.bones[ 0 ] !== source.getObjectByName( 'Actor bone' ),
			target: lamp.target.name, selection: editor.selector.selection.map( object => object.name )
		};

	} );
	const copies = await inspectCopies();
	assert.equal( copies.parent, 'Duplicate stage' );
	assert.ok( Math.abs( copies.rootPosition[ 0 ] - source[ 0 ] - 2 ) < 1e-9 );
	assert.equal( copies.independent, true );
	assert.equal( copies.sharedMaterial, true );
	assert.deepEqual( copies.children, [ 'Actor mesh', 'Actor rig' ] );
	assert.notEqual( copies.scriptId, 'source-spin' );
	assert.equal( copies.parameter, 2 );
	assert.equal( copies.timeline, true );
	assert.equal( copies.animation, true );
	assert.equal( copies.rig, true );
	assert.equal( copies.target, 'Actor lamp target.001' );
	assert.deepEqual( copies.selection, [ 'Actor.001', 'Actor lamp.001' ] );
	await page.evaluate( () => editor.undo() );
	assert.deepEqual( await page.evaluate( () => editor.selector.selection.map( object => object.name ) ), [ 'Actor', 'Actor mesh', 'Actor lamp' ] );
	assert.equal( await page.evaluate( () => !! editor.scene.getObjectByName( 'Actor.001' ) ), false );
	assert.equal( await page.evaluate( () => editor.scene.userData.timeline.clips.length ), 1 );
	await page.evaluate( async () => {

		const save = JSON.parse( JSON.stringify( editor.toJSON() ) );
		editor.clear();
		await editor.fromJSON( save );
		editor.redo();

	} );
	const { rootPosition, ...restored } = await inspectCopies();
	const { rootPosition: savedPosition, ...expected } = copies;
	assert.ok( rootPosition.every( ( value, index ) => Math.abs( value - savedPosition[ index ] ) < 1e-9 ) );
	assert.deepEqual( restored, expected );
	const frame = page.getByLabel( 'Frame', { exact: true } );
	await frame.fill( '15' );
	await frame.press( 'Enter' );
	assert.deepEqual( await page.evaluate( () => [ 'Actor', 'Actor.001' ].map( name => editor.scene.getObjectByName( name ).position.y ) ), [ .5, .5 ] );
	await page.evaluate( () => { editor.animationCommands.animationStop(); document.activeElement.blur(); } );
	await page.mouse.move( viewport.x + viewport.width * .5, viewport.y + viewport.height * .55 );
	await page.keyboard.press( 'Shift+d' );
	await page.keyboard.press( 'Escape' );
	assert.equal( await page.evaluate( () => !! editor.scene.getObjectByName( 'Actor.002' ) ), true );
	await page.evaluate( () => {

		editor.config.setKey( 'settings/history', false );
		editor.clear();

	} );

}

async function checkActiveSelection( page ) {

	await page.evaluate( () => {

		for ( const [ name, x ] of [ [ 'Active test A', -1 ], [ 'Active test B', 1 ] ] ) {

			const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshStandardMaterial() );
			mesh.name = name;
			mesh.position.x = x;
			editor.addObject( mesh );

		}

	} );
	const outliner = page.getByRole( 'tree', { name: 'Outliner', exact: true } );
	const row = name => outliner.getByRole( 'treeitem' ).filter( { hasText: name } );
	const first = row( 'Active test A' ), second = row( 'Active test B' );
	const selection = () => page.evaluate( () => ( {
		active: editor.selected?.name,
		objects: editor.selector.selection.map( object => object.name ),
		groupPivot: editor.selector.usesGroupPivot()
	} ) );
	await first.click();
	await second.click( { modifiers: [ 'Shift' ] } );
	assert.deepEqual( await selection(), { active: 'Active test B', objects: [ 'Active test A', 'Active test B' ], groupPivot: true } );
	assert.equal( await first.getAttribute( 'aria-selected' ), 'true' );
	assert.equal( await second.getAttribute( 'aria-selected' ), 'true' );
	assert.equal( await outliner.getAttribute( 'aria-activedescendant' ), await second.getAttribute( 'id' ) );
	assert.match( await second.getAttribute( 'class' ), /\bcurrent\b/ );
	assert.doesNotMatch( await first.getAttribute( 'class' ), /\bcurrent\b/ );
	const properties = page.locator( '#properties' );
	assert.equal( Number( await properties.getByLabel( 'Position X', { exact: true } ).inputValue() ), 1 );
	const outlines = await page.evaluate( () => {

		const renderer = editor.renderer, render = renderer.render;
		const colors = new Set();
		renderer.render = function ( scene, ...args ) {

			const uniforms = scene.children[ 0 ]?.material?.uniforms;
			if ( uniforms?.tMask && uniforms.uColor ) colors.add( uniforms.uColor.value.getHex() );
			return render.call( this, scene, ...args );

		};
		try { editor.signals.viewportLabelsChanged.dispatch(); }
		finally { renderer.render = render; }
		return [ ...colors ];

	} );
	assert.deepEqual( outlines, [ 0xff8a24, 0xffbd66 ] );
	await first.click( { modifiers: [ 'Shift' ] } );
	assert.deepEqual( await selection(), { active: 'Active test A', objects: [ 'Active test B', 'Active test A' ], groupPivot: true } );
	assert.equal( Number( await properties.getByLabel( 'Position X', { exact: true } ).inputValue() ), -1 );
	await page.getByRole( 'button', { name: 'Viewport Sidebar', exact: true } ).click();
	const item = page.getByRole( 'region', { name: 'Viewport Item', exact: true } );
	assert.equal( Number( await item.getByLabel( 'Location X', { exact: true } ).inputValue() ), -1 );
	await page.getByRole( 'button', { name: 'Viewport Sidebar', exact: true } ).click();
	const viewport = await page.locator( '#viewport' ).boundingBox();
	await page.mouse.move( viewport.x + viewport.width * .4, viewport.y + viewport.height * .55 );
	for ( const key of [ 'g', 'x', '1', 'Enter' ] ) await page.keyboard.press( key );
	assert.deepEqual( await page.evaluate( () => editor.selector.selection.map( object => object.position.x ) ), [ 2, 0 ] );
	await page.evaluate( () => editor.undo() );
	assert.equal( await outliner.getAttribute( 'aria-activedescendant' ), await first.getAttribute( 'id' ) );
	await page.keyboard.press( 'NumpadDecimal' );
	assert.ok( Math.abs( await page.evaluate( () => editor.controls.center.x ) ) < 1e-9 );
	const firstPoint = await page.evaluate( () => {

		const rect = editor.renderer.domElement.getBoundingClientRect();
		const point = editor.selected.getWorldPosition( new THREE.Vector3() ).project( editor.camera );
		return [ rect.left + ( 1 + point.x ) * rect.width / 2, rect.top + ( 1 - point.y ) * rect.height / 2 ];

	} );
	await page.keyboard.down( 'Shift' );
	await page.mouse.click( ...firstPoint );
	await page.keyboard.up( 'Shift' );
	assert.deepEqual( await selection(), { active: 'Active test B', objects: [ 'Active test B' ], groupPivot: false } );
	await outliner.focus();
	await outliner.press( 'ArrowUp' );
	assert.equal( ( await selection() ).active, 'Active test A' );
	await page.evaluate( () => editor.removeObject( editor.selected ) );
	assert.equal( ( await selection() ).active, undefined );
	assert.equal( await outliner.getAttribute( 'aria-activedescendant' ), null );
	await page.evaluate( () => { document.activeElement.blur(); editor.clear(); } );

}

async function checkAddPrimitives( page ) {

	await page.evaluate( () => editor.setCursor( new THREE.Vector3( 2, 1, 3 ) ) );
	const viewport = await page.locator( '#viewport' ).boundingBox();
	await page.mouse.move( viewport.x + viewport.width * .5, viewport.y + viewport.height * .55 );
	const add = page.getByRole( 'dialog', { name: 'Add', exact: true } );
	await page.keyboard.press( 'Shift+a' );
	await add.getByRole( 'button', { name: 'Cube', exact: true } ).click();
	const before = await page.evaluate( async () => {

		const cube = editor.selected;
		const position = cube.position.toArray();
		const group = new THREE.Group();
		group.position.set( 1, 2, 0 );
		group.rotation.set( .1, .3, .2 );
		group.scale.set( 2, 1, .75 );
		editor.addObject( group );
		group.add( cube );
		const slots = [ cube.material, new THREE.MeshStandardMaterial( { color: '#ef8a44' } ) ];
		const { SetMeshMaterialsCommand } = await import( new URL( 'js/commands/SetMeshMaterialsCommand.js', document.baseURI ).href );
		editor.execute( new SetMeshMaterialsCommand( editor, cube, slots ) );
		cube.geometry.addGroup( 0, 18, 0 );
		cube.geometry.addGroup( 18, 18, 1 );
		editor.signals.sceneGraphChanged.dispatch();
		editor.setCursor( new THREE.Vector3( 1, 1, 2 ) );
		return { uuid: cube.uuid, position, uv: Array.from( cube.geometry.attributes.uv.array ), slots: slots.map( slot => slot.uuid ) };

	} );
	assert.deepEqual( before.position, [ 2, 1, 3 ] );
	await page.keyboard.press( 'Tab' );
	await page.keyboard.press( '3' );
	await page.keyboard.press( 'a' );
	await page.keyboard.press( 'Shift+a' );
	assert.equal( await add.getByRole( 'button', { name: 'Perspective', exact: true } ).count(), 0 );
	await add.getByRole( 'button', { name: 'Plane', exact: true } ).click();
	const appended = await page.evaluate( () => {

		const model = editor.modeling, cube = model.object;
		return {
			uuid: cube.uuid, objects: cube.parent.children.length, topology: model.data.faces.map( face => face.length ),
			points: model.indices.map( index => cube.localToWorld( new THREE.Vector3( ...model.data.points[ index ] ) ).toArray() ),
			faces: model.selectedSurfaceFaces(), uv: Array.from( cube.geometry.attributes.uv.array ),
			groups: cube.geometry.groups.map( group => group.materialIndex ),
			slots: cube.material.map( material => material.uuid )
		};

	} );
	assert.equal( appended.uuid, before.uuid );
	assert.equal( appended.objects, 1 );
	assert.deepEqual( appended.topology, [ 4, 4, 4, 4, 4, 4, 4 ] );
	assert.deepEqual( appended.faces, [ 6 ] );
	assert.equal( appended.points.length, 4 );
	assert.ok( appended.points.every( ( [ , y ] ) => Math.abs( y - 1 ) < 1e-6 ) );
	assert.equal( Math.round( appended.points.reduce( ( sum, point ) => sum + point[ 0 ], 0 ) / 4 ), 1 );
	assert.equal( Math.round( appended.points.reduce( ( sum, point ) => sum + point[ 2 ], 0 ) / 4 ), 2 );
	assert.deepEqual( appended.uv.slice( 0, before.uv.length ), before.uv );
	assert.deepEqual( appended.groups, [ 0, 1, 0 ] );
	assert.deepEqual( appended.slots, before.slots );
	await page.evaluate( () => editor.undo() );
	assert.equal( await page.evaluate( () => editor.modeling.data.faces.length ), 6 );
	assert.deepEqual( await page.evaluate( () => editor.modeling.selectedSurfaceFaces() ), [ 0, 1, 2, 3, 4, 5 ] );
	await page.evaluate( () => editor.redo() );
	assert.equal( await page.evaluate( () => editor.modeling.data.faces.length ), 7 );
	assert.deepEqual( await page.evaluate( () => editor.modeling.selectedSurfaceFaces() ), [ 6 ] );
	const base = await page.evaluate( async () => {

		const { createModifier, setModifierStack } = await import( new URL( 'js/modeling/Modifiers.js?v=poly-context', document.baseURI ).href );
		const array = createModifier( 'ARRAY' );
		array.params.count = 2;
		setModifierStack( editor, editor.selected, [ array ] );
		return { id: array.id, vertices: editor.selected.geometry.attributes.position.count };

	} );
	await page.keyboard.press( 'F3' );
	const search = page.getByRole( 'dialog', { name: 'Command palette', exact: true } );
	await search.getByRole( 'searchbox' ).fill( 'Cone' );
	await search.getByRole( 'button', { name: 'Cone', exact: true } ).click();
	const added = await page.evaluate( () => ( {
		faces: editor.modeling.data.faces.length, evaluated: editor.selected.geometry.attributes.position.count,
		id: editor.selected.userData.modifiers[ 0 ].id, selected: editor.modeling.selectedSurfaceFaces()
	} ) );
	assert.ok( added.faces > 7 && added.evaluated > base.vertices );
	assert.equal( added.id, base.id );
	assert.equal( added.selected.length, added.faces - 7 );
	await page.evaluate( () => editor.undo() );
	assert.equal( await page.evaluate( () => editor.selected.geometry.attributes.position.count ), base.vertices );
	assert.deepEqual( await page.evaluate( () => editor.modeling.selectedSurfaceFaces() ), [ 6 ] );
	await page.keyboard.press( 'Tab' );
	await page.evaluate( () => editor.clear() );

}

async function checkDrawingAssets( page ) {

	const ui = page.getByRole( 'region', { name: 'Image and vector editor', exact: true } );
	const status = ui.getByRole( 'status' );
	const saveAsset = ui.getByRole( 'button', { name: 'Save texture to Project assets' } );
	const guide = await page.evaluate( () => {

		const canvas = document.createElement( 'canvas' );
		canvas.width = canvas.height = 4;
		const ctx = canvas.getContext( '2d' );
		ctx.fillStyle = '#0044ff';
		ctx.fillRect( 0, 0, 4, 4 );
		return canvas.toDataURL().split( ',' )[ 1 ];

	} );
	await ui.locator( 'input[type="file"]' ).setInputFiles( { name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from( guide, 'base64' ) } );
	await status.getByText( 'Reference image loaded.', { exact: true } ).waitFor();
	const include = ui.getByLabel( 'Include reference in output', { exact: true } );
	assert.equal( await include.isChecked(), false );
	await saveAsset.click();
	await status.getByText( 'Saved drawing.png to Project assets.', { exact: true } ).waitFor();
	const sampleAsset = path => page.evaluate( async path => {

		const image = await createImageBitmap( editor.sourceFiles.get( path ).file );
		const canvas = document.createElement( 'canvas' );
		canvas.width = image.width;
		canvas.height = image.height;
		const ctx = canvas.getContext( '2d' );
		ctx.drawImage( image, 0, 0 );
		image.close();
		return [ ...ctx.getImageData( 10, 10, 1, 1 ).data ];

	}, path );
	assert.deepEqual( await sampleAsset( 'drawing.png' ), [ 0, 0, 0, 0 ] );
	await include.check();
	await ui.getByRole( 'button', { name: 'Show reference image' } ).click();
	await saveAsset.click();
	await status.getByText( 'Saved import-2/drawing.png to Project assets.', { exact: true } ).waitFor();
	assert.deepEqual( await sampleAsset( 'import-2/drawing.png' ), [ 0, 68, 255, 255 ] );
	await ui.getByRole( 'button', { name: 'Apply drawing' } ).click();
	assert.deepEqual( await page.evaluate( () => {

		const scene = new THREE.ObjectLoader().parse( editor.scene.toJSON() );
		const { referencePath, includeReference } = scene.userData.vectorDrawing;
		return [ referencePath, includeReference, editor.sourceFiles.has( referencePath ) ];

	} ), [ 'reference.png', true, true ] );
	await page.getByRole( 'button', { name: 'Close editor area', exact: true } ).click();
	await page.getByLabel( 'Editor Type', { exact: true } ).click();
	await page.getByRole( 'button', { name: 'Image and vector mode', exact: true } ).click();
	await status.getByText( 'Reference image loaded.', { exact: true } ).waitFor();
	assert.equal( await include.isChecked(), true );
	await ui.getByRole( 'button', { name: 'Remove reference image' } ).click();
	await ui.getByRole( 'button', { name: 'Apply drawing' } ).click();
	assert.equal( await page.evaluate( () => editor.scene.userData.vectorDrawing.referencePath ), undefined );

	const pick = ui.getByRole( 'button', { name: 'Choose reference from assets' } );
	const pickerPanel = page.locator( '.asset-picker' ).filter( { hasText: 'Choose a reference image' } );
	const card = title => page.getByRole( 'listitem', { name: title, exact: true } );
	await page.evaluate( () => {

		for ( const [ name, type ] of [ [ 'broken.png', 'image/png' ], [ 'audio.wav', 'audio/wav' ] ] ) {

			const file = new File( [ 'invalid data' ], name, { type } );
			editor.sourceFiles.set( name, { file, batch: [ name ] } );

		}
		editor.signals.assetsChanged.dispatch();

	} );
	await pick.click();
	await pickerPanel.waitFor();
	await card( 'broken.png' ).waitFor();
	assert.equal( await card( 'audio.wav' ).count(), 0 );
	await card( 'broken.png' ).click();
	await status.getByText( 'The reference image could not be decoded.', { exact: true } ).waitFor();
	assert.equal( await pickerPanel.isVisible(), true );
	const filesBeforePick = await page.evaluate( () => Array.from( editor.sourceFiles.keys() ) );
	await card( 'reference.png' ).click();
	await status.getByText( 'Reference image loaded.', { exact: true } ).waitFor();
	await pickerPanel.waitFor( { state: 'hidden' } );
	await ui.getByRole( 'button', { name: 'Apply drawing' } ).click();
	assert.deepEqual( await page.evaluate( () => [ editor.scene.userData.vectorDrawing.referencePath, Array.from( editor.sourceFiles.keys() ) ] ), [ 'reference.png', filesBeforePick ] );

	await pick.click();
	await pickerPanel.waitFor();
	await page.getByRole( 'button', { name: 'Close editor area', exact: true } ).click();
	await pickerPanel.waitFor( { state: 'hidden' } );
	await page.getByLabel( 'Editor Type', { exact: true } ).click();
	await page.getByRole( 'button', { name: 'Image and vector mode', exact: true } ).click();
	await status.getByText( 'Reference image loaded.', { exact: true } ).waitFor();
	await page.evaluate( () => {

		editor.sourceFiles.delete( 'broken.png' );
		editor.sourceFiles.delete( 'audio.wav' );
		editor.signals.assetsChanged.dispatch();

	} );

	await page.waitForFunction( () => editor.assetBrowser.records.has( 'project:drawing.png' ) );
	await page.evaluate( () => {

		const mesh = new THREE.Mesh( new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial() );
		mesh.name = 'Drawing asset receiver';
		editor.addObject( mesh );
		window.drawingMaterialAssignment = editor.assetBrowser.applyToObject( 'project:drawing.png', mesh );

	} );
	await page.getByRole( 'dialog', { name: 'Choose texture map' } ).getByRole( 'button', { name: 'Color map' } ).click();
	await page.evaluate( () => window.drawingMaterialAssignment );
	assert.deepEqual( await page.evaluate( () => {

		const mesh = editor.scene.getObjectByName( 'Drawing asset receiver' );
		const map = mesh.material.map;
		editor.removeObject( mesh );
		return [ map.userData.sourceAssetPath, map.image.width ];

	} ), [ 'drawing.png', 1024 ] );

	await page.evaluate( async () => {

		const { projectorScript } = await import( new URL( './js/assets/Projector.js?v=projector-shadows', document.baseURI ) );
		const projector = new THREE.Group();
		projector.name = 'Drawing asset projector';
		projector.userData.assetObject = { type: 'projector' };
		editor.addObject( projector );
		editor.addScript( projector, projectorScript() );
		await editor.assetBrowser.applyToObject( 'project:import-2/drawing.png', projector );

	} );
	await page.waitForFunction( () => editor.scene.getObjectByName( 'Drawing asset projector' )?.projectorOutput?.source?.width === 1024 );
	await page.evaluate( () => editor.removeObject( editor.scene.getObjectByName( 'Drawing asset projector' ) ) );
	await page.locator( '#sidebar > .Tabs > #scene' ).click();

}

async function check() {

	const browser = await chromium.launch( { channel: process.env.CHROME_CHANNEL || 'chrome', args: [ '--enable-unsafe-swiftshader' ] } );
	const folder = await fs.mkdtemp( path.join( os.tmpdir(), 'threeditor-workspace-' ) );
	try {

		const page = await browser.newPage( { viewport: { width: 1440, height: 900 } } );
		const errors = [];
		page.on( 'pageerror', error => errors.push( error.message ) );
		await page.goto( process.env.EDITOR_URL || 'http://127.0.0.1:5300/editor/' );
		await page.waitForFunction( () => window.editor?.renderer );
		const chrome = await page.evaluate( () => {

			const original = editor.config.getKey( 'settings/uiStyle' );
			const tab = document.querySelector( '.workspace-tabs button[aria-pressed="true"]' );
			const appearance = style => {

				editor.config.setKey( 'settings/uiStyle', style );
				editor.signals.uiStyleChanged.dispatch();
				const computed = getComputedStyle( tab );
				return [ getComputedStyle( tab.querySelector( 'svg' ) ).display, getComputedStyle( tab.querySelector( 'span' ) ).display,
					computed.boxShadow, computed.backgroundImage ];

			};
			const result = [ appearance( 'compact' ), appearance( 'clean' ) ];
			editor.config.setKey( 'settings/uiStyle', original );
			editor.signals.uiStyleChanged.dispatch();
			return result;

		} );
		assert.deepEqual( chrome, [ [ 'block', 'none', 'none', 'none' ], [ 'none', 'block', 'none', 'none' ] ] );
		assert.deepEqual( await page.evaluate( async () => {

			const legacy = JSON.parse( JSON.stringify( editor.toJSON() ) );
			delete legacy.cursor;
			legacy.cursor3D = [ 1, 2, 3 ];
			await editor.fromJSON( legacy );
			const migrated = editor.toJSON().cursor;
			editor.clear();
			return migrated;

		} ), [ 1, 2, 3 ] );
		await checkSelectionShelf( page );
		await checkPencilObjectSelection( page );
		await checkPencil( page );
		await checkPencilSplats( page );
		await checkCompactPencil( page );
		await checkUVSelection( page );
		await checkUVUnwrap( page );
		await checkUVSeams( page );
		await checkUVIslands( page );
		await checkTextureBake( page );
		await checkProjectorEdgeBlend( page );
		await checkOrthographicFly( page );
		await checkModalTransforms( page );
		await checkViewportControls( page );
		await checkActiveSelection( page );
		await checkAddPrimitives( page );
		await checkHierarchy( page );
		await checkDuplication( page );
		await page.evaluate( () => {

			const camera = new THREE.PerspectiveCamera();
			camera.position.set( 8, 4, 1 );
			editor.addObject( camera );
			editor.setViewportCamera( camera.uuid );
			editor.setViewportSplit( true, 'vertical', .42 );

		} );
		const splitBounds = await page.evaluate( () => editor.renderer.domElement.getBoundingClientRect().toJSON() );
		const item = page.getByRole( 'region', { name: 'Viewport Item', exact: true } );
		const paneX = fraction => splitBounds.x + splitBounds.width * fraction;
		const paneY = splitBounds.y + splitBounds.height * .55;
		await page.mouse.move( paneX( .75 ), paneY );
		await page.keyboard.press( 'n' );
		assert.equal( await item.isVisible(), false );
		await page.mouse.move( paneX( .25 ), paneY );
		await page.keyboard.press( 'n' );
		assert.ok( ( await item.boundingBox() ).x + ( await item.boundingBox() ).width < paneX( .42 ) );
		await page.evaluate( () => editor.setViewportSplit( true, 'vertical', .32 ) );
		assert.ok( ( await item.boundingBox() ).x + ( await item.boundingBox() ).width < paneX( .32 ) );
		await page.evaluate( () => editor.setViewportSplit( true, 'vertical', .42 ) );
		await page.keyboard.press( 'n' );
		const dockLayout = await page.evaluate( () => editor.viewLayout.frames.map( frame => frame.area ) );
		const restoreArea = page.getByRole( 'button', { name: 'Back to Previous' } );
		for ( const [ fraction, key ] of [ [ .75, 'source' ], [ .25, 'director' ] ] ) {

			await page.mouse.move( splitBounds.x + splitBounds.width * fraction, splitBounds.y + splitBounds.height * .5 );
			await page.keyboard.press( 'Control+Space' );
			assert.equal( await restoreArea.isVisible(), true );
			assert.equal( await page.locator( '#sidebar' ).isVisible(), false );
			assert.equal( await page.locator( '#animation' ).isVisible(), false );
			assert.deepEqual( await page.evaluate( () => editor.viewLayout.frames.map( frame => frame.key ) ), [ key ] );
			const expanded = await page.locator( '#viewport' ).boundingBox();
			assert.equal( expanded.width, 1440 );
			assert.equal( await page.evaluate( () => editor.toJSON().viewportSplit ), true );
			assert.equal( await page.evaluate( () => editor.toJSON().viewportSplitRatio ), .42 );
			if ( key === 'source' ) await restoreArea.click();
			else await page.keyboard.press( 'Control+Space' );
			assert.equal( await restoreArea.isVisible(), false );
			assert.deepEqual( await page.evaluate( () => editor.viewLayout.frames.map( frame => frame.area ) ), dockLayout );

		}
		const directorPose = await page.evaluate( () => editor.camera.position.toArray() );
		await page.mouse.move( splitBounds.x + splitBounds.width * .75, splitBounds.y + splitBounds.height * .5 );
		await page.keyboard.press( 'Numpad4' );
		assert.deepEqual( await page.evaluate( () => editor.camera.position.toArray() ), directorPose );
		await page.mouse.move( splitBounds.x + splitBounds.width * .25, splitBounds.y + splitBounds.height * .5 );
		await page.keyboard.press( 'Numpad4' );
		await page.waitForFunction( pose => editor.camera.position.toArray().some( ( value, index ) => value !== pose[ index ] ), directorPose );
		await page.keyboard.press( 'Backquote' );
		await page.getByRole( 'dialog', { name: 'View navigation' } ).getByRole( 'button', { name: 'Front' } ).click();
		assert.equal( await page.evaluate( () => editor.camera.isOrthographicCamera ), true );
		await page.mouse.move( splitBounds.x + splitBounds.width * .25, splitBounds.y + splitBounds.height * .5 );
		await page.keyboard.press( '5' );
		assert.equal( await page.evaluate( () => editor.camera.isPerspectiveCamera ), true );
		const projection = page.getByRole( 'button', { name: 'Toggle Perspective / Orthographic' } );
		await projection.click();
		assert.equal( await page.evaluate( () => editor.camera.isOrthographicCamera ), true );
		await page.mouse.move( splitBounds.x + splitBounds.width * .25, splitBounds.y + splitBounds.height * .5 );
		await page.keyboard.press( 'Control+7' );
		assert.ok( await page.evaluate( () => editor.camera.position.y < editor.controls.getCenter( editor.camera ).y ) );
		await page.keyboard.press( '0' );
		assert.equal( await page.evaluate( () => editor.viewportCamera === editor.camera ), true );
		await page.getByRole( 'button', { name: 'Scripting', exact: true } ).click();
		const code = page.locator( '#script-window' );
		const scriptWindow = page.getByRole( 'region', { name: 'Script Window', exact: true } );
		assert.equal( await scriptWindow.isVisible(), true );
		assert.equal( await page.locator( '#viewport' ).isVisible(), false );
		assert.equal( await page.locator( '#code-resizer' ).count(), 0 );
		const preview = scriptWindow.getByRole( 'button', { name: 'Show 3D view alongside', exact: true } );
		await preview.click();
		assert.equal( await page.locator( '#viewport' ).isVisible(), true );
		assert.equal( await preview.getAttribute( 'aria-pressed' ), 'true' );
		await code.locator( '.CodeMirror' ).click( { position: { x: 100, y: 20 } } );
		assert.equal( await page.evaluate( () => !! document.activeElement.closest( '.CodeMirror' ) ), true );
		await page.keyboard.press( 'Control+Space' );
		assert.equal( ( await code.boundingBox() ).width, 1440 );
		assert.equal( await page.locator( '#viewport' ).isVisible(), false );
		assert.equal( await page.evaluate( () => !! document.activeElement.closest( '#script-window' ) ), true );
		await page.keyboard.press( 'Control+Space' );
		assert.ok( ( await code.boundingBox() ).width < 1440 );
		await preview.click();
		await scriptWindow.getByRole( 'button', { name: 'Close editor area' } ).click();
		await page.getByLabel( 'Editor Type', { exact: true } ).click();
		await page.getByRole( 'button', { name: 'Script Window', exact: true } ).click();
		assert.equal( await scriptWindow.isVisible(), true );
		assert.equal( await page.getByRole( 'button', { name: 'Scripting', exact: true } ).getAttribute( 'aria-pressed' ), 'true' );
		await scriptWindow.getByRole( 'button', { name: 'Close editor area' } ).click();
		for ( const area of [ '#sidebar', '#animation' ] ) {

			const bounds = await page.locator( area ).boundingBox();
			await page.mouse.move( bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 );
			await page.keyboard.press( 'Control+Space' );
			assert.equal( ( await page.locator( area ).boundingBox() ).width, 1440 );
			assert.equal( await page.locator( '#viewport' ).isVisible(), false );
			await restoreArea.click();
			assert.deepEqual( await page.locator( area ).boundingBox(), bounds );

		}
		await page.evaluate( () => editor.clear() );
		const cursorTarget = await page.evaluate( () => {

			const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshStandardMaterial() );
			mesh.position.x = 2;
			editor.addObject( mesh );
			editor.select( mesh );
			editor.camera.position.set( 2, 0, 7 );
			editor.camera.lookAt( 2, 0, 0 );
			editor.camera.updateMatrixWorld();
			editor.signals.cameraChanged.dispatch( editor.camera );
			const bounds = editor.renderer.domElement.getBoundingClientRect();
			const point = new THREE.Vector3( 2, 0, .5 ).project( editor.camera );
			return [ bounds.left + ( 1 + point.x ) * bounds.width / 2, bounds.top + ( 1 - point.y ) * bounds.height / 2 ];

		} );
		await page.keyboard.down( 'Shift' );
		await page.mouse.click( ...cursorTarget, { button: 'right' } );
		await page.keyboard.up( 'Shift' );
		assert.ok( Math.abs( await page.evaluate( () => editor.cursor.z ) - .5 ) < .01 );
		await page.keyboard.press( 'Shift+s' );
		await page.getByRole( 'dialog', { name: 'Snap', exact: true } ).getByRole( 'button', { name: 'Cursor to Selected', exact: true } ).click();
		assert.deepEqual( await page.evaluate( () => editor.toJSON().cursor ), [ 2, 0, 0 ] );
		await page.mouse.move( ...cursorTarget );
		await page.keyboard.press( 'h' );
		assert.equal( await page.evaluate( () => editor.toJSON().viewportHidden.length ), 1 );
		assert.equal( await page.evaluate( () => editor.scene.children.find( object => object.isMesh ).visible ), true );
		await page.keyboard.press( 'Alt+h' );
		assert.equal( await page.evaluate( () => editor.toJSON().viewportHidden.length ), 0 );
		const cameraBeforeLocalView = await page.evaluate( () => editor.camera.position.toArray() );
		const lighting = await page.evaluate( () => {

			const rig = new THREE.Group();
			const lamp = new THREE.SpotLight();
			const spare = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshBasicMaterial() );
			rig.add( lamp, spare );
			editor.addObject( rig );
			const renderer = editor.renderer, render = renderer.render;
			let visible;
			renderer.render = function ( scene, ...args ) {

				if ( scene === editor.scene && editor.viewportVisibility.local && ! visible ) visible = [ rig.visible, lamp.visible, spare.visible ];
				return render.call( this, scene, ...args );

			};
			try { editor.viewportVisibility.toggleLocal(); }
			finally { renderer.render = render; editor.removeObject( rig ); }
			return visible;

		} );
		assert.deepEqual( lighting, [ true, true, false ] );
		assert.deepEqual( await page.evaluate( () => editor.camera.position.toArray() ), cameraBeforeLocalView );
		assert.equal( await page.getByRole( 'button', { name: 'Exit Local View' } ).isVisible(), true );
		await page.keyboard.press( 'NumpadDivide' );
		assert.deepEqual( await page.evaluate( () => editor.camera.position.toArray() ), cameraBeforeLocalView );
		const dragSelection = async () => {

			await page.mouse.move( cursorTarget[ 0 ] - 78, cursorTarget[ 1 ] - 78 );
			await page.mouse.down();
			await page.mouse.move( cursorTarget[ 0 ] + 78, cursorTarget[ 1 ] + 78, { steps: 4 } );
			await page.mouse.up();

		};
		await page.mouse.move( ...cursorTarget );
		await page.keyboard.press( 'Tab' );
		await page.keyboard.press( 'l' );
		assert.equal( await page.evaluate( () => editor.modeling.indices.length ), 8 );
		await page.keyboard.press( 'Shift+l' );
		assert.equal( await page.evaluate( () => editor.modeling.indices.length ), 0 );
		await dragSelection();
		assert.equal( await page.evaluate( () => editor.modeling.indices.length ), 4 );
		await page.keyboard.press( 'Alt+z' );
		await dragSelection();
		assert.equal( await page.evaluate( () => editor.modeling.indices.length ), 8 );
		await page.keyboard.press( 'Alt+z' );
		await page.keyboard.press( '3' );
		await page.mouse.click( ...cursorTarget );
		await page.keyboard.press( 'p' );
		await page.getByRole( 'dialog', { name: 'Separate', exact: true } ).getByRole( 'button', { name: 'Selection', exact: true } ).click();
		assert.deepEqual( await page.evaluate( () => editor.scene.children.filter( object => object.isMesh ).map( object => object.geometry.index.count ) ), [ 33, 3 ] );
		await page.evaluate( () => editor.undo() );
		assert.equal( await page.evaluate( () => editor.modeling.object.geometry.index.count ), 36 );
		await page.keyboard.press( '1' );
		await page.keyboard.press( 'Tab' );
		await page.evaluate( () => editor.setViewportShading( 'preview' ) );
		assert.equal( await page.locator( '.viewport-tool-overlay' ).isVisible(), false );
		await page.evaluate( () => editor.clear() );
		await checkTextureProjection( page );
		await checkPaintGestures( page );
		await checkComponents( page );
		await checkScriptParameterLayout( page );
		await checkSplatFilters( page );
		await page.evaluate( () => {

			const light = new THREE.SpotLight();
			light.name = 'Mask test light';
			editor.addObject( light );
			editor.select( light );

		} );
		await page.getByLabel( 'Editor Type', { exact: true } ).click();
		await page.getByRole( 'button', { name: 'Mask mode', exact: true } ).click();
		const maskFrame = await page.getByLabel( 'Projection frame', { exact: true } ).boundingBox();
		for ( const [ start, end ] of [ [ .31, .69 ], [ .42, .58 ] ] ) {

			await page.getByRole( 'button', { name: 'Draw rectangle' } ).click();
			await page.mouse.move( maskFrame.x + start * maskFrame.width, maskFrame.y + start * maskFrame.height );
			await page.mouse.down();
			await page.mouse.move( maskFrame.x + end * maskFrame.width, maskFrame.y + end * maskFrame.height, { steps: 4 } );
			await page.mouse.up();

		}
		await page.getByLabel( 'Shape operation' ).selectOption( 'cutout' );
		await page.getByRole( 'button', { name: 'Apply masks' } ).click();
		assert.deepEqual( await page.evaluate( () => editor.selected.userData.projectionMask.shapes.map( shape => [ shape.mode, shape.points.length ] ) ),
			[ [ 'inside', 4 ], [ 'cutout', 4 ] ] );
		await page.getByLabel( 'Mask', { exact: true } ).click();
		await page.getByRole( 'button', { name: '3D View', exact: true } ).click();
		await page.evaluate( () => editor.clear() );
		await page.getByLabel( 'Editor Type', { exact: true } ).click();
		await page.getByRole( 'button', { name: 'Image and vector mode' } ).click();
		await page.getByRole( 'button', { name: 'Draw rectangle' } ).click();
		const canvas = page.getByLabel( 'Vector drawing canvas' );
		const drawing = await canvas.boundingBox();
		const drawingArea = page.locator( '.viewport-edit-workspace' );
		const dockedDrawingArea = await drawingArea.boundingBox();
		await page.mouse.move( drawing.x + drawing.width / 2, drawing.y + drawing.height / 2 );
		await page.keyboard.press( 'Control+Space' );
		assert.ok( ( await drawingArea.boundingBox() ).width > dockedDrawingArea.width );
		assert.equal( await canvas.isVisible(), true );
		await restoreArea.click();
		assert.deepEqual( await canvas.boundingBox(), drawing );
		const start = [ drawing.x + drawing.width * .4, drawing.y + drawing.height * .4 ];
		const end = [ drawing.x + drawing.width * .6, drawing.y + drawing.height * .6 ];
		await page.mouse.move( ...start );
		await page.mouse.down();
		await page.mouse.move( ...end, { steps: 5 } );
		await page.mouse.up();
		await page.mouse.dblclick( ( start[ 0 ] + end[ 0 ] ) / 2, start[ 1 ] );
		await page.getByLabel( 'Contour color' ).fill( '#e4572e' );
		await page.getByRole( 'button', { name: 'Create scene curve' } ).click();
		await page.getByRole( 'button', { name: 'Create filled scene shape' } ).click();
		await canvas.locator( '../..' ).getByRole( 'button', { name: 'Sample Brush Color', exact: true } ).click();
		await canvas.scrollIntoViewIfNeeded();
		const swatch = await canvas.boundingBox();
		await page.mouse.click( swatch.x + swatch.width / 2, swatch.y + swatch.height / 2 );
		assert.equal( await page.getByLabel( 'Brush color', { exact: true } ).inputValue(), '#e4572e' );
		await canvas.locator( '../..' ).getByRole( 'button', { name: 'Pencil', exact: true } ).click();
		await page.getByRole( 'region', { name: 'Image and vector editor' } ).getByRole( 'button', { name: 'Pencil Soft', exact: true } ).click();
		await canvas.scrollIntoViewIfNeeded();
		const vectorFrame = await canvas.boundingBox();
		await page.mouse.move( vectorFrame.x + vectorFrame.width * .28, vectorFrame.y + vectorFrame.height * .28 );
		await page.mouse.down();
		await page.mouse.move( vectorFrame.x + vectorFrame.width * .34, vectorFrame.y + vectorFrame.height * .21, { steps: 4 } );
		await page.mouse.move( vectorFrame.x + vectorFrame.width * .39, vectorFrame.y + vectorFrame.height * .27, { steps: 4 } );
		await page.mouse.up();
		const cyclic = page.getByRole( 'button', { name: 'Toggle Cyclic' } );
		assert.equal( await cyclic.getAttribute( 'aria-pressed' ), 'false' );
		await canvas.press( 'f' );
		assert.equal( await cyclic.getAttribute( 'aria-pressed' ), 'true' );
		await canvas.press( 'f' );
		assert.equal( await cyclic.getAttribute( 'aria-pressed' ), 'false' );
		assert.equal( await page.getByRole( 'button', { name: 'Create filled scene shape' } ).isEnabled(), false );
		await page.getByRole( 'button', { name: 'Create scene curve' } ).click();
		await page.getByRole( 'button', { name: 'Apply drawing' } ).click();
		const contour = await page.evaluate( () => {

			const [ drawing, stroke ] = editor.scene.userData.vectorDrawing.shapes;
			const curve = editor.scene.children.find( object => object.name === drawing.name && object.isLine );
			const fill = editor.scene.getObjectByName( drawing.name + ' fill' );
			const open = editor.scene.getObjectByName( stroke.name );
			const toPoints = shape => shape.points.map( ( [ u, v ] ) => [ 2 * u - 1, 1 - 2 * v, 0 ] );
			return {
				actual: curve.geometry.userData.modeling.points,
				expected: toPoints( drawing ),
				fill: fill.geometry.userData.modeling.points,
				fillColor: fill.material.color.getHexString(),
				stroke: open.geometry.userData.modeling.points,
				strokeExpected: toPoints( stroke ),
				open: ! ( open.geometry.userData.modeling.closed || stroke.closed )
			};

		} );
		assert.deepEqual( contour.actual, contour.expected );
		assert.equal( contour.actual.length, 5 );
		assert.deepEqual( contour.fill, contour.expected );
		assert.equal( contour.fillColor, 'e4572e' );
		assert.deepEqual( contour.stroke, contour.strokeExpected );
		assert.equal( contour.open, true );
		await page.getByText( 'Pick scene outline', { exact: true } ).click();
		await page.getByLabel( 'Search scene outlines' ).fill( 'Stroke 2' );
		await page.getByRole( 'button', { name: 'Copy from scene in place' } ).click();
		await page.getByRole( 'button', { name: 'Apply drawing' } ).click();
		const strokeCopies = await page.evaluate( () => editor.scene.userData.vectorDrawing.shapes.slice( 1 ) );
		assert.equal( strokeCopies.length, 2 );
		assert.equal( strokeCopies[ 1 ].closed, false );
		assert.equal( strokeCopies[ 0 ].points.length, strokeCopies[ 1 ].points.length );
		strokeCopies[ 0 ].points.forEach( ( point, index ) => {

			assert.ok( point.every( ( coordinate, axis ) => Math.abs( coordinate - strokeCopies[ 1 ].points[ index ][ axis ] ) < 1e-10 ) );

		} );
		await page.getByRole( 'button', { name: 'Undo drawing edit' } ).click();
		await page.getByRole( 'button', { name: 'Apply drawing' } ).click();
		const vectorTools = canvas.locator( '../..' );
		await vectorTools.getByRole( 'button', { name: 'Brush', exact: true } ).click();
		const palette = page.getByRole( 'region', { name: 'Image and vector editor' } ).getByRole( 'group', { name: 'Pencil brush palette' } );
		await palette.getByRole( 'button', { name: 'Marker', exact: true } ).click();
		await canvas.scrollIntoViewIfNeeded();
		const brushFrame = await canvas.boundingBox();
		await page.mouse.click( brushFrame.x + brushFrame.width / 2, brushFrame.y + brushFrame.height / 2 );
		await page.getByRole( 'button', { name: 'Apply drawing' } ).click();
		assert.equal( await page.evaluate( () => editor.scene.userData.vectorDrawing.brushStrokes?.[ 0 ]?.brush.name ), 'Marker' );
		const vectorDownload = page.waitForEvent( 'download' );
		await page.getByRole( 'button', { name: 'Export SVG' } ).click();
		const svg = await fs.readFile( await ( await vectorDownload ).path(), 'utf8' );
		assert.match( svg, /<path fill="#e4572e"[^>]+ Z"/ );
		assert.match( svg, /<image [^>]+data:image\/png;base64,/ );
		assert.match( svg, /<pattern id="brush-grain-0"[^>]*><image [^>]*data:image\/png;base64,/ );
		assert.match( svg, /<path fill="none" stroke="url\(#brush-grain-0\)"[^>]+ [ML][^>]+"/ );
		await checkDrawingAssets( page );
		await page.getByRole( 'group', { name: 'Workspace controls' } ).getByLabel( 'Image & Vector', { exact: true } ).click();
		await page.getByRole( 'button', { name: '3D View', exact: true } ).click();
		const viewport = await page.evaluate( () => editor.renderer.domElement.getBoundingClientRect().toJSON() );
		await page.mouse.move( viewport.x + viewport.width * .5, viewport.y + viewport.height * .5 );
		await page.evaluate( () => editor.select( editor.scene.getObjectByName( 'Stroke 2' ) ) );
		await page.keyboard.press( 'Tab' );
		await page.keyboard.press( 'f' );
		assert.equal( await page.evaluate( () => editor.selected.geometry.userData.modeling.closed ), true );
		await page.keyboard.press( 'f' );
		assert.equal( await page.evaluate( () => editor.selected.geometry.userData.modeling.closed ), false );
		await page.keyboard.press( 'Tab' );
		await page.evaluate( () => {

			const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshStandardMaterial() );
			mesh.name = 'Receiver';
			editor.addObject( mesh );
			editor.select( mesh );

		} );
		await page.keyboard.press( 'z' );
		const shading = page.getByRole( 'dialog', { name: 'Viewport shading' } );
		for ( const [ index, label ] of [ 'Rendered', 'Solid', 'Material Preview', 'Wireframe', 'Live Preview' ].entries() ) {

			assert.equal( await shading.getByRole( 'button', { name: label, exact: true } ).locator( 'kbd' ).textContent(), String( index + 1 ) );

		}
		const overlay = page.locator( '.viewport-tool-overlay' );
		await shading.getByRole( 'button', { name: 'Material Preview', exact: true } ).click();
		const passes = () => page.evaluate( () => {

			const renderer = editor.renderer;
			const original = renderer.render;
			const observed = { grid: false, gizmo: false, material: false };
			const mesh = editor.scene.getObjectByName( 'Receiver' );
			const material = mesh.material;
			renderer.render = function ( scene, camera ) {

				scene.traverseVisible( object => {

					observed.grid ||= object.type === 'GridHelper';
					observed.gizmo ||= !! object.isTransformControlsRoot && !! object.controls.object;

				} );
				observed.material ||= scene === editor.scene && mesh.material === material;
				return original.call( this, scene, camera );

			};
			try { editor.signals.cameraChanged.dispatch( editor.camera ); }
			finally { renderer.render = original; }
			return observed;

		} );
		assert.equal( await overlay.isVisible(), true );
		assert.deepEqual( await passes(), { grid: true, gizmo: true, material: true } );
		await page.mouse.move( viewport.x + viewport.width * .5, viewport.y + viewport.height * .5 );
		await page.keyboard.press( 'z' );
		await shading.getByRole( 'button', { name: 'Live Preview', exact: true } ).click();
		assert.equal( await overlay.isVisible(), false );
		assert.equal( await page.evaluate( () => editor.viewportShading ), 'preview' );
		assert.deepEqual( await passes(), { grid: false, gizmo: false, material: true } );
		await page.evaluate( () => {

			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( [ 1, 0, 0 ], 3 ) );
			const points = new THREE.Points( geometry, new THREE.PointsMaterial() );
			points.name = 'Raster sample test';
			editor.addObject( points );

		} );
		await page.mouse.move( viewport.x + viewport.width * .5, viewport.y + viewport.height * .5 );
		await page.keyboard.press( 'z' );
		await shading.getByRole( 'button', { name: 'Rendered', exact: true } ).click();
		assert.equal( await overlay.isVisible(), false );
		await page.getByText( 'Raster · 32 samples', { exact: true } ).waitFor();
		await page.evaluate( () => {

			window.samplesAfterBackground = [];
			editor.signals.pathTracerUpdated.add( samples => window.samplesAfterBackground.push( samples ) );
			editor.signals.sceneBackgroundChanged.dispatch( 'Color', 0x224466 );

		} );
		await page.waitForFunction( () => window.samplesAfterBackground.includes( 'Raster · 1 sample' ) &&
			window.samplesAfterBackground.includes( 'Raster · 2 samples' ) );
		await page.evaluate( () => editor.removeObject( editor.scene.getObjectByName( 'Raster sample test' ) ) );
		await page.mouse.move( viewport.x + viewport.width * .5, viewport.y + viewport.height * .5 );
		await page.keyboard.press( 'z' );
		await shading.getByRole( 'button', { name: 'Solid', exact: true } ).click();
		assert.equal( await overlay.isVisible(), true );
		const tabOffsets = await page.locator( '#properties > .Tabs .Tab[data-glyph]:visible' ).evaluateAll( tabs => tabs.map( tab => {

			const bounds = tab.getBoundingClientRect(), glyph = tab.querySelector( 'svg' ).getBoundingClientRect();
			return Math.hypot( bounds.x + bounds.width / 2 - glyph.x - glyph.width / 2,
				bounds.y + bounds.height / 2 - glyph.y - glyph.height / 2 );

		} ) );
		assert.ok( tabOffsets.length > 1 && tabOffsets.every( distance => distance < 1 ), 'Property tab glyphs should be centered' );
		await page.mouse.move( viewport.x + viewport.width * .5, viewport.y + viewport.height * .5 );
		await page.keyboard.press( 'z' );
		await shading.getByRole( 'button', { name: 'Wireframe' } ).click();
		assert.equal( await page.evaluate( () => editor.viewportShading ), 'wireframe' );
		await page.keyboard.press( 'Shift+z' );
		await page.keyboard.press( 'Tab' );
		await page.keyboard.press( 'a' );
		await page.keyboard.press( 'g' );
		await page.keyboard.press( 'x' );
		await page.keyboard.press( '0' );
		await page.keyboard.press( '.' );
		await page.keyboard.press( '2' );
		await page.keyboard.press( 'Enter' );
		const edited = await page.evaluate( () => Array.from( editor.selected.geometry.attributes.position.array ) );
		assert.ok( Math.max( ...edited ) > .65, 'Edit-mode transform changed mesh coordinates' );
		await page.keyboard.press( 'Tab' );
		const mode = page.getByLabel( 'Interaction mode', { exact: true } );
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
		const receiverSplatCount = () => page.evaluate( () => {

			const batches = editor.scene.getObjectByName( 'Receiver' ).children.filter( child => child.userData.assetObject?.paintBatch );
			if ( batches.length !== 1 ) throw new Error( 'Expected one shared splat batch on the receiver' );
			return atob( batches[ 0 ].userData.assetObject.splatData ).length / 32;

		} );
		const firstSplatCount = await receiverSplatCount();
		await page.waitForFunction( () => editor.scene.getObjectByName( 'Receiver' ).getObjectByName( 'SplatMesh' )?.isInitialized );
		await page.mouse.move( center[ 0 ] - 12, center[ 1 ] + 8 );
		await page.mouse.down();
		await page.mouse.move( center[ 0 ] + 12, center[ 1 ] + 8, { steps: 8 } );
		await page.mouse.up();
		const splatCount = await receiverSplatCount();
		assert.equal( splatCount, 2 * firstSplatCount );
		await mode.selectOption( 'object' );
		await page.evaluate( () => editor.select( editor.scene.getObjectByName( 'Receiver' ) ) );
		await page.locator( '.Tab#scriptTab' ).click();
		await page.getByRole( 'button', { name: 'Add Component', exact: true } ).click();
		await page.getByRole( 'dialog', { name: 'Add Component' } ).getByRole( 'button', { name: 'Add Script', exact: true } ).click();
		const source = [
			'// @param tilt = 0.25',
			'function update() {',
			' this.rotation.z = params.tilt;',
			' const splats = this.getObjectByName("SplatMesh");',
			' if (splats?.isInitialized) window.workspaceCheck = { tilt: this.rotation.z, x: this.position.x,',
			'   splats: splats.numSplats, texture: this.material.map?.image?.width, visible: this.visible,',
			'   points: this.getObjectByName("Surface path")?.geometry.userData.modeling.points.length };',
			'}'
		].join( '\n' );
		await page.evaluate( source => {

			const cm = document.querySelector( '#script-window .CodeMirror' )?.CodeMirror;
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
		const reopenedDrawing = await page.evaluate( () => ( {

			stroke: editor.scene.getObjectByName( 'Stroke 2' ).geometry.userData.modeling,
			fillColor: editor.scene.getObjectByName( 'Contour 1 fill' ).material.color.getHexString(),
			shapeCount: editor.scene.userData.vectorDrawing.shapes.length

		} ) );
		assert.deepEqual( reopenedDrawing.stroke.points, contour.stroke );
		assert.equal( reopenedDrawing.stroke.closed, false );
		assert.equal( reopenedDrawing.fillColor, contour.fillColor );
		assert.equal( reopenedDrawing.shapeCount, 2 );
		const download = page.waitForEvent( 'download' );
		await page.evaluate( async () => {

			const receiver = editor.scene.getObjectByName( 'Receiver' );
			editor.select( receiver );
			editor.viewportVisibility.hide();
			const { exportPlayableScene } = await import( new URL( 'js/Publish.js', document.baseURI ).href );
			const { zip } = await exportPlayableScene( editor );
			const a = document.createElement( 'a' );
			a.href = URL.createObjectURL( zip );
			a.download = 'workspace.zip';
			a.click();

		} );
		const archive = path.join( folder, 'workspace.zip' );
		await ( await download ).saveAs( archive );
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
		assert.equal( result.visible, true );
		assert.equal( result.splats, splatCount );
		assert.ok( result.points >= 2 && result.texture === 1024 );
		assert.deepEqual( errors, [] );
		console.log( 'Published workspace passed', result );

	} finally {

		await browser.close();
		await fs.rm( folder, { recursive: true, force: true } );

	}

}
check().catch( error => { console.error( error ); process.exitCode = 1; } );
