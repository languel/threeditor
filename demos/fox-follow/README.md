# Fox · Woodland loop

From the repository root, run `python3 -m http.server 5300` and open
`http://localhost:5300/demos/fox-follow/`.

The fox plays its embedded Run clip with an AnimationMixer while its parent
travels around an eight-unit-radius trail. The camera uses the editor's Third
Person controller with **Fox runner** as its follow target. Drag to orbit and
scroll to zoom. The editable project is in `scene.json`; use **Edit scene** or
File → Open in the editor, then Alt/Option+P to play.

The follow camera has an editable **Camera controller** script. Its Script tab
exposes the follow target UUID, movement and look speeds, orbit/pan/zoom speeds,
and pan/zoom toggles. **Object → Controller** can attach another preset, and
**Edit controller script** opens its source.

The original `assets/fox.glb` is copied from the local mediatheque's `gltf-fox`
item. The scene JSON embeds the model and all three animation clips. Import
the original GLB as a project asset if rebuilding source exports after opening
the JSON in a fresh session.

Fox model by PixelMannen (CC0), rigging and animation by tomkranis
([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), converted to glTF
by Asobo Studio and scurest. Source:
[Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox).
