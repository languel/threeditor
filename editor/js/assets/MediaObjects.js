import * as THREE from 'three';
import { loadAssetTexture } from './AssetTexture.js';

function mediaControls( media, root, player, params ) {
	const panel = document.createElement( 'div' ); panel.className = 'asset-engine-controls'; panel.dataset.assetObject = root.uuid;
	panel.style.cssText = 'position:absolute;left:12px;bottom:12px;z-index:5;display:flex;gap:8px;align-items:center;padding:8px;border-radius:6px;background:#17191de8;color:white;font:12px sans-serif';
	panel.setAttribute( 'aria-label', root.name + ' playback controls' );
	panel.addEventListener( 'pointerdown', event => event.stopPropagation() ); panel.addEventListener( 'keydown', event => event.stopPropagation() );
	const play = document.createElement( 'button' ); play.textContent = params.playing ? 'Pause' : 'Play';
	play.onclick = () => { params.playing = media.paused; if(params.playing)media.play().catch(()=>{});else media.pause();play.textContent=media.paused?'Play':'Pause'; player.assetParameterChanged?.( root, 'playing', params.playing ); };
	play.setAttribute('aria-label',root.name+' play/pause'); media.addEventListener('play',()=>{play.textContent='Pause';}); media.addEventListener('pause',()=>{play.textContent='Play';}); panel.append( play );
	const seek = document.createElement( 'input' ); seek.type = 'range'; seek.min = 0; seek.max = 1; seek.step = 0.001; seek.value = 0; seek.setAttribute( 'aria-label', root.name + ' playback position' );
	seek.oninput = () => { if(Number.isFinite(media.duration)) { media.currentTime=Number(seek.value)*media.duration;player.assetParameterChanged?.(root,'startTime',media.currentTime); } };
	media.addEventListener( 'timeupdate', () => { if(Number.isFinite(media.duration))seek.value=media.currentTime/media.duration; } );
	media.addEventListener( 'loadedmetadata', () => { if(params.startTime)media.currentTime=Math.min(params.startTime,media.duration||0); } );
	panel.append( seek );
	const mute = document.createElement( 'button' ); mute.textContent = params.muted ? 'Unmute' : 'Mute';
	mute.onclick = () => { media.muted=!media.muted;params.muted=media.muted;mute.textContent=media.muted?'Unmute':'Mute';player.assetParameterChanged?.(root,'muted',media.muted); }; panel.append( mute );
	player.dom.append( panel ); return panel;
}

function legacyMediaScript( path, type = 'video' ) {
	return { name: type === 'audio' ? 'Audio playback' : 'Video plane playback', assetBehavior: 'media', enabled: true, source: `// Editable media behavior. Original bytes are packaged with the project.\n// @param playing = true\n// @param loop = true\n// @param muted = ${ type !== 'audio' }\n// @param volume = 1 (0..1)\n// @param startTime = 0 (0..86400)\n// @param showControls = true\n// @param speed = 1 (0.1..3)\nvar media, texture, previousRender, controls;\nfunction init() {\n media = document.createElement(${ JSON.stringify( type ) }); this.assetMedia=media;\n media.crossOrigin = 'anonymous'; media.playsInline = true;\n media.loop = params.loop; media.muted = params.muted; media.volume = params.volume; media.playbackRate = params.speed;\n media.src = ${ JSON.stringify( 'assets/' + path ) };
 ${ type === 'audio' ? "media.controls=true; media.style.cssText='position:absolute;bottom:12px;right:12px;z-index:5'; player.dom.append(media);" : '' }\n ${ type === 'video' ? `const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=Math.max(1,Math.round(512*(this.userData.assetObject.height||1)/(this.userData.assetObject.width||1)));\n if(this.material.map?.image?.width) canvas.getContext('2d').drawImage(this.material.map.image,0,0,canvas.width,canvas.height);\n texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;\n this.material.map?.dispose(); this.material.map=texture; this.material.needsUpdate=true;\n previousRender = this.onBeforeRender;\n this.onBeforeRender = function() { if(media.readyState >= 2) { canvas.getContext('2d').drawImage(media,0,0,canvas.width,canvas.height);texture.needsUpdate=true; } };` : '' }\n if(params.showControls && ${ JSON.stringify( type !== 'audio' ) }) controls=(${ mediaControls.toString() })(media,this,player,params);\n if(params.playing) media.play().catch(()=>{});\n}\nfunction stop() { this.assetMedia=null; controls?.remove(); media?.pause(); if(media) { media.removeAttribute('src'); media.load(); media.remove(); } ${ type === 'video' ? 'this.onBeforeRender = previousRender || function(){}; ' : '' } }\n` };
}

export function mediaScript( path, type = 'video', plane = type === 'video', expose = true ) {

	const audio = type === 'audio';
	return {
		name: audio ? 'Audio playback' : 'Video plane playback',
		assetBehavior: 'media', enabled: true,
		source: `// Editable media playback.
 // @param playing = true
 // @label playing = "Playing"
 // @param loop = true
 // @label loop = "Loop"
 // @param muted = ${ ! audio }
 // @label muted = "Mute"
 // @param volume = 1 (0..1)
 // @label volume = "Volume"
 // @slider volume
 // @param startTime = 0 (0..86400)
 // @label startTime = "Seek (s)"
 // @param speed = 1 (0.1..3)
 // @label speed = "Speed"
 // @slider speed
let media, previousRender, current;
function seek() {
 if (Number.isFinite(media.duration)) media.currentTime = Math.max(0, Math.min(current.startTime, media.duration));
}
function setParameters(next) {
 const seekChanged = next.startTime !== current?.startTime;
 const playChanged = next.playing !== current?.playing;
 current = next;
 media.loop = next.loop;
 media.muted = next.muted;
 media.volume = Math.max(0, Math.min(next.volume, 1));
 media.playbackRate = Math.max(0.0625, Math.min(next.speed, 16));
 if (seekChanged) seek();
 if (playChanged) {
  if (next.playing) media.play().catch(() => {});
  else media.pause();
 }
}
function init() {
 media = document.createElement(${ JSON.stringify( type ) });
 ${ expose ? 'this.assetMedia = media;' : '' }
 media.crossOrigin = 'anonymous';
 media.playsInline = true;
 media.addEventListener('loadedmetadata', seek);
 media.src = ${ JSON.stringify( 'assets/' + path ) };
 ${ ! plane ? '' : `const canvas = document.createElement('canvas');
 canvas.width = 512;
 canvas.height = Math.max(1, Math.round(512 * this.userData.assetObject.height / this.userData.assetObject.width));
 const ctx = canvas.getContext('2d');
 if (this.material.map?.image?.width) ctx.drawImage(this.material.map.image, 0, 0, canvas.width, canvas.height);
 const texture = new THREE.CanvasTexture(canvas);
 texture.colorSpace = THREE.SRGBColorSpace;
 this.material.map?.dispose();
 this.material.map = texture;
 this.material.needsUpdate = true;
 previousRender = this.onBeforeRender;
 this.onBeforeRender = function () {
  if (media.readyState >= 2) {
   ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
   texture.needsUpdate = true;
  }
 };` }
 setParameters(params);
}
function stop() {
 ${ expose ? 'this.assetMedia = null;' : '' }
 media.removeEventListener('loadedmetadata', seek);
 media.pause();
 media.removeAttribute('src');
 media.load();
 ${ plane ? 'this.onBeforeRender = previousRender;' : '' }
}
`
	};

}

export function upgradeMediaScript( script, asset ) {

	if ( script.assetBehavior !== 'media' || ! asset?.path ) return;
	if ( script.source !== legacyMediaScript( asset.path, asset.type ).source ) return;
	script.source = mediaScript( asset.path, asset.type ).source;

}

export async function mediaPlane( editor, entry ) {
	const { file, path, record } = entry;
	const video = record.kind === 'video' || file?.type.startsWith( 'video/' ) || /\.(webm|mp4|mov)$/i.test( file?.name || '' );
	let width, height, texture;
	if ( video ) {
		const element = document.createElement( 'video' ), url = URL.createObjectURL( file );
		element.muted = true; element.preload = 'auto'; element.src = url;
		try {
			await new Promise( ( resolve, reject ) => {
				const timer = setTimeout( () => reject( new Error( 'Video decoding timed out.' ) ), 15000 );
				element.onloadeddata = () => { clearTimeout( timer ); resolve(); };
				element.onerror = () => { clearTimeout( timer ); reject( new Error( 'This video codec is not supported by the browser.' ) ); };
			} );
			width = element.videoWidth; height = element.videoHeight;
			const canvas = document.createElement( 'canvas' ); canvas.width = 512; canvas.height = Math.max( 1, Math.round( 512 * height / width ) );
			canvas.getContext( '2d' ).drawImage( element, 0, 0, canvas.width, canvas.height );
			texture = new THREE.CanvasTexture( canvas );
		} finally { element.removeAttribute( 'src' ); element.load(); URL.revokeObjectURL( url ); }
	} else {
		texture = entry.texture ? entry.texture.clone() : await loadAssetTexture( editor, file, path ); width = texture.image.width; height = texture.image.height;
	}
	texture.colorSpace = THREE.SRGBColorSpace;
	const aspect = width / height || 1;
	const mesh = new THREE.Mesh( new THREE.PlaneGeometry( 2 * aspect, 2 ), new THREE.MeshBasicMaterial( { map: texture, side: THREE.DoubleSide, transparent: ! video, toneMapped: false } ) );
	mesh.userData.assetObject = { type: video ? 'video' : 'image', path, width, height };
	return { object: mesh, script: video ? mediaScript( path ) : null };
}

// Binding IDs live on the texture so replacing or undoing a map disables the
// old driver without overwriting the replacement.
export function movingTextureScript( entry, binding, slot, map ) {

	const webcam = entry.record.kind === 'webcam';
	const movie = webcam ? '' : mediaScript( entry.path, 'video', false, false ).source;
	return {
		name: ( webcam ? 'Webcam' : 'Movie' ) + ' · ' + map,
		assetBehavior: 'media', enabled: true,
		source: movie + `
let surfaceCanvas, lastFrame = -1${ webcam ? '' : ', wasBound = true' };
function update() {
 const material = Array.isArray(this.material) ? this.material[${ slot }] : this.material;
 const texture = material?.[${ JSON.stringify( map ) }];
 const video = ${ webcam ? `player.streams?.get(${ JSON.stringify( 'input.' + entry.record.id + '.video.frame' ) })` : 'media' };
 const bound = texture?.userData.mediaBinding === ${ JSON.stringify( binding ) };
 ${ webcam ? '' : `if (bound !== wasBound) {
  wasBound = bound;
  if (!bound) media.pause();
  else if (current.playing) media.play().catch(() => {});
 }` }
 const vw = video?.videoWidth || video?.width, vh = video?.videoHeight || video?.height;
 if (!bound || !video || (video.readyState !== undefined && video.readyState < 2) || !vw) return;
 if (surfaceCanvas !== texture.image || !surfaceCanvas?.getContext) {
  const previous = texture.image;
  surfaceCanvas = previous?.getContext ? previous : document.createElement('canvas');
  if (surfaceCanvas !== previous) {
   surfaceCanvas.width = previous?.width || 512;
   surfaceCanvas.height = previous?.height || Math.max(1, Math.round(512 * vh / vw));
  }
  texture.image = surfaceCanvas;
  lastFrame = -1;
 }
 if (video.currentTime !== undefined) { if (lastFrame === video.currentTime) return; lastFrame = video.currentTime; }
 if (surfaceCanvas.height !== Math.max(1, Math.round(surfaceCanvas.width * vh / vw))) surfaceCanvas.height = Math.max(1, Math.round(surfaceCanvas.width * vh / vw));
 const ctx = surfaceCanvas.getContext('2d');
 if (ctx) ctx.drawImage(video, 0, 0, surfaceCanvas.width, surfaceCanvas.height);
 texture.needsUpdate = true;
}
`
	};

}

export function webcamPlane( entry ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 512;
	canvas.height = 288;
	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	const binding = texture.userData.mediaBinding = crypto.randomUUID();
	const object = new THREE.Mesh( new THREE.PlaneGeometry( 32 / 9, 2 ), new THREE.MeshBasicMaterial( { map: texture, side: THREE.DoubleSide, toneMapped: false } ) );
	return { object, script: movingTextureScript( entry, binding, 0, 'map' ) };

}
