import * as THREE from 'three';
import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import { SetScaleCommand } from './commands/SetScaleCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { hasRestriction, isVisible } from './ObjectRestrictions.js';

function ModalTransform( editor ) {
 let mode=null,states=[],axis=null,plane=false,local=false,numeric='',precision=false,x=0,y=0,startX=0,startY=0,lastX=0,lastY=0;
 const notice=document.createElement('div');notice.className='navigation-notice';notice.hidden=true;document.body.appendChild(notice);
 function label(){notice.textContent=`${mode==='translate'?'Grab':mode==='rotate'?'Rotate':'Scale'}${axis?' · '+(plane?'plane excluding ':'')+axis.toUpperCase()+(local?' local':' global'):''}${numeric?' · '+numeric:''} · X/Y/Z axis · Shift+axis plane · type value · Enter accept · Esc cancel`;}
 function start(next){
  if(mode||editor.flyControls?.active)return;
  const selection=editor.selector.selection.filter(o=>o.parent&&o!==editor.camera&&o!==editor.scene&&isVisible(o)&&!hasRestriction(o,'locked'));
  const objects=selection.filter(o=>!selection.some(parent=>parent!==o&&isAncestor(parent,o)));
  if(!objects.length)return;
  states=objects.map(o=>({o,position:o.position.clone(),rotation:o.rotation.clone(),scale:o.scale.clone()}));mode=next;axis=null;plane=false;local=false;numeric='';precision=false;startX=lastX;startY=lastY;x=0;y=0;editor.controls.enabled=false;notice.hidden=false;label();
 }
 function isAncestor(a,o){for(let p=o.parent;p;p=p.parent)if(p===a)return true;return false;}
 function update(){
  const cam=editor.viewportCamera;cam.updateWorldMatrix(true,false);const q=cam.getWorldQuaternion(new THREE.Quaternion());
  const viewRight=new THREE.Vector3(1,0,0).applyQuaternion(q),viewUp=new THREE.Vector3(0,1,0).applyQuaternion(q);
  const axes={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};
  for(const state of states){const o=state.o;
   if(mode==='translate'){
    const distance=Math.max(0.1,cam.getWorldPosition(new THREE.Vector3()).distanceTo(o.getWorldPosition(new THREE.Vector3())));const factor=distance*0.002;
    let dir=axis?axes[axis].clone():null;if(dir&&local)dir.applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
    const canvas=document.querySelector('#viewport canvas');const rect=canvas.getBoundingClientRect();
    const raycaster=new THREE.Raycaster();const pivot=o.parent?o.parent.localToWorld(state.position.clone()):state.position.clone();
    const normal=dir&&plane?dir.clone():cam.getWorldDirection(new THREE.Vector3());
    const movementPlane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,pivot);
    function intersect(px,py){raycaster.setFromCamera(new THREE.Vector2((px-rect.left)/rect.width*2-1,1-(py-rect.top)/rect.height*2),cam);return raycaster.ray.intersectPlane(movementPlane,new THREE.Vector3());}
    const from=intersect(startX,startY),to=intersect(startX+x,startY+y);
    let offset=from&&to?to.sub(from):viewRight.clone().multiplyScalar(x*factor).addScaledVector(viewUp,-y*factor);
    if(dir){const along=offset.dot(dir);offset=plane?offset.addScaledVector(dir,-along):dir.clone().multiplyScalar(along);if(!plane&&offset.lengthSq()<1e-10&&(x||y))offset.copy(dir).multiplyScalar((x-y)*factor);}
    if(numeric!=='' && numeric!=='-' && numeric!=='.' && numeric!=='-.'){const amount=Number(numeric);if(Number.isFinite(amount)){if(dir&&!plane)offset.copy(dir);else {if(!offset.lengthSq())offset.copy(viewRight);if(dir&&plane)offset.addScaledVector(dir,-offset.dot(dir));if(!offset.lengthSq()&&dir)offset.crossVectors(dir,Math.abs(dir.y)<0.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0));}offset.normalize().multiplyScalar(amount);}}
    else if(precision)offset.multiplyScalar(0.1);
    o.position.copy(state.position);if(o.parent){const base=o.parent.localToWorld(state.position.clone());o.position.copy(o.parent.worldToLocal(base.add(offset)));}else o.position.add(offset);
   }else if(mode==='rotate'){o.rotation.copy(state.rotation);const value=numeric!==''&&Number.isFinite(Number(numeric))?THREE.MathUtils.degToRad(Number(numeric)):x*0.01*(precision?0.1:1);o.rotation[axis||'z']+=value;}
   else {o.scale.copy(state.scale);const f=numeric!==''&&Number.isFinite(Number(numeric))?Number(numeric):1+x*0.01*(precision?0.1:1);if(axis){for(const component of ['x','y','z'])if((component===axis)!==plane)o.scale[component]*=f;}else o.scale.multiplyScalar(f);}
   o.updateMatrixWorld(true);editor.signals.objectChanged.dispatch(o);
  }
 }
 function finish(accept){if(!mode)return;const command=mode==='translate'?SetPositionCommand:mode==='rotate'?SetRotationCommand:SetScaleCommand;const property=mode==='translate'?'position':mode==='rotate'?'rotation':'scale';const commands=[];
  for(const state of states){const current=state.o[property];if(accept&&!current.equals(state[property]))commands.push(new command(editor,state.o,current,state[property]));else if(!accept){current.copy(state[property]);state.o.updateMatrixWorld(true);editor.signals.objectChanged.dispatch(state.o);}}
  mode=null;states=[];notice.hidden=true;editor.controls.enabled=editor.viewportCamera===editor.camera;if(commands.length)editor.execute(commands.length===1?commands[0]:new MultiCmdsCommand(editor,commands));
 }
 window.addEventListener('pointermove',e=>{lastX=e.clientX;lastY=e.clientY;if(mode){x=e.clientX-startX;y=e.clientY-startY;precision=e.shiftKey;update();}},true);
 window.addEventListener('keydown',e=>{if(!mode)return;const k=e.key.toLowerCase();e.preventDefault();e.stopImmediatePropagation();if(k==='escape')finish(false);else if(k==='enter')finish(true);else if(['x','y','z'].includes(k)){const wantPlane=e.shiftKey&&mode!=='rotate';if(axis===k&&plane===wantPlane){if(!local)local=true;else{axis=null;plane=false;local=false;}}else{axis=k;plane=wantPlane;local=false;}label();update();}else if(/^[0-9.]$/.test(k)||k==='-'||k==='backspace'){if(k==='backspace')numeric=numeric.slice(0,-1);else if(k==='-')numeric=numeric.startsWith('-')?numeric.slice(1):'-'+numeric;else if(k!=='.'||!numeric.includes('.'))numeric+=k;label();update();}},true);
 window.addEventListener('pointerdown',e=>{if(!mode)return;if(e.button===0||e.button===2){if(e.button===2)editor.suppressContextMenuUntil=performance.now()+500;e.preventDefault();e.stopImmediatePropagation();finish(e.button===0);}},true);
 window.addEventListener('contextmenu',e=>{if(mode)e.preventDefault();},true);
 return {start,get active(){return mode!==null;}};
}
export { ModalTransform };
