import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mathScript } from './MathObjects.js';
import { evaluateAssetScript } from './AssetRuntime.js';
import { loadAssetTexture } from './AssetTexture.js';

export class AssetPreview {
	constructor( editor, library ) { this.editor = editor; this.library = library; this.disposeCurrent = () => {}; this.revision = 0; }
	clear() { this.revision ++; this.disposeCurrent(); this.disposeCurrent = () => {}; }
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
		const host = document.createElement( 'div' );
		let thumbnail;
		this.onThumbnail = ( record, image ) => { thumbnail = image; };
		try { await this.show( record, host ); return thumbnail; } finally { this.clear(); this.onThumbnail = null; }
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
			if ( ! [ 'model', 'sdf', 'splat', 'texture' ].includes( record.kind ) ) { message.textContent = 'No visual preview for this file type.'; return; }
			const renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
			renderer.setPixelRatio( Math.min( devicePixelRatio, 2 ) ); renderer.setSize( Math.max( host.clientWidth, 260 ), 210 );
			disposers.push( () => { renderer.setAnimationLoop( null ); renderer.dispose(); renderer.forceContextLoss(); } );
			const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera( 40, Math.max( host.clientWidth, 260 ) / 210, 0.01, 10000 );
			scene.add( new THREE.HemisphereLight( 0xffffff, 0x334466, 3 ) ); const light = new THREE.DirectionalLight( 0xffffff, 3 ); light.position.set( 4, 5, 6 ); scene.add( light );
			let object, clips = [];
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
				const { SPZLoader } = await import( 'three/addons/loaders/SPZLoader.js' );
				const geometry = record.file ? await new SPZLoader().parse( await record.file.arrayBuffer() ) : await new SPZLoader().loadAsync( url );
				object = new THREE.Points( geometry, new THREE.PointsMaterial( { size: 0.025, vertexColors: true } ) );
				const note = document.createElement( 'small' ); note.textContent = 'Point-cloud preview of Gaussian splat data'; host.append( note );
			} else {
				const texture = record.texture || await loadAssetTexture( this.editor, record.file || await this.editor.assetBrowser.fetchFile( url ), record.projectPath || '__preview__' );
				object = new THREE.Mesh( new THREE.PlaneGeometry( 2 * texture.image.width / texture.image.height, 2 ), new THREE.MeshBasicMaterial( { map: texture, side: THREE.DoubleSide } ) );
			}
			disposers.push( () => object?.traverse( node => { node.geometry?.dispose(); for ( const material of [ node.material ].flat() ) { if ( ! material ) continue; for ( const value of Object.values( material ) ) if ( value?.isTexture && value !== record.texture ) value.dispose(); material.dispose(); } } ) );
			if ( dead || revision !== this.revision ) { disposers.at( -1 )(); return; }
			scene.add( object ); object.updateMatrixWorld( true );
			const box = new THREE.Box3().setFromObject( object ), center = box.getCenter( new THREE.Vector3() ), radius = Math.max( box.getSize( new THREE.Vector3() ).length() / 2, 0.1 );
			camera.position.copy( center ).add( new THREE.Vector3( 1, 0.65, 1.5 ).normalize().multiplyScalar( radius * 3.2 ) ); camera.far = radius * 30; camera.updateProjectionMatrix();
			const controls = new OrbitControls( camera, renderer.domElement ); controls.target.copy( center ); controls.update(); disposers.push( () => controls.dispose() );
			host.replaceChildren( renderer.domElement );
			if ( record.kind === 'splat' ) { const label = document.createElement( 'small' ); label.textContent = 'Point-cloud preview of Gaussian splat data'; host.append( label ); }
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
