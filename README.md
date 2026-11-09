# threeditor

threeditor is a lightweight three.js workspace for staging a scene, editing readable JavaScript, and publishing a standalone project. It is based on the three.js r187 editor.

[Open threeditor on GitHub Pages](https://languel.github.io/threeditor/editor/) · [Upstream three.js editor](https://github.com/mrdoob/three.js/tree/dev/editor)

## Run locally

```sh
python3 -m http.server 5300
```

Open `http://127.0.0.1:5300/editor/` with the trailing slash. The hosted editor runs as static ES modules and loads a few libraries from a CDN. Serve it without COEP or COOP headers.

Try the [Fox woodland demo](demos/fox-follow/) for an animated character with a Third Person follow camera. Its **Edit scene** link opens the saved project in the editor.

## Examples, lessons, and saved projects

Open **File → Examples** for a searchable folder tree:

- **threejs** keeps the original Arkanoid, Camera, Particles, Pong, and Shaders demos.
- **lessons** contains six editable projects: spinning cube, scene anatomy, recorded body landmarks, Triadic costumes, paint marks in space, and the Fox woodland loop last. The first five adapt scenes from [threejslessons](https://github.com/languel/threejslessons). Body and costume motion replays the supplied recording; no webcam or tracking-model download is required. Press **Alt/Option+P** to play and open object scripts to edit their exposed parameters.
- **User** contains projects saved in this browser. **File → Save** or **Ctrl/Cmd+S** asks for a name, downloads project JSON, and stores a separate browser copy with the imported source files. A name such as `Studies/Fox` creates nested folders; saving the same path updates that copy. Opening a built-in lesson creates a fresh workspace, so its first save does not replace an earlier User project.

Named projects use IndexedDB independently of the current workspace autosave. **File → New → Empty** does not erase the User folder. The collection belongs to this browser and site address; localhost and GitHub Pages have separate collections. Clearing the site's browser storage removes its local collection. Downloaded JSON retains the serialized scene; use the browser copy or Editable HTML to retain original source assets for later publishing.

The **Assets** sidebar tab (also available from the folder button in the top bar) has three sources: **Project** for files already retained with the scene, **My assets** for a reusable browser library, and **Mediatheque** for the full public catalog at [languel/mediatheque](https://github.com/languel/mediatheque). Search words or exact `#tags`, filter by type and collection, and inspect credits, rights, originals and BVH links. **Catalog connection** accepts another CORS-enabled catalog host.

Select an asset to preview it in the sidebar. Images show their full frame; video and audio have playback controls; GLB/glTF and math objects have orbitable previews. The model preview lets you play a clip before importing it. Imported files without catalog posters get thumbnails when they can be decoded.

Drag into the viewport to place an asset, or use its **Add** action to place it at the origin. Each format gets an editor object:

- **GLB/glTF:** the original hierarchy, rig, clips, and companion files, with viewer cameras and lights removed. The attached **Model viewer** script exposes two animation clips, blend, speed, time, loop, play, and wireframe controls. The selected model has controls in the editor viewport; they also appear in Play and exports.
- **Images and video:** planes with the original aspect ratio. Video and catalog animations with a video derivative receive an editable playback script. To use an image as a material map, choose **Apply as texture** or open a texture slot. Hover **Scene** and **Material** while dragging to reach their slots.
- **SDF and parametric JSON:** editable code objects built from the mathematical definition, without the archive's viewer scene. Raymarched SDFs use the WebGL renderer.
- **Audio and SPZ:** audio playback objects and editable point clouds, respectively. The SPZ view represents points and colors rather than Gaussian rendering.

Use **Edit attached behavior** or the object's **Script** tab to change the script or its parameters. Placement and parameter edits support undo/redo.

**Keep link** stores a lightweight catalog reference; **Save local copy** retains the file and its glTF companions in IndexedDB. Assets used in a scene are copied into that project's source files, preserving attribution and URLs for named User saves and Editable HTML. **My assets** supports folders, moving cards to folders, multi-selection with Ctrl/Cmd/Shift, editable titles/tags, ratings and deletion. Removing a folder moves its assets to the parent; removing a library item does not remove copies already used in projects. Browser collections are specific to the site address and are removed by clearing site storage.


Regenerate the five adapted lesson projects with `node tools/build-lessons.mjs`. The builder and its vendored source modules/recording are in `tools/`; provenance and the adaptation scope are documented in [the lesson notes](editor/examples/lessons/README.md).

## Workspace

- The four icons beside the gear toggle the **Code panel**, **sidebar**, **timeline**, and **transform toolbar**. Double-click a resize bar to collapse its panel. Hover at the corresponding edge for a temporary reveal.
- The **gear** opens **Settings**, with collapsible General, Theme, Shortcuts, and History sections. General holds language, autosave, and an option to auto-hide the top menu; move to the top edge to reveal it. Theme offers System, Light, Dark, Mono Light, Mono Dark, and Warm Dark presets. Adjust the palette colors, enter a name, and choose **Save theme** to keep a custom theme; select a saved theme to edit or delete it. Themes also color the code editor. Hosted editor preferences and autosaved projects are stored in the browser; editable HTML exports include the saved themes.
- Use the outliner’s power icon to disable an object and its children. They leave the rendered scene and their behaviors stop. Turning them back on restores their existing visibility settings.
- The viewport camera dropdown chooses the view used for preview and publishing. The top **Camera** in the outliner is the editor's orbit camera. Added cameras keep their own transforms and can be parented to objects.
- Mouse navigation defaults to **Standard**: left-drag to orbit, Shift-left-drag or right-drag to pan, and scroll to zoom. **Settings → General → Mouse navigation** can switch to Blender middle-mouse navigation independently of the keyboard shortcut preset. Backtick activates WASD fly navigation with either mouse mode.
- The top **Camera** is the director view: standard mouse navigation and backtick/WASD fly navigation are always available. For scene cameras, **Object → Controller** attaches an editable Orbit, Fly, First Person, or Third Person script for Play and playable exports. Third Person offers a **Follow target**. Choose **Edit controller script** to change its behavior; the Script tab exposes speed, sensitivity, zoom, pan and follow parameters. Scene cameras start with no controller. Source exports retain the controller preset and parameters; use playable exports for custom script behavior.
- Choose **Preview** in the shading dropdown to view the scene without editor helpers. Under **Scene**, an unset background with **Environment → Default** uses procedural studio lighting. A solid background color supplies its own ambient environment. **Equirect** loads an environment image separately.

In **Settings → Shortcuts**, choose **Blender** (the default) or **Basic (Maya)**, search actions and menu commands, and click a binding to record a combination. The × clears a binding; assigning an existing combination clears its previous action. Each preset keeps its own changes. Reset restores that preset's defaults. Keyboard shortcuts are suspended while typing in fields or the code editor.

In the Blender preset, **Shift+A** opens a searchable Add menu at the last viewport pointer position. Right-click the viewport for object actions and Add. Both use the same commands as the main menus, so added objects use their usual positions and can be undone. Search, use arrow keys or click an item; Escape closes the menu.

Press **F3** or **Cmd/Ctrl+K** to open the command palette. Search editor actions and menu commands, then press Enter or use the arrow keys. Both palette bindings can be reassigned in Shortcuts.

With the Blender preset, **G**, **R**, and **S** start a mouse-driven grab, rotate, or scale; **X/Y/Z** constrains an axis, **Shift+X/Y/Z** constrains the perpendicular plane, and typing a number sets an exact amount. Click or Enter accepts; right-click or Escape cancels. Snapping is not yet implemented. Numpad 1/3/7 set front/right/top views (Ctrl or Cmd for their opposites), Numpad 5 toggles projection, Numpad 0 toggles a scene camera, and Numpad decimal frames the selection.

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

The **bottom timeline** previews one stored animation clip at a time. Select the imported model's root to show its clips, then use the transport or scrub the tracks. The bundled [spinner model](test-models/spinner.glb) has two clips to try. Use a script with `THREE.AnimationMixer` for playback that mixes clips.

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
