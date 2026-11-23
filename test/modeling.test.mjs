import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { addFace, boundaryEdge, extrudeEdge, extrudeFace, insertModelPoint, meshFromOutline, modelData, modelGeometry, modelObject, moveAuthoredMeshPoints, outlinePoints, pokeFace, readModelGeometry, removePoints, splitEdge, weldPoints } from '../editor/js/modeling/ModelGeometry.js';
import { applyProjectionMask, appendMaskShape, maskFromOutline, maskShapes } from '../editor/js/modeling/ProjectionMask.js';
import { projectorScript, upgradeProjectorScript } from '../editor/js/assets/Projector.js';
import { inspectProjectorCoverage } from '../editor/js/modeling/ProjectorCoverage.js';
import { sculptNeighbors, sculptPoints } from '../editor/js/modeling/SculptBrush.js';
import { sculptMask } from '../editor/js/modeling/MaskSculpt.js';
import { fitDrawingContour, insertContourPoint, segmentCount } from '../editor/js/modeling/Contour.js';
import { StrokeSampler } from '../editor/js/modeling/StrokeSampler.js';
import { simplifyPencilStroke, smoothPencilStroke } from '../editor/js/modeling/PencilStroke.js';
import { meshPrimitives } from '../editor/js/modeling/MeshPrimitives.js';
import { layoutUV } from '../editor/js/modeling/UVLayout.js';
import { uvComponents, uvCornerTopology } from '../editor/js/modeling/UVIslands.js';
import { uvSelectionCorrespondence } from '../editor/js/modeling/UVSelectionSync.js';
import { elementKey, meshEdges } from '../editor/js/modeling/MeshSelection.js';
import { packExistingUVs } from '../editor/js/modeling/UVPack.js';
import { pencilRibbon } from '../editor/js/modeling/PencilRibbon.js';
import { generateThreeCode } from '../editor/js/ThreeCodeExporter.js';
import { separateMesh } from '../editor/js/modeling/MeshSeparation.js';
import { joinMeshGeometry } from '../editor/js/modeling/MeshJoin.js';

test( 'Pencil taper widens a two-point ribbon between its tips and skips closed strokes', () => {

	const points = [ new THREE.Vector3(), new THREE.Vector3( 10, 0, 0 ) ];
	const sample = { radius: 1, opacity: 1, normal: [ 0, 0, 1 ], right: [ 1, 0, 0 ], up: [ 0, 1, 0 ] };
	const brush = { color: '#ffffff', strength: 1, hardness: 1, samples: [ sample, sample ], taperStart: .2, taperEnd: .3 };
	const positions = pencilRibbon( THREE, points, false, brush ).attributes.position;
	assert.ok( Math.abs( positions.getY( 0 ) + .12 ) < 1e-6 );
	assert.ok( Array.from( positions.array ).some( ( coordinate, index ) => index % 3 === 1 && coordinate === 1 ) );
	const loop = [ ...points, new THREE.Vector3( 5, 5, 0 ) ];
	assert.deepEqual( pencilRibbon( THREE, loop, true, brush ).attributes.position.array,
		pencilRibbon( THREE, loop, true, { ...brush, taperStart: 0, taperEnd: 0 } ).attributes.position.array );

} );

test( 'Cube and Plane primitives use authored quad topology and UVs', () => {

	const build = key => meshPrimitives.find( ( [ kind ] ) => kind === key )[ 2 ]( THREE, true );
	const cube = build( 'box' );
	const faces = readModelGeometry( cube ).faces;
	assert.deepEqual( faces.map( face => face.length ), [ 4, 4, 4, 4, 4, 4 ] );
	const islands = faces.map( face => {

		const uv = face.surface.channels.uv;
		return [ 0, 1 ].map( axis => [ Math.min( ...uv.map( point => point[ axis ] ) ), Math.max( ...uv.map( point => point[ axis ] ) ) ] );

	} );
	for ( const [ index, island ] of islands.entries() ) for ( const other of islands.slice( index + 1 ) ) {

		assert.ok( island.some( ( [ low, high ], axis ) => high <= other[ axis ][ 0 ] || low >= other[ axis ][ 1 ] ) );

	}
	const distinct = new Set( faces.flatMap( face => face.surface.channels.uv.map( pair => pair.join( ',' ) ) ) );
	assert.equal( distinct.size, 14, 'the six faces share hinges in a connected cross' );

	const plane = build( 'plane' );
	assert.equal( readModelGeometry( plane ).faces.length, 1 );
	assert.equal( plane.attributes.normal.getY( 0 ), 1 );
	assert.equal( plane.attributes.uv.count, plane.attributes.position.count );
	assert.deepEqual( plane.userData.modeling.points.map( point => point[ 1 ] ), [ 0, 0, 0, 0 ] );
	cube.dispose();
	plane.dispose();

} );

test( 'UV selection maps seam copies, authored edges and full polygon faces', () => {

	const cube = meshPrimitives.find( ( [ kind ] ) => kind === 'box' )[ 2 ]( THREE, true );
	for ( const geometry of [ cube, new THREE.BoxGeometry() ] ) {

		const data = readModelGeometry( geometry );
		const count = geometry.index?.count ?? geometry.attributes.position.count;
		const triangles = Array.from( { length: count / 3 }, ( _, i ) => [ 0, 1, 2 ].map( offset => {

			const row = 3 * i + offset;
			return geometry.index ? geometry.index.getX( row ) : row;

		} ) );
		const map = uvSelectionCorrespondence( geometry, data, triangles );
		const vertex = map.fromMesh( 'vertex', [ '0' ] );
		assert.ok( vertex.selection.length > 1 );
		for ( const corner of vertex.selection ) assert.deepEqual( map.toMesh( 'vertex', [ corner ] ), [ [ 0 ] ] );

		const edge = meshEdges( data ).find( ids => map.fromMesh( 'edge', [ elementKey( ids ) ] ).selection.length === 4 );
		const edgeCopies = map.fromMesh( 'edge', [ elementKey( edge ) ] );
		assert.equal( edgeCopies.edges.size, 2 );
		const [ first, second ] = [ ...edgeCopies.edges ].map( key => key.split( ':' ).map( Number ) );
		assert.deepEqual( map.toMesh( 'edge', first ), [ edge ] );
		assert.deepEqual( map.toMesh( 'edge', [ first[ 0 ], second[ 1 ] ] ), [] );

		const face = data.faces[ 0 ];
		const patch = map.fromMesh( 'face', [ elementKey( face ) ] );
		assert.equal( patch.faces.size, face.length - 2 );
		assert.deepEqual( map.toMesh( 'face', patch.selection.slice( 1 ) ), [] );
		assert.deepEqual( map.toMesh( 'face', patch.selection ), [ face ] );
		geometry.dispose();

	}

} );

test( 'Pencil point insertion and removal keep thickness and opacity aligned with vertices', () => {

	const sample = ( radius, opacity ) => ( { radius, opacity, normal: [ 0, 0, 1 ], right: [ 1, 0, 0 ], up: [ 0, 1, 0 ] } );
	const data = { kind: 'path', points: [ [ 0, 0, 0 ], [ 2, 0, 0 ], [ 3, 1, 0 ] ],
		pencilBrush: { samples: [ sample( 1, 0 ), sample( 3, 1 ), sample( 4, .4 ) ] } };
	assert.equal( insertModelPoint( data, 0, .5 ), 1 );
	assert.deepEqual( data.points[ 1 ], [ 1, 0, 0 ] );
	assert.deepEqual( data.pencilBrush.samples[ 1 ], sample( 2, .5 ) );
	removePoints( data, [ 0, 2 ] );
	assert.deepEqual( data.pencilBrush.samples, [ sample( 2, .5 ), sample( 4, .4 ) ] );

} );

test( 'Pencil cleanup preserves attached samples between the endpoints', () => {

	const points = [ [ 0, 0 ], [ 1, 1 ], [ 2, .1 ], [ 3, 1 ], [ 4, 0 ] ];
	const smoothed = smoothPencilStroke( points, .8, 2, [ 2 ] );
	assert.notDeepEqual( smoothed[ 1 ], points[ 1 ] );
	assert.deepEqual( simplifyPencilStroke( smoothed, point => point, 2, false, [ 2 ] ), [ points[ 0 ], points[ 2 ], points[ 4 ] ] );

} );

test( 'Brush samples follow pointer corners and interpolate pressure at fixed spacing', () => {

	const sampler = new StrokeSampler( 0, 0, .2, 5 );
	const samples = [];
	const emit = ( x, y, pressure ) => samples.push( [ x, y, Number( pressure.toFixed( 2 ) ) ] );
	assert.equal( sampler.move( 3, 0, .5, emit ), false );
	assert.equal( sampler.move( 3, 4, .9, emit ), true );
	assert.equal( sampler.move( 3, 7, .3, emit ), true );
	assert.equal( sampler.move( 3, 7, .3, emit ), false );
	assert.deepEqual( samples, [ [ 3, 2, .7 ], [ 3, 7, .3 ] ] );

} );

test( 'Joining meshes preserves slot order, polygon faces and mirrored winding', () => {

	const active = modelGeometry( THREE, modelData( 'mesh' ) );
	active.addGroup( 0, active.attributes.position.count, 1 );
	const other = new THREE.PlaneGeometry();
	const activeSlots = [ new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial() ];
	const sourceMaterial = new THREE.MeshStandardMaterial();
	const { geometry, material } = joinMeshGeometry( THREE, [
		{ geometry: active, material: activeSlots, matrix: new THREE.Matrix4() },
		{ geometry: other, material: sourceMaterial, matrix: new THREE.Matrix4().makeScale( -1, 2, 1 ).setPosition( 4, 0, 0 ) }
	] );
	assert.deepEqual( material, [ ...activeSlots, sourceMaterial ] );
	assert.deepEqual( geometry.groups.map( group => group.materialIndex ), [ 1, 2 ] );
	assert.deepEqual( geometry.userData.modeling.faces.map( face => face.length ), [ 4, 3, 3 ] );
	assert.deepEqual( geometry.userData.triangleFaces, [ 0, 0, 1, 2 ] );
	const first = geometry.groups[ 1 ].start;
	const vertices = [ 0, 1, 2 ].map( i => new THREE.Vector3().fromBufferAttribute( geometry.attributes.position, geometry.index.getX( first + i ) ) );
	const [ a, b, c ] = vertices;
	assert.ok( b.sub( a ).cross( c.sub( a ) ).z > 0 );
	assert.deepEqual( geometry.attributes.uv.array.slice( -other.attributes.uv.array.length ), other.attributes.uv.array );
	const previous = geometry.userData.modeling, next = structuredClone( previous );
	next.points[ 0 ][ 2 ] += .5;
	const moved = moveAuthoredMeshPoints( THREE, geometry, previous, next );
	assert.deepEqual( moved.groups, geometry.groups );
	assert.deepEqual( moved.attributes.uv.array, geometry.attributes.uv.array );
	assert.equal( moved.index.count, geometry.index.count );

} );

test( 'Separating authored faces preserves n-gons and remaps triangulation', () => {

	const data = modelData( 'mesh' );
	data.points.push( [ 3, 0, 0 ], [ 4, 0, 0 ], [ 4, 1, 0 ], [ 3, 1, 0 ], [ 5, 0, 0 ] );
	data.faces.push( [ 4, 5, 6, 7 ] );
	const source = modelGeometry( THREE, data );
	const parts = separateMesh( THREE, source, data, 'selection', [ 1 ] );
	assert.equal( parts.length, 2 );
	assert.deepEqual( parts.map( part => part.userData.modeling.faces ), [ [ [ 0, 1, 2, 3 ] ], [ [ 0, 1, 2, 3 ] ] ] );
	assert.deepEqual( parts.map( part => part.userData.modeling.points.length ), [ 5, 4 ] );
	assert.deepEqual( parts.map( part => part.userData.triangleFaces ), [ [ 0, 0 ], [ 0, 0 ] ] );
	assert.deepEqual( parts[ 1 ].attributes.uv.array, source.attributes.uv.array.slice( 12 ) );
	assert.equal( separateMesh( THREE, source, data, 'loose' ).length, 2 );

} );

test( 'Separating indexed triangles copies custom channels and material slots', () => {

	const geometry = new THREE.BufferGeometry().setIndex( [ 0, 1, 2, 2, 1, 3 ] );
	const positions = [ [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, 1, 0 ], [ 1, 1, 0 ] ];
	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions.flat(), 3 ) );
	const stream = new THREE.InterleavedBuffer( Uint8Array.from( [ 11, 21, 12, 22, 13, 23, 14, 24 ] ), 2 );
	geometry.setAttribute( 'custom', new THREE.InterleavedBufferAttribute( stream, 1, 1, true ) );
	geometry.addGroup( 0, 3, 1 );
	geometry.addGroup( 3, 3, 0 );
	const [ first, second ] = separateMesh( THREE, geometry, { kind: 'vertices', points: positions, faces: [ [ 0, 1, 2 ], [ 2, 1, 3 ] ] }, 'material' );
	assert.deepEqual( first.groups, [ { start: 0, count: 3, materialIndex: 1 } ] );
	assert.deepEqual( second.groups, [ { start: 0, count: 3, materialIndex: 0 } ] );
	assert.deepEqual( [ ...second.attributes.custom.array ], [ 23, 22, 24 ] );
	assert.equal( second.attributes.custom.normalized, true );
	assert.deepEqual( [ ...second.index.array ], [ 0, 1, 2 ] );

} );

test( 'Authored polygon topology persists through split, extrusion, serialization and deletion', () => {

	const data = modelData( 'mesh' );
	const midpoint = splitEdge( data, 0, 1 );
	assert.deepEqual( data.faces[ 0 ], [ 0, midpoint, 1, 2, 3 ] );
	assert.throws( () => addFace( THREE, data, [ 0, midpoint, 1 ] ), /area/ );
	assert.throws( () => splitEdge( data, 0, 2 ), /existing edge/ );
	const cap = extrudeFace( THREE, data, 0, .5 );
	assert.equal( data.faces.length, 7 );
	assert.equal( data.points[ cap[ 0 ] ][ 2 ], .5 );
	const object = modelObject( THREE, data, 'Mesh' );
	const restored = new THREE.ObjectLoader().parse( object.toJSON() );
	assert.deepEqual( restored.geometry.userData.modeling, data );
	assert.ok( restored.geometry.attributes.position.count >= 30 );
	assert.equal( restored.geometry.attributes.position.count, restored.geometry.attributes.uv.count );
	removePoints( data, cap );
	assert.ok( data.faces.every( face => face.every( index => index < data.points.length ) ) );

} );

test( 'A closed curve can become an extruded receiver or a normalized projector aperture', () => {

	const shape = modelData( 'shape' );
	shape.smooth = true;
	shape.depth = .45;
	const outline = outlinePoints( THREE, shape );
	assert.ok( outline.length > shape.points.length );
	const geometry = modelGeometry( THREE, shape );
	geometry.computeBoundingBox();
	assert.ok( Math.abs( geometry.boundingBox.max.z - .45 ) < 1e-6 );
	const mask = maskFromOutline( outline.map( point => point.toArray() ) );
	assert.equal( mask.mode, 'inside' );
	assert.ok( mask.points.flat().every( value => value >= .1 && value <= .9 ) );

} );

test( 'Projector masking uses the optical rectangle and survives source export and legacy upgrade', () => {

	const mask = { mode: 'inside', points: [ [ .2, .3 ], [ .8, .3 ], [ .5, .7 ] ] };
	const calls = [];
	const context = new Proxy( {}, { get: ( target, key ) => ( ...args ) => calls.push( [ key, ...args ] ) } );
	applyProjectionMask( context, mask, 10, 20, 100, 50 );
	assert.deepEqual( calls.find( call => call[ 0 ] === 'rect' ), [ 'rect', 10, 20, 100, 50 ] );
	assert.deepEqual( calls.find( call => call[ 0 ] === 'moveTo' ), [ 'moveTo', 30, 35 ] );
	assert.deepEqual( calls.find( call => call[ 0 ] === 'fill' ), [ 'fill', 'evenodd' ] );
	calls.length = 0;
	applyProjectionMask( context, { ...mask, mode: 'cutout' }, 10, 20, 100, 50 );
	assert.ok( ! calls.some( call => call[ 0 ] === 'rect' ) );

	const scene = new THREE.Scene(), rig = new THREE.Group();
	rig.userData = { assetObject: { type: 'projector' }, projectionMask: mask };
	scene.add( rig, modelObject( THREE, modelData( 'path' ), 'Curve' ) );
	const script = projectorScript();
	const { code } = generateThreeCode( {
		scene, camera: new THREE.PerspectiveCamera(), scripts: { [ rig.uuid ]: [ script ] }, config: { getKey() {} }
	} );
	assert.match( code, /\.userData\.projectionMask =/ );
	assert.match( code, /g\.userData\.modeling =/ );
	assert.match( code, /applyProjectionMask\( ctx, root\.userData\.projectionMask/ );
	const legacy = { assetBehavior: 'projector', source: 'function projectorRuntime( THREE, root, player ) {\n\t\ttexture.needsUpdate = true;\n}' };
	upgradeProjectorScript( legacy );
	const upgraded = legacy.source;
	assert.match( upgraded, /applyProjectionMask\( ctx, root\.userData\.projectionMask/ );
	upgradeProjectorScript( legacy );
	assert.equal( legacy.source, upgraded );

} );

test( 'A rolled, parented projector preserves the same image plane in its viewport camera', async () => {

	const { fitView, lightViewCamera } = await import( '../editor/js/modeling/LightView.js' );
	const parent = new THREE.Group(), rig = new THREE.Group();
	parent.rotation.y = .63;
	parent.position.set( 3, 1, - 2 );
	parent.add( rig );
	rig.rotation.z = .7;
	rig.userData.assetObject = { type: 'projector' };
	rig.projectorFrame = { width: .4, height: .25, range: 18 };
	const camera = lightViewCamera( THREE, rig );
	const corner = rig.localToWorld( new THREE.Vector3( .4 * 3, .25 * 3, - 3 ) ).project( camera );
	assert.ok( Math.abs( corner.x - 1 ) < 1e-8 && Math.abs( corner.y - 1 ) < 1e-8 );
	assert.equal( lightViewCamera( THREE, rig, camera ), camera );
	assert.deepEqual( fitView( { x: 500, y: 0, width: 500, height: 500 }, 2 ), { x: 500, y: 125, width: 500, height: 250 } );

	const spot = new THREE.SpotLight( 0xffffff, 1, 10, Math.PI / 6 );
	spot.position.set( 0, 1, 5 );
	spot.target.position.set( 0, 1, 0 );
	assert.ok( Math.abs( lightViewCamera( THREE, spot ).fov - 60 ) < 1e-8 );
	assert.ok( lightViewCamera( THREE, new THREE.DirectionalLight() ).isOrthographicCamera );

} );

test( 'Ruler distances follow mesh transforms and report upright area in calibrated units', async () => {

	const { formatMeasurement, makeMeasurePoint, measurementArea, measurementLength, worldMeasurePoints } = await import( '../editor/js/modeling/Measurements.js' );
	const scene = new THREE.Scene(), wall = new THREE.Mesh( new THREE.PlaneGeometry() );
	scene.add( wall );
	const corners = [ [ 0, 0, 0 ], [ 2, 0, 0 ], [ 2, 3, 0 ], [ 0, 3, 0 ] ].map( point => new THREE.Vector3( ...point ) );
	const anchors = corners.map( point => makeMeasurePoint( point, wall ) );
	wall.position.set( 3, 4, 5 );
	wall.scale.setScalar( 2 );
	const resolved = worldMeasurePoints( THREE, scene, null, anchors );
	assert.deepEqual( resolved[ 0 ].toArray(), [ 3, 4, 5 ] );
	assert.equal( measurementLength( resolved, true ), 20 );
	assert.equal( measurementArea( THREE, resolved ), 24 );
	assert.equal( formatMeasurement( 24, 'm', .5, true ), '6.00 m²' );
	wall.removeFromParent();
	assert.deepEqual( worldMeasurePoints( THREE, scene, null, anchors )[ 2 ].toArray(), [ 2, 3, 0 ] );

} );

test( 'Optics helpers place the body behind the lens and the projector frustum along its beam', async () => {

	const { createCameraHelper, createProjectorHelper } = await import( '../editor/js/modeling/OpticsHelpers.js' );
	const parent = new THREE.Group(), projector = new THREE.Group();
	parent.position.set( 4, 2, - 1 );
	parent.rotation.set( .1, .8, -.12 );
	parent.add( projector );
	projector.position.set( 1, .4, - 2 );
	projector.rotation.set( -.35, .6, .2 );
	projector.userData.assetObject = { type: 'projector' };
	projector.projectorFrame = { width: .4, height: .25, range: 12 };
	const helper = createProjectorHelper( THREE, projector );
	helper.updateMatrixWorld( true );

	const origin = projector.getWorldPosition( new THREE.Vector3() );
	const beam = projector.localToWorld( new THREE.Vector3( 0, 0, - 1 ) ).sub( origin ).normalize();
	const frustum = helper.geometry.attributes.position;
	const end = [ 'f1', 'f2', 'f3', 'f4' ].reduce( ( center, corner ) =>
		center.add( new THREE.Vector3().fromBufferAttribute( frustum, helper.pointMap[ corner ][ 0 ] ) ), new THREE.Vector3()
	).multiplyScalar( .25 ).applyMatrix4( helper.matrixWorld );
	assert.ok( end.sub( origin ).distanceTo( beam.clone().multiplyScalar( 12 ) ) < 1e-5 );

	for ( const body of [ helper.getObjectByName( 'Projector body' ), createCameraHelper( THREE, new THREE.PerspectiveCamera() ).getObjectByName( 'Camera body' ) ] ) {

		assert.ok( body.isLineSegments );
		assert.equal( body.material.color.getHex(), 0xff9d3d );
		body.geometry.computeBoundingBox();
		assert.equal( body.geometry.boundingBox.min.z, 0 );
		assert.ok( body.geometry.boundingBox.max.z > .2 );

	}

} );

test( 'Draft shapes stay open until completed and legacy shapes still fill', () => {

	const legacy = modelData( 'shape' );
	const draft = { ...legacy, closed: false };
	assert.equal( modelGeometry( THREE, draft ).attributes.position.count, 0 );
	const closed = { ...draft, closed: true };
	assert.ok( modelGeometry( THREE, closed ).attributes.position.count >= 3 );
	assert.equal( modelGeometry( THREE, legacy ).attributes.position.count, modelGeometry( THREE, closed ).attributes.position.count );
	assert.deepEqual( closed.points, draft.points );

} );


test( 'Projector UV layout uses the lens and preserves the source mesh', () => {

	const projector = new THREE.Group();
	projector.userData.assetObject = { type: 'projector' };
	projector.projectorFrame = { width: .5, height: .25, range: 20 };
	const mesh = new THREE.Mesh( new THREE.PlaneGeometry( 2, 1 ) );
	mesh.position.z = -4;
	const source = mesh.geometry.attributes.uv;
	const uv = layoutUV( THREE, mesh, projector.uuid, projector ).attributes.uv;
	assert.ok( Math.abs( uv.getX( 0 ) - .25 ) < 1e-6 );
	assert.ok( Math.abs( uv.getY( 0 ) - .75 ) < 1e-6 );
	assert.equal( source.getX( 0 ), 0 );
	assert.equal( source.getY( 0 ), 1 );
	mesh.position.z = 1;
	assert.throws( () => layoutUV( THREE, mesh, projector.uuid, projector ), /in front/ );

} );


test( 'Adding a mask shape preserves legacy apertures and their saved coordinates', () => {

	const points = [ [ .1, .1 ], [ .3, .1 ], [ .2, .5 ] ];
	const legacy = { mode: 'inside', points };
	const result = appendMaskShape( legacy, { mode: 'cutout', name: 'Hole', points } );
	assert.deepEqual( result.shapes.map( shape => [ shape.name, shape.mode ] ), [ [ 'Mask 1', 'inside' ], [ 'Hole', 'cutout' ] ] );
	maskShapes( result )[ 0 ].points[ 0 ][ 0 ] = 1;
	assert.equal( result.shapes[ 0 ].points[ 0 ][ 0 ], .1 );
	assert.equal( legacy.points[ 0 ][ 0 ], .1 );

} );

test( 'Mask sculpt subdivides and changes the contour locally near the brush', () => {

	const square = [ [ 0, 0 ], [ 100, 0 ], [ 100, 100 ], [ 0, 100 ] ];
	const push = sculptMask( square, [ 50, 0 ], [ 0, -8 ], 25, 'push' );
	assert.ok( push.length > square.length );
	assert.ok( push.some( ( [ , y ] ) => y < -5 ) );
	assert.deepEqual( push.filter( ( [ , y ] ) => y === 100 ), square.slice( 2 ) );
	const smooth = sculptMask( square, [ 0, 0 ], [ 0, 0 ], 25, 'smooth' );
	assert.ok( smooth[ 0 ].every( coordinate => coordinate > 0 ) );
	assert.deepEqual( square[ 0 ], [ 0, 0 ] );

} );

test( 'Open contours omit the closing segment during insertion and sculpting', () => {

	const points = [ [ 0, 0 ], [ 100, 0 ], [ 100, 100 ] ];
	assert.equal( segmentCount( points, false ), 2 );
	assert.equal( segmentCount( points, true ), 3 );
	assert.deepEqual( sculptMask( points, [ 50, 50 ], [ 10, 0 ], 15, 'push', 1, false ), points );
	assert.ok( sculptMask( points, [ 50, 50 ], [ 10, 0 ], 15, 'push' ).length > 3 );
	assert.equal( insertContourPoint( points, 2, .5 ), 3 );
	assert.deepEqual( points.at( -1 ), [ 50, 50 ] );
	assert.deepEqual( fitDrawingContour( [ [ 0, 1 ], [ 2, 1 ] ] ), [ [ .5 - .4, .5 ], [ .9, .5 ] ] );

} );


test( 'A curved profile extrudes into a capped mesh and the cap can extend again', () => {

	const profile = { kind: 'path', points: [ [ -1, -1, 0 ], [ 1, -1, 0 ], [ 1, 1, 0 ], [ -1, 1, 0 ] ], smooth: true, closed: true };
	// Detach the sampled profile from its source without changing its controls.
	const data = meshFromOutline( THREE, profile );
	const size = data.points.length;
	assert.ok( size > profile.points.length );
	const seed = data.faces[ 0 ].slice();
	const cap = extrudeFace( THREE, data, 0, new THREE.Vector3( .2, 0, -.5 ) );
	assert.deepEqual( data.faces[ 1 ], seed );
	assert.equal( data.faces.length, size + 2 );
	assert.equal( data.points[ cap[ 0 ] ][ 2 ], -.5 );
	extrudeFace( THREE, data, 0, .3 );
	assert.equal( data.faces.length, 2 * size + 2 );
	assert.equal( profile.points.length, 4 );

} );

test( 'A boundary edge extrudes as a connected strip with a selectable new edge', () => {

	const data = modelData( 'mesh' );
	const edge = boundaryEdge( data, 0, 1 );
	assert.deepEqual( edge, [ 1, 0 ] );
	const cap = extrudeEdge( THREE, data, edge, new THREE.Vector3( 0, -1, 0 ) );
	assert.equal( data.faces.length, 2 );
	assert.equal( boundaryEdge( data, ...edge ), null );
	assert.ok( boundaryEdge( data, ...cap ) );

} );


test( 'Topology pen splits at the specified edge fraction and welds a split boundary', () => {

	const data = modelData( 'mesh' );
	const split = splitEdge( data, 0, 1, .25 );
	assert.ok( Math.abs( data.points[ split ][ 0 ] + .7 ) < 1e-8 );
	assert.deepEqual( data.faces[ 0 ], [ 0, split, 1, 2, 3 ] );
	assert.deepEqual( weldPoints( data, [ split, 0 ] ), [ 3 ] );
	assert.equal( data.points.length, 4 );
	assert.equal( new Set( data.faces[ 0 ] ).size, 4 );
	assert.ok( data.faces[ 0 ].every( index => index < data.points.length ) );

} );

test( 'Inserting a point into a triangulated face preserves the other triangles', () => {

	const data = { kind: 'mesh', points: [ [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, 1, 0 ] ], faces: [ [ 0, 1, 2 ] ] };
	const result = pokeFace( THREE, data, 0, 0, new THREE.Vector3( .2, .2, 0 ) );
	assert.deepEqual( result, [ 3 ] );
	assert.equal( data.faces.length, 3 );
	assert.ok( data.faces.every( face => face.includes( 3 ) ) );
	assert.equal( modelGeometry( THREE, data ).attributes.position.count, 9 );

} );

test( 'Relax keeps smoothing tangential and preserves open path endpoints', () => {

	const points = [ [ -1, 0, 0 ], [ .2, 0, 1 ], [ 1, 0, 0 ] ];
	const pixels = points.map( point => point.slice( 0, 2 ) );
	const neighbors = sculptNeighbors( { kind: 'path', points }, null );
	const normals = points.map( () => new THREE.Vector3( 0, 0, 1 ) );
	const smooth = sculptPoints( points, pixels, pixels[ 1 ], 3, .5, { tool: 'smooth', neighbors, normals } );
	const relax = sculptPoints( points, pixels, pixels[ 1 ], 3, .5, { tool: 'relax', neighbors, normals } );
	assert.equal( smooth[ 1 ][ 2 ], .5 );
	assert.equal( relax[ 1 ][ 2 ], 1 );
	assert.ok( Math.abs( relax[ 1 ][ 0 ] - .1 ) < 1e-8 );
	assert.equal( relax[ 0 ], points[ 0 ] );
	assert.equal( relax[ 2 ], points[ 2 ] );

} );

test( 'UV corner topology protects borders and keeps point-contact islands separate', () => {

	const triangles = [ [ 0, 1, 2 ], [ 3, 4, 5 ], [ 6, 7, 8 ], [ 9, 10, 11 ], [ 12, 13, 14 ] ];
	const keys = [ 'center', 'a', 'b', 'center', 'b', 'c', 'center', 'c', 'd', 'center', 'd', 'a', 'a', 'e', 'f' ];
	const { indices, boundary } = uvCornerTopology( triangles, keys.length, i => keys[ i ] );
	assert.deepEqual( indices, [ 0, 1, 2, 0, 2, 5, 0, 5, 8, 0, 8, 1, 12, 13, 14 ] );
	assert.deepEqual( [ ...boundary ].sort( ( a, b ) => a - b ), [ 1, 2, 5, 8, 12, 13, 14 ] );

} );

test( 'UV packing preserves island shape and relative scale with a texture gutter', () => {

	const faces = [ [ 0, 1, 2 ], [ 3, 4, 5 ], [ 6, 7, 8 ] ];
	const points = [ [ -1, 1 ], [ 1, 1 ], [ 1, 2 ], [ -1, 1 ], [ 1, 2 ], [ -1, 2 ], [ 1, 2 ], [ 2, 2 ], [ 2, 2.5 ] ];
	const key = index => points[ index ].join( ',' );
	const islands = uvComponents( faces, key );
	assert.deepEqual( islands.map( vertices => vertices.length ), [ 6, 3 ] );

	const packed = packExistingUVs( points, islands, 8 );
	const scale = ( packed[ 1 ][ 0 ] - packed[ 0 ][ 0 ] ) / 2;
	assert.ok( scale > 0 );
	for ( const island of islands ) {

		const first = island[ 0 ];
		for ( const i of island ) for ( let axis = 0; axis < 2; axis ++ ) {

			assert.ok( Math.abs( packed[ i ][ axis ] - packed[ first ][ axis ] - ( points[ i ][ axis ] - points[ first ][ axis ] ) * scale ) < 1e-12 );
			assert.ok( packed[ i ][ axis ] >= 8 / 1024 && packed[ i ][ axis ] <= 1 - 8 / 1024 );

		}

	}
	const separated = [ 0, 1 ].some( axis => islands.some( ( island, i ) =>
		Math.min( ...islands[ 1 - i ].map( index => packed[ index ][ axis ] ) ) -
		Math.max( ...island.map( index => packed[ index ][ axis ] ) ) >= 16 / 1024 ) );
	assert.ok( separated );
	assert.deepEqual( packed[ 0 ], packed[ 3 ] );
	assert.deepEqual( packed[ 2 ], packed[ 4 ] );
	assert.notDeepEqual( packed[ 2 ], packed[ 6 ] );
	assert.deepEqual( points[ 0 ], [ -1, 1 ] );

} );

test( 'Pencil ribbons keep per-sample opacity and default to full pressure for older strokes', () => {

	const points = [ new THREE.Vector3(), new THREE.Vector3( 1, 0, 0 ) ];
	const coordinates = { normal: [ 0, 0, 1 ], right: [ 1, 0, 0 ], up: [ 0, 1, 0 ], radius: .05 };
	const { attributes: { color } } = pencilRibbon( THREE, points, false,
		{ color: '#000000', hardness: 1, strength: .8, samples: [ { ...coordinates, opacity: .25 }, coordinates ] } );
	assert.ok( Math.abs( color.getW( 1 ) - .2 ) < 1e-6 );
	assert.ok( Math.abs( color.getW( 5 ) - .8 ) < 1e-6 );
	assert.ok( Math.abs( color.getW( 8 ) - .2 ) < 1e-6 );

} );

test( 'Projector coverage counts only the closest opaque mesh in front of the receiver', () => {

	const scene = new THREE.Scene();
	const projector = new THREE.Group();
	projector.userData.assetObject = { type: 'projector' };
	scene.add( projector );
	const plane = ( x, z, width, options ) => {

		const mesh = new THREE.Mesh( new THREE.PlaneGeometry( width, 20 ), new THREE.MeshBasicMaterial( options ) );
		mesh.position.set( x, 0, z );
		scene.add( mesh );
		return mesh;

	};
	const receiver = plane( 0, -6, 20 );
	const opaque = plane( -1, -3, 2 );
	const behind = plane( 0, -7, 20 );
	const glass = plane( 0, -2, 20, { transparent: true, opacity: .4 } );
	const disabled = plane( 0, -1, 20 );
	disabled.userData.threeditor = { disabled: true };
	const nearer = plane( -1, -2.5, 2 );
	const result = inspectProjectorCoverage( THREE, scene, projector, receiver );
	assert.equal( result.targetSamples, result.cells.length );
	assert.equal( result.blockedSamples, result.targetSamples / 2 );
	assert.deepEqual( result.blockers, [ [ nearer, result.blockedSamples ] ] );
	const blockerCount = () => inspectProjectorCoverage( THREE, scene, projector, receiver ).blockedSamples;
	nearer.visible = opaque.visible = false;
	assert.equal( blockerCount(), 0 );
	assert.ok( behind.visible && glass.visible );
	projector.rotation.y = Math.PI;
	assert.equal( inspectProjectorCoverage( THREE, scene, projector, receiver ).targetSamples, 0 );

} );
