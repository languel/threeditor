import { worldMeasurePoints } from './modeling/Measurements.js';
import * as THREE from 'three';
import { hasRestriction, isVisible } from './ObjectRestrictions.js';

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

const _box = new THREE.Box3();
const _vector = new THREE.Vector3();
const _deltaMatrix = new THREE.Matrix4();
const _objectMatrix = new THREE.Matrix4();
const _parentMatrixInverse = new THREE.Matrix4();

class Selector {

	constructor( editor ) {

		const signals = editor.signals;

		this.editor = editor;
		this.signals = signals;

		this.selection = [];

		// an intermediate group used as pivot when transforming multiple objects

		this.group = new THREE.Group();

		this._groupMatrixWorldInverse = new THREE.Matrix4();
		this._memberStates = [];

		// signals

		signals.intersectionsDetected.add( ( intersects, shiftKey ) => {

			if ( intersects.length > 0 ) {

				// Resolve helpers to their actual objects

				const objects = [];

				for ( let i = 0; i < intersects.length; i ++ ) {

					let object = intersects[ i ].object;

					if ( object.userData.object !== undefined ) {

						object = object.userData.object;

					}

					if ( objects.indexOf( object ) === - 1 ) {

						objects.push( object );

					}

				}

				if ( shiftKey === true && this.selection.length > 0 && objects[ 0 ] !== editor.camera &&
					objects[ 0 ] !== editor.scene && editor.selected !== editor.scene && editor.selected !== editor.camera ) {

					this.toggle( objects[ 0 ], editor.keymap.preset === 'blender' );

				} else {

					// Cycle through objects if the first one is already selected

					const index = objects.indexOf( editor.selected );

					if ( index !== - 1 && index < objects.length - 1 ) {

						this.select( objects[ index + 1 ] );

					} else {

						this.select( objects[ 0 ] );

					}

				}

			} else {

				if ( shiftKey !== true ) this.select( null ); // keep the selection when shift-clicking empty space

			}

		} );

		signals.objectChanged.add( ( object ) => {

			if ( ! this.usesGroupPivot() ) return;

			if ( object === this.group ) {

				// the group has been transformed (e.g. via TransformControls), sync its members

				this.applyGroupTransform();

			} else if ( this.selection.indexOf( object ) !== - 1 ) {

				// a member has been changed independently (e.g. via undo/redo), re-anchor the pivot

				this.updateGroup();

			}

		} );
		signals.objectRemoved.add( object => {

			if ( ! this.selection.length ) return;
			const remaining = this.selection.filter( selected => ! object.getObjectById( selected.id ) );
			if ( remaining.length !== this.selection.length ) this.setSelection( remaining );

		} );

		signals.transformSettingsChanged.add( key => {

			if ( key !== 'transformPivot' ) return;
			this.syncPivot();
			signals.objectSelected.dispatch( editor.selected );

		} );
		signals.cursorChanged.add( () => {

			if ( editor.config.getKey( 'settings/transformPivot' ) === 'cursor' ) this.syncPivot();

		} );

	}

	getIntersects( raycaster ) {

		const objects = [];

		this.editor.scene.traverseVisible( function ( child ) {

			if ( isVisible( child ) ) objects.push( child );

		} );

		this.editor.sceneHelpers.traverseVisible( function ( child ) {

			if ( child.name === 'picker' || child.userData.object !== undefined ) objects.push( child );

		} );

		return raycaster.intersectObjects( objects, false ).filter( hit => {

			const object = hit.object.userData.object || hit.object;
			return isVisible( object ) && ! hasRestriction( object, 'unselectable' );

		} );

	}

	getPointerIntersects( point, camera ) {

		mouse.set( ( point.x * 2 ) - 1, - ( point.y * 2 ) + 1 );

		raycaster.setFromCamera( mouse, camera );

		const hits = this.getIntersects( raycaster );
		const frame = this.editor.viewLayout?.frames.find( frame => frame.camera === camera );
		const rect = frame?.rect || this.editor.renderer.domElement.getBoundingClientRect();
		const cursor = new THREE.Vector2( point.x * rect.width, point.y * rect.height );
		this.editor.scene.traverseVisible( object => {

			const data = object.userData.measurement;
			if ( ! data || ! isVisible( object ) || hasRestriction( object, 'unselectable' ) ) return;
			const world = worldMeasurePoints( THREE, this.editor.scene, object, data.points );
			const points = world.map( p => p.clone().project( camera ) );
			const count = data.closed ? points.length : points.length - 1;
			for ( let i = 0; i < count; i ++ ) {

				const a = points[ i ], b = points[ ( i + 1 ) % points.length ];
				if ( a.z < - 1 || a.z > 1 || b.z < - 1 || b.z > 1 ) continue;
				const start = new THREE.Vector2( ( a.x + 1 ) * rect.width / 2, ( 1 - a.y ) * rect.height / 2 );
				const end = new THREE.Vector2( ( b.x + 1 ) * rect.width / 2, ( 1 - b.y ) * rect.height / 2 );
				const delta = end.clone().sub( start );
				const t = delta.lengthSq() ? THREE.MathUtils.clamp( cursor.clone().sub( start ).dot( delta ) / delta.lengthSq(), 0, 1 ) : 0;
				if ( cursor.distanceTo( start.addScaledVector( delta, t ) ) <= 8 ) {

					hits.unshift( { object, point: world[ i ].clone().lerp( world[ ( i + 1 ) % world.length ], t ), distance: 0 } );
					break;

				}

			}

		} );
		return hits;

	}

	getSelectionBox( target ) {

		target.makeEmpty();

		for ( let i = 0; i < this.selection.length; i ++ ) {

			const object = this.selection[ i ];

			const bounds = new THREE.Box3().setFromObject( object, true );
			if ( bounds.isEmpty() ) target.expandByPoint( object.getWorldPosition( _vector ) );
			else target.union( bounds );

		}

		return target;

	}

	select( object ) {

		this.setSelection( object === null ? [] : [ object ] );

	}

	toggle( object, promote = false ) {

		const selection = this.selection.slice();

		const index = selection.indexOf( object );

		if ( index === - 1 ) {

			selection.push( object );

		} else {

			selection.splice( index, 1 );
			if ( promote && object !== this.editor.selected ) selection.push( object );

		}

		this.setSelection( selection );

	}

	setSelection( objects ) {

		const editor = this.editor;

		const selection = [ ...new Set( objects.filter( Boolean ) ) ];
		const changed = selection.length !== this.selection.length || selection.some( ( object, index ) => object !== this.selection[ index ] );
		this.selection = selection;
		editor.selected = selection.at( -1 ) || null;
		this.syncPivot();
		if ( ! changed ) return;
		editor.config.setKey( 'selected', editor.selected?.uuid || null );
		this.signals.objectSelected.dispatch( editor.selected );

	}

	usesGroupPivot() {

		if ( ! this.selection.length ) return false;
		if ( this.selection.length > 1 ) return true;
		const pivot = this.editor.config.getKey( 'settings/transformPivot' );
		return pivot === 'bounds' || pivot === 'bottom' || pivot === 'origin' || pivot === 'cursor';

	}

	syncPivot() {

		if ( this.usesGroupPivot() ) {

			if ( ! this.group.parent ) this.editor.sceneHelpers.add( this.group );
			this.updateGroup();

		} else {

			this.group.removeFromParent();

		}

	}

	updateGroup() {

		const group = this.group;

		const pivot = this.editor.config.getKey( 'settings/transformPivot' );
		if ( pivot === 'cursor' ) group.position.copy( this.editor.cursor );
		else if ( pivot === 'origin' ) group.position.set( 0, 0, 0 );
		else if ( pivot === 'active' ) this.selection.at( -1 ).getWorldPosition( group.position );
		else if ( pivot === 'median' ) {

			group.position.set( 0, 0, 0 );
			for ( const object of this.selection ) group.position.add( object.getWorldPosition( _vector ) );
			group.position.divideScalar( this.selection.length );

		} else {

			this.getSelectionBox( _box ).getCenter( group.position );
			if ( pivot === 'bottom' && ! _box.isEmpty() ) group.position.y = _box.min.y;

		}
		group.quaternion.identity();
		group.scale.set( 1, 1, 1 );
		group.updateWorldMatrix();

		this._groupMatrixWorldInverse.copy( group.matrixWorld ).invert();

		// members with a selected ancestor are updated by that ancestor's transform

		const members = this.selection.filter( ( object ) => hasSelectedAncestor( object, this.selection ) === false );

		this._memberStates = members.map( ( object ) => ( { object: object, matrixWorld: object.matrixWorld.clone() } ) );

	}

	applyGroupTransform() {

		const group = this.group;

		group.updateWorldMatrix();

		_deltaMatrix.multiplyMatrices( group.matrixWorld, this._groupMatrixWorldInverse );

		const states = this._memberStates;

		for ( let i = 0; i < states.length; i ++ ) {

			const object = states[ i ].object;
			const parent = object.parent;

			_objectMatrix.multiplyMatrices( _deltaMatrix, states[ i ].matrixWorld );
			_parentMatrixInverse.copy( parent.matrixWorld ).invert();
			_objectMatrix.premultiply( _parentMatrixInverse );
			_objectMatrix.decompose( object.position, object.quaternion, object.scale );

			object.updateWorldMatrix( false, true );

			const helper = this.editor.helpers[ object.id ];

			if ( helper !== undefined && helper.isSkeletonHelper !== true ) helper.update();

		}

	}

	deselect() {

		this.select( null );

	}

}

function hasSelectedAncestor( object, selection ) {

	let parent = object.parent;

	while ( parent !== null ) {

		if ( selection.indexOf( parent ) !== - 1 ) return true;

		parent = parent.parent;

	}

	return false;

}

export { Selector };
