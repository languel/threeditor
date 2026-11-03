# Handoff

Origin: an experiment in `languel/threejslessons` (folder `editor-experiment/`, branch history there has the full commit trail). Goal: a lightweight Blender-like staging tool for students that exports readable three.js code in the style of the lessons (`const cube = new THREE.Mesh(...)`, hierarchy via `add()`, comments).

## State

Working: everything in README. Verified manually in a browser (Playwright) at each step; there is no automated test suite.

## Key design points

- Upstream coupling is small: changes are in `ThreeCodeExporter.js`, `CodePanel.js` (new), plus edits in `Menubar.js`, `Menubar.File.js`, `Viewport.js`, `Viewport.Controls.js`, `Player.js`, `libs/app.js`, `Loader.js`, `Animation.js`, `Resizer.js`, `Sidebar.Project.App.js`, `css/main.css`, `index.html`. Search these for what differs from stock r187 before upgrading three.
- Code ↔ scene: the generated file has a `// @key Scene contents` … `// @/key` section. Apply runs only that section via `buildSceneFromCode` with stand-ins for `renderer`, `camera`, `controls`, `pmrem` (a Proxy over the real renderer with mutating calls disabled). Keep that contract when changing the generator.
- Assets: textures are re-encoded from memory; imported models keep their original files in `editor.sourceFiles`; a persistent asset map keeps blob URLs stable across regenerations. Text/URL paths in code are `assets/<name>`; Single HTML replaces those quoted literals with data URIs.
- Layout uses `--timeline-h` on `body`; z-index order: menubar 10, timeline resizer 6, timeline 5, code resizer 4, code panel 3, player 2, left sidebar resizer 2.
- Keyboard: Z/Shift+Z use `event.key`; Alt shortcuts use `event.code` (macOS Alt+P types a symbol). The CodePanel stops key propagation so editor shortcuts don't fire in the code box; a capture pointerdown blurs CodeMirror when clicking elsewhere.

## Gotchas

- Serve `/editor/` with the trailing slash; a server that redirects `index.html` breaks relative paths.
- Service worker + module caching: hard-reload (or disable cache in devtools) when testing.
- `realistic` shading (path tracer) logs a `cube_uv_reflection_fragment` shader error; excluded from the Z cycle. Not checked against stock upstream.
- Playwright tip: menu hover is CSS-driven; click options through `document.querySelectorAll('#menubar .option')`.

## Known gaps / next steps

1. Persist imported source files (IndexedDB) so models survive reloads; currently Apply/zip fail for them until re-imported.
2. Export background/environment textures (HDR/equirect).
3. Lighting parity when a background colour is set (editor vs. exported default environment).
4. Scripts, custom shaders, exotic geometry (currently raw buffers).
5. Teaching focus: beginner-friendly controls (Blender-style navigation/shortcuts, simplified UI/sidebar, lesson presets that load the repo's lesson scenes, code annotations/comments, hide advanced panels).
6. Consider trimming `examples/jsm` and the 13 MB wasm to what is used, or loading them on demand.
7. Add smoke tests (Playwright) for: add Box → code contains `BoxGeometry`; Apply round trip; each Publish option; Z cycle.
8. Upgrading three: replace `build/`, `examples/jsm/`, and diff `editor/` against the new upstream editor, re-applying the files listed above.

## License

three.js editor and library: MIT (`LICENSE`). esbuild-wasm: MIT (`editor/js/libs/esbuild-wasm/LICENSE.md`).
