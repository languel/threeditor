// This implementation is copied into the object's editable script, not hidden in a viewer.
const modelBehaviorSource = `function modelBehavior() {
	var mixer, actions = [], panel, timeInput, root = this;
	function configure() {
		if ( ! mixer ) return;
		var phase = actions[0] ? actions[0].time / actions[0].getClip().duration : (params.time || 0);
		mixer.stopAllAction(); actions = [];
		root.traverse(node => { for (const material of [node.material].flat()) if(material) material.wireframe=params.wireframe; });
		var a = root.animations.find( clip => clip.name === params.clipA );
		var b = root.animations.find( clip => clip.name === params.clipB );
		for ( var pair of [ [ a, a === b ? 1 : 1 - params.blend ], [ a === b ? null : b, params.blend ] ] ) {
			if ( ! pair[ 0 ] || pair[ 1 ] <= 0 ) continue;
			var action = mixer.clipAction( pair[ 0 ] );
			action.setLoop( params.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity );
			action.time = phase * pair[0].duration; action.setEffectiveTimeScale(a ? pair[0].duration / a.duration : 1);
			action.clampWhenFinished = ! params.loop; action.setEffectiveWeight( pair[ 1 ] ).play(); actions.push( action );
		}
		mixer.update( 0 );
	}
	function init() {
		mixer = new THREE.AnimationMixer( this ); configure();
		if ( ! params.showControls ) return;
		panel = document.createElement( 'div' ); panel.className = 'asset-engine-controls';
		panel.style.cssText = 'position:absolute;left:12px;top:46px;z-index:5;display:flex;flex-wrap:wrap;gap:6px;max-width:calc(100% - 24px);padding:8px;background:#17191de8;color:white;border-radius:6px;font:12px sans-serif';
		panel.dataset.assetObject = root.uuid;
		panel.setAttribute( 'aria-label', this.name + ' model controls' );
		panel.addEventListener( 'pointerdown', e => e.stopPropagation() ); panel.addEventListener( 'keydown', e => e.stopPropagation() );
		function control( name, type, options = [] ) {
			const captions = { clipA: 'Animation A', clipB: 'Animation B', blend: 'Blend', speed: 'Speed', time: 'Time', playing: 'Play', loop: 'Loop', wireframe: 'Wireframe' };
			const caption = captions[ name ] || name;
			const label = document.createElement( 'label' );
			label.textContent = caption + ' ';

			function setParameter( value ) {
				params[ name ] = value;
				if ( name === 'time' ) {
					const clip = actions[ 0 ]?.getClip();
					if ( clip ) mixer.setTime( params.time * clip.duration );
				} else if ( name !== 'playing' && name !== 'speed' ) {
					configure();
				}
				player.assetParameterChanged?.( root, name, value );
			}

			if ( type === 'select' ) {
				const select = document.createElement( 'select' );
				for ( const option of options ) select.add( new Option( option, option ) );
				select.value = params[ name ];
				select.oninput = () => setParameter( select.value );
				label.append( select );
			} else {
				const input = document.createElement( 'input' );
				input.type = type;
				if ( type === 'checkbox' ) {
					input.checked = params[ name ];
					input.oninput = () => setParameter( input.checked );
				} else {
					input.min = '0';
					input.max = name === 'speed' ? '3' : '1';
					input.step = '0.01';
					input.style.width = '80px';
					input.value = String( params[ name ] );
					input.oninput = () => setParameter( Number( input.value ) );
					if ( name === 'time' ) timeInput = input;
				}
				label.append( input );
			}

			label.lastElementChild.setAttribute( 'aria-label', root.name + ' ' + caption );
			panel.append( label );
		}
		var names = this.animations.map( clip => clip.name );
		if(names.length) { control( 'clipA', 'select', names ); control( 'clipB', 'select', names ); control( 'blend', 'range' ); control( 'speed', 'range' ); control('time', 'range'); control( 'playing', 'checkbox' ); control( 'loop', 'checkbox' ); } control('wireframe', 'checkbox');
		panel.style.top = (46 + player.dom.querySelectorAll('.asset-engine-controls').length * 70) + 'px';
		player.dom.append( panel );
	}
	function update( event ) { if ( params.playing ) mixer?.update( Math.min( event.delta / 1000, 0.1 ) * params.speed ); if(timeInput && actions[0]) timeInput.value=String( actions[0].time / actions[0].getClip().duration ); }
	function stop() { panel?.remove(); mixer?.stopAllAction(); mixer?.uncacheRoot( this ); }
	return { init, update, stop };
}`;
function legacyModelScript( object ) {
	const names = object.animations.map( clip => clip.name );
	return { name: 'Model viewer · animation mixer', assetBehavior: 'model', enabled: true, source: `// Editable model controller. Clip weights blend independently on the original rig.\n// @param clipA = ${ JSON.stringify( names[ 0 ] || '' ) }\n// @options clipA = ${ JSON.stringify( names ) }\n// @param clipB = ${ JSON.stringify( names[ 1 ] || names[ 0 ] || '' ) }\n// @options clipB = ${ JSON.stringify( names ) }\n// @param time = 0 (0..1)\n// @param blend = 0 (0..1)\n// @param speed = 1 (0..3)\n// @param playing = true\n// @param loop = true\n// @param wireframe = false\n// @param showControls = true\nvar behavior = (${ modelBehaviorSource }).call(this);\nvar init = behavior.init, update = behavior.update, stop = behavior.stop;\n` };
}

// Saved projects contain their own copy of the generated model script.
const legacyControl = `function control( name, type, options ) {
			var captions={clipA:'Animation A',clipB:'Animation B',blend:'Blend',speed:'Speed',time:'Time',playing:'Play',loop:'Loop',wireframe:'Wireframe'};
			var caption=captions[name]||name;
			var label = document.createElement( 'label' ); label.textContent = caption + ' ';
			var input = document.createElement( type === 'select' ? 'select' : 'input' );
			input.setAttribute( 'aria-label', root.name + ' ' + caption );
			if ( type === 'select' ) for ( var option of options ) input.add( new Option( option, option ) );
			else { input.type = type; if ( type === 'range' ) { input.min = 0; input.max = name === 'speed' ? 3 : 1; input.step = 0.01; input.style.width = '80px'; } }
			if ( type === 'checkbox' ) input.checked = params[ name ]; else input.value = params[ name ];
			input.oninput = () => { params[ name ] = type === 'checkbox' ? input.checked : type === 'range' ? Number( input.value ) : input.value; if(name === 'time') { const clip=actions[0]?.getClip(); if(clip) mixer.setTime(params.time * clip.duration); } else if ( ! [ 'playing', 'speed' ].includes( name ) ) configure(); player.assetParameterChanged?.( root, name, params[ name ] ); };
			if(name === 'time') timeInput=input;
			label.append( input ); panel.append( label );
		}`;

function repairLegacyModelScript( script ) {
	if ( script.assetBehavior !== 'model' || ! script.source.includes( legacyControl ) ) return;
	const source = modelBehaviorSource;
	const start = source.indexOf( 'function control(' );
	const end = source.indexOf( '\n\t\tvar names', start );
	script.source = script.source.replace( legacyControl, () => source.slice( start, end ) );
	script.source = script.source.replace( 'timeInput.value=actions[0].time/actions[0].getClip().duration', 'timeInput.value=String( actions[0].time / actions[0].getClip().duration )' );
}


// Embedded in the attached script so the controls and animation behavior travel with the model.
function modelMixer( THREE, root, params, morphs ) {

	const mixer = new THREE.AnimationMixer( root );
	const actions = root.animations.map( clip => mixer.clipAction( clip ).play() );
	const targets = morphs.map( ( { uuid, path, name, index, key, rest } ) => {

		const node = root.getObjectByProperty( 'uuid', uuid ) || path.reduce( ( parent, child ) => parent?.children[ child ], root );
		return { influences: node?.name === name ? node.morphTargetInfluences : undefined, index, key, rest, base: /** @type {number | undefined} */ ( undefined ) };

	} );
	let current;

	function applyMorphs( restore = false ) {

		for ( const target of targets ) {

			const { influences, index, key, rest } = target;
			if ( ! influences ) continue;
			if ( restore ) {

				if ( target.base !== undefined ) influences[ index ] = target.base;
				target.base = undefined;

			} else if ( Number.isFinite( current[ key ] ) && current[ key ] !== rest ) {

				target.base = influences[ index ];
				influences[ index ] = current[ key ];

			}

		}

	}

	function setParameters( next ) {

		const seek = next.time !== current?.time;
		applyMorphs( true );
		current = next;
		root.traverse( node => {

			for ( const material of [ node.material ].flat() ) if ( material ) material.wireframe = current.wireframe;

		} );
		actions.forEach( ( action, index ) => {

			action.setLoop( current.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity );
			action.clampWhenFinished = ! current.loop;
			action.setEffectiveWeight( current[ 'mix_' + index ] );
			if ( seek ) {

				action.reset();
				action.time = current.time * action.getClip().duration;

			}

		} );
		mixer.update( 0 );
		applyMorphs();

	}

	function init() {

		for ( const { influences, index, rest } of targets ) if ( influences ) influences[ index ] = rest;
		setParameters( params );

	}

	function update( event ) {

		if ( ! current.playing ) return;
		applyMorphs( true );
		mixer.update( Math.min( event.delta / 1000, 0.1 ) * current.speed );
		applyMorphs();

	}

	function stop() {

		applyMorphs( true );
		mixer.stopAllAction();
		mixer.uncacheRoot( root );

	}

	return { init, update, stop, setParameters };

}

export function modelScript( object ) {

	let source = '// Editable model mixer. Each animation has an independent weight.\n';
	function slider( key, label, value, min, max ) {

		source += `// @param ${ key } = ${ value } (${ min }..${ max })\n// @label ${ key } = ${ JSON.stringify( label ) }\n// @slider ${ key }\n`;

	}

	if ( object.animations.length ) {

		slider( 'speed', 'Speed', 1, 0, 3 );
		slider( 'time', 'Time', 0, 0, 1 );
		source += '// @param playing = true\n// @param loop = true\n';
		object.animations.forEach( ( clip, index ) => {

			slider( 'mix_' + index, ( clip.name || 'Clip ' + ( index + 1 ) ) + ' mix', index === 0 ? 1 : 0, 0, 1 );

		} );

	}

	source += '// @param wireframe = false\n';
	const morphs = [];
	function collectMorphs( node, path ) {

		const names = Object.entries( node.morphTargetDictionary || {} );
		node.morphTargetInfluences?.forEach( ( rest, index ) => {

			const name = names.find( ( [ , targetIndex ] ) => targetIndex === index )?.[ 0 ] || 'Blendshape ' + ( index + 1 );
			const key = 'morph_' + morphs.length;
			slider( key, [ node.name, name ].filter( Boolean ).join( ' · ' ), rest, Math.min( 0, rest ), Math.max( 1, rest ) );
			morphs.push( { uuid: node.uuid, path, name: node.name, index, key, rest } );

		} );
		node.children.forEach( ( child, index ) => collectMorphs( child, [ ...path, index ] ) );

	}
	collectMorphs( object, [] );
	source += `var behavior = (${ modelMixer.toString() })(THREE, this, params, /** @type {{uuid: string, path: number[], name: string, index: number, key: string, rest: number}[]} */ (${ JSON.stringify( morphs ) }));\nvar init = behavior.init, update = behavior.update, stop = behavior.stop, setParameters = behavior.setParameters;\n`;
	return { name: 'Model viewer · animation mixer', assetBehavior: 'model', enabled: true, source };

}

export function upgradeModelScript( script, object ) {

	repairLegacyModelScript( script );
	if ( script.assetBehavior !== 'model' || ! object || script.source !== legacyModelScript( object ).source ) return;

	const { clipA, clipB, blend = 0, showControls, ...values } = script.paramValues || {};
	const clips = object.animations;
	const a = clips.find( clip => clip.name === ( clipA ?? clips[ 0 ]?.name ) );
	const b = clips.find( clip => clip.name === ( clipB ?? clips[ 1 ]?.name ?? clips[ 0 ]?.name ) );
	const mix = Math.max( 0, Math.min( 1, blend ) );
	clips.forEach( ( clip, index ) => {

		values[ 'mix_' + index ] = clip === a ? a === b ? 1 : 1 - mix : clip === b ? mix : 0;

	} );
	script.paramValues = values;
	script.source = modelScript( object ).source;

}
