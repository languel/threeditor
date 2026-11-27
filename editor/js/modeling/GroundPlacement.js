import * as THREE from 'three';
import { withArmatureDeformation } from '../rigging/ArmatureDeformation.js';

export function groundOffset( scene, objects ) {

	return withArmatureDeformation( THREE, scene, () => {

		const bounds = new THREE.Box3();
		for ( const object of objects ) {

			object.updateWorldMatrix( true, true );
			bounds.expandByObject( object, true );

		}
		if ( bounds.isEmpty() ) {

			const origin = new THREE.Vector3();
			for ( const object of objects ) bounds.expandByPoint( object.getWorldPosition( origin ) );

		}
		return Number.isFinite( bounds.min.y ) ? - bounds.min.y : 0;

	} );

}
