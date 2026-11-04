# threeditor

A fork of the official [three.js editor](https://github.com/mrdoob/three.js/tree/dev/editor) (r187, MIT) that turns a staged scene into **readable, lesson-style three.js code**, live, in both directions. Built as a foundation for a teaching tool: stage a scene Blender-style, see the code, edit the code, publish.

Static ES modules, no bundler, no npm install. Everything (three build, addons, editor) is vendored and self-contained.

## Run

    python3 -m http.server 5300
    # open http://127.0.0.1:5300/editor/      (keep the trailing slash)

Don't use a server that adds COEP/COOP headers: the editor loads CDN scripts. Hard-reload after pulling changes (the editor registers a service worker).

## Features added on top of upstream

- **Code panel** (menu **Code**): docked CodeMirror panel, resizable (width persisted), themed to match the editor in light/dark.
  - Scene → code regenerates ~250 ms after any scene change.
  - Code → scene: edit, then Apply / Ctrl/Cmd+Enter (or *auto*). Applies the `// @key Scene contents` … `// @/key` section.
  - Follows selection: nothing selected → scene code; object with an attached script → that script (saved as you type); other objects → scene code scrolled/highlighted at their lines.
  - Object scripts and material Vertex/Fragment/Program editors open in this panel (the stock popup is gone).
  - The scene code is mirrored as a generated, read-only-named `scene.js` script on the Scene (Properties → Script); it is skipped by Play/export runtime.
  - Copy, `.js`, `.html` (CDN), `.zip`.
- **Exporter** produces meshes, geometry args, materials, texture maps, lights, shadows, camera, background, fog, hierarchy, `GLTFLoader`/`OBJLoader` for imported models and `AnimationMixer` for clips.
- **File > Publish**
  - *three.js project (.zip)*: `index.html`, `main.js`, `assets/`, local `lib/` (only the addons used).
  - *Single HTML (esbuild)*: one self-contained `.html`, bundled in the browser with a vendored esbuild-wasm; JS and all assets inlined. Opens from `file://`.
  - *Editor app build (.zip)*: upstream's Publish (player + `app.json`).
- **View modes**: shading dropdown gains `preview` (looks like Play / the exported code). **Z / Shift+Z** cycle solid → wireframe → normals → preview (ignored while typing). `realistic` (path tracer) is dropdown-only.
- **Play**: **Alt+P** toggles; play view is opaque with the editor's clear colour and default environment. **Alt+Cmd+P** presents fullscreen with no UI; Z/Shift+Z work while presenting.
- **Layout**: timeline spans the full width below sidebar and code panel (`--timeline-h` CSS variable); menubar dropdowns sit above panels.
- GLB/OBJ import with hierarchy and animation inspection works end to end (`test-models/` has `spinner.glb` with two clips and `knot.obj`).

## Layout

    editor/           the editor (index.html, js/, css/); upstream layout
      js/ThreeCodeExporter.js   scene -> code, assets, zip, single-html, code -> scene
      js/CodePanel.js           the docked panel
      js/libs/esbuild-wasm/     vendored esbuild-wasm 0.28.2 (13 MB wasm, loaded lazily)
    build/            three r187 (three.module.js, three.core.js, webgpu/tsl)
    examples/jsm/     r187 addons (loaders, exporters, libs)
    test-models/

See `HANDOFF.md` for status, gotchas and next steps.
