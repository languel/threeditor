# threeditor

threeditor is a lightweight three.js workspace for staging a scene, editing readable JavaScript, and publishing a standalone project. It is based on the three.js r187 editor.

[Open threeditor on GitHub Pages](https://languel.github.io/threeditor/) · [Upstream three.js editor](https://github.com/mrdoob/three.js/tree/dev/editor)

## Run locally

```sh
python3 -m http.server 5300
```

Open `http://127.0.0.1:5300/` with the trailing slash. The hosted editor runs as static ES modules and loads a few libraries from a CDN. Serve it without COEP or COOP headers.

Try the [Fox woodland demo](demos/fox-follow/) for an animated character with a Third Person follow camera. Its **Edit scene** link opens the saved project in the editor.

In the 3D viewport, open the command palette with **F3**. **Vertical Split** places two areas side by side. **Horizontal Split** stacks them. Drag the divider to resize the areas, or focus it and use the arrow keys. Hover the area you want to remove and run **Close Area**. The other area fills the viewport.

Both areas share object and mesh selection. Frame Selection and double-click framing update both Director views. A pane using a scene camera, light, or projector shows the shared selection from its own view. Select a source in the viewport camera menu to compare it with the Director. The split direction and divider position are saved with the project.

## Workspaces

The top bar opens Layout, Modeling, Sculpting, UV Editing, Image & Vector, Paint, Shading, Animation, Scripting, and Projection views of the same project. **Layout** gives the viewport more room with a compact timeline. **Animation** expands the timeline for clips and keyframes. **Scripting** opens Code, and **Projection** opens a split light view when a projector or spotlight is selected. Compact mode uses workspace glyphs with tooltips. Clean and Default modes show workspace names.

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


Regenerate the five adapted lesson projects with `node tools/build-lessons.mjs`. The builder and its vendored source modules/recording are in `tools/`; provenance and the adaptation scope are documented in [the lesson notes](editor/examples/lessons/README.md).

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

Choose **2D Editors → Image and vector mode** to draw colored shapes and cutouts with the same tools as the mask editor. Use **Draw stroke** for open freehand lines. In point editing, press **F** to open or close the selected contour. **Create scene curve** copies the selected contour into the XY plane as an editable path. **Create filled scene shape** copies a closed fill as an editable surface. The drawing frame spans two scene units and its center maps to the origin. Use **Copy from scene in place** to bring scene paths and shapes into that frame at their world XY coordinates, or **Fit outline to frame** to center and scale a copy.

**Apply drawing** saves the contours with the project. **Open reference image** loads a local image for tracing or compositing during the editing session. Hold Shift during a Push brush stroke to smooth the contour.

**Export SVG** saves the vector shapes. **Export PNG** renders a 1024 × 1024 image with the reference included when visible. Toggle **Show reference image** to export the drawing on a transparent background.

### Target silhouettes, warp, and UVs

- Select a projector and choose a receiver mesh under **Modeling → Auto-mask target**. The mask follows the silhouette as you move the projector, adjust the lens, or edit the target. A hand-drawn polygon can further trim the result. The mask also applies to **Masked texture** output.
- Choose **Modeling → Edit projection warp** to adjust the 4 × 4 sampling grid. Drag a handle to choose which source pixel lands at that position in the projector frame, then click **Apply**. Use the calibration grid and look through the projector to check correction on the receiver. **Clear warp** restores the original mapping.
- To map an image onto a mesh material, select the mesh and choose **2D Editors → UV mode** or **Modeling → Edit UVs**. Choose Smart unwrap for a packed conformal atlas, Lightmap pack for separated bake islands, or a cube, cylinder, sphere, or planar projection. Project from View uses the 3D pane camera. Projectors use their lens and frame. Select **Auto layout**, drag points to refine the mapping, and click **Apply**. Shift-click adds points to the selection. If the material has an image map, it appears behind the UV wireframe.

Try these controls in **DDA Gallery · Lofts and cinema fragments**. Each projector already has a target assigned. To check the physical feed, make a projector the main camera and select **Masked texture** before starting Play. [Gallery walkthrough and sources](editor/examples/gallery/README.md)

- In **UV Editing → Texture Bake**, choose **Light and shadow guide**, **Scene appearance**, or **Masked projector frame**. Pick the 3D view, a scene camera, or suitable light or projector, and bake at 256, 512, or 1024 pixels. The UV editor previews the result. Download a PNG or add an undoable unlit guide mesh. Use packed UVs for unique surface coverage. The bake is a snapshot of what the source view sees, with occluded texels left transparent. Use WebGL and apply any mesh modifiers first.

### Measure and draw on receivers

**Pencil** and **Measure** sit near the top of the left shelf in every viewport mode. The Pencil glyph or **D** activates freehand drawing. Strokes are editable paths. Pencil uses the shared Placement menu. Mesh Surface binds the stroke to visible meshes, Ground Plane draws at world Y = 0, and View Plane passes through the 3D Cursor. Surface Perpendicular fixes a standing plane at the starting hit. The **Pencil plane guide** follows the pointer on the resolved plane and holds that plane through the gesture. In View Plane, the **Pencil stroke depth** menu can take depth from a nearby segment, first point, or endpoint. Start on the orange anchor and draw past it to continue at that depth. The inline Pencil stroke settings include a trailing pointer and circular, radial, parallel, grid-axis, and isometric guides. Circular and radial guides use the 3D Cursor in the viewport and the guide center in Image & Vector. **Stroke smoothing** and **Simplify tolerance** clean up newly drawn plane strokes and Image & Vector contours while preserving the endpoints. End near the start to close a single contour, then use its right-click actions to make a shape or mesh, or reuse the outline in the mask editor.

The Pencil toolbox sits in one row above the timeline. Use **Placement** in the viewport toolbar for the drawing plane. Pencil has its own **Draw editable stroke**, **Paint mesh texture**, **Erase mesh texture**, and **Erase pencil strokes** tools. The stroke eraser removes the editable strokes touched by the gesture and undoes them together. Texture tools use the visible UV-mapped surface and share a pressure-sensitive brush palette with the 2D editors. Choose a textured tip such as Charcoal, Chalk, Ink Rough, or Dry Brush. Use **Brush grain**, **Grain scale**, and **Brush grain pattern** to adjust coverage and texture. Brush and stroke controls are inline. Scroll the row horizontally when space is tight. New 3D strokes render with rounded brush geometry and keep their editable control points. **Cmd-drag** on a number to scrub it, use **Shift-drag** for fine adjustment, or **Ctrl-drag** to snap. **[** and **]** change the brush size, and **Shift+[** and **Shift+]** adjust strength.

In **UV Editing**, the left shelf has point and region selection, Move, Rotate, Scale, a 2D cursor pivot, and Pencil and Erase Texture on the selected material slot. Use **A** to select all, **L** to select a linked island under the pointer, and **G**, **R**, or **S** to transform the selection. Use **Apply** to commit UV coordinates. A texture stroke commits directly to its material and has one project undo step.

In **Image & Vector**, **Pencil** draws an editable contour. **Brush** and **Erase Brush Marks** edit the raster layer. Apply to store the drawing in the scene. PNG includes the raster marks and SVG embeds them alongside editable contours, and textured open contours use embedded grain patterns. In either editor, scroll to zoom about the pointer, middle-drag to pan, or use **Home** to reset framing.

Use the mode selector at the upper left of the viewport to enter Object Mode, Edit Mode, Sculpt Mode or Paint Mode. **Tab** switches between Object Mode and Edit Mode. In the Blender keymap, **Ctrl+Tab** opens the mode pie. If the browser uses Ctrl+Tab to switch tabs, use the mode selector or search **Interaction mode menu** with **F3**. Object mode is for selecting and moving objects. Edit mode adds **Surface path** and geometry tools. **F3** also exposes the available Box Select, Circle Select, Knife, Fill and Extrude commands. **Measure** and light masks are available from the Object and Edit shelves. Use **Paint Mode** for brush work. Compact mode uses glyphs with hover labels for tools, actions, and toggles, including the ruler controls. Measurements, units, and editable values stay visible.

- **Measure** places rulers on mesh surfaces or the ground. Turn on **Snap vertices** for nearby corners and **Bind to mesh** to follow mesh transforms. Double-click the first point after placing at least three points to close the ruler. Closed rulers also show area. Enter a known total length and choose **Calibrate units** to set the scene’s measurement scale. Select a saved ruler and re-enter Measure to adjust its points.
- **Surface path** places points on one mesh and samples between them when you save. Add points around holes or silhouettes to keep the path on the receiver. Double-click the first point to close the loop before saving. Saved paths can be edited in **Modeling**.
- In **Surface Paint**, choose **Vector stroke** to draw an editable path. **Surface** placement follows a visible mesh or scan and starts a separate path when you cross a gap or change receivers. **View plane** draws in space through the current orbit center. Sample spacing controls the distance between authored points. Escape cancels the gesture and Undo removes the entire stroke.
- **Gaussian splats** paints native 3D Gaussian samples. Choose **Surface** to attach them to the receiver or **View plane** to paint in space. Size and pen pressure set the sample radius. Repeated gestures share a **Splat paint** batch on the receiver, with separate undo for each gesture. The batch’s Gaussian Splat component provides tint, opacity and point display controls.
- **Texture paint** stamps the base-color image on a UV-mapped mesh. The brush projects across visible faces and clips paint to their UV islands. A mesh without a base-color map gets a 1024 × 1024 canvas. Each painted material slot keeps its own image, including when other objects share the original material. Pen pressure controls the stamp radius.
- **Surface dabs** follow the visible surface under the brush. One stroke can cross several unlocked meshes, point clouds, or Gaussian scans, and undoes as a single action. Mesh dabs are clipped against the receiver. Scan dabs use the visible point depth to place a small view-facing mark. The marks follow the receiver’s object transform. Pen pressure changes brush width. Use **[** and **]** to change brush size.

Use **Enter** to apply a mask or save a ruler or path. **Esc** cancels an active operation first; otherwise it clears the selection while keeping the current tool.

## 2D and 3D areas

Open **UV** or **Image & Vector** from **2D Editors**. When there is room, the 2D editor opens on the left with a live 3D view on the right. Drag the divider or focus it and press Left or Right to resize. Use the split glyph in the 2D header to switch between the split and a full-width editor. Narrow windows use the full-width editor. Mask and Warp can also use the split.

The UV editor follows the selected editable mesh while its current layout is clean. An unapplied UV draft stays attached to its current mesh, named in the editor header. Apply the draft before selecting another mesh to continue. Click inside the 3D area to select mesh elements and use modeling shortcuts there. Edit Mode draws selected vertices as small orange dots, selected edges in orange, and selected faces with an orange tint.

## Outliner and Properties

The Outliner stays above Properties, with a divider you can drag or resize with the arrow keys. Search filters the hierarchy and includes parents of matching objects. Properties uses vertical glyph tabs for Scene, Object, Geometry, Material, Components, Modeling, Modifiers, and Animations. The available tabs follow the selection. Open **Scene** for Background, Environment, Fog, Bloom, and Focus.

## Paths, shapes, and meshes

Selection uses an orange silhouette outline by default. Under **Settings → General → Selection highlight**, choose **Outline + bounds** or **Bounds** when you need a bounding box. Outlines appear in the Director editing view and its split companion. Projector outputs, Preview and Play stay clean. The WebGPU renderer falls back to bounds.

Press **Tab** or click **Edit mode**. The single-column Edit shelf holds drawing tools, **Polybuild (6)**, and **Knife (K)**. Sculpt has a brush shelf with radius and strength in the viewport header. Each mode remembers its active tool where it applies. Press **T** to toggle the shelf. The active tool has an accent highlight and a tooltip. Mode controls stay at the top-left, transforms and grid settings are centered, and view controls stay at the top-right. Narrow viewports move transforms onto their own centered row. Open the **Mesh and point operations** menu (three dots) for fill, split, weld, extrusion, and deletion. The top toolbar holds transforms, snapping, placement, view, and the **2D Editors** picker. New profiles start on a plane facing the view. Choose **Ground plane** or **Mesh surface** under **Placement** before placing the first point to draw on those planes.

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

Open **File → Examples → Projection mapping** for **Yosemite relief**, **Canyon aperture**, and **Gallop triptych**. Each scene includes its source media and credit. [Example notes](editor/examples/projection/README.md)

Open **File → Examples → Captured spaces** for the DDA gallery survey, the gallery’s pedestal and wall mapping demo, the gallery’s lofted cinema installation, and a Spatial Computing Room alignment study. The scenes bundle the original Mediatheque splats alongside editable reference geometry. [Captured-space examples](editor/examples/gallery/README.md)

## Workspace

- The four icons beside the gear toggle the **Code panel**, **sidebar**, **timeline**, and **transform toolbar**. Double-click a resize bar to collapse its panel. Hover at the corresponding edge for a temporary reveal.
- **Ctrl+Space** maximizes the area under the pointer. Press it again or choose **Back to Previous** to restore the layout. The same action is available in **View → Toggle Maximize Area**.
- **N** or the viewport header’s **Viewport Sidebar** button opens **Item**. Edit the selected object’s local location, rotation, and scale, or move the center of the selected points in Edit Mode. The right dock keeps its own toggle in the top bar.
- **T** toggles the left viewport tool shelf. **Shift+Alt+Z** or the overlapping circles in the viewport header toggles overlays such as the grid, 3D cursor, selection outlines, and object labels while keeping the current shading mode.
- The **gear** opens **Settings**, with collapsible General, Theme, Shortcuts, and History sections. General holds language, autosave, and an option to auto-hide the top menu; move to the top edge to reveal it. Theme offers System, Light, Dark, Mono Light, Mono Dark, and Warm Dark presets. Adjust the palette colors, enter a name, and choose **Save theme** to keep a custom theme; select a saved theme to edit or delete it. Themes also color the code editor. Hosted editor preferences and autosaved projects are stored in the browser; editable HTML exports include the saved themes.
- Use the outliner’s power icon to disable an object and its children. They leave the rendered scene and their behaviors stop. Turning them back on restores their existing visibility settings.
- The viewport camera dropdown chooses the editor view. To choose the camera used for Play and publishing, select it and click **Object → Set as main camera**. The outliner marks that camera with a star. The top **Director** camera is the fallback when no scene camera is assigned. Added cameras keep their own transforms and can be parented to objects.
- The transform toolbar sits at the top of the viewport. Use **Shift+G** for Grid, **Alt+Shift+S** for Snap target, **Alt/Option+,** for Placement, **comma** for orientation, and **period** for pivot. Choose a pie entry by number or with the arrow keys and Enter. **Alt/Option+G** toggles the grid and **Shift+Tab** toggles the magnet.
- **Shift+right-click** places the 3D Cursor on the visible surface or on a view plane through its previous position. The Cursor tool exposes world X, Y and Z fields. **Shift+S** snaps the cursor or selection in Object and Edit Mode. Choose **3D Cursor** in the pivot pie to rotate or scale around it. Add-menu objects use the cursor as their placement reference. The cursor is saved with the project and is hidden in Live Preview and Rendered.
- **Placement** controls where new modeling points land. Choose the object’s local plane, a camera-facing plane, the ground, or a mesh surface. A new planar path or shape takes its plane from the first point. Existing planar outlines keep their plane.
- New workspaces use the Blender Studio theme, labeled menus and Blender mouse navigation. Middle-drag orbits, Shift-middle-drag pans and scrolling zooms. Backtick opens the View Navigation pie and Shift+Backtick starts WASD fly navigation. Both are available from **View**. Settings → General offers Standard mouse navigation and theme preferences.
- The **Director** camera is the main navigation view. In a split, hover the Director pane to orbit or edit the scene. Hover the camera or projector preview to use view commands such as toggling the camera preview. For scene cameras, **Object → Controller** attaches an editable Orbit, Fly, First Person, or Third Person script for Play and playable exports. Fly uses left-drag to look, WASD to move, Q/E to descend or rise, Shift for faster movement, and the wheel to adjust speed. Orbit keeps the world horizon level. Third Person offers a **Follow target**. Use **Components** to edit the controller or adjust speed, sensitivity, zoom, pan, and follow parameters. Scene cameras start with no controller. Source exports retain the controller preset and parameters. Playable exports support custom script behavior.
- Press **Z** for the shading pie. **Shift+Z** toggles Wireframe. **Alt+Z** toggles X-Ray in Solid shading. Surface Paint opens Material Preview so brush colors are visible.
- **Solid** shows neutral shading and scene guides. **Material Preview** shows scene materials and lighting with the same editing guides and gizmos as Solid. **Live Preview** shows the real-time scene in the editor viewport with editing guides, gizmos, and statistics hidden. **Rendered** progressively samples a still view. It path-traces supported WebGL scenes and accumulates subpixel raster samples for scenes with splats, projectors, custom shaders, or post effects. Split views and moving scenes use real-time raster shading. The viewport reports the sampling mode and count. Drag the axis gizmo in Solid to orbit or click an axis to align the view.

In **Settings → Shortcuts**, choose **Blender** (the default) or **Basic (Maya)**, search actions and menu commands, and click a binding to record a combination. The × clears a binding; assigning an existing combination clears its previous action. Each preset keeps its own changes. Reset restores that preset's defaults. Keyboard shortcuts are suspended while typing in fields or the code editor.

In the Blender preset, **Shift+A** opens a searchable Add menu at the last viewport pointer position. Right-click the viewport for object actions and Add. Both use the same commands as the main menus, so added objects use their usual positions and can be undone. Search, use arrow keys or click an item; Escape closes the menu.

In Object Mode, **H** hides the selection in the editor, **Shift+H** hides other objects, and **Alt+H** reveals viewport-hidden objects. These actions are undoable. The Outliner identifies temporarily hidden rows and its eye button reveals them. Authored visibility still controls the player and exports. Press **/** or **Numpad /** to enter or exit **Local View** for the selection. The Director panes share the isolation. Local View preserves camera framing, shading mode, and scene lights, including projectors. **Ctrl+Tab** opens the interaction mode pie. These controls are also available under **View**.

Press **F3** or **Cmd/Ctrl+K** to open the command palette. Search editor actions and menu commands, then press Enter or use the arrow keys. Both palette bindings can be reassigned in Shortcuts.

With the Blender preset, **G**, **R**, and **S** start a mouse-driven grab, rotate, or scale; **X/Y/Z** constrains an axis, **Shift+X/Y/Z** constrains the perpendicular plane, and typing a number sets an exact amount. Click or Enter accepts; right-click or Escape cancels. While modeling, these shortcuts transform the selected points and each confirmed transform is one undo step. Press **R** again during rotation for trackball. Press **G/R/S** to switch within the same gesture. During a transform, hold **Alt** and move the pointer to choose an axis. Release Alt to keep the lock, then move along it. Use **Shift+Alt** to choose a plane during move or scale. Middle-mouse drag also chooses a constraint. **Alt+left-drag** chooses a constraint and confirms the transform when you release the button. **Shift** gives finer movement, **Ctrl** temporarily inverts snapping, and **Shift+Tab** toggles snapping. During a grab, press **B** and click anywhere in the active 3D view to place the snap base. The orange ring marks the point that moves with the selection and snaps to the next target. For example, pick a corner as the base to line that corner up with another object. Clicking empty space uses the view plane through the transform pivot. Numpad 1/3/7 set front/right/top views (Ctrl for their opposites), Numpad 5 toggles projection, Numpad 0 toggles the active camera, and Numpad decimal frames the selection. **Emulate Numpad** is on by default in Settings → General. It maps the number row to these controls while retaining 1/2/3 for mesh component selection in Edit Mode.

In Object Mode, **F2** renames the active object. Select children first and the new parent last, then press **Ctrl+P** and choose **Object (Keep Transform)** to retain their world placement. **Alt+P → Clear and Keep Transform** moves them back to the scene root. The Edit menu and F3 search also provide these actions. Keep Transform requires a result representable by editable location, rotation, and scale.

In the Blender keymap, the last-picked member of a multi-selection is active in Properties and the viewport’s Item panel. **Shift-click** a selected object to make it active, then Shift-click the active object to deselect it. The viewport outlines and Outliner highlight show which object is active. Transform shortcuts and **Frame Selected** still act on the selection.

In Object Mode, **Shift+D** duplicates the selected hierarchies under their current parents and starts a move in the 3D viewport. **Esc** cancels the move and leaves the copies in place. The copies have separate geometry, component settings and timeline bindings, and share materials with the originals. Select the complete rig when duplicating a skinned asset. One undo removes the copies and their move.

Middle-drag orbits, Shift+middle-drag pans, and Ctrl+middle-drag zooms. Under General, **Emulate 3-button mouse** allows Option/Alt+left-drag with Shift or Ctrl/Command modifiers for the same actions. Outliner eye controls change standard object visibility (including exports); the pointer disables viewport selection and the lock prevents editor transforms.

Press **Shift+Backtick** to fly the camera selected in the viewport camera dropdown, including parented scene cameras. Move with **WASD**, go down/up with **Q/E**, hold **Shift** for speed, use the wheel to adjust speed, and look with the mouse. In orthographic Fly, **W/S** zooms in and out, **A/D** pans left and right, and **Q/E** pans down and up in the view. Enter or click accepts, and Escape restores the starting pose and zoom. Accepted scene-camera changes are undoable. When pointer lock is unavailable, a notice appears and mouse look uses the free cursor.

The viewport camera dropdown remembers the active scene camera. **Numpad 0** toggles between it and the editor view. **Ctrl+Numpad 0** makes the selected scene camera active. **Ctrl+Alt+Numpad 0** aligns the active scene camera to the current view and looks through it. Orbit, pan, and zoom move the camera you are looking through. In a scene camera's **Object** properties, choose **Orbit**, **Fly**, **First Person**, or **Third Person** under **Controller** for Play and published scenes. For Third Person, choose the object to follow.

## Agent API and WebMCP

The editor exposes `window.threeditor.list()` for tool descriptions and `await window.threeditor.call(name, args)` for the same operations available through WebMCP. On browsers that implement WebMCP, tools register automatically through `document.modelContext`; inspect `window.threeditor.webmcp` and await `window.threeditor.ready` for registration status. Unsupported browsers still have the page API. WebMCP is a browser interface, not a standalone MCP server or network relay.

For example, `await threeditor.call('threeditor_object_create', { type: 'box', name: 'Test' })` creates an undoable object; `threeditor_state`, `threeditor_code_get`, `threeditor_code_apply`, and `threeditor_render` support code/render tests. Render returns a PNG data URL; WebMCP returns an image content block. Use `threeditor_asset_store` and `threeditor_asset_import_gltf` for base64 GLB/glTF files, `threeditor_script_set` for object scripts, and `threeditor_export` for base64 packaged ZIP/HTML output. `threeditor_commands`/`threeditor_command` expose editor menu actions, while `threeditor_ui_list`/`threeditor_ui_action` expose ordinary interactive controls. UI references can become stale when a panel redraws; list them again. Applying code executes the Scene contents section and replaces the scene objects, as the Code panel does. Project JSON does not itself contain the original source asset files; use the asset tools or editable HTML for those.

## Code, scripts, and animation

Open **Code** to see the generated scene. Scene changes regenerate the code. Edit the section between `// @key Scene contents` and `// @/key`, then choose **Apply**, press **Ctrl/Cmd+Enter**, or enable **auto** to apply after a pause. Auto is off by default. The Code panel also opens object scripts and material shader editors. In the outliner, an object’s `<>` glyph toggles its script editor; clicking another object’s glyph switches to that script. Closing and reopening the same glyph preserves the current draft and cursor.

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

In **Settings → Code editor**, choose the font, size, ligatures, completion, diagnostics, line numbers, block folding and wrapping. In the code panel, **Cmd/Ctrl + or −** changes font size, **Alt+Z** toggles wrapping, **Alt+Shift+F** formats JavaScript, and **Alt+Shift+M** minimizes the selection or the whole JavaScript document. Formatting respects a selection. A local TypeScript language service supplies JavaScript and three.js r187 completions and selected diagnostics; press **Ctrl+Shift+Space** to request suggestions. GLSL has syntax highlighting and keyword completion. Formatting and minimization currently apply to JavaScript, not GLSL or JSON.

For object behavior, select an object and open **Add Component** from Properties or the **F3** command palette. Search for **Add Script** to open a blank JavaScript component in Code, choose a starter behavior such as **Spin**, or copy a component already in the scene. Copies start with the source’s parameter values and have their own timeline identity. Rename or enable a component in its header and edit exposed parameters directly below. **Alt+Shift+P** runs Play in the Blender keymap, and **Alt+P** runs Play in the Basic keymap. **Command+Option+P** enters presentation mode and hides the editor chrome. The generated `scene.js` entry on the Scene mirrors the Code panel. Object scripts run in Play and in the playable exports.

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

Saved measurements are selectable by clicking their lines or choosing them in the outliner. Press **Tab** (Edit mode) to drag endpoints, add points, change units, or close the ruler. Existing ruler edits save on pointer release and support undo/redo. Press **Tab** to return to Object mode; use **New ruler** to start a separate measurement.

In **Edit mode**, use the vertex, edge and face glyphs beside the mode controls, or **1**, **2**, **3**. Click an element to select it; Shift-click adds or removes elements. **G/R/S** and the transform gizmo act on the selected vertices, edges or faces. Primitive/imported static meshes expose their triangles while preserving their UV seams and material groups during transforms; authored meshes retain polygon faces and topology operations. The topology pen remains a separate drawing tool.

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
