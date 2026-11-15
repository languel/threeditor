# Projection mapping examples

Open these projects under **File → Examples → Projection mapping**. The bundled source copies let you open the scenes and publish them from a local server.

| Scene | Try this | Source |
| --- | --- | --- |
| **Yosemite relief** | Select **Folded relief**, open **Modeling**, and change a ridge vertex’s Z coordinate. Compare how the photograph falls across the faces. | Carleton Watkins, *View from the Sentinel Dome, Yosemite*, 1865–66. The Metropolitan Museum of Art. [Mediatheque record](https://languel.github.io/mediatheque/site/index.html#/watkins-sentinel-dome-1865) |
| **Canyon aperture** | Select **Projector** and open **Modeling**. Drag an aperture point, switch from **Light inside** to **Block inside**, or copy **Aperture outline** again. Click **Apply mask** after editing. | Timothy H. O’Sullivan, *Ancient Ruins in the Cañon de Chelle, N.M.*, 1873. The Metropolitan Museum of Art, Gilman Collection. [Mediatheque record](https://languel.github.io/mediatheque/site/index.html#/osullivan-canyon-de-chelly-1873) |
| **Gallop triptych** | Move the recessed panel toward the projector. Toggle **Calibration grid** to inspect how the change affects alignment across the three panels. | Eadweard Muybridge, *The Horse in Motion: Sallie Gardner*, 1878. Palo Alto Stock Farm / Library of Congress. [Mediatheque record](https://languel.github.io/mediatheque/site/index.html#/muybridge-sallie-gardner-1878) |

All three sources are marked public domain in the Mediatheque catalog. The project assets retain the catalog credits and source URLs.

Regenerate the scenes and copy their sources with `node tools/build-projection-examples.mjs`. The script looks for a sibling `mediatheque` checkout. Pass a directory as its first argument to use another checkout.
