import { evaluateModifierStack } from '../modeling/ModifierEvaluation.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { GEOMETRY_MODIFIER, hasSimulation, planGeometryGraph } from './GeometryNodes.js';

export const SIMULATION_RATE = 60;

function disposeState( state ) {

	for ( const { geometry } of state.values() ) geometry.dispose();
	state.clear();

}

export class GeometrySimulation {

	constructor( THREE, scene, onError = ( error, object ) => console.warn( 'Geometry Nodes on ' + ( object.name || object.uuid ), error ) ) {

		this.THREE = THREE;
		this.onError = onError;
		this.entries = [];
		this.frame = 0;
		const loader = new THREE.ObjectLoader();
		scene.traverse( object => {

			const { modifiers, modifierBase } = object.userData;
			if ( ! object.isMesh || ! Array.isArray( modifiers ) || ! modifierBase ) return;
			try {

				const plans = new Map();
				for ( const modifier of modifiers ) {

					if ( modifier.type !== GEOMETRY_MODIFIER || ! modifier.enabled ) continue;
					const graph = modifier.params.graph;
					plans.set( graph, planGeometryGraph( graph ) );

				}
				if ( ! [ ...plans.values() ].some( hasSimulation ) ) return;
				const source = loader.parseGeometries( [ modifierBase ] )[ modifierBase.uuid ];
				if ( ! source ) throw new Error( 'The saved source mesh could not be loaded.' );
				this.entries.push( { object, source, original: object.geometry, modifiers, plans, state: new Map() } );

			} catch ( error ) {

				this.onError( error, object );

			}

		} );

	}

	// Frame zero is the authored state. Seeking backwards restores it and
	// replays fixed steps. Real-time playback can bound the work per render.
	advanceTo( seconds, maxSteps = Infinity ) {

		if ( ! this.entries.length || ! Number.isFinite( seconds ) ) return;
		const target = Math.max( 0, Math.floor( seconds * SIMULATION_RATE + 1e-7 ) );
		if ( target < this.frame ) this.reset();
		const last = Math.min( target, this.frame + maxSteps );
		while ( this.frame < last ) {

			this.frame ++;
			for ( const entry of this.entries ) {

				if ( entry.failed || hasRestriction( entry.object, 'disabled' ) ) continue;
				const next = new Map();
				try {

					const geometry = evaluateModifierStack( this.THREE, entry.source, entry.modifiers, true, {
						plans: entry.plans, previous: entry.state, next,
						delta: 1 / SIMULATION_RATE, time: this.frame / SIMULATION_RATE, frame: this.frame
					} );
					entry.output?.dispose();
					disposeState( entry.state );
					entry.state = next;
					entry.object.geometry = entry.output = geometry;

				} catch ( error ) {

					disposeState( next );
					entry.failed = true;
					this.onError( error, entry.object );

				}

			}

		}

	}

	reset() {

		this.frame = 0;
		for ( const entry of this.entries ) {

			if ( entry.object.geometry === entry.output ) entry.object.geometry = entry.original;
			entry.output?.dispose();
			entry.output = undefined;
			entry.failed = false;
			disposeState( entry.state );

		}

	}

	dispose() {

		this.reset();
		for ( const entry of this.entries ) entry.source.dispose();
		this.entries.length = 0;

	}

}
