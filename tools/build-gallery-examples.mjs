import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from '../build/three.module.js';
import { projectorScript } from '../editor/js/assets/Projector.js';
import { sdfMaterial } from '../editor/js/assets/MathObjects.js';
import { splatScript } from '../editor/js/assets/SplatObjects.js';
import { modelObject } from '../editor/js/modeling/ModelGeometry.js';
import { projectionExamples } from '../editor/examples/projection/catalog.js';

const base = 'https://languel.github.io/mediatheque/';
const output = new URL( '../editor/examples/gallery/', import.meta.url );
const source = process.argv[ 2 ];
await mkdir( new URL( 'assets/', output ), { recursive: true } );

async function assetFile( id, file ) {

	if ( source ) return readFile( resolve( source, 'items', id, file ) );
	const response = await fetch( new URL( 'items/' + id + '/' + file, base ) );
	if ( ! response.ok ) throw new Error( response.status + ' loading ' + id + '/' + file );
	return Buffer.from( await response.arrayBuffer() );

}

async function scanAsset( id ) {

	const item = JSON.parse( await assetFile( id, 'item.json' ) );
	const media = item.files.media;
	if ( item.rights.status !== 'public-domain' || ! media.path.endsWith( '.spz' ) ) throw new Error( 'Expected a public-domain SPZ for ' + id );
	const file = await assetFile( id, media.path );
	if ( createHash( 'sha256' ).update( file ).digest( 'hex' ) !== media.sha256 ) throw new Error( 'SPZ checksum differs for ' + id );
	const path = id + '.spz';
	await writeFile( new URL( 'assets/' + path, output ), file );
	return { path, file: 'examples/gallery/assets/' + path, meta: {
		id: 'mediatheque:' + id, title: item.title, kind: 'splat', url: base + 'items/' + id + '/' + media.path,
		page: base + 'site/index.html#/' + id, credit: item.rights.credit, rights: item.rights
	} };

}

const dda = await scanAsset( 'ddagallery-empty-dark' );
const spatial = await scanAsset( 'spatialcomproom' );
const assetFromProjection = id => projectionExamples.flatMap( entry => entry.assets ).find( asset => asset.meta.id === 'mediatheque:' + id );
const gallop = assetFromProjection( 'muybridge-sallie-gardner-1878' );
const yosemite = assetFromProjection( 'watkins-sentinel-dome-1865' );
const examples = [];

function setup( title, scan, options ) {

	const { position, target, survey = false, scanFloor = 0, captureVisible = survey, fov = 57 } = options;
	const scene = new THREE.Scene();
	scene.name = title;
	scene.background = new THREE.Color( survey ? 0x10151d : 0x090c15 );
	scene.userData.lesson = { title, instructions: options.instructions, source: scan.meta.page, credit: scan.meta.credit };
	scene.add( new THREE.HemisphereLight( 0xdce8ff, 0x686379, survey ? .54 : .57 ) );
	const camera = new THREE.PerspectiveCamera( fov, 1, .025, 80 );
	camera.position.fromArray( position );
	camera.lookAt( ...target );

	const scripts = {};
	function add( object, name, position = [ 0, 0, 0 ], parent = scene ) {

		object.name = name;
		object.position.fromArray( position );
		parent.add( object );
		return object;

	}
	const reference = add( new THREE.Group(), 'Room reference model' );
	const guides = survey ? add( new THREE.Group(), 'Reference outlines' ) : null;
	const capture = add( new THREE.Group(), 'Scan · ' + scan.meta.title.split( ' (' )[ 0 ], [ 0, scanFloor, 0 ] );
	capture.rotation.x = Math.PI;
	capture.visible = captureVisible;
	capture.userData.assetObject = { type: 'gaussian-splat', path: scan.path };
	capture.userData.asset = scan.meta;
	scripts[ capture.uuid ] = [ { ...splatScript( 'assets/' + scan.path, 'spz' ), paramValues: { opacity: survey ? .88 : .75 } } ];

	function look( object, aim ) {

		object.lookAt( new THREE.Vector3().copy( object.position ).multiplyScalar( 2 ).sub( new THREE.Vector3( ...aim ) ) );

	}
	function receiverMaterial( material, name, { color, alpha, receive = true, cast = true } ) {

		material.color.set( color );
		material.opacity = survey ? Math.min( alpha, .14 ) : alpha;
		material.transparent = material.opacity < 1;
		material.depthWrite = ! material.transparent;
		material.name = name;
		return { receive: receive && ! survey, cast: cast && ! survey };

	}
	function outline( object, color ) {

		if ( ! guides ) return;
		object.updateWorldMatrix( true, false );
		const edges = new THREE.BufferGeometry().copy( new THREE.EdgesGeometry( object.geometry ) );
		const guide = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color, transparent: true, opacity: .65, depthWrite: false } ) );
		guide.name = object.name + ' outline';
		guide.matrix.copy( object.matrixWorld );
		guide.matrix.decompose( guide.position, guide.quaternion, guide.scale );
		guides.add( guide );

	}
	function panel( name, points, { color = 0xc4c6cd, alpha = 1, guide = 0x638796, receive = true, cast = true, unlit = false } = {}, parent = reference ) {

		const object = add( modelObject( THREE, { kind: 'mesh', points, faces: [ points.map( ( _, i ) => i ) ] }, name ), name, [ 0, 0, 0 ], parent );
		if ( unlit ) {

			object.material.dispose();
			object.material = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } );

		}
		const shadow = receiverMaterial( object.material, name, { color, alpha, receive, cast } );
		object.castShadow = shadow.cast;
		object.receiveShadow = shadow.receive;
		outline( object, guide );
		return object;

	}
	function box( name, size, position, color, parent, guide = 0x638796 ) {

		const geometry = new THREE.BoxGeometry( ...size );
		const material = new THREE.MeshStandardMaterial( { roughness: .77 } );
		const shadow = receiverMaterial( material, name, { color, alpha: 1 } );
		const object = add( new THREE.Mesh( geometry, material ), name, position, parent );
		object.castShadow = shadow.cast;
		object.receiveShadow = shadow.receive;
		outline( object, guide );
		return object;

	}
	function projector( name, position, aim, { asset, canvas, mask, ...settings } ) {

		const rig = add( new THREE.Group(), name, position );
		rig.userData.assetObject = { type: 'projector' };
		if ( mask ) rig.userData.projectionMask = { mode: 'inside', points: mask };
		look( rig, aim );
		scripts[ rig.uuid ] = [ { ...projectorScript( asset?.path, asset?.meta.kind === 'video', canvas ), paramValues: { intensity: 3.6, range: 15, ...settings } } ];
		return rig;

	}
	async function save( id, assets = [] ) {

		const file = id + '.app.json';
		camera.updateMatrixWorld( true );
		scene.updateMatrixWorld( true );
		await writeFile( new URL( file, output ), JSON.stringify( {
			project: { title, renderer: 'WebGLRenderer', shadows: true, shadowType: THREE.PCFShadowMap, toneMapping: THREE.NeutralToneMapping },
			scene: scene.toJSON(), camera: camera.toJSON(), viewportCamera: camera.uuid,
			viewportTarget: target, mainCameraTarget: target, environmentType: 'None', backgroundType: 'Color', scripts,
			history: { undos: [], redos: [] }
		} ) + '\n' );
		examples.push( { title, file: 'examples/gallery/' + file, assets: [ scan, ...assets ] } );

	}
	return { add, panel, box, projector, reference, scripts, save };

}

function walls( scene, footprint, height ) {

	const at = ( [ x, z ], y ) => [ x, y, z ];
	const [ sw, se, ne, nw ] = footprint;
	scene.panel( 'Floor datum', footprint.map( p => at( p, 0 ) ), { color: 0x4e5564, cast: false } );
	scene.panel( 'West wall', [ at( nw, 0 ), at( sw, 0 ), at( sw, height ), at( nw, height ) ], { color: 0xb2b7c3 } );
	scene.panel( 'East wall', [ at( se, 0 ), at( ne, 0 ), at( ne, height ), at( se, height ) ], { color: 0xc2c5cf } );

}

function ddaRoom( scene ) {

	// Planes and furniture fitted in the upright capture coordinate system.
	const height = 3.02;
	const SW = [ -5.74, 4.89 ], SE = [ 4.85, 4.89 ], NE = [ 4.85, -4.43 ], NW = [ -4.04, -4.43 ];
	walls( scene, [ SW, SE, NE, NW ], height );
	for ( const [ label, z, jambs ] of [
		[ 'Entrance glazing', SW[ 1 ], [ SW[ 0 ], -4.21, -2.71, -1.20, .31, 1.81, 3.31, SE[ 0 ] ] ],
		[ 'Rear glazing', NW[ 1 ], [ NW[ 0 ], -2.88, -1.70, -.55, .57, 1.61, 2.73, 3.86, NE[ 0 ] ] ]
	] ) {

		const group = scene.add( new THREE.Group(), label, [ 0, 0, 0 ], scene.reference );
		for ( const [ i, x ] of jambs.entries() ) {

			scene.box( label + ' mullion ' + ( i + 1 ), [ .054, height, .08 ], [ x, height / 2, z ], 0x6a7484, group, 0x59aec2 );
			if ( i === jambs.length - 1 ) continue;
			const next = jambs[ i + 1 ];
			scene.panel( label + ' pane ' + ( i + 1 ), [
				[ x, .07, z ], [ next, .07, z ], [ next, height - .07, z ], [ x, height - .07, z ]
			], { color: 0x4a687a, alpha: .10, guide: 0x59aec2, cast: false, receive: false, unlit: true }, group );

		}
		const span = jambs.at( -1 ) - jambs[ 0 ], center = ( jambs.at( -1 ) + jambs[ 0 ] ) / 2;
		for ( const y of [ .035, height - .035 ] ) {
			scene.box( label + ' rail', [ span, .07, .09 ], [ center, y, z ], 0x555d6c, group, 0x59aec2 );
		}

	}
	const bench = scene.add( new THREE.Group(), 'Bench', [ .10, 0, .44 ] );
	scene.box( 'Bench base', [ 1.43, .14, .83 ], [ 0, .085, 0 ], 0x9a623e, bench, 0xc0a47f );
	scene.box( 'Bench cushion', [ 1.39, .39, .8 ], [ 0, .347, 0 ], 0x343d4b, bench, 0xc0a47f );
	const pedestal = scene.add( new THREE.Group(), 'Pedestal', [ 2.86, 0, -2.10 ] );
	scene.box( 'Pedestal body', [ .53, 1.14, .53 ], [ 0, .57, 0 ], 0xe9e5dc, pedestal, 0xf0dc90 );
	return pedestal;

}

const aperture = [ [ .08, .13 ], [ .88, .06 ], [ .94, .24 ], [ .89, .94 ], [ .09, .94 ], [ .065, .76 ] ];
const pedestalMask = [ [ .085, .075 ], [ .915, .075 ], [ .915, .925 ], [ .085, .925 ] ];
const particleSource = {
	parameters: `// @param particles = 125 (20..250)
// @label particles = "Particle count"
// @param speed = 1 (0..3)
// @label speed = "Particle speed"`,
	create: function createParticles() {

		const canvas = document.createElement( 'canvas' );
		canvas.width = 320;
		canvas.height = 680;
		const ctx = canvas.getContext( '2d' );
		const colors = [ '#54d7f1', '#9a93ff', '#ddbb81', '#e7f8f4' ];
		const phase = index => ( Math.sin( index * 117.23 ) * 13758.425 % 1 + 1 ) % 1;
		const vignette = ctx.createRadialGradient( 160, 350, 0, 160, 350, 355 );
		vignette.addColorStop( 0, '#182a47' );
		vignette.addColorStop( .62, '#0c1830' );
		vignette.addColorStop( 1, '#01040a' );
		function point( i, t ) {

			const v = ( phase( i ) + t * (.035 + phase( i + 67 ) * .025) ) % 1;
			const a = v * 8.2 + phase( i + 17 ) * 5.4 + t * .53;
			const spread = 62 + 54 * Math.sin( Math.PI * v );
			return [ 160 + Math.sin( a ) * spread + ( phase( i + 664 ) - .5 ) * 36, 630 - v * 580 ];

		}
		return { canvas, update( elapsed, params ) {

			const t = elapsed * params.speed;
			ctx.globalAlpha = 1;
			ctx.globalCompositeOperation = 'source-over';
			ctx.fillStyle = vignette;
			ctx.fillRect( 0, 0, canvas.width, canvas.height );
			ctx.globalCompositeOperation = 'lighter';
			for ( let i = 1; i <= params.particles; i ++ ) {

				const now = point( i, t ), prev = point( i, t - .1 );
				const color = colors[ i % colors.length ];
				ctx.strokeStyle = color;
				ctx.globalAlpha = .45;
				ctx.lineWidth = 1 + phase( i + 29 ) * 2.6;
				if ( Math.abs( prev[ 1 ] - now[ 1 ] ) < 45 ) {
					ctx.beginPath();
					ctx.moveTo( ...prev );
					ctx.lineTo( ...now );
					ctx.stroke();
				}
				ctx.fillStyle = color;
				ctx.globalAlpha = .85;
				ctx.beginPath();
				ctx.arc( ...now, 1.5 + phase( i + 45 ) * 3.8, 0, Math.PI * 2 );
				ctx.fill();

			}
			ctx.globalAlpha = 1;
			ctx.globalCompositeOperation = 'source-over';

		} };

	}
};

function sculpture( scene, pedestal ) {

	const bounds = .46;
	const mesh = scene.add( new THREE.Mesh( new THREE.BoxGeometry( bounds * 2, bounds * 2, bounds * 2 ), new THREE.MeshBasicMaterial( { color: 0x64d3ff } ) ),
		'Animated SDF · Orbit knot', [ 0, 1.59, 0 ], pedestal );
	const field = `uniform float galleryPhase;
mat2 rotatePlane(float angle) {
 float c = cos(angle), s = sin(angle);
 return mat2(c,-s,s,c);
}
float ring(vec3 p, float radius) {
 float w = atan(p.z, p.x);
 return length(vec2(length(p.xz) - radius - .018 * sin(3. * w + galleryPhase * 2.), p.y)) - .041;
}
float blendSdf(float a, float b) {
 float h = clamp(.5 + .5 * (b-a) / .045, 0., 1.);
 return mix(b,a,h) - .045 * h * (1.-h);
}
float map(vec3 p) {
 p.xz = rotatePlane(galleryPhase) * p.xz;
 p.xy = rotatePlane(.39 + galleryPhase * .42) * p.xy;
 vec3 q = p, r = p;
 q.xy = rotatePlane(1.03) * q.xy;
 r.yz = rotatePlane(-1.10) * r.yz;
 return blendSdf(blendSdf(ring(p,.265),ring(q,.235)),ring(r,.216));
}`;
	scene.scripts[ mesh.uuid ] = [ {
		name: 'Orbit knot SDF', assetBehavior: 'math', enabled: true,
		source: `// @param speed = 0.75 (0..3)
// @label speed = "Orbit speed"
let activeMaterial, originalMaterial, elevation;
let speed = params.speed;
function init() {
 originalMaterial = this.material;
 elevation = this.position.y;
 activeMaterial = (${ sdfMaterial.toString() })(THREE, ${ JSON.stringify( field ) }, ${ bounds });
 activeMaterial.uniforms.galleryPhase = { value: 0 };
 this.material = activeMaterial;
}
function setParameters(next) { speed = next.speed; }
function update(event) {
 const phase = event.time * .001 * speed;
 activeMaterial.uniforms.galleryPhase.value = phase;
 this.position.y = elevation + Math.sin(phase * 2.) * .07;
}
function stop() {
 this.material = originalMaterial;
 this.position.y = elevation;
 activeMaterial.dispose();
}
`
	} ];

}

const survey = setup( 'DDA Gallery · Scan and proxy', dda, {
	position: [ 1.45, 1.61, 3.95 ], target: [ .95, 1.52, -2.65 ], survey: true, fov: 64,
	instructions: 'Toggle the capture and reference outlines to inspect window placement. Edit the floor and walls or measure the pedestal against the scan.'
} );
ddaRoom( survey );
await survey.save( 'dda-survey' );

const mapping = setup( 'DDA Gallery · Pedestal and wall mapping', dda, {
	position: [ -1.45, 1.77, 4.15 ], target: [ 3.45, 1.38, -.87 ], fov: 56,
	instructions: 'Split the Director and Pedestal particles views. Edit the pedestal mask and compare the two wall zones. Reveal the scan in the outliner to check alignment.'
} );
const pedestal = ddaRoom( mapping );
mapping.projector( 'Pedestal particles', [ 2.87, .74, 1.37 ], [ 2.86, .57, -1.835 ], {
	canvas: particleSource, throwRatio: 5.45, aspect: .467, intensity: 3.9, mask: pedestalMask
} );
mapping.projector( 'East wall · Motion field', [ .86, 1.45, -.35 ], [ 4.85, 1.51, -.23 ], {
	asset: gallop, throwRatio: 1.04, intensity: 3.3, mask: aperture
} );
mapping.projector( 'East wall · Rear inset', [ 1.83, 1.87, -3.12 ], [ 4.85, 1.72, -3.14 ], {
	asset: yosemite, throwRatio: 2.32, intensity: 3.3, mask: [ [ .02, .09 ], [ .95, .035 ], [ .95, .90 ], [ .02, .95 ] ]
} );
sculpture( mapping, pedestal );
await mapping.save( 'dda-mapping', [ gallop, yosemite ] );

const study = setup( 'Spatial Computing Room · Alignment', spatial, {
	position: [ 1.38, 1.65, 4.65 ], target: [ -.05, 1.86, -5.7 ], survey: true, scanFloor: -.09, fov: 61,
	instructions: 'Compare the calibration grid and simplified room planes with the scan. Open the wall projector’s view to position a mask, or use Measure to establish a known scale.'
} );
const sw = [ -3.78, 5.43 ], se = [ 3.31, 5.43 ], ne = [ 3.45, -6.22 ], nw = [ -4.17, -6.22 ];
walls( study, [ sw, se, ne, nw ], 3.73 );
study.panel( 'Entry wall', [ [ sw[ 0 ], 0, sw[ 1 ] ], [ se[ 0 ], 0, se[ 1 ] ], [ se[ 0 ], 3.73, se[ 1 ] ], [ sw[ 0 ], 3.73, sw[ 1 ] ] ], { color: 0x5c687d } );
// Solid main target sits just inside the scanned back plane so the grid reads over the capture.
const target = study.panel( 'Back wall · Calibration receiver', [
	[ -2.51, .54, -6.05 ], [ 2.46, .54, -6.05 ], [ 2.46, 3.17, -6.05 ], [ -2.51, 3.17, -6.05 ]
], { guide: 0x79c2d2 } );
target.material.opacity = 1;
target.material.transparent = false;
target.material.depthWrite = true;
target.receiveShadow = true;
study.projector( 'Back wall projector', [ -1.1, 2.74, .95 ], [ -.02, 1.84, -6.05 ], { throwRatio: 1.6, intensity: 2.5 } );
await study.save( 'spatial-alignment' );

await writeFile( new URL( 'catalog.js', output ), '// Generated by tools/build-gallery-examples.mjs.\nexport const galleryExamples = ' + JSON.stringify( examples, null, 2 ) + ';\n' );
