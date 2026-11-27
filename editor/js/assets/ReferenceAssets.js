import * as THREE from 'three';
import { openAssetBrowser } from '../AssetBrowser.js';
import { AddObjectCommand } from '../commands/AddObjectCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { SetGeometryCommand } from '../commands/SetGeometryCommand.js';
import { SetMaterialCommand } from '../commands/SetMaterialCommand.js';
import { SetValueCommand } from '../commands/SetValueCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';
import { imageReference } from '../modeling/ReferenceObjects.js';
import { mediaPlane } from './MediaObjects.js';

export function chooseImageReference( editor, mode = 'normal', existing ) {

	const position = editor.cursor.clone();
	const workspace = editor.sourceFiles;
	openAssetBrowser( editor, { kind: 'reference', includeTextures: true, label: mode === 'mesh' ? 'Choose an image for a mesh plane' : 'Choose a reference image',
		onPick: async entry => {

			const { object } = await mediaPlane( editor, entry );
			if ( editor.sourceFiles !== workspace || existing && ( ! existing.parent || hasRestriction( existing, 'locked' ) ) ) {

				object.geometry.dispose();
				object.material.map?.dispose();
				object.material.dispose();
				return false;

			}
			object.name = entry.record.title || entry.file?.name || 'Image';
			if ( mode !== 'mesh' ) imageReference( object, mode );
			if ( existing ) {

				object.material.opacity = existing.material.opacity;
				const commands = [
					new SetGeometryCommand( editor, existing, object.geometry ),
					new SetMaterialCommand( editor, existing, object.material ),
					new SetValueCommand( editor, existing, 'userData', { ...existing.userData, assetObject: object.userData.assetObject } )
				];
				editor.execute( new MultiCmdsCommand( editor, commands ), 'Set reference image' );

			} else {

				object.position.copy( position );
				editor.execute( new AddObjectCommand( editor, object ) );

			}
			return true;

		}
	} );

}

export function addEmptyImage( editor ) {

	const object = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), new THREE.MeshBasicMaterial( {
		transparent: true, side: THREE.DoubleSide, visible: false, toneMapped: false
	} ) );
	imageReference( object );
	object.name = 'Empty Image';
	object.position.copy( editor.cursor );
	editor.execute( new AddObjectCommand( editor, object ) );

}

export function chooseReferenceFile( editor, formats ) {

	const input = document.createElement( 'input' );
	input.type = 'file';
	input.accept = formats;
	input.onchange = async () => {

		const file = input.files?.[ 0 ];
		if ( ! file ) return;
		const workspace = editor.sourceFiles;
		try {

			await editor.loader.loadFiles( [ file ], { [ file.name ]: file }, undefined, {
				position: editor.cursor.clone(), reference: true, canCommit: () => editor.sourceFiles === workspace
			} );

		} catch ( error ) {

			editor.assetBrowser?.status?.( 'Reference import: ' + error.message, true );
			editor.assetBrowser?.reveal?.();

		}

	};
	input.click();

}
