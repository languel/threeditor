# threeditor scripting, animation, devices, and publishing

[Back to threeditor](../README.md) · [Editor reference](editor-reference.md)

## Code, scripts, and animation

Open the **Scripting** workspace or select **Script Window** from the editor picker to see the generated scene. Script Window opens beside the viewport. Use **Close editor area** to return to the previous layout. Scene changes regenerate the code. Edit the section between `// @key Scene contents` and `// @/key`, then choose **Apply**, press **Ctrl/Cmd+Enter**, or enable **auto** to apply after a pause. Auto is off by default. The Script Window also opens object scripts and material shader editors. In the outliner, an object’s `<>` glyph toggles its script editor; clicking another object’s glyph switches to that script. Use **Browse code documents** to search scene source, scripts, and material shaders by name or object path. Turn on **Pin code document** to keep it open while selecting other objects in 3D. With the pin off, opening an object document selects its owner and the Script Window follows scene selection. The Script Window remembers each script and shader draft, cursor, and undo history when you switch documents in the current project. Valid source saves as you type. **Ctrl/Cmd+Enter** saves the current script or shader immediately, or applies the generated scene when it is open. Invalid JavaScript and GLSL that fails WebGL compilation keep the working source active. Opening or clearing a project starts a new set of documents.

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

For object behavior, select an object and open **Add Component** from Properties or the **F3** command palette. Search for **Add Script** to open a blank JavaScript component in Code, choose a starter behavior such as **Spin**, or copy a component already in the scene. Copies start with the source’s parameter values and have their own timeline identity. Rename or enable a component in its header and edit exposed parameters directly below. **Alt+Shift+P** runs Play in the Blender keymap, and **Alt+P** runs Play in the Basic keymap. **Command+Option+P** enters presentation mode and hides the editor chrome. The generated `scene.js` entry on the Scene mirrors the scene source in the Script Window. Object scripts run in Play and in the playable exports.

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
- Find GLB clips under **Properties → Animations**. Preview or scrub a clip there, or choose **Add to timeline** to schedule it at the current frame. Try the bundled [spinner model](../test-models/spinner.glb).

Play and playable exports run the saved timeline. Script parameters attached to live asset behaviors can also be previewed while editing.

## Streams and devices

Open **Streams** to connect MIDI or Web Serial. Add live devices or upload images, movies, and audio in **Assets**, then use **Streams → Assign asset…** to choose an input. Pause releases live capture and keeps the asset assigned. Webcam planes update in the editor and hold the last frame when paused. Choose a named input in MediaPipe and turn on **Enable MediaPipe**. Holistic tracks pose, hands, and face together. The MediaPipe preview overlays landmarks on the selected input, including irises when available. Routes map scalar topics to scene properties, derived topics, MIDI, or serial. Connect and arm hardware output explicitly before using output routes.

**File → Examples → streams** includes Arduino A0, MIDI and audio, video pinboard, pose reach, laser harp, body drum, humanoid pose capture, and a one-line portrait. All eight have previews that run without devices. See the [Streams example guide](../editor/examples/streams/README.md) for setup and topic names.

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
