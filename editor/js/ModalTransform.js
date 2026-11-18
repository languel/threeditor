import { transformSnapStep } from './TransformSettings.js?v=top-toolbar';
import * as THREE from 'three';
import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import { SetScaleCommand } from './commands/SetScaleCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { hasRestriction, isVisible } from './ObjectRestrictions.js';

function ModalTransform( editor ) {
 let mode=null,states=[],members=null,axis=null,plane=false,local=false,numeric='',precision=false,x=0,y=0,startX=0,startY=0,lastX=0,lastY=0,commitPreview=null;
 const notice=document.createElement('div');notice.className='navigation-notice';notice.hidden=true;
 function label(){notice.textContent=`${mode==='translate'?'Grab':mode==='rotate'?'Rotate':'Scale'}${axis?' · '+(plane?'plane excluding ':'')+axis.toUpperCase()+(local?' local':' global'):''}${numeric?' · '+numeric:''} · X/Y/Z axis · Shift+axis plane · type value · Enter accept · Esc cancel`;}
 function start(next,commit=null){
  if(mode||editor.flyControls?.active||editor.viewTools?.mode||!editor.renderer)return;
  if(editor.modeling?.editMode){editor.modeling.startModal(next);return;}
  const selection=editor.selector.selection.filter(o=>o.parent&&o!==editor.camera&&o!==editor.scene&&isVisible(o)&&!hasRestriction(o,'locked'));
  if(selection.some(object=>editor.viewportVisibility?.allows(object,editor.viewLayout.navigation)===false))return;
  const objects=selection.filter(o=>!selection.some(parent=>parent!==o&&isAncestor(parent,o)));
  if(!objects.length)return;
  const snapshot=o=>({o,position:o.position.clone(),rotation:o.rotation.clone(),scale:o.scale.clone()});
  const usePivot=next!=='translate' && editor.config.getKey('settings/transformPivot')!=='auto' &&
   editor.selector.usesGroupPivot() && selection.length===editor.selector.selection.length;
  members=usePivot?objects.map(snapshot):null;
  if(usePivot)editor.selector.updateGroup();
  states=(usePivot?[editor.selector.group]:objects).map(snapshot);mode=next;axis=null;plane=false;local=false;numeric='';precision=false;startX=lastX;startY=lastY;x=0;y=0;commitPreview=commit;editor.controls.enabled=false;document.getElementById('viewport').appendChild(notice);notice.hidden=false;label();
 }
 function isAncestor(a,o){for(let p=o.parent;p;p=p.parent)if(p===a)return true;return false;}
 function update(){
  const layout=editor.viewLayout, frame=layout.navigation||layout.frames[0];if(!frame)return;
  const cam=frame.camera;cam.updateWorldMatrix(true,false);const q=cam.getWorldQuaternion(new THREE.Quaternion());
  const viewRight=new THREE.Vector3(1,0,0).applyQuaternion(q),viewUp=new THREE.Vector3(0,1,0).applyQuaternion(q);
  const axes={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};
  const snap=transformSnapStep(editor.config);
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
    if(snap&&numeric===''){
     if(dir&&!plane){const distance=quantize(offset.dot(dir),snap);offset.copy(dir).multiplyScalar(distance);}
     else {offset.set(quantize(offset.x,snap),quantize(offset.y,snap),quantize(offset.z,snap));if(dir)offset.addScaledVector(dir,-offset.dot(dir));}
    }
    o.position.copy(state.position);if(o.parent){const base=o.parent.localToWorld(state.position.clone());o.position.copy(o.parent.worldToLocal(base.add(offset)));}else o.position.add(offset);
   }else if(mode==='rotate'){o.rotation.copy(state.rotation);const value=numeric!==''&&Number.isFinite(Number(numeric))?THREE.MathUtils.degToRad(Number(numeric)):x*0.01*(precision?0.1:1);o.rotation[axis||'z']+=quantize(value,snap?Math.PI/12:null);}
   else {o.scale.copy(state.scale);const raw=numeric!==''&&Number.isFinite(Number(numeric))?Number(numeric):1+x*0.01*(precision?0.1:1);const f=quantize(raw,snap ? .1 : null);if(axis){for(const component of ['x','y','z'])if((component===axis)!==plane)o.scale[component]*=f;}else o.scale.multiplyScalar(f);}
   o.updateMatrixWorld(true);editor.signals.objectChanged.dispatch(o);
  }
 }
 function finish(accept){
  if(!mode)return;
  const commands=[];
  const fields={position:SetPositionCommand,rotation:SetRotationCommand,scale:SetScaleCommand};
  const property=mode==='translate'?'position':mode==='rotate'?'rotation':'scale';
  for(const state of members||states){
   for(const key of (members?Object.keys(fields):[property])){
    const current=state.o[key];
    if(current.equals(state[key]))continue;
    if(accept)commands.push(new fields[key](editor,state.o,current,state[key]));
    else current.copy(state[key]);
   }
   if(!accept){state.o.updateMatrixWorld(true);editor.signals.objectChanged.dispatch(state.o);}
  }
  mode=null;states=[];members=null;notice.hidden=true;editor.controls.enabled=!editor.flyControls?.active;
  const commit=commitPreview;commitPreview=null;
  if(commands.length){
   if(commit)commit();
   else editor.execute(commands.length===1?commands[0]:new MultiCmdsCommand(editor,commands));
  }
  if(editor.selector.usesGroupPivot())editor.selector.updateGroup();
 }

 window.addEventListener('pointermove',e=>{lastX=e.clientX;lastY=e.clientY;if(mode){x=e.clientX-startX;y=e.clientY-startY;precision=e.shiftKey;update();}},true);
 window.addEventListener('keydown',e=>{if(!mode)return;const k=e.key.toLowerCase();e.preventDefault();e.stopImmediatePropagation();if(k==='escape')finish(false);else if(k==='enter')finish(true);else if(['x','y','z'].includes(k)){const wantPlane=e.shiftKey&&mode!=='rotate';if(axis===k&&plane===wantPlane){if(!local)local=true;else{axis=null;plane=false;local=false;}}else{axis=k;plane=wantPlane;local=false;}label();update();}else if(/^[0-9.]$/.test(k)||k==='-'||k==='backspace'){if(k==='backspace')numeric=numeric.slice(0,-1);else if(k==='-')numeric=numeric.startsWith('-')?numeric.slice(1):'-'+numeric;else if(k!=='.'||!numeric.includes('.'))numeric+=k;label();update();}},true);
 window.addEventListener('pointerdown',e=>{if(!mode)return;if(e.button===0||e.button===2){if(e.button===2)editor.suppressContextMenuUntil=performance.now()+500;e.preventDefault();e.stopImmediatePropagation();finish(e.button===0);}},true);
 window.addEventListener('contextmenu',e=>{if(mode)e.preventDefault();},true);
 return {start,get active(){return mode!==null;}};
}
export { ModalTransform };
