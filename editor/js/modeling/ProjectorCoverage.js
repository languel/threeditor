import { hasRestriction } from '../ObjectRestrictions.js';
import { lightViewCamera } from './LightView.js';
import { modelButton } from './ModelControls.js?v=uv-anchors';

function hitMaterial( hit ) {

	const { material } = hit.object;
	return Array.isArray( material ) ? material[ hit.face?.materialIndex ?? 0 ] : material;

}

function visibleSurface( hit ) {

	const material = hitMaterial( hit );
	return material && material.visible !== false && material.opacity !== 0;

}

function opaqueSurface( hit ) {

	const material = hitMaterial( hit );
	return material && material.visible !== false && material.opacity !== 0 && ! material.transparent && ! material.alphaTest && ! material.alphaHash &&
		! material.alphaMap && ! material.transmission;

}

export function inspectProjectorCoverage( THREE, scene, projector, receiver ) {

	scene.updateMatrixWorld( true );
	const camera = lightViewCamera( THREE, projector );
	const targetObjects = new Set(), projectorObjects = new Set();
	receiver.traverse( object => targetObjects.add( object ) );
	projector.traverse( object => projectorObjects.add( object ) );
	const receivers = [], blockers = [];
	scene.traverseVisible( object => {

		if ( ! object.isMesh || ! object.geometry?.attributes.position || object.userData.runtimeOnly ||
			projectorObjects.has( object ) || hasRestriction( object, 'disabled' ) ) return;
		( targetObjects.has( object ) ? receivers : blockers ).push( object );

	} );

	const width = 40, height = THREE.MathUtils.clamp( Math.round( width / camera.aspect ), 10, 40 );
	const cells = new Uint8Array( width * height );
	const counts = new Map();
	const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
	const forward = camera.getWorldDirection( new THREE.Vector3() );
	const hits = [];
	let targetSamples = 0, blockedSamples = 0;
	for ( let row = 0; row < height; row ++ ) for ( let column = 0; column < width; column ++ ) {

		const index = row * width + column;
		ray.setFromCamera( ndc.set( 2 * ( column + .5 ) / width - 1, 1 - 2 * ( row + .5 ) / height ), camera );
		const depthScale = ray.ray.direction.dot( forward );
		ray.near = camera.near / depthScale;
		ray.far = camera.far / depthScale;
		hits.length = 0;
		const target = ray.intersectObjects( receivers, false, hits ).find( visibleSurface );
		if ( ! target ) continue;

		cells[ index ] = 1;
		targetSamples ++;
		// Ignore coincident surfaces and geometry beyond the first receiver hit.
		ray.far = target.distance - Math.max( 1e-5, target.distance * 1e-5 );
		hits.length = 0;
		const obstruction = ray.intersectObjects( blockers, false, hits ).find( opaqueSurface );
		if ( ! obstruction ) continue;

		cells[ index ] = 2;
		blockedSamples ++;
		counts.set( obstruction.object, ( counts.get( obstruction.object ) || 0 ) + 1 );

	}
	return { cells, width, height, aspect: camera.aspect, targetSamples, blockedSamples,
		blockers: [ ...counts ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ) };

}

export function addProjectorCoverageControl( THREE, editor, projector, host ) {

	const report = document.createElement( 'div' );
	report.hidden = true;
	const status = document.createElement( 'p' );
	status.setAttribute( 'role', 'status' );
	const preview = document.createElement( 'canvas' );
	preview.setAttribute( 'role', 'img' );
	preview.title = 'Green marks clear receiver samples and orange marks blocked samples.';
	preview.setAttribute( 'aria-label', 'Projector coverage map. ' + preview.title );
	Object.assign( preview.style, { width: '100%', height: 'auto', imageRendering: 'pixelated', display: 'block' } );
	const list = document.createElement( 'ul' );
	report.append( status, preview, list );
	const target = () => editor.objectByUuid( projector.userData.projectorTarget );
	modelButton( host, 'Check projector coverage', 'target', () => {

		const receiver = target();
		const coverage = receiver && inspectProjectorCoverage( THREE, editor.scene, projector, receiver );
		report.hidden = false;
		list.replaceChildren();
		preview.style.display = coverage?.targetSamples ? 'block' : 'none';
		if ( ! coverage?.targetSamples ) {

			status.textContent = receiver ? 'No receiver samples inside the projector lens.' : 'Choose an auto-mask target to check coverage.';
			return;

		}
		const { width, height, aspect, cells, targetSamples, blockedSamples } = coverage;
		preview.width = width;
		preview.height = height;
		Object.assign( preview.style, { height: 'auto', aspectRatio: String( aspect ) } );
		const context = preview.getContext( '2d' );
		const colors = [ '#232830', '#5ec39a', '#ef9b58' ];
		if ( context ) for ( let i = 0; i < cells.length; i ++ ) {

			context.fillStyle = colors[ cells[ i ] ];
			context.fillRect( i % width, Math.floor( i / width ), 1, 1 );

		}
		const percent = count => Number( ( count / targetSamples * 100 ).toFixed( 1 ) ) + '%';
		status.textContent = percent( blockedSamples ) + ' blocked · ' + blockedSamples + ' of ' + targetSamples + ' receiver samples';
		for ( const [ object, count ] of coverage.blockers ) {

			const item = document.createElement( 'li' );
			const button = document.createElement( 'button' );
			button.type = 'button';
			button.textContent = ( object.name || object.type ) + ' · ' + percent( count );
			button.title = 'Select and frame obstruction';
			button.onclick = () => { editor.select( object ); editor.focus( object ); };
			item.append( button );
			list.append( item );

		}

	} );
	host.append( report );

}
