# Editor lessons

These are editable three.js scenes, rather than embedded lesson webpages.
Open them from **File → Examples → lessons** and press Alt/Option+P to play.
Select an object and use **Script → Edit** to change its code or exposed values.
The Scene's user data records each lesson's source and purpose.

| Order | Project | Source and adaptation |
| --- | --- | --- |
| 00 | A spinning cube | `threejslessons/cube.js`: the normal-material box and its two rotation speeds, exposed as script parameters. |
| 01 | Anatomy of a scene | `01-anatomy.js`: normal, lit and wireframe meshes; lighting; an added scene camera whose frustum the editor can show. |
| 02 | Recorded body landmarks | `02-body.js` / `lib/body.js`: 33 joints and connecting bones animated from the supplied McCracken discus recording. |
| 03 | Triadic costumes | `07-triadic.js` / `lib/costume.js`: the actual Disc and cone, Parasol, and Ball pyramid parts, fitted with the source Body measurements and baked to native animation clips. |
| 04 | Paint marks in space | `09-ghost.js` / `lib/paint.js`: the actual Painter samples recorded hands, head and feet into editable colored line strokes. A script progressively reveals them. |
| — | Stairs with Repeat | A loop adds one tread per iteration, using the loop index to set each tread's position. |
| — | A simulated pinwheel | A fixed-step simulation applies a small rotation to its previous mesh on every step. |
| — | An animated TSL glaze | One moving UV pattern controls both the color and roughness of a ceramic material. |
| — | A keyboard-controlled gate | Keyboard and overlap events move a runner and open a gate through two logic graphs. |
| — | A field-colored wave | One procedural field deforms a grid and colors the resulting ridges through a TSL graph. |
| — | A proximity garden | A distance field and a math expression scale instances scattered over a mesh. |
| — | A stream-reactive sculpture | A stream sample drives a sculpture's scale. The starter graph generates its own signal. |
| — | A tapered curve sweep | A circle profile follows a spiral and shrinks along the path. |
| — | A pointer and gamepad control deck | A switch responds to hover, clicks, or controller input. A deck marker follows pointer hits and joystick movement. |
| — | Reusable ripple groups | Two geometry instances share a ripple formula, a shader group colors the heights, and a logic group turns the surface. |
| — | A generative Empty | Geometry, shading, and keyboard logic are attached to one Empty. |
| — | A bending signal flag | A mesh, pencil stripe, and curve share a skeleton, and a marker follows the tip bone. |
| — | A Rapier pendulum | A dynamic bone swings from a kinematic parent, hits a scene collider, and receives a keyboard impulse. |
| — | A reach-controlled arm | A two-bone IK chain follows a target and pole, with a weighted sleeve and a rigid hand marker. |
| — | A tracking boom | A bone follows a rail, stops at its ends, and aims an attached lamp at a movable target. |
| — | Serpentine particles | Built by `tools/build-stream-examples.mjs` (`examples/lessons/serpentine-particles.app.json` & `examples/streams/serpentine-particles.app.json`): circular *Danse serpentine* (1897) video (with live webcam option) inside a spinning 24-jewel bezel disk with pattern-fading lights, 3D curl-noise particles rising from the floor to frame the video, 4 orrery rings with orb lights, floor sweep lights, bloom/focus, and viewport `★` controls. |
| 05 | Fox woodland loop | The mediatheque fox's Run clip, a woodland trail, and an editable Third Person follow-camera script. See `demos/fox-follow/README.md` for model attribution. |

The source repository is [languel/threejslessons](https://github.com/languel/threejslessons).
`tools/build-lessons.mjs` builds projects 00–04 using the source modules vendored
in `tools/lesson-sources/`. The original `three` import is redirected to this
repository's r187 build. The supplied recording of McCracken's discus throw
(1900) is sampled every fourth frame, preserving the last frame, and omits face
and hand-model arrays that these adaptations do not use.

The original tracking pages' webcam/model loading, UI tabs, depth estimation,
and audio instruments are not included. These five scenes focus on authoring
their objects, materials and recorded motion in the editor. Triadic parts are
baked into standard transform tracks; Paint uses editable polylines rather
than the source page's screen-facing brush ribbons. `Serpentine particles` demonstrates combining custom particle/shader scripts, stage lighting, post-processing, and the Streams driver/event system; it sits right before Fox. Fox is deliberately last
in `ExampleCatalog.js`, with its original GLB retained as a project asset when
opened from the library.

## Node tutorials

### Build stairs with Repeat

1. Open **Stairs with Repeat**, select **Procedural stairs** in the outliner, and choose the **Geometry Nodes** workspace.
2. Change **Iterations** on **Repeat** from 7 to 4. The base tread stays at the bottom, and the loop adds four more.
3. Choose **Open Repeat body**. **Iteration** starts at zero. **Add** adds 1 so the first generated tread sits one step away from the base. The two **Multiply** nodes turn that count into height and depth offsets.
4. Follow **Transform Geometry** into **Join Geometry**. It joins one new tread with the mesh from **Repeat Input**. **Repeat Output** carries the combined mesh into the next iteration.

### Simulate a pinwheel

1. Open **A simulated pinwheel**, select **Simulation pinwheel**, and choose **Geometry Nodes**. Open the **Simulation** body.
2. Follow **Delta Seconds** into **Multiply**. With B at 120, each step turns the geometry by 2 degrees at 60 steps per second.
3. Choose **Play Scene**. The result of each step becomes the geometry input for the next one.
4. Stop Play, halve B to 60, and play again. The pinwheel starts from the same pose and turns half as fast.

### Animate a TSL glaze

1. Open **An animated TSL glaze**, select **Glazed knot**, and choose **Shader Graph**. This project opens with the WebGPU renderer.
2. Adjust A and B on **Mix Color**. **Checker** switches between those colors across the UV surface.
3. Follow the same **Checker** output to **Mix Number**. Its two values become the roughness of the tiles, so each color has a different highlight.
4. Change B on **Multiply** to change the rate of the UV offset. Set it to zero to hold the pattern still.

### Control a gate with Logic Nodes

1. Open **A keyboard-controlled gate** and choose **Play Scene**. Hold the right arrow to move **Runner** into **Gate**. Press Space to reset them.
2. Stop Play, select **Runner**, and open **Logic Nodes**. Find **While Key Is Held** and follow its **Then** link to **Move**. **Scene Time** supplies the time since the previous frame. **Multiply** converts that time into a movement distance.
3. Find **On Overlap**. Its target is **Gate**. When the bounding boxes meet, the **Enter** socket triggers **Send Event** with the name `gate.open`.
4. Select **Gate**. Its **Receive Event** node listens for `gate.open` and calls **Set Position**. Change the action's Y value and try the gate again.

### Color a wave with a geometry field

1. Open **A field-colored wave**, select **Wave surface**, and choose **Geometry Nodes**. Find **Position** and follow X through **Multiply Fields** and **Sine Field**.
2. The next **Multiply Fields** node controls the height of the wave. Try changing B from 0.33 to 0.15 and watch the surface flatten.
3. Follow the second branch from **Sine Field**. It maps the sine values from −1–1 to 0–1 and writes them into the **ridge** attribute.
4. Open **Shader Graph** and trace **Named Attribute** into **Mix Color**. Change A or B to recolor the same surface.

### Scatter a proximity garden

1. Open **A proximity garden**, select **Proximity garden**, and choose **Geometry Nodes**. Hover the canvas and press **Shift+A** to open the searchable catalog.
2. Change **Count** and **Seed** on **Distribute Points on Faces**. The points are sampled on the input plane.
3. Follow **Geometry Proximity** into **Math Expression Field**. X is the closest distance to the sphere. Try `0.18 + 1.1 * exp(-5 * x)` to make the larger instances cluster more tightly.
4. **Instance on Points** uses the result for scale and aligns each cone with the surface normal. **Realize Instances** turns the copies into the modifier's output mesh.

### Drive a sculpture from a stream

1. Open **A stream-reactive sculpture** and choose **Play Scene**. The graph generates a changing `map.pulse` value, so the sculpture moves with no connected device.
2. Stop Play and open **Logic Nodes** on **Stream sculpture**. Follow **On Stream Sample** to **Set Scale**. **Event Value** and **Map Range** turn each sample into a Y scale.
3. Connect a device or a tracked input from **Streams**, then click **Browse stream topics** on **On Stream Sample**. Try a MIDI control such as `midi.cc.1.1`, serial like `serial.A0`, or a landmark coordinate such as `vision.pose.16.x`.
4. Set the input range on **Map Range** to match the device. MIDI control changes use 0–127, and landmark X/Y coordinates are normalized. Start Play to test the graph.
5. Export **Playable HTML** or **Playable ZIP** and serve it from localhost or HTTPS. Open **Live inputs** in the player and connect the same type of input. Move the MIDI control, send the serial signal, or move the tracked landmark to drive the sculpture in the export.

### Sweep a tapered curve

1. Open **A tapered curve sweep**, select **Tapered spring**, and open **Geometry Nodes**. Change **Rotations** on **Spiral** to adjust the path.
2. Follow the path through **Resample Curve** and change **Count** to control how many rings **Curve to Mesh** creates.
3. Change the radius or resolution on **Curve Circle** to edit the cross-section. Disconnect **Scale** to give the spring a constant thickness, or change the coefficient in **Math Expression Field** to adjust the taper.
4. To place repeated meshes along the same path, connect **Resample Curve** to **Curve to Points**, then connect those points to **Instance on Points**.

### Build a pointer and gamepad control deck

1. Open **A pointer and gamepad control deck** and choose **Play Scene**. Hover the blue **Beacon switch** to highlight it, click it to toggle the orange beacon, and click a spot on the green **Navigation deck** to move the marker.
2. Stop and select **Beacon switch** in **Logic Nodes**. **Pointer Over Object** sets the highlight and restores its color on exit. **On Object Press** and **Gamepad Button** feed **Merge Events**, so either input toggles the same beacon.
3. Open the graph on **Navigation deck**. **On Object Press** gates **Set Position by Vector**, which takes the world-space point from **Pointer Ray**. The final **Move** raises the marker above the deck.
4. Play again. With a standard gamepad connected, use its bottom face button to toggle the beacon and its left stick to move the marker. In the marker graph, **Scene Time → Delta Seconds** makes the movement independent of frame rate. Try changing **Dead Zone** or the speed coefficient in either math expression. A pointer is enough to complete the first three steps.

### Reuse a node group

1. Open **Reusable ripple groups**, select **Ripple panel**, and open **Geometry Nodes**. The two **Ripple pass** instances read X and Z, respectively. Change **Amplitude** on one instance to change the ripple along that axis.
2. Select a **Ripple pass** card and press **Tab**. Change the **Math Expression Field** formula from `sin(5*x) * y` to `sin(3*x) * y`. Both instances pick up the new wavelength. Press **Ctrl+Tab** to return.
3. Open **Shader Graph** and edit **Elevation colors**. The group maps local height into the blend between two colors. In **Logic Nodes**, two **Turn panel** instances take different yaw angles. Choose **Play Scene** and use the left and right arrow keys to trigger them.
4. To make your own group, select connected nodes and press **Ctrl/Cmd+G**. Check the sockets on the Group Input and Group Output cards. Press **Shift+A** in the parent graph and search for the group's name to add another instance.

### Generate a mesh from an Empty

1. Open **A generative Empty** and select **Orb generator** in the Outliner. In **Components**, open **Geometry Nodes**. Trace the sphere and ring into **Join Geometry**, then into **Mesh Output**.
2. Open the **Shader Graph** component and change **Color**. Start **Play Scene** and press Space to rotate the Empty and its generated mesh. The **Logic Nodes** component takes its target from **Host Object**.
3. To start from scratch, use **Add → Empty → Plain Axes**. On the Empty, choose **Components → Add Component → Blank Geometry Nodes**. Add a primitive with **Shift+A** and connect its Geometry output to **Mesh Output**.

### Rig a bending signal flag

1. Open **A bending signal flag** and select **Flag armature**. Press **Tab** to enter **Armature Edit Mode**. Select the joint between **Base** and **Tip** and drag it with the Move gizmo. Undo to restore the original rest shape. Choose **Pose Mode** in the viewport mode menu, select **Tip**, and rotate it around Z. With the Blender keymap, **Ctrl+Tab** toggles Pose Mode and **Alt+R** clears pose rotation.
2. Select **Flag mesh**, **Pencil stripe**, or **Curve piping** to inspect the automatic weight binding. **Tip marker** is parented to the **Tip** bone and moves as a rigid piece.
3. Select **Flag armature** and open **Logic Nodes**. Trace **Armature Bone** into the two Rotate actions and **Reset Bone Pose**. Press Left or Right Arrow in Play Scene to bend the flag. Press Space to reset it.
4. Stop Play, select **Flag mesh**, and choose **Armature → Paint Weights**. Paint some of the tip with the **Base** bone to make that area resist the bend. Finish painting and compare the result in Play. Try the same brush on **Pencil stripe** or **Curve piping**.

### Simulate a Rapier pendulum

1. Open **A Rapier pendulum** and choose **Play Scene**. The weight swings under gravity. Press **Space** to push it and **R** to restore the initial pose.
2. Stop Play and select **Swing** in the Outliner. In **Armature**, inspect its dynamic capsule and Z-axis hinge. Change damping and run the scene again.
3. Select **Collision stop** to see its fixed box collider. Select **Pendulum armature** and open **Logic Nodes** to trace the keyboard event through **Apply Bone Impulse** and see how **On Bone Contact** changes the block’s color.

### Pose a reach-controlled arm

1. Open **A reach-controlled arm**. Select **Reach target** in the Outliner and move it. The sleeve bends and the hand follows the target within reach.
2. Move **Elbow pole** to change the direction of the bend. Select **Forearm** and open **Armature** to inspect the target, pole, and chain length. Lower **IK Influence** to blend toward the authored pose.
3. In Play Scene, press **Left** or **Right Arrow** to move the target, **Space** to show the authored pose, and **R** to restore IK. Open Logic Nodes on **Reach armature** to see how those keys drive the rig.

### Constrain a tracking boom

1. Open **A tracking boom**, select **Carriage**, and expand **Armature → Bone Constraints**. **Follow rail** copies the X coordinate from **Rail control**. **Rail stops** clamps the result. **Aim boom** points the bone's +Y axis at **Aim target**. The lamp and spotlight are attached to the bone.
2. Select **Rail stops** and move it up one slot. The rail can now overshoot because **Follow rail** runs after the limit. Undo to restore the limit. Use **Add Constraint** to add Copy Location, Copy Rotation, Copy Scale, Copy Transforms, Limit Location, Limit Rotation, Limit Scale, Limit Distance, or Damped Track. The stack runs top to bottom, and IK runs afterward on its affected bones.
3. In Play Scene, use **Left** and **Right Arrow** to slide the rail control, **Up** and **Down Arrow** to move the aim target, **Space** to mute tracking, and **R** to restore it. The Logic Nodes graph uses **Set Bone Constraint Influence**. Use **Set Bone Constraint Target** to retarget at runtime and enable **Evaluated Pose** on **Bone Pose** to read the result.
4. WebMCP exposes `threeditor_bone_get_constraints` and `threeditor_bone_set_constraints`. The setter takes an ordered array and records one undo step. Preserve existing constraint IDs when editing or reordering them. World Space uses scene coordinates, Local Space uses a bone's rest frame, and Pose Space uses armature coordinates. Inspector angles use degrees and WebMCP angles use radians. Rapier kinematic bones follow the evaluated pose. Dynamic bones remain physics-driven.
