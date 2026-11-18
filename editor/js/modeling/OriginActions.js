import * as THREE from 'three';
import { hasRestriction } from '../ObjectRestrictions.js';
import { SetPositionCommand } from '../commands/SetPositionCommand.js';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';

// Move the origin while compensating geometry and child positions. Work on a
// geometry copy so shared instances retain their own geometry and UVs.
export function setObjectOrigin( editor, object, world ) {

	object.updateWorldMatrix( true, true );
	const offset = object.worldToLocal( world.clone() );
	const position = object.parent ? object.parent.worldToLocal( world.clone() ) : world.clone();
	const commands = [];
	if ( object.geometry ) {

		const geometry = object.geometry.clone();
		geometry.translate( - offset.x, - offset.y, - offset.z );
		geometry.userData = structuredClone( object.geometry.userData );
		const data = geometry.userData.modeling;
		if ( data?.points ) for ( const point of data.points ) for ( let axis = 0; axis < 3; axis ++ ) point[ axis ] -= offset.getComponent( axis );
		commands.push( new SetGeometryCommand( editor, object, geometry ) );

	}
	for ( const child of object.children ) commands.push( new SetPositionCommand( editor, child, child.position.clone().sub( offset ) ) );
	commands.push( new SetPositionCommand( editor, object, position ) );
	editor.execute( new MultiCmdsCommand( editor, commands ), 'Set object origin' );

}

export function originActions( editor ) {

	const object = editor.selected;
	if ( ! object || object === editor.scene || object === editor.camera || object.isSkinnedMesh || object.isInstancedMesh ||
		object.userData.modifierBase || object.userData.measurement || object.userData.assetObject || hasRestriction( object, 'locked' ) || ! ( object.geometry || object.children.length ) ) return [];
	const center = () => new THREE.Box3().setFromObject( object, true ).getCenter( new THREE.Vector3() );
	const actions = [
		{ label: 'Origin to bounds bottom center', section: 'Set origin', run: () => {

			const box = new THREE.Box3().setFromObject( object, true );
			const point = box.getCenter( new THREE.Vector3() );
			point.y = box.min.y;
			setObjectOrigin( editor, object, point );

		} },
		{ label: 'Origin to geometry', section: 'Set origin', run: () => setObjectOrigin( editor, object, center() ) },
		{ label: 'Origin to 3D Cursor', section: 'Set origin', run: () => setObjectOrigin( editor, object, editor.cursor3D ) },
		{ label: 'Origin to world origin', section: 'Set origin', run: () => setObjectOrigin( editor, object, new THREE.Vector3() ) }
	];
	const model = editor.modeling;
	if ( model.object === object && model.indices.length ) actions.push( {
		label: 'Origin to selected geometry', section: 'Set origin', run: () => {

			const point = new THREE.Vector3();
			for ( const i of model.indices ) point.add( object.localToWorld( new THREE.Vector3( ...model.data.points[ i ] ) ) );
			setObjectOrigin( editor, object, point.divideScalar( model.indices.length ) );

		}
	} );
	return actions;

}
