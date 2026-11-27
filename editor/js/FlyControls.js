import * as THREE from 'three';
import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import { SetValueCommand } from './commands/SetValueCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { hasRestriction } from './ObjectRestrictions.js';
import { SetLightViewCommand } from './commands/SetLightViewCommand.js';
import { applyFlyLightPose, captureLightView, restoreLightView } from './modeling/LightView.js';

// Fly the actual viewport camera, including cameras under transformed parents.
function FlyControls( editor, viewport ) {
 let camera=null,canvas=null,startPosition,startRotation,startZoom,orbitDistance,worldPosition,yaw=0,pitch=0,roll=0,locked=false,stopping=false,last=0,speed=4;
 let source,director,startLight,targetDistance;
 const keys=new Set(), euler=new THREE.Euler(0,0,0,'YXZ'), q=new THREE.Quaternion(), parentQ=new THREE.Quaternion(), direction=new THREE.Vector3(), right=new THREE.Vector3(), up=new THREE.Vector3();
 const notice=document.createElement('div');notice.className='navigation-notice';notice.hidden=true;viewport.appendChild(notice);
 function refresh(){
  camera.updateMatrixWorld(true);
  if(source)editor.signals.objectChanged.dispatch(source);
  else editor.signals.cameraChanged.dispatch(camera);
  editor.signals.refreshSidebarObject3D.dispatch(source||camera);
 }
 function showNotice( unlocked = false ) {

  const movement = camera.isOrthographicCamera ? 'W/S zoom · A/D and Q/E pan' : 'WASD move · Q/E up/down';
  notice.textContent = 'Fly camera' + ( unlocked ? ' (pointer unlocked)' : '' ) + ' · ' + movement +
   ' · mouse look · Shift faster · wheel speed · Enter/click accept · Esc cancel';

 }
 function start(frame=editor.viewLayout?.navigation||editor.viewLayout?.optical||editor.viewLayout?.frames[0]){
  if(camera||editor.modalTransform?.active||editor.modeling.gesture||editor.modeling.drag||editor.viewTools.pointer||
    editor.streams.playing||document.body.classList.contains('presenting'))return;
  if(!frame?.camera?.isCamera||editor.viewLayout.isViewportPane?.(frame.key)===false)return;
  const active=frame.source||frame.camera;
  if(hasRestriction(active,'locked')||hasRestriction(active,'disabled')||!active.matrixAutoUpdate||
    active.target&&(hasRestriction(active.target,'locked')||!active.target.matrixAutoUpdate))return;
  canvas=editor.renderer?.domElement;if(!canvas)return;
  source=frame.source;
  director=frame.director;
  camera=source?frame.camera.clone(false):active;
  if(source){
   startLight=captureLightView(source);
   targetDistance=source.target?Math.max(.01,source.target.getWorldPosition(direction).distanceTo(camera.position)):4;
  }
  camera.updateWorldMatrix(true,false);startPosition=camera.position.clone();startRotation=camera.rotation.clone();worldPosition=camera.getWorldPosition(new THREE.Vector3());
  startZoom = camera.zoom;
  const center = editor.controls.getCenter( camera );
  orbitDistance = camera.isOrthographicCamera ? up.subVectors( center, worldPosition ).dot( camera.getWorldDirection( direction ) ) : 4;
  if ( orbitDistance <= 0 ) orbitDistance = 4;
  euler.setFromQuaternion(camera.getWorldQuaternion(q),'YXZ');yaw=euler.y;pitch=euler.x;roll=euler.z;keys.clear();last=performance.now();locked=false;
  editor.controls.enabled = false;
  notice.hidden = false;
  showNotice();
  try {

   if ( ! canvas.requestPointerLock ) throw new Error( 'Pointer lock unavailable' );
   const request = canvas.requestPointerLock();
   request?.catch?.( () => { if ( camera ) showNotice( true ); } );

  } catch { showNotice( true ); }
  requestAnimationFrame(tick);
 }
 function finish(accept){
  if(!camera)return;const current=camera;stopping=true;if(document.pointerLockElement===canvas)document.exitPointerLock();
  if(source){
   if(!accept)restoreLightView(source,startLight);
   else {
    const after=captureLightView(source);
    if(JSON.stringify(after)!==JSON.stringify(startLight))editor.execute(new SetLightViewCommand(editor,source,startLight,after));
   }
  } else if ( ! accept ) {

   current.position.copy( startPosition );
   current.rotation.copy( startRotation );
   if ( current.zoom !== startZoom ) {

    current.zoom = startZoom;
    current.updateProjectionMatrix();

   }

  } else if ( ! director ) {

   const commands = [];
   if ( ! current.position.equals( startPosition ) ) commands.push( new SetPositionCommand( editor, current, current.position, startPosition ) );
   if ( ! current.rotation.equals( startRotation ) ) commands.push( new SetRotationCommand( editor, current, current.rotation, startRotation ) );
   if ( current.zoom !== startZoom ) {

    const zoom = new SetValueCommand( editor, current, 'zoom', current.zoom );
    zoom.oldValue = startZoom;
    zoom.updatable = false;
    commands.push( zoom );

   }
   if ( commands.length ) editor.execute( commands.length === 1 ? commands[ 0 ] : new MultiCmdsCommand( editor, commands ), 'Fly camera' );

  }
  if ( accept && ! source ) {

   current.getWorldDirection( direction );
   current.getWorldPosition( editor.controls.getCenter( current ) ).addScaledVector( direction, orbitDistance );

  }
  refresh();camera=source=null;keys.clear();notice.hidden=true;editor.controls.enabled=!editor.modalTransform?.active;stopping=false;
 }
 function tick(now){
  if(!camera)return;const dt=Math.min((now-last)/1000,0.05);last=now;let moving=false;
  euler.set(pitch,yaw,roll,'YXZ');q.setFromEuler(euler);if(camera.parent){camera.parent.getWorldQuaternion(parentQ);q.premultiply(parentQ.invert());}camera.quaternion.copy(q);camera.updateWorldMatrix(true,false);
  const worldRotation = camera.getWorldQuaternion( q );
  right.set( 1, 0, 0 ).applyQuaternion( worldRotation );
  const step = speed * ( keys.has( 'shift' ) ? 3 : 1 ) * dt;
  const forward = Number( keys.has( 'w' ) ) - Number( keys.has( 's' ) );
  const horizontal = Number( keys.has( 'd' ) ) - Number( keys.has( 'a' ) );
  const vertical = Number( keys.has( 'e' ) ) - Number( keys.has( 'q' ) );
  let panStep = step;
  if ( camera.isOrthographicCamera ) {

   if ( forward ) {

    // Moving along the viewing axis only changes clipping in orthographic projection.
    camera.zoom = THREE.MathUtils.clamp( camera.zoom * Math.exp( forward * step / 4 ), 0.0001, 1e6 );
    camera.updateProjectionMatrix();

   }
   // Keep pan speed proportional to the visible area at any zoom level.
   panStep *= ( camera.top - camera.bottom ) / ( 8 * camera.zoom );
   up.set( 0, 1, 0 ).applyQuaternion( worldRotation );

  } else {

   camera.getWorldDirection( direction );
   worldPosition.addScaledVector( direction, step * forward );
   moving = forward !== 0;
   up.copy( THREE.Object3D.DEFAULT_UP );

  }
  if ( horizontal || vertical ) {

   worldPosition.addScaledVector( right, panStep * horizontal ).addScaledVector( up, panStep * vertical );
   moving = true;

  }
  if ( moving ) {

   camera.position.copy( worldPosition );
   if ( camera.parent ) camera.parent.worldToLocal( camera.position );

  }
  if(source)applyFlyLightPose(THREE,source,camera,targetDistance);
  refresh();requestAnimationFrame(tick);
 }
 function key(e,down){if(!camera)return;const k=e.key.toLowerCase();e.preventDefault();e.stopImmediatePropagation();if(down&&k==='escape'){finish(false);return;}if(down&&k==='enter'){finish(true);return;}if(['w','a','s','d','q','e','shift'].includes(k)){if(down)keys.add(k);else keys.delete(k);}}
 window.addEventListener('keydown',e=>key(e,true),true);window.addEventListener('keyup',e=>key(e,false),true);window.addEventListener('blur',()=>keys.clear());
 document.addEventListener('mousemove',e=>{if(!camera)return;yaw-=e.movementX*0.002;pitch=THREE.MathUtils.clamp(pitch-e.movementY*0.002,-Math.PI/2+0.01,Math.PI/2-0.01);});
 document.addEventListener('pointerdown',e=>{if(!camera||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();finish(true);},true);
 document.addEventListener('wheel',e=>{if(!camera)return;e.preventDefault();speed=THREE.MathUtils.clamp(speed*Math.exp(-e.deltaY*0.001),0.05,100);},{passive:false,capture:true});
 document.addEventListener('pointerlockchange',()=>{if(!camera||stopping)return;if(document.pointerLockElement===canvas)locked=true;else if(locked)finish(false);});
 document.addEventListener('pointerlockerror',()=>{if(camera)showNotice(true);});
 editor.signals.viewportCameraChanged.add(()=>{if(camera)finish(false);});
 return {start, get active(){return camera!==null;}};
}
export { FlyControls };
