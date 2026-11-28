import { UIPanel } from './libs/ui.js';
import { hasRestriction, isVisible } from './ObjectRestrictions.js';
import { armatureOf } from './rigging/Armature.js?v=armature-apply';
import { boneCollections, boneCollectionMembers, boneCollectionTree, boneCollectionVisible, boneVisibleInCollections, findBoneCollection } from './rigging/BoneCollections.js';
import { assignBonesToCollection, removeBoneCollection, setBoneCollection } from './rigging/BoneCollectionTools.js';

export function SidebarBoneCollections( editor, run ) {

	const panel = new UIPanel();
	const root = panel.dom;
	root.classList.add( 'bone-collections' );
	const heading = document.createElement( 'strong' );
	heading.textContent = 'Bone Collections';
	const actions = document.createElement( 'div' );
	actions.className = 'bone-collection-actions';
	const list = document.createElement( 'div' );
	list.className = 'bone-collection-list';
	list.setAttribute( 'aria-label', 'Bone collections' );
	const controls = document.createElement( 'div' );
	const fields = document.createElement( 'div' );
	fields.className = 'bone-collection-fields';
	const name = document.createElement( 'input' );
	name.className = 'Input';
	name.setAttribute( 'aria-label', 'Bone collection name' );
	const parent = document.createElement( 'select' );
	parent.className = 'Select';
	parent.setAttribute( 'aria-label', 'Parent bone collection' );
	fields.append( name, parent );
	const membership = document.createElement( 'div' );
	membership.className = 'bone-collection-actions';
	controls.append( fields, membership );
	root.append( heading, actions, list, controls );
	let rig, active, renderedRig, renderedRecords, renderedActive, renderedLocked;

	function button( host, label, action, glyph ) {

		const node = document.createElement( 'button' );
		node.type = 'button';
		node.className = 'Button';
		node.textContent = glyph ?? label;
		if ( glyph ) {

			node.setAttribute( 'aria-label', label );
			node.title = label;

		}
		node.onclick = action;
		host.append( node );
		return node;

	}

	function addCollection( parentId ) {

		run( () => {

			active = setBoneCollection( editor, rig, null, { parent: parentId } ).id;
			update( rig );
			name.focus();
			name.select();

		} );

	}

	function edit( patch ) {

		run( () => setBoneCollection( editor, rig, active, patch ) );

	}

	function selectedBones() {

		return editor.selector.selection.filter( bone => bone.userData.armatureBone && armatureOf( bone ) === rig );

	}

	function selectMembers( selecting ) {

		const members = boneCollectionMembers( rig, findBoneCollection( rig, active ) );
		const selection = selectedBones();
		const visible = members.filter( bone => boneVisibleInCollections( bone ) && isVisible( bone ) && ! hasRestriction( bone, 'unselectable' ) );
		const next = selecting ? [ ...new Set( [ ...selection, ...visible ] ) ] : selection.filter( bone => ! members.includes( bone ) );
		if ( editor.viewTools.armature.mode ) editor.viewTools.armature.part = 'body';
		editor.selector.setSelection( next.length ? next : [ rig ] );

	}

	const add = button( actions, 'Add Collection', () => addCollection( null ) );
	const child = button( actions, 'Add Child Collection', () => addCollection( active ) );
	const up = button( actions, 'Move collection up', () => edit( { direction: 'up' } ), '↑' );
	const down = button( actions, 'Move collection down', () => edit( { direction: 'down' } ), '↓' );
	const remove = button( actions, 'Remove collection', () => run( () => removeBoneCollection( editor, rig, active ) ), '−' );
	const assignments = [ [ 'Assign', 'assign' ], [ 'Unassign', 'remove' ], [ 'Move Here', 'move' ] ].map( ( [ label, operation ] ) =>
		button( membership, label, () => run( () => assignBonesToCollection( editor, rig, active, selectedBones(), operation ) ) ) );
	const select = button( membership, 'Select', () => selectMembers( true ) );
	const deselect = button( membership, 'Deselect', () => selectMembers( false ) );
	name.onchange = () => { if ( name.value !== findBoneCollection( rig, active )?.name ) edit( { name: name.value } ); };
	name.onkeydown = event => { if ( event.key === 'Enter' ) name.blur(); };
	parent.onchange = () => edit( { parent: parent.value || null } );

	function update( object ) {

		if ( rig !== object ) active = null;
		rig = object;
		const collections = boneCollections( rig );
		const tree = boneCollectionTree( rig );
		const collection = findBoneCollection( rig, active ) ?? tree[ 0 ]?.collection;
		active = collection?.id;
		const locked = ! rig || hasRestriction( rig, 'locked' ) || hasRestriction( rig, 'disabled' );
		const siblings = collections.filter( item => item.parent === collection?.parent );
		const siblingIndex = siblings.indexOf( collection );
		add.disabled = locked;
		child.disabled = remove.disabled = locked || ! collection;
		up.disabled = locked || siblingIndex <= 0;
		down.disabled = locked || siblingIndex < 0 || siblingIndex >= siblings.length - 1;
		controls.hidden = ! collection;
		list.hidden = ! collections.length;
		name.disabled = parent.disabled = locked;
		const bones = selectedBones();
		for ( const action of assignments ) action.disabled = locked || ! bones.length;
		select.disabled = deselect.disabled = ! collection?.bones.length;
		if ( renderedRig === rig && renderedRecords === collections && renderedActive === active && renderedLocked === locked ) {

			if ( document.activeElement !== name ) name.value = collection?.name ?? '';
			return;

		}
		const scroll = list.scrollTop;
		let focused;
		const previousFocus = list.contains( document.activeElement ) ? document.activeElement.getAttribute( 'aria-label' ) : null;
		list.replaceChildren();
		for ( const { collection: item, depth } of tree ) {

			const row = document.createElement( 'div' );
			row.className = 'bone-collection-row';
			const choose = button( row, item.name, () => { active = item.id; update( rig ); } );
			choose.style.paddingInlineStart = ( 4 + 12 * Math.min( depth, 10 ) ) + 'px';
			choose.setAttribute( 'aria-label', 'Edit collection ' + item.name );
			choose.setAttribute( 'aria-pressed', String( item.id === active ) );
			choose.title = item.name;
			row.classList.toggle( 'collection-hidden', ! boneCollectionVisible( rig, item ) );
			const eye = button( row, 'Show collection ' + item.name, () => run( () => setBoneCollection( editor, rig, item.id, { visible: ! item.visible } ) ), item.visible ? '◉' : '○' );
			const solo = button( row, 'Solo collection ' + item.name, () => run( () => setBoneCollection( editor, rig, item.id, { solo: ! item.solo } ) ), item.solo ? '★' : '☆' );
			eye.setAttribute( 'aria-pressed', String( item.visible ) );
			solo.setAttribute( 'aria-pressed', String( item.solo ) );
			eye.disabled = solo.disabled = locked;
			focused ??= [ choose, eye, solo ].find( node => node.getAttribute( 'aria-label' ) === previousFocus );
			list.append( row );

		}
		focused?.focus( { preventScroll: true } );
		list.scrollTop = scroll;
		name.value = collection?.name ?? '';
		const excluded = new Set( collection ? [ active, ...boneCollectionTree( rig, active ).map( entry => entry.collection.id ) ] : [] );
		parent.replaceChildren( new Option( 'Top level', '' ), ...tree.filter( entry => ! excluded.has( entry.collection.id ) )
			.map( ( { collection: item, depth } ) => new Option( ' '.repeat( depth ) + item.name, item.id ) ) );
		parent.value = collection?.parent ?? '';
		renderedRig = rig;
		renderedRecords = collections;
		renderedActive = active;
		renderedLocked = locked;

	}

	return { panel, update };

}
