// Import mathematical definitions, never the archive's camera/renderer/control wrapper.
export function mathDefinition( input ) {
	let data = input;
	for ( let i = 0; i < 5 && data && ! data.glsl && ! data.parametric_fn; i ++ ) data = data.asset || data.definition || data.math || data.payload || data.data;
	if ( ! data || ( typeof data.glsl !== 'string' && typeof data.parametric_fn !== 'string' ) ) throw new Error( 'This JSON does not contain an SDF or parametric definition.' );
	return Object.fromEntries( [ 'id', 'title', 'math_type', 'formula', 'glsl', 'parametric_fn', 'parameters' ].filter( key => data[ key ] !== undefined ).map( key => [ key, data[ key ] ] ) );
}

// Self-contained functions are embedded into ordinary editable object scripts.
export function parametricGeometry( THREE, evaluate, parameters, resolution ) {
	const n = Math.max( 8, Math.min( 160, Math.floor( resolution ) ) );
	const positions = [], uvs = [], indices = [], point = new THREE.Vector3();
	const ub = parameters.u_bound, vb = parameters.v_bound;
	for ( let j = 0; j <= n; j ++ ) for ( let i = 0; i <= n; i ++ ) {
		const u = ub === undefined ? i / n * Math.PI * 2 : ( i / n * 2 - 1 ) * ub;
		const v = vb === undefined ? j / n * Math.PI * 2 : ( j / n * 2 - 1 ) * vb;
		evaluate( u, v, point, parameters );
		if ( ! Number.isFinite( point.lengthSq() ) ) throw new Error( 'The parametric function produced an invalid point.' );
		positions.push( point.x, point.y, point.z ); uvs.push( i / n, j / n );
		if ( i < n && j < n ) { const a = j * ( n + 1 ) + i, b = a + n + 1; indices.push( a, b, a + 1, b, b + 1, a + 1 ); }
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	geometry.setIndex( indices ); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
	return geometry;
}

export function sdfMaterial( THREE, distanceFunction, bounds ) {
	return new THREE.ShaderMaterial( {
		side: THREE.BackSide,
		uniforms: { bounds: { value: bounds } },
		vertexShader: `varying vec3 rayOrigin; varying vec3 localPosition;
void main() {
 localPosition = position;
 vec3 origin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
 if (projectionMatrix[3][3] == 1.0) origin = position - normalize((inverse(modelViewMatrix) * vec4(0.0,0.0,-1.0,0.0)).xyz) * 20.0;
 rayOrigin = origin;
 gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
}`,
		fragmentShader: `uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix; uniform float bounds; varying vec3 rayOrigin; varying vec3 localPosition;
${ distanceFunction }
void main() {
 vec3 ro = rayOrigin, rd = normalize(localPosition - ro);
 vec3 lo = (-vec3(bounds)-ro)/rd, hi=(vec3(bounds)-ro)/rd;
 vec3 nearT=min(lo,hi), farT=max(lo,hi);
 float t=max(max(max(nearT.x,nearT.y),nearT.z),0.0);
 float endT=min(min(farT.x,farT.y),farT.z);
 bool hit=false; vec3 p=ro;
 for(int i=0;i<160;i++) {
  p=ro+rd*t; float d=map(p);
  if(abs(d)<0.001) { hit=true; break; }
  t+=max(abs(d)*0.7,0.0004); if(t>endT) break;
 }
 if(!hit || t>endT) discard;
 vec2 e=vec2(0.001,0.0);
 vec3 n=normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));
 vec3 color=vec3(0.35,0.65,0.95)*(0.3+0.7*max(dot(n,normalize(vec3(1.0,2.0,3.0))),0.0));
 vec4 clip = projectionMatrix * modelViewMatrix * vec4(p,1.0);
 #ifdef USE_REVERSED_DEPTH_BUFFER
 gl_FragDepth = clip.z / clip.w;
 #else
 gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
 #endif
 gl_FragColor=vec4(color,1.0);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`
	} );
}

function mathSource( definition, legacy = false ) {
	const fields = definition.parameters || {};
	const title = String( definition.title || 'Mathematical surface' ).replace( /[\r\n]/g, ' ' );
	let headers = '// Editable mathematical asset. No viewer camera, lights or controls are imported.\n';
	if ( legacy || ! definition.glsl ) headers += '// @param resolution = 64 (8..160)\n';
	if ( legacy || definition.glsl ) headers += '// @param bounds = 1.6 (0.2..10)\n';

	let body;
	if ( definition.glsl ) {
		let distanceFunction = definition.glsl;
		let uniforms = '';
		// Bind the known Gyroid formula explicitly. Other GLSL is imported as written.
		if ( ! legacy && definition.id === 'gyroid-minimal-surface' &&
			fields.scale === 2.5 && fields.thickness === 0.22 &&
			distanceFunction.includes( 'vec3 q = p * 2.5;' ) &&
			distanceFunction.includes( ' - 0.22) / 2.5;' ) ) {

			headers += '// @param scale = ' + fields.scale + ' (0.1..10)\n';
			headers += '// @param thickness = ' + fields.thickness + ' (0.01..1)\n';
			distanceFunction = 'uniform float gyroidScale;\nuniform float gyroidThickness;\n' + distanceFunction
				.replace( 'vec3 q = p * 2.5;', 'vec3 q = p * gyroidScale;' )
				.replace( ' - 0.22) / 2.5;', ' - gyroidThickness) / gyroidScale;' );
			uniforms = '\nmaterial.uniforms.gyroidScale = { value: params.scale };\nmaterial.uniforms.gyroidThickness = { value: params.thickness };';

		}

		body = `const distanceFunction = ${ JSON.stringify( distanceFunction ) };\nconst geometry = new THREE.BoxGeometry(params.bounds*2, params.bounds*2, params.bounds*2);\nconst material = (${ sdfMaterial.toString() })(THREE, distanceFunction, params.bounds);${ uniforms }`;
	} else {
		let parameters = JSON.stringify( fields );
		if ( ! legacy ) {
			const overrides = [];
			for ( const name of [ 'u_bound', 'v_bound' ] ) {

				const bound = fields[ name ];
				if ( ! Number.isFinite( bound ) || bound <= 0 ) continue;
				if ( definition.id === 'enneper-minimal-surface' && bound >= 0.1 && bound <= 6 ) {
					headers += 'const ' + name + ' = ' + bound + '; /* 0.1..6 */\n';
					overrides.push( name );
				} else {
					const range = bound >= 0.1 && bound <= 6 ? ' (0.1..6)' : '';
					headers += '// @param ' + name + ' = ' + bound + range + '\n';
					overrides.push( name + ': params.' + name );
				}

			}
			if ( overrides.length ) parameters = '{ ...' + parameters + ', ' + overrides.join( ', ' ) + ' }';
		}
		const evaluator = legacy ? definition.parametric_fn :
			`/** @type {(u: number, v: number, target: import('three').Vector3, parameters: Record<string, number>) => void} */ ( ${ definition.parametric_fn } )`;
		if ( ! legacy ) parameters = `/** @type {Record<string, number>} */ ( ${ parameters } )`;
		body = `const evaluate = ${ evaluator };\nconst geometry = (${ parametricGeometry.toString() })(THREE, evaluate, ${ parameters }, params.resolution);\nconst material = new THREE.MeshNormalMaterial({side:THREE.DoubleSide});`;
	}

	const receiver = legacy ? '' : "/** @this {import('three').Mesh} */\n";
	const cleanup = legacy ? 'this.geometry?.dispose(); this.material?.dispose(); this.geometry=geometry; this.material=material;' :
		'this.geometry?.dispose();\nfor (const previous of [this.material].flat()) previous?.dispose();\nthis.geometry = geometry;\nthis.material = material;';
	return headers + `\n// ${ title }\n${ receiver }function init() {\n${ body }\n${ cleanup }\n}\n`;
}

export function mathScript( input ) {
	const definition = mathDefinition( input );
	return { name: definition.glsl ? 'SDF code object' : 'Parametric code object', assetBehavior: 'math', enabled: true, source: mathSource( definition ) };
}

export function upgradeMathScript( script, definition ) {
	// Upgrade only the original generated source. Edited scripts remain authoritative.
	if ( script.assetBehavior === 'math' && definition && script.source === mathSource( definition, true ) ) {
		script.source = mathSource( definition );
	}
}
