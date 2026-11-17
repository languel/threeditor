import { shadingModes } from './ViewportShading.js';
import { hoveredTimelineProperty } from './animation/TimelineKeyControl.js';
import { hasLightView } from './modeling/LightView.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { RemoveObjectCommand } from './commands/RemoveObjectCommand.js';
import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import * as THREE from 'three';
import { hasRestriction, isVisible } from './ObjectRestrictions.js';

const alignCameraShortcut = /Mac|iPhone|iPad/.test( navigator.platform ) ? 'ctrl+alt+numpad0' : 'mod+alt+numpad0';

// A single registry drives both shortcut execution and the settings list.
const definitions = [
 ['save','Save project','File','mod+s','mod+s'],
 ['meshExtrude','Extrude selection','Modeling','e','e'],
 ['meshFill','Fill face or close outline','Modeling','f','f'],
 ['translate','Move / grab','Transform','w','g'], ['rotate','Rotate','Transform','e','r'], ['scale','Scale','Transform','r','s'],
 ['addMenu','Open Add menu','Workspace','','shift+a'], ['contextMenu','Open object context menu','Workspace','',''],
 ['palette','Open command palette','Workspace','f3','f3'], ['paletteAlternate','Open command palette (alternate)','Workspace','mod+k','mod+k'],
 ['undo','Undo','Edit','mod+z','mod+z'], ['redo','Redo','Edit','mod+shift+z','mod+shift+z'],
 ['delete','Delete selection','Edit','delete','x'], ['deleteBack','Delete selection (Backspace)','Edit','backspace','delete'],
 ['clearSelection','Clear selection','Selection','escape','escape'],
 ['selectAll','Select all / deselect','Selection','a','a'], ['selectNone','Deselect all','Selection','','alt+a'],
 ['focus','Frame selection','View','f','numpaddecimal'], ['frameAll','Frame all','View','','home'], ['perspective','Perspective camera','View','p',''], ['orthographic','Orthographic camera','View','o',''], ['projection','Toggle perspective / orthographic','View','','numpad5'],
 ['viewFront','Front view','View','','numpad1'], ['viewBack','Back view','View','','mod+numpad1'], ['viewRight','Right view','View','','numpad3'], ['viewLeft','Left view','View','','mod+numpad3'], ['viewTop','Top view','View','','numpad7'], ['viewBottom','Bottom view','View','','mod+numpad7'], ['viewCamera','Toggle active camera view','View','numpad0','numpad0'],
 ['alignActiveCamera','Align active camera to view','View',alignCameraShortcut,alignCameraShortcut],
 ['orbitLeft','Orbit left','Navigation','','numpad4'], ['orbitRight','Orbit right','Navigation','','numpad6'], ['orbitUp','Orbit up','Navigation','','numpad8'], ['orbitDown','Orbit down','Navigation','','numpad2'], ['flipView','Opposite view','Navigation','','numpad9'],
 ['panLeft','Pan left','Navigation','','mod+numpad4'], ['panRight','Pan right','Navigation','','mod+numpad6'], ['panUp','Pan up','Navigation','','mod+numpad8'], ['panDown','Pan down','Navigation','','mod+numpad2'], ['zoomIn','Zoom in','Navigation','','numpadadd'], ['zoomOut','Zoom out','Navigation','','numpadsubtract'],
 ['shadingPie','Viewport shading menu','View','','z'], ['toggleWireframe','Toggle wireframe','View','','shift+z'],
 ['fly','Fly active camera','View','backquote','backquote'], ['shading','Cycle viewport shading','View','z',''], ['shadingBack','Cycle viewport shading backward','View','shift+z',''],
 ['play','Start / stop player','Playback','alt+p','alt+p'], ['presentation','Presentation mode','Playback','mod+alt+p','mod+alt+p'],
 ['code','Toggle code panel','Workspace','',''], ['sidebar','Toggle sidebar','Workspace','','n'], ['timeline','Toggle timeline','Workspace','',''],
 ['workspaceMode','Switch Object / Edit mode','Modeling','tab','tab'],
 ['modePie','Interaction mode menu','Modeling','','ctrl+tab'],
 ['objectMode','Object Mode','Modeling','',''],
 ['boxSelect','Box select','Modeling','b','b'], ['lassoSelect','Lasso select','Modeling','',''],
 ['circleSelect','Circle select','Modeling','c','c'], ['knife','Knife','Modeling','k','k'],
 ['invertElements','Invert element selection','Modeling','mod+i','mod+i'],
 ['selectVertex','Vertex select','Modeling','1','1'], ['selectEdge','Edge select','Modeling','2','2'], ['selectFace','Face select','Modeling','3','3'],
 ['surfacePaintMode','Surface paint','Modeling','1',''], ['meshEditMode','Enter mesh edit mode','Modeling','2',''],
 ['meshSculptMode','Sculpt selected geometry','Modeling','3',''], ['topologyPen','Toggle topology pen','Modeling','6','6'],
 ['weldPoints','Weld modeling vertices','Modeling','m','m'], ['brushSmaller','Decrease brush radius','Modeling','[','['], ['brushLarger','Increase brush radius','Modeling',']',']'],
 ['brushWeaker','Decrease brush strength','Modeling','shift+[','shift+['], ['brushStronger','Increase brush strength','Modeling','shift+]','shift+]'],
 ['toolbar','Toggle transform toolbar','Workspace','','t'], ['settings','Open settings','Workspace','',''],
 ['duplicate','Duplicate selected object','Edit','','shift+d'],
 ['objectNames','Toggle object names','View','shift+l','shift+l'],
 ['toggleSnap','Toggle magnet snapping','Transform','shift+tab','shift+tab'], ['orientationPie','Open orientation menu','Transform',',',','],
 ['placementPie','Open placement menu','Transform','alt+,','alt+,'],
 ['gridPie','Open grid menu','View','shift+g','shift+g'], ['snapPie','Open snapping menu','View','shift+s','shift+s'], ['pivotPie','Open pivot menu','View','.','.'],
 ['grid','Toggle grid','Transform','alt+g','alt+g'], ['cameraHelpers','Toggle camera helpers','View','',''], ['lightHelpers','Toggle light helpers','View','',''], ['skeletonHelpers','Toggle skeleton helpers','View','',''],
 ['timelineInsertKey','Insert timeline keyframe','Animation','i','i'],
 ['timelineDelete','Delete selected timeline keyframe or clip','Animation','delete','x'],
 ['timelineDeleteBack','Delete selected timeline keyframe or clip (Backspace)','Animation','backspace','delete'],
 ['timelineDeselect','Clear timeline selection','Animation','escape','escape'],
 ['animationPlay','Play animation','Animation','','space'], ['animationPause','Pause animation','Animation','',''], ['animationStop','Stop animation','Animation','','']
];

const areaSelector = '#viewport, #outliner, #sidebar, #animation, #code-panel, #menubar';
const textControls = 'input, textarea, select, .CodeMirror, [contenteditable]:not([contenteditable="false"])';
const sceneSelection = new Set( ['clearSelection','selectAll','selectNone','delete','deleteBack','duplicate'] );
const viewportCategories = new Set( ['Modeling','Transform','Navigation','View','Selection'] );
const viewportActions = new Set( ['addMenu','contextMenu','toolbar','sidebar'] );
const timelineSelection = new Set( ['timelineDelete','timelineDeleteBack','timelineDeselect'] );
const areaOf = target => target?.closest?.( areaSelector )?.id;

function comboFromEvent( event ) {
 if ( ['Shift','Control','Alt','Meta'].includes( event.key ) ) return '';
 let key = event.key.toLowerCase();
 if ( event.code === 'Backquote' ) key = 'backquote';
 else if ( event.code?.startsWith( 'Numpad' ) ) key = event.code.toLowerCase();
 else if ( event.code === 'BracketLeft' ) key = '[';
 else if ( event.code === 'BracketRight' ) key = ']';
 else if ( event.code === 'Comma' ) key = ',';
 else if ( event.altKey && event.code?.startsWith( 'Key' ) ) key = event.code.slice( 3 ).toLowerCase();
 else if ( key === ' ' ) key = 'space';
 if ( event.code === 'Tab' && event.ctrlKey && ! event.metaKey && ! event.altKey && ! event.shiftKey ) return 'ctrl+tab';
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
  const trackPointer = event => { this.pointer = [event.clientX,event.clientY]; };
  document.addEventListener('pointermove',trackPointer,true);
  document.addEventListener('pointerdown',trackPointer,true);
  document.addEventListener('focusin',event=>{
   if(areaOf(event.target)&&event.target.matches(':focus-visible')&&!event.target.closest(textControls))this.pointer=null;
  });
  window.addEventListener('keydown',e=>{if(this.recording||e.repeat||e.isComposing||editor.modalTransform?.active||editor.flyControls?.active||document.body.classList.contains('presenting')||document.querySelector('dialog[open]'))return;const combo=comboFromEvent(e);const action=this.actions.find(a=>['palette','paletteAlternate','save'].includes(a.id)&&combo&&this.combo(a.id)===combo);if(action){e.preventDefault();e.stopPropagation();action.run();}},true);
  document.addEventListener('keydown',e=>this.onKey(e));
 }
 register(action){if(!this.actions.some(a=>a.id===action.id))this.actions.push(action);}
 combo(id){const overrides=this.overrides[this.preset]||{};return Object.hasOwn(overrides,id)?overrides[id]:(this.actions.find(a=>a.id===id)?.defaults[this.preset]||'');}
 setPreset(preset){this.preset=preset;this.editor.config.setKey('settings/keymapPreset',preset);this.changed();}
 rebind(id,combo){
  const map={...(this.overrides[this.preset]||{})};
  for(const action of this.actions){
   if(action.id===id||!combo||this.combo(action.id)!==combo)continue;
   const separateAreas=timelineSelection.has(action.id)&&sceneSelection.has(id)||sceneSelection.has(action.id)&&timelineSelection.has(id);
   if(!separateAreas)map[action.id]='';
  }
  map[id]=combo;
  this.overrides={...this.overrides,[this.preset]:map};
  this.save();
 }
 reset(){this.overrides={...this.overrides,[this.preset]:{}};this.save();}
 save(){this.editor.config.setKey('settings/keymapOverrides',this.overrides);this.changed();}
 changed(){for(const fn of this.listeners)fn();}
 get area(){
  const focused=document.activeElement;
  const pointed=this.pointer&&document.elementFromPoint(...this.pointer);
  const area=(focused?.closest(textControls)&&areaOf(focused)) || areaOf(pointed) || areaOf(focused) || 'viewport';
  return area==='viewport'&&this.editor.editWorkspace?.mode?'2d':area;
 }
 allowsViewportInput(event){
  return this.area==='viewport'&&!this.recording&&!event.defaultPrevented&&!event.isComposing&&
   !event.target?.closest?.(textControls+', dialog[open], .context-menu, [role="separator"]')&&!document.querySelector('dialog[open]');
 }
 onKey(e){
  if(this.recording||e.defaultPrevented||e.isComposing||e.repeat||document.querySelector('dialog[open]'))return;
  const t=e.target;if(t?.isContentEditable||t?.closest?.(textControls+', .context-menu, [role="separator"]'))return;
  if(t?.closest?.('button')&&['Enter',' ','Tab'].includes(e.key)&&!e.ctrlKey&&!e.metaKey)return;
  const area=this.area;
  const combo=comboFromEvent(e);const action=this.actions.find(a=>combo && this.combo(a.id)===combo && this.actionAvailable(a.id,area));if(!action||(document.body.classList.contains('presenting') && !['presentation','favoriteScriptParameters'].includes(action.id)))return;
  e.preventDefault();action.run();
 }
 actionAvailable(id,area='viewport'){
  const e=this.editor,m=e.modeling;
  if(timelineSelection.has(id))return area==='animation'&&e.timeline?.canEditSelection();
  if(sceneSelection.has(id))return area==='viewport'||area==='outliner'&&!m?.editMode;
  if(id==='focus'&&area==='outliner')return true;
  if(id==='timelineInsertKey')return ['viewport','sidebar','animation'].includes(area);
  if(['animationPlay','animationPause','animationStop'].includes(id))return area==='viewport'||area==='animation';
  const action=this.actions.find(action=>action.id===id);
  if(area!=='viewport'&&(viewportCategories.has(action?.category)||viewportActions.has(id)||action?.viewportOnly))return false;
  const elementSelect = ['selectVertex','selectEdge','selectFace'].includes(id);
  const meshActions = ['boxSelect','lassoSelect','circleSelect','knife','invertElements','meshFill','meshExtrude'];
  const meshAction = meshActions.includes(id);
  if(!elementSelect&&!meshAction&&!['modePie','objectMode','surfacePaintMode','meshEditMode','meshSculptMode','topologyPen','weldPoints','brushSmaller','brushLarger','brushWeaker','brushStronger'].includes(id))return true;
  if(!m||e.editWorkspace?.mode||e.streams?.playing||e.flyControls?.active||m.gesture||m.drag||e.viewTools.pointer)return false;
  if ( id === 'meshSculptMode' ) return m.canEditTarget( e.selected );
  if ( id === 'modePie' || id === 'objectMode' ) return true;
  if ( elementSelect || meshAction ) {
   if ( ! m.editMode || ! m.canEdit() || e.viewTools.mode || m.brush && m.brush !== 'freehand' ) return false;
   if ( id === 'knife' ) return !!m.data.faces?.length && !m.data.profile;
   if ( id === 'meshFill' ) return m.canCloseProfile() || m.canFillSelection();
   if ( id === 'meshExtrude' ) return Boolean(m.extrusionSelection());
   if ( ['boxSelect','lassoSelect','circleSelect'].includes(id) ) return !m.pen && !m.adding && !m.brush && !m.knife;
   return true;
  }
  if(id==='topologyPen')return m.canEdit()&&!!m.data.faces?.length;
  if(id==='weldPoints')return m.canEdit()&&m.data.kind==='mesh'&&!m.data.profile&&m.indices.length>=2;
  if(id==='brushWeaker'||id==='brushStronger')return e.viewTools.mode==='paint'||(m.brush&&m.brush!=='freehand');
  if(id==='brushSmaller'||id==='brushLarger')return e.viewTools.mode==='paint'||(m.brush&&m.brush!=='freehand')||m.selectionTool==='circle';
  return true;
 }

 registerMenu(menu){
  for(const [mi,group] of [...menu.querySelectorAll(':scope > .menu')].entries()){
   const title=group.querySelector(':scope > .title');
   const category=title?.textContent.trim();if(!category)continue;
   const menuKey=title.dataset.glyphKey;
   let i=0;
   for(const el of group.querySelectorAll('.options .option, .options .inactive')){
    if(el.classList.contains('submenu-title'))continue;
    const label=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join(' ').trim();if(!label)continue;
    const parent=el.parentElement?.closest('.submenu-title');const section=parent?[...parent.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join(' ').trim():category;
    const viewportOnly=['menubar/add','menubar/view','menubar/edit'].includes(menuKey)&&el.dataset.shortcutScope!=='global';
    const id=`menu.${mi}.${i++}`;this.register({id,label,section,category:'Menu · '+category,viewportOnly,defaults:{basic:'',blender:''},run:()=>{if(!el.classList.contains('inactive'))el.click();}});
   }
  }
  this.changed();
 }
 run(id){const e=this.editor,s=e.signals;
  switch(id){
   case 'modePie':e.openTransformPie?.('mode');break;
   case 'objectMode':e.viewTools.setWorkspaceMode('object');break;
   case 'boxSelect':case 'lassoSelect':case 'circleSelect':e.modeling.setSelectionTool(id.slice(0,-6));break;
   case 'knife':e.modeling.toggleKnife();break;
   case 'invertElements':e.modeling.invertElementSelection();break;
   case 'meshFill':e.viewTools.run(()=>e.modeling.canCloseProfile()?e.modeling.closeProfile():e.modeling.fillFace());break;
   case 'meshExtrude':e.viewTools.run(()=>e.modeling.startExtrusion());break;
   case 'selectVertex':case 'selectEdge':case 'selectFace':e.modeling.setSelectionMode(id.slice(6).toLowerCase());break;
   case 'clearSelection':if(e.modeling?.object)e.modeling.selectPoints(false);else e.select(null);break;
   case 'surfacePaintMode':e.viewTools.setMode(e.viewTools.mode==='paint'?'':'paint');break;
   case 'meshEditMode':e.viewTools.setWorkspaceMode('edit');break;
   case 'meshSculptMode':e.viewTools.setWorkspaceMode('sculpt');break;
   case 'topologyPen':e.modeling.togglePen();break;case 'weldPoints':e.modeling.weld();break;
   case 'brushWeaker':case 'brushStronger':e.viewTools.adjustBrushStrength(id==='brushWeaker'?-.05:.05);break;
   case 'brushSmaller':case 'brushLarger':e.viewTools.resizeBrush(id==='brushSmaller'?1/1.2:1.2);break;
   case 'save':e.saveProject?.();break;
   case 'addMenu':e.contextMenu?.openAdd();break;case 'contextMenu':e.contextMenu?.openObject();break;case 'palette':case 'paletteAlternate':e.contextMenu?.openPalette();break;
   case 'translate':case 'rotate':case 'scale': s.transformModeChanged.dispatch(id);if(this.preset==='blender')e.modalTransform?.start(id);break;
   case 'undo':e.undo();break;case 'redo':e.redo();break;
   case 'delete':case 'deleteBack':{if(e.modeling?.editMode){const m=e.modeling;if(m.canEdit()&&m.data.kind!=='vertices'&&m.indices.length)m.removeSelection();break;}const cmds=[];for(const obj of e.selector.selection){if(!obj.parent)continue;cmds.push(new RemoveObjectCommand(e,obj));if(obj.isSpotLight||obj.isDirectionalLight)cmds.push(new RemoveObjectCommand(e,obj.target));}if(cmds.length)e.execute(cmds.length===1?cmds[0]:new MultiCmdsCommand(e,cmds));break;}
   case 'selectAll':{if(e.modeling?.editMode){e.modeling.selectPoints(true);break;}const objects=e.scene.children.filter(o=>isVisible(o)&&!hasRestriction(o,'unselectable'));if(objects.length&&objects.every(o=>e.selector.selection.includes(o)))e.deselect();else e.selector.setSelection(objects);break;}
   case 'selectNone':if(e.modeling?.editMode)e.modeling.selectPoints(false);else e.deselect();break;case 'focus':if(e.selected)e.focus(e.selected);break;
   case 'frameAll':e.focus(e.scene);break;
   case 'perspective':e.setCameraType('perspective');break;case 'orthographic':e.setCameraType('orthographic');break;
   case 'projection':e.setCameraType(e.camera.isPerspectiveCamera?'orthographic':'perspective');break;
   case 'viewFront':case 'viewBack':case 'viewRight':case 'viewLeft':case 'viewTop':case 'viewBottom':{
    if(!e.viewportSplit)e.setViewportCamera(e.camera.uuid);const cam=e.camera,center=e.controls.getCenter(cam);const distance=Math.max(0.1,cam.position.distanceTo(center));
    const dirs={viewFront:[0,0,1],viewBack:[0,0,-1],viewRight:[1,0,0],viewLeft:[-1,0,0],viewTop:[0,1,0],viewBottom:[0,-1,0]};
    cam.up.set(0,Math.abs(dirs[id][1])?0:1,Math.abs(dirs[id][1])?-1:0);cam.position.copy(center).add(new THREE.Vector3(...dirs[id]).multiplyScalar(distance));cam.lookAt(center);cam.updateMatrixWorld(true);s.cameraChanged.dispatch(cam);break;
   }
   case 'viewCamera':{
    if ( e.viewportSource ) e.setViewportCamera( e.camera.uuid );
    else if ( e.viewportCamera === e.camera && hasLightView( e.selected ) ) e.setViewportSource( e.selected );
    else {
     const camera = e.viewportCamera === e.camera ? e.activeSceneCamera : e.camera;
     if ( camera ) e.setViewportCamera( camera.uuid );
    }
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
    const view = e.viewLayout?.navigation?.camera || e.viewportCamera;
    const offset = view.getWorldPosition( new THREE.Vector3() ).sub( e.controls.center );
    const phi = new THREE.Spherical().setFromVector3( offset ).phi;
    const speed = e.controls.rotationSpeed;
    e.controls.rotate( new THREE.Vector3( Math.PI / speed, ( Math.PI - 2 * phi ) / speed, 0 ) );
    break;
   }
   case 'panLeft':case 'panRight':case 'panUp':case 'panDown':e.controls.pan(new THREE.Vector3(id==='panLeft'?-35:id==='panRight'?35:0,id==='panUp'?35:id==='panDown'?-35:0,0));break;
   case 'zoomIn':case 'zoomOut':e.controls.zoom(new THREE.Vector3(0,0,id==='zoomIn'?-1:1));break;
   case 'fly':e.flyControls?.start();break;
   case 'toggleWireframe':
    if(e.viewportShading==='wireframe')e.setViewportShading(this.previousShading||'solid');
    else {this.previousShading=e.viewportShading;e.setViewportShading('wireframe');}
    break;
   case 'shading':case 'shadingBack':{
    const modes=shadingModes.map(([value])=>value);
    const index=modes.indexOf(e.viewportShading);
    e.setViewportShading(modes[(index+(id==='shading'?1:-1)+modes.length)%modes.length]);break;
   }
   case 'play': if(document.getElementById('player').style.display==='none')s.startPlayer.dispatch();else s.stopPlayer.dispatch();break;
   case 'presentation':e.player?.present();break;
   case 'code':case 'sidebar':case 'timeline':case 'toolbar':case 'settings':{const names={code:'Toggle Code panel',sidebar:'Toggle right sidebar',timeline:'Toggle animation timeline',toolbar:'Toggle transform toolbar',settings:e.strings.getKey('sidebar/settings')};document.querySelector('.panel-toggles button[aria-label="'+names[id]+'"]')?.click();break;}
   case 'duplicate':if(!e.modeling?.editMode)e.shortcutDuplicate?.();break;
   case 'objectNames':e.setViewportObjectNames(!e.config.getKey('settings/showObjectNames'));break;
   case 'workspaceMode':e.viewTools?.toggleWorkspaceMode();break;
   case 'toggleSnap':e.toggleTransformSnap?.();break;
   case 'shadingPie':case 'placementPie':case 'orientationPie':case 'gridPie':case 'snapPie':case 'pivotPie':e.openTransformPie?.(id.slice(0,-3));break;
   case 'grid':e.toggleTransformGrid?.();break;
   case 'cameraHelpers':case 'lightHelpers':case 'skeletonHelpers':e.shortcutToggleHelper?.(id);break;
   case 'timelineInsertKey':e.timeline?.insertKey( hoveredTimelineProperty() );break;
   case 'timelineDelete':case 'timelineDeleteBack':e.timeline?.deleteSelection();break;
   case 'timelineDeselect':e.timeline?.clearSelection();break;
   case 'animationPlay':case 'animationPause':case 'animationStop':e.animationCommands?.[id]?.();break;
  }
 }
}
export { Keymap, comboFromEvent, formatCombo };
