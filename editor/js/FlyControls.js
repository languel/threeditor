import * as THREE from 'three';
import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { hasRestriction } from './ObjectRestrictions.js';

// Fly the actual viewport camera, including cameras under transformed parents.
function FlyControls( editor, viewport ) {
 let camera=null,canvas=null,startPosition,startRotation,worldPosition,yaw=0,pitch=0,roll=0,locked=false,stopping=false,last=0,speed=4;
 const keys=new Set(), euler=new THREE.Euler(0,0,0,'YXZ'), q=new THREE.Quaternion(), parentQ=new THREE.Quaternion(), direction=new THREE.Vector3(), right=new THREE.Vector3();
 const notice=document.createElement('div');notice.className='navigation-notice';notice.hidden=true;viewport.appendChild(notice);
 function refresh(){camera.updateMatrixWorld(true);editor.signals.cameraChanged.dispatch(camera);editor.signals.refreshSidebarObject3D.dispatch(camera);}
 function start(){
  if(camera||editor.modalTransform?.active||document.body.classList.contains('presenting'))return;
  const active=editor.viewportCamera;if(!active?.isCamera||hasRestriction(active,'locked'))return;
  camera=active;canvas=viewport.querySelector('canvas');if(!canvas){camera=null;return;}
  camera.updateWorldMatrix(true,false);startPosition=camera.position.clone();startRotation=camera.rotation.clone();worldPosition=camera.getWorldPosition(new THREE.Vector3());
  euler.setFromQuaternion(camera.getWorldQuaternion(q),'YXZ');yaw=euler.y;pitch=euler.x;roll=euler.z;keys.clear();last=performance.now();locked=false;
  editor.controls.enabled=false;notice.hidden=false;notice.textContent='Fly camera · WASD move · Q/E up/down · Shift faster · wheel speed · Enter/click accept · Esc cancel';
  try { if(!canvas.requestPointerLock)throw new Error('Pointer lock unavailable');const request=canvas.requestPointerLock();request?.catch?.(()=>{if(camera)notice.textContent='Fly camera (pointer unlocked) · WASD move · mouse look · Enter accept · Esc cancel';}); } catch { notice.textContent='Fly camera (pointer unlocked) · WASD move · mouse look · Enter accept · Esc cancel'; }
  requestAnimationFrame(tick);
 }
 function finish(accept){
  if(!camera)return;const current=camera;stopping=true;if(document.pointerLockElement===canvas)document.exitPointerLock();
  if(!accept){current.position.copy(startPosition);current.rotation.copy(startRotation);}
  else if(current!==editor.camera){const cmds=[];if(!current.position.equals(startPosition))cmds.push(new SetPositionCommand(editor,current,current.position,startPosition));if(!current.rotation.equals(startRotation))cmds.push(new SetRotationCommand(editor,current,current.rotation,startRotation));if(cmds.length)editor.execute(cmds.length===1?cmds[0]:new MultiCmdsCommand(editor,cmds));}
  if(accept){current.getWorldDirection(direction);current.getWorldPosition(editor.controls.getCenter(current)).addScaledVector(direction,4);}
  refresh();camera=null;keys.clear();notice.hidden=true;editor.controls.enabled=!editor.modalTransform?.active;stopping=false;
 }
 function tick(now){
  if(!camera)return;const dt=Math.min((now-last)/1000,0.05);last=now;let moving=false;
  euler.set(pitch,yaw,roll,'YXZ');q.setFromEuler(euler);if(camera.parent){camera.parent.getWorldQuaternion(parentQ);q.premultiply(parentQ.invert());}camera.quaternion.copy(q);camera.updateWorldMatrix(true,false);
  camera.getWorldDirection(direction);right.set(1,0,0).applyQuaternion(camera.getWorldQuaternion(q));const step=speed*(keys.has('shift')?3:1)*dt;
  for(const [key,vector,sign] of [['w',direction,1],['s',direction,-1],['d',right,1],['a',right,-1],['e',THREE.Object3D.DEFAULT_UP,1],['q',THREE.Object3D.DEFAULT_UP,-1]])if(keys.has(key)){worldPosition.addScaledVector(vector,step*sign);moving=true;}
  if(moving){camera.position.copy(worldPosition);if(camera.parent)camera.parent.worldToLocal(camera.position);}
  refresh();requestAnimationFrame(tick);
 }
 function key(e,down){if(!camera)return;const k=e.key.toLowerCase();e.preventDefault();e.stopImmediatePropagation();if(down&&k==='escape'){finish(false);return;}if(down&&k==='enter'){finish(true);return;}if(['w','a','s','d','q','e','shift'].includes(k)){if(down)keys.add(k);else keys.delete(k);}}
 window.addEventListener('keydown',e=>key(e,true),true);window.addEventListener('keyup',e=>key(e,false),true);window.addEventListener('blur',()=>keys.clear());
 document.addEventListener('mousemove',e=>{if(!camera)return;yaw-=e.movementX*0.002;pitch=THREE.MathUtils.clamp(pitch-e.movementY*0.002,-Math.PI/2+0.01,Math.PI/2-0.01);});
 document.addEventListener('pointerdown',e=>{if(!camera||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();finish(true);},true);
 document.addEventListener('wheel',e=>{if(!camera)return;e.preventDefault();speed=THREE.MathUtils.clamp(speed*Math.exp(-e.deltaY*0.001),0.05,100);},{passive:false,capture:true});
 document.addEventListener('pointerlockchange',()=>{if(!camera||stopping)return;if(document.pointerLockElement===canvas)locked=true;else if(locked)finish(false);});
 document.addEventListener('pointerlockerror',()=>{if(camera)notice.textContent='Fly camera (pointer unlocked) · WASD move · mouse look · Enter accept · Esc cancel';});
 editor.signals.viewportCameraChanged.add(()=>{if(camera)finish(false);});
 return {start, get active(){return camera!==null;}};
}
export { FlyControls };
