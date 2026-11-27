import { evaluateGeometryGraph, GEOMETRY_MODIFIER } from './GeometryNodes.js';

export function supportsNodeComponents( scene, object ) {

	return !! object && ! object.userData.runtimeOnly && scene.getObjectByProperty( 'uuid', object.uuid ) === object;

}

export function nodeComponentData( object, type, graph ) {

	const data = { ...object.userData };
	if ( type === 'logic' ) {

		if ( graph ) data.logicGraph = graph;
		else delete data.logicGraph;

	} else {

		const components = { ...data.nodeComponents };
		if ( graph ) components[ type ] = graph;
		else delete components[ type ];
		if ( Object.keys( components ).length ) data.nodeComponents = components;
		else delete data.nodeComponents;

	}
	return data;

}

export class NodeComponentRuntime {

	constructor( THREE, report = ( error, object ) => console.warn( 'Geometry Nodes on ' + ( object.name || object.uuid ), error ) ) {

		this.THREE = THREE;
		this.report = report;
		this.records = new WeakMap();

	}

	sync( object ) {

		if ( ! object || object.userData.runtimeOnly ) return;
		const graph = object.userData.nodeComponents?.geometry;
		const previous = this.records.get( object );
		if ( previous?.graph === graph ) {

			if ( previous ) previous.mesh.layers.mask = object.layers.mask;
			return;

		}
		if ( ! graph ) { this.remove( object ); return; }

		const THREE = this.THREE;
		const source = new THREE.BufferGeometry().setAttribute( 'position', new THREE.Float32BufferAttribute( [], 3 ) );
		let geometry, error;
		const base = source.toJSON();
		try {

			geometry = evaluateGeometryGraph( THREE, graph, source );

		} catch ( problem ) {

			error = problem.message;
			this.report( problem, object );
			geometry = source;

		}
		if ( source !== geometry ) source.dispose();
		const mesh = previous?.mesh ?? new THREE.Mesh( geometry, new THREE.MeshStandardMaterial( { color: 0xa8b4c2 } ) );
		if ( previous ) mesh.geometry.dispose();
		mesh.geometry = geometry;
		mesh.name = 'Geometry Nodes Output';
		mesh.userData = {
			runtimeOnly: true, nodeComponentOutput: true, modifierBase: base,
			modifiers: [ { id: 'geometry-component', type: GEOMETRY_MODIFIER, enabled: true, params: { graph } } ]
		};
		mesh.layers.mask = object.layers.mask;
		mesh.castShadow = mesh.receiveShadow = true;
		if ( mesh.parent !== object ) object.add( mesh );
		this.records.set( object, { graph, mesh, error } );

	}

	syncTree( object ) { object.traverse( child => this.sync( child ) ); }

	output( object ) { return this.records.get( object )?.mesh; }

	error( object ) { return this.records.get( object )?.error; }

	remove( object ) {

		const output = this.output( object );
		if ( ! output ) return;
		output.removeFromParent();
		output.geometry.dispose();
		output.material.dispose();
		this.records.delete( object );

	}

	removeTree( object ) {

		if ( ! object ) return;
		// Detach after collecting hosts, since detaching during traversal moves child indices.
		const owners = [];
		object.traverse( child => { if ( this.records.has( child ) ) owners.push( child ); } );
		for ( const owner of owners ) this.remove( owner );

	}

}
