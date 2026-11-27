import { isVisible } from '../ObjectRestrictions.js';

const zero = Object.freeze( [ 0, 0, 0 ] );
const miss = Object.freeze( { hit: false, object: '', point: zero, normal: zero, distance: 0 } );
const emptyButton = Object.freeze( { strength: 0, pressed: false } );

function pickable( object ) {

	if ( ! object.isMesh || ! isVisible( object ) ) return false;
	for ( let parent = object; parent; parent = parent.parent ) if ( parent.userData?.annotation === true ) return false;
	return true;

}

export function readGamepads() {

	try {

		return globalThis.navigator?.getGamepads?.();

	} catch {

		// A browser or iframe permissions policy can withhold the API.
		return undefined;

	}

}

export class LogicInput {

	constructor( THREE, scene ) {

		this.scene = scene;
		this.raycaster = new THREE.Raycaster();
		this.ndc = new THREE.Vector2();
		this.direction = new THREE.Vector3();
		this.normal = new THREE.Vector3();
		this.world = new THREE.Matrix4();
		this.instanceMatrix = new THREE.Matrix4();
		this.normalMatrix = new THREE.Matrix3();
		this.intersections = [];
		this.pads = new Map();
		this.previousPads = new Map();
		this.rumbling = new Map();

	}

	update( { pointer, camera, gamepads } = {} ) {

		this.pointer = pointer;
		this.camera = camera;
		this.hover = undefined;
		this.previousPads = this.pads;
		this.pads = new Map();
		for ( const pad of gamepads || [] ) {

			if ( ! pad?.connected ) continue;
			this.pads.set( pad.index, {
				id: pad.id, axes: Array.from( pad.axes || [] ),
				buttons: Array.from( pad.buttons || [], button => ( { pressed: !! button.pressed, strength: button.value } ) ),
				actuator: pad.vibrationActuator
			} );

		}
		for ( const [ index, effect ] of this.rumbling ) if ( this.pads.get( index )?.id !== effect.id ) this.stopRumble( index, effect.actuator );

	}

	reset() {

		for ( const [ index, { actuator } ] of this.rumbling ) this.stopRumble( index, actuator );
		this.update();
		this.previousPads.clear();

	}

	pad( index ) {

		return this.pads.get( Math.round( index ) );

	}

	button( index, button, mode ) {

		const pad = this.pad( index );
		const previous = this.previousPads.get( Math.round( index ) );
		button = Math.round( button );
		const current = pad?.buttons[ button ] || emptyButton;
		if ( ! mode ) return current;
		const before = previous?.buttons[ button ]?.pressed;
		const samePad = previous?.id === pad?.id;
		if ( mode === 'Held' ) return current.pressed;
		if ( mode === 'Release' ) return before && ( ! samePad || ! current.pressed );
		return current.pressed && ( ! samePad || ! before );

	}

	connection( index ) {

		const pad = this.pad( index );
		const previous = this.previousPads.get( Math.round( index ) );
		if ( !! pad === !! previous && pad?.id === previous?.id ) return;
		return pad ? 'connected' : 'disconnected';

	}

	axis( index, axis ) {

		const value = this.pad( index )?.axes[ Math.round( axis ) ];
		return Number.isFinite( value ) ? value : 0;

	}

	stick( { gamepad, stick, deadZone, gain, invertX, invertY } ) {

		const axis = stick === 'Right' ? 2 : 0;
		const x = this.axis( gamepad, axis );
		const y = this.axis( gamepad, axis + 1 );
		const length = Math.hypot( x, y );
		const strength = Math.max( 0, Math.min( 1, ( length - deadZone ) / ( 1 - deadZone ) ) );
		const scale = length ? strength * gain / length : 0;
		const vector = [ x * scale * ( invertX ? - 1 : 1 ), y * scale * ( invertY ? - 1 : 1 ), 0 ];
		return { x: vector[ 0 ], y: vector[ 1 ], vector, strength };

	}

	vibrate( { gamepad, seconds, strong, weak } ) {

		const pad = this.pad( gamepad );
		const actuator = pad?.actuator;
		if ( ! actuator?.playEffect ) return;
		const index = Math.round( gamepad );
		this.rumbling.set( index, { id: pad.id, actuator } );
		Promise.resolve( actuator.playEffect( 'dual-rumble', {
			duration: seconds * 1000, strongMagnitude: strong, weakMagnitude: weak
		} ) ).catch( () => {} );

	}

	stopRumble( index, actuator ) {

		this.rumbling.delete( index );
		try { Promise.resolve( actuator.reset?.() ).catch( () => {} ); } catch { /* The device may have disconnected. */ }

	}

	hoverHit() {

		this.hover ??= this.pointerHit( this.pointer );
		return this.hover;

	}

	pointerHit( pointer, camera = this.camera ) {

		if ( ! pointer || ! ( camera?.isPerspectiveCamera || camera?.isOrthographicCamera ) ) return miss;
		camera.updateWorldMatrix( true, false );
		const raycaster = this.raycaster;
		raycaster.setFromCamera( this.ndc.set( pointer.x * 2 - 1, 1 - pointer.y * 2 ), camera );
		const forward = camera.getWorldDirection( this.direction );
		const relativeDepth = raycaster.ray.direction.dot( forward );
		raycaster.near = camera.near / relativeDepth;
		raycaster.far = camera.far / relativeDepth;
		raycaster.layers.mask = camera.layers.mask;
		return this.closest( this.scene );

	}

	raycast( { origin, direction, distance }, target, ignore ) {

		const raycaster = this.raycaster;
		this.direction.fromArray( direction ).normalize();
		if ( ! this.direction.lengthSq() || ! target ) return miss;
		raycaster.ray.origin.fromArray( origin );
		raycaster.ray.direction.copy( this.direction );
		raycaster.near = 0;
		raycaster.far = distance;
		raycaster.layers.enableAll();
		return this.closest( target, ignore );

	}

	closest( root, ignore ) {

		const intersections = this.intersections;
		root.updateWorldMatrix( true, true );
		try {

			root.traverseVisible( object => {

				if ( ! pickable( object ) || ! this.raycaster.layers.test( object.layers ) ) return;
				for ( let parent = object; parent; parent = parent.parent ) if ( parent === ignore ) return;
				object.raycast( this.raycaster, intersections );

			} );
			let closest;
			for ( const hit of intersections ) {

				if ( closest && hit.distance >= closest.distance ) continue;
				const { material } = hit.object;
				const materialSlot = Array.isArray( material ) ? material[ hit.face?.materialIndex ] : material;
				if ( materialSlot?.visible === false ) continue;
				closest = hit;

			}
			if ( ! closest ) return miss;
			const { object, point, face, distance, instanceId, batchId } = closest;
			this.world.copy( object.matrixWorld );
			const index = instanceId ?? batchId;
			if ( index !== undefined && object.getMatrixAt ) {

				object.getMatrixAt( index, this.instanceMatrix );
				this.world.multiply( this.instanceMatrix );

			}
			const normal = face?.normal ? this.normal.copy( face.normal ).applyNormalMatrix( this.normalMatrix.getNormalMatrix( this.world ) ).toArray() : zero;
			const parents = [];
			for ( let current = object; current; current = current.parent ) parents.push( current.uuid );
			const target = object.userData.nodeComponentOutput ? object.parent || object : object;
			return { hit: true, object: target.uuid, point: point.toArray(), normal, distance, parents };

		} finally {

			intersections.length = 0;

		}

	}

}
