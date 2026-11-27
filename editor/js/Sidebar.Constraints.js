import { MathUtils } from 'three';
import { hasRestriction } from './ObjectRestrictions.js';
import { UIPanel } from './libs/ui.js';
import { icon } from './Glyphs.js';
import { armatureOf } from './rigging/Armature.js';
import { addTimelineKey } from './animation/TimelineKeyControl.js';
import {
	AXES, canOwnConstraints, constraintSettings, constraintSpaces, constraintTypes, distanceModes, eulerOrders, resolveConstraint, trackAxes
} from './rigging/ArmatureConstraints.js';
import { setChildInverse, setConstraintStack, switchConstraintParent } from './rigging/ArmatureTools.js';

const labels = {
	world: 'World Space', local: 'Local Space', pose: 'Pose Space',
	replace: 'Replace', add: 'Add', before: 'Before Original', after: 'After Original', multiply: 'Multiply',
	inside: 'Inside', outside: 'Outside', surface: 'On Surface'
};

export function SidebarConstraints( editor, run ) {

	const objectMode = ! run;
	const report = document.createElement( 'output' );
	report.setAttribute( 'aria-live', 'polite' );
	run ??= action => {

		report.textContent = '';
		try { action(); }
		catch ( error ) { report.textContent = error.message; }

	};
	const heading = objectMode ? 'Object Constraints' : 'Bone Constraints';

	const panel = new UIPanel().setClass( 'bone-constraints' );
	const section = document.createElement( 'details' );
	const title = document.createElement( 'summary' );
	title.textContent = heading;
	section.append( title );
	panel.dom.append( section );
	if ( objectMode ) panel.dom.append( report );
	const body = document.createElement( 'div' );
	section.append( body );

	let owner, saved, active, context;

	function append( type, label, host ) {

		const input = document.createElement( type );
		input.setAttribute( 'aria-label', label );
		if ( host ) host.append( input );
		return input;

	}

	function select( label, items, value, change ) {

		const input = append( 'select', label );
		input.className = 'Select';
		input.replaceChildren( ...items.map( ( [ key, text ] ) => new Option( text, key ) ) );
		input.value = value;
		input.onchange = () => change( input.value );
		return input;

	}

	function row( host, label, ...controls ) {

		const element = document.createElement( 'div' );
		element.className = 'Row';
		const name = document.createElement( 'span' );
		name.className = 'Label';
		name.textContent = label;
		element.append( name, ...controls );
		host.append( element );

	}

	function field( label, type, value, onChange, options = {} ) {

		const input = append( 'input', label );
		input.type = type;
		input.className = 'Input';
		Object.assign( input, options );
		if ( type === 'checkbox' ) input.checked = value;
		else input.value = value;
		input.onchange = () => onChange( type === 'checkbox' ? input.checked : type === 'number' ?
			( input.value === '' ? null : input.valueAsNumber ) : input.value );
		return input;

	}

	function button( label, glyph, disabled, onClick ) {

		const input = append( 'button', label );
		input.type = 'button';
		input.title = label;
		input.innerHTML = icon( glyph );
		input.disabled = disabled;
		input.onclick = onClick;
		return input;

	}

	function stack() {

		const current = owner?.userData.armatureConstraints;
		return Array.isArray( current ) ? current.filter( entry => constraintSettings( entry ) ) : [];

	}

	function commit( value, index, autoKey ) {

		run( () => {

			try {

				const next = setConstraintStack( editor, owner, value, { autoKey } );
				active = next[ index ]?.id;
				saved = owner.userData.armatureConstraints;

			} finally {

				draw();

			}

		} );

	}

	function draw() {

		body.replaceChildren();
		if ( ! owner ) return;
		const items = stack();
		title.textContent = items.length ? heading + ' (' + items.length + ')' : heading;
		const locked = hasRestriction( owner, 'locked' ) || hasRestriction( owner, 'disabled' );
		const dynamic = owner.userData.armaturePhysics?.mode === 'dynamic';
		const fieldset = append( 'fieldset', 'Constraint settings', body );
		fieldset.disabled = locked;
		const withRow = ( label, ...fields ) => row( fieldset, label, ...fields );
		const add = select( objectMode ? 'Add Object Constraint' : 'Add Bone Constraint',
			[ [ '', 'Add Constraint…' ], ...Object.entries( constraintTypes ).map( ( [ type, value ] ) => [ type, value.label ] ) ], '',
			type => { if ( type ) commit( [ ...stack(), { type } ], items.length ); } );
		add.disabled = dynamic;
		withRow( 'Add', add );
		const index = Math.max( 0, items.findIndex( item => item.id === active ) );
		const current = constraintSettings( items[ index ] );
		if ( ! current ) return;
		active = current.id;
		const set = patch => commit( stack().map( item => item.id === current.id ? { ...item, ...patch } : item ), index, Object.hasOwn( patch, 'influence' ) );
		const shift = by => {

			const reordered = stack();
			[ reordered[ index ], reordered[ index + by ] ] = [ reordered[ index + by ], reordered[ index ] ];
			commit( reordered, index + by );

		};
		withRow( 'Stack', select( 'Constraint', items.map( ( item, i ) => [ item.id, ( i + 1 ) + '. ' + item.name ] ), current.id, id => {

			active = id;
			draw();

		} ), button( 'Move Constraint Up', 'up', ! index, () => shift( - 1 ) ),
		button( 'Move Constraint Down', 'down', index === items.length - 1, () => shift( 1 ) ),
		button( 'Remove Constraint', 'remove', false, () => commit( stack().filter( item => item.id !== current.id ), Math.min( index, items.length - 2 ) ) ) );
		withRow( 'Name', field( 'Constraint Name', 'text', current.name, name => set( { name } ) ) );
		const influence = field( 'Constraint Influence', 'number', current.influence, value => set( { influence: value } ), { min: 0, max: 1, step: .05 } );
		withRow( 'Influence', influence, field( 'Mute Constraint', 'checkbox', current.muted, muted => set( { muted } ), { title: 'Mute Constraint' } ) );
		const keyTarget = { kind: 'constraint', object: owner.uuid, constraintId: current.id, property: 'influence' };
		addTimelineKey( editor, influence, 'Constraint Influence', () => keyTarget, { display: value => { influence.value = value; } } );
		const definition = constraintTypes[ current.type ];
		const pick = ( label, key, values ) => select( label, values.map( value => [ value, labels[ value ] ?? value ] ), current[ key ], value => set( { [ key ]: value } ) );
		const result = resolveConstraint( editor.scene, owner, current );
		if ( definition.target ) {

			const options = [ [ '', 'None' ] ];
			editor.scene.traverse( object => {

				if ( object === editor.scene || object.userData.runtimeOnly || owner.getObjectById( object.id ) ||
					hasRestriction( object, 'disabled' ) || current.targetSpace === 'pose' && ! armatureOf( object ) ) return;
				const label = object.isBone ? ( armatureOf( object )?.name || 'Bone' ) + ' / ' + object.name : object.name || object.type;
				options.push( [ object.uuid, label ] );

			} );
			if ( current.target && ! options.some( ( [ id ] ) => id === current.target ) ) options.push( [ current.target, 'Unavailable Target' ] );
			withRow( 'Target', select( 'Constraint Target', options, current.target, target => set( current.type === 'childOf' ? { target, inverse: null } : { target } ) ) );
			if ( result.target?.isBone && definition.channel !== 'rotation' && definition.channel !== 'scale' ) {

				withRow( 'Head / Tail', field( 'Target Head to Tail', 'number', current.headTail, headTail => set( current.type === 'childOf' ? { headTail, inverse: null } : { headTail } ), { min: 0, max: 1, step: .05 } ) );

			}

		}
		if ( definition.channel ) {

			withRow( 'Owner', pick( 'Owner Space', 'ownerSpace', armatureOf( owner ) ? constraintSpaces : constraintSpaces.slice( 0, 2 ) ) );
			if ( definition.target ) withRow( 'Target Space', pick( 'Target Space', 'targetSpace', constraintSpaces ) );

		}
		if ( definition.mixes ) {

			for ( const [ key, label ] of [ [ 'axes', 'Axes' ], [ 'invert', 'Invert' ] ] ) {

				const fields = Array.from( AXES, axis => {

					const toggle = document.createElement( 'label' );
					toggle.append( field( label + ' ' + axis, 'checkbox', current[ key ].includes( axis ), checked => {

						const value = Array.from( AXES ).filter( other => other === axis ? checked : current[ key ].includes( other ) ).join( '' );
						set( { [ key ]: value } );

					} ), axis );
					return toggle;

				} );
				withRow( label, ...fields );

			}
			withRow( 'Mix', pick( 'Constraint Mix', 'mix', definition.mixes ) );

		}
		if ( definition.channel === 'rotation' ) withRow( 'Euler Order', pick( 'Constraint Euler Order', 'order', eulerOrders ) );
		if ( definition.limit ) {

			const rotation = definition.channel === 'rotation';
			for ( const [ key, label ] of [ [ 'min', 'Minimum' ], [ 'max', 'Maximum' ] ] ) {

				withRow( label, ...current[ key ].map( ( value, i ) => field( label + ' ' + AXES[ i ], 'number',
					rotation && value !== null ? MathUtils.radToDeg( value ) : value ?? '', input => {

						const limits = current[ key ].slice();
						limits[ i ] = rotation && input !== null ? MathUtils.degToRad( input ) : input;
						set( { [ key ]: limits } );

					}, { placeholder: AXES[ i ] + ( rotation ? '°' : '' ), step: 'any' } )
				) );

			}

		}
		if ( current.type === 'dampedTrack' ) withRow( 'Track Axis', pick( 'Track Axis', 'trackAxis', trackAxes ) );
		if ( current.type === 'limitDistance' ) {

			withRow( 'Mode', pick( 'Distance Mode', 'mode', distanceModes ) );
			withRow( 'Distance', field( 'Distance', 'number', current.distance, distance => set( { distance } ), { min: 0, step: 'any' } ) );

		}
		if ( current.type === 'childOf' ) {

			const actions = document.createElement( 'div' );
			actions.className = 'constraint-parent-actions';
			for ( const [ label, action, disabled ] of [
				[ 'Set Inverse', () => setChildInverse( editor, owner, current.id ), ! result.target ],
				[ 'Clear Inverse', () => setChildInverse( editor, owner, current.id, true ), ! current.inverse ],
				[ 'Switch Parent', () => switchConstraintParent( editor, owner, current.id ), ! result.target ]
			] ) {

				const button = document.createElement( 'button' );
				button.type = 'button';
				button.className = 'Button';
				button.textContent = label;
				button.disabled = disabled;
				button.onclick = () => run( action );
				actions.append( button );

			}
			withRow( 'Parent', actions );

		}
		if ( result.error ) {

			const output = append( 'output', 'Constraint Status', fieldset );
			output.textContent = result.error;

		}

	}

	panel.setObject = object => {

		const next = canOwnConstraints( object ) && ( objectMode ? ! object.isBone : object.isBone ) ? object : null;
		const nextStack = next?.userData.armatureConstraints;
		const nextContext = next && [ hasRestriction( next, 'locked' ), hasRestriction( next, 'disabled' ), next.userData.armaturePhysics?.mode ].join( '/' );
		if ( next === owner && nextStack === saved && context === nextContext ) return;
		if ( next !== owner ) {

			active = null;
			section.open = objectMode || Array.isArray( nextStack ) && nextStack.length > 0;

		}
		owner = next;
		saved = nextStack;
		context = nextContext;
		panel.setDisplay( owner ? '' : 'none' );
		draw();

	};
	editor.signals.sceneGraphChanged.add( () => { if ( owner && section.open ) draw(); } );
	if ( objectMode ) {

		editor.signals.objectSelected.add( panel.setObject );
		editor.signals.objectChanged.add( object => { if ( object === owner ) panel.setObject( object ); } );
		panel.setObject( editor.selected );

	}
	return panel;

}
