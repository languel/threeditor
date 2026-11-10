import { poseScript } from '../streams/PoseDriver.js';
import * as THREE from 'three';
import { storeSourceFiles, isImageAsset, isImportAsset, isTextureAsset } from '../ProjectAssets.js';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { AddScriptCommand } from '../commands/AddScriptCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { mathDefinition, mathScript } from './MathObjects.js';
import { modelScript } from './ModelBehavior.js';
import { mediaPlane, mediaScript, movingTextureScript, webcamPlane } from './MediaObjects.js';
import { landmarkScript, landmarkTextureScript } from './LandmarkObjects.js';
import { AssetRuntime, evaluateAssetScript } from './AssetRuntime.js';
import { ASSET_MIME } from './AssetLibrary.js';
import { loadAssetTexture } from './AssetTexture.js';
import { SetMaterialMapCommand } from '../commands/SetMaterialMapCommand.js';
import { gltfDocument, gltfResourceURIs } from './GLTFAssets.js';
import { chooseTextureMap } from './TextureMapPicker.js';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';

export const isMovingAsset = record => [ 'video', 'webcam' ].includes( record.kind ) || ( record.kind === 'animation' && !! ( record.abs?.video || /\.(mp4|webm|mov)(?:$|[?#])/i.test( record.url || record.file?.name || '' ) ) );
export const isMapAsset = record => isMovingAsset( record ) || [ 'image', 'texture', 'animation' ].includes( record.kind );
export const isStillInput = record => [ 'image', 'texture' ].includes( record.kind ) && ( ! record.file || isImageAsset( record.file ) );
export const isInputAsset = record => isMovingAsset( record ) || isStillInput( record ) || [ 'audio', 'microphone' ].includes( record.kind );

export class AssetController {
	constructor( editor, library ) {
		this.epoch = 0; this.editor = editor; this.library = library; this.records = new Map(); this.paths = new Map(); this.pending = new Map(); this.runtime = new AssetRuntime( editor );
		editor.signals.editorCleared.add( () => { this.epoch ++; this.paths.clear(); } );
		editor.signals.projectLoaded.add( () => { this.epoch ++; this.paths.clear(); } );
	}
	async run( action ) {
		this.status?.( 'Loading…' );
		try { const result = await action(); this.status?.( 'Ready' ); return result; }
		catch ( error ) { console.error( error ); this.status?.( error.message, true ); this.reveal?.(); }
	}
	async record( id ) {
		const record = this.records.get( id ) || await this.library.get( id );
		if ( ! record ) throw new Error( 'Asset no longer exists.' );
		return record;
	}
	async fetchFile( url, name ) {
		const response = await fetch( url );
		if ( ! response.ok ) throw new Error( `Asset request failed (${ response.status }): ${ url }` );
		return new File( [ await response.blob() ], name || decodeURIComponent( new URL( url ).pathname.split( '/' ).pop() ), { type: response.headers.get( 'content-type' ) || '' } );
	}
	materialize( id ) {
		if ( ! this.pending.has( id ) ) {
			this.pending.set( id, this.prepare( id ).finally( () => this.pending.delete( id ) ) );
		}
		return this.pending.get( id );
	}
	async filesFor( record ) {
		const { editor } = this;
		const projectEntry = record.projectPath && editor.sourceFiles.get( record.projectPath );
		const file = projectEntry?.file || record.file || await this.fetchFile( record.url );
		const fileMap = Object.create( null );
		if ( projectEntry ) {
			for ( const path of projectEntry.batch || [ record.projectPath ] ) {
				const entry = editor.sourceFiles.get( path );
				if ( ! entry?.file ) throw new Error( 'Missing project companion file: ' + path );
				fileMap[ path ] = entry.file;
			}
		} else if ( record.batch ) for ( const sibling of await this.library.all() ) {
			if ( sibling.batch === record.batch && sibling.file ) fileMap[ sibling.path || sibling.file.name ] = sibling.file;
		}
		const key = record.projectPath || record.path || file.name;
		fileMap[ key ] = file;
		if ( /\.(gltf|glb|vrm)$/i.test( file.name ) ) {
			const gltf = await gltfDocument( file );
			const base = record.url && new URL( '.', record.url );
			const dir = key.slice( 0, key.lastIndexOf( '/' ) + 1 );
			for ( const uri of gltfResourceURIs( gltf ) ) {
				const resolved = new URL( uri, new URL( key, 'https://assets.invalid/' ) );
				const dependencyKey = decodeURIComponent( resolved.pathname.slice( 1 ) );
				if ( fileMap[ dependencyKey ] ) continue;
				if ( ! base ) throw new Error( 'Missing companion file: ' + dir + uri + '. Import the model folder together.' );
				const url = new URL( uri, base );
				if ( ! [ 'https:', 'http:' ].includes( url.protocol ) ) throw new Error( 'Unsupported dependency URL.' );
				fileMap[ dependencyKey ] = await this.fetchFile( url.href );
			}
		}
		return { file, fileMap, key };
	}
	async prepare( id ) {
		const { editor, epoch } = this;
		const record = await this.record( id );
		if ( [ 'webcam', 'microphone', 'landmark', 'landmark-texture' ].includes( record.kind ) ) return { record };
		if ( record.projectPath && editor.sourceFiles.has( record.projectPath ) ) return { ...editor.sourceFiles.get( record.projectPath ), path: record.projectPath, record };
		if ( record.texture ) return { texture: record.texture, path: record.texture.userData.sourceAssetPath, record };
		const oldPath = this.paths.get( id ) || [ ...( editor.sourceFiles || [] ) ].find( ( [ , entry ] ) => entry.asset?.id === id )?.[ 0 ];
		if ( oldPath && editor.sourceFiles.get( oldPath )?.asset?.id === id ) return { ...editor.sourceFiles.get( oldPath ), path: oldPath, record };
		const { file, fileMap } = await this.filesFor( record );
		if ( epoch !== this.epoch ) throw new Error( 'The project changed while loading this asset. Try again.' );
		const paths = storeSourceFiles( editor, fileMap );
		const path = paths.get( file );
		const metadata = { id, title: record.title, url: record.url, page: record.page, credit: record.credit, rights: record.rights, kind: record.kind };
		editor.sourceFiles.get( path ).asset = metadata;
		this.paths.set( id, path );
		editor.signals.assetsChanged.dispatch();
		return { file, path, record };
	}
	async applyToObject( id, object, materialSlot = 0 ) {
		if ( hasRestriction( object, 'locked' ) ) throw new Error( 'This object is locked.' );
		const epoch = this.epoch;
		const record = await this.record( id );
		if ( ! isMapAsset( record ) ) throw new Error( 'Choose an image or texture to assign a map.' );
		if ( epoch !== this.epoch || this.editor.scene.getObjectByProperty( 'uuid', object?.uuid ) !== object ) throw new Error( 'The texture target is no longer in the scene.' );
		const choice = await chooseTextureMap( object, materialSlot );
		if ( ! choice ) return;
		if ( epoch !== this.epoch || this.editor.scene.getObjectByProperty( 'uuid', object.uuid ) !== object ) throw new Error( 'The texture target is no longer in the scene.' );
		return this.use( id, { ...choice, object, mode: 'texture' } );
	}
	async use( id, { position, object, materialSlot = 0, material: expectedMaterial, map = 'map', mode = 'auto' } = {} ) {
		const epoch = this.epoch, picker = mode === 'texture' ? null : this.picker;
		object ||= this.editor.selected;
		const record = await this.record( id );
		if ( record.kind === 'file' ) throw new Error( 'This format is available as a link or download; it has no scene importer.' );
		const entry = await this.materialize( id );
		const canCommit = () => epoch === this.epoch;
		if ( ! canCommit() ) throw new Error( 'The project changed while loading this asset. Try again.' );
		if ( mode !== 'texture' && picker !== this.picker ) throw new Error( 'The texture selection changed. Choose the asset again.' );
		if ( picker ) {
			if ( picker.kind === 'texture' && ! entry.texture && ! ( picker.moving && isMovingAsset( record ) ) && ( ! entry.file || ! isTextureAsset( entry.file ) ) ) throw new Error( 'Choose a supported texture.' );
			if ( picker.kind === 'input' && ! isInputAsset( record ) ) throw new Error( 'Choose a media input asset.' );
			if ( picker.kind === 'import' && ( ! entry.file || ! isImportAsset( entry.file ) ) ) throw new Error( 'Choose a supported model.' );
			await picker.onPick( entry );
			if ( picker === this.picker ) this.cancelPicker();
			return;
		}
		if ( record.kind === 'microphone' ) return this.editor.assignMediaAsset( entry );
		if ( isMovingAsset( record ) && mode !== 'plane' && object?.material ) return this.assignMoving( entry, object, materialSlot, map, expectedMaterial, canCommit );
		if ( record.kind === 'webcam' ) {
			const { object, script } = webcamPlane( entry );
			return this.commit( object, entry, script, position, canCommit );
		}
		if ( record.kind === 'sdf' ) {
			const definition = mathDefinition( JSON.parse( await entry.file.text() ) );
			const mesh = new THREE.Mesh( new THREE.BoxGeometry(), new THREE.MeshNormalMaterial() );
			mesh.userData.assetObject = { type: 'math', definition };
			return this.commit( mesh, entry, mathScript( definition ), position, canCommit );
		} else if ( record.kind === 'audio' ) {
			const sound = new THREE.Group(); sound.userData.assetObject = { type: 'audio', path: entry.path };
			return this.commit( sound, entry, mediaScript( entry.path, 'audio' ), position, canCommit );
		} else if ( record.kind === 'splat' ) {
			const { SPZLoader } = await import( 'three/addons/loaders/SPZLoader.js' );
			const geometry = await new SPZLoader().parse( await entry.file.arrayBuffer() );
			const cloud = new THREE.Points( geometry, new THREE.PointsMaterial( { size: 0.025, vertexColors: true, transparent: true } ) );
			cloud.userData.assetObject = { type: 'splat-points' };
			const script = { name: 'Point cloud display', assetBehavior: 'points', enabled: true, source: '// @param pointSize = 0.025 (0.001..1)\n// @param opacity = 1 (0..1)\nfunction init(){this.material.size=params.pointSize;this.material.opacity=params.opacity;this.material.transparent=true;this.material.needsUpdate=true;}\n' };
			return this.commit( cloud, entry, script, position, canCommit );
		} else if ( record.kind === 'landmark' ) {
			const root = new THREE.Group();
			root.userData.assetObject = { type: 'landmark' };
			return this.commit( root, entry, landmarkScript(), position, canCommit );
		} else if ( record.kind === 'landmark-texture' ) {
			const plane = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), new THREE.MeshBasicMaterial( { side: THREE.DoubleSide, toneMapped: false } ) );
			plane.userData.assetObject = { type: 'landmark-texture' };
			return this.commit( plane, entry, landmarkTextureScript(), position, canCommit );
		} else if ( isMovingAsset( record ) || /^video\//.test( entry.file?.type || '' ) || /\.(webm|mp4|mov)$/i.test( entry.file?.name || '' ) || ( ( entry.texture || isTextureAsset( entry.file ) ) && mode !== 'texture' && ( mode === 'plane' || ! object?.material ) ) ) {
			const plane = await mediaPlane( this.editor, entry );
			return this.commit( plane.object, entry, plane.script, position, canCommit );
		} else if ( entry.texture || isTextureAsset( entry.file ) ) {
			object ||= this.editor.selected;
			if ( ! object?.material ) throw new Error( 'Select a mesh, or drag this texture onto a mesh or texture slot.' );
			if ( hasRestriction( object, 'locked' ) ) throw new Error( 'This object is locked.' );
			const material = this.editor.getObjectMaterial( object, materialSlot );
			if ( ! material || ( expectedMaterial && material !== expectedMaterial ) || ! ( map in material ) ) throw new Error( 'This material does not support ' + map + '.' );
			const texture = entry.texture ? entry.texture.clone() : await loadAssetTexture( this.editor, entry.file, entry.path );
			texture.colorSpace = THREE.NoColorSpace;
			if ( [ 'map', 'emissiveMap', 'sheenColorMap', 'specularColorMap', 'envMap' ].includes( map ) && ! texture.isDataTexture ) texture.colorSpace = THREE.SRGBColorSpace;
			if ( map === 'envMap' ) texture.mapping = THREE.EquirectangularReflectionMapping;
			if ( ! canCommit() ) throw new Error( 'The project changed while loading this texture. Try again.' );
			if ( expectedMaterial && ( this.editor.scene.getObjectByProperty( 'uuid', object.uuid ) !== object ||
				this.editor.getObjectMaterial( object, materialSlot ) !== material || hasRestriction( object, 'locked' ) ) ) {
				texture.dispose();
				throw new Error( 'The texture target changed. Choose the map again.' );
			}
			this.editor.execute( new SetMaterialMapCommand( this.editor, object, map, texture, materialSlot ) );
		} else if ( /\.(gltf|glb|vrm)$/i.test( entry.file.name ) ) {
			const model = await this.editor.loader.importGLTFAsset( entry.path, { metadata: this.editor.sourceFiles.get( entry.path ).asset, canCommit, commit: false, stripPresentation: true } );
			return this.commit( model, entry, model.userData.vrmBones ? poseScript() : modelScript( model ), position, canCommit );
		} else if ( isImportAsset( entry.file ) ) {
			this.editor.loader.loadAsset( entry.path, { position, metadata: this.editor.sourceFiles.get( entry.path ).asset, canCommit } );
		} else {
			throw new Error( 'This asset can be linked or downloaded, but its format cannot be placed in a Three.js scene.' );
		}
	}
	async assignMoving( entry, object, slot, map, expectedMaterial, canCommit = () => true ) {
		if ( ! object || hasRestriction( object, 'locked' ) ) throw new Error( 'Select an unlocked texture target.' );
		const epoch = this.epoch;
		const material = this.editor.getObjectMaterial( object, slot );
		if ( ! material || ( expectedMaterial && material !== expectedMaterial ) || ! ( map in material ) ) throw new Error( 'The material does not support this map.' );
		const plane = entry.record.kind === 'webcam' ? webcamPlane( entry ) : await mediaPlane( this.editor, entry );
		const texture = plane.object.material.map;
		plane.object.geometry.dispose();
		plane.object.material.dispose();
		if ( epoch !== this.epoch || ! canCommit() || this.editor.scene.getObjectByProperty( 'uuid', object.uuid ) !== object ||
			this.editor.getObjectMaterial( object, slot ) !== material || hasRestriction( object, 'locked' ) ) {
			texture.dispose();
			throw new Error( 'The texture target changed. Choose the map again.' );
		}
		if ( ! [ 'map', 'emissiveMap', 'sheenColorMap', 'specularColorMap', 'envMap' ].includes( map ) ) texture.colorSpace = THREE.NoColorSpace;
		if ( map === 'envMap' ) texture.mapping = THREE.EquirectangularReflectionMapping;
		const binding = texture.userData.mediaBinding = crypto.randomUUID();
		const commands = [ new SetMaterialMapCommand( this.editor, object, map, texture, slot ),
			new AddScriptCommand( this.editor, object, movingTextureScript( entry, binding, slot, map ) ) ];
		this.editor.execute( new MultiCmdsCommand( this.editor, commands ) );
	}
	commit( object, entry, script, position, canCommit = () => true ) {
		if ( ! canCommit() ) throw new Error( 'The project changed while importing this asset.' );
		object.name = entry.record.title || entry.file.name;
		object.userData.asset = this.editor.sourceFiles?.get( entry.path )?.asset;
		if ( position ) object.position.add( position );
		if ( script?.assetBehavior === 'math' ) evaluateAssetScript( object, script, {}, this.editor.scene, this.editor.viewportCamera ).init.call( object );
		const commands = [ new AddObjectCommand( this.editor, object ) ];
		if ( script ) commands.push( new AddScriptCommand( this.editor, object, script ) );
		const command = new MultiCmdsCommand( this.editor, commands ); command.name = 'Import ' + object.name;
		this.editor.execute( command );
		return object;
	}

	bindViewport( viewport ) {
		viewport.addEventListener( 'dragover', event => {
			if ( event.dataTransfer.types.includes( ASSET_MIME ) ) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
		} );
		viewport.addEventListener( 'drop', event => {
			const id = event.dataTransfer.getData( ASSET_MIME );
			if ( ! id ) return;
			event.preventDefault(); event.stopPropagation();
			const rect = viewport.getBoundingClientRect();
			const point = new THREE.Vector2( ( event.clientX - rect.left ) / rect.width * 2 - 1, 1 - ( event.clientY - rect.top ) / rect.height * 2 );
			const ray = new THREE.Raycaster();
			this.editor.scene.updateMatrixWorld( true );
			ray.setFromCamera( point, this.editor.viewportCamera );
			const hit = ray.intersectObjects( this.editor.scene.children, true ).find( h => h.object.isMesh && isVisible( h.object ) );
			const position = hit?.point || ray.ray.intersectPlane( new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), 0 ), new THREE.Vector3() ) || ray.ray.at( 10, new THREE.Vector3() );
			// A drop always places/applies; it never invokes a stale slot-picker callback.
			this.cancelPicker();
			this.run( async () => {
				const record = await this.record( id );
				if ( hit && ! event.altKey && isMapAsset( record ) ) return this.applyToObject( id, hit.object, hit.face?.materialIndex || 0 );
				return this.use( id, { position, mode: 'plane' } );
			} );
		} );
	}
}
