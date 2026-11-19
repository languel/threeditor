import { elementKey, meshEdges } from './MeshSelection.js?v=shape-selection';

const positionKey = point => point.map( Math.fround ).join( ',' );

export function uvSelectionCorrespondence( geometry, data, triangles ) {

	const position = geometry.attributes.position;
	const polygonForTriangle = geometry.userData.triangleFaces;
	const vertex = new Map(), edge = new Map(), face = new Map();
	function entry( byKey, ids ) {

		const key = elementKey( ids );
		if ( ! byKey.has( key ) ) byKey.set( key, { ids, parts: [], triangles: [] } );
		return byKey.get( key );

	}
	for ( const edgeIds of meshEdges( data ) ) entry( edge, edgeIds );
	const controls = new Map();
	for ( const [ index, corners ] of triangles.entries() ) {

		const polygon = data.kind === 'vertices' ? index : polygonForTriangle?.[ index ];
		const ids = data.faces[ polygon ];
		if ( ! ids ) continue;
		let cornersToControls = ids;
		if ( data.kind !== 'vertices' ) {

			if ( ! controls.has( polygon ) ) controls.set( polygon, new Map( ids.map( id => [ positionKey( data.points[ id ] ), id ] ) ) );
			const byPosition = controls.get( polygon );
			cornersToControls = corners.map( i => byPosition.get( positionKey( [ position.getX( i ), position.getY( i ), position.getZ( i ) ] ) ) );

		}
		if ( cornersToControls.some( id => id === undefined ) ) continue;
		const patch = entry( face, ids );
		patch.parts.push( corners );
		patch.triangles.push( index );
		for ( const [ i, id ] of cornersToControls.entries() ) {

			entry( vertex, [ id ] ).parts.push( [ corners[ i ] ] );
			const next = ( i + 1 ) % corners.length;
			const side = edge.get( elementKey( [ id, cornersToControls[ next ] ] ) );
			if ( side ) side.parts.push( [ corners[ i ], corners[ next ] ] );

		}

	}
	const entries = { vertex, edge, face };
	return {
		fromMesh( mode, ids ) {

			const points = new Set(), edges = new Set(), faces = new Set();
			for ( const key of ids ) {

				const match = entries[ mode ].get( key );
				if ( ! match ) continue;
				for ( const part of match.parts ) {

					for ( const index of part ) points.add( index );
					if ( mode === 'edge' ) edges.add( elementKey( part ) );

				}
				for ( const index of match.triangles ) faces.add( index );

			}
			return { selection: [ ...points ], edges, faces, mode };

		},
		toMesh( mode, selected ) {

			const uv = new Set( selected );
			const hits = [];
			for ( const item of entries[ mode ].values() ) {

				if ( ! item.parts.length ) continue;
				const complete = part => part.every( i => uv.has( i ) );
				if ( mode === 'face' ? item.parts.every( complete ) : item.parts.some( complete ) ) hits.push( item.ids );

			}
			return hits;

		}
	};

}
