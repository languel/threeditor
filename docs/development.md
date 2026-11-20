# threeditor developer setup

[Back to threeditor](../README.md) · [Interactive scenes](interactive-scenes.md)

Run these commands from the repository root.

## Run locally

```sh
python3 -m http.server 5300
```

Open `http://127.0.0.1:5300/` with the trailing slash. The hosted editor runs as static ES modules and loads a few libraries from a CDN. Serve it without COEP or COOP headers.

Try the [Fox woodland demo](../demos/fox-follow/) for an animated character with a Third Person follow camera. Its **Edit scene** link opens the saved project in the editor.

## Agent API and WebMCP

The editor exposes `window.threeditor.list()` for tool descriptions and `await window.threeditor.call(name, args)` for the same operations available through WebMCP. On browsers that implement WebMCP, tools register automatically through `document.modelContext`; inspect `window.threeditor.webmcp` and await `window.threeditor.ready` for registration status. Unsupported browsers still have the page API. WebMCP is a browser interface, not a standalone MCP server or network relay.

For example, `await threeditor.call('threeditor_object_create', { type: 'box', name: 'Test' })` creates an undoable object; `threeditor_state`, `threeditor_code_get`, `threeditor_code_apply`, and `threeditor_render` support code/render tests. Render returns a PNG data URL; WebMCP returns an image content block. Use `threeditor_asset_store` and `threeditor_asset_import_gltf` for base64 GLB/glTF files, `threeditor_script_set` for object scripts, and `threeditor_export` for base64 packaged ZIP/HTML output. `threeditor_commands`/`threeditor_command` expose editor menu actions, while `threeditor_ui_list`/`threeditor_ui_action` expose ordinary interactive controls. UI references can become stale when a panel redraws; list them again. Applying code executes the Scene contents section and replaces the scene objects, as the Script Window does. Project JSON does not itself contain the original source asset files; use the asset tools or editable HTML for those.

## Maintenance

GitHub Pages deploys the static site when `main` is pushed. The [handoff](../HANDOFF.md) covers the runtime, export paths, verification, and known gaps.

The bundled formatter in `editor/js/libs/code-tools.js` is built from `tools/code-tools-entry.mjs` with Prettier 3.9.10, Terser 5.51.2, and esbuild: `esbuild tools/code-tools-entry.mjs --bundle --minify --format=esm --target=es2020 --legal-comments=inline --outfile=editor/js/libs/code-tools.js`.
