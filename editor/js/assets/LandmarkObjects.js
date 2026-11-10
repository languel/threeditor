import * as THREE from 'three';

// MediaPipe skeleton connection definitions for drawing landmark lines.
const POSE_CONNECTIONS = [
	[ 0, 1 ], [ 1, 2 ], [ 2, 3 ], [ 3, 7 ], [ 0, 4 ], [ 4, 5 ], [ 5, 6 ], [ 6, 8 ],
	[ 9, 10 ], [ 11, 12 ], [ 11, 13 ], [ 13, 15 ], [ 15, 17 ], [ 15, 19 ], [ 15, 21 ], [ 17, 19 ],
	[ 12, 14 ], [ 14, 16 ], [ 16, 18 ], [ 16, 20 ], [ 16, 22 ], [ 18, 20 ],
	[ 11, 23 ], [ 12, 24 ], [ 23, 24 ], [ 23, 25 ], [ 24, 26 ], [ 25, 27 ], [ 26, 28 ], [ 27, 29 ], [ 28, 30 ], [ 29, 31 ], [ 30, 32 ]
];

const FACE_OVAL = [
	10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
];

const HAND_CONNECTIONS = [
	[ 0, 1 ], [ 1, 2 ], [ 2, 3 ], [ 3, 4 ],
	[ 0, 5 ], [ 5, 6 ], [ 6, 7 ], [ 7, 8 ],
	[ 0, 9 ], [ 9, 10 ], [ 10, 11 ], [ 11, 12 ],
	[ 0, 13 ], [ 13, 14 ], [ 14, 15 ], [ 15, 16 ],
	[ 0, 17 ], [ 17, 18 ], [ 18, 19 ], [ 19, 20 ]
];

const IRIS_CONNECTIONS = [ [ 0, 1 ], [ 1, 2 ], [ 2, 3 ], [ 3, 4 ], [ 4, 0 ] ];

function faceOvalConnections( oval ) {

	const conns = [];
	for ( let i = 0; i < oval.length; i ++ ) conns.push( [ oval[ i ], oval[ ( i + 1 ) % oval.length ] ] );
	return conns;

}

const FACE_CONNECTIONS = faceOvalConnections( FACE_OVAL );

export function landmarkScript( config = {} ) {

	const {
		showPose = true, showHead = true, showTorso = true, showArms = true, showLegs = true, showFace = true, showHands = true, showIris = false,
		pointSize = 0.02, pointColor = '#00ff00', lineColor = '#00ffff'
	} = config;

	const headers = [
		'// MediaPipe landmark visualization.',
		'// Draws tracking results as Three.js points and lines.',
		`// @param showPose = ${ showPose }`,
		`// @param showHead = ${ showHead }`,
		`// @param showTorso = ${ showTorso }`,
		`// @param showArms = ${ showArms }`,
		`// @param showLegs = ${ showLegs }`,
		`// @param showFace = ${ showFace }`,
		`// @param showHands = ${ showHands }`,
		`// @param showIris = ${ showIris }`,
		`// @param pointSize = ${ pointSize } (0.001..0.1)`,
		`// @param pointColor = ${ JSON.stringify( pointColor ) }`,
		`// @param lineColor = ${ JSON.stringify( lineColor ) }`,
		'// @options showPose = [true, false]',
		'// @options showHead = [true, false]',
		'// @options showTorso = [true, false]',
		'// @options showArms = [true, false]',
		'// @options showLegs = [true, false]',
		'// @options showFace = [true, false]',
		'// @options showHands = [true, false]',
		'// @options showIris = [true, false]',
		''
	].join( '\n' );

	const body = `
const POSE_CONNECTIONS = ${ JSON.stringify( POSE_CONNECTIONS ) };
const FACE_CONNECTIONS = ${ JSON.stringify( FACE_CONNECTIONS ) };
const HAND_CONNECTIONS = ${ JSON.stringify( HAND_CONNECTIONS ) };
const IRIS_CONNECTIONS = ${ JSON.stringify( IRIS_CONNECTIONS ) };

// All trackers report normalized image coordinates (x right, y down), so they share one space.
// Map it to a centered, upright (y up) frame one unit tall, scaled by the video aspect ratio.
let aspect = 4 / 3;
const range = ( from, to ) => Array.from( { length: to - from + 1 }, ( _, i ) => from + i );
const only = ( conns, idx ) => conns.filter( ( [ a, b ] ) => idx.includes( a ) && idx.includes( b ) );
const ALL = range( 0, 32 );
const ARM_L = [ 11, 13, 15, 17, 19, 21 ], ARM_R = [ 12, 14, 16, 18, 20, 22 ];
const LEG_L = [ 23, 25, 27, 29, 31 ], LEG_R = [ 24, 26, 28, 30, 32 ];
const HEAD = range( 0, 10 ), TORSO = [ 11, 12, 23, 24 ];
// Each semantic part becomes a named Points + LineSegments pair in the outliner.
const PARTS = [
	{ name: 'Head', topic: 'pose', idx: HEAD, conns: only( POSE_CONNECTIONS, HEAD ), show: () => params.showPose && params.showHead },
	{ name: 'Torso', topic: 'pose', idx: TORSO, conns: only( POSE_CONNECTIONS, TORSO ), show: () => params.showPose && params.showTorso },
	{ name: 'Left arm', topic: 'pose', idx: ARM_L, conns: only( POSE_CONNECTIONS, ARM_L ), show: () => params.showPose && params.showArms },
	{ name: 'Right arm', topic: 'pose', idx: ARM_R, conns: only( POSE_CONNECTIONS, ARM_R ), show: () => params.showPose && params.showArms },
	{ name: 'Left leg', topic: 'pose', idx: LEG_L, conns: only( POSE_CONNECTIONS, LEG_L ), show: () => params.showPose && params.showLegs },
	{ name: 'Right leg', topic: 'pose', idx: LEG_R, conns: only( POSE_CONNECTIONS, LEG_R ), show: () => params.showPose && params.showLegs },
	{ name: 'Face', topic: 'face', idx: range( 0, 467 ), conns: FACE_CONNECTIONS, show: () => params.showFace },
	{ name: 'Left hand', topic: 'leftHand', idx: range( 0, 20 ), conns: HAND_CONNECTIONS, show: () => params.showHands },
	{ name: 'Right hand', topic: 'rightHand', idx: range( 0, 20 ), conns: HAND_CONNECTIONS, show: () => params.showHands },
	{ name: 'Left iris', topic: 'iris.left', idx: range( 0, 4 ), conns: IRIS_CONNECTIONS, show: () => params.showIris },
	{ name: 'Right iris', topic: 'iris.right', idx: range( 0, 4 ), conns: IRIS_CONNECTIONS, show: () => params.showIris }
];

function put( attr, k, p ) {

	attr.setXYZ( k, ( p.x - 0.5 ) * aspect, 0.5 - p.y, - p.z * aspect );

}

function init() {

	const pC = new THREE.Color( params.pointColor ).getHex();
	const lC = new THREE.Color( params.lineColor ).getHex();
	for ( const part of PARTS ) {

		const pg = new THREE.BufferGeometry();
		pg.setAttribute( 'position', new THREE.Float32BufferAttribute( new Float32Array( part.idx.length * 3 ), 3 ) );
		part.points = new THREE.Points( pg, new THREE.PointsMaterial( { color: pC, size: params.pointSize, sizeAttenuation: true, depthTest: false } ) );
		const lg = new THREE.BufferGeometry();
		lg.setAttribute( 'position', new THREE.Float32BufferAttribute( new Float32Array( part.conns.length * 6 ), 3 ) );
		part.lines = new THREE.LineSegments( lg, new THREE.LineBasicMaterial( { color: lC, depthTest: false } ) );
		part.points.name = part.name + ' points';
		part.lines.name = part.name + ' lines';
		for ( const object of [ part.points, part.lines ] ) { object.frustumCulled = false; object.userData.landmark = true; this.add( object ); }

	}

}

function update( { delta, time } ) {

	const bus = player.streams;
	const frame = bus.get( 'video.frame' );
	const fw = frame?.videoWidth || frame?.naturalWidth || frame?.width, fh = frame?.videoHeight || frame?.naturalHeight || frame?.height;
	if ( fw && fh ) aspect = fw / fh;
	for ( const part of PARTS ) {

		const lm = bus.get( 'vision.' + part.topic + '.landmarks' );
		const visible = !! lm?.length && part.show() && part.idx.every( i => lm[ i ] );
		part.points.visible = part.lines.visible = visible;
		if ( ! visible ) continue;
		part.points.material.size = params.pointSize;
		part.points.material.color.set( params.pointColor );
		part.lines.material.color.set( params.lineColor );
		const pa = part.points.geometry.attributes.position, la = part.lines.geometry.attributes.position;
		part.idx.forEach( ( index, k ) => put( pa, k, lm[ index ] ) );
		part.conns.forEach( ( [ a, b ], k ) => { put( la, k * 2, lm[ a ] ); put( la, k * 2 + 1, lm[ b ] ); } );
		pa.needsUpdate = la.needsUpdate = true;

	}

}

function stop() {

	for ( const child of [ ...this.children ] ) {

		if ( child.userData.landmark ) {

			child.geometry?.dispose();
			child.material?.dispose();
			this.remove( child );

		}

	}

}
`;

	return {
		name: 'Landmark visualization',
		assetBehavior: 'landmark',
		enabled: true,
		source: headers + body
	};

}

export function landmarkTextureScript( config = {} ) {

	const {
		showPose = true, showFace = true, showHands = true, showIris = false,
		pointSize = 4, pointColor = '#00ff00', lineColor = '#00ffff', canvasSize = 512
	} = config;

	const headers = [
		'// MediaPipe landmark texture.',
		'// Renders tracking results to a canvas texture usable as a material map.',
		`// @param showPose = ${ showPose }`,
		`// @param showFace = ${ showFace }`,
		`// @param showHands = ${ showHands }`,
		`// @param showIris = ${ showIris }`,
		`// @param pointSize = ${ pointSize } (1..20)`,
		`// @param pointColor = ${ JSON.stringify( pointColor ) }`,
		`// @param lineColor = ${ JSON.stringify( lineColor ) }`,
		'// @options showPose = [true, false]',
		'// @options showFace = [true, false]',
		'// @options showHands = [true, false]',
		'// @options showIris = [true, false]',
		''
	].join( '\n' );

	const body = `
const POSE_CONNECTIONS = ${ JSON.stringify( POSE_CONNECTIONS ) };
const FACE_CONNECTIONS = ${ JSON.stringify( FACE_CONNECTIONS ) };
const HAND_CONNECTIONS = ${ JSON.stringify( HAND_CONNECTIONS ) };
const IRIS_CONNECTIONS = ${ JSON.stringify( IRIS_CONNECTIONS ) };

let canvas, ctx, texture;

function drawPoints( lm, vis, world, radius, color ) {

	if ( ! vis || ! lm?.length ) return;
	ctx.fillStyle = color;
		for ( let i = 0; i < lm.length; i ++ ) {

		const p = lm[ i ];
		const x = p.x * canvasSize;
		const y = p.y * canvasSize;
		ctx.beginPath();
		ctx.arc( x, y, radius, 0, Math.PI * 2 );
		ctx.fill();

	}

}

function drawLines( lm, vis, conns, world, color ) {

	if ( ! vis || ! lm?.length ) return;
	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
		for ( const [ a, b ] of conns ) {

		const pa = lm[ a ], pb = lm[ b ];
		const x1 = pa.x * canvasSize, y1 = pa.y * canvasSize;
		const x2 = pb.x * canvasSize, y2 = pb.y * canvasSize;
		ctx.beginPath();
		ctx.moveTo( x1, y1 );
		ctx.lineTo( x2, y2 );
		ctx.stroke();

	}

}

function init() {

	canvas = document.createElement( 'canvas' );
	canvas.width = canvasSize;
	canvas.height = canvasSize;
	ctx = canvas.getContext( '2d' );
	texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	this.assetMedia = texture;
	this.material.map?.dispose();
	this.material.map = texture;
	this.material.needsUpdate = true;

}

function update( { delta, time } ) {

	const bus = player.streams;
	const g = ( t ) => bus.get( t );

	ctx.clearRect( 0, 0, canvasSize, canvasSize );
	ctx.fillStyle = '#000000';
	ctx.fillRect( 0, 0, canvasSize, canvasSize );

	drawPoints( g( 'vision.pose.landmarks' ), params.showPose, g( 'vision.pose.world' ), params.pointSize, params.pointColor );
	drawLines( g( 'vision.pose.landmarks' ), params.showPose, POSE_CONNECTIONS, g( 'vision.pose.world' ), params.lineColor );

	drawPoints( g( 'vision.face.landmarks' ), params.showFace, g( 'vision.face.world' ), params.pointSize, params.pointColor );
	drawLines( g( 'vision.face.landmarks' ), params.showFace, FACE_CONNECTIONS, g( 'vision.face.world' ), params.lineColor );

	drawPoints( g( 'vision.leftHand.landmarks' ), params.showHands, g( 'vision.leftHand.world' ), params.pointSize, params.pointColor );
	drawLines( g( 'vision.leftHand.landmarks' ), params.showHands, HAND_CONNECTIONS, g( 'vision.leftHand.world' ), params.lineColor );

	drawPoints( g( 'vision.rightHand.landmarks' ), params.showHands, g( 'vision.rightHand.world' ), params.pointSize, params.pointColor );
	drawLines( g( 'vision.rightHand.landmarks' ), params.showHands, HAND_CONNECTIONS, g( 'vision.rightHand.world' ), params.lineColor );

	drawPoints( g( 'vision.iris.left.landmarks' ), params.showIris, null, params.pointSize, params.pointColor );
	drawLines( g( 'vision.iris.left.landmarks' ), params.showIris, IRIS_CONNECTIONS, null, params.lineColor );

	drawPoints( g( 'vision.iris.right.landmarks' ), params.showIris, null, params.pointSize, params.pointColor );
	drawLines( g( 'vision.iris.right.landmarks' ), params.showIris, IRIS_CONNECTIONS, null, params.lineColor );

	texture.needsUpdate = true;

}

function stop() {

	if ( texture ) texture.dispose();
	this.assetMedia = null;
	this.material.map = null;
	this.material.needsUpdate = true;

}
`;

	return {
		name: 'Landmark texture',
		assetBehavior: 'landmark-texture',
		enabled: true,
		source: headers + body
	};

}
