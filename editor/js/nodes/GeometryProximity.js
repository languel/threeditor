// Build one search tree per target and reuse it for every sample of the field.
export function createProximity( THREE, geometry, mode ) {

	const position = geometry.getAttribute( 'position' );
	const index = geometry.index;
	const points = mode === 'Points';
	const edges = mode === 'Edges';
	const elements = [];
	const value = new THREE.Vector3();
	const length = points ? position.count : index?.count ?? position.count;
	const at = i => points || ! index ? i : index.getX( i );

	function add( indices ) {

		const bounds = new THREE.Box3();
		for ( const i of indices ) bounds.expandByPoint( value.fromBufferAttribute( position, i ) );
		elements.push( { bounds, indices } );

	}

	if ( points ) {

		for ( let i = 0; i < length; i ++ ) add( [ i ] );

	} else for ( let i = 0; i + 2 < length; i += 3 ) {

		const a = at( i ), b = at( i + 1 ), c = at( i + 2 );
		if ( edges ) {

			add( [ a, b ] );
			add( [ b, c ] );
			add( [ c, a ] );

		} else add( [ a, b, c ] );

	}

	function build( list ) {

		const box = new THREE.Box3();
		for ( const element of list ) box.union( element.bounds );
		if ( list.length <= 12 ) return { box, list };
		const size = box.getSize( new THREE.Vector3() );
		const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
		const middle = Math.floor( list.length / 2 );
		list.sort( ( a, b ) => a.bounds.min[ axis ] + a.bounds.max[ axis ] - b.bounds.min[ axis ] - b.bounds.max[ axis ] );
		return { box, left: build( list.slice( 0, middle ) ), right: build( list.slice( middle ) ) };

	}

	const tree = elements.length ? build( elements ) : null;
	const line = new THREE.Line3(), triangle = new THREE.Triangle();
	const result = new THREE.Vector3(), point = new THREE.Vector3(), clamped = new THREE.Vector3();
	let distance;

	function consider( origin, candidate ) {

		const error = origin.distanceToSquared( candidate );
		if ( error >= distance ) return;
		distance = error;
		result.copy( candidate );

	}

	function segment( origin, start, end ) {

		if ( start.equals( end ) ) consider( origin, start );
		else consider( origin, line.set( start, end ).closestPointToPoint( origin, true, point ) );

	}

	function sample( branch, origin ) {

		if ( branch.box.clampPoint( origin, clamped ).distanceToSquared( origin ) > distance ) return;
		if ( ! branch.list ) {

			const { left, right } = branch;
			const a = left.box.clampPoint( origin, clamped ).distanceToSquared( origin );
			const b = right.box.clampPoint( origin, clamped ).distanceToSquared( origin );
			sample( a <= b ? left : right, origin );
			sample( a <= b ? right : left, origin );
			return;

		}
		for ( const { indices } of branch.list ) {

			const a = triangle.a.fromBufferAttribute( position, indices[ 0 ] );
			if ( points ) { consider( origin, a ); continue; }
			const b = triangle.b.fromBufferAttribute( position, indices[ 1 ] );
			if ( edges ) { segment( origin, a, b ); continue; }
			const c = triangle.c.fromBufferAttribute( position, indices[ 2 ] );
			if ( triangle.getArea() > 0 ) consider( origin, triangle.closestPointToPoint( origin, point ) );
			else {

				segment( origin, a, b );
				segment( origin, b, c );
				segment( origin, c, a );

			}

		}

	}

	let previous, indexValue, delta = 0;
	function evaluate( element ) {

		if ( previous !== element || indexValue !== element.index ) {

			previous = element;
			indexValue = element.index;
			distance = Infinity;
			result.copy( element.position );
			if ( tree ) sample( tree, element.position );
			delta = tree ? Math.sqrt( distance ) : 0;

		}

	}
	return {
		distance: element => { evaluate( element ); return delta; },
		x: element => { evaluate( element ); return result.x; },
		y: element => { evaluate( element ); return result.y; },
		z: element => { evaluate( element ); return result.z; }
	};

}
