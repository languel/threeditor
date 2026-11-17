# threeditor

threeditor is a lightweight three.js workspace for staging a scene, editing readable JavaScript, and publishing a standalone project. It is based on the three.js r187 editor.

[Open threeditor on GitHub Pages](https://languel.github.io/threeditor/) · [Upstream three.js editor](https://github.com/mrdoob/three.js/tree/dev/editor)

## Run locally

```sh
python3 -m http.server 5300
```

Open `http://127.0.0.1:5300/` with the trailing slash. The hosted editor runs as static ES modules and loads a few libraries from a CDN. Serve it without COEP or COOP headers.

Try the [Fox woodland demo](demos/fox-follow/) for an animated character with a Third Person follow camera. Its **Edit scene** link opens the saved project in the editor.

## Examples, lessons, and saved projects

Open **File → Examples** for a searchable folder tree:

- **threejs** keeps the original Arkanoid, Camera, Particles, Pong, and Shaders demos.
- **lessons** contains six editable projects: spinning cube, scene anatomy, recorded body landmarks, Triadic costumes, paint marks in space, and the Fox woodland loop last. The first five adapt scenes from [threejslessons](https://github.com/languel/threejslessons). Body and costume motion replays the supplied recording; no webcam or tracking-model download is required. Press **Alt/Option+P** to play and open object scripts to edit their exposed parameters.
- **User** contains projects saved in this browser. **File → Save** or **Ctrl/Cmd+S** asks for a name, downloads project JSON, and stores a separate browser copy with the imported source files. A name such as `Studies/Fox` creates nested folders; saving the same path updates that copy. Opening a built-in lesson creates a fresh workspace, so its first save does not replace an earlier User project.

Named projects use IndexedDB independently of the current workspace autosave. **File → New → Empty** does not erase the User folder. The collection belongs to this browser and site address; localhost and GitHub Pages have separate collections. Clearing the site's browser storage removes its local collection. Downloaded JSON retains the serialized scene; use the browser copy or Editable HTML to retain original source assets for later publishing.

The **Assets** sidebar tab (also available from the folder button in the top bar) has three sources: **Project** for files already retained with the scene, **My assets** for a reusable browser library, and **Mediatheque** for the full public catalog at [languel/mediatheque](https://github.com/languel/mediatheque). Search words or exact `#tags`, filter by type and collection, and inspect credits, rights, originals and BVH links. **Catalog connection** accepts another CORS-enabled catalog host.

Select an asset to see its preview and actions in the sidebar, or right-click it for a context menu. Drag an asset onto **Project** to retain its file in the project without adding an object, or onto **My assets** to save a reusable local copy. Drag an image or video onto a scene object to choose a material map; hold **Option/Alt** while dropping to create a plane instead.

Shift-click a folder or asset label, or focus it and press **F2**, to rename it in place. Project labels preserve the original file paths used by scripts and companion files.

Select an asset to preview it in the sidebar. Images show their full frame; video and audio have playback controls; GLB/glTF and math objects have orbitable previews. The model preview lets you play a clip before importing it. Imported files without catalog posters get thumbnails when they can be decoded.

Drag into the viewport to place an asset, or use its **Add** action to place it at the origin. Each format gets an editor object:

- **GLB/glTF:** the original hierarchy, rig, clips, and companion files, with viewer cameras and lights removed. The attached **Model viewer** script exposes two animation clips, blend, speed, time, loop, play, and wireframe controls. The selected model has controls in the editor viewport; they also appear in Play and exports.
- **Images, movies, and webcams:** double-click to assign the default color map to the selected material, or add a plane if no material is selected. Use **Apply to selection…** or drop onto a viewport object or outliner row to choose the map. An empty viewport drop adds a plane. **Add webcam…** and **Add microphone…** create reusable input assets. **Use as input stream** assigns an asset as a named stream.
- **SDF and parametric JSON:** editable code objects built from the mathematical definition, without the archive's viewer scene. Raymarched SDFs use the WebGL renderer.
- **Audio:** playback objects with editable controls.
- **Scans:** Gaussian PLY, SPZ, SOG, RAD and raw SPLAT use the Gaussian renderer. PCD, XYZ and vertex-only PLY become point clouds with editable point size and color. PLY with faces opens as a mesh. Import through **File → Import**, drop files into the editor, or place them from **Assets**.

Use **Edit attached behavior** or the object's **Script** tab to change the script or its parameters. Placement and parameter edits support undo/redo.

**Keep link** stores a lightweight catalog reference; **Save local copy** retains the file and its glTF companions in IndexedDB. Assets used in a scene are copied into that project's source files, preserving attribution and URLs for named User saves and Editable HTML. **My assets** supports folders, moving cards to folders, multi-selection with Ctrl/Cmd/Shift, editable titles/tags, ratings and deletion. Removing a folder moves its assets to the parent; removing a library item does not remove copies already used in projects. Browser collections are specific to the site address and are removed by clearing site storage.


Regenerate the five adapted lesson projects with `node tools/build-lessons.mjs`. The builder and its vendored source modules/recording are in `tools/`; provenance and the adaptation scope are documented in [the lesson notes](editor/examples/lessons/README.md).

**Settings → General → Show object names** overlays names in each viewport pane, including in split view. Press **Shift+L** to toggle the overlay or rebind it in **Settings → Shortcuts**. **Settings → General → Transform gizmo size** changes the size of the move, rotate, and scale handles across projects. It defaults to 75%. **Auto-hide top menu** lets the viewport fill the space up to the top edge, where you can reveal the menu.

Select a Gaussian scan and open **Script → Gaussian Splat** to turn on **Points only** or adjust point size in pixels. This shows one colored point at each Gaussian center. In the Gaussian view, **SH degree** sets how much view-dependent color to use from the file. Degree 0 uses the base color from every angle. Higher degrees can preserve effects such as changes in reflections as you move around, up to the degree stored in the scan.

The outliner uses distinct icons for cameras, projectors, lights, models, groups, meshes, curves, shapes, points, and scans. Click the `<>` icon next to a scripted object to open its code.

## Stock material looks

Choose **Material → Stock look** on a mesh or group. On a mesh, select the material slot first if there is more than one. On a group, the look applies to every existing mesh slot in its enabled hierarchy. Switch to **Preview** to see the shader. Look parameters appear below the selector and include fill color, ink color, and outline width. Click a diamond to keyframe a parameter. On a group with a common look, edits and keys apply to all its mesh material slots.

- **Line drawing** exposes the shade threshold for the ink-and-paper effect.
- **Blueprint** exposes grid frequency and line width.
- **Sketch** exposes hatch frequency and width.
- **Neon** exposes glow intensity, falloff, and rim intensity. Enable **Bloom** to spread the glow.

Choose **Disable look** to restore the material from before the stock look was applied. Older scenes without a saved original restore a standard material. You can undo either operation.

In WebGL, select a mesh and choose **New shader** to open a starter GLSL fragment shader. Open **Material → Program** for the vertex shader or program info. A custom float such as `uniform float gain;` can be added to Program Info as `"gain": { "value": 1 }` under `uniforms`. Use a hex value such as `"#83a9e1"` for a color uniform declared as `vec3`. Numeric, color, and toggle uniforms appear under Material with keyframe diamonds. The shader and its uniforms save with the scene.

## Projection mapping

1. Add a **Projector** from **Add → Light**. Move and rotate the rig to aim it along local **−Z**. The wireframe shows the rectangular projection.
2. Under **Object → Projection**, use **Choose media…** to select an image or video. You can also drag media from **Assets** onto the projector’s outliner row. A new projector starts with a calibration grid.
3. In the projector’s **Script** parameters, set throw ratio (distance divided by image width), aspect ratio, intensity, range, falloff and shadows. Aspect ratio `0` follows the source. Enable **Calibration grid** to check alignment with media already assigned.

Select a projector and click **Object → Set as main camera** to use it for Play, presentation, and exports. **Projector output → Rendered lens view** renders the scene from the projector’s position and optics. **Masked texture** sends the fitted source image, video, or animation with its mask applied. Both modes preserve the lens aspect ratio.

Use **Open texture output** on any projector to send its masked texture to a separate live window while you edit. Move the window to the physical projector’s display and double-click the image for fullscreen. The same masked texture continues to light the virtual scene.

Use a lit mesh material such as MeshStandardMaterial for the projection surface. With renderer shadows enabled, turn on **Cast shadow** for blockers and **Receive shadow** for projection surfaces. The projector illuminates lit meshes. Point clouds and Gaussian splats can serve as spatial references.

Named browser saves and playable exports retain projector settings and source media. **Editable HTML** also retains source files for continued editing.

### Look through a light

Select a projector or light in the viewport’s **View** selector, or select it in the outliner and click **Look through** in **Object**. Projectors and spotlights use their beam framing. Directional lights use the shadow camera’s orthographic bounds, and point, hemisphere, and area lights show a view from the light’s position.

Click **Split view** to keep the **Director** camera on the left and the selected view on the right. Navigate in the left pane. The light pane follows the light’s position, aim, and optics. Choose **Solid** to see the director’s guides and the orange camera and projector bodies. Each lens marks the start of its frustum. Play and exports use the assigned main camera. The split and light panes use the direct renderer while you work.

Select an unlocked projector or spotlight and choose **Object → Edit mask in view**. When looking through the light, use the **Edit light mask** icon in Compact mode or **Edit mask** beside the viewport tool menu in other styles. Draw over the receiver in the light pane, drag the handles, choose **Light inside** or **Block inside**, then apply. In a split view you can check the result from the director at the same time.

### Multi-shape mask editor

Select a projector or spotlight and choose **2D Editors → Mask mode** in the app’s top bar or **Modeling → Open 2D mask editor**. The mask workspace takes the place of the 3D viewport while the Outliner and properties remain available. Open the same menu and choose **3D View** to return. The **Edit light mask** viewport tool still supports drawing directly through the light camera. Draw separate polygons, freehand outlines, rectangles, or ellipses. Double-click the first point or press **Enter** to close a polygon. Drag a vertex to reshape the contour, drag inside a shape to move it, or double-click an edge to insert a point. Use the Push and Smooth brushes to reshape the selected contour. The shape list lets you rename, duplicate, or delete individual shapes.

**Light inside** shapes combine into one aperture. **Block inside** shapes cut holes out of that aperture. A light with only cutouts starts with its full frame. Click **Apply masks** to save the set in one undoable change.

Use **Modeling → Pick scene outline** to search for existing closed Shape and Path objects. **Fit outline to frame** scales a copy into the mask frame. **Project outline in place** uses the current light camera and the outline's scene transform. Both add a shape to the current set.

### Image and vector editing

Choose **2D Editors → Image and vector mode** to draw colored shapes and cutouts with the same tools as the mask editor. **Open reference image** loads a local image for tracing or compositing, and the scene outline picker imports closed shapes. **Apply drawing** saves the vector drawing with the project. The reference image stays open for the editing session.

**Export SVG** saves the vector shapes. **Export PNG** renders a 1024 × 1024 image with the reference included when visible. Toggle **Show reference image** to export the drawing on a transparent background.

### Target silhouettes, warp, and UVs

- Select a projector and choose a receiver mesh under **Modeling → Auto-mask target**. The mask follows the silhouette as you move the projector, adjust the lens, or edit the target. A hand-drawn polygon can further trim the result. The mask also applies to **Masked texture** output.
- Choose **Modeling → Edit projection warp** to adjust the 4 × 4 sampling grid. Drag a handle to choose which source pixel lands at that position in the projector frame, then click **Apply**. Use the calibration grid and look through the projector to check correction on the receiver. **Clear warp** restores the original mapping.
- To map an image onto a mesh material, select the mesh and choose **2D Editors → UV mode** or **Modeling → Edit UVs**. Choose a planar or box layout, or choose a projector to initialize the UVs from its lens. Select **Auto layout**, drag points to refine the mapping, and click **Apply**. Shift-click adds points to the selection. If the material has an image map, it appears behind the UV wireframe.

Try these controls in **DDA Gallery · Lofts and cinema fragments**. Each projector already has a target assigned. To check the physical feed, make a projector the main camera and select **Masked texture** before starting Play. [Gallery walkthrough and sources](editor/examples/gallery/README.md)

### Measure and draw on receivers

Use the **Object mode** and **Edit mode** buttons at the upper left of the viewport, or press **Tab**. Object mode is for selecting and moving objects. Edit mode adds **Surface path** and geometry tools. **Surface Paint**, **Measure**, and light masks work in either mode. Compact mode uses glyphs with hover labels for tools, actions, and toggles, including the ruler controls. Measurements, units, and editable values stay visible.

- **Measure** places rulers on mesh surfaces or the ground. Turn on **Snap vertices** for nearby corners and **Bind to mesh** to follow mesh transforms. Double-click the first point after placing at least three points to close the ruler. Closed rulers also show area. Enter a known total length and choose **Calibrate units** to set the scene’s measurement scale. Select a saved ruler and re-enter Measure to adjust its points.
- **Surface path** places points on one mesh and samples between them when you save. Add points around holes or silhouettes to keep the path on the receiver. Double-click the first point to close the loop before saving. Saved paths can be edited in **Modeling**.
- **Surface Paint** (**1**) follows the visible surface under the brush. One stroke can cross several unlocked meshes, point clouds, or Gaussian scans, and undoes as a single action. Mesh dabs are clipped against the receiver. Scan dabs use the visible point depth to place a small view-facing mark. The marks follow the receiver’s object transform. Pen pressure changes brush width. Use **[** and **]** to change brush size.

Use **Enter** to apply a mask or save a ruler or path, and **Esc** to exit a viewport tool.

## Paths, shapes, and meshes

Selection uses an orange silhouette outline by default. Under **Settings → General → Selection highlight**, choose **Outline + bounds** or **Bounds** when you need a bounding box. Outlines appear in the Director editing view; projector outputs, Preview and Play remain clean. The WebGPU renderer falls back to bounds.

Press **Tab** or click **Edit mode**. The single-column left tool shelf holds drawing tools, **Topology pen**, and **Sculpt brushes**. The active tool has an accent highlight and a tooltip. Mode controls stay at the top-left, transforms and grid settings are centered, and view controls stay at the top-right. Narrow viewports move transforms onto their own centered row. Open the **Mesh and point operations** menu (three dots) for fill, split, weld, extrusion, and deletion. The top toolbar holds transforms, snapping, placement, view, and the **2D Editors** picker. New profiles start on a plane facing the view. Choose **Ground plane** or **Mesh surface** under **Placement** before placing the first point to draw on those planes.

1. Choose **Build mesh** for a polygon or **Draw path** for a smooth curve. Click to place the points, then double-click the first point or press **F** to close it. A closed mesh profile becomes a selected face.
2. Press **E** or choose **Extrude face** or **Extrude outline**. Move the pointer to pull the geometry. **N** toggles free movement and the face normal, **X/Y/Z** constrains it to a world axis, and typing a distance sets an exact amount. Click or press **Enter** to confirm, or **Esc** to cancel the whole operation.
3. Click a mesh face to select it. Shift-click the two ends of a boundary edge and press **E** to pull a connected strip. The new cap or edge remains selected for another pull. Extruding a curve creates a separate mesh and keeps the source curve.

**Add → Mesh** also offers editable objects with starter points. Shift-click point handles to extend the selection, or enter coordinates in **Modeling**. In split view use the Director pane. Press **Tab** to return to Object mode. Extrusion and placement commit together as one undo step.

Right-click with an outline selected to close it, convert a planar path to a shape, or convert a shape back to a path. Conversion creates a separate object. **Fit outline to mask** normalizes the outline for the chosen projector or spotlight. Look through a light and choose **Project outline as mask** to use the outline’s actual position in the light frame.

### Topology pen and sculpting

Select an authored mesh and press **2** to enter Edit mode. Switch on **Topology pen** with **6**. Closing a **Build mesh** profile activates it automatically. Click empty space to start a new face in the same mesh, click corners or existing vertices, then click its first vertex or press **F** to fill it. Click an edge to insert a point at the cursor. Drag a boundary edge to pull out a connected quad, or drag an interior edge or face to move it. **Ctrl-click** a face to insert a vertex. Shift-click vertices to extend the selection and press **M** to weld them. **Esc** cancels the active drag or exits the tool.

**Draw freehand** samples each drag into a separate editable path using the current Placement setting. The tool stays active until you switch tools or press Escape. Blender shortcuts are the default. In Edit mode, **A** selects points, **Alt+A** deselects them, and **X** removes selected authored points. Press **3** or choose **Sculpt brushes** to sculpt an editable mesh, path, or shape. Pick **Grab**, **Push**, **Smooth**, **Relax**, **Pinch**, or **Twist**. Hold **Shift** to smooth during another brush stroke, and **Ctrl** to reverse Pinch and Twist. Relax slides points along the local surface or path to even out spacing. Use **[** and **]** to change the brush radius. Sculpting moves existing points, so denser geometry gives finer detail. Each stroke commits one undo step.

- **Paths** can use straight segments or smooth curves, with open or closed ends. Uncheck **Constrain to local XY** for a spatial curve. Close a planar path to turn it into a filled shape.
- **Shapes** can stay flat or use **Extrusion depth** to become solid projection surfaces.
- **Editable meshes** keep their polygon faces. Select vertices in boundary order to fill a face, select two neighboring vertices to split an edge, or select all vertices of a face to extrude or delete it. The toolbar magnet applies to point placement, handle drags, and selection moves. Choose **Increment** for relative steps or **Grid** to align to the lattice. Vertex, edge, midpoint, perpendicular, face, and object-origin targets can align points to visible geometry. Mesh edge and face targets use the triangle under the pointer. Planar shapes and paths stay on their local XY plane. **Modeling** also supports moving existing vertices on ordinary static meshes with up to 20,000 buffer vertices.
- **Projector masks** use one editable outline in the projector’s **Modeling** tab. Click in the projector frame to draw it, or copy a closed path or shape. Choose **Light inside** for an aperture or **Block inside** for a cutout, then click **Apply mask**. The mask applies to the calibration grid, stills, and video.

Open **File → Examples → Projection mapping** for **Yosemite relief**, **Canyon aperture**, and **Gallop triptych**. Each scene includes its source media and credit. [Example notes](editor/examples/projection/README.md)

Open **File → Examples → Captured spaces** for the DDA gallery survey, the gallery’s pedestal and wall mapping demo, the gallery’s lofted cinema installation, and a Spatial Computing Room alignment study. The scenes bundle the original Mediatheque splats alongside editable reference geometry. [Captured-space examples](editor/examples/gallery/README.md)

## Workspace

- The four icons beside the gear toggle the **Code panel**, **sidebar**, **timeline**, and **transform toolbar**. Double-click a resize bar to collapse its panel. Hover at the corresponding edge for a temporary reveal.
- The **gear** opens **Settings**, with collapsible General, Theme, Shortcuts, and History sections. General holds language, autosave, and an option to auto-hide the top menu; move to the top edge to reveal it. Theme offers System, Light, Dark, Mono Light, Mono Dark, and Warm Dark presets. Adjust the palette colors, enter a name, and choose **Save theme** to keep a custom theme; select a saved theme to edit or delete it. Themes also color the code editor. Hosted editor preferences and autosaved projects are stored in the browser; editable HTML exports include the saved themes.
- Use the outliner’s power icon to disable an object and its children. They leave the rendered scene and their behaviors stop. Turning them back on restores their existing visibility settings.
- The viewport camera dropdown chooses the editor view. To choose the camera used for Play and publishing, select it and click **Object → Set as main camera**. The outliner marks that camera with a star. The top **Director** camera is the fallback when no scene camera is assigned. Added cameras keep their own transforms and can be parented to objects.
- The transform toolbar sits at the top of the viewport. Click an icon for a dropdown, or use **Shift+G** for Grid, **Shift+S** for Snap target, **Alt/Option+,** for Placement, **comma** for orientation, and **period** for pivot. Shortcuts arrange the choices around the pointer. Select a choice with its number or use the arrow keys and Enter. **Alt/Option+G** toggles the grid and **Shift+Tab** toggles the magnet.
- **Placement** controls where new modeling points land. Choose the object’s local plane, a camera-facing plane, the ground, or a mesh surface. A new planar path or shape takes its plane from the first point. Existing planar outlines keep their plane.
- Mouse navigation defaults to **Standard**: left-drag to orbit, Shift-left-drag or right-drag to pan, and scroll to zoom. **Settings → General → Mouse navigation** can switch to Blender middle-mouse navigation independently of the keyboard shortcut preset. Backtick activates WASD fly navigation with either mouse mode.
- The top **Director** camera is the main navigation view: standard mouse navigation and backtick/WASD fly navigation are always available. For scene cameras, **Object → Controller** attaches an editable Orbit, Fly, First Person, or Third Person script for Play and playable exports. Fly uses left-drag to look, WASD to move, Q/E to descend or rise, Shift for faster movement, and the wheel to adjust speed. Orbit keeps the world horizon level. Third Person offers a **Follow target**. Use the **Script** tab to edit the controller or adjust speed, sensitivity, zoom, pan, and follow parameters. Scene cameras start with no controller. Source exports retain the controller preset and parameters; use playable exports for custom script behavior.
- Choose **Solid** for neutral mesh shading with guides, **Materials** for scene materials and projected light with guides, or **Preview** for a clean view. Bloom and Focus are skipped in Solid, Normals, and Wireframe. Switching to Materials or Preview restores the scene’s effect settings. Drag the axis gizmo to orbit the Director camera, or click an axis to align the view. The gizmo is hidden in split and light views. Under **Scene**, an unset background with **Environment → Default** uses procedural studio lighting. A solid background color supplies its own ambient environment. **Equirect** loads an environment image separately.

In **Settings → Shortcuts**, choose **Blender** (the default) or **Basic (Maya)**, search actions and menu commands, and click a binding to record a combination. The × clears a binding; assigning an existing combination clears its previous action. Each preset keeps its own changes. Reset restores that preset's defaults. Keyboard shortcuts are suspended while typing in fields or the code editor.

In the Blender preset, **Shift+A** opens a searchable Add menu at the last viewport pointer position. Right-click the viewport for object actions and Add. Both use the same commands as the main menus, so added objects use their usual positions and can be undone. Search, use arrow keys or click an item; Escape closes the menu.

Press **F3** or **Cmd/Ctrl+K** to open the command palette. Search editor actions and menu commands, then press Enter or use the arrow keys. Both palette bindings can be reassigned in Shortcuts.

With the Blender preset, **G**, **R**, and **S** start a mouse-driven grab, rotate, or scale; **X/Y/Z** constrains an axis, **Shift+X/Y/Z** constrains the perpendicular plane, and typing a number sets an exact amount. Click or Enter accepts; right-click or Escape cancels. While modeling, these shortcuts transform the selected points and each confirmed transform is one undo step. Numpad 1/3/7 set front/right/top views (Ctrl or Cmd for their opposites), Numpad 5 toggles projection, Numpad 0 toggles a scene camera, and Numpad decimal frames the selection.

Middle-drag orbits, Shift+middle-drag pans, and Ctrl+middle-drag zooms. Under General, **Emulate 3-button mouse** allows Option/Alt+left-drag with Shift or Ctrl/Command modifiers for the same actions. Outliner eye controls change standard object visibility (including exports); the pointer disables viewport selection and the lock prevents editor transforms.

Press **` / ~** to fly the camera selected in the viewport camera dropdown, including parented scene cameras. Move with **WASD**, go down/up with **Q/E**, hold **Shift** for speed, use the wheel to adjust speed, and look with the mouse. Enter or click accepts; Escape restores the starting transform. Accepted scene-camera movement is undoable. When pointer lock is unavailable, a notice appears and mouse look uses the free cursor.

The viewport camera dropdown remembers the active scene camera. **Numpad 0** toggles between it and the editor view. **Ctrl+Alt+Numpad 0** aligns the active scene camera to the current view and looks through it. Orbit, pan, and zoom move the camera you are looking through. In a scene camera's **Object** properties, choose **Orbit**, **Fly**, **First Person**, or **Third Person** under **Controller** for Play and published scenes. For Third Person, choose the object to follow.

## Agent API and WebMCP

The editor exposes `window.threeditor.list()` for tool descriptions and `await window.threeditor.call(name, args)` for the same operations available through WebMCP. On browsers that implement WebMCP, tools register automatically through `document.modelContext`; inspect `window.threeditor.webmcp` and await `window.threeditor.ready` for registration status. Unsupported browsers still have the page API. WebMCP is a browser interface, not a standalone MCP server or network relay.

For example, `await threeditor.call('threeditor_object_create', { type: 'box', name: 'Test' })` creates an undoable object; `threeditor_state`, `threeditor_code_get`, `threeditor_code_apply`, and `threeditor_render` support code/render tests. Render returns a PNG data URL; WebMCP returns an image content block. Use `threeditor_asset_store` and `threeditor_asset_import_gltf` for base64 GLB/glTF files, `threeditor_script_set` for object scripts, and `threeditor_export` for base64 packaged ZIP/HTML output. `threeditor_commands`/`threeditor_command` expose editor menu actions, while `threeditor_ui_list`/`threeditor_ui_action` expose ordinary interactive controls. UI references can become stale when a panel redraws; list them again. Applying code executes the Scene contents section and replaces the scene objects, as the Code panel does. Project JSON does not itself contain the original source asset files; use the asset tools or editable HTML for those.

## Code, scripts, and animation

Open **Code** to see the generated scene. Scene changes regenerate the code. Edit the section between `// @key Scene contents` and `// @/key`, then choose **Apply**, press **Ctrl/Cmd+Enter**, or enable **auto** to apply after a pause. Auto is off by default. The Code panel also opens object scripts and material shader editors.

Use `@param` comments in an object script to expose controls under that script in Properties. Numbers can include a range for sliders and dragging. Click and type to enter a value outside that range. Shift-drag makes finer adjustments, and Shift-double-click restores the declared default. Booleans and double-quoted strings are also supported. Read the values from `params` in Play or a playable export.

```js
// @param speed = 1 (0..5)
// @param enabled = true
function update(event) {
  if (params.enabled) this.rotation.y += params.speed * event.delta / 1000;
}
```

For a numeric control, you can also put the range after a top-level constant and read the constant directly. The Script panel stores adjustments separately from the source, so resetting the control restores the declared value.

```js
const speed = 3; /* 0..3 */
function update(event) {
  this.rotation.y += speed * event.delta / 1000;
}
```

Star a control in **Script** to add it to the viewport’s favorites. Hover over the star in the top-right corner or press **Shift+P** to open the menu. The shortcut also works in Play and presentation. In presentation, the star stays hidden and the menu opens at the top-right edge. The project saves your favorites and the current values.

Audio and video expose playback, mute, loop, volume, seek, and speed in the Script panel. Favorite the controls you want to use during playback.

The stock GLB mixer provides one global **Speed** slider, a **Mix** slider for every clip, and a slider for every blendshape. The global speed can be negative for reverse playback. Resetting a blendshape slider to its imported value returns control to the animation.

In **Settings → Code editor**, choose the font, size, ligatures, completion, diagnostics, line numbers, block folding and wrapping. In the code panel, **Cmd/Ctrl + or −** changes font size, **Alt+Z** toggles wrapping, **Alt+Shift+F** formats JavaScript, and **Alt+Shift+M** minimizes the selection or the whole JavaScript document. Formatting respects a selection. A local TypeScript language service supplies JavaScript and three.js r187 completions and selected diagnostics; press **Ctrl+Space** to request suggestions. GLSL has syntax highlighting and keyword completion. Formatting and minimization currently apply to JavaScript, not GLSL or JSON.

For object behavior, select an object and choose **Script → New → Edit**. Each script is enabled by default and can be disabled without removing its code. **Option/Alt+P** runs Play. **Command+Option+P** enters presentation mode and hides the editor chrome. The generated `scene.js` entry on the Scene mirrors the Code panel. Object scripts run in Play and in the playable exports.

```js
function update(event) {
  this.rotation.y += (event.delta / 1000) * Math.PI / 2;
}
```

The script player binds `this` to the script's object. It provides `THREE`, `scene`, `camera`, `renderer`, and `player`. Frame time and delta are in milliseconds. Other handlers include `init`, `start`, `stop`, `keydown`, `keyup`, and the pointer events.

The **bottom timeline** arranges parameter clips and imported animation clips on a shared clock. The **Timeline parameter** dropdown lists channels for the selection, grouped by object name when several objects are selected. Channels include transforms, camera and light settings, materials, texture settings, morph weights, shader uniforms, and declared Script parameters. Scene channels include background, fog, Bloom, and Focus.

- Set the playhead by clicking or dragging the ruler, or enter a **Frame**. Change the value and click its inspector diamond to add a key at that frame. A filled gold diamond marks a key at the current frame. Click it again to remove the key. Hover the field and press **I** to insert or update its key, or use **Insert keyframe** in the timeline for the dropdown or armed properties. Add a second key at another frame to animate between the two. Use **Add clip** to start a separate section.
- Move clips by dragging their bars or editing **Start**. Edit **Length** to trim or extend the clip. Drag a keyframe diamond to move it, or select it to edit its time, value, or interpolation. When overlapping clips address the same parameter, the last clip in the list supplies the value.
- Turn on **Auto Key** in the timeline to insert or update keys at the playhead when you change supported properties. This works with object transforms, numeric and color material settings, shader uniforms, Script parameters, and scene effects. One undo reverses the edit and its keys. Auto Key pauses while the timeline plays or records, and its toggle is remembered across sessions.
- Shift-click an inspector diamond or use **Arm parameter** beside the dropdown to build a set. The timeline lists the armed properties by object. **Record** captures changes to the armed set, or to the dropdown choice when the set is empty. Click an armed property in the timeline to disarm it. Edit values in the inspector, with a gizmo, or through a routed stream, then stop recording to commit the take as one undoable edit.
- Find GLB clips under **Properties → Animations**. Preview or scrub a clip there, or choose **Add to timeline** to schedule it at the current frame. Try the bundled [spinner model](test-models/spinner.glb).

Play and playable exports run the saved timeline. Script parameters attached to live asset behaviors can also be previewed while editing.

## Streams and devices

Open **Streams** to connect MIDI or Web Serial. Add live devices or upload images, movies, and audio in **Assets**, then use **Streams → Assign asset…** to choose an input. Pause releases live capture and keeps the asset assigned. Webcam planes update in the editor and hold the last frame when paused. Choose a named input in MediaPipe and turn on **Enable MediaPipe**. Holistic tracks pose, hands, and face together. The MediaPipe preview overlays landmarks on the selected input, including irises when available. Routes map scalar topics to scene properties, derived topics, MIDI, or serial. Connect and arm hardware output explicitly before using output routes.

**File → Examples → streams** includes Arduino A0, MIDI and audio, video pinboard, pose reach, laser harp, body drum, humanoid pose capture, and a one-line portrait. All eight have previews that run without devices. See the [Streams example guide](editor/examples/streams/README.md) for setup and topic names.

## Publish

| File → Publish | Contents and use |
| --- | --- |
| **Editable HTML (esbuild)** | One file with the editor, scene, and packaged dependencies. Opens from disk in presentation mode. |
| **Playable HTML (esbuild)** | One file with the scene player and enabled object scripts. Opens from disk for playback. |
| **Source project (.zip)** | Readable `main.js`, an HTML entry point, and the local modules, models, textures, and decoders used by the generated scene. |
| **Playable scene (.zip)** | The serialized scene in `app.json`, object scripts, and the local player runtime. |

In **Editable HTML**, hover near the top-right corner to reveal the stack icon and click it to open the editor. **Esc** also opens the editor. On touch, tap the corner once to reveal the icon and again to open it. Set **Project → App → Always show edit icon** before publishing to keep it visible. From the downloaded editor, choose **File → Publish → Editable HTML** to save a new copy with your changes. Use the hosted editor to build the other publish formats.

Serve extracted ZIPs over HTTP. For example, run `python3 -m http.server 8000` in the extracted folder and open `http://localhost:8000`.

Import asset files and their companion files together. Use literal asset paths such as `assets/texture.png` and relative module imports such as `./assets/helper.js` from `main.js`. The publisher checks supported static dependencies before writing the file. For assets or modules loaded through custom runtime code, keep the dependencies local and use paths the publisher can resolve.

## Maintenance

GitHub Pages deploys the static site when `main` is pushed. The [handoff](HANDOFF.md) covers the runtime, export paths, verification, and known gaps.

The bundled formatter in `editor/js/libs/code-tools.js` is built from `tools/code-tools-entry.mjs` with Prettier 3.9.10, Terser 5.51.2, and esbuild: `esbuild tools/code-tools-entry.mjs --bundle --minify --format=esm --target=es2020 --legal-comments=inline --outfile=editor/js/libs/code-tools.js`.
