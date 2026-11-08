import * as THREE from 'three';

class EditorControls extends THREE.EventDispatcher {

	constructor( object ) {

		super();

		// API

		this.enabled = true;
		this.center = new THREE.Vector3();
		this.panSpeed = 0.002;
		this.zoomSpeed = 0.1;
		this.rotationSpeed = 0.005;
		this.navigationMode = () => 'basic';
		this.emulateThreeButton = () => false;
		this.canNavigate = () => true;

		// internals

		var scope = this;
		var vector = new THREE.Vector3();
		var delta = new THREE.Vector3();
		var box = new THREE.Box3();

		var STATE = { NONE: - 1, ROTATE: 0, ZOOM: 1, PAN: 2 };
		var state = STATE.NONE;

		var center = this.center;
		var position = new THREE.Vector3();
		var orientation = new THREE.Quaternion();
		var centers = new WeakMap( [ [ object, center ] ] );
		var pointer = new THREE.Vector2();
		var pointerOld = new THREE.Vector2();
		var spherical = new THREE.Spherical();
		var sphere = new THREE.Sphere();

		var pointers = [];
		var pointerPositions = {};

		var domElement = null;

		// events

		var changeEvent = { type: 'change' };

		this.setCamera = function ( camera ) {

			if ( object !== camera ) state = STATE.NONE;
			object = camera;
			center = this.center = this.getCenter( camera );

		};

		this.getCenter = function ( camera = object ) {

			if ( ! centers.has( camera ) ) {

				const pivot = camera.getWorldPosition( new THREE.Vector3() );
				pivot.addScaledVector( camera.getWorldDirection( new THREE.Vector3() ), 4 );
				centers.set( camera, pivot );

			}
			return centers.get( camera );

		};

		function setWorldPosition( point ) {

			object.position.copy( point );
			if ( object.parent ) object.parent.worldToLocal( object.position );
			object.updateWorldMatrix( true, false );

		}

		this.focus = function ( target ) {

			if ( ! scope.enabled || ! scope.canNavigate() || target === object ) return;
			var distance;

			box.setFromObject( target );

			if ( box.isEmpty() === false ) {

				box.getCenter( center );
				distance = box.getBoundingSphere( sphere ).radius;

			} else {

				// Focusing on an Group, AmbientLight, etc

				center.setFromMatrixPosition( target.matrixWorld );
				distance = 0.1;

			}

			delta.set( 0, 0, 1 );
			delta.applyQuaternion( object.getWorldQuaternion( orientation ) );
			delta.multiplyScalar( distance * 4 );

			setWorldPosition( vector.copy( center ).add( delta ) );

			if ( object.isOrthographicCamera ) {

				object.zoom = ( object.top - object.bottom ) / ( distance * 2 );
				object.updateProjectionMatrix();

			}

			scope.dispatchEvent( changeEvent );

		};

		this.pan = function ( delta ) {

			if ( ! scope.enabled || ! scope.canNavigate() ) return;
			object.getWorldPosition( position );
			var distance = object.isOrthographicCamera
				? ( object.top - object.bottom ) / object.zoom
				: position.distanceTo( center );

			delta.multiplyScalar( distance * scope.panSpeed );
			delta.applyQuaternion( object.getWorldQuaternion( orientation ) );

			setWorldPosition( position.add( delta ) );
			center.add( delta );

			scope.dispatchEvent( changeEvent );

		};

		this.zoom = function ( delta ) {

			if ( ! scope.enabled || ! scope.canNavigate() ) return;
			if ( object.isOrthographicCamera ) {

				object.zoom = Math.max( 0.0001, object.zoom * Math.pow( 0.95, delta.z ) );
				object.updateProjectionMatrix();

			} else {

				object.getWorldPosition( position );
				var distance = position.distanceTo( center );

				delta.multiplyScalar( distance * scope.zoomSpeed );

				if ( delta.length() > distance ) return;

				delta.applyQuaternion( object.getWorldQuaternion( orientation ) );

				setWorldPosition( position.add( delta ) );

			}

			scope.dispatchEvent( changeEvent );

		};

		this.rotate = function ( delta ) {

			if ( ! scope.enabled || ! scope.canNavigate() ) return;
			object.getWorldPosition( vector ).sub( center );

			spherical.setFromVector3( vector );

			spherical.theta += delta.x * scope.rotationSpeed;
			spherical.phi += delta.y * scope.rotationSpeed;

			spherical.makeSafe();

			vector.setFromSpherical( spherical );

			setWorldPosition( vector.add( center ) );

			object.lookAt( center );

			scope.dispatchEvent( changeEvent );

		};

		//

		function onPointerDown( event ) {

			if ( scope.enabled === false || ! scope.canNavigate() ) return;
			const emulatedMiddle = scope.navigationMode() === 'blender' && scope.emulateThreeButton() && event.button === 0 && event.altKey;
			if ( event.pointerType !== 'touch' && scope.navigationMode() === 'blender' && event.button !== 1 && ! emulatedMiddle ) return;
			if ( event.pointerType !== 'touch' && event.button === 1 ) event.preventDefault();

			if ( pointers.length === 0 ) {

				domElement.setPointerCapture( event.pointerId );

				domElement.ownerDocument.addEventListener( 'pointermove', onPointerMove );
				domElement.ownerDocument.addEventListener( 'pointerup', onPointerUp );

			}

			//

			if ( isTrackingPointer( event ) ) return;

			//

			addPointer( event );

			if ( event.pointerType === 'touch' ) {

				onTouchStart( event );

			} else {

				onMouseDown( event );

			}

		}

		function onPointerMove( event ) {

			if ( scope.enabled === false ) return;

			if ( event.pointerType === 'touch' ) {

				onTouchMove( event );

			} else {

				onMouseMove( event );

			}

		}

		function onPointerUp( event ) {

			removePointer( event );

			switch ( pointers.length ) {

				case 0:

					domElement.releasePointerCapture( event.pointerId );

					domElement.ownerDocument.removeEventListener( 'pointermove', onPointerMove );
					domElement.ownerDocument.removeEventListener( 'pointerup', onPointerUp );

					break;

				case 1:

					var pointerId = pointers[ 0 ];
					var position = pointerPositions[ pointerId ];

					// minimal placeholder event - allows state correction on pointer-up
					onTouchStart( { pointerId: pointerId, pageX: position.x, pageY: position.y } );

					break;

			}

		}

		// mouse

		function onMouseDown( event ) {

			if ( scope.navigationMode() === 'blender' && ( event.button === 1 || ( scope.emulateThreeButton() && event.button === 0 && event.altKey ) ) ) {

				state = event.shiftKey ? STATE.PAN : ( event.ctrlKey || event.metaKey ) ? STATE.ZOOM : STATE.ROTATE;

			} else if ( event.button === 0 ) {

				state = event.shiftKey ? STATE.PAN : STATE.ROTATE;

			} else if ( event.button === 1 ) {

				state = STATE.ZOOM;

			} else if ( event.button === 2 ) {

				state = STATE.PAN;

			}

			pointerOld.set( event.clientX, event.clientY );

		}

		function onMouseMove( event ) {

			pointer.set( event.clientX, event.clientY );

			var movementX = pointer.x - pointerOld.x;
			var movementY = pointer.y - pointerOld.y;

			if ( state === STATE.ROTATE ) {

				scope.rotate( delta.set( - movementX, - movementY, 0 ) );

			} else if ( state === STATE.ZOOM ) {

				scope.zoom( delta.set( 0, 0, movementY ) );

			} else if ( state === STATE.PAN ) {

				scope.pan( delta.set( - movementX, movementY, 0 ) );

			}

			pointerOld.set( event.clientX, event.clientY );

		}

		function onMouseUp() {

			state = STATE.NONE;

		}

		function onMouseWheel( event ) {

			if ( scope.enabled === false ) return;

			event.preventDefault();

			// Normalize deltaY due to https://bugzilla.mozilla.org/show_bug.cgi?id=1392460
			scope.zoom( delta.set( 0, 0, event.deltaY > 0 ? 1 : - 1 ) );

		}

		function contextmenu( event ) {

			event.preventDefault();

		}

		this.connect = function ( element ) {

			if ( domElement !== null ) this.disconnect();

			domElement = element;

			domElement.addEventListener( 'contextmenu', contextmenu );
			domElement.addEventListener( 'dblclick', onMouseUp );
			domElement.addEventListener( 'wheel', onMouseWheel, { passive: false } );

			domElement.addEventListener( 'pointerdown', onPointerDown );

		};

		this.disconnect = function () {

			domElement.removeEventListener( 'contextmenu', contextmenu );
			domElement.removeEventListener( 'dblclick', onMouseUp );
			domElement.removeEventListener( 'wheel', onMouseWheel );

			domElement.removeEventListener( 'pointerdown', onPointerDown );

			domElement = null;

		};

		// touch

		var touches = [ new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3() ];
		var prevTouches = [ new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3() ];

		var prevDistance = null;

		function onTouchStart( event ) {

			trackPointer( event );

			switch ( pointers.length ) {

				case 1:
					touches[ 0 ].set( event.pageX, event.pageY, 0 ).divideScalar( window.devicePixelRatio );
					touches[ 1 ].set( event.pageX, event.pageY, 0 ).divideScalar( window.devicePixelRatio );
					break;

				case 2:

					var position = getSecondPointerPosition( event );

					touches[ 0 ].set( event.pageX, event.pageY, 0 ).divideScalar( window.devicePixelRatio );
					touches[ 1 ].set( position.x, position.y, 0 ).divideScalar( window.devicePixelRatio );
					prevDistance = touches[ 0 ].distanceTo( touches[ 1 ] );
					break;

			}

			prevTouches[ 0 ].copy( touches[ 0 ] );
			prevTouches[ 1 ].copy( touches[ 1 ] );

		}


		function onTouchMove( event ) {

			trackPointer( event );

			function getClosest( touch, touches ) {

				var closest = touches[ 0 ];

				for ( var touch2 of touches ) {

					if ( closest.distanceTo( touch ) > touch2.distanceTo( touch ) ) closest = touch2;

				}

				return closest;

			}

			switch ( pointers.length ) {

				case 1:
					touches[ 0 ].set( event.pageX, event.pageY, 0 ).divideScalar( window.devicePixelRatio );
					touches[ 1 ].set( event.pageX, event.pageY, 0 ).divideScalar( window.devicePixelRatio );
					scope.rotate( touches[ 0 ].sub( getClosest( touches[ 0 ], prevTouches ) ).multiplyScalar( - 1 ) );
					break;

				case 2:

					var position = getSecondPointerPosition( event );

					touches[ 0 ].set( event.pageX, event.pageY, 0 ).divideScalar( window.devicePixelRatio );
					touches[ 1 ].set( position.x, position.y, 0 ).divideScalar( window.devicePixelRatio );
					// Divide by 10 to offset inherent over-sensitivity (https://github.com/mrdoob/three.js/issues/32442)
					var distance = touches[ 0 ].distanceTo( touches[ 1 ] ) / 10;
					scope.zoom( delta.set( 0, 0, prevDistance - distance ) );
					prevDistance = distance;


					var offset0 = touches[ 0 ].clone().sub( getClosest( touches[ 0 ], prevTouches ) );
					var offset1 = touches[ 1 ].clone().sub( getClosest( touches[ 1 ], prevTouches ) );
					offset0.x = - offset0.x;
					offset1.x = - offset1.x;

					scope.pan( offset0.add( offset1 ) );

					break;

			}

			prevTouches[ 0 ].copy( touches[ 0 ] );
			prevTouches[ 1 ].copy( touches[ 1 ] );

		}

		function addPointer( event ) {

			pointers.push( event.pointerId );

		}

		function removePointer( event ) {

			delete pointerPositions[ event.pointerId ];

			for ( var i = 0; i < pointers.length; i ++ ) {

				if ( pointers[ i ] == event.pointerId ) {

					pointers.splice( i, 1 );
					return;

				}

			}

		}

		function isTrackingPointer( event ) {

			for ( var i = 0; i < pointers.length; i ++ ) {

				if ( pointers[ i ] == event.pointerId ) return true;

			}

			return false;

		}

		function trackPointer( event ) {

			var position = pointerPositions[ event.pointerId ];

			if ( position === undefined ) {

				position = new THREE.Vector2();
				pointerPositions[ event.pointerId ] = position;

			}

			position.set( event.pageX, event.pageY );

		}

		function getSecondPointerPosition( event ) {

			var pointerId = ( event.pointerId === pointers[ 0 ] ) ? pointers[ 1 ] : pointers[ 0 ];

			return pointerPositions[ pointerId ];

		}

	}

	fromJSON( json, camera ) {

		if ( json.center !== undefined ) this.getCenter( camera ).fromArray( json.center );

	}

	toJSON( camera ) {

		return {
			center: this.getCenter( camera ).toArray()
		};

	}

}

export { EditorControls };
