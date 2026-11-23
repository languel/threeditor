import * as THREE from 'three';
import { grainTileSize } from './PencilGrain.js?v=expressive-pencil';
import { pencilProfile } from './PencilProfile.js';

export function taperPencilSplats( mark, brush, tile ) {

	if ( ! ( brush.taperStart || brush.taperEnd ) ) return mark;
	const points = mark.points.map( point => new THREE.Vector3().fromArray( point ) );
	const profile = pencilProfile( points, brush );
	if ( ! profile ) return mark;
	const result = { receiver: mark.receiver, positions: [], radii: [], kernels: [], points: [], samples: [] };
	for ( const [ index, point ] of mark.points.entries() ) {

		const sample = mark.samples[ index ];
		addPencilSplatDab( result, point, { ...sample, radius: sample.radius * profile.factor( profile.lengths[ index ] ) }, brush, tile );

	}
	return result;

}

// Emit ordinary .splat samples. Grain changes the Gaussian distribution
// itself, so it stays visible from other views and in the exported cloud.
export function addPencilSplatDab( mark, point, sample, brush, tile ) {

	const normal = new THREE.Vector3().fromArray( sample.normal );
	const right = new THREE.Vector3().fromArray( sample.right ).applyAxisAngle( normal, brush.angle || 0 );
	const up = new THREE.Vector3().crossVectors( normal, right ).normalize();
	const basis = new THREE.Matrix4().makeBasis( right, up, normal );
	const rotation = new THREE.Quaternion().setFromRotationMatrix( basis ).toArray();
	const radius = sample.radius;
	const aspect = brush.aspect || 1;
	const center = new THREE.Vector3().fromArray( point );
	const dabIndex = mark.points.length;
	const count = tile ? Math.round( 7 + brush.grain * 9 ) : 1;
	const width = radius * ( tile ? .19 + .07 * brush.hardness : .37 + .16 * brush.hardness );
	const depth = Math.max( 1e-6, radius * .055 );
	const axes = [ width, Math.max( 1e-6, width * aspect ), depth ];
	const frequency = ( brush.grainScale || 6 ) / 8;
	for ( let i = 0; i < count; i ++ ) {

		const distance = tile ? .90 * Math.sqrt( i / count ) : 0;
		const angle = i * 2.3999632297 + dabIndex * 1.6180339887;
		const x = Math.cos( angle ) * distance, y = Math.sin( angle ) * distance;
		const gx = ( Math.floor( ( x + 1 ) * .5 * frequency * grainTileSize ) + dabIndex * 11 ) % grainTileSize;
		const gy = ( Math.floor( ( y + 1 ) * .5 * frequency * grainTileSize ) + dabIndex * 7 ) % grainTileSize;
		const tooth = tile ? tile[ gy * grainTileSize + gx ] / 255 : 1;
		const edge = 1 - ( 1 - brush.hardness ) * distance;
		const alpha = tooth * edge * ( tile ? .48 : .72 );
		if ( alpha < .025 ) continue;
		const position = center.clone().addScaledVector( right, x * radius ).addScaledVector( up, y * radius * aspect );
		mark.positions.push( ...position.toArray() );
		mark.radii.push( radius );
		mark.kernels.push( { axes, rotation, alpha: alpha * ( sample.opacity ?? 1 ) } );

	}
	mark.points.push( point );
	mark.samples.push( sample );

}
