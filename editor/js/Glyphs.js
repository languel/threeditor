// Glyph interface mode: 24x24 stroke icons (stroke = currentColor, 1.6 width,
// round caps) in the style of ~/dev/artistmodelstudio/src/workbench/icons.js.
// Many paths below are reused from that set; the rest are drawn to match.
// The walker at the bottom swaps labeled chrome for glyphs with hover tips.

const svg = ( inner ) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS = {
	knifeTool: svg( '<path d="m4 20 7-7m0 0L19 3l2 2-6 12-4-4Z"/><path d="M3 7h7m6 13h5" stroke-dasharray="2 2"/>' ),
	surfacePerpendicular: svg( '<path d="m3 16 8-4 10 4-10 5-8-5Zm8-4V3m-3 3 3-3 3 3"/>' ),
	selectBox: svg( '<rect x="4" y="4" width="16" height="16" stroke-dasharray="3 3"/><path d="m9 9 7 3-4 1-1 4-2-8Z"/>' ),
	selectLasso: svg( '<path d="M6 18c-8-11 1-18 12-12 10 8-6 15-12 10-4-4 7-3 5 2-1 3-5 4-7 2"/>' ),
	selectCircle: svg( '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/><path d="M8 12h8m-4-4v8"/>' ),
	selectOperation: svg( '<rect x="3" y="3" width="12" height="12"/><rect x="9" y="9" width="12" height="12" fill="currentColor" fill-opacity=".3"/>' ),
	modifierUp: svg( '<path d="m6 15 6-6 6 6"/>' ),
	modifierDown: svg( '<path d="m6 9 6 6 6-6"/>' ),
	modifiers: svg( '<path d="M14 4a6 6 0 0 0-7 8L3 17a2 2 0 0 0 4 4l5-5a6 6 0 0 0 8-7l-4 4-4-4 4-4Z"/>' ),
	pivotBottom: svg( '<rect x="5" y="3" width="14" height="16" stroke-dasharray="3 2"/><path d="M3 21h18m-9-9v7"/><circle cx="12" cy="19" r="2" fill="currentColor"/>' ),
	// Match Blender's component-selection silhouettes at toolbar size.
	vertexSelect: svg( '<path d="M4 9l5-5h11v11l-5 5H4v-4" opacity=".6"/><rect x="2" y="9" width="5" height="5" fill="currentColor" stroke="none"/>' ),
	edgeSelect: svg( '<path d="M4 20V9l5-5h11v11l-3 3M4 20h5" opacity=".6"/><rect x="11" y="8" width="4" height="14" rx=".5" fill="currentColor" stroke="none"/>' ),
	faceSelect: svg( '<path d="M5 7l3-3h12v12l-3 3" opacity=".6"/><rect x="3" y="8" width="13" height="13" rx=".5" fill="currentColor" stroke="none"/>' ),
	editorTypes: svg( '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M8 8v13m3-4 3-4 4 5"/><circle cx="17" cy="11" r="1"/>' ),
	surfaceBrush: svg( '<path d="m3 16 8-4 10 4-8 5-10-5Z"/><path d="m8 11 7-8 3 3-7 8-3-3Zm0 0-2 4 5-1"/>' ),
	sculptTool: svg( '<path d="m4 18 3-8 6-5 5 3 2 9-7 4-9-3Z"/><path d="m7 10 6 4 5-6m-5 6v7"/>' ),
	sculptGrab: svg( '<path d="M7 12V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-2a1.5 1.5 0 0 1 3 0v5c0 4-2 6-6 6-3 0-5-2-6-4l-3-4a1.5 1.5 0 0 1 2-2z"/>' ),
	sculptPush: svg( '<path d="M3 18h3l6-3 6 3h3M12 4v8m-3-3 3 3 3-3"/>' ),
	sculptSmooth: svg( '<path d="M3 9c3 0 4-4 9-4s6 4 9 4M3 16c3 0 4-4 9-4s6 4 9 4"/>' ),
	sculptRelax: svg( '<path d="m4 7 8 3 8-3M4 17l8-3 8 3m-8-7v4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>' ),
	sculptPinch: svg( '<path d="M3 12h5m-2.5-2.5L8 12l-2.5 2.5m15.5-2.5h-5m2.5-2.5L16 12l2.5 2.5M12 5v14"/>' ),
	sculptTwist: svg( '<path d="M4 13a8 8 0 1 1 8 7c-3 0-5-2-5-5a4 4 0 0 1 4-4c2 0 3 1 3 3l-2 2m0-3v3h3"/>' ),
	topologyPen: svg( '<path d="M3 18V7l9-4 9 7-8 11-10-3Z"/><path d="m3 7 10 7 8-4m-8 4v7"/><circle cx="13" cy="14" r="2" fill="currentColor"/>' ),
	pathDraw: svg( '<path d="M3 18c8 0 1-12 10-12"/><circle cx="3" cy="18" r="2"/><circle cx="13" cy="6" r="2"/><path d="m16 9 5-5 2 2-5 5-3 1 1-3Z"/>' ),
	shapeDraw: svg( '<path d="M3 17 5 5l12-2 4 12-10 6-8-4Z"/><circle cx="5" cy="5" r="1.5" fill="currentColor"/>' ),
	meshBuild: svg( '<path d="m3 7 9-4 9 4v11l-9 3-9-4V7Zm0 0 9 5 9-5m-9 5v9"/><path d="M17 13h6m-3-3v6"/>' ),
	uvIsland: svg( '<path d="m4 7 7-4 8 4-2 12-9 2-4-6Z" stroke-dasharray="2 2"/><path d="m8 9 4-2 3 3-1 6-4 1-2-3Z"/>' ),
	uvPin: svg( '<path d="M9 3h6l-1 6 3 4v2H7v-2l3-4-1-6Zm3 12v6"/>' ),
	uvUnpin: svg( '<path d="M9 3h6l-1 6 3 4v2h-2m-4 0H7v-2l2-2m3 5v5M4 4l16 16"/>' ),
	uvSeam: svg( '<path d="M4 19 19 4M7 5l3 3m2 2 2 2m2 2 3 3"/><circle cx="4" cy="19" r="1.4"/><circle cx="19" cy="4" r="1.4"/>' ),
	eyedropper: svg( '<path d="m15 4 5 5m-3-7 5 5-2 2-1-1-9 9-5 2 2-5 9-9-1-1 2-2ZM4 20l1-1"/>' ),
	pencilSplats: svg( '<path d="M3 19c4-8 7-11 15-14" stroke-dasharray="1 4"/><circle cx="5" cy="13" r="1.2"/><circle cx="12" cy="15" r="1.5"/><circle cx="15" cy="7" r="1.6"/><circle cx="20" cy="5" r="1.1"/>' ),
	freehandDraw: svg( '<path d="M2 19c7-10 7 8 12-2M4 10c1-6 8-6 8-1"/><path d="m13 11 7-8 3 3-7 8-5 2 2-5Z"/>' ),
	weldTool: svg( '<circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="m5 8 6 8m8-8-6 8m-5-5 3 1-1-3m6 2-3 1 1-3"/>' ),
	splitTool: svg( '<path d="M3 18 21 6"/><circle cx="3" cy="18" r="2"/><circle cx="21" cy="6" r="2"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>' ),
	fillTool: svg( '<path d="m3 17 3-12 14 3-3 13-14-4Z" fill="currentColor" fill-opacity=".25"/><path d="m7 13 4 4 6-7"/>' ),
	closeTool: svg( '<path d="M4 7v12h15V7H12" stroke-dasharray="2 2"/><path d="M10 3 6 7l4 4m-4-4h10"/>' ),
	toolActions: svg( '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>' ),

	// Viewport tools and transform settings, adapted from ThreeGrease and AMS.
	toolSelect: svg( '<path d="m4.5 4.5 6.05 15.15a.563.563 0 0 0 1.048.014l1.902-4.735a.563.563 0 0 1 .315-.315l4.735-1.902a.563.563 0 0 0-.014-1.048L4.5 4.5Z"/>' ),
	toolMask: svg( '<path d="M12 3l7.5 4.5v9L12 21l-7.5-4.5v-9Z"/>' ),
	toolMeasure: svg( '<path d="M3.5 16.5 16.5 3.5a1.5 1.5 0 0 1 2.1 0l1.9 1.9a1.5 1.5 0 0 1 0 2.1L7.5 20.5a1.5 1.5 0 0 1-2.1 0l-1.9-1.9a1.5 1.5 0 0 1 0-2.1ZM8 12l2 2m2-6 2 2m-8 8 2 2"/>' ),
	placePlane: svg( '<path d="m4 14 8-4 8 4-8 4-8-4zm8-6V3m-2 3 2 2 2-2"/>' ),
	groundPlane: svg( '<path d="m3 15 9-5 9 5-9 5-9-5Z"/><path d="M12 3v9m-3-3 3 3 3-3"/>' ),
	toolGrid: svg( '<path d="M4 4h16v16H4ZM4 12h16M12 4v16"/>' ),
	toolSnap: svg( '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>' ),
	pivotBox: svg( '<path d="M4 4h4M16 4h4M4 20h4M16 20h4M4 4v4M20 4v4M4 16v4M20 16v4M10.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0"/>' ),
	pivotMedian: svg( '<path d="M8.5 8.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M8.5 15.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M10.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0"/>' ),
	pivotActive: svg( '<path d="M4.5 12a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0 -15 0M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M10.8 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0"/>' ),
	pivotOrigin: svg( '<path d="M6 12a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M12 2v4M12 18v4M2 12h4M18 12h4"/>' ),
	cursor3D: svg( '<circle cx="12" cy="12" r="8" stroke-dasharray="7 3"/><path d="M4 12h16M12 4v16"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>' ),
	toolPath: svg( '<path d="M4 18c5 0 4-12 11-12h5"/><rect x="2" y="16" width="4" height="4"/><rect x="18" y="4" width="4" height="4"/>' ),
	toolPaint: svg( '<path d="M14 4l6 6-7.5 7.5-6-6z"/><path d="M6.5 11.5C4 12 3 14 3 16.5 3 18 2.5 19.5 1.5 20.5c3 0 6.5-.5 8-2 1.3-1.3 1.5-3 1-4.5"/>' ),
	viewportSplit: svg( '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/>' ),
	viewportOverlays: svg( '<circle cx="9" cy="12" r="5"/><path d="M13 7.4a5 5 0 1 1 0 9.2"/>' ),
	viewPerspective: svg( '<path d="M3 19h18l-4-12H7L3 19Zm2-6h14M10 7 8 19m6-12 2 12"/>' ),
	viewOrthographic: svg( '<path d="M4 5h16v14H4zM4 12h16M12 5v14"/>' ),
	xray: svg( '<rect x="3" y="3" width="12" height="12" rx="1"/><rect x="9" y="9" width="12" height="12" rx="1"/><path d="M9 9h6v6H9z" fill="currentColor" fill-opacity=".4" stroke="none"/>' ),
	shadingRendered: svg( '<circle cx="12" cy="12" r="8.5" fill="currentColor" fill-opacity=".25"/><path d="M5 14c6 0 9-3 12-8a8 8 0 0 1-12 11Z" fill="currentColor"/>' ),
	shadingMaterial: svg( '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor"/>' ),
	shadingSolid: svg( '<circle cx="12" cy="12" r="8.5" fill="currentColor" fill-opacity=".85"/>' ),
	shadingNormals: svg( '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4.8 8.5h14.4M4.8 15.5h14.4"/>' ),
	shadingWire: svg( '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="4" ry="8.5"/><path d="M4 9.5h16M4 14.5h16"/>' ),
	magnet: svg( '<path transform="rotate(135 12 12)" d="M5 11v2a7 7 0 0 0 14 0v-2h-4v2a3 3 0 0 1-6 0v-2ZM5 5h4v3H5zm10 0h4v3h-4z" fill="currentColor"/>' ),
	snapVertex: svg( '<rect x="7" y="7" width="10" height="10" rx="1"/>' ),
	snapEdge: svg( '<path d="m4 18 16-12"/><circle cx="4" cy="18" r="1.4"/><circle cx="20" cy="6" r="1.4"/>' ),
	snapMidpoint: svg( '<path d="M3 12h18m-9-4 4 4-4 4-4-4z"/>' ),
	snapPerpendicular: svg( '<path d="M4 17h16m-8 0V5m0 8h4v4"/>' ),
	snapFace: svg( '<path d="M4 18h16L12 5Z"/>' ),
	snapFaceCenter: svg( '<path d="M4 18h16L12 5Z"/><circle cx="12" cy="13" r="1" fill="currentColor"/>' ),
	orientGlobal: svg( '<path d="M6 15V3m-3 3 3-3 3 3m0 12h12m-3-3 3 3-3 3"/><path d="m8 16 9-9m-4 0h4v4" opacity=".65"/><circle cx="6" cy="18" r="2.5"/>' ),
	orientLocal: svg( '<path d="m5 16 7-4 7 4m-7-4V4m0 8v8"/><circle cx="12" cy="12" r="2"/>' ),
	orientNormal: svg( '<path d="m4 15 8-4 8 4-8 4zM12 13V4m-3 3 3-3 3 3"/>' ),
	orientParent: svg( '<rect x="4" y="4" width="5" height="5"/><rect x="15" y="15" width="5" height="5"/><path d="M6.5 9v8.5H15"/>' ),
	objectMode: svg( '<path d="M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5" opacity=".65"/><rect x="7" y="7" width="10" height="10" rx=".8" fill="currentColor" stroke="none"/>' ),
	editMode: svg( '<path d="m5 17 5-11 9 7-14 4Z"/><circle cx="5" cy="17" r="2" fill="currentColor"/><circle cx="10" cy="6" r="2" fill="currentColor"/><circle cx="19" cy="13" r="2" fill="currentColor"/>' ),
	link: svg( '<path d="m9 15 6-6m-5-3 2-2a4 4 0 0 1 6 6l-2 2M8 12l-2 2a4 4 0 0 0 6 6l2-2"/>' ),
	unlink: svg( '<path d="m10 6 2-2a4 4 0 0 1 6 6l-2 2M8 12l-2 2a4 4 0 0 0 6 6l2-2M4 4l16 16"/>' ),
	calibrate: svg( '<path d="M4 6h16M4 18h16m-14-6h12M4 3v6m16-6v6M4 15v6m16-6v6m-10-7-3-2 3-2m4 4 3-2-3-2"/>' ),
	brushWidth: svg( '<circle cx="12" cy="12" r="5"/><path d="M3 9v6m18-6v6"/>' ),
	opacity: svg( '<path d="M12 3c2 4 6 8 6 12a6 6 0 0 1-12 0c0-4 4-8 6-12Z"/><path d="M6 15h12"/>' ),
	exitTool: svg( '<path d="M12 5H5v14h7m1-11 4 4-4 4m4-4H8"/>' ),
	extrude: svg( '<path d="m4 15 8-4 8 4-8 4-8-4Zm8-5V3m-3 3 3-3 3 3"/>' ),
	deleteFace: svg( '<path d="M4 18h16L12 5Zm5-6 6 6m0-6-6 6"/>' ),
	maskCutout: svg( '<path d="M4 4h16v16H4z"/><circle cx="12" cy="12" r="4" stroke-dasharray="2 2"/>' ),
	// Tabs
	scene: svg( '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>' ),
	assets: svg( '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>' ),
	streams: svg( '<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8"/>' ),
	project: svg( '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14h7M9 17h4"/>' ),
	settings: svg( '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>' ),
	// Section headers
	general: svg( '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>' ),
	code: svg( '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>' ),
	theme: svg( '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="14.5" cy="9" r="1.2" fill="currentColor"/><circle cx="9.5" cy="14.5" r="1.2" fill="currentColor"/><path d="M12 3.5a8.5 8.5 0 010 17c-1.5 0-2-1-1.4-2 .7-1.2-.2-2.6-1.7-2.6H6a3.4 3.4 0 01-3.4-3.4c0-.4 0-.8.1-1.1A8.5 8.5 0 0112 3.5z"/>' ),
	shortcuts: svg( '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M6 14h1M9 14h6"/>' ),
	history: svg( '<path d="M4 12a8 8 0 102.4-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>' ),
	// Fields
	language: svg( '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c-5.5 5.5-5.5 11.5 0 17 5.5-5.5 5.5-11.5 0-17z"/>' ),
	autosave: svg( '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>' ),
	autohide: svg( '<path d="M4 12h16M8 8l4 4-4 4M16 8l-4 4 4 4"/>' ),
	mouse: svg( '<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 3v6"/><path d="M12 3v6" opacity=".4"/>' ),
	style: svg( '<rect x="3" y="4" width="18" height="7" rx="1.5" opacity=".6"/><path d="M4 15h16M4 19h16"/><circle cx="9" cy="15" r="1.6" fill="currentColor"/><circle cx="15" cy="19" r="1.6" fill="currentColor"/>' ),
	font: svg( '<path d="M5 5h14M12 5v14"/>' ),
	fontsize: svg( '<path d="M3 19h8M7 19v-9M11 19v-9M13 19h8M17 19V9"/>' ),
	ligatures: svg( '<path d="M7 4c-2.5 0-2 3-2 5s-1.5 3-3 3c1.5 0 3 1 3 3s-.5 5 2 5M17 4c2.5 0 2 3 2 5s1.5 3 3 3c-1.5 0-3 1-3 3s.5 5-2 5"/>' ),
	completion: svg( '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>' ),
	diagnostics: svg( '<circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><circle cx="12" cy="16.5" r=".8" fill="currentColor" stroke="none"/>' ),
	panel: svg( '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16"/>' ),
	text: svg( '<path d="M5 5h14M12 5v14"/>' ),
	viewport: svg( '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 16l5-5 4 4 3-3 4 4"/>' ),
	surface: svg( '<path d="M5 7l9-3 5 7-4 8-10-2z" fill="currentColor" fill-opacity=".25"/>' ),
	accent: svg( '<circle cx="12" cy="12" r="4" fill="currentColor"/>' ),
	keyword: svg( '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/><path d="M4 18h16"/>' ),
	string: svg( '<path d="M5 7h14M5 12h14M5 17h9"/>' ),
	// Buttons
	apply: svg( '<path d="M5 12.5l4.5 4.5L19 7.5"/>' ),
	regenerate: svg( '<path d="M4 12a8 8 0 0113.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.7L4 15.5M4 20v-4.5h4.5"/>' ),
	save: svg( '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>' ),
	delete: svg( '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>' ),
	add: svg( '<path d="M12 5v14M5 12h14"/>' ),
	edit: svg( '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19z"/><path d="M14.5 6.5l3 3"/>' ),
	remove: svg( '<path d="M6 6l12 12M18 6L6 18"/>' ),
	play: svg( '<path d="M7 5l12 7-12 7z"/>' ),
	stop: svg( '<rect x="6" y="6" width="12" height="12" rx="1"/>' ),
	record: svg( '<circle cx="12" cy="12" r="6" fill="currentColor"/>' ),
	loop: svg( '<path d="m16 3 4 4-4 4M20 7H7a3 3 0 0 0-3 3m4 11-4-4 4-4m-4 4h13a3 3 0 0 0 3-3"/>' ),
	keyframe: svg( '<path d="m12 4 8 8-8 8-8-8z"/>' ),
	autoKey: svg( '<path d="m10 5 7 7-7 7-7-7zM19 4v5M16.5 6.5h5M19 15v4"/>' ),
	frame: svg( '<path d="M4 8V5h16v3M4 16v3h16v-3M12 8v8"/>' ),
	frameRate: svg( '<path d="M4 17a8 8 0 1 1 16 0H4Zm8 0 4-5"/>' ),
	pause: svg( '<path d="M8 5v14M16 5v14"/>' ),
	preview: svg( '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' ),
	camera: svg( '<path d="M5 12a4 4 0 1 1 3-6 5 5 0 1 1 5 6Zm1 3h8v5H6zm8 2 5-2v5l-5-2M3 16v3"/><circle cx="15" cy="7" r="1.3"/>' ),
	background: svg( '<rect x="4" y="4" width="16" height="16" rx="1"/>' ),
	environment: svg( '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' ),
	fog: svg( '<path d="M4 10h16M6 14h12M4 18h16"/>' ),
	color: svg( '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 000 16z" fill="currentColor"/>' ),
	none: svg( '<circle cx="12" cy="12" r="8" stroke-dasharray="2.6 2.6"/>' ),
	move: svg( '<path d="M12 3v18M3 12h18"/><path d="M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>' ),
	rotate: svg( '<path d="M20 10a8 8 0 0 0-14-4L3 9m0-5v5h5m-4 5a8 8 0 0 0 14 4l3-3m0 5v-5h-5"/><circle cx="12" cy="12" r="2" fill="currentColor"/>' ),
	scale: svg( '<path d="M10 4h10v10M14 10l6-6M4 13h7v7H4z"/>' ),
	lock: svg( '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>' ),
	help: svg( '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.6a2.6 2.6 0 015.1.6c0 1.8-2.5 2.2-2.5 4"/><circle cx="12" cy="17.4" r=".7" fill="currentColor" stroke="none"/>' ),
	book: svg( '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5z"/>' ),
	chat: svg( '<path d="M4 5h16v11H9l-5 4z"/>' ),
	menu: svg( '<path d="M4 7h16M4 12h16M4 17h16"/>' ),
	undo: svg( '<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 010 10h-2"/>' ),
	refresh: svg( '<path d="M20 5v5h-5m5 0a8 8 0 1 0 .1 5"/>' ),
	redo: svg( '<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 000 10h2"/>' ),
	up: svg( '<path d="M6 14l6-6 6 6"/>' ),
	down: svg( '<path d="M6 10l6 6 6-6"/>' ),
	film: svg( '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18M8 5v4M16 5v4M8 15v4M16 15v4"/>' ),
	layers: svg( '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>' ),
	note: svg( '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4"/>' ),
	properties: svg( '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>' ),
	log: svg( '<path d="M4 6h16M4 12h10M4 18h13"/>' ),
	guide: svg( '<path d="M3 17L21 7" stroke-dasharray="3 3"/>' ),
	gesture: svg( '<path d="M4 16c4-9 7 4 10-3s4-6 6-4" stroke-dasharray="1.5 3"/>' ),
	hand: svg( '<path d="M8 13V5.5a1.5 1.5 0 013 0V12m0-1V4.5a1.5 1.5 0 013 0V12m0-1.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L3.6 15a1.6 1.6 0 012.6-1.9L8 15"/>' ),
	select: svg( '<path d="M5 3l14 8-6 1.5L10 19z" fill="currentColor"/>' ),
	point: svg( '<circle cx="12" cy="12" r="4" fill="currentColor"/>' ),
	plane: svg( '<path d="M5 7l9-3 5 7-4 8-10-2z" fill="currentColor" fill-opacity=".25"/>' ),
	circle: svg( '<circle cx="12" cy="12" r="7.5" fill="currentColor" fill-opacity=".25"/>' ),
	rect: svg( '<rect x="4.5" y="6" width="15" height="12" rx="0.5" fill="currentColor" fill-opacity=".25"/>' ),
	line: svg( '<path d="M4 18c3-6 5-9 8-9s3 5 8-4"/>' ),
	sparkles: svg( '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>' ),
	stop: svg( '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>' ),
	group: svg( '<rect x="4" y="4" width="9" height="9" rx="1.5"/><rect x="11" y="11" width="9" height="9" rx="1.5"/>' ),
	format: svg( '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>' ),
	gauge: svg( '<circle cx="12" cy="12" r="9"/><path d="M12 12l4-4"/>' ),
	volume: svg( '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a8 8 0 010 11"/>' ),
	controls: svg( '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 10.5l3 1.5-3 1.5z" fill="currentColor"/><path d="M14 12h4"/>' ),
	mask: svg( '<rect x="6" y="6" width="12" height="12"/><path d="M3 9h3M3 15h3M18 9h3M18 15h3M9 3v3M15 3v3M9 18v3M15 18v3"/>' ),
	snap: svg( '<path d="M4 9h16M4 15h16M9 4v16M15 4v16" opacity=".55"/><circle cx="15" cy="9" r="2.6" fill="currentColor" stroke="none"/>' ),
	mixer: svg( '<path d="M6 4v16M12 4v16M18 4v16" opacity=".5"/><rect x="4" y="13" width="4" height="3" rx=".8" fill="currentColor"/><rect x="10" y="7" width="4" height="3" rx=".8" fill="currentColor"/><rect x="16" y="11" width="4" height="3" rx=".8" fill="currentColor"/>' ),
	erase: svg( '<path d="m4 13 7.5-8a2 2 0 0 1 2.8-.1l5.1 4.8a2 2 0 0 1 .1 2.8L13.5 19H9l-5-4.7a1 1 0 0 1 0-1.3ZM8.5 9.5l8.1 7.5M13 19h7"/>' ),
	brush: svg( '<path d="M14 4l6 6-7.5 7.5-6-6z"/><path d="M6.5 11.5C4 12 3 14 3 16.5 3 18 2.5 19.5 1.5 20.5c3 0 6.5-.5 8-2 1.3-1.3 1.5-3 1-4.5"/>' ),
	follow: svg( '<path d="M4 12a8 8 0 0113.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.7L4 15.5M4 20v-4.5h4.5"/>' ),
	redraw: svg( '<rect x="3" y="4" width="8" height="7" fill="currentColor" fill-opacity=".3"/><path d="M14 4l7 7h-7z" fill="currentColor" fill-opacity=".3"/><circle cx="8" cy="17" r="4" fill="currentColor" fill-opacity=".3"/><path d="M14 15h7M14 19h5"/>' ),
	snippet: svg( '<path d="M9 4C6.5 4 7 7 7 9s-1.5 3-3 3c1.5 0 3 1 3 3s-.5 5 2 5M15 4c2.5 0 2 3 2 5s1.5 3 3 3c-1.5 0-3 1-3 3s.5 5-2 5"/>' ),
	minimize: svg( '<path d="M4 12h16M8 8l4 4-4 4M16 8l-4 4 4 4"/>' ),
	fork: svg( '<circle cx="7" cy="5.5" r="2"/><circle cx="17" cy="5.5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M7 7.5v1.5a3 3 0 003 3h4a3 3 0 003-3V7.5M12 12v5"/>' ),
	export: svg( '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 13v6h14v-6"/>' ),
	picture: svg( '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/>' ),
	fit: svg( '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>' ),
	board: svg( '<rect x="3.5" y="6" width="11" height="12" rx="1"/><rect x="9.5" y="3" width="11" height="12" rx="1" opacity=".55"/>' ),
	page: svg( '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14h7M9 17h4"/>' ),
	scenes: svg( '<rect x="3.5" y="9" width="17" height="11" rx="1.5"/><path d="M3.5 9l1-4.2 15.8-2.3.9 4.2z"/>' ),
	exercise: svg( '<path d="M4 5h11l5 5v9H4z"/><path d="M8 13l2 2 5-5"/>' ),
	stages: svg( '<path d="M4 6h6M8 12h8M12 18h8"/>' ),
	lineNumbers: svg( '<path d="M5 6h2v4M5 10h3M5 14h3l-3 4h3M11 7h8M11 12h8M11 17h8"/>' ),
	info: svg( '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.5"/>' ),
	fold: svg( '<path d="M6 8l6 5 6-5M6 15l6-5 6 5" opacity=".9"/>' ),
	wrap: svg( '<path d="M4 7h13a3 3 0 0 1 0 6h-3M4 13h10"/><path d="M16 10l-2.5 3 2.5 3"/>' ),
	tabs: svg( '<path d="M4 8h5l2 2h9v9H4z"/><path d="M4 8V5h6l2 2"/>' ),
	buttons: svg( '<rect x="4" y="9" width="16" height="7" rx="2"/><path d="M8 12.5h2M14 12.5h2"/>' ),
	headers: svg( '<path d="M4 7h16M4 12h10M4 17h13"/>' ),
	fields: svg( '<path d="M5 7h6M5 12h9M5 17h5"/><circle cx="17" cy="7" r="1.4"/><circle cx="19" cy="17" r="1.4"/>' ),
	target: svg( '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>' )
};

const icon = ( name ) => ICONS[ name ] || '';

// Strings key -> icon name. Labels are matched by their i18n key (set as
// data-glyph-key when the UI builds them), so glyph mode works in any locale.
const KEY_ICONS = new Map( [
	[ 'sidebar/properties/object', 'objectMode' ],
	[ 'sidebar/properties/geometry', 'editMode' ],
	[ 'sidebar/properties/material', 'shadingMaterial' ],
	[ 'sidebar/properties/script', 'code' ],
	[ 'sidebar/properties/modeling', 'meshBuild' ],
	[ 'sidebar/properties/modifiers', 'modifiers' ],
	[ 'sidebar/properties/animations', 'keyframe' ],
	[ 'sidebar/properties/tool', 'controls' ],
	[ 'sidebar/scene', 'scene' ],
	[ 'sidebar/project', 'project' ],
	[ 'sidebar/settings', 'settings' ],
	[ 'sidebar/settings/general', 'general' ],
	[ 'sidebar/settings/shortcuts', 'shortcuts' ],
	[ 'sidebar/settings/theme', 'theme' ],
	[ 'sidebar/history', 'history' ],
	[ 'sidebar/settings/language', 'language' ],
	[ 'sidebar/settings/glyphs/tabs', 'tabs' ],
	[ 'sidebar/settings/glyphs/buttons', 'buttons' ],
	[ 'sidebar/settings/glyphs/headers', 'headers' ],
	[ 'sidebar/settings/glyphs/fields', 'fields' ],
	[ 'sidebar/settings/autosave', 'autosave' ],
	[ 'sidebar/settings/glyphs/menus', 'menu' ],
	[ 'menubar/file', 'page' ],
	[ 'menubar/edit', 'edit' ],
	[ 'menubar/add', 'add' ],
	[ 'menubar/view', 'preview' ],
	[ 'menubar/render', 'film' ],
	[ 'menubar/help', 'help' ],
	[ 'sidebar/scene/background', 'background' ],
	[ 'sidebar/scene/environment', 'environment' ],
	[ 'sidebar/scene/fog', 'fog' ],
	[ 'sidebar/object/new', 'add' ],
	[ 'sidebar/object/export', 'export' ],
	[ 'sidebar/geometry/new', 'add' ],
	[ 'sidebar/geometry/export', 'export' ],
	[ 'sidebar/material/new', 'add' ],
	[ 'sidebar/material/export', 'export' ],
	[ 'sidebar/material/info', 'info' ],
	[ 'sidebar/script/new', 'add' ],
	[ 'sidebar/script/new-p5', 'sparkles' ],
	[ 'sidebar/script/edit', 'edit' ],
	[ 'sidebar/script/remove', 'remove' ],
	[ 'sidebar/script/preview', 'preview' ],
	[ 'sidebar/script/pause', 'pause' ],
	[ 'sidebar/script/resume', 'play' ],
	[ 'sidebar/history/clear', 'delete' ],
	[ 'sidebar/project/render', 'play' ],
	[ 'sidebar/project/app/play', 'play' ],
	[ 'sidebar/project/Assign', 'apply' ],
	[ 'dialog/ok', 'apply' ],
	[ 'dialog/cancel', 'remove' ],
	[ 'menubar/render/cancel', 'remove' ]
] );

// English label text -> icon name, for the hardcoded (untranslated) labels.
const LABELS = new Map( [
	[ 'Code', 'code' ],
	[ 'Assets', 'assets' ],
	[ 'Streams', 'streams' ],
	[ 'Code editor', 'code' ],
	[ 'Auto-hide top menu', 'autohide' ],
	[ 'Mouse navigation', 'mouse' ],
	[ 'Interface style', 'style' ],
	[ 'Interface font', 'font' ],
	[ 'Emulate 3-button mouse (Blender)', 'mouse' ],
	[ 'Font', 'font' ],
	[ 'Font size', 'fontsize' ],
	[ 'Ligatures', 'ligatures' ],
	[ 'Code completion', 'completion' ],
	[ 'Diagnostics', 'diagnostics' ],
	[ 'Line numbers', 'lineNumbers' ],
	[ 'Fold blocks', 'fold' ],
	[ 'Wrap lines', 'wrap' ],
	[ 'Icon tabs', 'tabs' ],
	[ 'Icon buttons', 'buttons' ],
	[ 'Icon section headers', 'headers' ],
	[ 'Icon field labels', 'fields' ],
	[ 'Panel', 'panel' ],
	[ 'Text', 'text' ],
	[ 'Viewport', 'viewport' ],
	[ 'Surface', 'surface' ],
	[ 'Accent', 'accent' ],
	[ 'Keyword', 'keyword' ],
	[ 'String', 'string' ],
	[ 'Theme name', 'theme' ],
	[ 'Save theme', 'save' ],
	[ 'Delete', 'delete' ],
	[ 'Disable look', 'none' ],
	[ 'New shader', 'code' ],
	[ 'Apply', 'apply' ],
	[ 'Modifiers', 'modifiers' ],
	[ 'Apply ▶', 'play' ],
	[ 'auto', 'autohide' ],
	[ 'Regenerate', 'regenerate' ],
	[ 'New', 'add' ],
	[ 'New p5 sketch', 'sparkles' ],
	[ 'Edit', 'edit' ],
	[ 'Remove', 'remove' ],
	[ 'Preview', 'preview' ],
	[ 'Pause', 'pause' ],
	[ 'Resume', 'play' ],
	[ 'Camera', 'camera' ],
	[ 'Background', 'background' ],
	[ 'Environment', 'environment' ],
	[ 'Fog', 'fog' ],
	[ 'Color', 'color' ],
	[ 'None', 'none' ],
	[ 'Set as main camera', 'camera' ],
	[ 'Navigation', 'mouse' ],
	[ 'Follow target', 'target' ],
	[ 'Export camera', 'camera' ],
	[ 'Controller', 'mouse' ]
] );

function glyphifyElement( el, name ) {

	if ( el.dataset.glyph ) return;
	const text = el.textContent.trim();
	if ( ! text ) return;
	el.dataset.glyph = name;
	if ( ! el.title ) el.title = text;
	const glyph = document.createElement( 'span' );
	glyph.className = 'glyph';
	glyph.innerHTML = icon( name );
	const label = document.createElement( 'span' );
	label.className = 'glyph-label';
	while ( el.firstChild ) label.appendChild( el.firstChild );
	el.append( glyph, label );

}

// Wrap matching labeled chrome with icon + hover tip. Only plain-text
// elements are touched; anything with child widgets is left alone.
const SELECTORS = {
	tabs: '.TabbedPanel .Tab',
	buttons: '.Button, .glyph-auto',
	headers: '.settings-section > summary',
	fields: '.Label',
	menus: '#menubar .menu > .title'
};

function tryGlyphify( el ) {

	if ( el.dataset.glyph ) return;
	if ( el.querySelector( 'img, svg, input, select, canvas' ) ) return;
	const name = KEY_ICONS.get( el.dataset.glyphKey || '' ) || LABELS.get( el.textContent.trim() );
	if ( name ) glyphifyElement( el, name );

}

function glyphifyRoot( root ) {

	if ( root.nodeType !== 1 ) return;
	for ( const scope in SELECTORS ) {

		if ( ! document.body.classList.contains( 'glyph-' + scope ) ) continue;
		const selector = SELECTORS[ scope ];
		if ( root.matches( selector ) ) tryGlyphify( root );
		for ( const el of root.querySelectorAll( selector ) ) tryGlyphify( el );

	}

}

function unglyphifyElement( el ) {

	const label = el.querySelector( ':scope > .glyph-label' );
	const glyph = el.querySelector( ':scope > .glyph' );
	if ( label ) while ( label.firstChild ) el.appendChild( label.firstChild );
	if ( label ) label.remove();
	if ( glyph ) glyph.remove();
	delete el.dataset.glyph;

}

function unglyphifyScope( scope ) {

	for ( const el of document.body.querySelectorAll( `${SELECTORS[ scope ]}[data-glyph]` ) ) unglyphifyElement( el );

}

const glyphScopes = [ 'tabs', 'buttons', 'headers', 'fields', 'menus' ];

function applyGlyphMode( config ) {

	for ( const scope of glyphScopes ) {

		const on = !! config.getKey( 'settings/glyph' + scope[ 0 ].toUpperCase() + scope.slice( 1 ) );
		document.body.classList.toggle( 'glyph-' + scope, on );
		if ( ! on ) unglyphifyScope( scope );

	}
	if ( glyphScopes.some( ( scope ) => document.body.classList.contains( 'glyph-' + scope ) ) ) {

		watchGlyphs();
		try { glyphifyRoot( document.body ); } catch ( error ) { console.warn( 'glyphs:', error ); }

	}

}

let observing = false;

// Only newly added subtrees are scanned; our own glyph spans are skipped so
// wrapping an element never re-triggers work.
function watchGlyphs() {

	if ( observing ) return;
	observing = true;
	let pending = new Set();
	let queued = false;
	const flush = () => {

		queued = false;
		const nodes = pending;
		pending = new Set();
		for ( const node of nodes ) {

			if ( ! node.isConnected ) continue;
			try { glyphifyRoot( node ); } catch ( error ) { console.warn( 'glyphs:', error ); }

		}

	};
	new MutationObserver( ( records ) => {

		for ( const record of records ) {

			for ( const node of record.addedNodes ) {

				const target = node.nodeType === 3 ? node.parentElement : node;
				if ( ! target || target.nodeType !== 1 || target.classList.contains( 'glyph' ) || target.classList.contains( 'glyph-label' ) ) continue;
				pending.add( target.closest( '[data-glyph]' ) || target );

			}

		}
		if ( pending.size && ! queued ) {

			queued = true;
			requestAnimationFrame( flush );

		}

	} ).observe( document.body, { childList: true, subtree: true } );

}

export { icon, ICONS, KEY_ICONS, LABELS, glyphifyElement, glyphifyRoot, watchGlyphs, applyGlyphMode, glyphScopes };
