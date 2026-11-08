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

export function mathScript( input ) {
	const definition = mathDefinition( input );
	const headers = '// Editable mathematical asset. No viewer camera, lights or controls are imported.\n// @param resolution = 64 (8..160)\n// @param bounds = 1.6 (0.2..10)\n';
	const body = definition.glsl ? `const distanceFunction = ${ JSON.stringify( definition.glsl ) };\nconst geometry = new THREE.BoxGeometry(params.bounds*2, params.bounds*2, params.bounds*2);\nconst material = (${ sdfMaterial.toString() })(THREE, distanceFunction, params.bounds);` : `const evaluate = ${ definition.parametric_fn };\nconst geometry = (${ parametricGeometry.toString() })(THREE, evaluate, ${ JSON.stringify( definition.parameters || {} ) }, params.resolution);\nconst material = new THREE.MeshNormalMaterial({side:THREE.DoubleSide});`;
	return { name: definition.glsl ? 'SDF code object' : 'Parametric code object', assetBehavior: 'math', enabled: true, source: headers + `\n// ${ String( definition.title || 'Mathematical surface' ).replace( /[\r\n]/g, ' ' ) }\nfunction init() {\n${ body }\nthis.geometry?.dispose(); this.material?.dispose(); this.geometry=geometry; this.material=material;\n}\n` };
}
