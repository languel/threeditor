# Unified drawing and modeling workspace

Use Blender's mode, area and shortcut conventions as interaction defaults. Keep Three.js scene objects and the existing player as the runtime. Build shared authoring tools around the current edit workspace and port ThreeGrease behavior where it fills a specific gap. Use one visual system for editor controls across 3D, 2D and code.

Baseline is the local annotated tag `pre-unified-workspace` at `4a5ab83`. All 76 baseline Node tests passed. ThreeGrease was examined read-only on `uitweaks`, which has local edits. Blender's [default keymap](https://docs.blender.org/manual/en/latest/interface/keymap/blender_default.html) is the interaction reference.

## 1. Inventory the editor and establish representative scenes

- Map every top-level action, mode, panel and keyboard binding against `EditorApp.js`, `Viewport.js`, `ViewportTools.js`, `EditWorkspace.js`, `Keymap.js`, `Sidebar*.js`, `PanelDock.js`, `Animation.js`, `CodePanel.js`, and `main.css`. Record where actions are duplicated and choose the owning area and mode before moving controls.
- Capture baseline browser workflows using a mesh with UVs, an existing curve and filled shape, a gallery scan/projector, and the spinning cube and Fox examples for scripting and playback. Save and reopen representative copies to establish existing behavior.
- Verify with `node --test test/*.test.mjs` and baseline use of `test/project-library.browser.html` and `test/asset-sidebar.browser.html`. Review viewport, split, 2D editor and code screenshots at desktop and narrow widths.

## 2. Consolidate layout and input

- Establish one default visual system around mode header, tool shelf, Outliner, Properties and Timeline. Audit `Glyphs.js`, `UIConsistency.js`, `Theme.js` and `main.css` for conflicting spacing, control heights and density. Migrate saved preferences and panel layout keys where needed.
- Map existing glyphs to their Blender equivalents by function. Prioritize selection and transform tools, vertex/edge/face modes, viewport shading, snapping, and common Outliner object types. Use the same glyph for the same action throughout the editor. Keep tooltips and accessible names, and give threeditor-specific controls distinct glyphs.
- Make action availability and labels agree between the viewport, F3, context menus and Properties. Consolidate mode and focus handling across split panes. Place Surface Paint and sculpt brushes in their respective modes and reclaim Mesh Edit keys 1–3. Document browser and trackpad fallbacks. Keep timeline transport and scene Play separately accessible.
- Extend `test/editor-navigation.test.mjs` where needed. Exercise key and pointer sequences in a split view, menu actions while hovering each area, and text editing in Code and numeric inputs. Check keyboard access to tool controls and resize handles.
- Compare the glyph mapping against Blender and verify recognition at toolbar and Outliner sizes, including selected and disabled states.

## 3. Share modeling and contour editing

- Trace source data and edit operations through `ModelGeometry.js`, `ModelViewport.js`, `MeshSelection.js`, `ModelSnap.js`, `PolyOperations.js` and `Modifiers.js`. Reuse command history and existing selection behavior for overlapping operations. Preserve the base geometry and evaluated modifier output.
- Use a shared editable point and contour model for freehand strokes, curves, shapes and surface traces. Adapt existing geometry at the serialization boundary. Share point insertion, move, delete, close and smoothing with `MaskEditor.js` and `MaskSculpt.js` where their coordinate systems permit, keeping lens projection and boolean aperture rules in the mask adapter.
- Check modeling, modifiers, selection and snap suites. Add round-trip fixtures for legacy paths and shapes and gesture tests for path point edits, curve extrusion and multi-contour projector masks.

## 4. Make paint output a brush choice

- Use `SurfacePicking.js` and splat depth selection as starting points for shared hit testing. Compare ThreeGrease's `src/core/brushes.ts`, `src/tools/texpaint.ts`, `src/tools/splatbrush.ts`, and `src/render/paintclouds.ts` for sampling, texture stamping and paint-cloud batching.
- Keep one brush gesture and preview lifecycle. Route samples to vector contours, UV texture stamps, or editable splat batches. Expose receiver eligibility in the tool. Store receiver-local placements and avoid mutating imported scan data. Establish compatibility rules for missing UVs, locked targets and topology changes, then implement undoable commits.
- Exercise pressure, canceled gestures, receiver crossings, transformed receivers, UV seams and overlapping scan depth in browser checks. Verify each medium through undo/redo, project reload, Play and standalone publish. Measure responsiveness and scene size after repeated splat strokes to guide batching.

## 5. Finish component authoring and validate the integrated flow

- Build the component interaction on `Sidebar.Script.js`, `ScriptParams.js`, `CodePanel.js` and `libs/app.js`. Keep generated scene code, object JavaScript and material shaders distinct in the editor. Keep existing scripts, timeline bindings and camera controllers loadable under their current IDs.
- Audit persistence and export in `Editor.js`, `ProjectLibrary.js`, `Publish.js`, `ThreeCodeExporter.js` and `SingleHtml.js` as each prior slice lands. Verify asset references and receiver transforms in round trips. Preserve editable source through formats with editor data and verify rendered output in player formats.
- Run the full Node suite and browser fixtures. In the final browser walkthrough, edit a mesh and a freehand contour, paint in the three media, animate a property, attach a component with an exposed parameter, then save, reopen and run a published copy. Reopen the pre-redesign gallery, lesson and Fox fixtures for regressions.

## Risks to resolve during implementation

- Existing surface paint creates geometry marks. Texture painting and editable Gaussian batches need separate data lifecycles even though they share brush interaction.
- Initial texture support assumes usable UVs. Initial surface attachments follow rigid object transforms. Deforming topology and scan reimport need explicit remapping rules before they can preserve attachments.
- Blender bindings can collide with browser and operating-system shortcuts. Test the actual focus and platform combinations and provide visible alternatives.
- Treat projector aperture previews, live media and existing script parameters as compatibility checks during each slice. A layout pass alone can break their event routing.


## Latest checkpoint

The remote workspace commit added an interaction-mode selector, the Blender shading pie, three paint outputs, and an authoring walkthrough. The next input pass added the Ctrl+Tab mode pie and made Box, Lasso, Circle, Knife, Invert, Fill, and Extrude searchable through the same command registry that handles their bindings. The walkthrough now exercises the mode pie and keyboard selection through F3 before testing modeling, painting, scripting, and standalone publishing.

Shortcut and palette routing now follows the active area. Mesh editing keeps its selection when using the Outliner or Timeline, while the Timeline supports deleting its own selection through the same commands as its inspector. Object, Edit, Sculpt and Paint now have mode-specific shelves with a remembered Edit tool and Sculpt brush. The workspace tabs, compact Layout timeline, independent Outliner, vertical Properties tabs, and mixed 2D/3D split now follow the supplied Blender references. Continue with shared contour editing, toolbar and interaction parity, and the wider legacy-scene audit before the engine phase.

3D paths and shapes and the 2D vector and projector-mask editors now share contour edge picking, insertion, and closure rules. The browser check inserts on the closing seam in 3D, exercises the smoothing command and sampled curve hit, and verifies 2D contour conversion. Shared movement and contour workflows and the game engine remain open.

Object Mode now has Box, Lasso, and Circle Select, selection operations, and framing for multiple objects. Browser coverage includes a split pane, locked references with selection disabled, canceling a gesture, and undoing deletion of a parent and child selection.

Local View and temporary hide/reveal now filter Director panes, their selection and their surface tools. A scene-camera split regression checks that render and save preserve authored visibility. A DDA Gallery check also verifies Gaussian rendering in the optical pane and Play while the Director is isolated.
