import * as THREE from 'three';
import { scriptSourceForExecution, serializeScript } from '../ScriptParams.js';
import { SetScriptValueCommand } from '../commands/SetScriptValueCommand.js';

export function evaluateAssetScript( object, script, player, scene, camera, source = script.source ) {
	const { parameters = {} } = serializeScript( script );
	const run = new Function( 'THREE', 'params', 'player', 'scene', 'camera', 'init', 'update', 'stop', scriptSourceForExecution( script, source ) + '\nreturn {init:typeof init==="function"?init:null, update:typeof update==="function"?update:null, stop:typeof stop==="function"?stop:null};' );
	return run.call( object, THREE, parameters, player, scene, camera );
}

// Only explicitly attached asset behaviors run in the editor preview.
export class AssetRuntime {
	constructor( editor ) {
		this.editor = editor; this.active = new Map(); this.changingHUD = false; this.suspended = false;
		const rebuild = () => this.refresh();
		for ( const name of [ 'objectAdded', 'objectRemoved', 'projectLoaded', 'editorCleared', 'scriptAdded', 'scriptRemoved' ] ) editor.signals[ name ].add( rebuild );
		editor.signals.scriptChanged.add( script => { if ( ! this.changingHUD ) this.refresh( script ); } );
		editor.signals.startPlayer.add( () => { this.suspended = true; this.dispose(); } );
		editor.signals.stopPlayer.add( () => { this.suspended = false; this.refresh(); } );
	}
	refresh( changedScript = null ) {
		if ( this.suspended ) return;
		const { editor } = this;
		const live = new Set();
		editor.scene.traverse( object => {
			const script = editor.scripts[ object.uuid ]?.find( script => script.assetBehavior && script.enabled !== false );
			if ( ! script ) return;
			live.add( object );
			if ( changedScript === script || this.active.get( object )?.script !== script ) this.stop( object );
			if ( this.active.has( object ) ) return;
			const urls = [];
			let source = script.source;
			for ( const [ path, { file } ] of editor.sourceFiles || [] ) {
				const literal = JSON.stringify( 'assets/' + path );
				if ( ! source.includes( literal ) ) continue;
				const url = URL.createObjectURL( file ); urls.push( url ); source = source.replaceAll( literal, JSON.stringify( url ) );
			}
			const player = { dom: document.querySelector( '#viewport' ) || document.body, assetParameterChanged: ( target, key, value ) => {
				this.changingHUD = true;
				try { editor.execute( new SetScriptValueCommand( editor, target, script, 'paramValues', { ...script.paramValues, [ key ]: value } ) ); } finally { this.changingHUD = false; }
			} };
			try {
				const runtime = evaluateAssetScript( object, script, player, editor.scene, editor.viewportCamera, source );
				runtime.init?.call( object ); this.active.set( object, { ...runtime, script, urls } );
				editor.signals.objectChanged.dispatch( object );
			} catch ( error ) { for ( const url of urls ) URL.revokeObjectURL( url ); editor.assetBrowser?.status?.( 'Asset script: ' + error.message, true ); console.error( error ); }
		} );
		for ( const object of this.active.keys() ) if ( ! live.has( object ) ) this.stop( object );
	}
	update( delta ) {
		let animated = false;
		for ( const panel of document.querySelectorAll( '#viewport .asset-engine-controls' ) ) {
			const root = this.editor.scene.getObjectByProperty( 'uuid', panel.dataset.assetObject );
			panel.hidden = ! root || ! this.editor.selected || ! root.getObjectByProperty( 'uuid', this.editor.selected.uuid );
		}
		for ( const [ object, runtime ] of this.active ) {
			if ( runtime.update || object.userData.assetObject?.type === 'video' ) animated = true;
			runtime.update?.call( object, { delta: delta * 1000, time: performance.now() } );
		}
		return animated;
	}
	stop( object ) { const runtime = this.active.get( object ); if ( ! runtime ) return; runtime.stop?.call( object ); for ( const url of runtime.urls ) URL.revokeObjectURL( url ); this.active.delete( object ); }
	dispose() { for ( const object of this.active.keys() ) this.stop( object ); }
}

export function mediaPlaybackJSON( json, sourceFiles ) {
	const urls = [];
	for ( const scripts of Object.values( json.scripts || {} ) ) for ( const script of scripts ) {
		if ( script.assetBehavior !== 'media' ) continue;
		for ( const [ path, { file } ] of sourceFiles || [] ) {
			const literal = JSON.stringify( 'assets/' + path );
			if ( ! script.source.includes( literal ) ) continue;
			const url = URL.createObjectURL( file ); urls.push( url ); script.source = script.source.replaceAll( literal, JSON.stringify( url ) );
		}
	}
	return () => urls.forEach( url => URL.revokeObjectURL( url ) );
}
