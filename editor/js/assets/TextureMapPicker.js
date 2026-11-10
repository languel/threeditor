const maps = {
	map: 'Color map', normalMap: 'Normal map', roughnessMap: 'Roughness map',
	metalnessMap: 'Metalness map', aoMap: 'Ambient occlusion map', emissiveMap: 'Emissive map',
	alphaMap: 'Alpha map', bumpMap: 'Bump map', displacementMap: 'Displacement map',
	envMap: 'Environment map', lightMap: 'Light map', matcap: 'Matcap', gradientMap: 'Gradient map',
	specularMap: 'Specular map', specularColorMap: 'Specular color map', specularIntensityMap: 'Specular intensity map',
	clearcoatMap: 'Clearcoat map', clearcoatNormalMap: 'Clearcoat normal map', clearcoatRoughnessMap: 'Clearcoat roughness map',
	transmissionMap: 'Transmission map', thicknessMap: 'Thickness map', sheenColorMap: 'Sheen color map',
	sheenRoughnessMap: 'Sheen roughness map', iridescenceMap: 'Iridescence map', iridescenceThicknessMap: 'Iridescence thickness map',
	anisotropyMap: 'Anisotropy map'
};

export function chooseTextureMap( object, initialSlot ) {

	const materials = [].concat( object?.material || [] );
	const slots = materials.flatMap( ( material, index ) => {

		const options = Object.entries( maps ).filter( ( [ name ] ) => material && name in material );
		return options.length ? [ { material, index, options } ] : [];

	} );
	if ( ! slots.length ) throw new Error( 'Select an object with a material that supports textures.' );

	return new Promise( resolve => {

		const dialog = document.createElement( 'dialog' );
		dialog.className = 'project-save-dialog texture-map-picker';
		dialog.setAttribute( 'aria-label', 'Choose texture map' );
		const heading = document.createElement( 'h2' );
		heading.textContent = 'Choose texture map';
		const target = document.createElement( 'p' );
		target.textContent = object.name || object.type;
		const actions = document.createElement( 'div' );
		actions.className = 'texture-map-options';
		const select = document.createElement( 'select' );
		select.setAttribute( 'aria-label', 'Material slot' );
		for ( const { material, index } of slots ) select.add( new Option( ( index + 1 ) + ' · ' + ( material.name || material.type ), index ) );
		select.value = String( slots.some( slot => slot.index === initialSlot ) ? initialSlot : slots[ 0 ].index );
		function finish( choice ) {

			dialog.close();
			dialog.remove();
			resolve( choice );

		}
		function draw() {

			actions.replaceChildren();
			const { index, material, options } = slots.find( slot => slot.index === Number( select.value ) );
			for ( const [ map, label ] of options ) {

				const button = document.createElement( 'button' );
				button.type = 'button';
				button.textContent = label;
				button.onclick = () => finish( { map, materialSlot: index, material } );
				actions.append( button );

			}

		}
		select.onchange = draw;
		draw();
		const plane = document.createElement( 'button' );
		plane.type = 'button';
		plane.textContent = 'Add as textured plane';
		plane.onclick = () => finish( { plane: true } );
		const cancel = document.createElement( 'button' );
		cancel.type = 'button';
		cancel.textContent = 'Cancel';
		cancel.onclick = () => finish();
		dialog.addEventListener( 'keydown', event => event.stopPropagation() );
		dialog.addEventListener( 'cancel', event => { event.preventDefault(); finish(); } );
		dialog.append( heading, target );
		if ( slots.length > 1 ) dialog.append( select );
		dialog.append( actions, plane, cancel );
		document.body.append( dialog );
		dialog.showModal();

	} );

}
