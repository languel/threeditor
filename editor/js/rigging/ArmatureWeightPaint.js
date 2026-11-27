import * as THREE from 'three';
import { modelButton, modelField } from '../modeling/ModelControls.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { armatureVertexWeights } from './ArmatureDeformation.js';
import { withArmaturePose } from './ArmaturePose.js';
import { commitArmatureWeights } from './ArmatureTools.js';
import { paintBoneWeight, weightNeighbors, weightPointKey } from './ArmatureWeights.js';

const cellSize = 48;

function segmentDistance( x, y, from, to ) {

	const dx = to.x - from.x, dy = to.y - from.y;
	const length = dx * dx + dy * dy;
	const t = length ? THREE.MathUtils.clamp( ( ( x - from.x ) * dx + ( y - from.y ) * dy ) / length, 0, 1 ) : 0;
	return Math.hypot( x - from.x - t * dx, y - from.y - t * dy );

}

export class ArmatureWeightPaint {

	constructor( view ) {

		this.view = view;
		this.editor = view.editor;
		this.radius = 42;
		this.strength = .8;
		this.weight = 1;
		this.through = false;
		this.blend = 'draw';
		this.cursor = document.createElement( 'div' );
		this.cursor.className = 'weight-paint-cursor';
		this.cursor.hidden = true;
		this.cursor.setAttribute( 'aria-hidden', 'true' );
		this.view.viewport.appendChild( this.cursor );
		this.view.viewport.addEventListener( 'pointerleave', () => { this.cursor.hidden = true; } );

	}

	start( object ) {

		if ( ! object || hasRestriction( object, 'locked' ) || hasRestriction( object, 'disabled' ) ) return false;
		const data = armatureVertexWeights( THREE, this.editor.scene, object );
		if ( ! data ) return false;
		this.object = object;
		this.bone = data.boneIds.includes( this.bone ) ? this.bone : data.boneIds[ 0 ];
		return true;

	}

	stop() {

		this.endStroke( false );
		this.object = null;
		this.cursor.hidden = true;
		this.preview?.dispose();
		this.material?.dispose();
		this.preview = this.material = this.source = null;

	}

	buildControls( parent ) {

		const data = armatureVertexWeights( THREE, this.editor.scene, this.object );
		if ( ! data ) return;
		const select = document.createElement( 'select' );
		select.className = 'Select';
		select.setAttribute( 'aria-label', 'Weight Bone' );
		select.replaceChildren( ...data.bones.map( bone => new Option( bone.name, bone.uuid ) ) );
		select.value = this.bone;
		select.onchange = () => { this.endStroke( false ); this.bone = select.value; this.colorKey = null; this.view.render(); };
		parent.appendChild( select );
		if ( ! this.object.isPoints ) {

			const blend = document.createElement( 'select' );
			blend.className = 'Select';
			blend.setAttribute( 'aria-label', 'Weight Blend' );
			blend.replaceChildren( new Option( 'Draw', 'draw' ), new Option( 'Smooth', 'smooth' ) );
			blend.value = this.blend;
			blend.onchange = () => { this.blend = blend.value; };
			parent.appendChild( blend );

		}
		for ( const [ property, label, icon, minimum, maximum, step ] of [
			[ 'radius', 'Weight Brush Radius', 'toolBrush', 4, 180, 1 ],
			[ 'strength', 'Weight Brush Strength', 'opacity', 0, 1, .05 ],
			[ 'weight', 'Brush Weight', 'scale', 0, 1, .05 ]
		] ) {

			const field = modelField( parent, label, icon, 'number', this[ property ] );
			Object.assign( field, { min: minimum, max: maximum, step } );
			field.onchange = () => {

				if ( Number.isFinite( field.valueAsNumber ) ) this[ property ] = THREE.MathUtils.clamp( field.valueAsNumber, minimum, maximum );
				field.value = this[ property ];

			};

		}
		modelField( parent, 'Paint Through', 'xray', 'checkbox', this.through ).onchange = event => { this.through = event.target.checked; };
		modelButton( parent, 'Done Weight Painting', 'exitTool', () => this.view.setMode( '' ) );

	}

	projectedVertices( frame, data ) {

		const { object } = this;
		const camera = frame.camera;
		camera.updateWorldMatrix( true, false );
		object.updateWorldMatrix( true, false );
		const rect = this.view.layout.clientRect( frame );
		const cameraPosition = camera.getWorldPosition( new THREE.Vector3() );
		const forward = camera.getWorldDirection( new THREE.Vector3() ).negate();
		const normals = object.geometry.attributes.normal;
		const normalMatrix = new THREE.Matrix3().getNormalMatrix( object.matrixWorld );
		const world = new THREE.Vector3(), ndc = new THREE.Vector3(), normal = new THREE.Vector3(), direction = new THREE.Vector3();
		const cells = new Map();
		for ( let index = 0; index < data.position.count; index ++ ) {

			world.fromBufferAttribute( data.position, index ).applyMatrix4( object.matrixWorld );
			if ( ! this.through && normals && object.isMesh && ! object.userData.pencilStroke ) {

				normal.fromBufferAttribute( normals, index ).applyNormalMatrix( normalMatrix );
				const toward = camera.isOrthographicCamera ? forward : direction.subVectors( cameraPosition, world ).normalize();
				if ( normal.dot( toward ) < - .01 ) continue;

			}
			ndc.copy( world ).project( camera );
			if ( ndc.z < - 1 || ndc.z > 1 || Math.abs( ndc.x ) > 1.1 || Math.abs( ndc.y ) > 1.1 ) continue;
			const x = rect.left + ( ndc.x + 1 ) * rect.width / 2;
			const y = rect.top + ( 1 - ndc.y ) * rect.height / 2;
			const cell = Math.floor( x / cellSize ) + ',' + Math.floor( y / cellSize );
			if ( ! cells.has( cell ) ) cells.set( cell, [] );
			cells.get( cell ).push( { x, y, index, key: weightPointKey( data.position, index ) } );

		}
		return cells;

	}

	pointerDown( event ) {

		if ( this.stroke || event.button !== 0 || event.altKey || event.target !== this.editor.renderer?.domElement ) return;
		const frame = this.view.layout.at( event.clientX, event.clientY );
		if ( ! frame?.director || ! this.object || hasRestriction( this.object, 'locked' ) || hasRestriction( this.object, 'disabled' ) ) return;
		const data = armatureVertexWeights( THREE, this.editor.scene, this.object );
		if ( ! data?.boneIds.includes( this.bone ) ) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		document.activeElement.blur?.();
		this.stroke = {
			pointer: event.pointerId, canvas: event.target, frame: frame.key, data,
			cells: withArmaturePose( THREE, this.editor.scene, () => this.projectedVertices( frame, data ) ),
			object: this.object, geometry: this.object.geometry, binding: this.object.userData.armatureBinding,
			draft: {}, coverage: new Map(), erase: event.shiftKey,
			neighbors: this.blend === 'smooth' && ! event.shiftKey && ! this.object.isPoints ? weightNeighbors( this.object, data.position ) : null
		};
		event.target.setPointerCapture( event.pointerId );
		this.pointerMove( event );

	}

	pointerMove( event ) {

		const { clientX: x, clientY: y } = event;
		const frame = this.view.layout.at( x, y );
		const stroke = this.stroke;
		const over = !! frame?.director && event.target === this.editor.renderer?.domElement;
		this.cursor.hidden = ! over;
		if ( over ) {

			Object.assign( this.cursor.style, { left: x + 'px', top: y + 'px', width: 2 * this.radius + 'px', height: 2 * this.radius + 'px' } );

		}
		if ( ! stroke || stroke.pointer !== event.pointerId ) return;
		event.stopImmediatePropagation();
		if ( frame?.key !== stroke.frame ) { stroke.point = null; return; }

		const end = { x, y }, start = stroke.point || end;
		const { radius, strength, bone } = this;
		let changed = false;
		for ( let column = Math.floor( ( Math.min( start.x, x ) - radius ) / cellSize ); column <= Math.floor( ( Math.max( start.x, x ) + radius ) / cellSize ); column ++ ) {

			for ( let row = Math.floor( ( Math.min( start.y, y ) - radius ) / cellSize ); row <= Math.floor( ( Math.max( start.y, y ) + radius ) / cellSize ); row ++ ) {

				for ( const point of stroke.cells.get( column + ',' + row ) || [] ) {

					const coverage = Math.max( 0, 1 - segmentDistance( point.x, point.y, start, end ) / radius ) * strength;
					if ( coverage <= ( stroke.coverage.get( point.key ) || 0 ) ) continue;
					stroke.coverage.set( point.key, coverage );
					const current = stroke.data.at( point.index );
					let target = stroke.erase ? 0 : this.weight;
					if ( stroke.neighbors ) {

						const neighbors = stroke.neighbors.get( point.key );
						if ( ! neighbors?.size ) continue;
						let sum = 0;
						for ( const index of neighbors.values() ) sum += stroke.data.at( index )[ bone ] || 0;
						target = sum / neighbors.size;

					}
					const weight = THREE.MathUtils.lerp( current[ bone ] || 0, target, coverage );
					stroke.draft[ point.key ] = paintBoneWeight( current, bone, weight, stroke.data.boneIds, stroke.data.count );
					changed = true;

				}

			}

		}
		stroke.point = end;
		if ( changed ) { this.colorKey = null; this.view.render(); }

	}

	pointerEnd( event ) {

		if ( this.stroke?.pointer !== event.pointerId ) return;
		event.stopImmediatePropagation();
		if ( event.type === 'pointerup' ) this.pointerMove( event );
		this.endStroke( event.type === 'pointerup' );

	}

	endStroke( commit ) {

		const stroke = this.stroke;
		if ( ! stroke ) return;
		this.stroke = null;
		if ( stroke.canvas.hasPointerCapture( stroke.pointer ) ) stroke.canvas.releasePointerCapture( stroke.pointer );
		if ( commit && Object.keys( stroke.draft ).length && stroke.geometry === stroke.object.geometry ) {

			this.view.run( () => commitArmatureWeights( this.editor, stroke.object, stroke.draft, stroke.binding ) );

		}
		this.colorKey = null;
		this.view.render();

	}

	withPreview( draw ) {

		const object = this.object;
		if ( ! object ) return draw();
		const original = object.geometry, material = object.material;
		const data = armatureVertexWeights( THREE, this.editor.scene, object );
		if ( ! data ) return draw();
		if ( this.source !== original ) {

			this.preview?.dispose();
			this.material?.dispose();
			this.source = original;
			this.preview = original.clone();
			this.preview.setAttribute( 'color', new THREE.BufferAttribute( new Float32Array( data.position.count * 3 ), 3 ) );
			const params = { vertexColors: true, toneMapped: false };
			this.material = object.isMesh ? new THREE.MeshBasicMaterial( { ...params, side: THREE.DoubleSide } ) :
				object.isPoints ? new THREE.PointsMaterial( { ...params, size: material?.size ?? .04, sizeAttenuation: material?.sizeAttenuation ?? true } ) :
					new THREE.LineBasicMaterial( params );
			this.colorKey = null;

		}
		const binding = object.userData.armatureBinding;
		if ( this.colorKey !== binding ) {

			const colors = this.preview.attributes.color;
			const color = new THREE.Color();
			for ( let vertex = 0; vertex < data.position.count; vertex ++ ) {

				const draft = this.stroke?.draft[ weightPointKey( data.position, vertex ) ];
				const value = ( draft || data.at( vertex ) )[ this.bone ] || 0;
				color.setHSL( ( 1 - value ) * .66, 1, .5, THREE.SRGBColorSpace );
				colors.setXYZ( vertex, color.r, color.g, color.b );

			}
			colors.needsUpdate = true;
			this.colorKey = binding;

		}
		try {

			object.geometry = this.preview;
			object.material = this.material;
			return draw();

		} finally {

			object.geometry = original;
			object.material = material;

		}

	}

}
