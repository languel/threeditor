import { Box3, Vector3 } from 'three';
import { SetPositionCommand } from '../commands/SetPositionCommand.js';
import { MultiCmdsCommand } from '../commands/MultiCmdsCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';

export function cursorSnapActions( editor ) {

	const model = editor.modeling;
	const editing = model.editMode;
	const indices = editing && model.canEdit() ? [ ...model.indices ] : [];
	const objects = editing ? [] : editor.selector.selection.filter( object => object !== editor.scene && object !== editor.camera );
	const positions = editing ? indices.map( index => model.object.localToWorld( new Vector3( ...model.data.points[ index ] ) ) ) :
		objects.map( object => object.getWorldPosition( new Vector3() ) );
	const center = new Vector3();
	if ( editor.config.getKey( 'settings/transformPivot' ) === 'bounds' ) new Box3().setFromPoints( positions ).getCenter( center );
	else if ( positions.length ) {

		for ( const position of positions ) center.add( position );
		center.divideScalar( positions.length );

	}
	const active = positions.at( -1 );
	const step = editor.config.getKey( 'settings/gridStep' ) || 1;
	const grid = position => position.clone().divideScalar( step ).round().multiplyScalar( step );
	const move = ( label, target ) => {

		if ( editing ) {

			model.edit( label, data => {
				indices.forEach( ( index, i ) => {

					const point = model.object.worldToLocal( target( positions[ i ], i ) );
					if ( model.planar ) point.z = 0;
					data.points[ index ] = point.toArray();

				} );
			} );
			return;

		}
		const commands = [];
		objects.forEach( ( object, i ) => {

			if ( ! object.parent || hasRestriction( object, 'locked' ) ) return;
			for ( let parent = object.parent; parent; parent = parent.parent ) if ( objects.includes( parent ) ) return;
			const next = object.parent.worldToLocal( target( positions[ i ], i ) );
			if ( ! next.equals( object.position ) ) commands.push( new SetPositionCommand( editor, object, next ) );

		} );
		if ( commands.length ) editor.execute( new MultiCmdsCommand( editor, commands ), label );

	};
	const actions = [
		[ 'Cursor to World Origin', 'pivotOrigin', () => editor.setCursor( new Vector3() ) ],
		[ 'Cursor to Grid', 'toolGrid', () => editor.setCursor( grid( editor.cursor ) ) ]
	];
	if ( active ) actions.push(
		[ 'Cursor to Selected', 'pivotMedian', () => editor.setCursor( center ) ],
		[ 'Cursor to Active', 'pivotActive', () => editor.setCursor( active ) ],
		[ 'Selection to Cursor', 'move', () => move( 'Selection to 3D Cursor', () => editor.cursor.clone() ) ],
		[ 'Selection to Cursor (Offset)', 'move', () => move( 'Selection to 3D Cursor (Offset)', position => position.clone().add( editor.cursor ).sub( center ) ) ],
		[ 'Selection to Grid', 'toolGrid', () => move( 'Selection to Grid', grid ) ],
		[ 'Selection to Active', 'pivotActive', () => move( 'Selection to Active', () => active.clone() ) ]
	);
	return actions;

}
