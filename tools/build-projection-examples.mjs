import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../build/three.module.js';
import { projectorScript } from '../editor/js/assets/Projector.js';
import { modelObject, outlinePoints } from '../editor/js/modeling/ModelGeometry.js';
import { maskFromOutline } from '../editor/js/modeling/ProjectionMask.js';

const output = new URL( '../editor/examples/projection/', import.meta.url );
const mediatheque = resolve( process.argv[ 2 ] || fileURLToPath( new URL( '../../mediatheque/', import.meta.url ) ) );
await mkdir( new URL( 'assets/', output ), { recursive: true } );
const examples = [];

async function sourceAsset( id, key ) {

	const folder = resolve( mediatheque, 'items', id );
	const item = JSON.parse( await readFile( resolve( folder, 'item.json' ), 'utf8' ) );
	if ( item.rights.status !== 'public-domain' ) throw new Error( 'Use a public-domain catalog asset for these bundled scenes.' );
	const source = item.files[ key ];
	const path = id + '.' + source.path.split( '.' ).at( -1 );
	const file = 'examples/projection/assets/' + path;
	await copyFile( resolve( folder, source.path ), new URL( 'assets/' + path, output ) );
	const base = 'https://languel.github.io/mediatheque/';
	const video = source.type.startsWith( 'video/' );
	return { path, file, meta: {
		id: 'mediatheque:' + id, title: item.title, kind: video ? 'video' : 'texture',
		url: base + 'items/' + id + '/' + source.path,
		page: base + 'site/index.html#/' + id,
		credit: item.rights.credit,
		rights: item.rights
	} };

}

function study( title, instructions, asset, cameraPosition, target ) {

	const scene = new THREE.Scene();
	scene.name = title;
	scene.background = new THREE.Color( 0x141821 );
	scene.userData.lesson = { title, instructions, source: asset.meta.page, credit: asset.meta.credit };
	const camera = new THREE.PerspectiveCamera( 42, 1, .01, 80 );
	camera.name = 'Director';
	camera.position.set( ...cameraPosition );
	camera.lookAt( ...target );
	const scripts = {};
	const add = ( object, name, position = [ 0, 0, 0 ] ) => {

		object.name = name;
		object.position.fromArray( position );
		scene.add( object );
		return object;

	};
	const ambient = add( new THREE.HemisphereLight( 0xdde9ff, 0x424052, .38 ), 'Ambient fill' );
	ambient.userData.threeditor = { locked: true };
	const floor = add( new THREE.Mesh( new THREE.PlaneGeometry( 20, 14 ), new THREE.MeshStandardMaterial( { color: 0x232b38, roughness: .86 } ) ), 'Studio floor', [ 0, -.06, 2 ] );
	floor.rotation.x = - Math.PI / 2;
	floor.receiveShadow = true;
	const projector = ( position, aim, params ) => {

		const rig = add( new THREE.Group(), 'Projector', position );
		rig.userData.assetObject = { type: 'projector' };
		rig.lookAt( new THREE.Vector3( ...position ).multiplyScalar( 2 ).sub( new THREE.Vector3( ...aim ) ) );
		scripts[ rig.uuid ] = [ { ...projectorScript( asset.path, asset.meta.kind === 'video' ), paramValues: { intensity: 3.6, range: 25, ...params } } ];
		return rig;

	};
	const surface = ( data, name, position ) => add( modelObject( THREE, data, name ), name, position );
	const save = async id => {

		const file = id + '.app.json';
		camera.updateMatrixWorld( true );
		scene.updateMatrixWorld( true );
		await writeFile( new URL( file, output ), JSON.stringify( {
			project: { title, renderer: 'WebGLRenderer', shadows: true, shadowType: THREE.PCFShadowMap, toneMapping: THREE.NeutralToneMapping },
			scene: scene.toJSON(), camera: camera.toJSON(), viewportCamera: camera.uuid,
			viewportTarget: target, mainCameraTarget: target, environmentType: 'None', backgroundType: 'Color', scripts,
			history: { undos: [], redos: [] }
		} ) + '\n' );
		examples.push( { title, file: 'examples/projection/' + file, assets: [ asset ] } );

	};
	return { projector, surface, save };

}

const rectangle = ( width, height, depth = 0 ) => ({
	kind: 'shape', depth, smooth: false,
	points: [ [ -width / 2, -height / 2, 0 ], [ width / 2, -height / 2, 0 ], [ width / 2, height / 2, 0 ], [ -width / 2, height / 2, 0 ] ]
});

const yosemite = await sourceAsset( 'watkins-sentinel-dome-1865', 'media' );
const relief = study( 'Yosemite relief', 'Select Folded relief and open Modeling. Move a ridge vertex in Z, then compare how the photograph crosses the folds.', yosemite, [ 3.5, 2.6, 9.6 ], [ 0, 1.65, 0 ] );
const profile = [ [ -2.6, -.23 ], [ -1.56, .38 ], [ -.52, -.12 ], [ .64, .55 ], [ 1.68, .04 ], [ 2.6, -.25 ] ];
relief.surface( {
	kind: 'mesh',
	points: [ ...profile.map( ( [ x, z ] ) => [ x, .08, z ] ), ...profile.map( ( [ x, z ], i ) => [ x + ( i % 2 ? .12 : -.12 ), 3.3, z + ( i % 2 ? .22 : 0 ) ] ) ],
	faces: profile.slice( 1 ).map( ( _, i ) => [ i, i + 1, i + 7, i + 6 ] )
}, 'Folded relief' );
relief.projector( [ -.7, 2.2, 6.5 ], [ 0, 1.69, 0 ], { throwRatio: 1.04 } );
await relief.save( 'yosemite-relief' );

const canyon = await sourceAsset( 'osullivan-canyon-de-chelly-1873', 'media' );
const aperture = study( 'Canyon aperture', 'Edit the aperture in the projector’s Modeling tab. Switch to Block inside to invert it, or copy the Aperture outline path again.', canyon, [ 2.3, 2.6, 8.7 ], [ 0, 1.75, 0 ] );
aperture.surface( rectangle( 4.5, 3.75, .12 ), 'Extruded screen', [ 0, 1.83, -.14 ] );
const path = { kind: 'path', planar: true, closed: true, smooth: true,
	points: [ [ -1.1, -1.1, 0 ], [ -.85, .72, 0 ], [ 0, 1.4, 0 ], [ .92, .69, 0 ], [ 1.07, -1.08, 0 ], [ 0, -1.25, 0 ] ]
};
const outline = aperture.surface( path, 'Aperture outline', [ 0, 1.85, 0 ] );
outline.visible = false;
const masked = aperture.projector( [ 0, 1.83, 5.1 ], [ 0, 1.83, 0 ], { throwRatio: 1.8 } );
masked.userData.projectionMask = maskFromOutline( outlinePoints( THREE, path ).map( point => point.toArray() ) );
await aperture.save( 'canyon-aperture' );

const gallop = await sourceAsset( 'muybridge-sallie-gardner-1878', 'proxy' );
const triptych = study( 'Gallop triptych', 'Compare the moving image across three depths. Adjust the panels or the projector’s throw ratio, and toggle Calibration grid to check alignment.', gallop, [ 3.4, 2.8, 10.3 ], [ 0, 1.45, 0 ] );
const panels = [ [ -1.9, .32, -.16 ], [ 0, -.46, 0 ], [ 1.9, .56, .16 ] ];
for ( const [ i, [ x, z, angle ] ] of panels.entries() ) {

	const panel = triptych.surface( rectangle( 1.77, 2.68, .16 ), [ 'Left panel', 'Recessed panel', 'Right panel' ][ i ], [ x, 1.37, z ] );
	panel.rotation.y = angle;

}
triptych.projector( [ 0, 1.66, 7.3 ], [ 0, 1.42, 0 ], { throwRatio: 1.2 } );
await triptych.save( 'gallop-triptych' );

await writeFile( new URL( 'catalog.js', output ), '// Generated by tools/build-projection-examples.mjs.\nexport const projectionExamples = ' + JSON.stringify( examples, null, 2 ) + ';\n' );
