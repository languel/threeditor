// Editor-only restrictions are stored in userData so project JSON and editable
// HTML retain them. Visibility itself remains the standard three.js property.
function hasRestriction( object, key ) {
 for ( let current=object; current; current=current.parent ) if ( current.userData?.threeditor?.[ key ] === true ) return true;
 return false;
}
function isVisible( object ) {
 for ( let current=object; current; current=current.parent ) if ( current.visible === false ) return false;
 return true;
}
export { hasRestriction, isVisible };
