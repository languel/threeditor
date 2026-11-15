import { applyProjectionMask } from '../modeling/ProjectionMask.js';

// The group is the editable rig. Its script owns the temporary light and media.
export function isProjector( object ) {

	return object?.userData?.assetObject?.type === 'projector';

}

export function projectorOptics( throwRatio, aspect ) {

	const width = 0.5 / Math.max( 0.1, throwRatio );
	const height = width / Math.max( 0.1, aspect );
	// Fit the entire picture inside the spotlight cone. The unused area is black.
	return { width, height, radius: Math.hypot( width, height ) * 1.02 };

}

function projectorRuntime( THREE, root, player ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 1024;
	const ctx = canvas.getContext( '2d' );
	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	const light = new THREE.SpotLight();
	light.position.set( 0, 0, 0 );
	light.map = texture;
	light.penumbra = 0.005;
	light.shadow.bias = - 0.0002;
	light.shadow.mapSize.set( 1024, 1024 );
	light.shadow.camera.near = 0.01;
	light.userData.runtimeOnly = true;
	light.target.position.z = - 1;
	light.add( light.target );
	root.add( light );
	const updateMatrices = light.shadow.updateMatrices.bind( light.shadow );
	light.shadow.updateMatrices = function ( source ) {

		// Follow the rig's roll as well as its forward direction.
		this.camera.up.setFromMatrixColumn( source.matrixWorld, 1 ).normalize();
		updateMatrices( source );

	};

	let settings, media;
	let lastTime = - 1;

	function draw() {

		const video = media?.tagName === 'VIDEO';
		const canvasSource = media?.tagName === 'CANVAS';
		const mediaWidth = video ? media.videoWidth : canvasSource ? media.width : media?.naturalWidth;
		const mediaHeight = video ? media.videoHeight : canvasSource ? media.height : media?.naturalHeight;
		const sourceAspect = mediaWidth && mediaHeight ? mediaWidth / mediaHeight : 16 / 9;
		const aspect = settings.aspect || sourceAspect;
		if ( root.projectorFrame?.aspect !== aspect || root.projectorFrame.throwRatio !== settings.throwRatio || root.projectorFrame.range !== light.distance ) {

			root.projectorFrame = { ...projectorOptics( settings.throwRatio, aspect ), aspect, throwRatio: settings.throwRatio, range: light.distance };
			light.angle = Math.atan( root.projectorFrame.radius );

		}
		const frame = root.projectorFrame;

		const w = canvas.width * frame.width / frame.radius, h = canvas.height * frame.height / frame.radius;
		const x = ( canvas.width - w ) / 2, y = ( canvas.height - h ) / 2;
		ctx.fillStyle = '#000';
		ctx.fillRect( 0, 0, canvas.width, canvas.height );

		if ( ! settings.grid && mediaWidth && ( ! video || media.readyState >= 2 ) ) {

			const scale = Math.min( w / mediaWidth, h / mediaHeight );
			const dw = mediaWidth * scale, dh = mediaHeight * scale;
			ctx.drawImage( media, ( canvas.width - dw ) / 2, ( canvas.height - dh ) / 2, dw, dh );

		} else if ( settings.grid || ! media ) {

			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = Math.min( w, h ) / 160;
			ctx.beginPath();
			ctx.rect( x, y, w, h );
			for ( let i = 1; i < 8; i ++ ) {
				ctx.moveTo( x + i * w / 8, y );
				ctx.lineTo( x + i * w / 8, y + h );
				ctx.moveTo( x, y + i * h / 8 );
				ctx.lineTo( x + w, y + i * h / 8 );
			}
			ctx.stroke();
			ctx.fillStyle = '#ff4040';
			ctx.fillRect( x, y, w / 8, h / 8 );
			ctx.fillStyle = '#40ff80';
			ctx.fillRect( x + 7 * w / 8, y, w / 8, h / 8 );

		}
		applyProjectionMask( ctx, root.userData.projectionMask, x, y, w, h );
		root.projectorOutput = { canvas, x, y, width: w, height: h };
		texture.needsUpdate = true;

	}

	function configure( next ) {

		const wasPlaying = settings?.playing;
		settings = next;
		light.intensity = Math.max( 0, next.intensity );
		light.distance = Math.max( 0.1, next.range );
		light.decay = next.decay;
		light.castShadow = next.shadows;
		if ( media?.tagName === 'VIDEO' && next.playing !== wasPlaying ) {

			if ( next.playing ) media.play().catch( () => {} );
			else media.pause();

		}
		draw();

	}

	function attach( value ) {

		media = value;
		const ready = () => { draw(); player.requestRender?.(); };
		media.onload = ready;
		media.onloadeddata = ready;
		media.onerror = () => player.reportAssetError?.( 'Projector media could not be loaded.' );

	}

	return {
		attach,
		configure,
		update() {

			if ( ! settings.grid && media?.tagName === 'CANVAS' ) {
				draw();
			} else if ( ! settings.grid && media?.readyState >= 2 && media.currentTime !== lastTime ) {
				lastTime = media.currentTime;
				draw();
			}

		},
		dispose() {

			if ( media ) {
				media.onload = media.onloadeddata = media.onerror = null;
				media.pause?.();
				media.removeAttribute( 'src' );
				media.load?.();
			}
			light.removeFromParent();
			texture.dispose();
			light.dispose();
			delete root.projectorFrame;
			delete root.projectorOutput;

		}
	};

}

export function projectorScript( path, video = false, canvasSource = null ) {

	const source = path && JSON.stringify( 'assets/' + path );
	return {
		name: 'Projector',
		assetBehavior: 'projector',
		enabled: true,
		source: `// Aim the projector by rotating the rig. Its optical axis is local -Z.
// @param throwRatio = 1.2 (0.1..8)
// @label throwRatio = "Throw ratio"
// @param aspect = 0 (0..8)
// @label aspect = "Aspect ratio (0 = auto)"
// @param intensity = 4 (0..500)
// @label intensity = "Intensity"
// @param range = 20 (0.1..200)
// @label range = "Range"
// @param decay = 0 (0..2)
// @label decay = "Distance falloff"
// @param shadows = true
// @label shadows = "Cast shadows"
// @param grid = ${ ! path && ! canvasSource }
// @label grid = "Calibration grid"
${ video ? '// @param playing = true\n// @label playing = "Play video"' : '' }
${ canvasSource?.parameters || '' }
${ projectorOptics.toString() }
${ applyProjectionMask.toString() }
${ projectorRuntime.toString() }
let projector${ canvasSource ? ', feed, current' : '' };
function init() {
 projector = projectorRuntime( THREE, this, player );
 ${ canvasSource ? `feed = (${ canvasSource.create.toString() })( params );
 current = params;
 feed.update( 0, current );
 projector.attach( feed.canvas );` : ! source ? '' : video ? `const media = document.createElement( 'video' );
 media.muted = true;
 media.playsInline = true;
 media.loop = true;
 media.preload = 'auto';
 projector.attach( media );
 media.src = ${ source };` : `const media = new Image();
 projector.attach( media );
 media.src = ${ source };` }
 projector.configure( params );
}
function setParameters( next ) {
 ${ canvasSource ? 'current = next;' : '' }
 projector.configure( next );
 player.requestRender?.();
}
${ canvasSource ? `function update( event ) {
 if ( current.grid ) return;
 feed.update( event.time / 1000, current );
 projector.update();
}` : video ? 'function update() { projector.update(); }' : '' }
function stop() { projector?.dispose(); }
`
	};

}

// Upgrade the generated projector already stored in older projects. Preserve
// parameters and the rest of the attached script.
export function upgradeProjectorScript( script ) {

	if ( script.assetBehavior !== 'projector' || typeof script.source !== 'string' ) return;
	const runtime = 'function projectorRuntime( THREE, root, player )';
	const upload = '\n\t\ttexture.needsUpdate = true;';
	if ( ! script.source.includes( runtime ) || ! script.source.includes( upload ) ) return;
	if ( ! script.source.includes( 'function applyProjectionMask(' ) ) {

		script.source = script.source.replace( runtime, applyProjectionMask.toString() + '\n' + runtime )
			.replace( upload, '\n\t\tapplyProjectionMask( ctx, root.userData.projectionMask, x, y, w, h );' + upload );

	}
	const dispose = 'delete root.projectorFrame;';
	if ( ! script.source.includes( 'root.projectorOutput =' ) && script.source.includes( dispose ) ) {

		script.source = script.source
			.replace( upload, '\n\t\troot.projectorOutput = { canvas, x, y, width: w, height: h };' + upload )
			.replace( dispose, dispose + '\n\t\t\tdelete root.projectorOutput;' );

	}

}
