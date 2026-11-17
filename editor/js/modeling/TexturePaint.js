import * as THREE from 'three';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';
import { SetMaterialCommand } from '../commands/SetMaterialCommand.js';

// Each touched material slot owns a private working image until the gesture commits.
export class TexturePaintStroke {

	constructor( editor ) {

		this.editor = editor;
		this.targets = new Map();

	}

	paint( hit, color, opacity, radius, frame, offsetX, offsetY ) {

		const receiver = hit.object;
		const slot = Array.isArray( receiver.material ) ? hit.face?.materialIndex ?? 0 : 0;
		const source = this.editor.getObjectMaterial( receiver, slot );
		const uv = source?.map?.channel === 1 ? hit.uv1 : hit.uv;
		if ( ! hit.face || ! uv || ! source?.color || ! ( 'map' in source ) || ( source.map?.channel ?? 0 ) > 1 ) return 'Choose a mesh with UV coordinates and a base-color material.';

		const key = receiver.uuid + '/' + slot;
		let target = this.targets.get( key );
		if ( ! target ) {

			const original = source.map;
			const image = original?.image;
			if ( original && ( original.mapping !== THREE.UVMapping || original.isVideoTexture || ! ( image instanceof HTMLCanvasElement || image instanceof HTMLImageElement || image instanceof ImageBitmap ) ) ) return 'This base-color map needs an editable image.';
			const canvas = document.createElement( 'canvas' );
			canvas.width = image?.width || 1024;
			canvas.height = image?.height || 1024;
			const ctx = canvas.getContext( '2d' );
			if ( image ) {

				try {

					ctx.drawImage( image, 0, 0 );
					ctx.getImageData( 0, 0, 1, 1 );

				} catch { return 'The base-color image is unavailable for painting.'; }

			} else {

				ctx.fillStyle = '#' + source.color.getHexString();
				ctx.fillRect( 0, 0, canvas.width, canvas.height );

			}
			const texture = new THREE.CanvasTexture( canvas );
			if ( original ) {

				const pixels = texture.source;
				texture.copy( original );
				texture.source = pixels;
				texture.userData = {};

			} else texture.colorSpace = THREE.SRGBColorSpace;
			texture.userData.surfacePaint = true;
			texture.name = ( receiver.name || 'Mesh' ) + ' paint';
			const material = source.clone();
			if ( ! image ) material.color.set( 0xffffff );
			material.map = texture;
			target = { receiver, slot, source, material, texture, ctx };
			this.targets.set( key, target );
			this.assign( target, material );

		}

		const { texture, ctx } = target;
		if ( texture.matrixAutoUpdate ) texture.updateMatrix();
		const coord = uv.clone().applyMatrix3( texture.matrix );
		const geometry = receiver.geometry;
		const coords = geometry.getAttribute( texture.channel === 1 ? 'uv1' : 'uv' );
		const { a, b, c } = hit.face;
		const world = receiver.matrixWorld.clone();
		if ( receiver.isInstancedMesh ) {

			const instance = new THREE.Matrix4();
			receiver.getMatrixAt( hit.instanceId, instance );
			world.multiply( instance );

		}
		const screen = [ a, b, c ].map( index => {

			const point = receiver.getVertexPosition( index, new THREE.Vector3() ).applyMatrix4( world ).project( frame.camera );
			return new THREE.Vector2( point.x * frame.rect.width / 2, - point.y * frame.rect.height / 2 );

		} );
		const texels = [ a, b, c ].map( index => {

			const point = new THREE.Vector2().fromBufferAttribute( coords, index ).applyMatrix3( texture.matrix );
			return point.multiply( new THREE.Vector2( ctx.canvas.width, ctx.canvas.height ) );

		} );
		const dx = screen[ 1 ].sub( screen[ 0 ] ), dy = screen[ 2 ].sub( screen[ 0 ] );
		const du = texels[ 1 ].clone().sub( texels[ 0 ] ), dv = texels[ 2 ].clone().sub( texels[ 0 ] );
		const det = dx.cross( dy );
		if ( Math.abs( det ) < 1e-8 ) return '';
		const xx = ( du.x * dy.y - dv.x * dx.y ) / det, xy = ( du.y * dy.y - dv.y * dx.y ) / det;
		const yx = ( dv.x * dx.x - du.x * dy.x ) / det, yy = ( dv.y * dx.x - du.y * dy.x ) / det;
		const width = ctx.canvas.width, height = ctx.canvas.height;
		const cx = coord.x * width - offsetX * xx - offsetY * yx;
		const cy = coord.y * height - offsetX * xy - offsetY * yy;
		const tiles = ( center, extent, size, wrap, axis ) => {

			if ( wrap === THREE.ClampToEdgeWrapping ) return [ 0, 0 ];
			const values = texels.map( point => point[ axis ] );
			const min = Math.max( center - extent, Math.min( ...values ) );
			const max = Math.min( center + extent, Math.max( ...values ) );
			return [ Math.floor( min / size ), Math.floor( max / size ) ];

		};
		const [ left, right ] = tiles( cx, radius * Math.hypot( xx, yx ), width, texture.wrapS, 'x' );
		const [ bottom, top ] = tiles( cy, radius * Math.hypot( xy, yy ), height, texture.wrapT, 'y' );
		// Very heavily tiled materials can cover thousands of repeating UV tiles in a single pixel.
		if ( ( right - left + 1 ) * ( top - bottom + 1 ) > 256 ) return 'Reduce brush size or texture tiling for this surface.';
		for ( let row = bottom; row <= top; row ++ ) for ( let column = left; column <= right; column ++ ) {

			const mirrorX = texture.wrapS === THREE.MirroredRepeatWrapping && column % 2 !== 0;
			const mirrorY = texture.wrapT === THREE.MirroredRepeatWrapping && row % 2 !== 0;
			const flipY = Boolean( texture.flipY ) !== Boolean( mirrorY );
			ctx.save();
			ctx.setTransform( mirrorX ? -1 : 1, 0, 0, flipY ? -1 : 1,
				( mirrorX ? column + 1 : -column ) * width, ( flipY ? row + 1 : -row ) * height );
			ctx.beginPath();
			ctx.moveTo( texels[ 0 ].x, texels[ 0 ].y );
			ctx.lineTo( texels[ 1 ].x, texels[ 1 ].y );
			ctx.lineTo( texels[ 2 ].x, texels[ 2 ].y );
			ctx.closePath();
			ctx.clip();
			ctx.transform( xx, xy, yx, yy, cx, cy );
			ctx.fillStyle = color;
			ctx.globalAlpha = opacity;
			ctx.beginPath();
			ctx.arc( 0, 0, radius, 0, Math.PI * 2 );
			ctx.fill();
			ctx.restore();

		}
		target.dirty = true;
		texture.needsUpdate = true;
		return '';

	}

	assign( target, material ) {

		if ( Array.isArray( target.receiver.material ) ) {

			const slots = target.receiver.material.slice();
			slots[ target.slot ] = material;
			target.receiver.material = slots;

		} else target.receiver.material = material;

	}

	finish( commit ) {

		const commands = [];
		for ( const target of this.targets.values() ) {

			const stillAssigned = this.editor.getObjectMaterial( target.receiver, target.slot ) === target.material;
			if ( stillAssigned ) this.assign( target, target.source );
			if ( commit && target.dirty && stillAssigned && isVisible( target.receiver ) && ! hasRestriction( target.receiver, 'locked' ) && this.editor.scene.getObjectById( target.receiver.id ) ) {

				commands.push( new SetMaterialCommand( this.editor, target.receiver, target.material, target.slot ) );

			} else {

				target.texture.dispose();
				target.material.dispose();

			}

		}
		this.targets.clear();
		return commands;

	}

}
