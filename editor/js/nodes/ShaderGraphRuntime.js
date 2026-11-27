import { compileShaderGraph } from './ShaderNodes.js';

const renderers = new WeakMap();

export function installShaderGraphs( renderer, tsl ) {

	renderers.set( renderer, { tsl, materials: new WeakMap(), hosts: new WeakMap() } );

}

export function beginShaderGraphFrame( renderer ) {

	const runtime = renderers.get( renderer );
	if ( runtime ) runtime.animated = false;

}

export function shaderGraphsAnimate( renderer ) {

	return renderers.get( renderer )?.animated === true;

}

function shaderMaterial( renderer, runtime, source, host ) {

	if ( ! source?.isMeshStandardMaterial || source.isNodeMaterial ) return source;
	const component = host?.userData.nodeComponents.shader;
	const graph = component || source.userData?.shaderGraph;
	let materials = runtime.materials;
	if ( host ) {

		if ( ! runtime.hosts.has( host ) ) runtime.hosts.set( host, new Map() );
		materials = runtime.hosts.get( host );

	}
	let record = materials.get( source );
	if ( ! graph ) {

		record?.material?.dispose();
		materials.delete( source );
		return source;

	}
	if ( record?.graph !== graph || record.version !== source.version || record.map !== source.map ) {

		record?.material?.dispose();
		record = { graph, version: source.version, map: source.map };
		materials.set( source, record );
		try {

			const { properties, animated } = compileShaderGraph( runtime.tsl, graph, source );
			record.material = renderer.library.fromMaterial( source );
			Object.assign( record.material, properties );
			record.transparent = !! properties.opacityNode;
			record.animated = animated;

		} catch ( error ) {

			record.material?.dispose();
			record.material = undefined;
			console.warn( 'Shader Graph on ' + ( source.name || source.uuid ), error );

		}

	}
	if ( ! record.material ) return source;
	if ( record.animated ) runtime.animated = true;
	// These properties can be animated without changing Material.version.
	for ( const key of [ 'opacity', 'roughness', 'metalness', 'emissiveIntensity' ] ) record.material[ key ] = source[ key ];
	record.material.transparent = source.transparent || record.transparent;
	return record.material;

}

// Use the compiled material for the draw and retain the authored material for
// inspection, undo, animation bindings and JSON serialization.
export function withShaderGraphs( renderer, scene, draw ) {

	const runtime = renderers.get( renderer );
	if ( ! runtime ) return draw();
	const originals = [];
	try {

		scene.traverseVisible( object => {

			if ( ! object.userData.nodeComponents?.shader && runtime.hosts.has( object ) ) {

				for ( const record of runtime.hosts.get( object ).values() ) record.material?.dispose();
				runtime.hosts.delete( object );

			}
			if ( ! object.isMesh || ! object.material ) return;
			const source = object.material;
			let host = object;
			while ( host && ! host.userData.nodeComponents?.shader ) host = host.parent;
			const compiled = Array.isArray( source ) ?
				source.map( material => shaderMaterial( renderer, runtime, material, host ) ) : shaderMaterial( renderer, runtime, source, host );
			if ( compiled === source || Array.isArray( source ) && compiled.every( ( material, i ) => material === source[ i ] ) ) return;
			originals.push( [ object, source ] );
			object.material = compiled;

		} );
		return draw();

	} finally {

		for ( const [ object, material ] of originals ) object.material = material;

	}

}
