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

export function mediaScript( path, type = 'video' ) {
	return { name: type === 'audio' ? 'Audio playback' : 'Video plane playback', assetBehavior: 'media', enabled: true, source: `// Editable media behavior. Original bytes are packaged with the project.\n// @param playing = true\n// @param loop = true\n// @param muted = ${ type !== 'audio' }\n// @param volume = 1 (0..1)\n// @param startTime = 0 (0..86400)\n// @param showControls = true\n// @param speed = 1 (0.1..3)\nvar media, texture, previousRender, controls;\nfunction init() {\n media = document.createElement(${ JSON.stringify( type ) }); this.assetMedia=media;\n media.crossOrigin = 'anonymous'; media.playsInline = true;\n media.loop = params.loop; media.muted = params.muted; media.volume = params.volume; media.playbackRate = params.speed;\n media.src = ${ JSON.stringify( 'assets/' + path ) };
 ${ type === 'audio' ? "media.controls=true; media.style.cssText='position:absolute;bottom:12px;right:12px;z-index:5'; player.dom.append(media);" : '' }\n ${ type === 'video' ? `const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=Math.max(1,Math.round(512*(this.userData.assetObject.height||1)/(this.userData.assetObject.width||1)));\n if(this.material.map?.image?.width) canvas.getContext('2d').drawImage(this.material.map.image,0,0,canvas.width,canvas.height);\n texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;\n this.material.map?.dispose(); this.material.map=texture; this.material.needsUpdate=true;\n previousRender = this.onBeforeRender;\n this.onBeforeRender = function() { if(media.readyState >= 2) { canvas.getContext('2d').drawImage(media,0,0,canvas.width,canvas.height);texture.needsUpdate=true; } };` : '' }\n if(params.showControls && ${ JSON.stringify( type !== 'audio' ) }) controls=(${ mediaControls.toString() })(media,this,player,params);\n if(params.playing) media.play().catch(()=>{});\n}\nfunction stop() { this.assetMedia=null; controls?.remove(); media?.pause(); if(media) { media.removeAttribute('src'); media.load(); media.remove(); } ${ type === 'video' ? 'this.onBeforeRender = previousRender || function(){}; ' : '' } }\n` };
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
