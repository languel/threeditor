# threeditor

threeditor is a lightweight three.js workspace for staging a scene, editing readable JavaScript, and publishing a standalone project. It is based on the three.js r187 editor.

[Open threeditor on GitHub Pages](https://languel.github.io/threeditor/editor/) · [Upstream three.js editor](https://github.com/mrdoob/three.js/tree/dev/editor)

## Run locally

```sh
python3 -m http.server 5300
```

Open `http://127.0.0.1:5300/editor/` with the trailing slash. The hosted editor runs as static ES modules and loads a few libraries from a CDN. Serve it without COEP or COOP headers.

## Workspace

- The four icons beside the gear toggle the **Code panel**, **sidebar**, **timeline**, and **transform toolbar**. Double-click a resize bar to collapse its panel. Hover at the corresponding edge for a temporary reveal.
- The **gear** opens **Settings**, with collapsible General, Theme, Shortcuts, and History sections. General holds language, autosave, and an option to auto-hide the top menu; move to the top edge to reveal it. Theme offers System, Light, Dark, Mono Light, Mono Dark, and Warm Dark presets. Adjust the palette colors, enter a name, and choose **Save theme** to keep a custom theme; select a saved theme to edit or delete it. Themes also color the code editor. Hosted editor preferences and autosaved projects are stored in the browser; editable HTML exports include the saved themes.
- The viewport camera dropdown chooses the view used for preview and publishing. The top **Camera** in the outliner is the editor's orbit camera. Added cameras keep their own transforms and can be parented to objects.
- Choose **Preview** in the shading dropdown to view the scene without editor helpers. Under **Scene**, an unset background with **Environment → Default** uses procedural studio lighting. A solid background color supplies its own ambient environment. **Equirect** loads an environment image separately.

## Code, scripts, and animation

Open **Code** to see the generated scene. Scene changes regenerate the code. Edit the section between `// @key Scene contents` and `// @/key`, then choose **Apply**, press **Ctrl/Cmd+Enter**, or leave **auto** enabled. The Code panel also opens object scripts and material shader editors.

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
