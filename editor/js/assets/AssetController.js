import * as THREE from 'three';
import { storeSourceFiles, isImportAsset, isTextureAsset } from '../ProjectAssets.js';
import { ASSET_MIME } from './AssetLibrary.js';
import { loadAssetTexture } from './AssetTexture.js';
import { SetMaterialMapCommand } from '../commands/SetMaterialMapCommand.js';
import { gltfDocument, gltfResourceURIs } from './GLTFAssets.js';
import { hasRestriction } from '../ObjectRestrictions.js';

export class AssetController {
	constructor( editor, library ) {
		this.epoch = 0; this.editor = editor; this.library = library; this.records = new Map(); this.paths = new Map(); this.pending = new Map();
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
	async prepare( id ) {
		const { editor, epoch } = this;
		const record = await this.record( id );
		if ( record.projectPath && editor.sourceFiles.has( record.projectPath ) ) return { ...editor.sourceFiles.get( record.projectPath ), path: record.projectPath, record };
		if ( record.texture ) return { texture: record.texture, path: record.texture.userData.sourceAssetPath, record };
		const oldPath = this.paths.get( id );
		if ( oldPath && editor.sourceFiles.get( oldPath )?.asset?.id === id ) return { ...editor.sourceFiles.get( oldPath ), path: oldPath, record };
		const file = record.file || await this.fetchFile( record.url );
		const fileMap = Object.create( null );
		if ( record.batch ) for ( const sibling of await this.library.all() ) {
			if ( sibling.batch === record.batch && sibling.file ) fileMap[ sibling.path || sibling.file.name ] = sibling.file;
		}
		const key = record.path || file.name;
		fileMap[ key ] = file;
		if ( /\.gl(tf|b)$/i.test( file.name ) ) {
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
		if ( epoch !== this.epoch ) throw new Error( 'The project changed while loading this asset. Try again.' );
		const paths = storeSourceFiles( editor, fileMap );
		const path = paths.get( file );
		const metadata = { id, title: record.title, url: record.url, page: record.page, credit: record.credit, rights: record.rights };
		editor.sourceFiles.get( path ).asset = metadata;
		this.paths.set( id, path );
		editor.signals.assetsChanged.dispatch();
		return { file, path, record };
	}
	async use( id, { position, object, materialSlot = 0, map = 'map' } = {} ) {
		const epoch = this.epoch, picker = this.picker;
		object ||= this.editor.selected;
		const record = await this.record( id );
		if ( [ 'sdf', 'splat', 'video', 'audio', 'file' ].includes( record.kind ) ) throw new Error( 'This format is available as a link or download; it has no scene importer.' );
		const entry = await this.materialize( id );
		const canCommit = () => epoch === this.epoch;
		if ( ! canCommit() ) throw new Error( 'The project changed while loading this asset. Try again.' );
		if ( picker !== this.picker ) throw new Error( 'The texture selection changed. Choose the asset again.' );
		if ( this.picker ) {
			if ( this.picker.kind === 'texture' && ! entry.texture && ! isTextureAsset( entry.file ) ) throw new Error( 'Choose a supported texture.' );
			if ( this.picker.kind !== 'texture' && ! isImportAsset( entry.file ) ) throw new Error( 'Choose a supported model.' );
			await this.picker.onPick( entry );
			this.cancelPicker();
			return;
		}
		if ( entry.texture || isTextureAsset( entry.file ) ) {
			object ||= this.editor.selected;
			if ( ! object?.material ) throw new Error( 'Select a mesh, or drag this texture onto a mesh or texture slot.' );
			if ( hasRestriction( object, 'locked' ) ) throw new Error( 'This object is locked.' );
			const material = this.editor.getObjectMaterial( object, materialSlot );
			if ( ! material || ! ( map in material ) ) throw new Error( 'This material does not support ' + map + '.' );
			const texture = entry.texture ? entry.texture.clone() : await loadAssetTexture( this.editor, entry.file, entry.path );
			texture.colorSpace = THREE.NoColorSpace;
			if ( [ 'map', 'emissiveMap', 'sheenColorMap', 'specularColorMap', 'envMap' ].includes( map ) && ! texture.isDataTexture ) texture.colorSpace = THREE.SRGBColorSpace;
			if ( map === 'envMap' ) texture.mapping = THREE.EquirectangularReflectionMapping;
			if ( ! canCommit() ) throw new Error( 'The project changed while loading this texture. Try again.' );
			this.editor.execute( new SetMaterialMapCommand( this.editor, object, map, texture, materialSlot ) );
		} else if ( /\.gl(tf|b)$/i.test( entry.file.name ) ) {
			return this.editor.loader.importGLTFAsset( entry.path, { position, metadata: this.editor.sourceFiles.get( entry.path ).asset, canCommit } );
		} else if ( isImportAsset( entry.file ) ) {
			this.editor.loader.loadAsset( entry.path, { position, metadata: this.editor.sourceFiles.get( entry.path ).asset, canCommit } );
		} else {
			throw new Error( 'This asset can be linked or downloaded, but its format cannot be placed in a Three.js scene.' );
		}
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
			const hit = ray.intersectObjects( this.editor.scene.children, true ).find( h => h.object.isMesh && h.object.visible );
			const position = hit?.point || ray.ray.intersectPlane( new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), 0 ), new THREE.Vector3() ) || ray.ray.at( 10, new THREE.Vector3() );
			// A drop always places/applies; it never invokes a stale slot-picker callback.
			this.cancelPicker();
			this.run( () => this.use( id, { position, object: hit?.object, materialSlot: hit?.face?.materialIndex || 0 } ) );
		} );
	}
}
