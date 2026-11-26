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

## Geometry node tutorials

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
