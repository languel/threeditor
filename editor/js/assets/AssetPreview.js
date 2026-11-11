import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mathScript } from './MathObjects.js';
import { evaluateAssetScript } from './AssetRuntime.js';
import { loadAssetTexture } from './AssetTexture.js';
import { splatFileType } from './SplatObjects.js';

const CANONICAL_POSE = [
	[ 0.50, 0.21 ], // 0 nose
	[ 0.48, 0.18 ], [ 0.47, 0.18 ], [ 0.46, 0.18 ],
	[ 0.52, 0.18 ], [ 0.53, 0.18 ], [ 0.54, 0.18 ],
	[ 0.45, 0.19 ], [ 0.55, 0.19 ],
	[ 0.48, 0.24 ], [ 0.52, 0.24 ],
	[ 0.39, 0.33 ], [ 0.61, 0.33 ], // 11,12 shoulders
	[ 0.31, 0.46 ], [ 0.69, 0.43 ], // 13,14 elbows
	[ 0.25, 0.58 ], [ 0.74, 0.31 ], // 15,16 wrists
	[ 0.23, 0.62 ], [ 0.76, 0.27 ],
	[ 0.24, 0.63 ], [ 0.75, 0.26 ],
	[ 0.26, 0.61 ], [ 0.73, 0.28 ],
	[ 0.43, 0.56 ], [ 0.57, 0.56 ], // 23,24 hips
	[ 0.41, 0.73 ], [ 0.59, 0.73 ], // 25,26 knees
	[ 0.40, 0.89 ], [ 0.60, 0.89 ], // 27,28 ankles
	[ 0.39, 0.91 ], [ 0.61, 0.91 ],
	[ 0.38, 0.93 ], [ 0.62, 0.93 ]
];
const POSE_LINKS = [ [ 11, 12 ], [ 11, 13 ], [ 13, 15 ], [ 12, 14 ], [ 14, 16 ], [ 11, 23 ], [ 12, 24 ], [ 23, 24 ], [ 23, 25 ], [ 25, 27 ], [ 24, 26 ], [ 26, 28 ], [ 27, 31 ], [ 28, 32 ] ];
const HAND_OFFSETS = [
	[ 0, 0 ], [ - 0.02, - 0.01 ], [ - 0.035, - 0.025 ], [ - 0.045, - 0.04 ], [ - 0.052, - 0.055 ],
	[ - 0.01, - 0.03 ], [ - 0.015, - 0.055 ], [ - 0.018, - 0.072 ], [ - 0.02, - 0.086 ],
	[ 0, - 0.032 ], [ 0, - 0.06 ], [ 0, - 0.08 ], [ 0, - 0.095 ],
	[ 0.012, - 0.03 ], [ 0.016, - 0.054 ], [ 0.02, - 0.072 ], [ 0.022, - 0.085 ],
	[ 0.024, - 0.022 ], [ 0.032, - 0.04 ], [ 0.038, - 0.052 ], [ 0.042, - 0.063 ]
];
const HAND_LINKS = Array.from( { length: 5 }, ( _, i ) => { const a = 1 + i * 4; return [ [ 0, a ], [ a, a + 1 ], [ a + 1, a + 2 ], [ a + 2, a + 3 ] ]; } ).flat();

function readInputSettings( id ) {

	try {

		return { flipX: false, flipY: false, rotate: 0, left: 0, top: 0, right: 0, bottom: 0, ...JSON.parse( localStorage.getItem( 'threeditor/inputSettings/' + id ) || '{}' ) };

	} catch {

		return { flipX: false, flipY: false, rotate: 0, left: 0, top: 0, right: 0, bottom: 0 };

	}

}

export function drawTransformedFrame( canvas, frame, settings, targetWidth = 320 ) {

	const w = frame?.videoWidth || frame?.naturalWidth || frame?.width;
	const h = frame?.videoHeight || frame?.naturalHeight || frame?.height;
	if ( ! w || ! h || ( frame.readyState !== undefined && frame.readyState < 2 ) ) return false;
	const t = settings || { flipX: false, flipY: false, rotate: 0, left: 0, top: 0, right: 0, bottom: 0 };
	const quarter = t.rotate === 90 || t.rotate === 270;
	const sx = Math.min( t.left || 0, 0.9 ) * w, sy = Math.min( t.top || 0, 0.9 ) * h;
	const cw = Math.max( 1, w - sx - Math.min( t.right || 0, 0.9 ) * w );
	const ch = Math.max( 1, h - sy - Math.min( t.bottom || 0, 0.9 ) * h );
	const ow = targetWidth, oh = Math.max( 1, Math.round( ow * ( quarter ? cw / ch : ch / cw ) ) );
	if ( canvas.width !== ow || canvas.height !== oh ) { canvas.width = ow; canvas.height = oh; }
	const ctx = canvas.getContext( '2d' );
	if ( ! ctx ) return false;
	const dw = quarter ? oh : ow, dh = quarter ? ow : oh;
	ctx.save();
	ctx.translate( ow / 2, oh / 2 );
	ctx.rotate( ( t.rotate || 0 ) * Math.PI / 180 );
	ctx.scale( t.flipX ? - 1 : 1, t.flipY ? - 1 : 1 );
	ctx.drawImage( frame, sx, sy, cw, ch, - dw / 2, - dh / 2, dw, dh );
	ctx.restore();
	return true;

}

function drawLandmarkGraphic( canvas, isTexture, streams ) {

	const ctx = canvas.getContext( '2d' );
	if ( ! ctx ) return;
	const w = canvas.width, h = canvas.height;
	ctx.fillStyle = '#15171b';
	ctx.fillRect( 0, 0, w, h );

	let ox = 0, oy = 0, sw = w, sh = h;
	if ( isTexture ) {

		const size = Math.round( Math.min( w, h ) * 0.86 );
		ox = Math.round( ( w - size ) / 2 );
		oy = Math.round( ( h - size ) / 2 );
		sw = sh = size;
		ctx.fillStyle = '#000000';
		ctx.fillRect( ox, oy, sw, sh );
		ctx.strokeStyle = '#343840';
		ctx.lineWidth = 1.5;
		ctx.strokeRect( ox + 0.5, oy + 0.5, sw - 1, sh - 1 );

	} else {

		// Subtle 3D floor grid perspective cue for the 3D landmark visualization asset.
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		const horizon = h * 0.72;
		for ( let i = - 3; i <= 3; i ++ ) {

			ctx.moveTo( w / 2 + i * 24, horizon );
			ctx.lineTo( w / 2 + i * 56, h );

		}
		for ( const y of [ 0.76, 0.83, 0.92 ] ) {

			ctx.moveTo( w * 0.14, h * y );
			ctx.lineTo( w * 0.86, h * y );

		}
		ctx.stroke();

	}

	const livePose = streams?.get( 'vision.pose.landmarks' );
	const liveFace = streams?.get( 'vision.face.landmarks' );
	const liveLeftHand = streams?.get( 'vision.leftHand.landmarks' );
	const liveRightHand = streams?.get( 'vision.rightHand.landmarks' );
	const hasLive = Boolean( livePose?.length || liveFace?.length || liveLeftHand?.length || liveRightHand?.length );

	const toXY = p => [ ox + p.x * sw, oy + p.y * sh ];
	const drawSet = ( points, links, radius ) => {

		if ( ! points?.length ) return;
		ctx.strokeStyle = '#00ffff';
		ctx.lineWidth = isTexture ? 1.5 : 1.75;
		ctx.beginPath();
		for ( const [ i, j ] of links ) {

			const a = points[ i ], b = points[ j ];
			if ( ! a || ! b ) continue;
			const [ ax, ay ] = toXY( a ), [ bx, by ] = toXY( b );
			ctx.moveTo( ax, ay );
			ctx.lineTo( bx, by );

		}
		ctx.stroke();
		ctx.fillStyle = '#00ff00';
		ctx.beginPath();
		for ( const p of points ) {

			if ( ! p ) continue;
			const [ x, y ] = toXY( p );
			ctx.moveTo( x + radius, y );
			ctx.arc( x, y, radius, 0, Math.PI * 2 );

		}
		ctx.fill();

	};

	if ( hasLive ) {

		drawSet( livePose, POSE_LINKS, 2.5 );
		drawSet( liveFace, [], 1 );
		drawSet( liveLeftHand, HAND_LINKS, 1.5 );
		drawSet( liveRightHand, HAND_LINKS, 1.5 );
		return;

	}

	const pose = CANONICAL_POSE.map( ( [ x, y ] ) => ( { x, y } ) );
	const faceOval = Array.from( { length: 18 }, ( _, i ) => {

		const a = i / 18 * Math.PI * 2;
		return { x: 0.50 + Math.cos( a ) * 0.048, y: 0.20 + Math.sin( a ) * 0.068 };

	} );
	const faceLinks = faceOval.map( ( _, i ) => [ i, ( i + 1 ) % faceOval.length ] );
	const leftHand = HAND_OFFSETS.map( ( [ dx, dy ] ) => ( { x: 0.25 + dx * 0.7, y: 0.58 - dy * 0.7 } ) );
	const rightHand = HAND_OFFSETS.map( ( [ dx, dy ] ) => ( { x: 0.74 + dx * 0.7, y: 0.31 + dy * 0.7 } ) );

	drawSet( pose, POSE_LINKS, 2.6 );
	drawSet( faceOval, faceLinks, 1.4 );
	drawSet( [ { x: 0.48, y: 0.185 }, { x: 0.52, y: 0.185 }, { x: 0.50, y: 0.21 } ], [], 1.5 );
	drawSet( leftHand, HAND_LINKS, 1.4 );
	drawSet( rightHand, HAND_LINKS, 1.4 );

}

export class AssetPreview {
	constructor( editor, library ) { this.editor = editor; this.library = library; this.disposeCurrent = () => {}; this.revision = 0; }
	clear() { this.revision ++; this.disposeCurrent(); this.disposeCurrent = () => {}; }
	async webcamSnapshot( record ) {
		const activeFrame = this.editor?.getMediaFrame?.( record.id );
		if ( activeFrame ) {
			const canvas = document.createElement( 'canvas' );
			if ( drawTransformedFrame( canvas, activeFrame, null, 240 ) ) return canvas.toDataURL( 'image/webp' );
		}
		if ( ! navigator.mediaDevices?.getUserMedia ) return null;
		let stream;
		const video = document.createElement( 'video' );
		video.muted = true; video.playsInline = true;
		try {
			stream = await navigator.mediaDevices.getUserMedia( { video: record.deviceId ? { deviceId: { exact: record.deviceId } } : true } );
			video.srcObject = stream;
			await video.play();
			if ( ! video.videoWidth || video.readyState < 2 ) {
				await new Promise( ( resolve, reject ) => {
					const timeout = setTimeout( () => reject( new Error( 'Camera frame timed out.' ) ), 4000 );
					video.onloadeddata = () => { clearTimeout( timeout ); resolve(); };
					video.onerror = () => { clearTimeout( timeout ); reject( new Error( 'Camera stream error.' ) ); };
				} );
			}
			// Give camera auto-exposure a brief moment to settle so the single frame is not black.
			const canvas = document.createElement( 'canvas' );
			for ( let attempt = 0; attempt < 4; attempt ++ ) {
				await new Promise( r => setTimeout( r, attempt === 0 ? 250 : 150 ) );
				if ( ! drawTransformedFrame( canvas, video, readInputSettings( record.id ), 240 ) ) continue;
				const data = canvas.getContext( '2d' )?.getImageData( 0, 0, canvas.width, canvas.height ).data;
				if ( ! data ) break;
				let sum = 0;
				for ( let i = 0; i < data.length; i += 64 ) sum += data[ i ] + data[ i + 1 ] + data[ i + 2 ];
				if ( sum / ( data.length / 64 * 3 ) > 24 ) break;
			}
			return canvas.width ? canvas.toDataURL( 'image/webp' ) : null;
		} catch {
			return null;
		} finally {
			stream?.getTracks().forEach( track => track.stop() );
			video.srcObject = null;
		}
	}
	async thumbnail( record ) {
		if ( record.kind === 'video' || record.file?.type.startsWith( 'video/' ) ) {
			const video = document.createElement( 'video' ), url = record.file ? URL.createObjectURL( record.file ) : record.url;
			video.preload = 'auto'; video.muted = true; video.src = url;
			try {
				await new Promise( ( resolve, reject ) => { const timeout = setTimeout( () => reject( new Error( 'Video thumbnail timed out.' ) ), 15000 ); video.onloadeddata = () => { clearTimeout( timeout ); resolve(); }; video.onerror = () => { clearTimeout( timeout ); reject( new Error( 'Video cannot be decoded.' ) ); }; } );
				const canvas = document.createElement( 'canvas' ); canvas.width = 240; canvas.height = Math.max( 1, Math.round( 240 * video.videoHeight / video.videoWidth ) ); canvas.getContext( '2d' ).drawImage( video, 0, 0, canvas.width, canvas.height );
				return canvas.toDataURL( 'image/webp' );
			} finally { video.removeAttribute( 'src' ); video.load(); if ( record.file ) URL.revokeObjectURL( url ); }
		}
		if ( record.kind === 'webcam' ) {
			return ( await this.webcamSnapshot( record ) ) || this.placeholder( 'webcam' );
		}
		const source = record.texture?.image;
		if ( source && ! record.texture.image.src ) {
			const width = source.videoWidth || source.naturalWidth || source.width, height = source.videoHeight || source.naturalHeight || source.height;
			if ( width && height ) {
				const canvas = document.createElement( 'canvas' ); canvas.width = 240; canvas.height = Math.max( 1, Math.round( 240 * height / width ) );
				try { const ctx = canvas.getContext( '2d' ); if ( ctx ) { ctx.drawImage( source, 0, 0, canvas.width, canvas.height ); return canvas.toDataURL( 'image/webp' ); } } catch { /* tainted or unreadable source */ }
			}
		}
		if ( [ 'audio', 'microphone' ].includes( record.kind ) ) return this.placeholder( record.kind );
		const host = document.createElement( 'div' );
		let thumbnail;
		this.onThumbnail = ( record, image ) => { thumbnail = image; };
		try { await this.show( record, host ); return thumbnail; } finally { this.clear(); this.onThumbnail = null; }
	}

	placeholder( kind ) {
		const canvas = document.createElement( 'canvas' ); canvas.width = 240; canvas.height = 180; const ctx = canvas.getContext( '2d' ); if ( ! ctx ) return undefined;
		ctx.fillStyle = '#1a1c20'; ctx.fillRect( 0, 0, 240, 180 ); ctx.fillStyle = '#6ce5ff';
		if ( kind === 'webcam' ) { ctx.fillRect( 80, 60, 80, 60 ); ctx.beginPath(); ctx.arc( 120, 90, 14, 0, Math.PI * 2 ); ctx.fillStyle = '#1a1c20'; ctx.fill(); }
		else for ( let i = 0; i < 24; i ++ ) { const h = 14 + Math.abs( Math.sin( i * 0.7 ) ) * 80; ctx.fillRect( 24 + i * 8.5, 90 - h / 2, 5, h ); }
		return canvas.toDataURL( 'image/webp' );
	}

	async show( record, host ) {
		this.clear(); const revision = this.revision, disposers = [], urls = [];
		let dead = false;
		this.disposeCurrent = () => { dead = true; for ( const dispose of disposers ) dispose(); for ( const url of urls ) URL.revokeObjectURL( url ); };
		const ownURL = file => { const url = URL.createObjectURL( file ); urls.push( url ); return url; };
		const url = record.file ? ownURL( record.file ) : record.url;
		const message = document.createElement( 'span' ); message.textContent = 'Loading preview…'; host.append( message );
		try {
			if ( record.kind === 'video' || record.file?.type.startsWith( 'video/' ) || record.kind === 'animation' && record.abs?.video ) {
				const video = document.createElement( 'video' ); video.controls = true; video.loop = true; video.muted = true; video.playsInline = true; video.preload = 'metadata';
				video.poster = record.abs?.poster || record.preview || ''; video.src = record.file ? url : record.kind === 'animation' ? record.abs.video : url;
				video.setAttribute( 'aria-label', record.title + ' video preview' ); host.replaceChildren( video );
				disposers.push( () => { video.pause(); video.removeAttribute( 'src' ); video.load(); } );
				return;
			}
			if ( record.kind === 'audio' ) {
				const audio = document.createElement( 'audio' ); audio.controls = true; audio.preload = 'metadata'; audio.src = url; audio.setAttribute( 'aria-label', record.title + ' audio preview' ); host.replaceChildren( audio );
				disposers.push( () => { audio.pause(); audio.removeAttribute( 'src' ); audio.load(); } ); return;
			}
			if ( [ 'texture', 'image', 'animation' ].includes( record.kind ) && ( record.texture?.image?.src || /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test( record.file?.name || url || '' ) ) ) {
				const image = document.createElement( 'img' ); image.alt = record.title; image.src = record.texture?.image?.src || url; host.replaceChildren( image ); return;
			}
			if ( [ 'landmark', 'landmark-texture' ].includes( record.kind ) ) {
				const isTexture = record.kind === 'landmark-texture';
				const canvas = document.createElement( 'canvas' ); canvas.width = 260; canvas.height = 210;
				drawLandmarkGraphic( canvas, isTexture, this.editor?.streams );
				host.replaceChildren( canvas );
				this.onThumbnail?.( record, canvas.toDataURL( 'image/webp' ) );
				if ( host.isConnected && this.editor?.streams ) {
					let raf = 0;
					const tick = () => {
						if ( dead || ! canvas.isConnected ) return;
						drawLandmarkGraphic( canvas, isTexture, this.editor.streams );
						raf = requestAnimationFrame( tick );
					};
					raf = requestAnimationFrame( tick );
					disposers.push( () => cancelAnimationFrame( raf ) );
				}
				return;
			}
		if ( ! [ 'model', 'sdf', 'splat', 'texture' ].includes( record.kind ) ) { message.textContent = 'No visual preview for this file type.'; return; }
			const renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
			renderer.setPixelRatio( Math.min( devicePixelRatio, 2 ) ); renderer.setSize( Math.max( host.clientWidth, 260 ), 210 );
			disposers.push( () => { renderer.setAnimationLoop( null ); renderer.dispose(); renderer.forceContextLoss(); } );
			const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera( 40, Math.max( host.clientWidth, 260 ) / 210, 0.01, 10000 );
			scene.add( new THREE.HemisphereLight( 0xffffff, 0x334466, 3 ) ); const light = new THREE.DirectionalLight( 0xffffff, 3 ); light.position.set( 4, 5, 6 ); scene.add( light );
			let object, clips = [];
			let splatRenderer;
			if ( record.kind === 'model' ) {
				if ( dead ) return;
				const manager = new THREE.LoadingManager();
				if ( record.file ) {
					const files = new Map( ( await this.library.all() ).filter( r => r.batch === record.batch && r.file ).map( r => [ r.path || r.file.name, r.file ] ) );
					if ( record.projectPath ) for ( const path of this.editor.sourceFiles.get( record.projectPath )?.batch || [] ) files.set( path, this.editor.sourceFiles.get( path ).file );
					manager.setURLModifier( value => { if ( /^(blob:|data:)/.test( value ) ) return value; const key = decodeURIComponent( new URL( value, 'https://preview.invalid/' ).pathname.slice( 1 ) ); return files.has( key ) ? ownURL( files.get( key ) ) : value; } );
				}
				const draco = new DRACOLoader().setDecoderPath( '../examples/jsm/libs/draco/gltf/' );
				const ktx = new KTX2Loader().setTranscoderPath( '../examples/jsm/libs/basis/' ).detectSupport( renderer );
				disposers.push( () => { draco.dispose(); ktx.dispose(); } );
				const loader = new GLTFLoader( manager ).setDRACOLoader( draco ).setKTX2Loader( ktx ).setMeshoptDecoder( MeshoptDecoder );
				if ( record.file && /\.gl(tf|b)$/i.test( record.file.name ) ) {
					const base = new URL( '.', 'https://preview.invalid/' + ( record.projectPath || record.path || record.file.name ) ).href;
					const result = await loader.parseAsync( await record.file.arrayBuffer(), base ); object = result.scene; clips = result.animations;
				} else if ( /\.gl(tf|b)(?:[?#]|$)/i.test( url ) ) { const result = await loader.loadAsync( url ); object = result.scene; clips = result.animations; }
				else { message.textContent = 'Interactive previews currently support GLB and glTF models.'; return; }
				const remove = []; object.traverse( child => { if ( child.isCamera || child.isLight ) remove.push( child ); } ); remove.forEach( node => node.removeFromParent() );
			} else if ( record.kind === 'sdf' ) {
				const response = record.file || await fetch( url ).then( r => { if ( ! r.ok ) throw new Error( 'SDF request failed.' ); return r; } );
				const definition = JSON.parse( await response.text() );
				object = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshNormalMaterial() );
				const runtime = evaluateAssetScript( object, mathScript( definition ), {}, scene, camera ); runtime.init.call( object );
			} else if ( record.kind === 'splat' ) {
				const { SplatMesh, GaussianSplatRenderer } = await import( 'gaussian-splat-lite' );
				splatRenderer = new GaussianSplatRenderer( { renderer } );
				scene.add( splatRenderer );
				object = new SplatMesh( record.file ? { file: record.file, fileType: splatFileType( record.file.name ) } : { url, fileType: splatFileType( url ) } );
				disposers.push( () => { splatRenderer.dispose(); object.dispose(); } );
				await object.initialized;
			} else {
				const texture = record.texture || await loadAssetTexture( this.editor, record.file || await this.editor.assetBrowser.fetchFile( url ), record.projectPath || '__preview__' );
				object = new THREE.Mesh( new THREE.PlaneGeometry( 2 * texture.image.width / texture.image.height, 2 ), new THREE.MeshBasicMaterial( { map: texture, side: THREE.DoubleSide } ) );
			}
			disposers.push( () => object?.traverse( node => { node.geometry?.dispose(); for ( const material of [ node.material ].flat() ) { if ( ! material ) continue; for ( const value of Object.values( material ) ) if ( value?.isTexture && value !== record.texture ) value.dispose(); material.dispose(); } } ) );
			if ( dead || revision !== this.revision ) { disposers.at( -1 )(); return; }
			scene.add( object ); object.updateMatrixWorld( true );
			const box = record.kind === 'splat' ? object.getBoundingBox( true, new THREE.Box3() ) : new THREE.Box3().setFromObject( object );
			const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter( new THREE.Vector3() );
			const radius = Math.max( box.isEmpty() ? 1 : box.getSize( new THREE.Vector3() ).length() / 2, 0.1 );
			camera.position.copy( center ).add( new THREE.Vector3( 1, 0.65, 1.5 ).normalize().multiplyScalar( radius * 3.2 ) ); camera.far = radius * 30; camera.updateProjectionMatrix();
			const controls = new OrbitControls( camera, renderer.domElement ); controls.target.copy( center ); controls.update(); disposers.push( () => controls.dispose() );
			host.replaceChildren( renderer.domElement );
			if ( record.kind === 'splat' ) {
				const label = document.createElement( 'small' ); label.textContent = 'Gaussian Splat preview (gaussian-splat-lite)'; host.append( label );
				await splatRenderer.update( { scene, camera } );
			}
			const mixer = new THREE.AnimationMixer( object );
			if ( clips.length ) {
				const select = document.createElement( 'select' ); select.setAttribute( 'aria-label', 'Preview animation' );
				select.add( new Option( 'Rest pose', '' ) ); for ( const clip of clips ) select.add( new Option( clip.name, clip.uuid ) );
				select.onchange = () => { mixer.stopAllAction(); const clip = clips.find( c => c.uuid === select.value ); if ( clip ) mixer.clipAction( clip ).play(); };
				host.append( select ); disposers.push( () => { mixer.stopAllAction(); mixer.uncacheRoot( object ); } );
			}
			renderer.render( scene, camera );
			this.onThumbnail?.( record, renderer.domElement.toDataURL( 'image/webp' ) );
			let previous = performance.now(); renderer.setAnimationLoop( now => { if ( ! host.isConnected || ! host.getClientRects().length ) return; mixer.update( Math.min( ( now - previous ) / 1000, 0.1 ) ); previous = now; controls.update(); renderer.render( scene, camera ); } );
		} catch ( error ) { if ( ! dead ) { host.replaceChildren(); const text = document.createElement( 'span' ); text.textContent = 'Preview unavailable: ' + error.message; host.append( text ); } }
	}
}
