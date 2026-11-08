import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { RemoveObjectCommand } from './commands/RemoveObjectCommand.js';
import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import * as THREE from 'three';
import { hasRestriction, isVisible } from './ObjectRestrictions.js';

const alignCameraShortcut = /Mac|iPhone|iPad/.test( navigator.platform ) ? 'ctrl+alt+numpad0' : 'mod+alt+numpad0';

// A single registry drives both shortcut execution and the settings list.
const definitions = [
 ['translate','Move / grab','Transform','w','g'], ['rotate','Rotate','Transform','e','r'], ['scale','Scale','Transform','r','s'],
 ['addMenu','Open Add menu','Workspace','','shift+a'], ['contextMenu','Open object context menu','Workspace','',''],
 ['palette','Open command palette','Workspace','f3','f3'], ['paletteAlternate','Open command palette (alternate)','Workspace','mod+k','mod+k'],
 ['undo','Undo','Edit','mod+z','mod+z'], ['redo','Redo','Edit','mod+shift+z','mod+shift+z'],
 ['delete','Delete selection','Edit','delete','x'], ['deleteBack','Delete selection (Backspace)','Edit','backspace','delete'],
 ['selectAll','Select all / deselect','Selection','a','a'], ['selectNone','Deselect all','Selection','','alt+a'],
 ['focus','Frame selection','View','f','numpaddecimal'], ['frameAll','Frame all','View','','home'], ['perspective','Perspective camera','View','p',''], ['orthographic','Orthographic camera','View','o',''], ['projection','Toggle perspective / orthographic','View','','numpad5'],
 ['viewFront','Front view','View','','numpad1'], ['viewBack','Back view','View','','mod+numpad1'], ['viewRight','Right view','View','','numpad3'], ['viewLeft','Left view','View','','mod+numpad3'], ['viewTop','Top view','View','','numpad7'], ['viewBottom','Bottom view','View','','mod+numpad7'], ['viewCamera','Toggle active camera view','View','numpad0','numpad0'],
 ['alignActiveCamera','Align active camera to view','View',alignCameraShortcut,alignCameraShortcut],
 ['orbitLeft','Orbit left','Navigation','','numpad4'], ['orbitRight','Orbit right','Navigation','','numpad6'], ['orbitUp','Orbit up','Navigation','','numpad8'], ['orbitDown','Orbit down','Navigation','','numpad2'], ['flipView','Opposite view','Navigation','','numpad9'],
 ['panLeft','Pan left','Navigation','','mod+numpad4'], ['panRight','Pan right','Navigation','','mod+numpad6'], ['panUp','Pan up','Navigation','','mod+numpad8'], ['panDown','Pan down','Navigation','','mod+numpad2'], ['zoomIn','Zoom in','Navigation','','numpadadd'], ['zoomOut','Zoom out','Navigation','','numpadsubtract'],
 ['fly','Fly active camera','View','backquote','backquote'], ['shading','Cycle viewport shading','View','z','z'], ['shadingBack','Cycle viewport shading backward','View','shift+z','shift+z'],
 ['play','Start / stop player','Playback','alt+p','alt+p'], ['presentation','Presentation mode','Playback','mod+alt+p','mod+alt+p'],
 ['code','Toggle code panel','Workspace','',''], ['sidebar','Toggle sidebar','Workspace','','n'], ['timeline','Toggle timeline','Workspace','',''],
 ['toolbar','Toggle transform toolbar','Workspace','','t'], ['settings','Open settings','Workspace','',''],
 ['duplicate','Duplicate selected object','Edit','','shift+d'],
 ['grid','Toggle grid','View','',''], ['cameraHelpers','Toggle camera helpers','View','',''], ['lightHelpers','Toggle light helpers','View','',''], ['skeletonHelpers','Toggle skeleton helpers','View','',''],
 ['animationPlay','Play animation','Animation','','space'], ['animationPause','Pause animation','Animation','',''], ['animationStop','Stop animation','Animation','','']
];

function comboFromEvent( event ) {
 if ( ['Shift','Control','Alt','Meta'].includes( event.key ) ) return '';
 let key = event.key.toLowerCase();
 if ( event.code === 'Backquote' ) key = 'backquote';
 else if ( event.code?.startsWith( 'Numpad' ) ) key = event.code.toLowerCase();
 else if ( event.altKey && event.code?.startsWith( 'Key' ) ) key = event.code.slice( 3 ).toLowerCase();
 else if ( key === ' ' ) key = 'space';
 const mod = /Mac|iPhone|iPad/.test( navigator.platform ) ? event.metaKey : event.ctrlKey;
 const other = /Mac|iPhone|iPad/.test( navigator.platform ) ? event.ctrlKey : event.metaKey;
 return [ mod && 'mod', other && ( mod ? 'other' : ( event.metaKey ? 'meta' : 'ctrl' ) ), event.altKey && 'alt', event.shiftKey && event.code !== 'Backquote' && 'shift', key ].filter( Boolean ).join( '+' );
}
function formatCombo( combo ) { return combo ? combo.replaceAll('mod', /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl').replaceAll('backquote','` / ~').replaceAll('numpad','Num ') : 'Unassigned'; }

class Keymap {
 constructor( editor ) {
  this.editor=editor; this.actions=[]; this.listeners=new Set(); this.recording=false;
  this.preset=editor.config.getKey('settings/keymapPreset') || 'blender';
  this.overrides=editor.config.getKey('settings/keymapOverrides') || {};
  const legacy={translate:'w',rotate:'e',scale:'r',undo:'z',focus:'f',perspective:'p',orthographic:'o',selectAll:'a'};
  if (!editor.config.getKey('settings/keymapMigrated')) {
   const basic={...(this.overrides.basic||{})};
   for(const [id,original] of Object.entries(legacy)){const value=editor.config.getKey('settings/shortcuts/'+id);if(value && value!==original) basic[id]=id==='undo'?'mod+'+value:value;}
   this.overrides={...this.overrides,basic}; editor.config.setKey('settings/keymapOverrides',this.overrides,'settings/keymapMigrated',true);
  }
  for(const [id,label,category,basic,blender] of definitions) this.register({id,label,category,defaults:{basic,blender},run:()=>this.run(id)});
  window.addEventListener('keydown',e=>{if(this.recording||e.repeat||e.isComposing||editor.modalTransform?.active||editor.flyControls?.active||document.body.classList.contains('presenting'))return;const combo=comboFromEvent(e);const action=this.actions.find(a=>['palette','paletteAlternate'].includes(a.id)&&combo&&this.combo(a.id)===combo);if(action){e.preventDefault();e.stopPropagation();action.run();}},true);
  document.addEventListener('keydown',e=>this.onKey(e));
 }
 register(action){if(!this.actions.some(a=>a.id===action.id))this.actions.push(action);}
 combo(id){const overrides=this.overrides[this.preset]||{};return Object.hasOwn(overrides,id)?overrides[id]:(this.actions.find(a=>a.id===id)?.defaults[this.preset]||'');}
 setPreset(preset){this.preset=preset;this.editor.config.setKey('settings/keymapPreset',preset);this.changed();}
 rebind(id,combo){const map={...(this.overrides[this.preset]||{})};for(const a of this.actions)if(a.id!==id && combo && this.combo(a.id)===combo)map[a.id]='';map[id]=combo;this.overrides={...this.overrides,[this.preset]:map};this.save();}
 reset(){this.overrides={...this.overrides,[this.preset]:{}};this.save();}
 save(){this.editor.config.setKey('settings/keymapOverrides',this.overrides);this.changed();}
 changed(){for(const fn of this.listeners)fn();}
 onKey(e){
  if(this.recording||e.defaultPrevented||e.isComposing||e.repeat)return;
  const t=e.target;if(t?.isContentEditable||t?.closest?.('input, textarea, select, button, .CodeMirror, [contenteditable="true"]'))return;
  const combo=comboFromEvent(e);const action=this.actions.find(a=>combo && this.combo(a.id)===combo);if(!action||(document.body.classList.contains('presenting') && action.id!=='presentation'))return;
  e.preventDefault();action.run();
 }
 registerMenu(menu){
  for(const [mi,group] of [...menu.querySelectorAll(':scope > .menu')].entries()){
   const category=group.querySelector(':scope > .title')?.textContent.trim();if(!category)continue;
   let i=0;
   for(const el of group.querySelectorAll('.options .option, .options .inactive')){
    if(el.classList.contains('submenu-title'))continue;
    const label=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join(' ').trim();if(!label)continue;
    const parent=el.parentElement?.closest('.submenu-title');const section=parent?[...parent.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join(' ').trim():category;
    const id=`menu.${mi}.${i++}`;this.register({id,label,section,category:'Menu · '+category,defaults:{basic:'',blender:''},run:()=>{if(!el.classList.contains('inactive'))el.click();}});
   }
  }
  this.changed();
 }
 run(id){const e=this.editor,s=e.signals;
  switch(id){
   case 'addMenu':e.contextMenu?.openAdd();break;case 'contextMenu':e.contextMenu?.openObject();break;case 'palette':case 'paletteAlternate':e.contextMenu?.openPalette();break;
   case 'translate':case 'rotate':case 'scale': s.transformModeChanged.dispatch(id);if(this.preset==='blender')e.modalTransform?.start(id);break;
   case 'undo':e.undo();break;case 'redo':e.redo();break;
   case 'delete':case 'deleteBack':{const cmds=[];for(const obj of e.selector.selection){if(!obj.parent)continue;cmds.push(new RemoveObjectCommand(e,obj));if(obj.isSpotLight||obj.isDirectionalLight)cmds.push(new RemoveObjectCommand(e,obj.target));}if(cmds.length)e.execute(cmds.length===1?cmds[0]:new MultiCmdsCommand(e,cmds));break;}
   case 'selectAll':{const objects=e.scene.children.filter(o=>isVisible(o)&&!hasRestriction(o,'unselectable'));if(objects.length&&objects.every(o=>e.selector.selection.includes(o)))e.deselect();else e.selector.setSelection(objects);break;}
   case 'selectNone':e.deselect();break;case 'focus':if(e.selected)e.focus(e.selected);break;
   case 'frameAll':e.focus(e.scene);break;
   case 'perspective':e.setCameraType('perspective');break;case 'orthographic':e.setCameraType('orthographic');break;
   case 'projection':e.setCameraType(e.camera.isPerspectiveCamera?'orthographic':'perspective');break;
   case 'viewFront':case 'viewBack':case 'viewRight':case 'viewLeft':case 'viewTop':case 'viewBottom':{
    e.setViewportCamera(e.camera.uuid);const cam=e.camera,center=e.controls.center;const distance=Math.max(0.1,cam.position.distanceTo(center));
    const dirs={viewFront:[0,0,1],viewBack:[0,0,-1],viewRight:[1,0,0],viewLeft:[-1,0,0],viewTop:[0,1,0],viewBottom:[0,-1,0]};
    cam.up.set(0,Math.abs(dirs[id][1])?0:1,Math.abs(dirs[id][1])?-1:0);cam.position.copy(center).add(new THREE.Vector3(...dirs[id]).multiplyScalar(distance));cam.lookAt(center);cam.updateMatrixWorld(true);s.cameraChanged.dispatch(cam);break;
   }
   case 'viewCamera':{
    const camera = e.viewportCamera === e.camera ? e.activeSceneCamera : e.camera;
    if ( camera ) e.setViewportCamera( camera.uuid );
    break;
   }
   case 'alignActiveCamera':{
    const camera = e.activeSceneCamera, view = e.viewportCamera;
    if ( ! camera || camera === view || hasRestriction( camera, 'locked' ) ) break;
    const position = view.getWorldPosition( new THREE.Vector3() );
    const orientation = view.getWorldQuaternion( new THREE.Quaternion() );
    if ( camera.parent ) {
     camera.parent.worldToLocal( position );
     orientation.premultiply( camera.parent.getWorldQuaternion( new THREE.Quaternion() ).invert() );
    }
    const rotation = new THREE.Euler().setFromQuaternion( orientation, camera.rotation.order );
    e.execute( new MultiCmdsCommand( e, [ new SetPositionCommand( e, camera, position ), new SetRotationCommand( e, camera, rotation ) ] ) );
    e.controls.getCenter( camera ).copy( e.controls.center );
    e.setViewportCamera( camera.uuid );
    break;
   }
   case 'orbitLeft':case 'orbitRight':case 'orbitUp':case 'orbitDown':{
    const step = Math.PI / 12 / e.controls.rotationSpeed;
    e.controls.rotate( new THREE.Vector3( id === 'orbitLeft' ? -step : id === 'orbitRight' ? step : 0, id === 'orbitUp' ? -step : id === 'orbitDown' ? step : 0, 0 ) );
    break;
   }
   case 'flipView':{
    const offset = e.viewportCamera.getWorldPosition( new THREE.Vector3() ).sub( e.controls.center );
    const phi = new THREE.Spherical().setFromVector3( offset ).phi;
    const speed = e.controls.rotationSpeed;
    e.controls.rotate( new THREE.Vector3( Math.PI / speed, ( Math.PI - 2 * phi ) / speed, 0 ) );
    break;
   }
   case 'panLeft':case 'panRight':case 'panUp':case 'panDown':e.controls.pan(new THREE.Vector3(id==='panLeft'?-35:id==='panRight'?35:0,id==='panUp'?35:id==='panDown'?-35:0,0));break;
   case 'zoomIn':case 'zoomOut':e.controls.zoom(new THREE.Vector3(0,0,id==='zoomIn'?-1:1));break;
   case 'fly':e.flyControls?.start();break;
   case 'shading':case 'shadingBack':{const modes=['solid','wireframe','normals','preview'];const n=Math.max(0,modes.indexOf(e.viewportShading));e.setViewportShading(modes[(n+(id==='shading'?1:3))%4]);break;}
   case 'play': if(document.getElementById('player').style.display==='none')s.startPlayer.dispatch();else s.stopPlayer.dispatch();break;
   case 'presentation':e.player?.present();break;
   case 'code':case 'sidebar':case 'timeline':case 'toolbar':case 'settings':{const names={code:'Toggle Code panel',sidebar:'Toggle right sidebar',timeline:'Toggle animation timeline',toolbar:'Toggle transform toolbar',settings:e.strings.getKey('sidebar/settings')};document.querySelector('.panel-toggles button[aria-label="'+names[id]+'"]')?.click();break;}
   case 'duplicate':e.shortcutDuplicate?.();break;
   case 'grid':case 'cameraHelpers':case 'lightHelpers':case 'skeletonHelpers':e.shortcutToggleHelper?.(id);break;
   case 'animationPlay':case 'animationPause':case 'animationStop':e.animationCommands?.[id]?.();break;
  }
 }
}
export { Keymap, comboFromEvent, formatCombo };
