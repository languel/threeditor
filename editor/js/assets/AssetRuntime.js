import { hasRestriction } from '../ObjectRestrictions.js';
import * as THREE from 'three';
import { scriptSourceForExecution, serializeScript } from '../ScriptParams.js';
import { SetScriptValueCommand } from '../commands/SetScriptValueCommand.js';

export function evaluateAssetScript( object, script, player, scene, camera, source = script.source, parameters = serializeScript( script ).parameters || {} ) {
	const run = new Function( 'THREE', 'params', 'player', 'scene', 'camera', 'init', 'update', 'stop', 'setParameters', scriptSourceForExecution( script, source ) + '\nreturn {init:typeof init==="function"?init:null, update:typeof update==="function"?update:null, stop:typeof stop==="function"?stop:null, setParameters:typeof setParameters==="function"?setParameters:null};' );
	return run.call( object, THREE, parameters, player, scene, camera );
}

// Only explicitly attached asset behaviors run in the editor preview.
export class AssetRuntime {
	constructor( editor ) {
		this.editor = editor; this.active = new Map(); this.changingHUD = false; this.suspended = false;
		if ( editor.streams ) {
			editor.streams.getParam = ( uuid, scriptIndex, param ) => {
				const script = editor.scripts[ uuid ]?.[ scriptIndex ];
				if ( ! script ) return undefined;
				const runtime = this.active.get( script );
				return runtime?.parameters ? runtime.parameters[ param ] : serializeScript( script ).parameters?.[ param ];
			};
			editor.streams.setParam = ( uuid, scriptIndex, param, value ) => {
				const script = editor.scripts[ uuid ]?.[ scriptIndex ];
				if ( ! script ) return false;
				script.paramValues = { ...( script.paramValues || {} ), [ param ]: value };
				const runtime = this.active.get( script );
				if ( ! runtime ) return false;
				if ( runtime.parameters ) runtime.parameters[ param ] = value;
				if ( runtime.setParameters ) runtime.setParameters.call( runtime.object, { ...( runtime.parameters || serializeScript( script ).parameters || {} ) } );
				return true;
			};
		}
		const rebuild = () => this.refresh();
		for ( const name of [ 'objectAdded', 'objectRemoved', 'sceneGraphChanged', 'projectLoaded', 'editorCleared', 'scriptAdded', 'scriptRemoved' ] ) editor.signals[ name ].add( rebuild );
		editor.signals.objectChanged.add( ( object, attribute ) => {

			if ( attribute === 'userData' ) this.refresh();

		} );
		editor.signals.scriptChanged.add( ( script, attribute ) => {
			if ( this.changingHUD || attribute === 'favoriteParams' ) return;
			if ( attribute === 'paramValues' ) {
				for ( const runtime of this.active.values() ) {
					if ( runtime.script !== script || ! runtime.setParameters ) continue;
					const { object } = runtime;
					runtime.setParameters.call( object, serializeScript( script ).parameters || {} );
					editor.signals.objectChanged.dispatch( object );
					return;
				}
			}
			this.refresh( script );
		} );
		editor.signals.startPlayer.add( () => { this.suspended = true; this.dispose(); } );
		editor.signals.stopPlayer.add( () => { this.suspended = false; this.refresh(); } );
	}
	refresh( changedScript = null ) {
		if ( this.suspended ) return;
		const { editor } = this;
		const live = new Set();
		editor.scene.traverse( object => {
			if ( hasRestriction( object, 'disabled' ) ) return;
			for ( const script of editor.scripts[ object.uuid ] || [] ) {
				if ( ! script.assetBehavior || script.enabled === false ) continue;
				live.add( script );
				if ( changedScript === script ) this.stop( script );
				if ( this.active.has( script ) ) continue;
				const urls = [];
				let source = script.source;
				for ( const [ path, { file } ] of editor.sourceFiles || [] ) {
					const literal = JSON.stringify( 'assets/' + path );
					if ( ! source.includes( literal ) ) continue;
					const url = URL.createObjectURL( file ); urls.push( url ); source = source.replaceAll( literal, JSON.stringify( url ) );
				}
				const player = { streams: editor.streams, dom: document.querySelector( '#viewport' ) || document.body, requestRender: () => editor.signals.objectChanged.dispatch( object ), assetParameterChanged: ( target, key, value ) => {
					this.changingHUD = true;
					try { editor.execute( new SetScriptValueCommand( editor, target, script, 'paramValues', { ...script.paramValues, [ key ]: value } ) ); } finally { this.changingHUD = false; }
				} };
				try {
					const parameters = serializeScript( script ).parameters || {};
					const runtime = evaluateAssetScript( object, script, player, editor.scene, editor.viewportCamera, source, parameters );
					runtime.init?.call( object ); this.active.set( script, { ...runtime, object, script, urls, parameters } );
					editor.signals.objectChanged.dispatch( object );
				} catch ( error ) { for ( const url of urls ) URL.revokeObjectURL( url ); editor.assetBrowser?.status?.( 'Asset script: ' + error.message, true ); console.error( error ); }
			}
		} );
		for ( const script of this.active.keys() ) if ( ! live.has( script ) ) this.stop( script );
	}
	update( delta ) {
		let animated = false;
		for ( const panel of document.querySelectorAll( '#viewport .asset-engine-controls' ) ) {
			const root = this.editor.scene.getObjectByProperty( 'uuid', panel.dataset.assetObject );
			panel.hidden = ! root || ! this.editor.selected || ! root.getObjectByProperty( 'uuid', this.editor.selected.uuid );
		}
		for ( const runtime of this.active.values() ) {
			const { object } = runtime;
			if ( runtime.update || object.userData.assetObject?.type === 'video' ) animated = true;
			runtime.update?.call( object, { delta: delta * 1000, time: performance.now() } );
		}
		return animated;
	}
	stop( script ) { const runtime = this.active.get( script ); if ( ! runtime ) return; runtime.stop?.call( runtime.object ); for ( const url of runtime.urls ) URL.revokeObjectURL( url ); this.active.delete( script ); }
	dispose() { for ( const script of this.active.keys() ) this.stop( script ); }
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
