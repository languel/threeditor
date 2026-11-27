import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, ObjectLoader, Scene, TSL } from '../build/three.webgpu.js';
import { addNode, connectNodes } from '../editor/js/nodes/NodeGraph.js';
import { compileShaderGraph, createShaderGraph, SHADER_DOMAIN } from '../editor/js/nodes/ShaderNodes.js';
import { beginShaderGraphFrame, installShaderGraphs, shaderGraphsAnimate, withShaderGraphs } from '../editor/js/nodes/ShaderGraphRuntime.js';

function wire( graph, from, output, to, input ) {

	connectNodes( graph, SHADER_DOMAIN, { node: from, socket: output }, { node: to, socket: input } );

}

test( 'A saved shader graph composes real TSL expressions and tracks reachable time inputs', () => {

	const material = new MeshStandardMaterial();
	const graph = createShaderGraph( '#ff0000' );
	const clock = addNode( graph, 'shader.time', 0, 0 );
	const uv = addNode( graph, 'shader.uvTransform', 0, 0 );
	const checker = addNode( graph, 'shader.checker', 0, 0 );
	const mix = addNode( graph, 'shader.mixColor', 0, 0 );
	const rough = addNode( graph, 'value.number', 0, 0 );
	rough.values.value = .42;
	wire( graph, uv.id, 'uv', checker.id, 'uv' );
	wire( graph, checker.id, 'value', mix.id, 'factor' );
	wire( graph, mix.id, 'color', 'shader.output', 'color' );
	wire( graph, rough.id, 'value', 'shader.output', 'roughness' );
	assert.equal( compileShaderGraph( TSL, graph, material ).animated, false );
	wire( graph, clock.id, 'value', uv.id, 'offsetX' );

	const mesh = new Mesh( new BoxGeometry(), material );
	material.userData.shaderGraph = graph;
	const loaded = new ObjectLoader().parse( JSON.parse( JSON.stringify( mesh.toJSON() ) ) );
	const program = compileShaderGraph( TSL, loaded.material.userData.shaderGraph, loaded.material );
	assert.equal( program.animated, true );
	assert.equal( program.properties.colorNode.isNode, true );
	assert.equal( program.properties.roughnessNode.isNode, true );
	assert.equal( program.properties.positionNode, undefined );
	assert.throws( () => wire( graph, clock.id, 'value', 'shader.output', 'color' ), /same type/ );

} );

test( 'Shader rendering substitutes one compiled material for the draw and restores shared authoring materials', () => {

	const material = new MeshStandardMaterial( { color: 0x717171 } );
	material.userData.shaderGraph = createShaderGraph( '#ff0000' );
	const geometry = new BoxGeometry();
	const a = new Mesh( geometry, material );
	const b = new Mesh( geometry, [ material, new MeshStandardMaterial() ] );
	const sourceSlots = b.material;
	const scene = new Scene();
	scene.add( a, b );
	const renderer = { library: { fromMaterial: source => Object.assign( new MeshStandardNodeMaterial(), source ) } };
	installShaderGraphs( renderer, TSL );
	beginShaderGraphFrame( renderer );
	let compiled;
	assert.throws( () => withShaderGraphs( renderer, scene, () => {

		compiled = a.material;
		assert.equal( compiled.isNodeMaterial, true );
		assert.equal( compiled.colorNode.value.r, 1 );
		assert.equal( b.material[ 0 ], compiled );
		assert.equal( b.material[ 1 ], sourceSlots[ 1 ] );
		throw new Error( 'Draw failed' );

	} ), /Draw failed/ );
	assert.equal( a.material, material );
	assert.equal( b.material, sourceSlots );
	assert.equal( shaderGraphsAnimate( renderer ), false );
	material.userData.shaderGraph = createShaderGraph( '#00ff00' );
	withShaderGraphs( renderer, scene, () => {

		assert.notEqual( a.material, compiled );
		assert.equal( a.material.colorNode.value.g, 1 );

	} );
	assert.equal( a.material, material );

} );

test( 'Named geometry attributes can feed the TSL graph through a scalar socket', () => {

	const graph = createShaderGraph();
	const attribute = addNode( graph, 'shader.attribute', 0, 0 );
	attribute.values.name = 'ridge';
	wire( graph, attribute.id, 'value', 'shader.output', 'roughness' );
	assert.equal( compileShaderGraph( TSL, graph, new MeshStandardMaterial() ).properties.roughnessNode.isNode, true );
	attribute.values.name = 'ridge value';
	assert.throws( () => compileShaderGraph( TSL, graph, new MeshStandardMaterial() ), /attribute name/ );

} );
