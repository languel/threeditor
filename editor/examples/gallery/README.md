# Captured spaces

Open **File → Examples → Captured spaces**. The gallery and room examples include the original SPZ files and run from the editor’s own host.

| Example | What to try |
| --- | --- |
| **DDA Gallery · Scan and proxy** | Compare the capture with the floor, angled west wall, east wall, and the mullions and panes at both glazed ends. Toggle **Scan · DDA Gallery Empty Dark** or **Reference outlines** in the outliner. The bench and pedestal are separate groups. |
| **DDA Gallery · Pedestal and wall mapping** | Select **Pedestal particles** and click **Look through** in Object, then turn on **Split view**. Adjust its projected mask and particle count or speed. The east wall carries two separate masked projections, and the animated **Orbit knot** SDF floats above the pedestal. Turn on the capture in the outliner to compare physical placement against it. |
| **Spatial Computing Room · Alignment** | Look through **Back wall projector** to align the calibration grid against the simplified walls and capture. Switch to **Measure** to calibrate the scene from a known physical measurement. |

The room reference, outlines, and scans are locked and excluded from viewport selection. Use their outliner controls to show, hide, or unlock them. The ambient fill light is also locked.

The proxy geometry was fitted from the visible scan surfaces and splat positions. It provides approximate scene dimensions for alignment. Verify measurements on site before using the model for physical installation. The animated SDF uses the WebGL renderer.

## Sources

- DDA Gallery Empty Dark, capture by @languel, 2026, CC0 1.0. [Mediatheque record](https://languel.github.io/mediatheque/site/index.html#/ddagallery-empty-dark)
- Spatial Comp Room, capture by @languel, 2026, CC0 1.0. [Mediatheque record](https://languel.github.io/mediatheque/site/index.html#/spatialcomproom)
- The wall projections reuse Eadweard Muybridge’s *The Horse in Motion* and Carleton Watkins’s *View from the Sentinel Dome, Yosemite*. [Projection example credits](../projection/README.md)

Run `node tools/build-gallery-examples.mjs` to rebuild from the published catalog. Pass a Mediatheque checkout as the first argument to use a local copy. The builder checks each source SPZ against the catalog’s SHA-256 digest.

## DDA Gallery · Lofts and cinema fragments

Open this scene under **File → Examples → Captured spaces**. The proxy walls and glazing use inward-facing polygons to make the room a cutaway from outside. The aligned DDA scan is bundled and starts hidden so the cutaway stays clear. Reveal the scan from the outliner.

Three tapered, tilted lofts made from sampled curves receive *Danse serpentine*, *The May Irwin Kiss*, and *Fred Ott’s Sneeze*. Three separate projectors around the floor-standing, tilted ovoid show drifting, elliptical head and hand crops from two Edison films. The crops follow manually timed marks by default.

Each of the six projectors has a silhouette mask linked to its receiver. The generator checked 9,699 receiver rays across all six projectors with zero samples blocked by opaque gallery geometry. This check uses the proxy geometry. Use the aligned scan and on-site measurements to confirm fixture placement in the physical room. To test spill control, move a plate projector back in **Split view** with the calibration grid enabled. Open **Modeling → Edit projection warp** to adjust the outgoing image. For a material texture, select a loft, open **Modeling → Edit UVs**, and choose its plate projector as the starting layout.

Select an **Orb projector** and turn on **Script → Live tracking** to run MediaPipe Face and Hand Landmarker on its playing clip. The tracker downloads its model and WASM on demand. Authored crops fill in for regions without landmarks. The Script panel reports the live head and hand counts or the fallback state. **Fragment drift** and **Fragment size** adjust the output in either mode.

Each clip is a bundled public-domain proxy from [Languel’s Mediatheque](https://languel.github.io/mediatheque/site/). The example catalog carries the individual film credits and source links. To regenerate just this scene from a local checkout, run `node tools/build-gallery-examples.mjs ~/dev/mediatheque --cinema-only`.
