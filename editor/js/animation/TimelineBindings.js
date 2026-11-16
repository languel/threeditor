import { hasRestriction } from '../ObjectRestrictions.js';
import { DEFAULT_POSTPROCESSING } from '../PostProcessing.js';
import { scriptParams, scriptParamValue } from '../ScriptParams.js';

const properties = new Set( [
	'position', 'rotation', 'scale', 'visible', 'renderOrder', 'color', 'groundColor', 'intensity', 'distance', 'decay',
	'angle', 'penumbra', 'width', 'height', 'fov', 'zoom', 'near', 'far', 'left', 'right', 'top', 'bottom',
	'opacity', 'emissive', 'emissiveIntensity', 'roughness', 'metalness', 'shininess', 'specular', 'reflectivity',
	'ior', 'transmission', 'thickness', 'clearcoat', 'clearcoatRoughness', 'iridescence', 'iridescenceIOR', 'sheen',
	'sheenColor', 'sheenRoughness', 'specularColor', 'specularIntensity', 'attenuationColor', 'attenuationDistance',
	'aoMapIntensity', 'lightMapIntensity', 'envMapIntensity', 'bumpScale', 'displacementScale', 'displacementBias',
	'normalScale', 'clearcoatNormalScale', 'alphaTest', 'size', 'linewidth', 'dashSize', 'gapSize', 'wireframe',
	'transparent', 'depthWrite', 'depthTest', 'sizeAttenuation', 'backgroundIntensity', 'backgroundBlurriness',
	'environmentIntensity', 'environmentRotation', 'backgroundRotation', 'background', 'castShadow', 'receiveShadow',
	'blur', 'radius', 'bias', 'normalBias', 'name', 'dispersion', 'iridescenceThicknessMinimum',
	'iridescenceThicknessMaximum', 'clipShadows', 'shadowSide', 'alphaHash', 'alphaToCoverage', 'forceSinglePass', 'combine',
	'frustumCulled', 'vertexColors', 'flatShading', 'toneMapped', 'premultiplyAlpha', 'colorSpace'
] );
const discrete = new Set( [
	'name', 'renderOrder', 'side', 'shadowSide', 'blending', 'depthPacking', 'depthFunc', 'combine', 'normalMapType',
	'blendSrc', 'blendDst', 'blendEquation', 'blendSrcAlpha', 'blendDstAlpha', 'blendEquationAlpha',
	'stencilFunc', 'stencilRef', 'stencilFuncMask', 'stencilWriteMask', 'stencilFail', 'stencilZFail', 'stencilZPass',
	'mapping', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'anisotropy', 'colorSpace'
] );
const textureFields = [ 'offset', 'repeat', 'center', 'rotation', 'mapping', 'wrapS', 'wrapT',
	'minFilter', 'magFilter', 'anisotropy', 'premultiplyAlpha', 'colorSpace' ];
const materialProgram = new Set( [ 'transparent', 'alphaTest', 'alphaHash', 'alphaToCoverage', 'side', 'forceSinglePass',
	'vertexColors', 'flatShading', 'toneMapped', 'sizeAttenuation', 'depthPacking', 'wireframe' ] );

const scriptFields = new WeakMap();

function fieldsOf( script ) {

	let entry = scriptFields.get( script );
	if ( ! entry || entry.source !== script.source ) {

		entry = { source: script.source, fields: scriptParams( script.source ).filter( field => ! field.initializer ) };
		scriptFields.set( script, entry );

	}
	return entry.fields;

}

const projection = new Set( [ 'fov', 'zoom', 'near', 'far', 'left', 'right', 'top', 'bottom' ] );
const transforms = new Set( [ 'position', 'rotation', 'scale' ] );
const reserved = new Set( [ 'id', 'uuid', 'type', 'version', 'needsUpdate', '__proto__', 'constructor', 'prototype' ] );

function readValue( value ) {

	if ( value?.isColor ) return '#' + value.getHexString();
	if ( value?.isEuler ) return [ value.x, value.y, value.z ];
	if ( value?.isVector2 || value?.isVector3 || value?.isVector4 ) return value.toArray();
	if ( value === Infinity || value === - Infinity ) return String( value );
	if ( Number.isFinite( value ) || typeof value === 'boolean' || typeof value === 'string' ) return value;

}

function assign( owner, name, value ) {

	const current = owner[ name ];
	if ( current?.isColor ) current.set( value );
	else if ( current?.isEuler ) current.set( ...value, current.order );
	else if ( current?.isVector2 || current?.isVector3 || current?.isVector4 ) current.fromArray( value );
	else owner[ name ] = typeof current === 'number' ? Number( value ) : value;

}

function slots( object ) {

	return Array.isArray( object.material ) ? object.material : object.material ? [ object.material ] : [];

}

function addProperties( items, source, target, prefix = '', keys ) {

	if ( ! source ) return;
	for ( const property of keys || new Set( [ ...Object.keys( source ), ...properties, ...discrete ] ) ) {

		// Include custom scalar and vector controls without exposing identity or renderer flags.
		const value = source[ property ];
		if ( reserved.has( property ) || property.startsWith( '_' ) ||
			( ! properties.has( property ) && ! discrete.has( property ) &&
				( typeof value === 'string' || typeof value === 'boolean' && property.startsWith( 'is' ) ) ) ) continue;
		if ( readValue( value ) !== undefined ) items.push( { ...target, property, label: prefix + property } );

	}

}

export function discreteTarget( target ) {

	return discrete.has( target.property ) && target.kind !== 'script' && target.kind !== 'uniform';

}

export function availableTargets( object, scripts ) {

	if ( ! object ) return [];
	const items = [];
	const id = object.uuid;
	addProperties( items, object, { object: id, kind: 'object' } );
	addProperties( items, object.shadow, { object: id, kind: 'shadow' }, 'Shadow · ', [ 'intensity', 'bias', 'normalBias', 'radius' ] );
	addProperties( items, object.fog, { object: id, kind: 'fog' }, 'Fog · ', [ 'color', 'near', 'far', 'density' ] );
	addProperties( items, object.geometry, { object: id, kind: 'geometry' }, 'Geometry · ', [ 'name' ] );
	slots( object ).forEach( ( material, slot ) => {

		if ( ! material ) return;
		addProperties( items, material, { object: id, kind: 'material', slot }, 'Material ' + ( slot + 1 ) + ' · ' );
		for ( const [ map, texture ] of Object.entries( material ) ) {

			if ( texture?.isTexture ) addProperties( items, texture, { object: id, kind: 'texture', slot, map },
				'Material ' + ( slot + 1 ) + ' · ' + map + ' · ', textureFields );

		}
		for ( const [ property, uniform ] of Object.entries( material.uniforms || {} ) ) {

			if ( ! reserved.has( property ) && readValue( uniform.value ) !== undefined ) items.push( { object: id, kind: 'uniform', slot, property, label: 'Uniform · ' + property } );

		}

	} );
	( scripts[ id ] || [] ).forEach( ( script, index ) => {

		if ( script.generated || script.enabled === false ) return;
		for ( const field of fieldsOf( script ) ) {

			items.push( { object: id, kind: 'script', index, scriptId: script.timelineId, property: field.name, label: script.name + ' · ' + ( field.label || field.name ) } );

		}

	} );
	if ( object.isScene ) for ( const property of Object.keys( DEFAULT_POSTPROCESSING ) ) items.push( { object: id, kind: 'effect', property, label: 'Effects · ' + property } );
	for ( let index = 0; index < ( object.morphTargetInfluences?.length || 0 ); index ++ ) {

		const label = Object.keys( object.morphTargetDictionary || {} ).find( name => object.morphTargetDictionary[ name ] === index );
		items.push( { object: id, kind: 'morph', property: String( index ), label: 'Morph · ' + ( label || index + 1 ) } );

	}
	return items;

}

export function timelineBinding( context, target ) {

	const object = context.object( target.object );
	const { kind, property } = target;
	if ( ! object || hasRestriction( object, 'disabled' ) || reserved.has( property ) ) return;
	if ( kind === 'script' ) {

		const scripts = context.scripts[ object.uuid ] || [];
		const index = target.scriptId ? scripts.findIndex( script => script.timelineId === target.scriptId ) : target.index;
		const script = scripts[ index ];
		if ( ! script || script.enabled === false || ! fieldsOf( script ).some( field => field.name === property ) ) return;
		return {
			transient: true,
			read: () => context.getParam( object.uuid, index, property ),
			write: value => context.setParam( object.uuid, index, property, value )
		};

	}
	if ( kind === 'effect' && object.isScene && Object.hasOwn( DEFAULT_POSTPROCESSING, property ) ) return {

		read: () => object.userData.postprocessing?.[ property ] ?? DEFAULT_POSTPROCESSING[ property ],
		write: value => { object.userData = { ...object.userData, postprocessing: { ...object.userData.postprocessing, [ property ]: value } }; }

	};

	const material = slots( object )[ target.slot ];
	const uniform = kind === 'uniform' ? material?.uniforms?.[ property ] : null;
	const texture = kind === 'texture' && textureFields.includes( property ) && material?.[ target.map ];
	const owner = { object, material, uniform, texture, geometry: object.geometry, shadow: object.shadow, fog: object.fog,
		morph: object.morphTargetInfluences }[ kind ];
	const name = uniform ? 'value' : property;
	if ( ! owner || ( ! Object.hasOwn( owner, name ) && ! properties.has( name ) && ! discrete.has( name ) ) ||
		readValue( owner[ name ] ) === undefined ) return;
	return {
		read: () => readValue( owner[ name ] ),
		write: value => {

			assign( owner, name, value );
			if ( kind === 'object' && transforms.has( property ) ) object.updateMatrix();
			if ( kind === 'object' && projection.has( property ) ) object.updateProjectionMatrix?.();
			if ( kind === 'material' && materialProgram.has( property ) ) material.needsUpdate = true;
			if ( texture?.isTexture && ( discrete.has( property ) || property === 'premultiplyAlpha' ) ) texture.needsUpdate = true;
			if ( texture?.isTexture && property === 'colorSpace' ) material.needsUpdate = true;

		}
	};

}

export function authoredParam( scripts, uuid, index, property ) {

	const script = scripts[ uuid ]?.[ index ];
	const field = script && fieldsOf( script ).find( field => field.name === property );
	return field ? scriptParamValue( script, field ) : undefined;

}
