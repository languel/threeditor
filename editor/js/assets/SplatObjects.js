import { scanFileKind } from './ScanFiles.js';

export async function isGaussianSplatFile( file ) {

	return !! file?.name && await scanFileKind( file ) === 'splat';

}

export function splatFileType( name = '' ) {

	return String( name ).match( /\.(ply|spz|sog|rad|splat)(?:[?#]|$)/i )?.[ 1 ].toLowerCase() || 'spz';

}

// The original .splat format is a series of 32-byte little-endian Gaussian records.
export function splatBytesToPLY( buffer ) {

	if ( ! buffer.byteLength || buffer.byteLength % 32 !== 0 ) throw new Error( 'Invalid .splat record length.' );
	const count = buffer.byteLength / 32;
	const fields = [ 'x', 'y', 'z', 'scale_0', 'scale_1', 'scale_2', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'rot_0', 'rot_1', 'rot_2', 'rot_3' ];
	const header = new TextEncoder().encode( 'ply\nformat binary_little_endian 1.0\nelement vertex ' + count + '\n' +
		fields.map( name => 'property float ' + name + '\n' ).join( '' ) + 'end_header\n' );
	const bytes = new Uint8Array( header.length + count * fields.length * 4 );
	bytes.set( header );
	const input = new DataView( buffer );
	const output = new DataView( bytes.buffer, header.length );
	for ( let i = 0; i < count; i ++ ) {

		const offset = i * 32;
		let index = i * fields.length * 4;
		const write = value => { output.setFloat32( index, value, true ); index += 4; };
		for ( let axis = 0; axis < 3; axis ++ ) write( input.getFloat32( offset + axis * 4, true ) );
		for ( let axis = 0; axis < 3; axis ++ ) write( Math.log( Math.max( input.getFloat32( offset + 12 + axis * 4, true ), 1e-10 ) ) );
		for ( let channel = 0; channel < 3; channel ++ ) write( ( input.getUint8( offset + 24 + channel ) / 255 - 0.5 ) / 0.28209479177387814 );
		const alpha = Math.max( 1e-6, Math.min( 1 - 1e-6, input.getUint8( offset + 27 ) / 255 ) );
		write( Math.log( alpha / ( 1 - alpha ) ) );
		for ( let axis = 0; axis < 4; axis ++ ) write( ( input.getUint8( offset + 28 + axis ) - 128 ) / 128 );

	}
	return bytes.buffer;

}

export function splatScript( source, fileType = splatFileType( source ) ) {

	return {
		name: 'Gaussian Splat',
		assetBehavior: 'splat',
		enabled: true,
		source: `// Gaussian Splat loader and display controls (gaussian-splat-lite).
// @param opacity = 1 (0..1)
// @label opacity = "Opacity"
// @slider opacity
// @param color = "#ffffff"
// @label color = "Tint"
// @param maxSh = 3 (0..4)
// @label maxSh = "SH degree"
let splat, active = false, request, current = params;

function cleanupRuntimeChildren() {
 for ( const child of [ ...this.children ] ) {
  if ( child.userData?.runtimeOnly ) {
   child.dispose?.();
   child.geometry?.dispose?.();
   child.material?.dispose?.();
   this.remove( child );
  }
 }
}

function init() {
 active = true;
 this.userData.hasSplat = true;
 cleanupRuntimeChildren.call( this );
 request = new AbortController();
 import( 'gaussian-splat-lite' ).then( async ( { SplatMesh } ) => {
  if ( ! active ) return;
  const response = await fetch( ${ JSON.stringify( source ) }, { signal: request.signal } );
  if ( ! response.ok ) throw new Error( 'Request failed (' + response.status + ')' );
  ${ fileType === 'splat'
		? `const fileBytes = (${ splatBytesToPLY.toString() })( await response.arrayBuffer() );
  const input = { fileBytes, fileType: 'ply' };`
		: `const file = new File( [ await response.blob() ], 'scan.${ fileType }' );
  const input = { file, fileType: ${ JSON.stringify( fileType ) } };` }
  if ( ! active ) return;
  const mesh = new SplatMesh( { ...input, maxSh: Math.round( params.maxSh ) } );
  mesh.name = 'SplatMesh';
  mesh.opacity = current.opacity;
  mesh.recolor.set( current.color );
  mesh.userData.runtimeOnly = true;
  mesh.userData.object = this;
  splat = mesh;
  this.add( mesh );
  await mesh.initialized;
  if ( ! active ) return;
  const box = mesh.getBoundingBox( true, new THREE.Box3() );
  if ( ! box.isEmpty() ) {
   const size = box.getSize( new THREE.Vector3() ), center = box.getCenter( new THREE.Vector3() );
   const bounds = new THREE.Mesh(
    new THREE.BoxGeometry( Math.max( size.x, 0.05 ), Math.max( size.y, 0.05 ), Math.max( size.z, 0.05 ) ),
    new THREE.MeshBasicMaterial( { visible: false } )
   );
   bounds.name = 'SplatBounds';
   bounds.position.copy( center );
   bounds.userData.runtimeOnly = true;
   bounds.userData.object = this;
   this.add( bounds );
  }
  player.requestRender?.();
 } ).catch( error => {
  if ( ! active ) return;
  cleanupRuntimeChildren.call( this );
  splat = null;
  delete this.userData.hasSplat;
  player.reportAssetError?.( 'Gaussian Splat: ' + error.message );
  console.error( 'Gaussian Splat:', error );
 } );
}

function setParameters( next ) {
 current = next;
 if ( ! splat ) return;
 splat.opacity = next.opacity;
 splat.recolor.set( next.color );
 player.requestRender?.();
}

function stop() {
 active = false;
 request?.abort();
 splat = null;
 delete this.userData.hasSplat;
 cleanupRuntimeChildren.call( this );
}
`
	};

}
