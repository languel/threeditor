import { AddScriptCommand } from '../commands/AddScriptCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { SetScriptValueCommand } from '../commands/SetScriptValueCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { isProjector, upgradeProjectorScript } from '../assets/Projector.js';
import { applyProjectionMask } from './ProjectionMask.js';

export function canMaskLight( object ) {

	return isProjector( object ) || object?.isSpotLight;

}

function spotMaskScript() {

	return {
		name: 'Spotlight mask',
		assetBehavior: 'light-mask',
		enabled: true,
		source: `${ applyProjectionMask.toString() }
let canvas, texture, originalMap, originalToJSON;
function init() {
 canvas = document.createElement( 'canvas' );
 canvas.width = canvas.height = 512;
 texture = new THREE.CanvasTexture( canvas );
 texture.colorSpace = THREE.SRGBColorSpace;
 originalMap = this.map;
 originalToJSON = this.toJSON;
 this.toJSON = function ( meta ) {
  const visibleMap = this.map;
  this.map = originalMap;
  try { return originalToJSON.call( this, meta ); }
  finally { this.map = visibleMap; }
 };
 setParameters.call( this );
}
function setParameters() {
 const mask = this.userData.projectionMask;
 this.map = mask ? texture : originalMap;
 if ( ! mask ) { player.requestRender?.(); return; }
 const ctx = canvas.getContext( '2d' );
 ctx.fillStyle = '#fff';
 ctx.fillRect( 0, 0, canvas.width, canvas.height );
 const image = originalMap?.image;
 if ( image instanceof HTMLImageElement && image.complete && image.naturalWidth || image instanceof HTMLCanvasElement ) {
  ctx.drawImage( image, 0, 0, canvas.width, canvas.height );
 }
 applyProjectionMask( ctx, mask, 0, 0, canvas.width, canvas.height );
 texture.needsUpdate = true;
 player.requestRender?.();
}
function stop() {
 this.map = originalMap;
 this.toJSON = originalToJSON;
 texture.dispose();
}
`
	};

}

export function setLightMask( editor, object, mask ) {

	if ( ! canMaskLight( object ) || hasRestriction( object, 'locked' ) ) throw new Error( 'Select an unlocked projector or spotlight.' );
	const userData = { ...object.userData };
	if ( mask ) userData.projectionMask = mask;
	else delete userData.projectionMask;
	const commands = [];
	if ( mask ) {

		const scripts = editor.scripts[ object.uuid ] || [];
		if ( isProjector( object ) ) {

			const script = scripts.find( item => item.assetBehavior === 'projector' );
			if ( ! script ) throw new Error( 'Attach the projector behavior to use a mask.' );
			const upgraded = { ...script };
			upgradeProjectorScript( upgraded );
			if ( ! upgraded.source.includes( 'applyProjectionMask( ctx,' ) ) throw new Error( 'This projector behavior does not support editable masks.' );
			if ( upgraded.source !== script.source ) commands.push( new SetScriptValueCommand( editor, object, script, 'source', upgraded.source ) );

		} else if ( ! scripts.some( script => script.assetBehavior === 'light-mask' ) ) {

			commands.push( new AddScriptCommand( editor, object, spotMaskScript() ) );

		}

	}
	const set = new SetValueCommand( editor, object, 'userData', userData );
	set.updatable = false;
	commands.push( set );
	editor.execute( commands.length === 1 ? set : new MultiCmdsCommand( editor, commands ), mask ? 'Apply light mask' : 'Clear light mask' );

}
