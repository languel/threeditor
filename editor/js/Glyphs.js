// Glyph interface mode: 24x24 stroke icons (stroke = currentColor, 1.6 width,
// round caps) in the style of ~/dev/artistmodelstudio/src/workbench/icons.js.
// Many paths below are reused from that set; the rest are drawn to match.
// The walker at the bottom swaps labeled chrome for glyphs with hover tips.

const svg = ( inner ) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS = {
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
	pause: svg( '<path d="M8 5v14M16 5v14"/>' ),
	preview: svg( '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' ),
	camera: svg( '<path d="M3 8a2 2 0 012-2h2l1.5-2h7L17 6h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><circle cx="12" cy="13" r="3.5"/>' ),
	background: svg( '<rect x="4" y="4" width="16" height="16" rx="1"/>' ),
	environment: svg( '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' ),
	fog: svg( '<path d="M4 10h16M6 14h12M4 18h16"/>' ),
	color: svg( '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 000 16z" fill="currentColor"/>' ),
	none: svg( '<circle cx="12" cy="12" r="8" stroke-dasharray="2.6 2.6"/>' ),
	move: svg( '<path d="M12 3v18M3 12h18"/><path d="M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>' ),
	rotate: svg( '<rect x="3" y="8" width="11" height="8" rx="1.5"/><path d="M17 6a5 5 0 013 4M20 10l.5-3M20 10l-3 .5"/>' ),
	scale: svg( '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>' ),
	lock: svg( '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>' ),
	help: svg( '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.6a2.6 2.6 0 015.1.6c0 1.8-2.5 2.2-2.5 4"/><circle cx="12" cy="17.4" r=".7" fill="currentColor" stroke="none"/>' ),
	book: svg( '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5z"/>' ),
	chat: svg( '<path d="M4 5h16v11H9l-5 4z"/>' ),
	menu: svg( '<path d="M4 7h16M4 12h16M4 17h16"/>' ),
	undo: svg( '<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 010 10h-2"/>' ),
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
	[ 'Apply', 'apply' ],
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
