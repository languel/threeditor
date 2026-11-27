# threeditor editor and modeling reference

[Back to threeditor](../README.md) · [Projection mapping](projection-mapping.md) · [Interactive scenes](interactive-scenes.md)

## Workspaces

The top bar opens Layout, Modeling, Sculpting, UV Editing, Image & Vector, Paint, Geometry Nodes, Shading, Shader Graph, Animation, Scripting, Logic Nodes, and Projection views of the same project. **Layout** gives the viewport more room with a compact timeline. **Animation** expands the timeline for clips and keyframes. **Scripting** opens the Script Window editor area, and **Projection** opens a split light view when a projector or spotlight is selected. Compact mode uses workspace glyphs with tooltips. Clean and Default modes show workspace names.

Use the viewport mode picker for **Object**, **Edit**, **Sculpt**, and **Paint**. Workspace tabs arrange tools and editors for a task.

## Examples, lessons, and saved projects

Open **File → Examples** for a searchable folder tree:

- **threejs** keeps the original Arkanoid, Camera, Particles, Pong, and Shaders demos.
- **lessons** contains six editable projects: spinning cube, scene anatomy, recorded body landmarks, Triadic costumes, paint marks in space, and the Fox woodland loop last. The first five adapt scenes from [threejslessons](https://github.com/languel/threejslessons). Body and costume motion replays the supplied recording; no webcam or tracking-model download is required. Use **Play Scene** in the top bar and open object scripts to edit their exposed parameters.
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


Regenerate the five adapted lesson projects with `node tools/build-lessons.mjs`. The builder and its vendored source modules/recording are in `tools/`; provenance and the adaptation scope are documented in [the lesson notes](../editor/examples/lessons/README.md).

**Settings → General → Show object names** overlays names in each viewport pane, including in split view. Press **Alt+Shift+L** in the Blender preset or **Shift+L** in the Basic preset to toggle the overlay, or rebind it in **Settings → Shortcuts**. **Settings → General → Transform gizmo size** changes the size of the move, rotate, and scale handles across projects. It defaults to 75%. **Auto-hide top menu** lets the viewport fill the space up to the top edge, where you can reveal the menu.

Select a Gaussian scan and open **Components → Gaussian Splat** to turn on **Points only** or adjust point size in pixels. This shows one colored point at each Gaussian center. In the Gaussian view, **SH degree** sets how much view-dependent color to use from the file. Degree 0 uses the base color from every angle. Higher degrees can preserve effects such as changes in reflections as you move around, up to the degree stored in the scan.

Use **Min. opacity** to cut low-opacity splats as a confidence proxy. **Min. splat size** and **Max. splat size** compare the longest Gaussian standard-deviation axis in scan-local units. A zero threshold disables that filter. These reversible filters apply in both Gaussian and Points only views and leave the imported scan data intact.

The outliner uses distinct icons for cameras, projectors, lights, models, groups, meshes, curves, shapes, points, and scans. Click the `<>` icon next to a scripted object to open its code.

## Stock material looks

Choose **Material → Stock look** on a mesh or group. On a mesh, select the material slot first if there is more than one. On a group, the look applies to every existing mesh slot in its enabled hierarchy. Switch to **Preview** to see the shader. Look parameters appear below the selector and include fill color, ink color, and outline width. Click a diamond to keyframe a parameter. On a group with a common look, edits and keys apply to all its mesh material slots.

- **Line drawing** exposes the shade threshold for the ink-and-paper effect.
- **Blueprint** exposes grid frequency and line width.
- **Sketch** exposes hatch frequency and width.
- **Neon** exposes glow intensity, falloff, and rim intensity. Enable **Bloom** to spread the glow.

Choose **Disable look** to restore the material from before the stock look was applied. Older scenes without a saved original restore a standard material. You can undo either operation.

In WebGL, select a mesh and choose **New shader** to open a starter GLSL fragment shader. Open **Material → Program** for the vertex shader or program info. A custom float such as `uniform float gain;` can be added to Program Info as `"gain": { "value": 1 }` under `uniforms`. Use a hex value such as `"#83a9e1"` for a color uniform declared as `vec3`. Numeric, color, and toggle uniforms appear under Material with keyframe diamonds. The shader and its uniforms save with the scene.

## Shader Graph

Select a mesh with a Standard or Physical material, choose the **Shader Graph** workspace, and click **New shader graph**. Select a material slot in the header when the mesh has more than one. Use **Use WebGPU** to enable the project's node-capable renderer. **Material Preview** and **Preview** show the graph alongside the editor, and **Play Scene** and playable exports use the same material.

The **Material Output** node accepts base color, roughness, metalness, emission, opacity, normal, and vertex position. Unconnected inputs use the material's existing settings. Use **Checker** or **Perlin Noise** to drive **Mix Color**, or use **Base Color Texture** to sample the map assigned in the Material tab. **Transform UV** sets the pattern scale and offset. **Time** can drive an offset or another numeric socket.

Graphs save with the material, so meshes sharing that material also share its graph. Graph edits and removal support undo. In a WebGL project, the authored material supplies the fallback appearance. [Animated TSL glaze tutorial](../editor/examples/lessons/README.md#animate-a-tsl-glaze)

## Logic Nodes

Select an object or the Scene, open **Logic Nodes**, and choose **New logic graph**. Connect the orange **Then** socket of an event to an action's **Run** socket, then choose **Play Scene**. Use the action's **Target** picker to choose another object. **Self** refers to the object that owns the graph.

Events can fire on start, every frame, at an interval, or in response to keyboard, pointer, or overlap input. **On Overlap** compares the objects' bounding boxes and emits separate **Enter** and **Exit** events. A key input uses a physical key code such as `Space` or `ArrowRight`. Use **Scene Time → Delta Seconds** to make movement independent of frame rate.

Use **Branch** with a Boolean condition or **Sequence** to run two chains in order. **Delay** schedules work for a future frame and allows feedback through **Merge Events**. **Send Event** and **Receive Event** pass named events between graphs and the Streams event bus. **Event Value** reads the numeric payload of the current event. **Set Variable** and **Get Variable** store numbers in the graph's playback instance.

Graph changes save with the project and support undo. In Play, the graphs act on the playback scene. Stop and play again to restart from the authored scene. [Keyboard-controlled gate tutorial](../editor/examples/lessons/README.md#control-a-gate-with-logic-nodes)

## 2D and 3D areas

Opening **UV Editing**, **Image & Vector**, **Geometry Nodes**, or **Scripting** from the workspace bar puts that editor beside the 3D view. Mask and Warp also open in split panes. Switching between editor workspaces keeps the split direction and divider position. Each pane has its own editor-type picker, so you can use two different editors side by side or switch either back to a 3D viewport. Changing the 3D interaction mode keeps the companion pane open.

Drag the divider or use its arrow keys to resize. Right-click an editor header and choose **Close Area** to give the other pane the full space. The **Split View** dropdown and divider menus also let you change the split direction, swap panes, or choose which area to keep. Focus a divider and press **Shift+F10** to open the menu with the keyboard. Switching to **Layout** collapses an editor split when both remaining panes would show the same Director view.

The UV editor follows the selected editable mesh while its current layout is clean. An unapplied UV draft stays attached to its current mesh, named in the editor header. Apply the draft before selecting another mesh to continue. Click inside the 3D area to select mesh elements and use modeling shortcuts there. Edit Mode draws selected vertices as small orange dots, selected edges in orange, and selected faces with an orange tint.

Turn on **Sync UV and mesh selection** in the UV toolbar to share selection with the 3D pane for the active mesh in Edit Mode. The 3D vertex, edge, or face mode determines what UV selection sends back to the mesh. Select both UV endpoints to select an edge, or all its corners to select a face. Selecting an element in 3D highlights its UV copies across seams.

## Geometry Nodes

Select a mesh, open **Geometry Nodes**, and choose **New graph**. The starter graph passes **Mesh Input** to **Mesh Output**. Insert **Transform Geometry** between them or connect a **Box**, **Sphere**, **Grid**, or **Cylinder** directly to **Mesh Output**. **Join Geometry** combines two meshes, and **Set Material Index** assigns a branch to one of the object's material slots. **Number**, **Add**, and **Multiply** can drive sockets such as translation and radius.

Drag between sockets or click a socket at each end. A new link replaces the existing link at that input. Use the × beside a linked input to disconnect it. Drag a node by its title, drag empty space to pan, scroll to zoom, and use **Frame all** to bring the nodes into view.

The graph runs at its position in the mesh’s **Modifiers** stack. A disconnected output shows the geometry going into the modifier. Undo restores graph edits and node positions. Project JSON and Editable HTML retain the editable graph, and Play uses the evaluated mesh. Use the modifier’s apply action to bake the graph into the mesh.

### Fields and named attributes

**Position**, **Normal**, **Index**, and **Random Field** vary per vertex. Connect them through field math to **Set Position** for a deformation, or use **Greater Than Field** to select which vertices move. Field sockets also accept constant numbers, and **Constant Field** converts a linked Number or math result into a field.

**Store Named Attribute** writes a scalar field to the mesh. **Read Named Attribute** reads it in a later geometry step. The Shader Graph's **Named Attribute** can use the same value to drive color, roughness, or another numeric socket. [Field-colored wave tutorial](../editor/examples/lessons/README.md#color-a-wave-with-a-geometry-field)

### Repeat and Simulation

**Repeat** runs its body for the number of **Iterations** you set. Open the body on the node card. **Repeat Input** provides the geometry and numeric value carried from the previous iteration, plus a zero-based **Iteration** count. Connect the updated state to **Repeat Output**. The node returns the final state to the parent graph. Zero iterations pass through the starting state, and a Repeat body can contain another Repeat.

**Simulation** carries geometry and a numeric value between fixed steps during **Play Scene**, video rendering, and playable exports. **Simulation Input** supplies the previous state, **Delta Seconds**, elapsed time, and the step number. **Simulation Output** becomes the state for the next step. The editor shows the authored starting state, and restarting Play starts the simulation from that state. Simulation zones live in the main geometry graph and can contain Repeat nodes in their bodies.

Open **File → Examples → lessons → Stairs with Repeat** or **A simulated pinwheel** to inspect complete graphs. [Node lessons](../editor/examples/lessons/README.md#node-tutorials)

## Split views

In the 3D viewport, open the command palette with **F3**. **Vertical Split** places two areas side by side. **Horizontal Split** stacks them. Drag the divider to resize the areas, or focus it and use the arrow keys. Right-click a 3D pane and choose **Close Pane** to expand the other pane. You can also hover a pane and run **Close Area** from the command palette.

Both areas share object and mesh selection. Frame Selection and double-click framing update both Director views. A pane using a scene camera, light, or projector shows the shared selection from its own view. Select a source in the viewport camera menu to compare it with the Director. The split direction and divider position are saved with the project.

## Outliner and Properties

The Outliner stays above Properties, with a divider you can drag or resize with the arrow keys. Search filters the hierarchy and includes parents of matching objects. The vertical icon rail below the Outliner contains Scene and the property tabs that apply to the selection. Assets, Streams, Project, and Settings sit below the divider in the same rail. Open **Scene** for Background, Environment, Fog, Bloom, and Focus.

Use the editor-type glyph at the top left of the main view, Outliner, Properties, or Timeline to change what that pane hosts. Choosing a docked editor moves its live panel. Script and 2D editing share one live editor and open alongside the viewport.

## Paths, shapes, and meshes

Selection uses an orange silhouette outline by default. Under **Settings → General → Selection highlight**, choose **Outline + bounds** or **Bounds** when you need a bounding box. Outlines appear in the Director editing view and its split companion. Projector outputs, Preview and Play stay clean. The WebGPU renderer falls back to bounds.

Press **Tab** or click **Edit mode**. The single-column Edit shelf holds drawing tools, **Polybuild (6)**, and **Knife (K)**. Sculpt has a brush shelf with radius and strength in the viewport header. Each mode remembers its active tool where it applies. Press **T** to toggle the shelf. The active tool has an accent highlight and a tooltip. Mode controls stay at the top-left, transforms and grid settings are centered, and view controls stay at the top-right. Narrow viewports move transforms onto their own centered row. Open the **Mesh and point operations** menu (three dots) for fill, split, weld, extrusion, and deletion. The top toolbar holds transforms, snapping, placement, view, and the **Editor Type** picker. New profiles start on a plane facing the view. Choose **Ground plane** or **Mesh surface** under **Placement** before placing the first point to draw on those planes.

Use **Shift+A** to add mesh primitives at the 3D cursor. In Object Mode this creates an object. In mesh Edit Mode the primitive joins the current mesh and its new elements become the selection. Cube and Plane have editable quad faces, and Cube has a separate UV island for each face. In the Blender keymap, Plane lies on the ground plane.

1. Choose **Build mesh** for a polygon or **Draw path** for a smooth curve. Click to place the points, then double-click the first point or press **F** to close it. A closed mesh profile becomes a selected face.
2. Press **E** or choose **Extrude face** or **Extrude outline**. Move the pointer to pull the geometry. **N** toggles free movement and the face normal, **X/Y/Z** constrains it to a world axis, and typing a distance sets an exact amount. Click or press **Enter** to confirm, or **Esc** to cancel the whole operation.
3. Click a mesh face to select it. Shift-click the two ends of a boundary edge and press **E** to pull a connected strip. The new cap or edge remains selected for another pull. Extruding a curve creates a separate mesh and keeps the source curve.

**Add → Mesh** also offers editable objects with starter points. Shift-click point handles to extend the selection, or enter coordinates in **Modeling**. In split view use the Director pane. Press **Tab** to return to Object mode. Extrusion and placement commit together as one undo step.

In Edit Mode, double-click a path or shape edge to insert a point. The same gesture works in the Image & Vector and Mask editors with the point editing tool. In the 3D view, **F3 → Insert outline point** inserts after the selected point, and **F3 → Toggle outline smoothing** switches between straight segments and a smooth curve. These edits can be undone.

Right-click with an outline selected to close it, convert a planar path to a shape, or convert a shape back to a path. Conversion creates a separate object. **Fit outline to mask** normalizes the outline for the chosen projector or spotlight. Look through a light and choose **Project outline as mask** to use the outline’s actual position in the light frame.

### Object selection

Choose **Box Select** (**B**), **Lasso Select**, or **Circle Select** (**C**) from the left shelf, right-click menu, or **F3**. In Object Mode, drag over object origins in either viewport pane. Hidden, disabled, and selection-restricted objects are skipped. Hold **Shift** to extend, **Ctrl** to subtract, or use the selection operation in the viewport header. **[** and **]** resize Circle Select. **Esc** cancels an active selection, and **Numpad Decimal** frames the selected objects.

**Numpad /** toggles **Local View** for the selection. On keyboards without a numpad, use **F3 → Toggle Local View** or the viewport context menu. In Object Mode, **H** temporarily hides selected objects, **Shift+H** hides the rest, and **Alt+H** restores temporary hides. Use the **Local View** and **Reveal** buttons in the viewport to exit isolation or restore hidden objects. These controls affect Director panes during editing. Scene cameras, projector views, Play, and saved projects use the authored visibility. Realistic shading uses raster preview in a temporarily filtered Director pane.

### 3D Cursor

In Object or Edit Mode, **Shift+right-click** in a Director pane to place the 3D Cursor. You can also choose **Place 3D Cursor** on the shelf and click. A surface hit places the cursor on the visible mesh. In empty space, placement uses a plane facing the view at the cursor's current depth.

New objects from **Add** are placed at the cursor. Lights and projectors keep their starting offsets relative to it. Press **period** and choose **3D Cursor** to rotate or scale around it. The Blender preset assigns **Shift+S** to the cursor snap menu. Use it to snap the cursor to the grid, selected objects or points, or world origin, or to move the selection to the cursor while keeping its offsets. Planar outlines stay on their drawing plane. The cursor position is saved with the project.

### Topology pen and sculpting

Select a mesh and press **Tab** to enter Edit mode. Switch on **Polybuild** with **6** or its left-shelf glyph. Closing a **Build mesh** profile activates it automatically. Click empty space to start a new face in the same mesh, click corners or existing vertices, then click its first vertex or press **F** to fill it. Click an edge to start a face draft attached to that edge; endpoint hits reuse the existing vertex. Drag a boundary edge to pull out a connected quad. Drag the center of an interior quad edge for a loop cut, or drag off-center to move it. Click or Ctrl-click a face to insert a vertex. Cmd-click toggles element selection inside Polybuild; **M** welds selected vertices. Shift-click deletes an element; Shift-drag relaxes the mesh. **Esc** cancels the active drag or draft; otherwise it clears selected elements and keeps the tool active.

**Draw freehand** samples each drag into a separate editable path using the current Placement setting. The tool stays active until you switch tools. Blender shortcuts are the default. In Edit mode, **A** selects points, **Alt+A** deselects them, and **X** removes selected authored points. Choose **Sculpt brushes** to sculpt an editable mesh, path, or shape. Pick **Grab**, **Push**, **Smooth**, **Relax**, **Pinch**, or **Twist**. Hold **Shift** to smooth during another brush stroke, and **Ctrl** to reverse Pinch and Twist. Relax slides points along the local surface or path to even out spacing. Use **[** and **]** to change the brush radius. Sculpting moves existing points, so denser geometry gives finer detail. Each stroke commits one undo step.

- **Paths** can use straight segments or smooth curves, with open or closed ends. Uncheck **Constrain to local XY** for a spatial curve. Close a planar path to turn it into a filled shape.
- **Shapes** can stay flat or use **Extrusion depth** to become solid projection surfaces.
- **Editable meshes** keep their polygon faces. Select vertices in boundary order to fill a face, select two neighboring vertices to split an edge, or select all vertices of a face to extrude or delete it. The toolbar magnet applies to point placement, handle drags, and selection moves. Choose **Increment** for relative steps or **Grid** to align to the lattice. Vertex, edge, midpoint, perpendicular, face, and object-origin targets can align points to visible geometry. Mesh edge and face targets use the triangle under the pointer. Planar shapes and paths stay on their local XY plane. **Modeling** also supports moving existing vertices on ordinary static meshes with up to 20,000 buffer vertices.
- **Projector masks** use one editable outline in the projector’s **Modeling** tab. Click in the projector frame to draw it, or copy a closed path or shape. Choose **Light inside** for an aperture or **Block inside** for a cutout, then click **Apply mask**. The mask applies to the calibration grid, stills, and video.

Open **File → Examples → Projection mapping** for **Yosemite relief**, **Canyon aperture**, and **Gallop triptych**. Each scene includes its source media and credit. [Example notes](../editor/examples/projection/README.md)

Open **File → Examples → Captured spaces** for the DDA gallery survey, the gallery’s pedestal and wall mapping demo, the gallery’s lofted cinema installation, and a Spatial Computing Room alignment study. The scenes bundle the original Mediatheque splats alongside editable reference geometry. [Captured-space examples](../editor/examples/gallery/README.md)

## Workspace

- The icons beside the gear toggle the **sidebar**, **timeline**, and **transform toolbar**. Double-click a resize bar to collapse its panel. Hover at the corresponding edge for a temporary reveal.
- **Ctrl+Space** maximizes the area under the pointer. Press it again or choose **Back to Previous** to restore the layout. The same action is available in **View → Toggle Maximize Area**.
- **N** or the viewport header’s **Viewport Sidebar** button opens **Item**. Edit the selected object’s local location, rotation, and scale, or move the center of the selected points in Edit Mode. The right dock keeps its own toggle in the top bar.
- **T** toggles the left viewport tool shelf. **Shift+Alt+Z** or the overlapping circles in the viewport header toggles overlays such as the grid, 3D cursor, selection outlines, and object labels while keeping the current shading mode.
- The **gear** opens **Settings**, with collapsible General, Theme, Shortcuts, and History sections. General holds language, autosave, and an option to auto-hide the top menu; move to the top edge to reveal it. Theme offers System, Light, Dark, Mono Light, Mono Dark, and Warm Dark presets. Adjust the palette colors, enter a name, and choose **Save theme** to keep a custom theme; select a saved theme to edit or delete it. Themes also color the code editor. Hosted editor preferences and autosaved projects are stored in the browser; editable HTML exports include the saved themes.
- Use the outliner’s power icon to disable an object and its children. They leave the rendered scene and their behaviors stop. Turning them back on restores their existing visibility settings.
- The viewport camera dropdown chooses the editor view. To choose the camera used for Play and publishing, select it and click **Object → Set as main camera**. The outliner marks that camera with a star. The top **Director** camera is the fallback when no scene camera is assigned. Added cameras keep their own transforms and can be parented to objects.
- The transform toolbar sits at the top of the viewport. Use **Shift+G** for Grid, **Alt+Shift+S** for Snap target, **Alt/Option+,** for Placement, **comma** for orientation, and **period** for pivot. Choose a pie entry by number or with the arrow keys and Enter. **Alt/Option+G** toggles the grid and **Shift+Tab** toggles the magnet.
- **Shift+right-click** places the 3D Cursor on the visible surface or on a view plane through its previous position. The Cursor tool exposes world X, Y and Z fields. **Shift+S** snaps the cursor or selection in Object and Edit Mode. Choose **3D Cursor** in the pivot pie to rotate or scale around it. Add-menu objects use the cursor as their placement reference. The cursor is saved with the project and is hidden in Preview and Rendered.
- **Placement** controls where new modeling points land. Choose the object’s local plane, a camera-facing plane, the ground, or a mesh surface. A new planar path or shape takes its plane from the first point. Existing planar outlines keep their plane.
- New workspaces use the Blender Studio theme, labeled menus and Blender mouse navigation. Middle-drag orbits, Shift-middle-drag pans and scrolling zooms. Backtick opens the View Navigation pie and Shift+Backtick starts WASD fly navigation. Both are available from **View**. Settings → General offers Standard mouse navigation and theme preferences.
- The **Director** camera is the main navigation view. In a split, hover the Director pane to orbit or edit the scene. Hover the camera or projector preview to use view commands such as toggling the camera preview. For scene cameras, **Object → Controller** attaches an editable Orbit, Fly, First Person, or Third Person script for Play and playable exports. Fly uses left-drag to look, WASD to move, Q/E to descend or rise, Shift for faster movement, and the wheel to adjust speed. Orbit keeps the world horizon level. Third Person offers a **Follow target**. Use **Components** to edit the controller or adjust speed, sensitivity, zoom, pan, and follow parameters. Scene cameras start with no controller. Source exports retain the controller preset and parameters. Playable exports support custom script behavior.
- Press **Z** for the shading pie, then **1** for Preview. Choose **Rendered** in the viewport shading dropdown. **Shift+Z** toggles Wireframe. **Alt+Z** toggles X-Ray in Solid shading. Surface Paint opens Material Preview so brush colors are visible.
- **Solid** shows neutral shading and scene guides. **Material Preview** shows scene materials and lighting with the same editing guides and gizmos as Solid. **Preview** shows the real-time scene in the editor viewport with editing guides, gizmos, and statistics hidden. **Rendered** progressively samples a still view. It path-traces supported WebGL scenes and accumulates subpixel raster samples for scenes with splats, projectors, custom shaders, or post effects. Split views and moving scenes use real-time raster shading. The viewport reports the sampling mode and count. Drag the axis gizmo in Solid to orbit or click an axis to align the view.

In **Settings → Shortcuts**, choose **Blender** (the default) or **Basic (Maya)**, search actions and menu commands, and click a binding to record a combination. The × clears a binding; assigning an existing combination clears its previous action. Each preset keeps its own changes. Reset restores that preset's defaults. Keyboard shortcuts are suspended while typing in fields or the code editor.

In the Blender preset, **Shift+A** opens a searchable Add menu at the last viewport pointer position. Right-click the viewport for object actions and Add. Both use the same commands as the main menus, so added objects use their usual positions and can be undone. Search, use arrow keys or click an item; Escape closes the menu.

In Object Mode, **H** hides the selection in the editor, **Shift+H** hides other objects, and **Alt+H** reveals viewport-hidden objects. These actions are undoable. The Outliner identifies temporarily hidden rows and its eye button reveals them. Authored visibility still controls the player and exports. Press **/** or **Numpad /** to enter or exit **Local View** for the selection. The Director panes share the isolation. Local View preserves camera framing, shading mode, and scene lights, including projectors. **Shift+Q** opens the interaction mode pie. These controls are also available under **View**.

Press **F3** or **Cmd/Ctrl+K** to open the command palette. Search editor actions and menu commands, then press Enter or use the arrow keys. Both palette bindings can be reassigned in Shortcuts.

With the Blender preset, **G**, **R**, and **S** start a mouse-driven grab, rotate, or scale; **X/Y/Z** constrains an axis, **Shift+X/Y/Z** constrains the perpendicular plane, and typing a number sets an exact amount. Click or Enter accepts; right-click or Escape cancels. While modeling, these shortcuts transform the selected points and each confirmed transform is one undo step. Press **R** again during rotation for trackball. Press **G/R/S** to switch within the same gesture. During a transform, hold **Alt** and move the pointer to choose an axis. Release Alt to keep the lock, then move along it. Use **Shift+Alt** to choose a plane during move or scale. Middle-mouse drag also chooses a constraint. **Alt+left-drag** chooses a constraint and confirms the transform when you release the button. **Shift** gives finer movement, **Ctrl** temporarily inverts snapping, and **Shift+Tab** toggles snapping. During a grab, press **B** and click anywhere in the active 3D view to place the snap base. The orange ring marks the point that moves with the selection and snaps to the next target. For example, pick a corner as the base to line that corner up with another object. Clicking empty space uses the view plane through the transform pivot. Numpad 1/3/7 set front/right/top views (Ctrl for their opposites), Numpad 5 toggles projection, Numpad 0 toggles the active camera, and Numpad decimal frames the selection. **Emulate Numpad** is on by default in Settings → General. It maps the number row to these controls while retaining 1/2/3 for mesh component selection in Edit Mode.

In Object Mode, **F2** renames the active object. Select children first and the new parent last, then press **Ctrl+P** and choose **Object (Keep Transform)** to retain their world placement. **Alt+P → Clear and Keep Transform** moves them back to the scene root. The Edit menu and F3 search also provide these actions. Keep Transform requires a result representable by editable location, rotation, and scale.

In the Blender keymap, the last-picked member of a multi-selection is active in Properties and the viewport’s Item panel. **Shift-click** a selected object to make it active, then Shift-click the active object to deselect it. The viewport outlines and Outliner highlight show which object is active. Transform shortcuts and **Frame Selected** still act on the selection.

In Object Mode, **Shift+D** duplicates the selected hierarchies under their current parents and starts a move in the 3D viewport. **Esc** cancels the move and leaves the copies in place. The copies have separate geometry, component settings and timeline bindings, and share materials with the originals. Select the complete rig when duplicating a skinned asset. One undo removes the copies and their move.

Middle-drag orbits, Shift+middle-drag pans, and Ctrl+middle-drag zooms. Under General, **Emulate 3-button mouse** allows Option/Alt+left-drag with Shift or Ctrl/Command modifiers for the same actions. Outliner eye controls change standard object visibility (including exports); the pointer disables viewport selection and the lock prevents editor transforms.

Press **Shift+Backtick** to fly the camera selected in the viewport camera dropdown, including parented scene cameras. Move with **WASD**, go down/up with **Q/E**, hold **Shift** for speed, use the wheel to adjust speed, and look with the mouse. In orthographic Fly, **W/S** zooms in and out, **A/D** pans left and right, and **Q/E** pans down and up in the view. Enter or click accepts, and Escape restores the starting pose and zoom. Accepted scene-camera changes are undoable. When pointer lock is unavailable, a notice appears and mouse look uses the free cursor.

The viewport camera dropdown remembers the active scene camera. **Numpad 0** toggles between it and the editor view. **Ctrl+Numpad 0** makes the selected scene camera active. **Ctrl+Alt+Numpad 0** aligns the active scene camera to the current view and looks through it. Orbit, pan, and zoom move the camera you are looking through. In a scene camera's **Object** properties, choose **Orbit**, **Fly**, **First Person**, or **Third Person** under **Controller** for Play and published scenes. For Third Person, choose the object to follow.

## Advanced modeling and selection

Saved measurements are selectable by clicking their lines or choosing them in the outliner. Press **Tab** (Edit mode) to drag endpoints, add points, change units, or close the ruler. Existing ruler edits save on pointer release and support undo/redo. Press **Tab** to return to Object mode; use **New ruler** to start a separate measurement.

In **Edit mode**, use the vertex, edge and face glyphs beside the mode controls, or **1**, **2**, **3**. Click an element to select it; Shift-click adds or removes elements. **G/R/S** and the transform gizmo act on the selected vertices, edges or faces. Primitive/imported static meshes expose their triangles while preserving their UV seams and material groups during transforms; authored meshes retain polygon faces and topology operations. The topology pen remains a separate drawing tool.

Choose **Combined Transform** in the left toolbar to show arrows for translation, rings for rotation, and square handles for axis scaling. Drag a handle to transform the selection. Press **Esc** during a drag to cancel. Toggle **Show transform gizmo** in the **View** menu or **Settings** to hide the handles. **G**, **R**, and **S** still start a transform and show a move, rotate, or scale indicator at the pointer.

Right-click opens actions for the current selection and mode. **Set origin → Origin to geometry / 3D Cursor / world origin / selected geometry** changes an eligible mesh or group’s origin while keeping its geometry and children in place, with undo. **Transform pivot** chooses bounds, median, active element, 3D Cursor, or world origin for subsequent transforms. The app header’s editor glyph opens the 3D, mask, image/vector, UV and warp workspaces.

**Bounds bottom center** is available in Transform pivot and the selection context menu, using the world-aligned bounds minimum Y and center X/Z. It applies to objects, multiple objects, and selected mesh elements. **Origin to bounds bottom center** permanently relocates an eligible object’s origin with undo while preserving its geometry’s world position.

### Modifier stack

Select a static mesh or curve and open **Modifiers** in Properties. Add Mirror, Array, Offset, Noise, Smooth, Subdivide or Wave; curves also offer Simplify. Mirror and Array currently operate on meshes. Each entry has enable, reorder, Apply and remove controls and exposed parameters. Apply bakes the stack through that entry to preserve evaluation order. All changes support undo/redo. The original geometry is retained as `userData.modifierBase` and the ordered stack as `userData.modifiers`; evaluated buffers are ordinary Three.js geometry used by Play, projector mapping and exports. Edit mode shows the original cage; exiting shows the evaluated result. Source edits reevaluate the stack. Subdivide splits triangles (it is not Catmull–Clark); Wave phase is a static parameter. Stroke-only color/thickness/time modifiers are not ported. Apply the stack before changing origins or using tools that replace geometry outside Modeling. Runtime animation of modifier parameters is not implemented.

Polybuild is exposed as **Polybuild (6)** in the left Edit shelf, previously named Topology pen. **Knife (K)** has its own glyph beside it. Both work on authored polygon meshes. Activating either on a primitive or imported static mesh converts it to editable triangles in an undoable step and retains its UVs and material slots. Knife and loop cuts interpolate UVs across existing faces. Extruded caps keep their UVs, and new walls inherit the material with new planar UVs. Polybuild reports an error when dissolving an edge would erase a material or UV seam.

### Edit selection gestures

Edit selection adapts ThreeGrease’s mesh selection flushing and drag-box rules. Click selects one element, Shift-click toggles it independently, Ctrl-click subtracts. Click the Select glyph in the left shelf to choose Select, Box, Circle, or Lasso in Object or Edit Mode. In the Blender keymap, **W** cycles the tools. **B**, **C**, and **Shift+B** activate Box, Circle, and Lasso directly. Object regions select by projected origin. Move, Rotate, and Scale are below the cursor tool in the left shelf. Region selection uses both edge endpoints and face centers. In Solid, mesh surfaces block selection behind them. Enable **X-Ray** or switch to **Wireframe** to select through the mesh. In those views, click a face center dot to select the face. The overlapping-squares glyph cycles Set, Extend, Subtract, Toggle and Intersect; Shift and Ctrl temporarily extend/subtract. **Alt-click** selects a quad edge loop; **Ctrl+Alt-click** selects a ring across opposite quad edges; add Shift to toggle the resulting loop/ring. Poles, non-manifold junctions and non-quads stop traversal. **Ctrl+I** inverts selection. Hover an island and press **L** or **Shift+L** to select or deselect it. **Ctrl+L** selects geometry connected to the current selection. **Ctrl+Numpad Plus/Minus** grows or shrinks it by one step. These commands are available in **F3** search. Escape clears the element selection and preserves the active region tool and Edit mode. Whole-object silhouette feedback is suppressed in mesh Edit mode so only selected elements show orange; geometry selection takes priority over transform-gizmo planes.

In mesh Edit Mode, press **P** for **Separate**, or find it through **F3** or the right-click menu. **Selection** moves complete selected faces into a new object. **By Material** uses material slots and **By Loose Parts** uses connected surface islands across the whole mesh. The parts share the original material assignments and retain the original transform, UVs and modifier stack. The original keeps its children and script components. Undo restores the original mesh in one step.

In Object Mode, select static meshes and select the destination last. **Ctrl+J** or **Edit → Join** combines their base meshes in that active object's space. The active object's existing material slots keep their indices, and additional materials are appended. The active object's components and modifier stack apply to the result. Attachments from the other meshes move under the active object with their world transforms preserved. To retain a mesh's own animation or components, make it active before joining. Undo restores the separate objects and their selection.

### Context construction and cutting

Choose **Polybuild (6)** after **Tab**. Click existing vertices, split edges, or place points in space to build a face; click its first or last point after at least three corners, or press **F/Enter**, to finish. A line between two existing vertices cuts the intervening faces instead of leaving an unattached chord. Drag a vertex onto another vertex to weld them on release. Hold an edge without moving to dissolve it, or hold a face/vertex to delete it. **Alt-click** runs AutoQuad, adapting ThreeGrease’s U/triangle, bridge and parallelogram inference.

Use **Placement** for Object, View, Ground, Mesh surface, or Surface perpendicular. Mesh surface projects construction points onto other visible meshes; Surface perpendicular starts on the hit surface and grows on a standing plane through it. **X/Y/Z** during construction or a drag locks the corresponding world axis; **Shift+X/Y/Z** locks its perpendicular plane; repeat the axis to unlock. The grid and snap-target controls apply to placement; **Ctrl** bypasses source snapping while using Polybuild. Existing-point and edge attachments in the edited mesh share actual topology. Snapping to another object places a point there; it does not create a live constraint that follows that object.

Choose **Knife (K)** and drag a line across the mesh to split crossed edges and faces. The cutter includes existing vertices that lie on the line and handles perspective interpolation. In Polybuild, holding in empty space for about half a second and then dragging invokes the same cutter. Escape cancels a drag or unfinished face draft without changing the source. Each finished geometry operation is one undo step. Loop cuts require connected quads; imported triangle meshes support Knife but do not acquire quad topology automatically.

### Numeric scrubbing and brush shortcuts

**Cmd-drag** a numeric field to adjust it, including while it is focused. **Shift-drag** uses one tenth the sensitivity. **Ctrl-drag** snaps to the control’s step; combine Shift+Ctrl for finer snap increments. These gestures respect numeric ranges and integer values. Each scrub commits once on release, and Escape cancels it. The same behavior covers native number inputs and unit-bearing sidebar fields. Click/type editing remains available.

**[ / ]** changes brush size. **Shift+[ / Shift+]** changes strength by five percentage points, without changing size. Surface Paint uses opacity as strength; sculpt brushes use brush strength. Mask/vector Push and Smooth expose their strength beside the radius control and use the same shortcuts. Circle selection also supports size brackets. Physical bracket keys are normalized so Shift produces the intended strength action rather than an unmatched brace character.

**Escape** clears scene-object selection in Object mode and component selection in Edit mode, keeping the active mode and tool. An active transform, scrub, stroke, or unfinished construction draft cancels first. Use Tab to leave Edit mode or choose another tool explicitly.

Edit mode reserves ordinary left-button clicks and drags for editing, including in Standard mouse navigation. Shape/path control edges support the same click and region-selection tools as mesh edges; a closed shape also exposes its profile as a selectable face. If no editable target is active, click an unlocked mesh, shape or path to choose it without orbiting. Explicit camera gestures and the wheel remain available.
