# Unified workspace acceptance criteria

- One default workspace presents a consistent viewport header, tool shelf, Outliner, Properties and Timeline, with Code available on demand.
- Viewport actions use Blender's default bindings where practical, including Tab, F3, G/R/S, mesh Edit 1/2/3 and middle-mouse navigation.
- Tools, object types and controls with Blender equivalents use recognizable Blender glyphs for the same function, with consistent meanings across the editor and accessible labels.
- Keyboard input goes to the area under the pointer or the focused text editor as appropriate, and supported browser overrides have visible menu equivalents.
- The active object, mode, selection and available actions agree across split viewports, Outliner, Properties, context menus and command search.
- Mesh, curve and stroke editing share construction, selection, snapping, transforms and undo wherever those operations apply.
- Freehand strokes, authored paths, closed contours and surface traces can be edited with the same point and stroke tools. Existing fills and curve shapes survive reopening.
- Draw tools use one brush interface for vector, texture and splat output, with shared size, color, opacity and pressure controls where applicable.
- Vector strokes can be placed in free space or attached to visible mesh or scan surfaces. Texture paint targets UV-mapped meshes. Splat paint works in free space and on mesh or scan surfaces.
- Painted content follows its receiver's object transform. Undo and redo apply to a whole gesture, including a stroke that crosses receivers, and Escape cancels an in-progress gesture.
- The existing 2D mask and vector editors share contour editing behavior with the 3D drawing tools while retaining projector coordinate and aperture semantics.
- An object can receive, enable, disable and edit JavaScript components from Properties. Public parameters are editable there, and Play executes components against live Three.js objects.
- Existing saved projects open with their geometry, scripts, assets, masks, and timeline intact. New authoring data reopens after save, and its visible output survives Play and supported standalone publishing routes.
- The same scene can be modeled, painted in all three media, animated and run interactively without forcing the user to move between separate apps.
