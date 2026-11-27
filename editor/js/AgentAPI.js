import * as THREE from 'three';
import { AddObjectCommand } from './commands/AddObjectCommand.js';
import { RemoveObjectCommand } from './commands/RemoveObjectCommand.js';
import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import { SetScaleCommand } from './commands/SetScaleCommand.js';
import { SetValueCommand } from './commands/SetValueCommand.js';
import { SetMaterialColorCommand } from './commands/SetMaterialColorCommand.js';
import { SetMaterialValueCommand } from './commands/SetMaterialValueCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { AddScriptCommand } from './commands/AddScriptCommand.js';
import { SetScriptValueCommand } from './commands/SetScriptValueCommand.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { exportThreeArchive, exportPlayableScene, exportPlayableHtml } from './Publish.js';
import { exportEditorHtml } from './EditorHtml.js';
import { armatureBones, bonePoseOffsets, boneRestFrames, boneRestTail, isArmature } from './rigging/Armature.js';
import { addRigBone, attachToBone, bindArmature, commitArmatureWeights, createBoneIKTarget, createRig, editBoneRest, editRigSpaceBoneRest, reparentBone, resetArmaturePose, setBoneConstraints, setChildInverse, setConstraintStack, switchConstraintParent, setBoneIK, setBonePhysics, setBonePose, setRigCollider } from './rigging/ArmatureTools.js';
import { canOwnConstraints, constraintSettings, constraintSpaces, constraintTypes, distanceModes, eulerOrders, resolveConstraint, trackAxes } from './rigging/ArmatureConstraints.js';
import { withArmaturePose } from './rigging/ArmaturePose.js';
import { armatureVertexWeights, weightsForVertexEdits } from './rigging/ArmatureDeformation.js';

// The page API and WebMCP call the same descriptors and handlers.
function AgentAPI( editor ) {
 const tools=[]; const refs=new WeakMap(),elements=new Map(); let nextRef=0; const errors=[];
 for(const level of ['error','warn']){const original=console[level].bind(console);console[level]=(...args)=>{errors.push({source:'console.'+level,message:args.map(value=>value instanceof Error?value.message:String(value)).join(' ')});if(errors.length>100)errors.shift();original(...args);};}
 window.addEventListener('error',e=>{errors.push({message:e.message,source:e.filename,line:e.lineno});if(errors.length>100)errors.shift();});
 window.addEventListener('unhandledrejection',e=>{errors.push({message:String(e.reason?.message||e.reason),source:'promise'});if(errors.length>100)errors.shift();});
 const object=id=>{const o=id===editor.camera.uuid?editor.camera:id===editor.scene.uuid?editor.scene:editor.scene.getObjectByProperty('uuid',id);if(!o)throw new Error('Object not found: '+id);return o;};
 const describe=o=>({uuid:o.uuid,name:o.name,type:o.type,parent:o.parent?.uuid||null,children:o.children.map(c=>c.uuid),position:o.position.toArray(),rotation:o.rotation.toArray().slice(0,3),scale:o.scale.toArray(),visible:o.visible,userData:o.userData,material:o.material?{uuid:o.material.uuid,type:o.material.type,color:o.material.color?.getHexString(),opacity:o.material.opacity,transparent:o.material.transparent}:null});
 const add=(name,description,properties,required,run,readOnly=false)=>tools.push({name:'threeditor_'+name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},run,readOnly});
 const str={type:'string'},vec={type:'array',items:{type:'number'},minItems:3,maxItems:3};
 function vector(v){if(!Array.isArray(v)||v.length!==3||v.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw new Error('Expected three finite numbers');return v;}
 const restVector = description => ( { ...vec, description } );
 const float = description => ( { type: 'number', description } );
 function describeBone( bone ) {

  const rest = bone.userData.armatureBone;
  return {
   uuid: bone.uuid, name: bone.name, parent: bone.parent?.uuid, attached: bone.children.filter( child => ! child.isBone && ! child.userData.runtimeOnly ).map( child => child.uuid ),
   position: bone.position.toArray(), rotation: bone.rotation.toArray().slice( 0, 3 ), scale: bone.scale.toArray(), physics: bone.userData.armaturePhysics || null,
   ik: bone.userData.armatureIK || null,
   constraints: bone.userData.armatureConstraints || [],
   pose: bonePoseOffsets( THREE, bone ),
   rest: rest ? { head: rest.position, tail: boneRestTail( THREE, rest ), roll: rest.roll, length: rest.length, connected: rest.connected } : null
  };

 }
 add( 'armature_create', 'Create a rest-pose armature with one root bone. Selects the new armature and supports undo.', {
  name: { ...str, description: 'Name for the armature object.' },
  position: restVector( 'World location for the armature origin. Defaults to the 3D cursor.' )
 }, [], a => {

  const rig = createRig( editor, a.name, a.position );
  return { uuid: rig.uuid, name: rig.name, bones: armatureBones( rig ).map( describeBone ) };

 } );
 add( 'armature_get', 'Inspect an armature’s bone hierarchy, rest and current pose transforms, and attached scene objects.', {
  uuid: { ...str, description: 'Armature object UUID.' }
 }, [ 'uuid' ], a => {

  const rig = object( a.uuid );
  if ( ! isArmature( rig ) ) throw new Error( 'Expected an authored armature object.' );
  const bones = armatureBones( rig );
  const result = bones.map( describeBone );
  const rest = boneRestFrames( THREE, rig );
  withArmaturePose( THREE, editor.scene, () => bones.forEach( ( bone, index ) => {

   result[ index ].worldHead = bone.getWorldPosition( new THREE.Vector3() ).toArray();
   const length = bone.userData.armatureBone?.length ?? 1;
   result[ index ].worldTail = bone.localToWorld( new THREE.Vector3( 0, length, 0 ) ).toArray();
   result[ index ].evaluatedPose = bonePoseOffsets( THREE, bone );
   const frame = rest.get( bone );
   if ( frame ) result[ index ].rigRest = { head: frame.head.toArray(), tail: frame.tail.toArray() };

  } ) );
  return { uuid: rig.uuid, name: rig.name, bones: result };

 }, true );
 add( 'bone_add', 'Insert a root bone or extrude a child from an existing bone’s tail. Selects the new bone and supports undo.', {
  armature: { ...str, description: 'Armature object UUID.' },
  parent: { ...str, description: 'Parent bone UUID. Omit for a root bone.' },
  name: { ...str, description: 'Bone name. Identical names receive a numeric suffix.' },
  head: restVector( 'Rest head in parent-local space. Omit to start at the parent bone tail or armature origin.' ),
  tail: restVector( 'Rest tail in parent-local space. Defaults to one unit along local Y from the head.' ),
  roll: float( 'Rest roll in radians about the bone’s local Y axis.' )
 }, [ 'armature' ], a => describeBone( addRigBone( editor, object( a.armature ), {
  parent: a.parent === undefined ? undefined : object( a.parent ), name: a.name, head: a.head, tail: a.tail, roll: a.roll
 } ) ) );
 add( 'bone_edit_rest', 'Edit a bone’s rest endpoints and roll while preserving its pose offset. Supports undo.', {
  uuid: { ...str, description: 'Authored bone UUID.' },
  head: restVector( 'Rest head in parent-local space.' ),
  tail: restVector( 'Rest tail in parent-local space.' ),
  roll: float( 'Rest roll in radians about the bone’s local Y axis.' )
 }, [ 'uuid' ], a => {

  const bone = object( a.uuid );
  editBoneRest( editor, bone, a );
  return describeBone( bone );

 } );
 const unitNumber = description => ( { type: 'number', minimum: 0, maximum: 1, description } );
 const limits = description => ( { type: 'array', items: { type: [ 'number', 'null' ] }, minItems: 3, maxItems: 3, description } );
 const readConstraints = owner => {

  if ( ! canOwnConstraints( owner ) ) throw new Error( 'Expected a scene object or authored bone.' );
  const stack = Array.isArray( owner.userData.armatureConstraints ) ? owner.userData.armatureConstraints : [];
  const evaluatedWorld = withArmaturePose( THREE, editor.scene, () => {

   owner.updateWorldMatrix( true, false );
   return owner.matrixWorld.toArray();

  } );
  return { uuid: owner.uuid, evaluatedWorld, constraints: stack, status: stack.map( entry => ( {
   id: entry?.id, error: resolveConstraint( editor.scene, owner, constraintSettings( entry ) ).error ?? null
  } ) ) };

 };
 const constraintArray = {
   type: 'array', items: {
    type: 'object', required: [ 'type' ], additionalProperties: false, properties: {
     type: { ...str, enum: Object.keys( constraintTypes ) },
     id: { ...str, description: 'Stable constraint ID. Omit to assign a new ID.' },
     name: { ...str, description: 'Unique name on this object or bone. Defaults to the constraint label.' },
     target: { ...str, description: 'Target scene object or bone UUID. An empty value leaves a target unassigned.' },
     headTail: unitNumber( 'Target point on a bone from head (0) to tail (1).' ),
     ownerSpace: { ...str, enum: constraintSpaces }, targetSpace: { ...str, enum: constraintSpaces },
     axes: { ...str, description: 'Enabled copy axes as an XYZ subset in order, such as XZ.' },
     invert: { ...str, description: 'Inverted copy axes as an XYZ subset in order.' },
     mix: { ...str, enum: [ 'replace', 'add', 'before', 'after', 'multiply' ] },
     order: { ...str, enum: eulerOrders },
     min: limits( 'Lower bounds for X, Y, Z. Null disables that axis bound. Rotations use radians.' ),
     max: limits( 'Upper bounds for X, Y, Z. Null disables that axis bound. Rotations use radians.' ),
     trackAxis: { ...str, enum: trackAxes },
     distance: { type: 'number', minimum: 0 }, mode: { ...str, enum: distanceModes },
     inverse: { anyOf: [ { type: 'null' }, { type: 'array', items: { type: 'number' }, minItems: 16, maxItems: 16 } ],
      description: 'Child Of inverse matrix in column-major order. Null clears the inverse.' },
     influence: unitNumber( 'Blend strength from zero to one.' ), muted: { type: 'boolean' }
    }
   }
  };

 add( 'bone_get_constraints', 'Inspect a bone’s ordered constraint stack and its target availability.', {
  uuid: { ...str, description: 'Authored bone UUID.' }
 }, [ 'uuid' ], a => {

  const bone = object( a.uuid );
  if ( ! bone.userData.armatureBone ) throw new Error( 'Expected an authored bone.' );
  return readConstraints( bone );

 }, true );
 add( 'bone_set_constraints', 'Replace a bone’s ordered constraint stack in one undo step. An empty array clears the stack.', {
  uuid: { ...str, description: 'Authored bone UUID.' }, constraints: constraintArray
 }, [ 'uuid', 'constraints' ], a => {

  const bone = object( a.uuid );
  return { uuid: bone.uuid, constraints: setBoneConstraints( editor, bone, a.constraints ) };

 } );
 const constraintOwner = { ...str, description: 'Owner UUID for a scene object or authored bone.' };
 const constraintName = { ...str, description: 'Constraint name or stable ID on that owner.' };
 add( 'constraint_get_stack', 'Inspect a scene object or bone’s ordered constraint stack, target availability, and evaluated world matrix.', {
  uuid: constraintOwner
 }, [ 'uuid' ], a => readConstraints( object( a.uuid ) ), true );
 add( 'constraint_set_stack', 'Replace the ordered constraints of a scene object or bone in one undo step. An empty array clears the stack.', {
  uuid: constraintOwner, constraints: constraintArray
 }, [ 'uuid', 'constraints' ], a => {

  const owner = object( a.uuid );
  return { uuid: owner.uuid, constraints: setConstraintStack( editor, owner, a.constraints ) };

 } );
 add( 'constraint_set_inverse', 'Capture the current target pose as a Child Of inverse, or clear a saved inverse. Supports undo.', {
  uuid: constraintOwner, constraint: constraintName, clear: { type: 'boolean', description: 'Clear the inverse instead of capturing it.' }
 }, [ 'uuid', 'constraint' ], a => ( {
  uuid: a.uuid, constraints: setChildInverse( editor, object( a.uuid ), a.constraint, a.clear )
 } ) );
 add( 'constraint_switch_parent', 'Activate a Child Of constraint and disable its siblings while preserving the owner’s evaluated world pose. Supports undo.', {
  uuid: constraintOwner, constraint: constraintName, target: { ...str, description: 'New target UUID. Omit to use the constraint’s assigned target.' }
 }, [ 'uuid', 'constraint' ], a => ( {
  uuid: a.uuid, constraints: switchConstraintParent( editor, object( a.uuid ), a.constraint, a.target )
 } ) );
 add( 'bone_edit_joints', 'Move rest joints in armature-local space. Shared joints stay connected and untouched endpoints stay in place. Supports undo.', {
  uuid: { ...str, description: 'Authored bone UUID.' },
  head: restVector( 'Rest head in armature-local space.' ),
  tail: restVector( 'Rest tail in armature-local space.' ),
  roll: float( 'Roll in radians about the bone’s rest axis.' )
 }, [ 'uuid' ], a => {

  const bone = object( a.uuid );
  editRigSpaceBoneRest( editor, bone, a );
  return describeBone( bone );

 } );
 add( 'bone_set_parent', 'Reparent a bone within its armature. Supports Keep Offset, Connected, and Clear Parent with undo.', {
  uuid: { ...str, description: 'Authored bone UUID.' },
  parent: { ...str, description: 'Parent bone UUID. Omit to make this a root bone.' },
  connected: { type: 'boolean', description: 'Snap the bone head to the parent bone tail. Defaults to false.' }
 }, [ 'uuid' ], a => {

  const bone = object( a.uuid );
  reparentBone( editor, bone, a.parent === undefined ? null : object( a.parent ), a.connected );
  return describeBone( bone );

 } );
 add( 'bone_set_pose', 'Set pose offsets relative to the bone’s own rest frame. Omitted channels keep their values. Supports undo.', {
  uuid: { ...str, description: 'Authored bone UUID.' },
  location: restVector( 'Translation along the bone’s rest axes.' ),
  rotation: restVector( 'XYZ Euler rotation in radians relative to the bone’s rest orientation.' ),
  scale: restVector( 'Scale relative to the rest pose.' )
 }, [ 'uuid' ], a => {

  const bone = object( a.uuid );
  setBonePose( editor, bone, { location: a.location, rotation: a.rotation, scale: a.scale } );
  return describeBone( bone );

 } );
 add( 'armature_reset_pose', 'Restore the rest transforms on one bone or all bones in an armature. Supports undo.', {
  uuid: { ...str, description: 'Armature or bone UUID.' },
  channels: { type: 'string', enum: [ 'all', 'location', 'rotation', 'scale' ], description: 'Channels to clear. Defaults to all.' }
 }, [ 'uuid' ], a => {

  resetArmaturePose( editor, object( a.uuid ), a.channels );
  return { uuid: a.uuid };

 } );
 add( 'bone_attach', 'Parent a scene object to a bone, or clear its bone parent. Supports meshes, strokes, curves, lights, cameras, and other scene objects.', {
  uuid: { ...str, description: 'Object to attach or detach.' },
  bone: { ...str, description: 'Target bone UUID. Omit to clear the bone parent.' },
  keepWorld: { type: 'boolean', description: 'Preserve the object’s world transform at the time of parenting. Defaults to true.' }
 }, [ 'uuid' ], a => {

  const child = object( a.uuid );
  attachToBone( editor, child, a.bone === undefined ? null : object( a.bone ), a.keepWorld );
  return { uuid: child.uuid, parent: child.parent?.uuid };

 } );
 add( 'armature_bind', 'Bind editable geometry to an armature with distance-based weights. Supports meshes, strokes, curves, and points. Omit the armature UUID to clear the binding.', {
  uuid: { ...str, description: 'Geometry object UUID.' },
  armature: { ...str, description: 'Armature object UUID. Omit to clear the binding.' },
  influences: { type: 'integer', minimum: 1, maximum: 4, description: 'Maximum number of bones per vertex. Defaults to four.' }
 }, [ 'uuid' ], a => {

  const target = object( a.uuid );
  bindArmature( editor, target, a.armature === undefined ? null : object( a.armature ), a.influences );
  return { uuid: target.uuid, binding: target.userData.armatureBinding || null };

 } );
 const weightVertices = {
  type: 'array', items: { type: 'integer', minimum: 0 }, minItems: 1, maxItems: 10000,
  description: 'Vertex indices in the object’s current rest geometry.'
 };
 add( 'armature_get_weights', 'Inspect normalized bone influences for rest geometry vertices on a bound mesh, pencil stroke, curve, or point cloud.', {
  uuid: { ...str, description: 'Bound object UUID.' }, vertices: weightVertices
 }, [ 'uuid' ], ( { uuid, vertices } ) => {

  const weights = armatureVertexWeights( THREE, editor.scene, object( uuid ) );
  if ( ! weights ) throw new Error( 'Select geometry bound to an available armature.' );
  const indices = vertices || Array.from( { length: Math.min( 64, weights.position.count ) }, ( _, index ) => index );
  const result = indices.map( index => {

   const sample = weights.at( index );
   if ( ! sample ) throw new Error( 'Vertex index is outside the rest geometry.' );
   const position = new THREE.Vector3().fromBufferAttribute( weights.position, index ).toArray();
   return { index, position, weights: sample };

  } );
  return { uuid, vertexCount: weights.position.count, vertices: result };

 }, true );
 add( 'armature_set_weights', 'Assign a bone’s weight to the selected rest vertices and normalize remaining influences. Supports undo.', {
  uuid: { ...str, description: 'Bound object UUID.' }, bone: { ...str, description: 'Deforming bone UUID.' }, vertices: weightVertices,
  weight: { ...float( 'Desired share for this bone.' ), minimum: 0, maximum: 1 }
 }, [ 'uuid', 'bone', 'vertices', 'weight' ], ( { uuid, bone, vertices, weight } ) => {

  const target = object( uuid );
  const samples = weightsForVertexEdits( THREE, editor.scene, target, bone, vertices, weight );
  commitArmatureWeights( editor, target, samples );
  return { uuid, points: Object.keys( samples ).length };

 } );
 add( 'armature_clear_weights', 'Clear painted weights on a bound object and restore its automatic weighting. Supports undo.', {
  uuid: { ...str, description: 'Bound object UUID.' }
 }, [ 'uuid' ], ( { uuid } ) => { commitArmatureWeights( editor, object( uuid ), null ); return { uuid }; } );
 add( 'bone_set_ik', 'Configure inverse kinematics on a bone. The chain follows a scene object or bone and can bend toward a pole. Supports undo.', {
  uuid: { ...str, description: 'Authored end bone UUID.' },
  target: { ...str, description: 'Target object or bone UUID. An empty string removes the constraint.' },
  pole: { ...str, description: 'Optional pole object or bone UUID. An empty string clears the pole.' },
  chainLength: { type: 'integer', minimum: 0, maximum: 64, description: 'Number of bones to solve. Zero includes all available ancestors.' },
  iterations: { type: 'integer', minimum: 1, maximum: 128, description: 'Maximum iterations for longer chains.' },
  influence: { ...float( 'Blend between the authored pose and the solved pose.' ), minimum: 0, maximum: 1 },
  useTail: { type: 'boolean', description: 'Follow the target with the selected bone’s tail. False follows with the head.' }
 }, [ 'uuid' ], ( { uuid, ...settings } ) => ( { uuid, ik: setBoneIK( editor, object( uuid ), settings ) } ) );
 add( 'bone_create_ik_target', 'Create an Empty at a bone’s evaluated tail and bind it as the IK target in one undoable action.', {
  uuid: { ...str, description: 'Authored end bone UUID.' }
 }, [ 'uuid' ], ( { uuid } ) => {

  const target = createBoneIKTarget( editor, object( uuid ) );
  return { bone: uuid, target: target.uuid, position: target.position.toArray() };

 } );
 add( 'bone_set_physics', 'Configure a Rapier capsule on an authored bone. Dynamic bones can drive weighted geometry and attachments in Play Scene. Supports undo.', {
  uuid: { ...str, description: 'Bone UUID.' },
  mode: { type: 'string', enum: [ 'off', 'kinematic', 'dynamic' ], description: 'Kinematic follows pose controls. Dynamic is driven by the physics world.' },
  radius: { ...float( 'Capsule radius in bone space.' ), minimum: .005, maximum: 100 },
  mass: { ...float( 'Body mass in kg.' ), minimum: .01, maximum: 1e4 },
  damping: { ...float( 'Linear and angular damping.' ), minimum: 0, maximum: 100 },
  gravity: { ...float( 'Gravity multiplier.' ), minimum: - 10, maximum: 10 },
  anchored: { type: 'boolean', description: 'Joint a dynamic root to its armature instead of letting it move freely.' },
  joint: { type: 'string', enum: [ 'ball', 'hinge', 'fixed' ], description: 'Joint connecting a dynamic bone to its parent.' },
  axis: { type: 'string', enum: [ 'X', 'Y', 'Z' ], description: 'Hinge axis in the child bone’s local frame.' },
  limits: { type: 'boolean', description: 'Enable hinge limits.' },
  min: { ...float( 'Lower hinge limit in degrees.' ), minimum: - 180, maximum: 180 },
  max: { ...float( 'Upper hinge limit in degrees.' ), minimum: - 180, maximum: 180 }
 }, [ 'uuid', 'mode' ], ( { uuid, ...settings } ) => ( { uuid, physics: setBonePhysics( editor, object( uuid ), settings ) } ) );
 add( 'armature_set_collider', 'Use a mesh’s local bounding box to collide with Rapier-driven bones during Play Scene. Supports undo.', {
  uuid: { ...str, description: 'Collider mesh UUID.' },
  mode: { type: 'string', enum: [ 'off', 'fixed', 'kinematic' ], description: 'Fixed stays at its start transform. Kinematic follows timeline, node, or script movement.' }
 }, [ 'uuid', 'mode' ], ( { uuid, mode } ) => ( { uuid, collider: setRigCollider( editor, object( uuid ), mode ) } ) );
 add('state','Inspect the scene hierarchy, selection, camera, renderer, keymap and editor state.',{},[],()=>{const objects=[];editor.scene.traverse(o=>objects.push(describe(o)));return {objects,selection:editor.selector.selection.map(o=>o.uuid),editorCamera:describe(editor.camera),viewportCamera:editor.viewportCamera.uuid,shading:editor.viewportShading,renderer:editor.config.getKey('project/renderer/type'),projectTitle:editor.config.getKey('project/title'),keymap:editor.keymap.preset,errors:errors.slice(-20)};},true);
 add('object_get','Inspect a scene object by UUID.',{uuid:str},['uuid'],a=>describe(object(a.uuid)),true);
 add('object_create','Create an ordinary three.js primitive, group, camera or light as an undoable editor action.',{type:{type:'string',enum:['box','sphere','plane','cylinder','cone','group','perspectiveCamera','orthographicCamera','ambientLight','directionalLight','pointLight']},name:str,position:vec},['type'],a=>{const constructors={box:()=>new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()),sphere:()=>new THREE.Mesh(new THREE.SphereGeometry(.5,32,16),new THREE.MeshStandardMaterial()),plane:()=>new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial()),cylinder:()=>new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,1,32),new THREE.MeshStandardMaterial()),cone:()=>new THREE.Mesh(new THREE.ConeGeometry(.5,1,32),new THREE.MeshStandardMaterial()),group:()=>new THREE.Group(),perspectiveCamera:()=>new THREE.PerspectiveCamera(50,1,.1,2000),orthographicCamera:()=>new THREE.OrthographicCamera(-5,5,5,-5,.1,2000),ambientLight:()=>new THREE.AmbientLight(0xffffff,1),directionalLight:()=>new THREE.DirectionalLight(0xffffff,1),pointLight:()=>new THREE.PointLight(0xffffff,1)};if(!constructors[a.type])throw new Error('Unknown object type');const o=constructors[a.type]();o.name=a.name||a.type;if(a.position)o.position.fromArray(vector(a.position));editor.execute(new AddObjectCommand(editor,o));return describe(o);});
 add('object_update','Set an object name, visibility, position, rotation in radians, or scale with undo.',{uuid:str,name:str,visible:{type:'boolean'},position:vec,rotation:vec,scale:vec},['uuid'],a=>{const o=object(a.uuid),commands=[];if(a.position)commands.push(new SetPositionCommand(editor,o,new THREE.Vector3().fromArray(vector(a.position))));if(a.rotation)commands.push(new SetRotationCommand(editor,o,new THREE.Euler(...vector(a.rotation))));if(a.scale)commands.push(new SetScaleCommand(editor,o,new THREE.Vector3().fromArray(vector(a.scale))));for(const k of ['name','visible'])if(a[k]!==undefined){if(typeof a[k]!== (k==='visible'?'boolean':'string'))throw new Error('Invalid '+k);commands.push(new SetValueCommand(editor,o,k,a[k]));}if(commands.length)editor.execute(commands.length===1?commands[0]:new MultiCmdsCommand(editor,commands));return describe(o);});
 add('object_remove','Remove a scene object with undo.',{uuid:str},['uuid'],a=>{const o=object(a.uuid);if(!o.parent||o===editor.scene||o===editor.camera)throw new Error('Cannot remove the scene or editor camera');editor.execute(new RemoveObjectCommand(editor,o));return {removed:a.uuid};});
 add('select','Select an object by UUID, or clear selection.',{uuid:str},[],a=>{if(a.uuid)editor.select(object(a.uuid));else editor.deselect();return {selected:editor.selected?.uuid||null};});
 add('material_update','Update a mesh material color (hex), opacity, and transparency with undo.',{uuid:str,color:str,opacity:{type:'number',minimum:0,maximum:1},transparent:{type:'boolean'}},['uuid'],a=>{const o=object(a.uuid),m=o.material;if(!m||Array.isArray(m))throw new Error('Expected an object with one material');const cmds=[];if(a.color!==undefined){if(!/^#[0-9a-f]{6}$/i.test(a.color)||!m.color)throw new Error('Expected a material color in #rrggbb format');cmds.push(new SetMaterialColorCommand(editor,o,'color',parseInt(a.color.slice(1),16),0));}if(a.opacity!==undefined){if(!Number.isFinite(a.opacity)||a.opacity<0||a.opacity>1)throw new Error('Opacity must be 0–1');cmds.push(new SetMaterialValueCommand(editor,o,'opacity',a.opacity,0));}if(a.transparent!==undefined){if(typeof a.transparent!=='boolean')throw new Error('transparent must be boolean');cmds.push(new SetMaterialValueCommand(editor,o,'transparent',a.transparent,0));}if(cmds.length)editor.execute(cmds.length===1?cmds[0]:new MultiCmdsCommand(editor,cmds));return describe(o);});
 add('camera','Choose the active viewport camera and/or shading.',{uuid:str,shading:{type:'string',enum:['solid','materials','preview','wireframe','normals','realistic']}},[],a=>{if(a.uuid){const c=object(a.uuid);if(!c.isCamera)throw new Error('Object is not a camera');editor.setViewportCamera(c.uuid);}if(a.shading){if(!['solid','materials','preview','wireframe','normals','realistic'].includes(a.shading))throw new Error('Invalid shading');editor.setViewportShading(a.shading);}return {viewportCamera:editor.viewportCamera.uuid,shading:editor.viewportShading};});
 add('scene_settings','Set a solid or default background, default/none environment, and linear/exponential/none fog.',{background:{type:'string',enum:['default','color']},backgroundColor:str,environment:{type:'string',enum:['default','none']},fog:{type:'string',enum:['none','linear','exponential']},fogColor:str,near:{type:'number'},far:{type:'number'},density:{type:'number'}},[],a=>{const hex=(value,fallback)=>{if(value===undefined)return fallback;if(!/^#[0-9a-f]{6}$/i.test(value))throw new Error('Colors must be #rrggbb');return parseInt(value.slice(1),16);};const bg=hex(a.backgroundColor,0x000000),fogColor=hex(a.fogColor,0xaaaaaa);if(a.background)editor.signals.sceneBackgroundChanged.dispatch(a.background==='color'?'Color':'Default',bg,null,null,THREE.NoColorSpace,0,1,0);if(a.environment)editor.signals.sceneEnvironmentChanged.dispatch(a.environment==='default'?'Default':'None');if(a.fog)editor.signals.sceneFogChanged.dispatch({none:'None',linear:'Fog',exponential:'FogExp2'}[a.fog],fogColor,a.near??1,a.far??100,a.density??0.01);editor.signals.sceneGraphChanged.dispatch();return {background:editor.backgroundType,environment:editor.environmentType,fog:editor.scene.fog?.type||null};});
 add('commands','List all editor and menu commands and their current bindings.',{},[],()=>editor.keymap.actions.map(a=>({id:a.id,label:a.label,category:a.category,binding:editor.keymap.combo(a.id)})),true);
 add('command','Run a listed editor/menu command by its ID.',{id:str},['id'],a=>{const action=editor.keymap.actions.find(x=>x.id===a.id);if(!action)throw new Error('Unknown command');action.run();return {executed:a.id};});
 add('code_get','Get the current generated or edited scene JavaScript.',{},[],async()=>({code:(await editor.codePanel.getPublishInputs()).code}),true);
 add('code_apply','Apply scene JavaScript in the editor code format, executing its marked Scene contents section. This replaces scene objects.',{code:str},['code'],async a=>{if(typeof a.code!=='string')throw new Error('code must be a string');const result=await editor.codePanel.applySceneSource(a.code);if(!result.ok)throw new Error(result.error);return result;});
 add('history','Undo or redo the most recent editor action.',{direction:{type:'string',enum:['undo','redo']}},['direction'],a=>{if(!['undo','redo'].includes(a.direction))throw new Error('Invalid direction');editor[a.direction]();return {direction:a.direction};});
 add('script_list','List scripts attached to an object.',{uuid:str},['uuid'],a=>{object(a.uuid);return (editor.scripts[a.uuid]||[]).map((s,index)=>({index,name:s.name,source:s.source,enabled:s.enabled!==false,generated:!!s.generated}));},true);
 add('script_set','Add or update an object script. Scripts run in the playable scene.',{uuid:str,index:{type:'integer',minimum:0},name:str,source:str,enabled:{type:'boolean'}},['uuid'],a=>{const o=object(a.uuid),list=editor.scripts[o.uuid]||[];if(a.index===undefined){if(typeof a.source!=='string')throw new Error('source is required for a new script');const script={name:a.name||'Script',source:a.source,enabled:a.enabled!==false};editor.execute(new AddScriptCommand(editor,o,script));return {index:(editor.scripts[o.uuid]||[]).indexOf(script),...script};}const script=list[a.index];if(!script||script.generated)throw new Error('Script not found or is generated scene code');const cmds=[];for(const key of ['name','source','enabled'])if(a[key]!==undefined)cmds.push(new SetScriptValueCommand(editor,o,script,key,a[key]));if(cmds.length)editor.execute(cmds.length===1?cmds[0]:new MultiCmdsCommand(editor,cmds));return {index:a.index,...script};});
 add('asset_store','Store a named base64 asset for scene code and exports. Paths are relative to assets/.',{path:str,base64:str,mime:str},['path','base64'],a=>{if(typeof a.path!=='string'||!a.path||a.path.startsWith('/')||a.path.split('/').includes('..'))throw new Error('Invalid relative asset path');const bytes=Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0));const file=new File([bytes],a.path,{type:a.mime||'application/octet-stream'});editor.sourceFiles ||= new Map();editor.sourceFiles.set(a.path,{file,batch:[a.path]});return {path:'assets/'+a.path,bytes:file.size};});
 add('asset_list','List source assets retained for scene code and exports.',{},[],()=>[...(editor.sourceFiles||[])].map(([path,entry])=>({path:'assets/'+path,bytes:entry.file.size,type:entry.file.type})),true);
 add('asset_import_gltf','Import a stored GLB or glTF model and its already stored companion files.',{path:str},['path'],async a=>{const path=a.path.replace(/^assets\//,'');const entry=editor.sourceFiles?.get(path);if(!entry||! /\.(glb|gltf)$/i.test(path))throw new Error('Store a .glb or .gltf asset first');const urls=new Map();const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{const key=decodeURIComponent(url.replace(/^assets\//,''));const item=editor.sourceFiles.get(key);if(!item)return url;if(!urls.has(key))urls.set(key,URL.createObjectURL(item.file));return urls.get(key);});try{const loader=new GLTFLoader(manager);const bytes=await entry.file.arrayBuffer();const base='assets/'+(path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):'');const gltf=await loader.parseAsync(bytes,base);const o=gltf.scene;o.name=path.split('/').pop();o.userData.sourceFile=o.name;o.userData.sourceAssetPath='assets/'+path;o.animations=gltf.animations;const batch=[...editor.sourceFiles.keys()].filter(key=>key===path||key.startsWith(path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):'') );for(const key of batch){const item=editor.sourceFiles.get(key);item.batch=batch;}editor.execute(new AddObjectCommand(editor,o));return describe(o);}finally{for(const url of urls.values())URL.revokeObjectURL(url);}});
 add('project_get','Return the complete serializable editor project (scene, cameras, scripts, settings and history).',{},[],()=>editor.toJSON(),true);
 add('project_load','Load a complete editor project JSON, replacing the current project.',{project:{type:'object'}},['project'],async a=>{if(!a.project?.scene||!a.project?.camera)throw new Error('Expected an editor project with scene and camera');editor.clear();await editor.fromJSON(a.project);return {loaded:true};});
 add('ui_list','List interactive editor controls with stable references for ui_action. Set includeHidden to inspect controls in closed panels.',{includeHidden:{type:'boolean'}},[],a=>[...document.querySelectorAll('button,input,select,textarea,[role="button"],details > summary')].filter(el=>a.includeHidden||el.getClientRects().length).map(el=>{let id=refs.get(el);if(!id){id='ui'+(++nextRef);refs.set(el,id);elements.set(id,el);}return {ref:id,tag:el.tagName.toLowerCase(),type:el.type||null,label:el.getAttribute('aria-label')||el.title||el.placeholder||el.closest('.Row')?.querySelector('.Label')?.textContent.trim()||el.textContent.trim().slice(0,100),value:el.type==='checkbox'?el.checked:el.value,options:el.tagName==='SELECT'?[...el.options].map(o=>({value:o.value,label:o.textContent,disabled:o.disabled})):undefined,disabled:!!el.disabled,visible:!!el.getClientRects().length};}),true);
 add('ui_action','Click a listed UI control or set its value. Use the ref returned by ui_list.',{ref:str,action:{type:'string',enum:['click','set']},value:{}},['ref','action'],a=>{const el=elements.get(a.ref);if(!el?.isConnected)throw new Error('Control is stale; call ui_list again');if(el.disabled)throw new Error('Control is disabled');if(a.action==='click')el.click();else if(a.action==='set'){if(el.type==='checkbox')el.checked=!!a.value;else if('value' in el)el.value=String(a.value);else throw new Error('Control has no value');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}else throw new Error('Invalid action');return {ref:a.ref,value:el.type==='checkbox'?el.checked:el.value};});
 add('render','Render the current viewport and return a PNG data URL with dimensions.',{},[],()=>{const canvas=editor.renderer?.domElement;if(!canvas)throw new Error('Viewport renderer not ready');editor.signals.cameraChanged.dispatch(editor.viewportCamera);return {dataUrl:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height};},true);
 add('export','Package a source ZIP, playable ZIP, playable HTML, or editable HTML. Returns base64 data, MIME type, and byte size.',{format:{type:'string',enum:['sourceZip','playableZip','playableHtml','editableHtml']}},['format'],async a=>{let value,mime;if(editor.portable&&a.format!=='editableHtml')throw new Error('This editable HTML can only re-save editable HTML; use the hosted editor to build other export formats');if(a.format==='sourceZip'){const {code,blobs}=await editor.codePanel.getPublishInputs();value=await exportThreeArchive(code,blobs);mime='application/zip';}else if(a.format==='playableZip'){value=(await exportPlayableScene(editor)).zip;mime='application/zip';}else if(a.format==='playableHtml'){value=await exportPlayableHtml(editor);mime='text/html';}else if(a.format==='editableHtml'){value=editor.portable?await editor.portable.save(editor):await exportEditorHtml(editor);mime='text/html';}else throw new Error('Unknown export format');const blob=value instanceof Blob?value:new Blob([value],{type:mime});const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});return {mime,bytes:blob.size,base64:dataUrl.split(',')[1]};});
 function validate(value,schema,path){
  if(schema.type==='object'){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(path+' must be an object');for(const key of schema.required||[])if(!(key in value))throw new Error('Missing required argument: '+key);if(schema.additionalProperties===false)for(const key of Object.keys(value))if(!Object.hasOwn(schema.properties,key))throw new Error('Unknown argument: '+key);for(const [key,child] of Object.entries(schema.properties||{}))if(key in value)validate(value[key],child,path+'.'+key);}
  else if(schema.type==='array'){if(!Array.isArray(value))throw new Error(path+' must be an array');if(schema.minItems!==undefined&&value.length<schema.minItems||schema.maxItems!==undefined&&value.length>schema.maxItems)throw new Error(path+' has invalid length');if(schema.items)value.forEach((item,i)=>validate(item,schema.items,path+'['+i+']'));}
  else if(schema.type==='string'&&typeof value!=='string'||schema.type==='boolean'&&typeof value!=='boolean'||schema.type==='number'&&(typeof value!=='number'||!Number.isFinite(value))||schema.type==='integer'&&!Number.isInteger(value))throw new Error(path+' has an invalid type');
  if(schema.enum&&!schema.enum.includes(value))throw new Error(path+' has an invalid value');if(schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum)throw new Error(path+' is out of range');
 }
 async function call(name,args={}){await editor.startupReady;const tool=tools.find(t=>t.name===name);if(!tool)throw new Error('Unknown tool: '+name);validate(args,tool.inputSchema,'arguments');return await tool.run(args);}
 const api={list:()=>tools.map(({name,description,inputSchema,readOnly})=>({name,description,inputSchema,readOnly})),call,webmcp:{status:'initializing',error:'',count:0}};
 async function register(){const mc=document.modelContext||navigator.modelContext;if(!mc?.registerTool){api.webmcp.status='unsupported';return;}const controller=new AbortController();try{for(const t of tools)await mc.registerTool({name:t.name,description:t.description,inputSchema:t.inputSchema,annotations:{readOnlyHint:t.readOnly},execute:async args=>{try{const result=await call(t.name,args||{});if(t.name==='threeditor_render'){const data=result.dataUrl.split(',')[1];return {content:[{type:'image',data,mimeType:'image/png'},{type:'text',text:JSON.stringify({width:result.width,height:result.height})}]};}return {content:[{type:'text',text:JSON.stringify(result)}]};}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}}},{signal:controller.signal});api.webmcp.status='registered';api.webmcp.count=tools.length;}catch(e){controller.abort();api.webmcp.status='error';api.webmcp.error=e.message;}}
 api.ready=Promise.all([register(),editor.startupReady]);return api;
}
export { AgentAPI };
