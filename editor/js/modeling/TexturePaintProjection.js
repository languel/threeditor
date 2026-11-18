import * as THREE from 'three';
import { hasRestriction, isVisible } from '../ObjectRestrictions.js';

const tileSize = 32;
const scanCellSize = 4;

// Index the projected scene once per stroke. The index also includes locked
// meshes and meshes without UVs, since they still occlude paintable surfaces.
export class TexturePaintProjection {

	constructor( frame, meshes, scans = [] ) {

		const { camera, rect } = frame;
		this.near = camera.near;
		this.far = camera.far;
		this.width = rect.width;
		this.height = rect.height;
		this.view = camera.matrixWorldInverse.clone();
		this.projection = camera.projectionMatrix.clone();
		this.columns = Math.ceil( this.width / tileSize );
		this.tiles = new Map();
		this.scanDepth = scans.length ? new ScanPaintDepth( frame, scans ) : null;
		const world = new THREE.Matrix4(), instance = new THREE.Matrix4();
		const vertex = new THREE.Vector3();

		for ( const object of meshes ) {

			if ( ! isVisible( object ) ) continue;
			const { geometry, material } = object;
			const positions = geometry.getAttribute( 'position' );
			if ( ! positions ) continue;
			const index = geometry.index;
			const count = index?.count ?? positions.count;
			const groups = Array.isArray( material ) ? geometry.groups : [ { start: 0, count, materialIndex: 0 } ];
			for ( let instanceId = 0; instanceId < ( object.isInstancedMesh ? object.count : 1 ); instanceId ++ ) {

				world.copy( object.matrixWorld );
				if ( object.isInstancedMesh ) {

					object.getMatrixAt( instanceId, instance );
					world.multiply( instance );

				}
				const mirrored = world.determinant() < 0;
				const projected = Array.from( { length: positions.count }, ( _, i ) => {

					object.getVertexPosition( i, vertex ).applyMatrix4( world ).applyMatrix4( camera.matrixWorldInverse );
					const distance = - vertex.z;
					const invW = camera.isPerspectiveCamera ? 1 / distance : 1;
					vertex.applyMatrix4( camera.projectionMatrix );
					return { x: ( vertex.x + 1 ) * this.width / 2, y: ( 1 - vertex.y ) * this.height / 2,
						z: camera.isPerspectiveCamera ? -invW : distance, invW, distance };

				} );
				for ( const group of groups ) {

					const slot = Array.isArray( material ) ? material[ group.materialIndex ] : material;
					if ( ! slot?.visible ) continue;
					const start = Math.max( group.start, geometry.drawRange.start );
					const end = Math.min( count, group.start + group.count, geometry.drawRange.start + geometry.drawRange.count );
					for ( let i = start; i + 2 < end; i += 3 ) {

						const a = index ? index.getX( i ) : i;
						const b = index ? index.getX( i + 1 ) : i + 1;
						const c = index ? index.getX( i + 2 ) : i + 2;
						this.indexFace( object, { a, b, c, materialIndex: group.materialIndex },
							[ projected[ a ], projected[ b ], projected[ c ] ], slot.side, mirrored );

					}

				}

			}

		}

	}

	matches( { camera, rect } ) {

		return rect.width === this.width && rect.height === this.height &&
			this.view.equals( camera.matrixWorldInverse ) && this.projection.equals( camera.projectionMatrix );

	}

	surfaceDepthAt( x, y ) {

		if ( x < 0 || y < 0 || x >= this.width || y >= this.height ) return Infinity;
		const tile = this.tiles.get( Math.floor( y / tileSize ) * this.columns + Math.floor( x / tileSize ) );
		let depth = Infinity;
		for ( const face of tile || [] ) depth = Math.min( depth, depthAt( face, x, y ) );
		return depth;

	}

	indexFace( object, face, screen, side, mirrored ) {

		// Faces crossing the clip planes need perspective clipping before projection.
		// Ask the caller to use ray hits for that view.
		if ( screen.some( point => ! Number.isFinite( point.z ) || point.distance < this.near || point.distance > this.far ) ) {

			if ( ! screen.every( point => point.distance < this.near ) && ! screen.every( point => point.distance > this.far ) ) this.clipped = true;
			return;

		}
		const [ a, b, c ] = screen;
		const det = ( b.x - a.x ) * ( c.y - a.y ) - ( b.y - a.y ) * ( c.x - a.x );
		const front = mirrored ? det > 0 : det < 0;
		if ( Math.abs( det ) < 1e-8 || side === THREE.FrontSide && ! front || side === THREE.BackSide && front ) return;
		const left = Math.max( 0, Math.min( a.x, b.x, c.x ) );
		const right = Math.min( this.width, Math.max( a.x, b.x, c.x ) );
		const top = Math.max( 0, Math.min( a.y, b.y, c.y ) );
		const bottom = Math.min( this.height, Math.max( a.y, b.y, c.y ) );
		if ( left > right || top > bottom ) return;
		const entry = { object, face, screen, det, left, right, top, bottom };
		for ( let row = Math.floor( top / tileSize ); row < Math.ceil( this.height / tileSize ) && row <= Math.floor( bottom / tileSize ); row ++ ) {

			for ( let column = Math.floor( left / tileSize ); column < this.columns && column <= Math.floor( right / tileSize ); column ++ ) {

				const key = row * this.columns + column;
				let tile = this.tiles.get( key );
				if ( ! tile ) this.tiles.set( key, tile = [] );
				tile.push( entry );

			}

		}

	}

	faces( x, y, radius ) {

		const left = Math.max( 0, Math.floor( x - radius ) );
		const right = Math.min( Math.ceil( this.width ), Math.ceil( x + radius ) );
		const top = Math.max( 0, Math.floor( y - radius ) );
		const bottom = Math.min( Math.ceil( this.height ), Math.ceil( y + radius ) );
		const width = right - left, height = bottom - top;
		if ( width <= 0 || height <= 0 ) return [];
		const candidates = new Set();
		for ( let row = Math.floor( top / tileSize ); row <= Math.floor( ( bottom - 1 ) / tileSize ); row ++ ) {

			for ( let column = Math.floor( left / tileSize ); column <= Math.floor( ( right - 1 ) / tileSize ); column ++ ) {

				for ( const face of this.tiles.get( row * this.columns + column ) || [] ) candidates.add( face );

			}

		}
		const depths = new Float64Array( width * height ).fill( Infinity );
		const owners = new Array( depths.length );
		for ( const entry of candidates ) {

			const x0 = Math.max( left, Math.ceil( entry.left - .5 ) ), x1 = Math.min( right - 1, Math.floor( entry.right - .5 ) );
			const y0 = Math.max( top, Math.ceil( entry.top - .5 ) ), y1 = Math.min( bottom - 1, Math.floor( entry.bottom - .5 ) );
			for ( let py = y0; py <= y1; py ++ ) {

				for ( let px = x0; px <= x1; px ++ ) {

					if ( ( px + .5 - x ) ** 2 + ( py + .5 - y ) ** 2 > radius ** 2 ) continue;
					const z = depthAt( entry, px + .5, py + .5 );
					const index = ( py - top ) * width + px - left;
					if ( z < depths[ index ] ) {

						depths[ index ] = z;
						owners[ index ] = entry;

					}

				}

			}

		}

		if ( this.scanDepth ) for ( let i = 0; i < owners.length; i ++ ) {

			if ( ! owners[ i ] ) continue;
			const scan = this.scanDepth.at( left + i % width + .5, top + Math.floor( i / width ) + .5, depths[ i ] );
			if ( scan < depths[ i ] ) {

				depths[ i ] = scan;
				owners[ i ] = undefined;

			}

		}

		const visible = new Set( owners );
		visible.delete( undefined );
		// A triangle smaller than one pixel can miss the pixel-center grid.
		// Probe its centroid against other faces in the same tile.
		for ( const entry of candidates ) {

			if ( visible.has( entry ) || entry.right - entry.left >= 1 && entry.bottom - entry.top >= 1 ) continue;
			const [ a, b, c ] = entry.screen;
			const cx = ( a.x + b.x + c.x ) / 3, cy = ( a.y + b.y + c.y ) / 3;
			if ( cx < 0 || cy < 0 || cx >= this.width || cy >= this.height || ( cx - x ) ** 2 + ( cy - y ) ** 2 > radius ** 2 ) continue;
			const tile = this.tiles.get( Math.floor( cy / tileSize ) * this.columns + Math.floor( cx / tileSize ) );
			const depth = depthAt( entry, cx, cy );
			if ( ( this.scanDepth?.at( cx, cy, depth ) ?? Infinity ) < depth ) continue;
			if ( ! tile?.some( other => other !== entry && depthAt( other, cx, cy ) < depth - 1e-7 ) ) visible.add( entry );

		}
		return [ ...visible ].filter( entry => ! hasRestriction( entry.object, 'locked' ) ).map( entry => {

			const occluded = [];
			const x0 = Math.max( left, Math.floor( entry.left ) ), x1 = Math.min( right, Math.ceil( entry.right ) );
			const y0 = Math.max( top, Math.floor( entry.top ) ), y1 = Math.min( bottom, Math.ceil( entry.bottom ) );
			for ( let py = y0; py < y1; py ++ ) {

				let start = -1;
				for ( let px = x0; px <= x1; px ++ ) {

					const front = depths[ ( py - top ) * width + px - left ];
					const z = depthAt( entry, px + .5, py + .5 );
					if ( px < x1 && Number.isFinite( z ) && front < z - 1e-9 ) {

						if ( start === -1 ) start = px;

					} else if ( start !== -1 ) {

						occluded.push( [ start - x, py - y, px - start ] );
						start = -1;

					}

				}

			}
			return { ...entry, occluded };

		} );

	}

}

// Sample scan visibility on a coarser grid than mesh coverage. The same cells
// are reused across dabs, and each sample uses the scan's native hit test.
class ScanPaintDepth {

	constructor( { camera, rect }, scans ) {

		this.camera = camera;
		this.rect = rect;
		this.scans = scans.filter( object => isVisible( object ) && ( object.material?.opacity ?? object.opacity ?? 1 ) > 0 );
		this.columns = Math.ceil( rect.width / scanCellSize );
		this.depths = new Map();
		this.ray = new THREE.Raycaster();
		this.point = new THREE.Vector3();
		this.ndc = new THREE.Vector2();
		this.bounds = new Map();
		for ( const object of this.scans ) {

			if ( object.isPoints ) {

				if ( ! object.geometry.boundingSphere ) object.geometry.computeBoundingSphere();
				this.bounds.set( object, object.geometry.boundingSphere.clone().applyMatrix4( object.matrixWorld ) );

			} else if ( object.getBoundingBox ) {

				this.bounds.set( object, object.getBoundingBox( false, new THREE.Box3() ).applyMatrix4( object.matrixWorld ) );

			}
		}

	}

	at( x, y, meshDepth ) {

		const row = Math.floor( y / scanCellSize ), column = Math.floor( x / scanCellSize );
		const key = row * this.columns + column;
		const cached = this.depths.get( key );
		if ( cached && ( cached.testedDepth >= meshDepth || cached.depth < cached.testedDepth ) ) return cached.depth;
		const { camera, rect, ray } = this;
		const px = Math.min( rect.width - .5, ( column + .5 ) * scanCellSize );
		const py = Math.min( rect.height - .5, ( row + .5 ) * scanCellSize );
		ray.setFromCamera( this.ndc.set( 2 * px / rect.width - 1, 1 - 2 * py / rect.height ), camera );
		let depth = Infinity;
		for ( const scan of this.scans ) {

			const bounds = this.bounds.get( scan );
			if ( scan.isPoints ) {

				const distance = Math.max( camera.near, -this.point.copy( bounds.center ).applyMatrix4( camera.matrixWorldInverse ).z );
				const projectedHeight = camera.isOrthographicCamera ? ( camera.top - camera.bottom ) / camera.zoom :
					2 * distance * Math.tan( THREE.MathUtils.degToRad( camera.getEffectiveFOV() / 2 ) );
				const size = scan.material?.size ?? 1;
				const pointSize = scan.material?.sizeAttenuation && camera.isPerspectiveCamera ?
					size * rect.height / ( 2 * distance ) : size;
				ray.params.Points.threshold = projectedHeight / rect.height * Math.max( scanCellSize, pointSize ) / 2;

			} else if ( bounds && ! bounds.containsPoint( ray.ray.origin ) ) {

				const intersection = ray.ray.intersectBox( bounds, this.point );
				if ( ! intersection || this.depth( intersection, true ) >= meshDepth ) continue;

			}
			for ( const hit of ray.intersectObject( scan, false ) ) {

				depth = Math.min( depth, this.depth( hit.point ) );

			}

		}
		this.depths.set( key, { depth, testedDepth: meshDepth } );
		return depth;

	}

	depth( point, bound = false ) {

		const { camera } = this;
		const distance = - this.point.copy( point ).applyMatrix4( camera.matrixWorldInverse ).z;
		if ( distance < camera.near ) return bound ? -Infinity : Infinity;
		if ( distance > camera.far ) return Infinity;
		return camera.isPerspectiveCamera ? -1 / distance : distance;

	}

}

function depthAt( { screen: [ a, b, c ], det }, x, y ) {

	const u = ( ( x - a.x ) * ( c.y - a.y ) - ( y - a.y ) * ( c.x - a.x ) ) / det;
	const v = ( ( b.x - a.x ) * ( y - a.y ) - ( b.y - a.y ) * ( x - a.x ) ) / det;
	return u < -1e-7 || v < -1e-7 || u + v > 1 + 1e-7 ? Infinity : a.z + u * ( b.z - a.z ) + v * ( c.z - a.z );

}
