import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { mathDefinition, mathScript, parametricGeometry } from '../editor/js/assets/MathObjects.js';
import { modelScript } from '../editor/js/assets/ModelBehavior.js';
import { serializeScript, scriptParams } from '../editor/js/ScriptParams.js';
import { generateThreeCode } from '../editor/js/ThreeCodeExporter.js';

test('Mathematical payload extraction strips site scenes, cameras and controls',()=>{
 const payload={title:'Sphere',glsl:'float map(vec3 p){return length(p)-1.0;}',camera:{position:[0,1,5]},scene:{},controls:{}};
 assert.deepEqual(Object.keys(mathDefinition({viewer:{},asset:payload})).sort(),['glsl','title']);
 assert.throws(()=>mathDefinition({scene:{},renderer:{}}));
 const script=mathScript(payload);
 assert.equal(script.assetBehavior,'math');assert.ok(script.source.includes(payload.glsl));assert.ok(!script.source.includes('position:[0,1,5]'));
});
test('Parametric geometry is ordinary, serializable geometry with a bounded resolution',()=>{
 const geometry=parametricGeometry(THREE,(u,v,target)=>target.set(u,v,u*v),{u_bound:1,v_bound:2},12);
 assert.equal(geometry.attributes.position.count,169);assert.ok(geometry.index.count>0);assert.ok(geometry.attributes.normal);
 const restored=new THREE.BufferGeometryLoader().parse(geometry.toJSON());assert.equal(restored.attributes.position.count,169);
});
test('Model behavior exposes clip menus and blends two real animation actions',()=>{
 const root=new THREE.Group(), child=new THREE.Object3D();child.name='animated';root.add(child);
 root.animations=[new THREE.AnimationClip('Idle',1,[new THREE.NumberKeyframeTrack('animated.position[x]',[0,1],[0,2])]),new THREE.AnimationClip('Run',1,[new THREE.NumberKeyframeTrack('animated.position[x]',[0,1],[0,6])])];
 const script=modelScript(root);script.paramValues={showControls:false,blend:0.5};
 assert.deepEqual(scriptParams(script.source).find(f=>f.name==='clipA').options,['Idle','Run']);
 const params=serializeScript(script).parameters;
 const run=new Function('THREE','params','player',script.source+';return {init,update,stop};').call(root,THREE,params,{});
 run.init.call(root);run.update({delta:100});assert.ok(Math.abs(child.position.x-0.4)<0.0001);
 run.stop.call(root);
});
test('Source exports retain shader materials, editable behavior and clip blend settings',()=>{
 const scene=new THREE.Scene(), mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.ShaderMaterial({vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'void main(){gl_FragColor=vec4(1.);}'}));
 mesh.userData.assetObject={type:'math'};scene.add(mesh);
 const script=mathScript({glsl:'float map(vec3 p){return length(p)-1.;}'});
 const output=generateThreeCode({scene,camera:new THREE.PerspectiveCamera(),scripts:{[mesh.uuid]:[script]},config:{getKey(){}}});
 assert.ok(output.code.includes('new THREE.ShaderMaterial'));assert.ok(output.code.includes('Attached editable asset behavior'));assert.ok(output.code.includes('assetUpdates'));
});

test('Source model viewers receive glTF clips and retain the chosen blend',()=>{
 const scene=new THREE.Scene(),root=new THREE.Group();root.name='Fox';root.userData.sourceFile='fox.glb';root.userData.sourceAssetPath='fox.glb';root.userData.assetObject={type:'model',stripPresentation:true};root.add(new THREE.Object3D());
 root.animations=[new THREE.AnimationClip('Walk',1,[]),new THREE.AnimationClip('Run',1,[])];scene.add(root);
 const script=modelScript(root);script.paramValues={clipA:'Walk',clipB:'Run',blend:.35};
 const output=generateThreeCode({scene,camera:new THREE.PerspectiveCamera(),scripts:{[root.uuid]:[script]},sourceFiles:new Map([['fox.glb',{file:new File(['bytes'],'fox.glb'),batch:['fox.glb']}]]),config:{getKey(){}}});
 assert.match(output.code,/\.animations = \w+Gltf\.animations/);assert.ok(output.code.includes('"blend":0.35'));assert.ok(output.code.includes('node.isCamera||node.isLight'));assert.ok(!output.code.includes('one AnimationMixer per animated model'));
});
