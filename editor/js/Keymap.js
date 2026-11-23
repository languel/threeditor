import { shadingModes } from './ViewportShading.js?v=live-preview';
import { hoveredTimelineProperty } from './animation/TimelineKeyControl.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { RemoveObjectCommand } from './commands/RemoveObjectCommand.js';
import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import * as THREE from 'three';
import { hasRestriction, isVisible } from './ObjectRestrictions.js';
import { canJoinMeshes, joinObjects } from './modeling/JoinObjects.js';
import { canParentSelection } from './ObjectParenting.js?v=editor-panes';
import { canDuplicateObjects, duplicateObjects } from './DuplicateObjects.js?v=editor-panes';

const control = /Mac|iPhone|iPad/.test( navigator.platform ) ? 'ctrl' : 'mod';
const alignCameraShortcut = control + '+alt+numpad0';
const topologySelectionActions = {
 linkedUnderPointer: 'linked', deselectLinkedUnderPointer: 'subtract', selectLinked: 'linked',
 selectMore: 'more', selectLess: 'less'
};

// A single registry drives both shortcut execution and the settings list.
const definitions = [
 ['save','Save project','File','mod+s','mod+s'],
 ['translate','Move / grab','Transform','w','g'], ['rotate','Rotate','Transform','e','r'], ['scale','Scale','Transform','r','s'],
 ['addMenu','Open Add menu','Workspace','','shift+a'], ['contextMenu','Open object context menu','Workspace','',''],
 ['addComponent','Add Component','Workspace','',''],
 ['palette','Open command palette','Workspace','f3','f3'], ['paletteAlternate','Open command palette (alternate)','Workspace','mod+k','mod+k'],
 ['undo','Undo','Edit','mod+z','mod+z'], ['redo','Redo','Edit','mod+shift+z','mod+shift+z'],
 ['adjustLastOperation','Adjust Last Operation','Modeling','f9','f9'],
 ['delete','Delete selection','Edit','delete','x'], ['deleteBack','Delete selection (Backspace)','Edit','backspace','delete'],
 ['clearSelection','Clear selection','Selection','escape','escape'],
 ['pencilTool','Toggle Pencil','Modeling','d','d'],
 ['pencilReference','Lock or release Pencil reference','Modeling','b','b'],
 ['selectionCycle','Cycle selection tools','Modeling','','w'], ['selectionBox','Box select tool','Modeling','b','b'],
 ['selectionCircle','Circle select tool','Modeling','c','c'], ['selectionLasso','Lasso select tool','Modeling','shift+b','shift+b'],
 ['selectAll','Select all','Selection','a','a'], ['selectNone','Deselect all','Selection','','alt+a'],
 ['focus','Frame selection','View','f','numpaddecimal'], ['frameAll','Frame all','View','','home'], ['perspective','Perspective camera','View','p',''], ['orthographic','Orthographic camera','View','o',''], ['projection','Toggle perspective / orthographic','View','','numpad5'],
 ['viewFront','Front view','View','','numpad1'], ['viewBack','Back view','View','',control+'+numpad1'], ['viewRight','Right view','View','','numpad3'], ['viewLeft','Left view','View','',control+'+numpad3'], ['viewTop','Top view','View','','numpad7'], ['viewBottom','Bottom view','View','',control+'+numpad7'], ['viewCamera','Toggle active camera view','View','numpad0','numpad0'],
 ['alignActiveCamera','Align active camera to view','View',alignCameraShortcut,alignCameraShortcut],
 ['setActiveCamera','Set selected camera as active','View','',control+'+numpad0'],
 ['orbitLeft','Orbit left','Navigation','','numpad4'], ['orbitRight','Orbit right','Navigation','','numpad6'], ['orbitUp','Orbit up','Navigation','','numpad8'], ['orbitDown','Orbit down','Navigation','','numpad2'], ['flipView','Opposite view','Navigation','','numpad9'],
 ['panLeft','Pan left','Navigation','',control+'+numpad4'], ['panRight','Pan right','Navigation','',control+'+numpad6'], ['panUp','Pan up','Navigation','',control+'+numpad8'], ['panDown','Pan down','Navigation','',control+'+numpad2'], ['zoomIn','Zoom in','Navigation','','numpadadd'], ['zoomOut','Zoom out','Navigation','','numpadsubtract'],
 ['shadingPie','Viewport shading menu','View','','z'], ['toggleWireframe','Toggle wireframe','View','','shift+z'],
 ['toggleXRay','Toggle X-Ray','View','','alt+z'],
 ['navigationPie','View navigation menu','View','','backquote'], ['fly','Fly active camera','View','backquote','shift+backquote'], ['shading','Cycle viewport shading','View','z',''], ['shadingBack','Cycle viewport shading backward','View','shift+z',''],
 ['play','Play Scene','Playback','alt+p','alt+shift+p'], ['presentation','Presentation mode','Playback','mod+alt+p','mod+alt+p'],
 ['renameObject','Rename Object','Hierarchy','f2','f2'],
 ['parentObject','Set Parent','Hierarchy','',control+'+p'],
 ['clearParent','Clear Parent','Hierarchy','','alt+p'],
 ['code','Open Script Window','Workspace','',''], ['sidebar','Toggle right dock','Workspace','',''], ['timeline','Toggle timeline','Workspace','',''],
 ['viewportSidebar','Toggle Viewport Sidebar','View','','n'],
 ['viewportToolbar','Toggle Viewport Toolbar','View','','t'],
 ['viewportOverlays','Toggle Viewport Overlays','View','','alt+shift+z'],
 ['maximizeArea','Toggle Maximize Area','Workspace',control+'+space',control+'+space'],
 ['workspaceMode','Switch Object / Edit mode','Modeling','tab','tab'],
 ['modePie','Switch interaction mode','Modeling','shift+q','shift+q'],
 ['hideSelection','Hide selected in viewport','Visibility','','h'],
 ['hideUnselected','Hide unselected in viewport','Visibility','','shift+h'],
 ['revealHidden','Reveal hidden in viewport','Visibility','','alt+h'],
 ['localView','Toggle Local View','View','','numpaddivide'],
 ['localViewAlternate','Toggle Local View (slash)','View','','/'],
 ['selectVertex','Vertex select','Modeling','1','1'], ['selectEdge','Edge select','Modeling','2','2'], ['selectFace','Face select','Modeling','3','3'],
 ['linkedUnderPointer','Select linked under pointer','Modeling','','l'],
 ['deselectLinkedUnderPointer','Deselect linked under pointer','Modeling','','shift+l'],
 ['selectLinked','Select linked','Modeling','',control+'+l'],
 ['selectMore','Select more','Modeling','',control+'+numpadadd'],
 ['selectLess','Select less','Modeling','',control+'+numpadsubtract'],
 ['invertMeshSelection','Invert element selection','Modeling','mod+i',control+'+i'],
 ['separateMesh','Separate mesh','Modeling','','p'],
 ['surfacePaintMode','Surface paint','Modeling','1',''], ['meshEditMode','Enter mesh edit mode','Modeling','2',''],
 ['meshSculptMode','Sculpt selected geometry','Modeling','3',''], ['topologyPen','Toggle topology pen','Modeling','6','6'],
 ['weldPoints','Weld modeling vertices','Modeling','m','m'], ['brushSmaller','Decrease brush radius','Modeling','[','['], ['brushLarger','Increase brush radius','Modeling',']',']'],
 ['brushWeaker','Decrease brush strength','Modeling','shift+[','shift+['], ['brushStronger','Increase brush strength','Modeling','shift+]','shift+]'],
 ['toolbar','Toggle transform toolbar','Workspace','',''], ['settings','Open settings','Workspace','',''],
 ['duplicate','Duplicate Objects','Edit','','shift+d'],
 ['joinMeshes','Join meshes','Edit','',control+'+j'],
 ['objectNames','Toggle object names','View','shift+l','alt+shift+l'],
 ['toggleSnap','Toggle magnet snapping','Transform','shift+tab','shift+tab'], ['orientationPie','Open orientation menu','Transform',',',','],
 ['placementPie','Open placement menu','Transform','alt+,','alt+,'],
 ['gridPie','Open grid menu','View','shift+g','shift+g'], ['snapPie','Open snap target menu','View','shift+s','alt+shift+s'], ['cursorSnapPie','Snap selection and 3D Cursor','View','','shift+s'], ['pivotPie','Open pivot menu','View','.','.'],
 ['grid','Toggle grid','Transform','alt+g','alt+g'], ['cameraHelpers','Toggle camera helpers','View','',''], ['lightHelpers','Toggle light helpers','View','',''], ['skeletonHelpers','Toggle skeleton helpers','View','',''],
 ['timelineInsertKey','Insert timeline keyframe','Animation','i','i'],
 ['animationPlay','Play animation','Animation','','space'], ['animationPause','Pause animation','Animation','',''], ['animationStop','Stop animation','Animation','','']
];

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
 const mod = /Mac|iPhone|iPad/.test( navigator.platform ) ? event.metaKey : event.ctrlKey;
 const other = /Mac|iPhone|iPad/.test( navigator.platform ) ? event.ctrlKey : event.metaKey;
 return [ mod && 'mod', other && ( mod ? 'other' : ( event.metaKey ? 'meta' : 'ctrl' ) ), event.altKey && 'alt', event.shiftKey && 'shift', key ].filter( Boolean ).join( '+' );
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
  const trackPointer = event => {
   if ( event.pointerType === 'touch' || event.target.closest?.( '.context-menu, .transform-pie' ) ) return;
   this.pointer = { x: event.clientX, y: event.clientY };
  };
  document.addEventListener( 'pointermove', trackPointer, true );
  document.addEventListener( 'pointerdown', trackPointer, true );
  window.addEventListener('keydown',e=>{if(this.recording||e.repeat||e.isComposing||editor.modalTransform?.active||editor.flyControls?.active||document.body.classList.contains('presenting')||document.querySelector('dialog[open]'))return;const combo=comboFromEvent(e);const action=this.actions.find(a=>['palette','paletteAlternate','save','maximizeArea'].includes(a.id)&&combo&&this.combo(a.id)===combo);if(action){e.preventDefault();e.stopPropagation();action.run();}},true);
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
  const t=e.target;if(t?.isContentEditable||t?.closest?.('input, textarea, select, .CodeMirror, [contenteditable="true"], dialog[open]'))return;
  const combo = comboFromEvent( e );
  const available = a => this.actionAvailable( a.id ) && this.inArea( a );
  let action = this.actions.find( a => combo && this.combo( a.id ) === combo && available( a ) );
  if ( ! action && this.preset === 'blender' && this.editor.config.getKey( 'settings/emulateNumpad' ) && /^Digit[0-9]$/.test( e.code ) ) {

   const digit = e.code.at( -1 );
   const emulated = combo.includes( '+' ) ? combo.slice( 0, combo.lastIndexOf( '+' ) + 1 ) + 'numpad' + digit : 'numpad' + digit;
   action = this.actions.find( a => this.combo( a.id ) === emulated && available( a ) );

  }
  if(!action||(document.body.classList.contains('presenting') && !['presentation','favoriteScriptParameters'].includes(action.id)))return;
  if(t?.closest?.('button') && [' ', 'Enter'].includes(e.key))return;
  e.preventDefault();action.run();
 }
 get pointerTarget() {
  return this.pointer && document.elementFromPoint( this.pointer.x, this.pointer.y );
 }
 get viewFrame() {
  if ( ! this.pointer || ! this.pointerTarget?.closest( '#viewport' ) ) return;
  return this.editor.viewLayout?.at( this.pointer.x, this.pointer.y, 'area' );
 }
 get overEditableViewport() {
  const target = this.pointerTarget;
  if ( this.editor.editWorkspace?.exclusive || target && ( ! target.closest( '#viewport, #toolbar' ) || target.closest( '.viewport-edit-workspace' ) ) ) return false;
  return ! this.editor.viewportSplit || this.viewFrame?.director !== false;
 }
 inArea( action ) {
  const { category, id } = action;
  const target = this.pointerTarget;
  const inViewport = ( ! target || target.closest( '#viewport, #toolbar' ) && ! target.closest( '.viewport-edit-workspace' ) ) && ! this.editor.editWorkspace?.exclusive;
  const inOutliner = !! target?.closest( '#outliner' ) && ! this.editor.modeling?.editMode && ! this.editor.viewTools?.mode;
  const inSourcePane = this.editor.viewportSplit && this.viewFrame?.director === false;
  if ( category === 'Navigation' ) return this.overEditableViewport;
  if ( category === 'Visibility' ) return inOutliner || this.overEditableViewport;
  if ( category === 'Hierarchy' ) return inOutliner || this.overEditableViewport;
  if ( category === 'View' ) {
   const movesView = [ 'focus', 'frameAll', 'fly', 'navigationPie', 'projection', 'perspective', 'orthographic', 'localView', 'localViewAlternate', 'toggleXRay', 'viewportSidebar', 'viewportToolbar' ].includes( id ) || /^view(Front|Back|Left|Right|Top|Bottom)$/.test( id );
   return inViewport && ( ! inSourcePane || ! movesView );
  }
  if ( [ 'Transform', 'Modeling' ].includes( category ) || [ 'addMenu', 'contextMenu' ].includes( id ) ) return this.overEditableViewport;
  if ( category === 'Selection' || [ 'delete', 'deleteBack', 'duplicate', 'joinMeshes' ].includes( id ) ) return inOutliner || this.overEditableViewport;
  return true;
 }
 actionAvailable(id){
  const e=this.editor,m=e.modeling;
  if ( id === 'adjustLastOperation' ) return !! e.primitiveAdjustment?.available();
  if ( this.actions.find( action => action.id === id )?.available?.() === false ) return false;
  if ( id === 'duplicate' ) return canDuplicateObjects( e );
  if ( id === 'parentObject' || id === 'clearParent' ) return canParentSelection( e, id === 'clearParent' );
  if ( id === 'renameObject' ) {
   const object = e.selector.selection.at( -1 );
   return !! object?.parent && ! m.editMode && ! e.viewTools.mode && ! e.streams.playing && ! hasRestriction( object, 'locked' );
  }
  if ( id === 'addComponent' ) return !! e.selected && e.selected !== e.camera && ! e.streams?.playing;
  if ( Object.hasOwn( topologySelectionActions, id ) ) {

   if ( ! m?.canSelectTopology || e.editWorkspace?.exclusive || e.streams?.playing || e.flyControls?.active ) return false;
   return id.endsWith( 'UnderPointer' ) ? !! this.pointer && this.viewFrame === m.frame : m.indices.length > 0;

  }
  if ( id === 'localView' || id === 'localViewAlternate' ) return !!e.viewportVisibility.local || e.selector.selection.some( object => object !== e.scene && object !== e.camera && isVisible( object ) );
  if ( id === 'invertMeshSelection' ) return !! m?.canSelectTopology;
  if ( id === 'separateMesh' ) return !! m?.canSeparate;
  if ( id === 'joinMeshes' ) return canJoinMeshes( e );
  if ( [ 'hideSelection', 'hideUnselected', 'revealHidden' ].includes( id ) ) {

   if ( m?.editMode || e.viewTools?.mode ) return false;
   return id === 'revealHidden' ? e.viewportVisibility.hidden.size > 0 : e.selector.selection.some( object => object !== e.scene && object !== e.camera );

  }
  if(id==='setActiveCamera')return e.selected?.isCamera && e.selected!==e.camera && isVisible(e.selected);
  if ( id === 'pencilReference' ) return !!e.viewTools?.canLockPencilReference;
  if ( id === 'selectionBox' && e.viewTools?.canLockPencilReference ) return false;
  if ( [ 'pencilTool', 'selectionCycle', 'selectionBox', 'selectionCircle', 'selectionLasso' ].includes( id ) )
   return !m?.gesture && !m?.drag && !e.viewTools?.pointer && !e.modalTransform?.active && !e.flyControls?.active;
  if ( id === 'toggleXRay' ) return e.viewportShading === 'solid';
  const elementSelect = ['selectVertex','selectEdge','selectFace'].includes(id);
  if(!elementSelect&&!['surfacePaintMode','meshEditMode','meshSculptMode','topologyPen','weldPoints','brushSmaller','brushLarger','brushWeaker','brushStronger'].includes(id))return true;
  if(!m||e.editWorkspace?.exclusive||e.streams?.playing||e.flyControls?.active||m.gesture||m.drag||e.viewTools.pointer)return false;
  if(elementSelect)return m.editMode&&m.canEdit()&&!e.viewTools.mode&&(!m.isPencilStroke||id==='selectVertex');
  if(id==='topologyPen')return m.canEdit()&&!!m.data.faces?.length;
  if(id==='weldPoints')return m.canEdit()&&m.data.kind==='mesh'&&!m.data.profile&&m.indices.length>=2;
  if(id==='brushWeaker'||id==='brushStronger')return ['paint','pencil'].includes(e.viewTools.mode)||(m.brush&&m.brush!=='freehand');
  if(id==='brushSmaller'||id==='brushLarger')return e.viewTools.mode==='paint'||e.viewTools.mode==='pencil'||(m.brush&&m.brush!=='freehand')||m.selectionTool==='circle';
  return true;
 }

 registerMenu(menu){
  for(const [mi,group] of [...menu.querySelectorAll(':scope > .menu, :scope > .app-menus > .menu')].entries()){
   const category=group.querySelector(':scope > .title')?.textContent.trim();if(!category)continue;
   let i=0;
   for(const el of group.querySelectorAll('.options .option, .options .inactive')){
    if(el.classList.contains('submenu-title') || el.dataset.keymapAction)continue;
    const label=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join(' ').trim();if(!label)continue;
    const parent=el.parentElement?.closest('.submenu-title');const section=parent?[...parent.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join(' ').trim():category;
    const available = group.dataset.sceneAddMenu ? () => !this.editor.modeling.editMode ||
     Boolean(el.dataset.meshPrimitive && this.editor.modeling.canInsertPrimitive) : undefined;
    const id=`menu.${mi}.${i++}`;this.register({id,label,section,category:'Menu · '+category,defaults:{basic:'',blender:''},available,run:()=>{
     if ( available ? available() : !el.classList.contains('inactive') ) el.click();
    }});
   }
  }
  this.changed();
 }
 run(id){const e=this.editor,s=e.signals;
  if ( Object.hasOwn( topologySelectionActions, id ) ) {

   if ( this.actionAvailable( id ) ) e.modeling.selectTopology( topologySelectionActions[ id ], id.endsWith( 'UnderPointer' ) ? this.pointer : undefined );
   return;

  }
  switch(id){
   case 'adjustLastOperation':e.primitiveAdjustment?.open();break;
   case 'renameObject':if(this.actionAvailable(id))e.contextMenu?.openRename(this.pointer);break;
   case 'parentObject':case 'clearParent':if(this.actionAvailable(id))e.contextMenu?.openParent(id==='clearParent',this.pointer);break;
   case 'viewportSidebar':e.viewportSidebar?.toggle();break;
   case 'viewportToolbar':e.viewTools?.toggleToolbar();break;
   case 'viewportOverlays':e.toggleViewportOverlays();break;
   case 'addComponent':if(this.actionAvailable(id))e.openComponentPicker?.();break;
   case 'maximizeArea':e.workspaceArea?.toggle();break;
   case 'joinMeshes':e.viewTools.run(()=>joinObjects(e));break;
   case 'separateMesh':if(this.actionAvailable(id))e.contextMenu?.openSeparate(this.pointer);break;
   case 'invertMeshSelection':if(this.actionAvailable(id))e.modeling.invertElementSelection();break;
   case 'selectVertex':case 'selectEdge':case 'selectFace':e.modeling.setSelectionMode(id.slice(6).toLowerCase());break;
   case 'pencilTool':e.viewTools.togglePencil();break;
   case 'pencilReference':e.viewTools.togglePencilReference(this.pointer);break;
   case 'selectionCycle':case 'selectionBox':case 'selectionCircle':case 'selectionLasso':
    e.viewTools.chooseSelectionTool(id.slice(9).toLowerCase());break;
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
   case 'selectAll':{if(e.modeling?.editMode){e.modeling.selectPoints(true);break;}const objects=e.scene.children.filter(o=>isVisible(o)&&!hasRestriction(o,'unselectable'));if(this.preset==='basic'&&objects.length&&objects.every(o=>e.selector.selection.includes(o)))e.deselect();else e.selector.setSelection(objects);break;}
   case 'selectNone':if(e.modeling?.editMode)e.modeling.selectPoints(false);else e.deselect();break;
   case 'focus':{
    const model = e.modeling;
    if ( model.editMode && model.object && model.indices.length ) {
     model.object.updateWorldMatrix( true, false );
     const bounds = new THREE.Box3(), point = new THREE.Vector3();
     for ( const index of model.indices ) bounds.expandByPoint( point.fromArray( model.data.points[ index ] ).applyMatrix4( model.object.matrixWorld ) );
     e.focus( bounds );
    } else if ( e.selector.selection.length > 1 ) e.focus( e.selector.getSelectionBox( new THREE.Box3() ) );
    else if ( e.selected ) e.focus( e.selected );
    break;
   }
   case 'frameAll':e.focus(e.scene);break;
   case 'localView':case 'localViewAlternate':e.viewportVisibility.toggleLocal();break;
   case 'hideSelection':case 'hideUnselected':if(this.actionAvailable(id))e.viewportVisibility.hide(id==='hideUnselected');break;
   case 'revealHidden':if(this.actionAvailable(id))e.viewportVisibility.reveal();break;
   case 'perspective':e.setCameraType('perspective');break;case 'orthographic':e.setCameraType('orthographic');break;
   case 'projection':
    if ( ! e.viewportSplit && ( e.viewportSource || e.viewportCamera !== e.camera ) ) e.setViewportCamera( e.camera.uuid );
    e.setCameraType( e.camera.isPerspectiveCamera ? 'orthographic' : 'perspective' );
    break;
   case 'viewFront':case 'viewBack':case 'viewRight':case 'viewLeft':case 'viewTop':case 'viewBottom':{
    if(!e.viewportSplit)e.setViewportCamera(e.camera.uuid);
    e.setCameraType('orthographic');
    const cam=e.camera,center=e.controls.getCenter(cam);const distance=Math.max(0.1,cam.position.distanceTo(center));
    const dirs={viewFront:[0,0,1],viewBack:[0,0,-1],viewRight:[1,0,0],viewLeft:[-1,0,0],viewTop:[0,1,0],viewBottom:[0,-1,0]};
    cam.up.set(0,Math.abs(dirs[id][1])?0:1,Math.abs(dirs[id][1])?-1:0);cam.position.copy(center).add(new THREE.Vector3(...dirs[id]).multiplyScalar(distance));cam.lookAt(center);cam.updateMatrixWorld(true);s.cameraChanged.dispatch(cam);break;
   }
   case 'viewCamera':{
    if ( e.viewportSource ) e.setViewportCamera( e.camera.uuid );
    else {
     const camera = e.viewportCamera === e.camera ? e.activeSceneCamera : e.camera;
     if ( camera ) e.setViewportCamera( camera.uuid );
    }
    break;
   }
   case 'setActiveCamera':if(this.actionAvailable(id))e.setViewportCamera(e.selected.uuid);break;
   case 'alignActiveCamera':{
    const camera = e.activeSceneCamera, view = this.viewFrame?.camera || e.viewLayout?.navigation?.camera || e.viewportCamera;
    if ( ! camera || camera === view || hasRestriction( camera, 'locked' ) ) break;
    const position = view.getWorldPosition( new THREE.Vector3() );
    const orientation = view.getWorldQuaternion( new THREE.Quaternion() );
    if ( camera.parent ) {
     camera.parent.worldToLocal( position );
     orientation.premultiply( camera.parent.getWorldQuaternion( new THREE.Quaternion() ).invert() );
    }
    const rotation = new THREE.Euler().setFromQuaternion( orientation, camera.rotation.order );
    e.execute( new MultiCmdsCommand( e, [ new SetPositionCommand( e, camera, position ), new SetRotationCommand( e, camera, rotation ) ] ) );
    e.controls.getCenter( camera ).copy( e.controls.getCenter( this.viewFrame?.director ? e.camera : view ) );
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
   case 'toggleXRay':e.toggleViewportXRay();break;
   case 'shading':case 'shadingBack':{
    const modes=shadingModes.map(([value])=>value);
    const index=modes.indexOf(e.viewportShading);
    e.setViewportShading(modes[(index+(id==='shading'?1:-1)+modes.length)%modes.length]);break;
   }
   case 'play': if(document.getElementById('player').style.display==='none')s.startPlayer.dispatch();else s.stopPlayer.dispatch();break;
   case 'presentation':e.player?.present();break;
   case 'code':e.codePanel.open();break;
   case 'sidebar':case 'timeline':case 'toolbar':case 'settings':{const names={sidebar:'Toggle right sidebar',timeline:'Toggle animation timeline',toolbar:'Toggle transform toolbar',settings:e.strings.getKey('sidebar/settings')};document.querySelector('.panel-toggles button[aria-label="'+names[id]+'"]')?.click();break;}
   case 'duplicate':e.viewTools.run(()=>duplicateObjects(e,this.preset==='blender'&&this.overEditableViewport));break;
   case 'objectNames':e.setViewportObjectNames(!e.config.getKey('settings/showObjectNames'));break;
   case 'workspaceMode':e.viewTools?.toggleWorkspaceMode();break;
   case 'toggleSnap':e.toggleTransformSnap?.();break;
   case 'modePie':case 'navigationPie':case 'shadingPie':case 'placementPie':case 'orientationPie':case 'gridPie':case 'snapPie':case 'cursorSnapPie':case 'pivotPie':e.openTransformPie?.(id.slice(0,-3));break;
   case 'grid':e.toggleTransformGrid?.();break;
   case 'cameraHelpers':case 'lightHelpers':case 'skeletonHelpers':e.shortcutToggleHelper?.(id);break;
   case 'timelineInsertKey':e.timeline?.insertKey( hoveredTimelineProperty() );break;
   case 'animationPlay':case 'animationPause':case 'animationStop':e.animationCommands?.[id]?.();break;
  }
 }
}
export { Keymap, comboFromEvent, formatCombo };
