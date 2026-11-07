# Handoff

threeditor started as the `editor-experiment/` folder in `languel/threejslessons`. It now runs as a static three.js r187 workspace with a docked Code panel, clip preview, presentation mode, and offline publishing.

## Run and deploy

- Run `python3 -m http.server 5300` from the repository root and open `/editor/`. Keep the trailing slash for the relative module and asset paths.
- GitHub Pages uses the Actions workflow in `.github/workflows/pages.yml`. A push to `main` assembles the static site and deploys it. The workflow can also be dispatched manually.
- Smoke-test the deployed editor, including the `/threeditor/` base path, at [GitHub Pages](https://languel.github.io/threeditor/editor/).
- The editor still registers the upstream cleanup service worker. It unregisters itself and clears old caches. Hard-reload if an older session is serving stale modules.

## Implementation map

| Area | Entry points and behavior |
| --- | --- |
| Startup | `editor/index.html` loads `EditorApp.js`. The same startup initializes hosted and packaged sessions. The hosted session restores IndexedDB state and retains imported source files in `editor.sourceFiles`. |
| Code and scripts | `CodePanel.js` mirrors generated `scene.js`, follows selection, and edits object scripts and shaders. `ThreeCodeExporter.js` emits readable source and object line ranges. Apply executes the marked Scene contents section with runtime stand-ins. `libs/app.js` skips generated and disabled scripts. |
| Camera and lighting | `Editor.toJSON()` stores the editor camera in `camera` and the viewport camera UUID in `viewportCamera`. Legacy saves with a duplicate camera UUID recover the default editor camera. The player resolves the selected scene camera in the loaded graph so parent transforms and camera scripts affect playback. The source exporter captures the selected camera's framing and rebuilds procedural environment lighting. |
| Workspace | `PanelDock.js` manages docked, collapsed, and overlay states; `MenuAutoHide.js` handles the optional top-edge menu reveal. `Animation.js` previews one active clip. `Sidebar.Settings.js` and `Theme.js` manage presets and saved palettes, including opacity and code editor colors. With translucent panels, the viewport extends behind them, changing its framing. Material base-color opacity maps to standard three.js material opacity and transparency. |
| Shortcuts and navigation | `Keymap.js` registers the editor actions and menu commands, persists independent Basic and Blender overrides, and resolves collisions. `Sidebar.Settings.Shortcuts.js` provides search and key capture. `ModalTransform.js` implements mouse-driven Blender G/R/S with axis constraints, accept/cancel and undo; it is not the full Blender transform system. `FlyControls.js` flies the actual viewport camera, including parented cameras, with cancel and scene-camera undo. Keymap preferences travel with editable HTML. |
| Agent harness | `AgentAPI.js` owns the shared `window.threeditor` registry and registers WebMCP tools where `document.modelContext` is available. Tools cover scene, UI, commands, code, PNG render, assets, scripts, project state and exports. WebMCP discovery and invocation were tested with Chrome's experimental `WebMCP` feature enabled, as well as a mock provider; no external agent was tested. The API is in-page, not an external MCP relay. |
| ZIP and playback | `Publish.js` validates supported module and asset dependencies. Source project generates JavaScript, while Playable scene serializes the scene and shares `libs/app-bootstrap.js` with Playable HTML. `SingleHtml.js` uses the vendored esbuild WASM for a single-file player. |
| Portable editor | `EditorHtml.js` bundles the editor and embeds the project, scripts, source files, and runtime assets. `PortableSession.js` restores them and saves a new HTML copy without rebuilding the editor bundle. Its presentation stack icon is hidden until hover or focus by default. The `project/presentationEditVisible` preference travels in the embedded config. |

## Verification and limits

Chrome smoke tests have covered editable and playable files opening offline, an animated GLB, glTF companion files, an object script with a packaged asset and module, disabled scripts, camera recovery, environment lighting, panel controls, custom theme persistence, translucent panel layout, menu auto-hide, material opacity undo/redo, and re-saving an edited HTML copy. WebGPU packaging has been checked at build time. Runtime playback checks used WebGL. Browser smoke tests currently run outside the repository.

- Older autosaves and standalone project JSON files may require re-importing the original model and companion files for source publishing.
- Dependency discovery covers static imports and supported literal asset paths. Custom runtime code can require additional packaging support. A portable editor re-save retains the libraries bundled in the original HTML. Build with the hosted editor when adding new module dependencies or producing ZIP or Playable exports.
- Source publishing reconstructs the scene from its supported material, geometry, and lighting features. Use the serialized player for attached object behavior.
- Render Image's **Realistic** mode uses the experimental WebGPU path tracer in megakernel mode and requires WebGPU. A simple r187 scene and its default environment were rendered in Chrome; broader material, lighting, and device coverage remains unverified. The separate viewport Realistic mode still uses the older WebGL tracer and has not received the same compatibility work.
- When upgrading three.js, compare the editor and vendored build/addons against upstream and rerun the publish and import smoke tests.

## Licenses

- three.js editor and library are MIT. See `LICENSE`.
- esbuild-wasm is MIT. See `editor/js/libs/esbuild-wasm/LICENSE.md`.
- Acorn 8.15.0 is MIT. See `editor/js/libs/acorn/LICENSE`.
