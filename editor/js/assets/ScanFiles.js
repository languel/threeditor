export function scanKind( name = '' ) {

	if ( /\.(spz|sog|rad|splat)(?:[?#]|$)/i.test( name ) ) return 'splat';
	if ( /\.(pcd|xyz)(?:[?#]|$)/i.test( name ) ) return 'point-cloud';

}

export async function scanFileKind( file ) {

	if ( ! /\.ply$/i.test( file.name ) ) return scanKind( file.name );

	// Read only the header. Gaussian properties belong to vertices, not comments or faces.
	const prefix = await file.slice( 0, 65536 ).text();
	const end = /^end_header\s*$/m.exec( prefix );
	if ( ! end || ! /^ply\r?\n/.test( prefix ) ) return;
	const elements = prefix.slice( 0, end.index ).split( /^element\s+/m );
	const vertices = elements.find( element => /^vertex\s+\d+/.test( element ) ) || '';
	const property = name => new RegExp( '^property[ \\t]+\\w+[ \\t]+' + name + '[ \\t\\r]*$', 'm' ).test( vertices );
	const gaussian = [ 'f_dc_0', 'opacity', 'scale_0', 'rot_0' ].every( property );
	const packed = elements.some( element => /^chunk\s+\d+/.test( element ) ) &&
		[ 'packed_position', 'packed_rotation', 'packed_scale', 'packed_color' ].every( property );
	if ( gaussian || packed ) return 'splat';
	if ( vertices ) return elements.some( element => /^face\s+[1-9]\d*\b/.test( element ) ) ? 'model' : 'point-cloud';

}

export async function loadScanGeometry( file, kind ) {

	const THREE = await import( 'three' );
	const extension = file.name.split( '.' ).pop().toLowerCase();
	let object;
	if ( extension === 'pcd' ) {

		const { PCDLoader } = await import( 'three/addons/loaders/PCDLoader.js' );
		object = new PCDLoader().parse( await file.arrayBuffer() );

	} else if ( extension === 'xyz' ) {

		const { XYZLoader } = await import( 'three/addons/loaders/XYZLoader.js' );
		const geometry = new XYZLoader().parse( await file.text() );
		object = new THREE.Points( geometry, new THREE.PointsMaterial( { vertexColors: geometry.hasAttribute( 'color' ) } ) );

	} else {

		const { PLYLoader } = await import( 'three/addons/loaders/PLYLoader.js' );
		const geometry = new PLYLoader().parse( await file.arrayBuffer() );
		const vertexColors = geometry.hasAttribute( 'color' );
		const mesh = geometry.index || kind === 'model';
		if ( mesh && ! geometry.hasAttribute( 'normal' ) ) geometry.computeVertexNormals();
		object = mesh ?
			new THREE.Mesh( geometry, new THREE.MeshStandardMaterial( { vertexColors } ) ) :
			new THREE.Points( geometry, new THREE.PointsMaterial( { vertexColors } ) );

	}

	const { geometry, material } = object;
	if ( ! geometry.getAttribute( 'position' )?.count ) {

		geometry.dispose();
		material.dispose();
		throw new Error( 'The scan has no positions.' );

	}
	geometry.computeBoundingBox();
	if ( object.isPoints ) {

		const diagonal = geometry.boundingBox.getSize( new THREE.Vector3() ).length();
		material.size = diagonal > 0 ? diagonal * 0.004 : 0.01;

	}
	object.name = file.name;
	return object;

}
