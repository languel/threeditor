// Gaussian Splat file detection and editable behavior script powered by gaussian-splat-lite.
const SPLAT_EXTENSIONS = /\.(spz|sog|rad)$/i;

export function splatFileType( name = '' ) {

	const match = String( name ).match( /\.(ply|spz|sog|rad)(?:[?#]|$)/i );
	return match ? match[ 1 ].toLowerCase() : 'spz';

}

export async function isGaussianSplatFile( file ) {

	if ( ! file?.name ) return false;
	if ( SPLAT_EXTENSIONS.test( file.name ) ) return true;
	if ( ! /\.ply$/i.test( file.name ) ) return false;
	try {

		const header = await file.slice( 0, 2048 ).text();
		return header.includes( 'f_dc_0' ) || ( header.includes( 'scale_0' ) && header.includes( 'rot_0' ) );

	} catch {

		return false;

	}

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
let splat, bounds, active = false;

function cleanupRuntimeChildren() {
 for ( const child of [ ...this.children ] ) {
  if ( child.userData?.runtimeOnly ) {
   child.splats?.dispose?.();
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
 import( 'gaussian-splat-lite' ).then( async ( { SplatMesh } ) => {
  if ( ! active ) return;
  const mesh = new SplatMesh( { url: ${ JSON.stringify( source ) }, fileType: ${ JSON.stringify( fileType ) }, maxSh: Math.round( params.maxSh ) } );
  mesh.name = 'SplatMesh';
  mesh.opacity = params.opacity;
  mesh.recolor.set( params.color );
  mesh.userData.runtimeOnly = true;
  mesh.userData.object = this;
  splat = mesh;
  this.add( mesh );
  await mesh.initialized;
  if ( ! active ) { mesh.dispose(); mesh.removeFromParent(); return; }
  const box = mesh.getBoundingBox( true, new THREE.Box3() );
  if ( ! box.isEmpty() ) {
   const size = box.getSize( new THREE.Vector3() ), center = box.getCenter( new THREE.Vector3() );
   bounds = new THREE.Mesh(
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
 } ).catch( error => console.error( 'Gaussian Splat:', error ) );
}

function setParameters( next ) {
 if ( ! splat ) return;
 splat.opacity = next.opacity;
 splat.recolor.set( next.color );
 player.requestRender?.();
}

function stop() {
 active = false;
 splat = null;
 bounds = null;
 cleanupRuntimeChildren.call( this );
}
`
	};

}
