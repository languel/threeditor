function Config( persist = true ) {

	const name = 'threejs-editor';
	const localStorage = persist ? window.localStorage : null;

	const userLanguage = navigator.language.split( '-' )[ 0 ];

	const suggestedLanguage = [ 'fr', 'ja', 'zh', 'ko', 'fa' ].includes( userLanguage ) ? userLanguage : 'en';

	const storage = {
		'language': suggestedLanguage,

		'autosave': true,

		'project/title': '',
		'project/editable': false,
		'project/presentationEditVisible': false,
		'project/vr': false,

		'project/camera': 'perspective',

		'project/renderer/type': 'WebGLRenderer',
		'project/renderer/antialias': true,
		'project/renderer/shadows': true,
		'project/renderer/shadowType': 1, // PCF
		'project/renderer/toneMapping': 7, // NeutralToneMapping
		'project/renderer/toneMappingExposure': 1,

		'settings/history': false,
		'settings/keymapPreset': 'blender',
		'settings/keymapOverrides': {},
		'settings/emulateThreeButtonMouse': false,
		'settings/autoHideMenubar': false,
		'settings/theme': 'system',
		'settings/userThemes': {},
		'settings/codeEditor': { font: 'Menlo', fontSize: 13, ligatures: false, completion: true, lint: true, lineNumbers: true, folding: true, wrap: false },

		'settings/shortcuts/translate': 'w',
		'settings/shortcuts/rotate': 'e',
		'settings/shortcuts/scale': 'r',
		'settings/shortcuts/undo': 'z',
		'settings/shortcuts/focus': 'f',
		'settings/shortcuts/perspective': 'p',
		'settings/shortcuts/orthographic': 'o',
		'settings/shortcuts/selectAll': 'a'
	};

	if ( localStorage && localStorage[ name ] === undefined ) {

		localStorage[ name ] = JSON.stringify( storage );

	} else if ( localStorage ) {

		const data = JSON.parse( localStorage[ name ] );

		for ( const key in data ) {

			storage[ key ] = data[ key ];

		}

	}

	return {

		getKey: function ( key ) {

			return storage[ key ];

		},

		setKey: function () { // key, value, key, value ...

			for ( let i = 0, l = arguments.length; i < l; i += 2 ) {

				storage[ arguments[ i ] ] = arguments[ i + 1 ];

			}

			if ( localStorage ) localStorage[ name ] = JSON.stringify( storage );

			console.log( '[' + /\d\d\:\d\d\:\d\d/.exec( new Date() )[ 0 ] + ']', 'Saved config to LocalStorage.' );

		},

		clear: function () {

			if ( localStorage ) delete localStorage[ name ];

		}

	};

}

export { Config };
