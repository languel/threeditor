import { UIButton, UICheckbox, UIPanel, UIInput, UIRow, UIText } from './libs/ui.js';

function SidebarProjectApp( editor ) {

	const config = editor.config;
	const signals = editor.signals;
	const strings = editor.strings;

	const container = new UIPanel();
	container.setId( 'app' );

	const headerRow = new UIRow();
	headerRow.add( new UIText( strings.getKey( 'sidebar/project/app' ).toUpperCase() ) );
	container.add( headerRow );

	// Title

	const titleRow = new UIRow();
	const title = new UIInput( config.getKey( 'project/title' ) ).setLeft( '100px' ).setWidth( '150px' ).onChange( function () {

		config.setKey( 'project/title', this.getValue() );

	} );

	titleRow.add( new UIText( strings.getKey( 'sidebar/project/app/title' ) ).setClass( 'Label' ) );
	titleRow.add( title );

	container.add( titleRow );

	// Editable

	const editableRow = new UIRow();
	const editable = new UICheckbox( config.getKey( 'project/editable' ) ).setLeft( '100px' ).onChange( function () {

		config.setKey( 'project/editable', this.getValue() );

	} );

	editableRow.add( new UIText( strings.getKey( 'sidebar/project/app/editable' ) ).setClass( 'Label' ) );
	editableRow.add( editable );

	container.add( editableRow );

	const editIconRow = new UIRow();
	const editIconLabel = document.createElement( 'label' );
	const editIcon = new UICheckbox( config.getKey( 'project/presentationEditVisible' ) ).onChange( function () {

		config.setKey( 'project/presentationEditVisible', this.getValue() );

	} );
	editIconLabel.title = strings.getKey( 'sidebar/project/app/edit-icon-help' );
	editIconLabel.append( editIcon.dom, ' ' + strings.getKey( 'sidebar/project/app/edit-icon' ) );
	editIconRow.dom.appendChild( editIconLabel );
	container.add( editIconRow );

	// Play/Stop

	let isPlaying = false;

	const playButton = new UIButton( strings.getKey( 'sidebar/project/app/play' ) );
	playButton.setWidth( '170px' );
	playButton.setMarginLeft( '120px' );
	playButton.setMarginBottom( '10px' );
	function togglePlay() {

		if ( isPlaying === false ) signals.startPlayer.dispatch();
		else signals.stopPlayer.dispatch();

	}

	playButton.onClick( togglePlay );

	signals.startPlayer.add( function () {

		isPlaying = true;
		playButton.setTextContent( strings.getKey( 'sidebar/project/app/stop' ) );

	} );

	signals.stopPlayer.add( function () {

		isPlaying = false;
		playButton.setTextContent( strings.getKey( 'sidebar/project/app/play' ) );

	} );

	container.add( playButton );

	// Signals

	signals.projectLoaded.add( () => title.setValue( config.getKey( 'project/title' ) || '' ) );

	signals.editorCleared.add( function () {

		title.setValue( '' );
		config.setKey( 'project/title', '' );

	} );

	return container;

}

export { SidebarProjectApp };
