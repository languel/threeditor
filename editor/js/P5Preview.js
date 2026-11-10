// Toggleable live preview for p5 sketch scripts in the editor viewport.
// The sketch canvas feeds a CanvasTexture on the host mesh via a chained
// onBeforeRender hook (same pattern as video media). Pausing calls noLoop,
// which holds the last rendered frame like a paused video stream.

import { createP5Sketch } from './P5Sketch.js';
import * as THREE from 'three';

function P5Preview( editor ) {

	const signals = editor.signals;
	const live = new Map(); // script -> { api, texture, object, material, prevMap, prevRender, timer }
	let syncQueued = false;

	function isP5( script ) {

		return script && script.type === 'p5' && script.generated !== true;

	}

	function wantsPreview( object, script ) {

		return isP5( script ) && script.enabled !== false && script.preview === true &&
			object && object.isMesh && object.material;

	}

	async function enable( object, script ) {

		if ( live.has( script ) ) return;
		const entry = { object, material: null, texture: null, api: null, prevMap: null, prevRender: null, timer: 0 };
		live.set( script, entry );
		try {

			entry.api = await createP5Sketch( script.source );
			if ( ! live.has( script ) ) {

				entry.api.remove();
				return;

			}
			const canvas = entry.api.canvas;
			if ( ! canvas ) throw new Error( 'p5 sketch produced no canvas.' );
			const texture = new THREE.CanvasTexture( canvas );
			texture.colorSpace = THREE.SRGBColorSpace;
			entry.texture = texture;
			attach( object, script, entry );
			if ( script.paused === true ) entry.api.instance.noLoop();

		} catch ( error ) {

			console.error( 'p5 preview failed:', error );
			live.delete( script );

		}

	}

	function attach( object, script, entry ) {

		const material = object.material;
		if ( ! material || entry.material === material ) return;
		detachMaterial( object, entry );
		entry.material = material;
		entry.prevMap = material.map || null;
		material.map = entry.texture;
		material.needsUpdate = true;
		entry.prevRender = object.onBeforeRender;
		const texture = entry.texture;
		object.onBeforeRender = function ( ...args ) {

			if ( entry.prevRender ) entry.prevRender.apply( this, args );
			if ( live.get( script ) === entry && texture ) texture.needsUpdate = true;

		};

	}

	function detachMaterial( object, entry ) {

		if ( entry.material ) {

			if ( entry.material.map === entry.texture ) {

				entry.material.map = entry.prevMap;
				entry.material.needsUpdate = true;

			}
			entry.material = null;
			entry.prevMap = null;

		}
		if ( object && object.onBeforeRender && object.onBeforeRender !== entry.prevRender ) {

			// Only restore when our wrapper is still the current hook.
			if ( entry.prevRender ) object.onBeforeRender = entry.prevRender;

		}
		entry.prevRender = null;

	}

	function disable( script ) {

		const entry = live.get( script );
		if ( ! entry ) return;
		live.delete( script );
		if ( entry.timer ) clearTimeout( entry.timer );
		if ( entry.object ) detachMaterial( entry.object, entry );
		if ( entry.texture ) entry.texture.dispose();
		try { entry.api?.remove(); } catch { /* already gone */ }

	}

	function restart( script ) {

		const entry = live.get( script );
		if ( ! entry ) return;
		if ( entry.timer ) clearTimeout( entry.timer );
		const object = entry.object;
		// Debounce so typing in the code editor doesn't thrash instances.
		entry.timer = setTimeout( () => {

			entry.timer = 0;
			disable( script );
			if ( object ) enable( object, script );

		}, 400 );

	}

	function sync() {

		syncQueued = false;
		const seen = new Set();
		const claimed = new Set(); // objects with an active preview (first wins)
		for ( const [ uuid, scripts ] of Object.entries( editor.scripts ) ) {

			const object = editor.scene.getObjectByProperty( 'uuid', uuid );
			if ( ! Array.isArray( scripts ) ) continue;
			for ( const script of scripts ) {

				if ( ! isP5( script ) ) continue;
				seen.add( script );
				const entry = live.get( script );
				if ( ! wantsPreview( object, script ) || ( ! entry && claimed.has( object ) ) ) {

					if ( entry ) disable( script );
					continue;

				}
				if ( ! entry ) {

					claimed.add( object );
					enable( object, script );

				} else {

					claimed.add( object );
					if ( entry.object !== object ) {

						disable( script );
						enable( object, script );

					} else {

						attach( object, script, entry );
						const paused = script.paused === true;
						try {

							if ( paused ) entry.api?.instance.noLoop();
							else entry.api?.instance.loop();

						} catch { /* instance not ready yet */ }

					}

				}

			}

		}
		for ( const script of [ ...live.keys() ] ) {

			if ( ! seen.has( script ) ) disable( script );

		}

	}

	function queueSync() {

		if ( syncQueued ) return;
		syncQueued = true;
		queueMicrotask( sync );

	}

	signals.scriptAdded.add( queueSync );
	signals.scriptRemoved.add( queueSync );
	signals.sceneGraphChanged.add( queueSync );
	signals.editorCleared.add( () => {

		for ( const script of [ ...live.keys() ] ) disable( script );

	} );
	signals.scriptChanged.add( ( script, attribute ) => {

		if ( ! isP5( script ) ) return;
		if ( attribute === 'source' ) {

			if ( live.has( script ) ) restart( script );
			else queueSync();
			return;

		}
		queueSync();

	} );

	return { sync: queueSync, disable };

}

export { P5Preview };
