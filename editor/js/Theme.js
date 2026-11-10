const presets = {
	light: { name: 'Light', mode: 'light', colors: { background: '#eeeeee', surface: '#ffffff', text: '#555555', accent: '#0088ff', viewport: '#aaaaaa', keyword: '#a626a4', string: '#50a14f' } },
	dark: { name: 'Dark', mode: 'dark', colors: { background: '#1b1b1b', surface: '#262626', text: '#c2c2c2', accent: '#ececec', viewport: '#373737', keyword: '#ffc9e3', string: '#c9eec9' } },
	github: { name: 'Github', mode: 'dark', colors: { background: '#111111', surface: '#222222', text: '#aaaaaa', accent: '#0088ff', viewport: '#333333', keyword: '#c792ea', string: '#98c379' } },
	monoLight: { name: 'Mono light', mode: 'light', colors: { background: '#e9e9e9', surface: '#ffffff', text: '#414141', accent: '#62696d', viewport: '#b7b7b7', keyword: '#514e55', string: '#566357' } },
	monoDark: { name: 'Mono dark', mode: 'dark', colors: { background: '#1b1b1b', surface: '#262626', text: '#c2c2c2', accent: '#a6a6a6', viewport: '#373737', keyword: '#c4c0c6', string: '#aebbad' } },
	warmDark: { name: 'Warm dark', mode: 'dark', colors: { background: '#211d1b', surface: '#302a27', text: '#d5c9be', accent: '#d09d78', viewport: '#423a35', keyword: '#ddb99b', string: '#b3c2a4' } }
};

function resolveTheme( config, systemDark ) {

	const id = config.getKey( 'settings/theme' );
	const saved = config.getKey( 'settings/userThemes' ) || {};
	if ( id === 'system' ) return presets[ systemDark ? 'dark' : 'light' ];
	if ( presets[ id ] ) return presets[ id ];
	if ( id?.startsWith( 'user:' ) && saved[ id.slice( 5 ) ] ) return saved[ id.slice( 5 ) ];
	return presets[ systemDark ? 'dark' : 'light' ];

}

function applyTheme( config, systemDark ) {

	const theme = resolveTheme( config, systemDark );
	const root = document.documentElement;
	root.dataset.theme = theme.mode;
	for ( const [ key, value ] of Object.entries( theme.colors ) ) root.style.setProperty( '--theme-' + key, value );

}

const uiStyles = {
	default: 'Default',
	compact: 'Compact',
	clean: 'Clean'
};

function resolveUIStyle( config ) {

	const id = config.getKey( 'settings/uiStyle' );
	return uiStyles[ id ] ? id : 'default';

}

const uiFonts = {
	system: 'System',
	inter: 'Inter',
	helvetica: 'Helvetica',
	arial: 'Arial',
	verdana: 'Verdana'
};

const uiFontStacks = {
	system: 'system-ui, -apple-system, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif',
	inter: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
	helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
	arial: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
	verdana: 'Verdana, Geneva, "DejaVu Sans", sans-serif'
};

function resolveUIFont( config ) {

	const id = config.getKey( 'settings/uiFont' );
	return uiFonts[ id ] ? id : 'system';

}

function applyUIStyle( config ) {

	document.body.dataset.uiStyle = resolveUIStyle( config );
	document.body.style.setProperty( '--ui-font-family', uiFontStacks[ resolveUIFont( config ) ] );

}

export { presets, resolveTheme, applyTheme, uiStyles, resolveUIStyle, uiFonts, resolveUIFont, applyUIStyle };
