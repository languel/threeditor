import { armatureBones, armatureOf } from './Armature.js?v=armature-apply';

const empty = [];
const indexes = new WeakMap();

export function boneCollections( rig ) {

	return rig?.userData.armature?.collections ?? empty;

}

function collectionIndex( rig ) {

	const collections = boneCollections( rig );
	if ( indexes.has( collections ) ) return indexes.get( collections );
	const byId = new Map( collections.map( collection => [ collection.id, collection ] ) );
	const children = new Map(), memberships = new Map(), visible = new Set();
	const solo = collections.some( collection => collection.solo );
	for ( const collection of collections ) {

		const parent = byId.has( collection.parent ) ? collection.parent : null;
		if ( ! children.has( parent ) ) children.set( parent, [] );
		children.get( parent ).push( collection );
		for ( const bone of collection.bones ) {

			if ( ! memberships.has( bone ) ) memberships.set( bone, [] );
			memberships.get( bone ).push( collection );

		}
		if ( solo ) {

			if ( collection.solo ) visible.add( collection.id );
			continue;

		}
		const seen = new Set();
		let ancestor = collection;
		while ( ancestor && ancestor.visible !== false && ! seen.has( ancestor ) ) {

			seen.add( ancestor );
			ancestor = byId.get( ancestor.parent );

		}
		if ( ! ancestor ) visible.add( collection.id );

	}
	const index = { byId, children, memberships, visible, solo };
	indexes.set( collections, index );
	return index;

}

export function findBoneCollection( rig, idOrName ) {

	return collectionIndex( rig ).byId.get( idOrName ) ?? boneCollections( rig ).find( collection => collection.name === idOrName );

}

export function boneCollectionTree( rig, parent = null ) {

	const { children } = collectionIndex( rig );
	const tree = [], seen = new Set( parent === null ? [] : [ parent ] );
	function visit( id, depth ) {

		for ( const collection of children.get( id ) ?? empty ) {

			if ( seen.has( collection.id ) ) continue;
			seen.add( collection.id );
			tree.push( { collection, depth } );
			visit( collection.id, depth + 1 );

		}

	}
	visit( parent, 0 );
	return tree;

}

export function boneCollectionMembers( rig, collection, includeChildren = false ) {

	if ( ! collection ) return [];
	const bones = new Set( collection.bones );
	if ( includeChildren ) for ( const { collection: child } of boneCollectionTree( rig, collection.id ) ) {

		for ( const bone of child.bones ) bones.add( bone );

	}
	return armatureBones( rig ).filter( bone => bones.has( bone.uuid ) );

}

export function boneCollectionVisible( rig, collection ) {

	return collectionIndex( rig ).visible.has( collection.id );

}

export function boneVisibleInCollections( bone ) {

	if ( ! bone?.userData.armatureBone ) return true;
	const { memberships, visible, solo } = collectionIndex( armatureOf( bone ) );
	const collections = memberships.get( bone.uuid );
	return collections ? collections.some( collection => visible.has( collection.id ) ) : ! solo;

}
