import * as THREE from 'three';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { createGeometryGraph, GEOMETRY_MODIFIER } from '../nodes/GeometryNodes.js';
import { copyModifierGeometry, evaluateModifierStack, MODIFIERS } from './ModifierEvaluation.js';

export { MODIFIERS };

export function canModify( object ) {

	return !! object?.geometry?.attributes.position && ( object.isMesh || object.isLine ) && ! object.isSkinnedMesh &&
		! object.isInstancedMesh && ! object.userData.assetObject && ! Object.keys( object.geometry.morphAttributes ).length;

}

export function createModifier( type ) {

	const def = MODIFIERS[ type ];
	if ( ! def ) throw new Error( 'Unknown modifier' );
	const params = type === GEOMETRY_MODIFIER ? { graph: createGeometryGraph() } : { ...def.defaults };
	return { id: THREE.MathUtils.generateUUID(), type, name: def.name, enabled: true, params };

}

const sourceCache = new WeakMap();
export function modifierSource( object ) {

	const json = object.userData.modifierBase;
	if ( ! json ) return object.geometry;
	const cached = sourceCache.get( object );
	if ( cached?.json === json ) return cached.geometry;
	cached?.geometry.dispose();
	const geometry = new THREE.ObjectLoader().parseGeometries( [ json ] )[ json.uuid ];
	sourceCache.set( object, { json, geometry } );
	return geometry;

}

export function evaluateModifiers( source, stack, mesh = true ) {

	return evaluateModifierStack( THREE, source, stack, mesh );

}

export function modifierStackCommands( editor, object, stack, source = modifierSource( object ) ) {

	const base = copyModifierGeometry( THREE, source );
	const userData = { ...object.userData, modifiers: structuredClone( stack ), modifierBase: base.toJSON() };
	let geometry;
	try {

		geometry = stack.length ? evaluateModifiers( base, stack, object.isMesh ) : copyModifierGeometry( THREE, base );

	} finally {

		base.dispose();

	}
	if ( ! stack.length ) { delete userData.modifierBase; delete userData.modifiers; }
	const metadata = new SetValueCommand( editor, object, 'userData', userData ); metadata.updatable = false;
	const buffer = new SetGeometryCommand( editor, object, geometry ); buffer.updatable = false;
	return [ metadata, buffer ];

}

export function setModifierStack( editor, object, stack, source = modifierSource( object ), name = 'Edit modifiers' ) {

	editor.execute( new MultiCmdsCommand( editor, modifierStackCommands( editor, object, stack, source ) ), name );

}

export function applyModifier( editor, object, index ) {

	const stack = object.userData.modifiers || [];
	// Bake the prefix so applying a later modifier preserves stack order.
	const baked = evaluateModifiers( modifierSource( object ), stack.slice( 0, index + 1 ), object.isMesh );
	try { setModifierStack( editor, object, stack.slice( index + 1 ), baked, 'Apply modifiers through ' + stack[ index ].name ); }
	finally { baked.dispose(); }

}
