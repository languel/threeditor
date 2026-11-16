import { UIButton, UIDiv, UISelect, UIText } from './libs/ui.js';
import { LoopOnce } from 'three';
import { hasRestriction } from './ObjectRestrictions.js';

export function SidebarAnimationClips( editor ) {

	const container = new UIDiv().setClass( 'imported-clips' );
	const select = new UISelect();
	select.dom.setAttribute( 'aria-label', 'Imported animation' );
	const position = document.createElement( 'input' );
	position.type = 'range';
	position.min = 0;
	position.step = 'any';
	position.setAttribute( 'aria-label', 'Imported animation time' );
	const time = new UIText();
	let root, action;

	const currentClip = () => root?.animations.find( animation => animation.uuid === select.getValue() );

	function stop() {

		if ( action ) action.stop();
		action = null;
		position.value = 0;
		time.setValue( '0.00 s' );

	}

	function ensureAction() {

		if ( action ) return action;
		const clip = currentClip();
		if ( ! clip || hasRestriction( root, 'disabled' ) ) return null;
		action = editor.mixer.clipAction( clip, root );
		action.setLoop( LoopOnce, 1 );
		action.clampWhenFinished = true;
		return action.play();

	}

	select.onChange( () => {

		stop();
		position.max = currentClip()?.duration || 0;

	} );
	container.add( select,
		new UIButton( 'Play clip' ).onClick( () => {

			const clipAction = ensureAction();
			if ( ! clipAction ) return;
			if ( clipAction.time >= clipAction.getClip().duration ) clipAction.reset().play();
			clipAction.paused = false;

		} ),
		new UIButton( 'Pause' ).onClick( () => { if ( action ) action.paused = true; } ),
		new UIButton( 'Stop' ).onClick( () => { stop(); editor.signals.timelineFrameChanged.dispatch(); } ),
		new UIButton( 'Add to timeline' ).onClick( () => {

			const clip = currentClip();
			if ( ! clip ) return;
			stop();
			editor.timeline?.addImported( root, clip );
			editor.timeline?.reveal?.();

		} ),
		time
	);
	container.dom.appendChild( position );
	position.oninput = () => {

		const clipAction = ensureAction();
		if ( ! clipAction ) return;
		clipAction.paused = true;
		clipAction.time = position.valueAsNumber;
		editor.mixer.update( 0 );
		editor.signals.timelineFrameChanged.dispatch();

	};

	editor.signals.objectSelected.add( object => {

		stop();
		root = object;
		const clips = root?.animations || [];
		select.setOptions( Object.fromEntries( clips.map( ( clip, index ) => [ clip.uuid, clip.name || 'Clip ' + ( index + 1 ) ] ) ) );
		select.setValue( clips[ 0 ]?.uuid || '' );
		position.max = currentClip()?.duration || 0;

	} );
	for ( const signal of [ editor.signals.editorCleared, editor.signals.startPlayer, editor.signals.timelinePlaybackStarted ] ) signal.add( stop );
	editor.signals.objectChanged.add( ( object, attribute ) => {

		if ( attribute === 'userData' && root && hasRestriction( root, 'disabled' ) ) stop();

	} );
	editor.signals.sceneRendered.add( () => {

		if ( ! action ) return;
		position.value = action.time;
		time.setValue( action.time.toFixed( 2 ) + ' s' );

	} );
	return container;

}
