import * as THREE from 'three';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { JoinMeshesCommand } from '../commands/JoinMeshesCommand.js';
import { MoveObjectCommand } from '../commands/MoveObjectCommand.js';
import { RemoveObjectCommand } from '../commands/RemoveObjectCommand.js';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { SetMeshMaterialsCommand } from '../commands/SetMeshMaterialsCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';
import { timelineData } from '../animation/TimelineData.js';
import { evaluateModifiers, modifierSource } from './Modifiers.js?v=poly-context';
import { joinMeshGeometry } from './MeshJoin.js';

export function canJoinMeshes( editor ) {

	const objects = editor.selector.selection;
	return objects.length >= 2 && ! editor.modeling?.editMode && ! editor.viewTools?.mode &&
		objects.every( object => object.isMesh && ! object.isSkinnedMesh && ! object.isInstancedMesh && isVisible( object ) &&
			! hasRestriction( object, 'locked' ) && ! object.userData.assetObject && ! Object.keys( object.geometry.morphAttributes ).length );

}

export function joinObjects( editor ) {

	if ( ! canJoinMeshes( editor ) ) return;
	const selection = [ ...editor.selector.selection ];
	const active = selection.at( -1 );
	const sources = selection.slice( 0, -1 );
	const inputs = [ active, ...sources ];
	const clips = timelineData( editor.scene ).clips;
	for ( const object of inputs ) {

		for ( let ancestor = object.parent; ancestor; ancestor = ancestor.parent ) {

			if ( inputs.includes( ancestor ) ) throw new Error( 'Join meshes from separate hierarchy branches.' );

		}
		if ( object !== active && ( editor.scripts[ object.uuid ]?.length || object.animations.length ||
			clips.some( clip => clip.animation?.object === object.uuid || clip.tracks?.some( track => track.target.object === object.uuid ) ) ) ) {

			throw new Error( 'Make ' + ( object.name || 'the animated or scripted mesh' ) + ' active to keep its components and animation.' );

		}

	}

	active.updateWorldMatrix( true, false );
	if ( ! active.matrixWorld.determinant() ) throw new Error( 'The active mesh needs a nonzero scale.' );
	const inverse = active.matrixWorld.clone().invert();
	const entries = inputs.map( object => {

		object.updateWorldMatrix( true, true );
		return { matrix: inverse.clone().multiply( object.matrixWorld ), geometry: modifierSource( object ), material: object.material };

	} );
	const { geometry: base, material } = joinMeshGeometry( THREE, entries );
	let geometry = base;
	const commands = [ new SetMeshMaterialsCommand( editor, active, material ) ];
	const stack = active.userData.modifiers;
	if ( stack?.length ) {

		try {

			geometry = evaluateModifiers( base, stack );
			commands.push( new SetValueCommand( editor, active, 'userData', { ...active.userData, modifierBase: base.toJSON() } ) );

		} finally {

			base.dispose();

		}

	}
	commands.push( new SetGeometryCommand( editor, active, geometry ) );
	for ( const object of sources ) {

		const children = object.children.filter( child => ! child.userData.runtimeOnly );
		if ( children.length ) {

			const frame = new THREE.Group();
			frame.name = ( object.name || 'Joined mesh' ) + ' attachments';
			frame.matrix.copy( inverse ).multiply( object.matrixWorld );
			frame.matrix.decompose( frame.position, frame.quaternion, frame.scale );
			// Retain the exact affine transform when nonuniform parent scales introduce shear.
			frame.matrixAutoUpdate = false;
			commands.push( new AddObjectCommand( editor, frame, active, false ) );
			for ( const child of children.reverse() ) commands.push( new MoveObjectCommand( editor, child, frame ) );

		}
		commands.push( new RemoveObjectCommand( editor, object ) );

	}
	editor.execute( new JoinMeshesCommand( editor, commands, selection ), 'Join meshes' );

}
