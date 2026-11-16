import { AnimationMixer, LoopOnce } from 'three';
import { hasRestriction } from '../ObjectRestrictions.js';
import { timelineBinding } from './TimelineBindings.js';
import { targetId, valueAt } from './TimelineData.js';

const equal = ( a, b ) => Array.isArray( a ) && Array.isArray( b ) ?
	a.length === b.length && a.every( ( value, index ) => value === b[ index ] ) : a === b;

export class TimelineRuntime {

	constructor( context ) {

		this.context = context;
		this.bound = new Map();
		this.actions = new Map();
		this.lastClips = new Map();
		this.mixer = new AnimationMixer( context.scene );

	}

	apply( data, time, except ) {

		const values = new Map();
		const clips = new Map();
		for ( const clip of data.clips ) {

			if ( time < clip.start || time > clip.start + clip.duration ) continue;
			if ( clip.animation ) clips.set( clip.animation.object, { clip, time: time - clip.start } );
			for ( const track of clip.tracks || [] ) {

				const id = targetId( track.target );
				if ( id !== except && track.keys.length ) values.set( id, { target: track.target, value: valueAt( track.keys, time - clip.start ) } );

			}

		}
		this.lastClips = clips;
		let changed = this.applyClips( clips );
		for ( const [ id, state ] of this.bound ) {

			if ( values.has( id ) ) continue;
			if ( ! state.binding.transient || id !== except ) this.restore( state );
			this.bound.delete( id );
			changed = true;

		}
		for ( const [ id, { target, value } ] of values ) {

			let state = this.bound.get( id );
			if ( ! state ) {

				const binding = timelineBinding( this.context, target );
				const base = binding?.read();
				if ( base === undefined ) continue;
				state = { binding, base, last: base };
				this.bound.set( id, state );

			}
			const current = state.binding.read();
			if ( ! equal( current, state.last ) ) state.base = current;
			if ( ! equal( current, value ) ) {

				state.binding.write( value );
				changed = true;

			}
			state.last = value;

		}
		return changed;

	}

	applyClips( clips ) {

		let changed = false;
		for ( const [ uuid, state ] of this.actions ) {

			if ( clips.get( uuid )?.clip.id === state.id ) continue;
			state.action.stop();
			this.mixer.uncacheAction( state.action.getClip(), state.action.getRoot() );
			this.actions.delete( uuid );
			changed = true;

		}
		for ( const [ uuid, { clip, time } ] of clips ) {

			let state = this.actions.get( uuid );
			if ( ! state ) {

				const object = this.context.object( uuid );
				if ( ! object || hasRestriction( object, 'disabled' ) ) continue;
				const imported = object.animations.find( animation => animation.uuid === clip.animation.clip );
				if ( ! imported ) continue;
				const action = this.mixer.clipAction( imported, object );
				action.setLoop( LoopOnce, 1 ).play();
				action.paused = true;
				state = { id: clip.id, action };
				this.actions.set( uuid, state );

			}
			const next = Math.min( time, state.action.getClip().duration );
			if ( next === state.time ) continue;
			state.action.time = next;
			state.time = next;
			changed = true;

		}
		if ( this.actions.size ) this.mixer.update( 0 );
		return changed;

	}

	restore( state ) {

		// A fresh inspector or stream edit supersedes the last preview sample.
		if ( equal( state.binding.read(), state.last ) && ! equal( state.base, state.last ) ) state.binding.write( state.base );

	}

	clear() {

		for ( const state of this.bound.values() ) this.restore( state );
		this.bound.clear();
		this.lastClips = new Map();
		this.applyClips( this.lastClips );

	}

	withBase( callback ) {

		if ( ! this.bound.size && ! this.actions.size ) return callback();
		const touched = [ ...this.bound.values() ].filter( state => ! state.binding.transient )
			.map( state => [ state, state.binding.read() ] );
		for ( const [ state ] of touched ) this.restore( state );
		const hadClips = this.actions.size > 0;
		if ( hadClips ) this.applyClips( new Map() );
		try {

			return callback();

		} finally {

			if ( hadClips ) this.applyClips( this.lastClips );
			for ( const [ state, value ] of touched ) state.binding.write( value );

		}

	}

}
