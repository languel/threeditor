// Object restrictions are stored in userData so project JSON and editable
// HTML retain them. Visibility itself remains the standard three.js property.
function hasRestriction( object, key ) {
 for ( let current=object; current; current=current.parent ) if ( current.userData?.threeditor?.[ key ] === true ) return true;
 return false;
}
function isVisible( object ) {
 for ( let current=object; current; current=current.parent ) if ( current.visible === false || current.userData?.threeditor?.disabled === true ) return false;
 return true;
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

export { hasRestriction, isVisible, withEnabledObjects };
