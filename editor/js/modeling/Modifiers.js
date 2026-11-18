import * as THREE from 'three';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';

// Stack workflow and deformation formulas adapted from ThreeGrease modifiers.
// Sources stay separate from evaluated buffers so ordinary Three.js rendering,
// projector raycasts, Play and exports all use the same evaluated result.
export const MODIFIERS = {
	MIRROR: { name: 'Mirror', meshOnly: true, defaults: { axisX: true, axisY: false, axisZ: false } },
	ARRAY: { name: 'Array', meshOnly: true, defaults: { count: 3, offsetX: 1, offsetY: 0, offsetZ: 0 } },
	OFFSET: { name: 'Offset', defaults: { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } },
	NOISE: { name: 'Noise', defaults: { factor: .1, scale: .5, seed: 1 } },
	SMOOTH: { name: 'Smooth', defaults: { factor: .5, iterations: 2 } },
	SUBDIVIDE: { name: 'Subdivide', defaults: { level: 1 } },
	SIMPLIFY: { name: 'Simplify curve', curveOnly: true, defaults: { factor: .01 } },
	WAVE: { name: 'Wave', defaults: { amplitude: .2, period: 1.5, phase: 0, axis: 0 } }
};

export function canModify( object ) {

	return !! object?.geometry?.attributes.position && ( object.isMesh || object.isLine ) && ! object.isSkinnedMesh &&
		! object.isInstancedMesh && ! object.userData.assetObject && ! Object.keys( object.geometry.morphAttributes ).length;

}

export function createModifier( type ) {

	const def = MODIFIERS[ type ];
	if ( ! def ) throw new Error( 'Unknown modifier' );
	return { id: THREE.MathUtils.generateUUID(), type, name: def.name, enabled: true, params: { ...def.defaults } };

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

function plain( geometry ) {

	const result = new THREE.BufferGeometry().copy( geometry );
	result.userData = structuredClone( geometry.userData );
	return result;

}

function combine( copies, mesh ) {

	const parts = copies.map( g => g.index ? g.toNonIndexed() : g );
	const result = new THREE.BufferGeometry();
	for ( const [ name, attribute ] of Object.entries( parts[ 0 ].attributes ) ) {

		const array = new Float32Array( parts.reduce( ( n, g ) => n + g.attributes[ name ].array.length, 0 ) );
		let offset = 0;
		for ( const part of parts ) { const attr = part.attributes[ name ];
			for ( let i = 0; i < attr.count; i ++ ) for ( let c = 0; c < attr.itemSize; c ++ ) array[ offset ++ ] = attr.getComponent( i, c ); }
		result.setAttribute( name, new THREE.BufferAttribute( array, attribute.itemSize ) );

	}
	let offset = 0;
	for ( const part of parts ) {

		for ( const group of part.groups ) result.addGroup( offset + group.start, group.count, group.materialIndex );
		offset += part.attributes.position.count;

	}
	for ( const part of parts ) if ( ! copies.includes( part ) ) part.dispose();
	for ( const part of copies ) part.dispose();
	return result;

}

function subdivide( geometry, mesh ) {

	const source = geometry.index ? geometry.toNonIndexed() : geometry;
	const count = source.attributes.position.count;
	const result = new THREE.BufferGeometry();
	for ( const [ name, attribute ] of Object.entries( source.attributes ) ) {

		const out = [];
		const sample = i => Array.from( { length: attribute.itemSize }, ( _, c ) => attribute.getComponent( i, c ) );
		const mid = ( a, b ) => a.map( ( v, i ) => ( v + b[ i ] ) / 2 );
		if ( mesh ) for ( let i = 0; i + 2 < count; i += 3 ) {

			const a = sample( i ), b = sample( i + 1 ), c = sample( i + 2 );
			const ab = mid( a, b ), bc = mid( b, c ), ca = mid( c, a );
			for ( const point of [ a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca ] ) out.push( ...point );

		} else {

			for ( let i = 0; i < count; i ++ ) { const a = sample( i ); out.push( ...a ); if ( i + 1 < count ) out.push( ...mid( a, sample( i + 1 ) ) ); }

		}
		result.setAttribute( name, new THREE.Float32BufferAttribute( out, attribute.itemSize ) );

	}
	if ( mesh ) for ( const group of source.groups ) result.addGroup( group.start * 4, group.count * 4, group.materialIndex );
	if ( source !== geometry ) source.dispose();
	geometry.dispose();
	return result;

}

function smooth( geometry, mesh, factor, iterations ) {

	const position = geometry.attributes.position;
	const points = [], refs = [], byPosition = new Map();
	for ( let i = 0; i < position.count; i ++ ) {

		const point = new THREE.Vector3().fromBufferAttribute( position, i );
		const key = point.toArray().join( ',' );
		if ( ! byPosition.has( key ) ) { byPosition.set( key, points.length ); points.push( point ); }
		refs.push( byPosition.get( key ) );

	}
	const neighbors = points.map( () => new Set() );
	const link = ( a, b ) => { if ( a !== b ) { neighbors[ a ].add( b ); neighbors[ b ].add( a ); } };
	if ( mesh ) for ( let i = 0, count = geometry.index?.count ?? position.count; i + 2 < count; i += 3 ) {

		const ids = [ 0, 1, 2 ].map( j => refs[ geometry.index ? geometry.index.getX( i + j ) : i + j ] );
		link( ids[ 0 ], ids[ 1 ] ); link( ids[ 1 ], ids[ 2 ] ); link( ids[ 2 ], ids[ 0 ] );

	} else for ( let i = 1; i < refs.length; i ++ ) link( refs[ i - 1 ], refs[ i ] );
	for ( let k = 0; k < iterations; k ++ ) {

		const next = points.map( ( point, i ) => {

			if ( ! neighbors[ i ].size || ! mesh && neighbors[ i ].size < 2 ) return point.clone();
			const average = new THREE.Vector3();
			for ( const j of neighbors[ i ] ) average.add( points[ j ] );
			return point.clone().lerp( average.divideScalar( neighbors[ i ].size ), factor );

		} );
		points.splice( 0, points.length, ...next );

	}
	refs.forEach( ( j, i ) => position.setXYZ( i, ...points[ j ].toArray() ) );

}

export function evaluateModifiers( source, stack, mesh = true ) {

	let geometry = plain( source );
	try {

		for ( const mod of stack ) {

			if ( ! mod.enabled ) continue;
			const def = MODIFIERS[ mod.type ];
			if ( ! def || def.curveOnly && mesh || def.meshOnly && ! mesh ) continue;
			const p = { ...def.defaults, ...mod.params };
			if ( Object.values( p ).some( v => typeof v === 'number' && ! Number.isFinite( v ) ) ) throw new Error( 'Modifier values must be finite.' );
			if ( mod.type === 'ARRAY' || mod.type === 'MIRROR' ) {

				const copiesCount = mod.type === 'ARRAY' ? THREE.MathUtils.clamp( Math.round( p.count ), 1, 50 ) : 1 + [ p.axisX, p.axisY, p.axisZ ].filter( Boolean ).length;
				const size = geometry.index?.count ?? geometry.attributes.position.count;
				if ( size * copiesCount > 1000000 ) throw new Error( 'Modifier stack exceeds one million vertices.' );
				const copies = [ geometry ];
				if ( mod.type === 'ARRAY' ) for ( let i = 1; i < THREE.MathUtils.clamp( Math.round( p.count ), 1, 50 ); i ++ ) copies.push( geometry.clone().translate( p.offsetX * i, p.offsetY * i, p.offsetZ * i ) );
				else for ( const [ axis, enabled ] of [ p.axisX, p.axisY, p.axisZ ].entries() ) if ( enabled ) {

					const copy = geometry.clone();
					const scale = [ 1, 1, 1 ]; scale[ axis ] = - 1; copy.scale( ...scale );
					if ( mesh ) {

						if ( ! copy.index ) copy.setIndex( Array.from( { length: copy.attributes.position.count }, ( _, i ) => i ) );
						for ( let i = 0; i + 2 < copy.index.count; i += 3 ) { const a = copy.index.getX( i ); copy.index.setX( i, copy.index.getX( i + 2 ) ); copy.index.setX( i + 2, a ); }

					}
					copies.push( copy );

				}
				geometry = combine( copies, mesh );

			} else if ( mod.type === 'SUBDIVIDE' ) {

				for ( let i = 0; i < THREE.MathUtils.clamp( Math.round( p.level ), 0, 4 ); i ++ ) {

					if ( geometry.attributes.position.count * ( mesh ? 4 : 2 ) > 1000000 ) throw new Error( 'Subdivision would exceed one million vertices.' );
					geometry = subdivide( geometry, mesh );

				}

			} else if ( mod.type === 'SMOOTH' ) smooth( geometry, mesh, THREE.MathUtils.clamp( p.factor, 0, 1 ), THREE.MathUtils.clamp( Math.round( p.iterations ), 0, 30 ) );
			else if ( mod.type === 'OFFSET' ) {

				geometry.scale( p.scaleX, p.scaleY, p.scaleZ );
				geometry.rotateX( p.rotationX * Math.PI / 180 ); geometry.rotateY( p.rotationY * Math.PI / 180 ); geometry.rotateZ( p.rotationZ * Math.PI / 180 );
				geometry.translate( p.x, p.y, p.z );

			} else if ( mod.type === 'SIMPLIFY' ) {

				const position = geometry.attributes.position, kept = position.count ? [ 0 ] : [];
				let last = new THREE.Vector3().fromBufferAttribute( position, 0 );
				for ( let i = 1; i < position.count - 1; i ++ ) { const point = new THREE.Vector3().fromBufferAttribute( position, i ); if ( point.distanceTo( last ) >= Math.max( 0, p.factor ) ) { kept.push( i ); last = point; } }
				if ( position.count > 1 ) kept.push( position.count - 1 );
				for ( const [ name, attribute ] of Object.entries( geometry.attributes ) ) geometry.setAttribute( name, new THREE.Float32BufferAttribute( kept.flatMap( i => Array.from( { length: attribute.itemSize }, ( _, c ) => attribute.getComponent( i, c ) ) ), attribute.itemSize ) );

			} else {

				const position = geometry.attributes.position;
				for ( let i = 0; i < position.count; i ++ ) {

					const point = new THREE.Vector3().fromBufferAttribute( position, i );
					if ( mod.type === 'WAVE' ) { const axis = THREE.MathUtils.clamp( Math.round( p.axis ), 0, 2 ); const output = axis === 1 ? 0 : 1; point.setComponent( output, point.getComponent( output ) + Math.sin( point.getComponent( axis ) / Math.max( .01, p.period ) * Math.PI * 2 + p.phase ) * p.amplitude ); }
					if ( mod.type === 'NOISE' ) { const seed = point.x * 12.9898 + point.y * 78.233 + point.z * 37.719 + p.seed; for ( let axis = 0; axis < 3; axis ++ ) point.setComponent( axis, point.getComponent( axis ) + Math.sin( seed / Math.max( .01, p.scale ) + axis * 17.1 ) * p.factor ); }
					position.setXYZ( i, ...point.toArray() );

				}

			}
			if ( geometry.attributes.position.count > 1000000 ) throw new Error( 'Modifier stack exceeds one million vertices.' );

		}
		delete geometry.userData.modeling;
		delete geometry.userData.triangleFaces;
		if ( mesh ) geometry.computeVertexNormals();
		geometry.computeBoundingBox(); geometry.computeBoundingSphere();
		return geometry;

	} catch ( error ) { geometry.dispose(); throw error; }

}

export function modifierStackCommands( editor, object, stack, source = modifierSource( object ) ) {

	const base = plain( source );
	const userData = { ...object.userData, modifiers: structuredClone( stack ), modifierBase: base.toJSON() };
	const geometry = stack.length ? evaluateModifiers( base, stack, object.isMesh ) : plain( base );
	base.dispose();
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
