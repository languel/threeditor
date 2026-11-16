// Schematic layout based on ThreeGrease's MediaMime landmark picker.
import { poseLinks, handLinks } from './LandmarkPreview.js';

const poseNames = [
	'Nose', 'Left eye (inner)', 'Left eye', 'Left eye (outer)', 'Right eye (inner)', 'Right eye',
	'Right eye (outer)', 'Left ear', 'Right ear', 'Left mouth corner', 'Right mouth corner',
	'Left shoulder', 'Right shoulder', 'Left elbow', 'Right elbow', 'Left wrist', 'Right wrist',
	'Left pinky', 'Right pinky', 'Left index', 'Right index', 'Left thumb', 'Right thumb',
	'Left hip', 'Right hip', 'Left knee', 'Right knee', 'Left ankle', 'Right ankle',
	'Left heel', 'Right heel', 'Left foot index', 'Right foot index'
];
const pose = [
	[ 150, 87 ], [ 163, 65 ], [ 178, 61 ], [ 193, 66 ], [ 137, 65 ], [ 122, 61 ],
	[ 107, 66 ], [ 211, 77 ], [ 89, 77 ], [ 137, 108 ], [ 163, 108 ],
	[ 212, 168 ], [ 88, 168 ], [ 250, 224 ], [ 50, 224 ], [ 272, 280 ], [ 28, 280 ],
	[ 291, 309 ], [ 9, 309 ], [ 279, 326 ], [ 21, 326 ], [ 256, 307 ], [ 44, 307 ],
	[ 184, 309 ], [ 116, 309 ], [ 196, 405 ], [ 104, 405 ], [ 205, 491 ], [ 95, 491 ],
	[ 222, 514 ], [ 78, 514 ], [ 189, 529 ], [ 111, 529 ]
];
const handNames = [ 'Wrist', 'Thumb CMC', 'Thumb MCP', 'Thumb IP', 'Thumb tip' ];
for ( const finger of [ 'Index', 'Middle', 'Ring', 'Pinky' ] ) {

	for ( const joint of [ 'MCP', 'PIP', 'DIP', 'tip' ] ) handNames.push( finger + ' ' + joint );

}
const hand = [
	[ 100, 210 ], [ 65, 195 ], [ 40, 165 ], [ 25, 130 ], [ 10, 95 ],
	[ 65, 115 ], [ 60, 80 ], [ 55, 50 ], [ 50, 20 ],
	[ 95, 100 ], [ 95, 60 ], [ 95, 30 ], [ 95, 8 ],
	[ 125, 105 ], [ 130, 65 ], [ 133, 35 ], [ 135, 10 ],
	[ 155, 120 ], [ 165, 90 ], [ 172, 65 ], [ 178, 40 ]
];

const face = [
	[ 10, 'Forehead', 100, 14 ], [ 152, 'Chin', 100, 201 ],
	[ 234, 'Right cheek outline', 18, 105 ], [ 454, 'Left cheek outline', 182, 105 ],
	[ 33, 'Right eye outer corner', 38, 76 ], [ 133, 'Right eye inner corner', 82, 76 ],
	[ 362, 'Left eye inner corner', 118, 76 ], [ 263, 'Left eye outer corner', 162, 76 ],
	[ 468, 'Right iris center', 60, 76 ], [ 473, 'Left iris center', 140, 76 ],
	[ 1, 'Nose tip', 100, 118 ], [ 61, 'Right mouth corner', 65, 153 ],
	[ 291, 'Left mouth corner', 135, 153 ], [ 13, 'Upper lip', 100, 145 ], [ 14, 'Lower lip', 100, 162 ]
];
const iris = [ [ 50, 50 ], [ 80, 50 ], [ 50, 20 ], [ 20, 50 ], [ 50, 80 ] ];

export const landmarkGroups = {
	pose: 'Pose', leftHand: 'Left hand', rightHand: 'Right hand', hand: 'Hand', face: 'Face',
	'iris.left': 'Left iris', 'iris.right': 'Right iris'
};

const byIndex = ( positions, names ) => positions.map( ( [ x, y ], index ) => [ index, names[ index ], x, y ] );

export function landmarkDiagram( group ) {

	if ( group === 'pose' ) return { size: [ 300, 545 ], points: byIndex( pose, poseNames ), links: poseLinks };
	if ( group === 'face' ) return { size: [ 200, 215 ], points: face, links: [
		[ 10, 234 ], [ 234, 152 ], [ 152, 454 ], [ 454, 10 ], [ 33, 133 ], [ 362, 263 ],
		[ 61, 13 ], [ 13, 291 ], [ 291, 14 ], [ 14, 61 ]
	] };
	if ( group.startsWith( 'iris.' ) ) return { size: [ 100, 100 ], points: byIndex( iris, [ 'Center', 'Rim point 1', 'Rim point 2', 'Rim point 3', 'Rim point 4' ] ), links: [ [ 1, 2 ], [ 2, 3 ], [ 3, 4 ], [ 4, 1 ] ] };
	return { size: [ 200, 230 ], points: byIndex( hand, handNames ), links: handLinks };

}

export function landmarkName( group, index ) {

	if ( group === 'pose' ) return poseNames[ index ];
	if ( group === 'face' ) return face.find( point => point[ 0 ] === index )?.[ 1 ];
	if ( group.startsWith( 'iris.' ) ) return index === 0 ? 'Center' : 'Rim point ' + index;
	return handNames[ index ];

}
