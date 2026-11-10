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
		showPose = true, showFace = true, showHands = true, showIris = false,
		pointSize = 0.02, pointColor = '#00ff00', lineColor = '#00ffff'
	} = config;

	const headers = [
		'// MediaPipe landmark visualization.',
		'// Draws tracking results as Three.js points and lines.',
		`// @param showPose = ${ showPose }`,
		`// @param showFace = ${ showFace }`,
		`// @param showHands = ${ showHands }`,
		`// @param showIris = ${ showIris }`,
		`// @param pointSize = ${ pointSize } (0.001..0.1)`,
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

let posePts, facePts, lhPts, rhPts, ilPts, irPts;
let poseLn, faceLn, lhLn, rhLn, ilLn, irLn;

function makePoints( n, color, size ) {

	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.Float32BufferAttribute( new Float32Array( n * 3 ), 3 ) );
	const mat = new THREE.PointsMaterial( { color, size, sizeAttenuation: true, depthTest: false } );
	const pts = new THREE.Points( geo, mat );
	pts.frustumCulled = false;
	pts.userData.landmark = true;
	return { pts, geo, mat };

}

function makeLines( conns, color ) {

	const pos = [];
	for ( const [ a, b ] of conns ) pos.push( 0, 0, 0, 0, 0, 0 );
	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.Float32BufferAttribute( new Float32Array( pos ), 3 ) );
	const mat = new THREE.LineBasicMaterial( { color, depthTest: false } );
	const ln = new THREE.LineSegments( geo, mat );
	ln.frustumCulled = false;
	ln.userData.landmark = true;
	return { ln, geo, mat };

}

function setPts( pts, lm, vis, world ) {

	if ( ! vis || ! lm?.length ) { pts.visible = false; return; }
	pts.visible = true;
	const attr = pts.geometry.attributes.position;
	const useW = world?.length === lm.length;
	for ( let i = 0; i < lm.length; i ++ ) {

		const p = useW ? world[ i ] : lm[ i ];
		attr.setXYZ( i, p.x, p.y, p.z );

	}
	attr.needsUpdate = true;

}

function setLn( ln, lm, vis, conns, world ) {

	if ( ! vis || ! lm?.length ) { ln.visible = false; return; }
	ln.visible = true;
	const attr = ln.geometry.attributes.position;
	const useW = world?.length === lm.length;
	let k = 0;
	for ( const [ a, b ] of conns ) {

		const pa = useW ? world[ a ] : lm[ a ];
		const pb = useW ? world[ b ] : lm[ b ];
		attr.setXYZ( k, pa.x, pa.y, pa.z );
		attr.setXYZ( k + 1, pb.x, pb.y, pb.z );
		k += 2;

	}
	attr.needsUpdate = true;

}

function init() {

	const size = params.pointSize;
	const pC = new THREE.Color( params.pointColor ).getHex();
	const lC = new THREE.Color( params.lineColor ).getHex();

	const pr = makePoints( 33, pC, size ); posePts = pr.pts; this.add( posePts );
	const pl = makeLines( POSE_CONNECTIONS, lC ); poseLn = pl.ln; this.add( poseLn );

	const fr = makePoints( 468, pC, size ); facePts = fr.pts; this.add( facePts );
	const fl = makeLines( FACE_CONNECTIONS, lC ); faceLn = fl.ln; this.add( faceLn );

	const lhr = makePoints( 21, pC, size ); lhPts = lhr.pts; this.add( lhPts );
	const lhl = makeLines( HAND_CONNECTIONS, lC ); lhLn = lhl.ln; this.add( lhLn );

	const rhr = makePoints( 21, pC, size ); rhPts = rhr.pts; this.add( rhPts );
	const rhl = makeLines( HAND_CONNECTIONS, lC ); rhLn = rhl.ln; this.add( rhLn );

	const ilr = makePoints( 5, pC, size ); ilPts = ilr.pts; this.add( ilPts );
	const ill = makeLines( IRIS_CONNECTIONS, lC ); ilLn = ill.ln; this.add( ilLn );

	const irr = makePoints( 5, pC, size ); irPts = irr.pts; this.add( irPts );
	const irl = makeLines( IRIS_CONNECTIONS, lC ); irLn = irl.ln; this.add( irLn );

}

function update( { delta, time } ) {

	const bus = player.streams;
	const g = ( t ) => bus.get( t );

	setPts( posePts, g( 'vision.pose.landmarks' ), params.showPose, g( 'vision.pose.world' ) );
	setLn( poseLn, g( 'vision.pose.landmarks' ), params.showPose, POSE_CONNECTIONS, g( 'vision.pose.world' ) );

	setPts( facePts, g( 'vision.face.landmarks' ), params.showFace, g( 'vision.face.world' ) );
	setLn( faceLn, g( 'vision.face.landmarks' ), params.showFace, FACE_CONNECTIONS, g( 'vision.face.world' ) );

	setPts( lhPts, g( 'vision.leftHand.landmarks' ), params.showHands, g( 'vision.leftHand.world' ) );
	setLn( lhLn, g( 'vision.leftHand.landmarks' ), params.showHands, HAND_CONNECTIONS, g( 'vision.leftHand.world' ) );

	setPts( rhPts, g( 'vision.rightHand.landmarks' ), params.showHands, g( 'vision.rightHand.world' ) );
	setLn( rhLn, g( 'vision.rightHand.landmarks' ), params.showHands, HAND_CONNECTIONS, g( 'vision.rightHand.world' ) );

	setPts( ilPts, g( 'vision.iris.left.landmarks' ), params.showIris );
	setLn( ilLn, g( 'vision.iris.left.landmarks' ), params.showIris, IRIS_CONNECTIONS );

	setPts( irPts, g( 'vision.iris.right.landmarks' ), params.showIris );
	setLn( irLn, g( 'vision.iris.right.landmarks' ), params.showIris, IRIS_CONNECTIONS );

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
	const useW = world?.length === lm.length;
	for ( let i = 0; i < lm.length; i ++ ) {

		const p = useW ? world[ i ] : lm[ i ];
		// Normalize world coords to canvas space (roughly)
		const x = ( p.x + 0.5 ) * canvasSize;
		const y = ( 1 - ( p.y + 0.5 ) ) * canvasSize;
		ctx.beginPath();
		ctx.arc( x, y, radius, 0, Math.PI * 2 );
		ctx.fill();

	}

}

function drawLines( lm, vis, conns, world, color ) {

	if ( ! vis || ! lm?.length ) return;
	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	const useW = world?.length === lm.length;
	for ( const [ a, b ] of conns ) {

		const pa = useW ? world[ a ] : lm[ a ];
		const pb = useW ? world[ b ] : lm[ b ];
		const x1 = ( pa.x + 0.5 ) * canvasSize;
		const y1 = ( 1 - ( pa.y + 0.5 ) ) * canvasSize;
		const x2 = ( pb.x + 0.5 ) * canvasSize;
		const y2 = ( 1 - ( pb.y + 0.5 ) ) * canvasSize;
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
