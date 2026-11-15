# Captured spaces

Open **File → Examples → Captured spaces**. All three examples include the original SPZ files and run from the editor’s own host.

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
