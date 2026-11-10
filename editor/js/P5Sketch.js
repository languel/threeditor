// Runs pasted p5.js sketches (global mode) inside a p5 instance so each
// sketch owns its canvas. The canvas feeds a THREE.CanvasTexture that can
// live on any mesh, e.g. a plane. Pausing the instance (noLoop) holds the
// last rendered frame, like a paused video stream.

const P5_CDN = 'https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/p5.min.js';

let p5Promise = null;

function loadP5() {

	if ( window.p5 ) return Promise.resolve( window.p5 );
	if ( p5Promise ) return p5Promise;
	p5Promise = new Promise( ( resolve, reject ) => {

		const tag = document.createElement( 'script' );
		tag.src = P5_CDN;
		tag.async = true;
		tag.onload = () => resolve( window.p5 );
		tag.onerror = () => {

			p5Promise = null;
			reject( new Error( 'Could not load p5.js from CDN.' ) );

		};
		document.head.appendChild( tag );

	} );
	return p5Promise;

}

// p5 lifecycle callbacks a student sketch may define.
const LIFECYCLE = [ 'preload', 'setup', 'draw', 'keyPressed', 'keyReleased', 'keyTyped',
	'mousePressed', 'mouseReleased', 'mouseClicked', 'mouseMoved', 'mouseDragged',
	'mouseWheel', 'touchStarted', 'touchMoved', 'touchEnded', 'windowResized' ];

// Wraps global-mode source so bare calls (createCanvas, background, ...) and
// globals (width, mouseX, ...) resolve against the instance, while the
// student's own declarations keep working. Assignments fall into the sandbox.
function wrapGlobalMode( source ) {

	const capture = LIFECYCLE.map( name => `${name}: (typeof ${name} !== 'undefined' ? ${name} : undefined)` ).join( ',' );
	return `with(scope){\n${source}\n;return {${capture}};}`;

}

function createSketchScope( sandbox, instance ) {

	return new Proxy( sandbox, {
		has: ( target, key ) => {

			if ( typeof key !== 'string' ) return false;
			// Only claim names the sketch or p5 actually provide so the
			// student's own function declarations stay visible outside.
			return key in target || key in instance || key in globalThis;

		},
		get: ( target, key ) => {

			if ( key in target ) return target[ key ];
			if ( key in instance ) {

				const value = instance[ key ];
				return typeof value === 'function' ? value.bind( instance ) : value;

			}
			return globalThis[ key ];

		},
		set: ( target, key, value ) => {

			target[ key ] = value;
			return true;

		}
	} );

}

async function createP5Sketch( source ) {

	const P5 = await loadP5();
	return new Promise( ( resolve, reject ) => {

		const host = document.createElement( 'div' );
		host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
		document.body.appendChild( host );
		let instance;
		const fail = ( error ) => {

			try { instance?.remove(); } catch { /* already gone */ }
			host.remove();
			reject( error );

		};

		try {

			instance = new P5( ( p ) => {

				const sandbox = {};
				const scope = createSketchScope( sandbox, p );
				let hooks = {};
				try {

					hooks = new Function( 'scope', wrapGlobalMode( source ) )( scope );

				} catch ( error ) {

					queueMicrotask( () => fail( error ) );
					return;

				}
				for ( const name of LIFECYCLE ) {

					if ( typeof hooks[ name ] === 'function' ) p[ name ] = hooks[ name ];

				}
				const userSetup = p.setup;
				p.setup = function ( ...args ) {

					userSetup?.apply( this, args );
					queueMicrotask( () => ready() );

				};

				let settled = false;
				function ready() {

					if ( settled ) return;
					settled = true;
					resolve( api );

				}
				// Sketches without setup still produce a default canvas.
				setTimeout( () => ready(), 500 );

				const api = {
					instance: p,
					get canvas() { return p.canvas?.elt || p.canvas || null; },
					remove() {

						try { instance.remove(); } catch { /* already gone */ }
						host.remove();

					}
				};

			}, host );

		} catch ( error ) {

			fail( error );

		}

	} );

}

const P5_TEMPLATE = `function setup() {
  createCanvas(512, 512);
}

function draw() {
  background(20);
  fill(255, 80, 120);
  circle(width / 2 + sin(frameCount * 0.05) * 150, height / 2, 120);
}
`;

export { loadP5, createP5Sketch, P5_TEMPLATE, P5_CDN };
