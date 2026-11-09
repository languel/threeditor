// Ordered folders and lessons. Paths resolve relative to editor/ on every host.
const exampleCatalog = [
	{ title: 'threejs', children: [
		{ title: 'Arkanoid', file: 'examples/threejs/arkanoid.app.json' },
		{ title: 'Camera', file: 'examples/threejs/camera.app.json' },
		{ title: 'Particles', file: 'examples/threejs/particles.app.json' },
		{ title: 'Pong', file: 'examples/threejs/pong.app.json' },
		{ title: 'Shaders', file: 'examples/threejs/shaders.app.json' }
	] },
	{ title: 'streams', children: [
		{ title: 'Arduino A0', file: 'examples/streams/arduino-a0.app.json' },
		{ title: 'MIDI and audio', file: 'examples/streams/midi-audio.app.json' },
		{ title: 'Video pinboard', file: 'examples/streams/pinboard.app.json' },
		{ title: 'Pose reach plane', file: 'examples/streams/pose-reach.app.json' },
		{ title: 'Laser harp', file: 'examples/streams/laser-harp.app.json' },
		{ title: 'Body drum', file: 'examples/streams/body-drum.app.json' },
		{ title: 'Humanoid pose driver', file: 'examples/streams/humanoid-pose.app.json' },
		{ title: 'One-line portrait', file: 'examples/streams/one-line.app.json' }
	] },
	{ title: 'lessons', children: [
		{ title: '00 · A spinning cube', file: 'examples/lessons/00-cube.app.json' },
		{ title: '01 · Anatomy of a scene', file: 'examples/lessons/01-anatomy.app.json' },
		{ title: '02 · Recorded body landmarks', file: 'examples/lessons/02-body.app.json' },
		{ title: '03 · Triadic costumes', file: 'examples/lessons/03-triadic.app.json' },
		{ title: '04 · Paint marks in space', file: 'examples/lessons/04-paint.app.json' },
		{ title: '05 · Fox woodland loop', file: '../demos/fox-follow/scene.json', assets: [ { path: 'fox.glb', file: '../demos/fox-follow/assets/fox.glb' } ] }
	] }
];

function exampleResources( entries = exampleCatalog ) {
	return entries.flatMap( entry => entry.children ? exampleResources( entry.children ) : [ entry.file, ...( entry.assets || [] ).map( asset => asset.file ) ] );
}

export { exampleCatalog, exampleResources };
