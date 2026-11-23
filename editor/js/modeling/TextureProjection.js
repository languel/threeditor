import * as THREE from 'three';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { SetMaterialCommand } from '../commands/SetMaterialCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { fitView } from './LightView.js';
import { bakeTexture } from './TextureBake.js?v=texture-projection';
import { pencilProjectionUV } from './PencilRibbon.js?v=texture-projection';
import { pencilGrainTexture } from './PencilGrain.js?v=texture-projection';

export async function projectionImage( file, camera, size ) {

	const bitmap = await createImageBitmap( file );
	try {

		const aspect = camera.isOrthographicCamera ? ( camera.right - camera.left ) / ( camera.top - camera.bottom ) : camera.aspect;
		const canvas = document.createElement( 'canvas' );
		canvas.width = Math.max( 1, Math.round( size * Math.min( 1, aspect ) ) );
		canvas.height = Math.max( 1, Math.round( size * Math.min( 1, 1 / aspect ) ) );
		const rect = fitView( { x: 0, y: 0, width: canvas.width, height: canvas.height }, bitmap.width / bitmap.height );
		canvas.getContext( '2d' ).drawImage( bitmap, rect.x, rect.y, rect.width, rect.height );
		return { canvas, x: 0, y: 0, width: canvas.width, height: canvas.height };

	} finally {

		bitmap.close();

	}

}

export function applyTextureProjection( editor, object, camera, output, size, slot ) {

	const material = editor.getObjectMaterial( object, slot );
	if ( ! material?.color || ! ( 'map' in material ) ) throw new Error( 'Choose a material that supports an image texture.' );
	if ( object.userData.modifiers?.length ) throw new Error( 'Apply the mesh modifiers before projecting an image.' );
	const source = object.geometry;
	if ( ! source.getAttribute( 'uv' ) ) throw new Error( 'Unwrap the mesh before projecting an image.' );
	const brush = source.userData.modeling?.pencilBrush;
	const target = new THREE.BufferGeometry().copy( source );
	try {

		if ( brush ) target.setAttribute( 'uv', pencilProjectionUV( target ) );
		if ( Array.isArray( object.material ) && target.groups.length ) {

			const index = target.index;
			const selected = [];
			const start = target.drawRange.start, end = start + target.drawRange.count;
			for ( const group of target.groups ) if ( group.materialIndex === slot ) {

				for ( let i = Math.max( start, group.start ); i < Math.min( end, group.start + group.count ); i ++ ) selected.push( index ? index.getX( i ) : i );

			}
			target.setIndex( selected );
			target.setDrawRange( 0, selected.length );
			target.clearGroups();

		}
		const image = bakeTexture( editor.renderer, editor.scene, object, target, camera, { size, mode: 'projector', output, applyImage: true } );
		const texture = new THREE.CanvasTexture( image );
		texture.name = 'Projected image';
		texture.colorSpace = THREE.SRGBColorSpace;
		const projected = material.clone();
		projected.color.set( 0xffffff );
		projected.map = texture;
		projected.transparent = true;
		projected.alphaTest = Math.max( projected.alphaTest, 1 / 255 );
		const commands = [];
		if ( brush ) {

			const next = new THREE.BufferGeometry().copy( source );
			next.userData = structuredClone( source.userData );
			next.userData.modeling.pencilBrush.projected = true;
			next.setAttribute( 'uv1', target.getAttribute( 'uv' ).clone() );
			const colors = next.getAttribute( 'color' );
			for ( let i = 0; i < colors.count; i ++ ) colors.setXYZ( i, 1, 1, 1 );
			texture.channel = 1;
			projected.alphaMap = pencilGrainTexture( THREE, brush, true );
			commands.push( new SetGeometryCommand( editor, object, next ) );

		}
		commands.push( new SetMaterialCommand( editor, object, projected, slot ) );
		editor.execute( commands.length === 1 ? commands[ 0 ] : new MultiCmdsCommand( editor, commands ),
			'Project image onto ' + ( object.name || object.type ) );

	} finally {

		target.dispose();

	}

}
