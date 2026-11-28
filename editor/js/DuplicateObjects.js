import { MathUtils, Object3D } from 'three';
import { withoutRuntimeChildren, hasRestriction } from './ObjectRestrictions.js';
import { selectionRoots } from './ObjectParenting.js?v=editor-panes';
import { AddObjectCommand } from './commands/AddObjectCommand.js';
import { AddScriptCommand } from './commands/AddScriptCommand.js';
import { SetValueCommand } from './commands/SetValueCommand.js';
import { DuplicateObjectsCommand } from './commands/DuplicateObjectsCommand.js';
import { timelineData } from './animation/TimelineData.js';
import { remapLogicObjects } from './nodes/LogicNodes.js?v=bone-collections';

function duplicateTargets( editor ) {

	if ( editor.modeling.editMode || editor.viewTools.mode || editor.editWorkspace.exclusive || editor.streams.playing || editor.modalTransform.active ) return [];
	return selectionRoots( editor.selector.selection ).filter( object => object.parent &&
		! object.userData.runtimeOnly && ! hasRestriction( object, 'locked' ) && ! hasRestriction( object, 'disabled' ) );

}

export function canDuplicateObjects( editor ) {

	return duplicateTargets( editor ).length > 0;

}

function nextName( name, names ) {

	const base = name.replace( /\.\d{3,}$/, '' );
	let index = 1, copy;
	do { copy = base + '.' + String( index ++ ).padStart( 3, '0' ); } while ( names.has( copy ) );
	names.add( copy );
	return copy;

}

function copyTimeline( editor, commands, copies, uuid, scriptIds, animationIds ) {

	const data = timelineData( editor.scene );
	const additions = [];
	for ( const entry of data.clips ) {

		const tracks = ( entry.tracks || [] ).filter( track => copies.has( track.target.object ) ).map( track => {

			const result = structuredClone( track );
			result.target.object = uuid( track.target.object );
			if ( track.target.kind === 'script' ) {

				const ids = scriptIds.get( track.target.object );
				if ( track.target.scriptId ) result.target.scriptId = ids?.get( track.target.scriptId ) || track.target.scriptId;
				else result.target.index = ids?.get( track.target.index ) ?? track.target.index;

			}
			return result;

		} );
		const animation = entry.animation && copies.has( entry.animation.object ) && {
			...entry.animation,
			object: uuid( entry.animation.object ),
			clip: animationIds.get( entry.animation.object )?.get( entry.animation.clip ) || entry.animation.clip
		};
		if ( ! tracks.length && ! animation ) continue;
		const clip = { ...structuredClone( entry ), id: MathUtils.generateUUID(), tracks };
		if ( animation ) clip.animation = animation;
		else delete clip.animation;
		additions.push( clip );

	}
	if ( ! additions.length ) return;
	const doc = { ...data, clips: [ ...data.clips, ...additions ] };
	const command = new SetValueCommand( editor, editor.scene, 'userData', { ...editor.scene.userData, timeline: doc } );
	command.updatable = false;
	commands.push( command );

}

export function duplicateObjects( editor, move ) {

	const sources = duplicateTargets( editor );
	if ( ! sources.length ) return;
	const pairs = new Map(), copies = new Map(), geometries = new Map(), rigRoots = new Map();
	const names = new Set();
	editor.scene.traverse( object => names.add( object.name ) );
	const roots = sources.map( object => withoutRuntimeChildren( object, () => {

		const copy = object.clone();
		copy.name = nextName( object.name || object.type, names );
		const index = ( source, target ) => {

			pairs.set( source, target );
			copies.set( source.uuid, target );
			rigRoots.set( source, object );
			source.children.forEach( ( child, i ) => index( child, target.children[ i ] ) );

		};
		index( object, copy );
		return copy;

	} ) );
	const uuid = value => copies.get( value )?.uuid || value;
	const commands = roots.map( ( copy, i ) => new AddObjectCommand( editor, copy, sources[ i ].parent, false ) );
	const scriptIds = new Map(), animationIds = new Map(), weightGroups = new Map();
	for ( const [ source, copy ] of pairs ) {

		if ( source.geometry ) {

			if ( ! geometries.has( source.geometry ) ) {

				const geometry = source.geometry.clone();
				geometry.userData = structuredClone( source.geometry.userData );
				geometries.set( source.geometry, geometry );

			}
			copy.geometry = geometries.get( source.geometry );

		}
		if ( source.isSkinnedMesh && source.skeleton ) {

			const bones = source.skeleton.bones.map( bone => pairs.get( bone ) );
			if ( source.skeleton.bones.some( bone => rigRoots.get( bone ) !== rigRoots.get( source ) ) ) {

				throw new Error( 'Select the rig root to duplicate a skinned mesh with its bones.' );

			}
			copy.skeleton = source.skeleton.clone();
			copy.skeleton.bones = bones;
			copy.bind( copy.skeleton, source.bindMatrix );

		}
		if ( source.isSpotLight || source.isDirectionalLight ) {

			copy.target = pairs.get( source.target );
			if ( ! copy.target ) {

				const target = new Object3D();
				target.name = nextName( source.target.name || 'Light Target', names );
				target.position.copy( source.target.position );
				copy.target = target;
				commands.push( new AddObjectCommand( editor, target, source.target.parent || editor.scene, false ) );

			}

		}
		if ( copy.userData.projectorTarget ) copy.userData.projectorTarget = uuid( copy.userData.projectorTarget );
		for ( const collection of copy.userData.armature?.collections ?? [] ) {

			collection.bones = collection.bones.map( uuid );

		}
		if ( copy.userData.armatureBinding ) {

			const binding = copy.userData.armatureBinding;
			binding.rig = uuid( binding.rig );
			if ( binding.weightSamples ) for ( const [ key, weights ] of Object.entries( binding.weightSamples ) ) {

				binding.weightSamples[ key ] = Object.fromEntries( Object.entries( weights ).map( ( [ bone, weight ] ) => [ uuid( bone ), weight ] ) );

			}

		}
		const group = copy.userData.armatureBone?.weightGroup;
		if ( group ) {

			if ( ! weightGroups.has( group ) ) weightGroups.set( group, copies.get( group )?.uuid || MathUtils.generateUUID() );
			copy.userData.armatureBone.weightGroup = weightGroups.get( group );

		}
		if ( copy.userData.armatureIK ) {

			const ik = copy.userData.armatureIK;
			ik.target = uuid( ik.target );
			if ( ik.pole ) ik.pole = uuid( ik.pole );

		}
		if ( Array.isArray( copy.userData.armatureConstraints ) ) for ( const constraint of copy.userData.armatureConstraints ) {

			if ( constraint?.target ) constraint.target = uuid( constraint.target );

		}
		if ( copy.userData.threeditor?.cameraFollow ) copy.userData.threeditor.cameraFollow = uuid( copy.userData.threeditor.cameraFollow );
		for ( const point of copy.userData.measurement?.points || [] ) if ( point.target ) point.target = uuid( point.target );
		remapLogicObjects( copy.userData.logicGraph, uuid );

		const clipIds = new Map();
		copy.animations = source.animations.map( clip => {

			const animation = clip.clone();
			clipIds.set( clip.uuid, animation.uuid );
			for ( const track of animation.tracks ) {

				const node = track.name.split( '.', 1 )[ 0 ];
				if ( copies.has( node ) ) track.name = uuid( node ) + track.name.slice( node.length );
				else if ( source.name && track.name.startsWith( source.name + '.' ) ) track.name = copy.name + track.name.slice( source.name.length );

			}
			return animation;

		} );
		animationIds.set( source.uuid, clipIds );

		const ids = new Map();
		const scripts = editor.scripts[ source.uuid ] || [];
		let index = 0;
		for ( const [ sourceIndex, script ] of scripts.entries() ) {

			if ( script.generated ) continue;
			ids.set( sourceIndex, index ++ );
			const component = structuredClone( script );
			if ( script.timelineId ) {

				component.timelineId = MathUtils.generateUUID();
				ids.set( script.timelineId, component.timelineId );

			}
			if ( component.cameraController && component.paramValues?.follow ) component.paramValues.follow = uuid( component.paramValues.follow );
			delete component.parameters;
			commands.push( new AddScriptCommand( editor, copy, component ) );

		}
		scriptIds.set( source.uuid, ids );

	}
	copyTimeline( editor, commands, copies, uuid, scriptIds, animationIds );
	const command = new DuplicateObjectsCommand( editor, commands, editor.selector.selection, roots );
	editor.execute( command, 'Duplicate Objects' );
	if ( move ) editor.modalTransform.start( 'translate', () => {

		if ( command.json ) command.json = command.toJSON();
		editor.signals.historyChanged.dispatch( command );

	} );

}
