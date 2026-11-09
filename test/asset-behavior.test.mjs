import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../build/three.module.js';
import { mathDefinition, mathScript, parametricGeometry } from '../editor/js/assets/MathObjects.js';
import { modelScript } from '../editor/js/assets/ModelBehavior.js';
import { serializeScript, scriptParams, scriptSourceForExecution } from '../editor/js/ScriptParams.js';
import { generateThreeCode } from '../editor/js/ThreeCodeExporter.js';
import { hasRestriction, isVisible, withEnabledObjects } from '../editor/js/ObjectRestrictions.js';

test('Disabled groups hide their descendants without changing saved visibility', () => {
 const scene = new THREE.Scene(), group = new THREE.Group();
 const geometry = new THREE.BoxGeometry();
 const visible = new THREE.Mesh(geometry), hidden = new THREE.Mesh(geometry);
 hidden.visible = false;
 group.name = 'Disabled group';
 group.userData.threeditor = {disabled:true};
 group.add(visible, hidden);
 scene.add(group);
 assert.equal(hasRestriction(visible, 'disabled'), true);
 assert.equal(isVisible(visible), false);
 assert.throws(() => withEnabledObjects(scene, () => {
  const rendered = [];
  scene.traverseVisible(object => rendered.push(object));
  assert.deepEqual(rendered, [scene]);
  throw new Error('render interrupted');
 }), /render interrupted/);
 assert.equal(group.visible, true);
 assert.equal(visible.visible, true);
 assert.equal(hidden.visible, false);
 const restored = new THREE.ObjectLoader().parse(scene.toJSON());
 assert.equal(restored.children[0].userData.threeditor.disabled, true);
 const script = mathScript({glsl:'float map(vec3 p){return length(p)-1.;}'});
 const output = generateThreeCode({scene,camera:new THREE.PerspectiveCamera(),scripts:{[visible.uuid]:[script]},config:{getKey(){}}});
 assert.match(output.code, /disabledGroup\.visible = false/);
 assert.ok(!output.code.includes('Attached editable asset behavior'));
 group.userData.threeditor.disabled = false;
 assert.equal(isVisible(visible), true);
 assert.equal(isVisible(hidden), false);
});

test('Inline numeric controls use saved values without editing the script source', () => {
 const source = 'const x = 3; /* 0..3 */\nconst y = -2; /* -4..4 */\n// @param enabled = true\nfunction init() { const x = 9; /* 0..9 */ return params.enabled ? [x, y] : []; }';
 const script = serializeScript({source, paramValues:{x:1, y:-7}});
 assert.deepEqual(scriptParams(source).map(field => field.name), ['enabled', 'x', 'y']);
 assert.deepEqual(script.parameters, {enabled:true});
 assert.equal(script.source, source);
 const execute = new Function('params', scriptSourceForExecution(script) + '\nreturn [x, init()];');
 assert.deepEqual(execute(script.parameters), [1, [9, -7]]);
 assert.equal(scriptSourceForExecution({source}), source);
});

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
test('The model mixer applies all clip weights, one speed and manual blendshape overrides', () => {
 const root = new THREE.Group();
 const geometry = new THREE.BoxGeometry();
 const smile = geometry.attributes.position.clone();
 smile.name = 'Smile';
 geometry.morphAttributes.position = [smile];
 const child = new THREE.Mesh(geometry);
 child.name = 'Face';
 root.add(child);
 root.animations = [2, 6, 10].map((slope, index) => new THREE.AnimationClip('Clip ' + index, 1, [
  new THREE.NumberKeyframeTrack('Face.position[x]', [0, 1], [0, slope]),
  new THREE.NumberKeyframeTrack('Face.morphTargetInfluences[Smile]', [0, 1], [0, 1])
 ]));
 const script = modelScript(root);
 script.paramValues = {mix_0:0.5, mix_1:0.25, mix_2:0.25, speed:2, morph_0:0.7};
 const fields = scriptParams(script.source);
 assert.deepEqual(fields.filter(field => field.name.startsWith('mix_')).map(field => field.label), ['Clip 0 mix', 'Clip 1 mix', 'Clip 2 mix']);
 assert.equal(fields.find(field => field.name === 'morph_0').label, 'Face · Smile');
 assert.equal(fields.find(field => field.name === 'speed').slider, true);
 const { parameters } = serializeScript(script);
 const run = new Function('THREE', 'params', script.source + ';return behavior;').call(root, THREE, parameters);
 run.init();
 run.update({delta:100});
 assert.ok(Math.abs(child.position.x - 1) < 1e-6);
 assert.equal(child.morphTargetInfluences[0], 0.7);
 run.setParameters({...parameters, mix_0:0, mix_1:1, mix_2:0, morph_0:0});
 assert.ok(Math.abs(child.position.x - 1.2) < 1e-6);
 assert.ok(Math.abs(child.morphTargetInfluences[0] - 0.2) < 1e-6);
 script.paramValues = {...script.paramValues, speed:-1, mix_0:3, mix_1:1, mix_2:0, morph_0:0};
 run.setParameters(serializeScript(script).parameters);
 run.update({delta:100});
 assert.ok(Math.abs(child.position.x - 0.3) < 1e-6);
 run.stop();
});
test('Source exports retain shader materials, editable behavior and clip blend settings',()=>{
 const scene=new THREE.Scene(), mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.ShaderMaterial({vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'void main(){gl_FragColor=vec4(1.);}'}));
 mesh.userData.assetObject={type:'math'};scene.add(mesh);
 const script=mathScript({glsl:'float map(vec3 p){return length(p)-1.;}'});
 const output=generateThreeCode({scene,camera:new THREE.PerspectiveCamera(),scripts:{[mesh.uuid]:[script]},config:{getKey(){}}});
 assert.ok(output.code.includes('new THREE.ShaderMaterial'));assert.ok(output.code.includes('Attached editable asset behavior'));assert.ok(output.code.includes('assetUpdates'));
});

test('Source model viewers receive glTF clips and retain manual mix weights',()=>{
 const scene=new THREE.Scene(),root=new THREE.Group();root.name='Fox';root.userData.sourceFile='fox.glb';root.userData.sourceAssetPath='fox.glb';root.userData.assetObject={type:'model',stripPresentation:true};root.add(new THREE.Object3D());
 root.animations=[new THREE.AnimationClip('Walk',1,[]),new THREE.AnimationClip('Run',1,[])];scene.add(root);
 const script=modelScript(root);script.paramValues={mix_0:.65,mix_1:.35};
 const output=generateThreeCode({scene,camera:new THREE.PerspectiveCamera(),scripts:{[root.uuid]:[script]},sourceFiles:new Map([['fox.glb',{file:new File(['bytes'],'fox.glb'),batch:['fox.glb']}]]),config:{getKey(){}}});
 assert.match(output.code,/\.animations = \w+Gltf\.animations/);assert.ok(output.code.includes('"mix_1":0.35'));assert.ok(output.code.includes('node.isCamera||node.isLight'));assert.ok(!output.code.includes('one AnimationMixer per animated model'));
});
