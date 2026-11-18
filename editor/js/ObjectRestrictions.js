// Object restrictions are stored in userData so project JSON and editable
// HTML retain them. Visibility itself remains the standard three.js property.
const viewports = new WeakMap();
function registerViewportVisibility( scene, visibility ) {
 viewports.set( scene, visibility );
}
function hasRestriction( object, key ) {
 for ( let current=object; current; current=current.parent ) if ( current.userData?.threeditor?.[ key ] === true ) return true;
 return false;
}
function isVisible( object ) {
 for ( let current=object; current; current=current.parent ) {
  if ( current.visible === false || current.userData?.threeditor?.disabled === true ) return false;
  if ( ! current.parent && viewports.has( current ) ) return viewports.get( current ).allows( object );
 }
 return true;
}

function withViewportObjects( scene, render ) {

 const state = viewports.get( scene );
 if ( ! state || ! state.local && ! state.hidden.size ) return withEnabledObjects( scene, render );
 const lightAncestors = new Set();
 if ( state.local ) scene.traverseVisible( object => {

  if ( ! object.isLight || state.isHidden( object ) || hasRestriction( object, 'disabled' ) ) return;
  for ( let parent = object.parent; parent && parent !== scene; parent = parent.parent ) lightAncestors.add( parent );

 } );
 const hidden = [], layers = [];
 scene.traverseVisible( object => {

  if ( state.isHidden( object ) ) {
   object.visible = false;
   hidden.push( object );
  } else if ( ! state.inLocalView( object ) && ! object.isLight ) {
   if ( lightAncestors.has( object ) ) {
    layers.push( [ object, object.layers.mask ] );
    object.layers.mask = 0;
   } else {
    object.visible = false;
    hidden.push( object );
   }
  }

 } );
 try {
  return withEnabledObjects( scene, render );
 } finally {
  for ( const object of hidden ) object.visible = true;
  for ( const [ object, mask ] of layers ) object.layers.mask = mask;
 }

}
function withEnabledObjects( scene, render ) {

 const hidden = [];
 scene.traverseVisible( object => {

  if ( object.userData?.threeditor?.disabled !== true ) return;
  object.visible = false;
  hidden.push( object );

 } );
 try {

  return render();

 } finally {

  for ( const object of hidden ) object.visible = true;

 }

}

function withoutRuntimeChildren( root, callback ) {

	const children = new Map();
	function visit( object ) {

		const persistent = object.children.filter( child => ! child.userData.runtimeOnly );
		if ( persistent.length !== object.children.length ) {

			children.set( object, object.children );
			object.children = persistent;

		}
		for ( const child of persistent ) visit( child );

	}
	visit( root );
	try {

		return callback();

	} finally {

		for ( const [ object, original ] of children ) object.children = original;

	}

}

export { hasRestriction, isVisible, registerViewportVisibility, withEnabledObjects, withViewportObjects, withoutRuntimeChildren };
