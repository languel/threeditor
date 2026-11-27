import * as THREE from 'three';

export const emptyDisplays = [
	[ 'axes', 'Plain Axes' ], [ 'arrows', 'Arrows' ], [ 'arrow', 'Single Arrow' ],
	[ 'circle', 'Circle' ], [ 'cube', 'Cube' ], [ 'sphere', 'Sphere' ], [ 'cone', 'Cone' ]
];

export function markModelReference( object, kind ) {

	object.userData.modelReference = { ...object.userData.modelReference, kind };
	object.userData.annotation = true;
	return object;

}

export function createEmpty( style ) {

	const object = new THREE.Object3D();
	object.name = 'Empty · ' + ( emptyDisplays.find( entry => entry[ 0 ] === style )?.[ 1 ] || 'Plain Axes' );
	object.userData.emptyDisplay = { style, size: 1 };
	return object;

}

function wirePositions( type ) {

	const values = [];
	const line = ( a, b ) => values.push( ...a, ...b );
	function circle( axis, height = 0 ) {

		const point = angle => {

			const p = [ 0, 0, 0 ];
			p[ axis ] = height;
			p[ ( axis + 1 ) % 3 ] = Math.cos( angle );
			p[ ( axis + 2 ) % 3 ] = Math.sin( angle );
			return p;

		};
		for ( let i = 0; i < 48; i ++ ) line( point( i * Math.PI / 24 ), point( ( i + 1 ) * Math.PI / 24 ) );

	}

	if ( type === 'circle' || type === 'sphere' ) {

		for ( const axis of type === 'circle' ? [ 1 ] : [ 0, 1, 2 ] ) circle( axis );

	} else if ( type === 'cube' || type === 'image' ) {

		for ( let axis = 0; axis < ( type === 'image' ? 2 : 3 ); axis ++ ) for ( const a of [ - 1, 1 ] ) for ( const b of type === 'image' ? [ 0 ] : [ - 1, 1 ] ) {

			const p = [ 0, 0, 0 ];
			p[ axis ] = - 1;
			p[ ( axis + 1 ) % 3 ] = a;
			p[ ( axis + 2 ) % 3 ] = b;
			if ( type === 'image' ) { p[ 2 ] = 0; p[ 1 - axis ] = a; }
			const q = p.slice();
			q[ axis ] = 1;
			line( p, q );

		}

	} else if ( type === 'cone' ) {

		circle( 1, - 1 );
		for ( const base of [ [ 1, - 1, 0 ], [ - 1, - 1, 0 ], [ 0, - 1, 1 ], [ 0, - 1, - 1 ] ] ) line( base, [ 0, 1, 0 ] );

	} else {

		for ( const axis of type === 'arrow' ? [ 2 ] : [ 0, 1, 2 ] ) {

			const start = [ 0, 0, 0 ], tip = [ 0, 0, 0 ];
			tip[ axis ] = 1;
			if ( type !== 'arrows' && type !== 'arrow' ) start[ axis ] = - 1;
			line( start, tip );
			if ( type === 'arrows' || type === 'arrow' ) for ( const side of [ - .14, .14 ] ) {

				const base = [ 0, 0, 0 ];
				base[ axis ] = .74;
				base[ ( axis + 1 ) % 3 ] = side;
				line( base, tip );

			}

		}

	}
	return values;

}

export function createEmptyHelper( object ) {

	const helper = new THREE.LineSegments( new THREE.BufferGeometry(), new THREE.LineBasicMaterial( { color: 0x9baec2, depthTest: false, toneMapped: false } ) );
	helper.matrixAutoUpdate = false;
	helper.frustumCulled = false;
	helper.renderOrder = 3;
	helper.userData.object = object;
	const update = helper.updateMatrixWorld;
	const displayScale = new THREE.Vector3();
	let geometryStyle;
	helper.updateMatrixWorld = function ( force ) {

		const { style = 'axes', size = 1 } = object.userData.emptyDisplay || {};
		if ( style !== geometryStyle ) {

			helper.geometry.dispose();
			helper.geometry = new THREE.BufferGeometry().setAttribute( 'position', new THREE.Float32BufferAttribute( wirePositions( style ), 3 ) );
			geometryStyle = style;

		}
		object.updateWorldMatrix( true, false );
		const dimensions = style === 'image' ? object.geometry?.parameters : undefined;
		displayScale.set( size * ( dimensions?.width ?? 2 ) / 2, size * ( dimensions?.height ?? 2 ) / 2, size );
		helper.matrix.copy( object.matrixWorld ).scale( displayScale );
		helper.children[ 0 ]?.scale.setScalar( .09 );
		helper.matrixWorldNeedsUpdate = true;
		update.call( helper, force );

	};
	helper.update = () => helper.updateMatrixWorld( true );
	helper.dispose = () => { helper.geometry.dispose(); helper.material.dispose(); };
	return helper;

}

export function imageReference( plane, depth = 'normal' ) {

	markModelReference( plane, 'image' );
	plane.userData.modelReference.depth = depth;
	plane.userData.emptyDisplay = { style: 'image', size: 1 };
	plane.material.depthWrite = false;
	plane.material.depthTest = depth === 'normal';
	if ( depth === 'back' ) {

		// Queue in the opaque pass so scene geometry draws over the image.
		plane.material.transparent = false;
		plane.material.blending = THREE.CustomBlending;
		plane.material.blendSrc = THREE.SrcAlphaFactor;
		plane.material.blendDst = THREE.OneMinusSrcAlphaFactor;

	}
	plane.renderOrder = depth === 'back' ? - 100 : depth === 'front' ? 100 : 0;
	return plane;

}
