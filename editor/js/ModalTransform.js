import { automaticAxis, endsConstraintDrag, isConstraintDrag, modalSnapMode, pickTransformSnapBase, startConstraintDrag,
 trackballDelta, transformFeature, transformHints, transformModes, transformNumber } from './modeling/TransformGesture.js?v=transform-gestures';
import * as THREE from 'three';
import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import { SetScaleCommand } from './commands/SetScaleCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { hasRestriction, isVisible } from './ObjectRestrictions.js';

function ModalTransform( editor ) {
 let mode=null,states=[],originals=[],objects=[],selection=[],axis=null,plane=false,local=false,numeric='',precision=false,x=0,y=0,startX=0,startY=0,lastX=0,lastY=0,commitPreview=null;
 let pointer, trackball, auto, snapBase, pickingBase;
 const notice=document.createElement('div');notice.className='navigation-notice';notice.hidden=true;
 const snapshot=o=>({o,position:o.position.clone(),rotation:o.rotation.clone(),scale:o.scale.clone()});
 function label(){

  const name = mode === 'translate' ? 'Grab' : mode === 'scale' ? 'Scale' : trackball ? 'Trackball' : 'Rotate';
  const constraint = axis && ( plane ? 'Plane excluding ' : '' ) + axis.toUpperCase() + ( local ? ' local' : ' global' );
  const base = pickingBase ? 'Click in the scene to set the snap base' : mode === 'translate' ? ( snapBase ? 'B change snap base' : 'B set snap base' ) : '';
  notice.textContent = [ name, constraint, numeric, base, transformHints ].filter( Boolean ).join( ' · ' );

 }
 function rebase(){

  const usePivot=mode!=='translate' && editor.config.getKey('settings/transformPivot')!=='auto' &&
   editor.selector.usesGroupPivot() && selection.length===editor.selector.selection.length;
  if(usePivot)editor.selector.updateGroup();
  states=(usePivot?[editor.selector.group]:objects).map(snapshot);
  startX=lastX;startY=lastY;x=0;y=0;numeric='';

 }
 function start(next,commit=null){
  if(mode||editor.flyControls?.active||editor.viewTools?.mode||!editor.renderer)return;
  if(editor.modeling?.editMode){editor.modeling.startModal(next);return;}
  selection=editor.selector.selection.filter(o=>o.parent&&o!==editor.camera&&o!==editor.scene&&isVisible(o)&&!hasRestriction(o,'locked'));
  if(selection.some(object=>editor.viewportVisibility?.allows(object,editor.viewLayout.navigation)===false))return;
  objects=selection.filter(o=>!selection.some(parent=>parent!==o&&isAncestor(parent,o)));
  if(!objects.length)return;
  originals=objects.map(snapshot);
  mode=next;axis=null;plane=false;local=false;precision=false;trackball=false;auto=null;snapBase=null;pickingBase=false;
  rebase();
  commitPreview=commit;editor.controls.enabled=false;document.getElementById('viewport').appendChild(notice);notice.hidden=false;label();
 }
 function isAncestor(a,o){for(let p=o.parent;p;p=p.parent)if(p===a)return true;return false;}
 function update(){
  const layout=editor.viewLayout, frame=layout.navigation||layout.frames[0];if(!frame)return;
  const cam=frame.camera;cam.updateWorldMatrix(true,false);const q=cam.getWorldQuaternion(new THREE.Quaternion());
  const viewRight=new THREE.Vector3(1,0,0).applyQuaternion(q),viewUp=new THREE.Vector3(0,1,0).applyQuaternion(q);
  const axes={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};
  const snapMode=modalSnapMode(editor.config,pointer?.ctrlKey);
  const snap=snapMode==='grid'||snapMode==='increment'?editor.config.getKey('settings/gridStep'):Number.isFinite(snapMode)?snapMode:null;
  const selected = object => objects.some( root => root === object || isAncestor( root, object ) );
  const quantize=(value,step)=>numeric===''&&step?Math.round(value/step)*step:value;
  for(const state of states){const o=state.o;
   if(mode==='translate'){
    const distance=Math.max(0.1,cam.getWorldPosition(new THREE.Vector3()).distanceTo(o.getWorldPosition(new THREE.Vector3())));const factor=distance*0.002;
    let dir=axis?axes[axis].clone():null;if(dir&&local)dir.applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
    const rect=layout.clientRect(frame);
    const raycaster=new THREE.Raycaster();const pivot=o.parent?o.parent.localToWorld(state.position.clone()):state.position.clone();
    const normal=dir&&plane?dir.clone():cam.getWorldDirection(new THREE.Vector3());
    const movementPlane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,pivot);
    function intersect(px,py){raycaster.setFromCamera(new THREE.Vector2((px-rect.left)/rect.width*2-1,1-(py-rect.top)/rect.height*2),cam);return raycaster.ray.intersectPlane(movementPlane,new THREE.Vector3());}
    const from=intersect(startX,startY),to=intersect(startX+x,startY+y);
    let offset=from&&to?to.sub(from):viewRight.clone().multiplyScalar(x*factor).addScaledVector(viewUp,-y*factor);
    if(dir){const along=offset.dot(dir);offset=plane?offset.addScaledVector(dir,-along):dir.clone().multiplyScalar(along);if(!plane&&offset.lengthSq()<1e-10&&(x||y))offset.copy(dir).multiplyScalar((x-y)*factor);}
    if(numeric!=='' && numeric!=='-' && numeric!=='.' && numeric!=='-.'){const amount=Number(numeric);if(Number.isFinite(amount)){if(dir&&!plane)offset.copy(dir);else {if(!offset.lengthSq())offset.copy(viewRight);if(dir&&plane)offset.addScaledVector(dir,-offset.dot(dir));if(!offset.lengthSq()&&dir)offset.crossVectors(dir,Math.abs(dir.y)<0.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0));}offset.normalize().multiplyScalar(amount);}}
    else if(precision)offset.multiplyScalar(0.1);
    if(numeric===''){
     const anchor=snapBase||pivot;
     if(snap){
      if(dir&&!plane){
       const origin=snapMode==='grid'?anchor.dot(dir):0;
       offset.copy(dir).multiplyScalar(quantize(origin+offset.dot(dir),snap)-origin);
      }else{
       const origin=snapMode==='grid'?anchor:new THREE.Vector3();
       offset.set(quantize(origin.x+offset.x,snap)-origin.x,quantize(origin.y+offset.y,snap)-origin.y,quantize(origin.z+offset.z,snap)-origin.z);
       if(dir)offset.addScaledVector(dir,-offset.dot(dir));
      }
     }else if(snapMode&&pointer&&layout.at(pointer.clientX,pointer.clientY)===frame){
      const hit=transformFeature(editor,frame,pointer,snapMode,anchor,object=>!selected(object));
      if(hit){
       offset.copy(hit).sub(anchor);
       if(dir){const along=offset.dot(dir);if(plane)offset.addScaledVector(dir,-along);else offset.copy(dir).multiplyScalar(along);}
      }
     }
    }
    o.position.copy(state.position);if(o.parent){const base=o.parent.localToWorld(state.position.clone());o.position.copy(o.parent.worldToLocal(base.add(offset)));}else o.position.add(offset);
   }else if(mode==='rotate'){
    const value=numeric!==''&&Number.isFinite(Number(numeric))?THREE.MathUtils.degToRad(Number(numeric)):x*0.01*(precision?0.1:1);
    o.rotation.copy(state.rotation);
    const fine = precision ? .1 : 1;
    const parent = o.parent?.getWorldQuaternion( new THREE.Quaternion() ) || new THREE.Quaternion();
    const normal = axis ? axes[axis].clone() : cam.getWorldDirection(new THREE.Vector3()).negate();
    if(axis&&local)normal.applyQuaternion(o.quaternion).applyQuaternion(parent);
    const delta=trackball?trackballDelta(cam,x*fine,y*fine):
     new THREE.Quaternion().setFromAxisAngle(normal,quantize(value,snap?Math.PI/12:null));
    o.quaternion.premultiply(delta.premultiply(parent.clone().invert()).multiply(parent));
   }
   else {o.scale.copy(state.scale);const raw=numeric!==''&&Number.isFinite(Number(numeric))?Number(numeric):1+x*0.01*(precision?0.1:1);const f=quantize(raw,snap ? .1 : null);if(axis){for(const component of ['x','y','z'])if((component===axis)!==plane)o.scale[component]*=f;}else o.scale.multiplyScalar(f);}
   o.updateMatrixWorld(true);editor.signals.objectChanged.dispatch(o);
  }
 }
 function finish(accept){
  if(!mode)return;
  const commands=[];
  const fields={position:SetPositionCommand,rotation:SetRotationCommand,scale:SetScaleCommand};
  for(const state of originals){
   for(const key of Object.keys(fields)){
    const current=state.o[key];
    if(current.equals(state[key]))continue;
    if(accept)commands.push(new fields[key](editor,state.o,current,state[key]));
    else current.copy(state[key]);
   }
   if(!accept){state.o.updateMatrixWorld(true);editor.signals.objectChanged.dispatch(state.o);}
  }
  mode=null;states=[];originals=[];objects=[];selection=[];notice.hidden=true;editor.controls.enabled=!editor.flyControls?.active;
  const commit=commitPreview;commitPreview=null;
  if(commands.length){
   if(commit)commit();
   else editor.execute(commands.length===1?commands[0]:new MultiCmdsCommand(editor,commands));
  }
  if(editor.selector.usesGroupPivot())editor.selector.updateGroup();
 }

 function updatePointer(event){
  pointer=event;x=lastX-startX;y=lastY-startY;precision=event.shiftKey;
  if(auto){
   const frame=editor.viewLayout.navigation;
   if(frame){
    const basis=local?states[0].o.getWorldQuaternion(new THREE.Quaternion()):new THREE.Quaternion();
    const pivot=states[0].o.getWorldPosition(new THREE.Vector3());
    const lock=automaticAxis(frame,pivot,basis,auto,event,auto.plane);
    if(lock){axis=lock.toLowerCase();plane=auto.plane;trackball=false;label();}
   }
  }
  if(!pickingBase)update();
 }

 window.addEventListener('pointermove',e=>{lastX=e.clientX;lastY=e.clientY;pointer=e;if(mode)updatePointer(e);},true);
 window.addEventListener('keydown',e=>{
  if(!mode)return;
  const key=e.key.toLowerCase();e.preventDefault();e.stopImmediatePropagation();
  if(key==='escape'||key==='enter'){
   if(pickingBase){pickingBase=false;label();return;}
   finish(key==='enter');return;
  }
  if(!e.repeat&&transformModes.has(key)){
   const next=transformModes.get(key);
   if(next===mode&&mode!=='rotate')return;
   trackball=next===mode&&mode==='rotate'&&!trackball;
   mode=next;axis=null;plane=false;local=false;auto=null;snapBase=null;pickingBase=false;
   rebase();label();return;
  }else if(key==='b'&&mode==='translate'&&!e.repeat)pickingBase=!pickingBase;
  else if(key==='tab'&&e.shiftKey&&!e.repeat)editor.toggleTransformSnap?.();
  else if('xyz'.includes(key)&&key.length===1&&!e.repeat){
   const wantPlane=e.shiftKey&&mode!=='rotate';
   trackball=false;
   if(axis===key&&plane===wantPlane){
    if(!local)local=true;
    else{axis=null;plane=false;local=false;}
   }else{axis=key;plane=wantPlane;local=false;}
  }else {
   const input=transformNumber(numeric,key);
   if(trackball&&input!==numeric&&input)trackball=false;
   numeric=input;
  }
  label();updatePointer({clientX:lastX,clientY:lastY,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey});
 },true);
 window.addEventListener('keyup',e=>{
  if(mode&&['Shift','Control'].includes(e.key))updatePointer({clientX:lastX,clientY:lastY,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey});
 },true);
 window.addEventListener('pointerdown',e=>{
  if(!mode)return;
  if(![0,1,2].includes(e.button))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(e.button===2)editor.suppressContextMenuUntil=performance.now()+500;
  const frame=editor.viewLayout.navigation;
  if(isConstraintDrag(e)){
   if(frame&&!pickingBase&&editor.viewLayout.at(e.clientX,e.clientY)===frame)auto=startConstraintDrag(e,mode);
   return;
  }
  if(pickingBase){
   if(e.button===2){pickingBase=false;label();return;}
   if(!frame||editor.viewLayout.at(e.clientX,e.clientY)!==frame)return;
   const pivot=states[0].o.getWorldPosition(new THREE.Vector3());
   const base=pickTransformSnapBase(editor,frame,e,pivot);
   if(!base)return;
   snapBase=base;pickingBase=false;lastX=e.clientX;lastY=e.clientY;rebase();
   if(editor.config.getKey('settings/transformSnap')==null)editor.toggleTransformSnap?.();
   label();return;
  }
  finish(e.button===0);
 },true);
 for(const type of ['pointerup','pointercancel'])window.addEventListener(type,e=>{
  if(mode&&endsConstraintDrag(auto,e)){auto=null;e.stopImmediatePropagation();}
 },true);
 window.addEventListener('contextmenu',e=>{if(mode)e.preventDefault();},true);
 return {start,get active(){return mode!==null;}};
}
export { ModalTransform };
