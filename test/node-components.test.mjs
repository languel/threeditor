import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { MeshStandardNodeMaterial, TSL } from '../build/three.webgpu.js';
import { withoutRuntimeChildren } from '../editor/js/ObjectRestrictions.js';
import { GeometrySimulation } from '../editor/js/nodes/GeometrySimulation.js';
import { createGeometryGraph, GEOMETRY_DOMAIN } from '../editor/js/nodes/GeometryNodes.js';
import { NodeComponentRuntime, nodeComponentData } from '../editor/js/nodes/NodeComponents.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';
import { createShaderGraph } from '../editor/js/nodes/ShaderNodes.js';
import { installShaderGraphs, withShaderGraphs } from '../editor/js/nodes/ShaderGraphRuntime.js';

function wire( graph, domain, from, to, out = 'geometry', input = 'geometry' ) {

	connectNodes( graph, domain, { node: from, socket: out }, { node: to, socket: input } );

}

test( 'A blank geometry component on an Empty owns regenerated geometry after a saved-scene round trip', () => {

	const scene = new THREE.Scene();
	const empty = new THREE.Object3D();
	empty.name = 'Generator';
	empty.position.x = 3;
	scene.add( empty );
	const graph = createGeometryGraph( true );
	assert.deepEqual( graph.nodes.map( node => node.type ), [ 'geometry.output' ] );
	const box = addNode( graph, 'geometry.box', 10, 20 );
	wire( graph, GEOMETRY_DOMAIN, box.id, 'geometry.output' );
	empty.userData = nodeComponentData( empty, 'geometry', graph );
	const runtime = new NodeComponentRuntime( THREE );
	runtime.syncTree( scene );
	const output = runtime.output( empty );
	assert.ok( output.isMesh );
	assert.equal( output.geometry.attributes.position.count, 24 );
	assert.equal( output.getWorldPosition( new THREE.Vector3() ).x, 3 );

	const project = withoutRuntimeChildren( scene, () => JSON.parse( JSON.stringify( scene.toJSON() ) ) );
	const loaded = new THREE.ObjectLoader().parse( project );
	const host = loaded.getObjectByName( 'Generator' );
	assert.equal( host.children.length, 0 );
	runtime.syncTree( loaded );
	assert.equal( runtime.output( host ).geometry.attributes.position.count, 24 );
	host.userData = nodeComponentData( host, 'geometry' );
	runtime.sync( host );
	assert.equal( host.children.length, 0 );

} );

test( 'Generated geometry can simulate and reset independently of its host and of the saved output', () => {

	const scene = new THREE.Scene();
	const host = new THREE.Group();
	scene.add( host );
	const graph = createGeometryGraph( true );
	const box = addNode( graph, 'geometry.box', 0, 0 );
	const sim = addNode( graph, 'geometry.simulation', 0, 0, GEOMETRY_DOMAIN );
	wire( graph, GEOMETRY_DOMAIN, box.id, sim.id );
	wire( graph, GEOMETRY_DOMAIN, sim.id, 'geometry.output' );
	const domain = GEOMETRY_DOMAIN.nodes.get( sim.type ).bodyDomain();
	const transform = addNode( sim.body, 'geometry.transform', 0, 0 );
	transform.values.x = 1;
	wire( sim.body, domain, 'geometry.simulation.input', transform.id );
	wire( sim.body, domain, transform.id, 'geometry.simulation.output' );
	host.userData = nodeComponentData( host, 'geometry', graph );
	const runtime = new NodeComponentRuntime( THREE );
	runtime.syncTree( scene );
	const mesh = runtime.output( host );
	const original = mesh.geometry;
	const simulation = new GeometrySimulation( THREE, scene, error => { throw error; } );
	simulation.advanceTo( 3 / 60 );
	assert.equal( mesh.geometry.boundingBox.max.x, 3.5 );
	assert.equal( host.position.x, 0 );
	simulation.dispose();
	assert.equal( mesh.geometry, original );
	runtime.removeTree( scene );

} );

test( 'Object shader components supply independent shaders for children with a shared authored material', () => {

	const scene = new THREE.Scene();
	const shared = new THREE.MeshStandardMaterial();
	const hosts = [ new THREE.Group(), new THREE.Object3D() ];
	const objects = hosts.map( host => {

		const mesh = new THREE.Mesh( new THREE.BoxGeometry(), shared );
		host.add( mesh );
		scene.add( host );
		return mesh;

	} );
	hosts[ 0 ].userData = nodeComponentData( hosts[ 0 ], 'shader', createShaderGraph( '#ff0000' ) );
	hosts[ 1 ].userData = nodeComponentData( hosts[ 1 ], 'shader', createShaderGraph( '#00ff00' ) );
	const renderer = { library: { fromMaterial: source => Object.assign( new MeshStandardNodeMaterial(), source ) } };
	installShaderGraphs( renderer, TSL );
	withShaderGraphs( renderer, scene, () => {

		assert.equal( objects[ 0 ].material.colorNode.value.r, 1 );
		assert.equal( objects[ 1 ].material.colorNode.value.g, 1 );
		assert.notEqual( objects[ 0 ].material, objects[ 1 ].material );

	} );
	assert.ok( objects.every( object => object.material === shared ) );
	hosts[ 0 ].userData = nodeComponentData( hosts[ 0 ], 'shader' );
	withShaderGraphs( renderer, scene, () => assert.equal( objects[ 0 ].material, shared ) );

} );
