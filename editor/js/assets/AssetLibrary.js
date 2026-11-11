// Persistent asset records and folders, following the AMS assetStore model.
import { isTextureAsset, isImportAsset } from '../ProjectAssets.js';
import { encodeFile, decodeFile } from './StoredFile.js';

export const ASSET_MIME = 'application/x-threeditor-asset';
export function fileKind( file ) {
	if ( /\.(spz|sog|rad)$/i.test( file.name ) ) return 'splat';
	if ( isTextureAsset( file ) ) return 'texture';
	if ( isImportAsset( file ) ) return 'model';
	if ( file.type.startsWith( 'video/' ) || /\.(mp4|webm|mov)$/i.test( file.name ) ) return 'video';
	if ( file.type.startsWith( 'audio/' ) || /\.(wav|mp3|ogg|flac)$/i.test( file.name ) ) return 'audio';
	return 'file';
}
export function folderPath( path ) {
	const parts = String( path ).trim().replace( /\\/g, '/' ).split( '/' ).map( part => part.trim() ).filter( Boolean );
	if ( parts.some( p => p === '.' || p === '..' || /[\u0000-\u001f]/.test( p ) ) ) throw new Error( 'Choose a valid folder path.' );
	return parts.join( '/' );
}
export class AssetLibrary {
	constructor() { this.listeners = new Set(); }
	onChange( fn ) { this.listeners.add( fn ); return () => this.listeners.delete( fn ); }
	emit() { for ( const fn of this.listeners ) fn(); }
	async open() {
		this.ready ||= new Promise( ( resolve, reject ) => {
			const request = indexedDB.open( 'threeditor-assets', 1 );
			request.onupgradeneeded = () => request.result.createObjectStore( 'assets', { keyPath: 'id' } );
			request.onsuccess = () => { this.db = request.result; resolve(); };
			request.onerror = () => reject( request.error );
		} );
		return this.ready;
	}
	async transaction( mode, action ) {
		await this.open();
		return new Promise( ( resolve, reject ) => {
			const tx = this.db.transaction( 'assets', mode );
			const request = action( tx.objectStore( 'assets' ) );
			tx.oncomplete = () => resolve( request?.result );
			tx.onerror = tx.onabort = () => reject( request?.error || tx.error || new Error( 'Asset storage failed.' ) );
		} );
	}
	decode( record ) {
		if ( ! record?.file ) return record;
		return { ...record, file: decodeFile( record.file ) };
	}
	async all() { return ( await this.transaction( 'readonly', s => s.getAll() ) ).map( record => this.decode( record ) ); }
	async get( id ) { return this.decode( await this.transaction( 'readonly', s => s.get( id ) ) ); }
	async put( record ) {
		const stored = record.file ? { ...record, file: await encodeFile( record.file ) } : record;
		await this.transaction( 'readwrite', s => s.put( stored ) ); this.emit(); return record;
	}
	async remove( id ) { await this.transaction( 'readwrite', s => s.delete( id ) ); this.emit(); }
	async update( id, patch ) { const record = await this.get( id ); if ( ! record ) throw new Error( 'Asset no longer exists.' ); return this.put( { ...record, ...patch } ); }
	folders() { try { return JSON.parse( localStorage.getItem( 'threeditor_asset_folders' ) || '[]' ); } catch { return []; } }
	addFolder( path ) {
		const folder = folderPath( path );
		localStorage.setItem( 'threeditor_asset_folders', JSON.stringify( [ ...new Set( [ ...this.folders(), folder ] ) ] ) );
		this.emit();
	}
	async renameFolder( from, to ) {
		from = folderPath( from ); to = folderPath( to );
		if ( ! from || ! to ) throw new Error( 'Choose a folder name.' );
		const move = path => path === from || path.startsWith( from + '/' ) ? to + path.slice( from.length ) : path;
		for ( const record of await this.all() ) if ( move( record.folder || '' ) !== record.folder ) await this.update( record.id, { folder: move( record.folder || '' ) } );
		localStorage.setItem( 'threeditor_asset_folders', JSON.stringify( [ ...new Set( [ ...this.folders().map( move ), to ] ) ] ) ); this.emit();
	}
	async removeFolder( path ) {
		path = folderPath( path ); if ( ! path ) return;
		const inside = folder => folder === path || folder.startsWith( path + '/' );
		const parent = path.split( '/' ).slice( 0, -1 ).join( '/' );
		for ( const record of await this.all() ) if ( inside( record.folder || '' ) ) await this.update( record.id, { folder: parent } );
		localStorage.setItem( 'threeditor_asset_folders', JSON.stringify( this.folders().filter( folder => ! inside( folder ) ) ) ); this.emit();
	}

	async importFiles( files, into = '' ) {
		const entries = [ ...files ].map( file => ( { path: file.webkitRelativePath || file.relPath || file.name, file } ) );
		const batch = crypto.randomUUID();
		const records = [];
		// Keep every companion, including .bin and .mtl, in its original directory.
		for ( const { file, path } of entries ) {
			const folder = folderPath( [ into, path.split( '/' ).slice( 0, -1 ).join( '/' ) ].filter( Boolean ).join( '/' ) );
			let kind = fileKind( file );
			if ( /\.json$/i.test( file.name ) ) {
				try { const { mathDefinition } = await import( './MathObjects.js' ); mathDefinition( JSON.parse( await file.text() ) ); kind = 'sdf'; } catch { /* ordinary JSON keeps its existing importer */ }
			} else if ( /\.ply$/i.test( file.name ) ) {
				try { const { isGaussianSplatFile } = await import( './SplatObjects.js' ); if ( await isGaussianSplatFile( file ) ) kind = 'splat'; } catch { /* non-splat PLY keeps model importer */ }
			}
			records.push( await this.put( { id: crypto.randomUUID(), title: file.name, kind, file, path, batch, folder, tags: [], rating: 0, created: Date.now() } ) );
		}
		return records;
	}

	async cleanup( { activeDeviceIds = null, onMerge = null } = {} ) {

		const records = await this.all();
		const active = activeDeviceIds ? new Set( activeDeviceIds ) : null;
		const seenById = new Map(), seenByTitle = new Map(), seenLandmark = new Map();
		const removed = [];
		const sorted = [ ...records ].sort( ( a, b ) => {

			const aActive = a.deviceId && active?.has( a.deviceId ) ? 1 : 0;
			const bActive = b.deviceId && active?.has( b.deviceId ) ? 1 : 0;
			if ( aActive !== bActive ) return bActive - aActive;
			const aId = a.deviceId ? 1 : 0;
			const bId = b.deviceId ? 1 : 0;
			if ( aId !== bId ) return bId - aId;
			return ( b.created || 0 ) - ( a.created || 0 );

		} );

		for ( const record of sorted ) {

			if ( record.kind === 'webcam' || record.kind === 'microphone' ) {

				const idKey = record.deviceId ? `${ record.kind }:id:${ record.deviceId }` : null;
				const titleKey = record.title ? `${ record.kind }:title:${ record.title }` : `${ record.kind }:default`;
				const isActive = Boolean( record.deviceId && active?.has( record.deviceId ) );
				const genericTitle = record.kind === 'webcam' ? 'Webcam' : 'Microphone';
				const redundantGeneric = ! record.deviceId && record.title === genericTitle
					? sorted.find( other => other !== record && other.kind === record.kind && other.deviceId && ( ! active || active.has( other.deviceId ) ) )
					: null;
				const keeper = redundantGeneric || ( idKey && seenById.get( idKey ) ) || ( ! isActive && seenByTitle.get( titleKey ) );
				if ( keeper ) {

					onMerge?.( keeper, record );
					removed.push( record.id );
					continue;

				}
				if ( idKey ) seenById.set( idKey, record );
				if ( ! seenByTitle.has( titleKey ) ) seenByTitle.set( titleKey, record );
				continue;

			}

			if ( ( record.kind === 'landmark' || record.kind === 'landmark-texture' ) && ! record.tags?.length && ! record.rating ) {

				const defaultTitle = record.kind === 'landmark' ? 'Landmark visualization' : 'Landmark texture';
				if ( record.title === defaultTitle ) {

					const key = `${ record.kind }:${ record.folder || '' }`;
					const keeper = seenLandmark.get( key );
					if ( keeper ) {

						onMerge?.( keeper, record );
						removed.push( record.id );
						continue;

					}
					seenLandmark.set( key, record );

				}

			}

		}

		if ( ! removed.length ) return 0;
		await this.transaction( 'readwrite', store => {

			let req;
			for ( const id of removed ) req = store.delete( id );
			return req;

		} );
		this.emit();
		return removed.length;

	}
}
