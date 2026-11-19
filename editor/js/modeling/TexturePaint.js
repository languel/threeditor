import * as THREE from 'three';
import { brushDab, brushFill } from './PencilBrush.js';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';
import { SetMaterialCommand } from '../commands/SetMaterialCommand.js';

function clipPolygonToFace( polygon, screen, det ) {

	for ( let i = 0; i < 3 && polygon.length; i ++ ) {

		const a = screen[ i ], b = screen[ ( i + 1 ) % 3 ];
		const edge = p => Math.sign( det ) * ( ( b.x - a.x ) * ( p.y - a.y ) - ( b.y - a.y ) * ( p.x - a.x ) );
		const input = polygon;
		polygon = [];
		let previous = input.at( -1 ), prevDist = edge( previous );
		for ( const point of input ) {

			const dist = edge( point );
			if ( ( dist < 0 ) !== ( prevDist < 0 ) ) {

				const t = prevDist / ( prevDist - dist );
				polygon.push( { x: previous.x + ( point.x - previous.x ) * t, y: previous.y + ( point.y - previous.y ) * t } );

			}
			if ( dist >= 0 ) polygon.push( point );
			previous = point;
			prevDist = dist;

		}

	}
	return polygon;

}

function perspectiveStamp( hit, texels, x, y, radius ) {

	const { screen, det } = hit;
	const [ a, b, c ] = screen;
	const toUV = p => {

		const u = ( ( p.x - a.x ) * ( c.y - a.y ) - ( p.y - a.y ) * ( c.x - a.x ) ) / det;
		const v = ( ( b.x - a.x ) * ( p.y - a.y ) - ( b.y - a.y ) * ( p.x - a.x ) ) / det;
		const weights = [ ( 1 - u - v ) * a.invW, u * b.invW, v * c.invW ];
		const invW = weights[ 0 ] + weights[ 1 ] + weights[ 2 ];
		return new THREE.Vector2().addScaledVector( texels[ 0 ], weights[ 0 ] / invW )
			.addScaledVector( texels[ 1 ], weights[ 1 ] / invW ).addScaledVector( texels[ 2 ], weights[ 2 ] / invW );

	};
	const fullyCovered = screen.every( point => ( point.x - x ) ** 2 + ( point.y - y ) ** 2 <= radius ** 2 );
	const circle = fullyCovered ? null : Array.from( { length: 32 }, ( _, index ) => {

		const angle = index / 32 * 2 * Math.PI;
		return { x: x + radius * Math.cos( angle ), y: y + radius * Math.sin( angle ) };

	} );
	const outline = fullyCovered ? texels : clipPolygonToFace( circle, screen, det ).map( toUV );
	const holes = hit.occluded.map( ( [ ox, oy, length ] ) => {

		const left = x + ox, top = y + oy, right = left + length, bottom = top + 1;
		return clipPolygonToFace( [ { x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom } ], screen, det ).map( toUV );

	} );
	return { outline, holes };

}

function tracePolygon( ctx, polygon ) {

	if ( polygon.length < 3 ) return;
	ctx.moveTo( polygon[ 0 ].x, polygon[ 0 ].y );
	for ( let i = 1; i < polygon.length; i ++ ) ctx.lineTo( polygon[ i ].x, polygon[ i ].y );
	ctx.closePath();

}

// Each touched material slot owns a private working image until the gesture commits.
export class TexturePaintStroke {

	constructor( editor ) {

		this.editor = editor;
		this.targets = new Map();

	}

	paint( hit, color, opacity, radius, frame, offsetX, offsetY, brush = {} ) {

		const receiver = hit.object;
		const projection = hit.screen;
		const slot = Array.isArray( receiver.material ) ? hit.face?.materialIndex ?? 0 : 0;
		const source = this.editor.getObjectMaterial( receiver, slot );
		const channel = source?.map?.channel ?? 0;
		const geometry = receiver.geometry;
		const coords = geometry.getAttribute( channel === 1 ? 'uv1' : 'uv' );
		const uv = channel === 1 ? hit.uv1 : hit.uv;
		if ( ! hit.face || ! coords || ! ( projection || uv ) || ! source?.color || ! ( 'map' in source ) || channel > 1 ) return 'Choose a mesh with UV coordinates and a base-color material.';

		const target = this.materialTarget( receiver, slot, source );
		if ( typeof target === 'string' ) return target;

		const { texture, ctx, material } = target;
		if ( brush.erase && ! material.transparent ) { material.transparent = true; material.needsUpdate = true; }
		if ( texture.matrixAutoUpdate ) texture.updateMatrix();
		const { a, b, c } = hit.face;
		const world = receiver.matrixWorld.clone();
		if ( ! projection && receiver.isInstancedMesh ) {

			const instance = new THREE.Matrix4();
			receiver.getMatrixAt( hit.instanceId, instance );
			world.multiply( instance );

		}
		const screen = projection ? projection.map( point => new THREE.Vector2( point.x, point.y ) ) : [ a, b, c ].map( index => {
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
		const coord = projection ? texels[ 0 ] : uv.clone().applyMatrix3( texture.matrix ).multiply( new THREE.Vector2( width, height ) );
		const cx = coord.x - offsetX * xx - offsetY * yx;
		const cy = coord.y - offsetX * xy - offsetY * yy;
		const perspective = projection && projection.some( point => point.invW !== projection[ 0 ].invW ) ?
			perspectiveStamp( hit, texels, projection[ 0 ].x - offsetX, projection[ 0 ].y - offsetY, radius ) : null;
		if ( perspective && perspective.outline.length < 3 ) return '';
		const tiles = ( center, extent, size, wrap, axis ) => {

			if ( wrap === THREE.ClampToEdgeWrapping ) return [ 0, 0 ];
			const values = ( perspective?.outline || texels ).map( point => point[ axis ] );
			const min = perspective ? Math.min( ...values ) : Math.max( center - extent, Math.min( ...values ) );
			const max = perspective ? Math.max( ...values ) : Math.min( center + extent, Math.max( ...values ) );
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
			ctx.fillStyle = color;
			ctx.globalAlpha = opacity;
			if ( brush.erase ) ctx.globalCompositeOperation = 'destination-out';
			ctx.beginPath();
			if ( perspective ) {

				tracePolygon( ctx, perspective.outline );
				if ( perspective.holes.length ) {

					ctx.clip();
					for ( const hole of perspective.holes ) tracePolygon( ctx, hole );

				}
				ctx.fill( 'evenodd' );
				ctx.restore();
				continue;

			}
			tracePolygon( ctx, texels );
			ctx.clip();
			ctx.transform( xx, xy, yx, yy, cx, cy );
			if ( hit.occluded?.length ) {

				ctx.beginPath();
				ctx.rect( -radius - 1, -radius - 1, 2 * radius + 2, 2 * radius + 2 );
				for ( const [ x, y, length ] of hit.occluded ) ctx.rect( x, y, length, 1 );
				ctx.clip( 'evenodd' );

			}
			ctx.rotate( brush.angle || 0 );
			ctx.scale( 1, brush.aspect || 1 );
			ctx.fillStyle = brushFill( ctx, radius, color, brush.hardness ?? 1 );
			ctx.beginPath();
			ctx.arc( 0, 0, radius, 0, Math.PI * 2 );
			ctx.fill();
			ctx.restore();

		}
		target.dirty = true;
		texture.needsUpdate = true;
		return '';

	}

	materialTarget( receiver, slot, source ) {

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

		return target;

	}

	paintUV( receiver, slot, u, v, brush, pressure, erase = false ) {

		const source = this.editor.getObjectMaterial( receiver, slot );
		if ( ! source?.color || ! ( 'map' in source ) ) return 'Choose a base-color material.';
		const target = this.materialTarget( receiver, slot, source );
		if ( typeof target === 'string' ) return target;
		const { ctx, material, texture } = target;
		if ( erase && ! material.transparent ) { material.transparent = true; material.needsUpdate = true; }
		brushDab( ctx, u * ctx.canvas.width, v * ctx.canvas.height, pressure, brush, erase );
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
