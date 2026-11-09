# Streams examples

Open **File → Examples → streams**. Every scene has a preview input and runs before you connect a device. The **Streams** sidebar contains Routes, Web Serial, MIDI, Audio and video, and MediaPipe.

| Example | Live input |
| --- | --- |
| Arduino A0 | Upload the [p5comp Arduino sketch](arduino-a0/arduino-a0.ino), connect at 9600 baud, send `HELLO` and then `START`. Move the A0 input to change the size and position of the shape. |
| MIDI and audio | Select a MIDI input and move channel 1 CC 1. Open a media file or enable the microphone to drive the audio meter. Select a MIDI output and arm it to send audio level as channel 1 CC 11. |
| Video pinboard | Open a video or start the webcam. Video luminance changes pin depth. |
| Pose reach plane | Start the webcam and select MediaPipe Pose. Move your right wrist across the plane. |
| Laser harp | Enable instrument sound and start MediaPipe Hand. Move your index finger across the beams. |
| Body drum | Enable instrument sound and start MediaPipe Pose. Move either wrist into a pad. |
| Humanoid pose driver | Use MediaPipe Pose to move the avatar. Select its root, choose **Record motion**, then **Save motion clip**. Disable the live pose script to preview the baked clip in the timeline. |
| One-line portrait | Use MediaPipe Face with a webcam or video to draw a continuous line from the face landmarks. |

The pinboard and reach lessons adapt the interaction from threejslessons using luminance and pose, respectively. The source lessons also use depth estimation. The earlier recorded body, Triadic, and paint adaptations are under **lessons**, where Fox is last.

## Routes and scripts

A route maps an input interval to an output interval. Reverse either pair of bounds to invert the map. It can drive an object property, emit a `map.*` topic for another route, or send a MIDI CC, MIDI note, or serial line. Mapped topics take input from device or script topics. Device destinations require **Arm routed hardware output**. Project changes disarm them and preview samples never send to hardware.

Common inputs include `serial.A0`, `serial.value`, `serial.line`, `midi.cc.1.1`, `midi.note.1.60`, `midi.bend.1`, `midi.message`, `audio.rms`, `video.time`, `video.frame`, and `vision.pose.16.x`. Pose, Hand, and Face also publish `vision.<mode>.landmarks`.

Object scripts can read the latest value with `player.streams.get(topic)`, publish with `player.streams.publish(topic, value)`, or subscribe with `player.streams.subscribe(topic, handler)`. The subscription returns an unsubscribe function for the script’s `stop` hook. Mark synthetic samples with a `demo.*` topic or use them as a route’s preview fallback.

Import a `.vrm` through **Assets** to attach the pose driver. The driver reads VRM 0.x or 1.0 humanoid bone references and drives arm and leg directions. The demo uses an editable rig built into the scene. Full VRM expressions, spring bones, and advanced retargeting are outside this driver.

Device connections and permissions are session-local. Use HTTPS or localhost and a browser with the required device API. MediaPipe loads its pinned runtime and models on demand over the network. Playable exports include the router and built-in previews. Live device panels are available in the editor and Editable HTML. The plain JavaScript source export is a scene snapshot for stream-driven projects.
