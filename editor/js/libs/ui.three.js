import * as THREE from 'three';

import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

import { UISpan, UIDiv, UIRow, UIButton, UICheckbox, UIText, UINumber } from './ui.js';
import { MoveObjectCommand } from '../commands/MoveObjectCommand.js';
import { hasRestriction } from '../ObjectRestrictions.js';

import { openAssetBrowser } from '../AssetBrowser.js';
import { loadAssetTexture } from '../assets/AssetTexture.js';
import { isMovingAsset } from '../assets/AssetController.js';
import { ASSET_MIME } from '../assets/AssetLibrary.js';

class UITexture extends UISpan {

	constructor( editor, applyMoving ) {

		super();

		const scope = this;

		const canvas = document.createElement( 'canvas' );
		canvas.width = 32;
		canvas.height = 16;
		canvas.style.cursor = 'pointer';
		canvas.style.marginRight = '5px';
		canvas.style.border = '1px solid #888';
		canvas.tabIndex = 0;
		canvas.setAttribute( 'role', 'button' );
		canvas.setAttribute( 'aria-label', 'Choose texture from assets' );
		canvas.addEventListener( 'click', browse );
		canvas.addEventListener( 'keydown', event => {

			if ( event.key !== 'Enter' && event.key !== ' ' ) return;
			event.preventDefault();
			event.stopPropagation();
			browse();

		} );
		canvas.addEventListener( 'dragover', event => event.preventDefault() );
		canvas.addEventListener( 'drop', event => {

			event.preventDefault();
			event.stopPropagation();
			const asset = event.dataTransfer.getData( ASSET_MIME );
			if ( asset ) {
				editor.assetBrowser.run( async () => {
					const entry = await editor.assetBrowser.materialize( asset );
					await chooseEntry( entry );
				} );
				return;
			}
			const file = event.dataTransfer.files[ 0 ];
			if ( file ) loadFile( file ).catch( error => alert( error.message ) );

		} );
		this.dom.appendChild( canvas );

		function browse() {

			openAssetBrowser( editor, {
				kind: 'texture',
				moving: !! applyMoving,
				onPick: chooseEntry,
				onUpload: ( [ file ] ) => loadFile( file )
			} );

		}

		function chooseEntry( entry ) {

			if ( applyMoving && isMovingAsset( entry.record ) ) return applyMoving( entry );
			return entry.texture ? deliver( entry.texture, entry.path ) : loadFile( entry.file, entry.path );

		}

		function deliver( texture, path ) {

			const clone = texture.clone();
			clone.sourceFile = texture.sourceFile;
			if ( path ) clone.userData.sourceAssetPath = path;
			scope.setValue( clone );
			scope.onChangeCallback?.( clone );

		}

		async function loadFile( file, path ) {
			const texture = await loadAssetTexture( editor, file, path );
			deliver( texture, texture.userData.sourceAssetPath );
		}

		this.texture = null;
		this.onChangeCallback = null;

	}

	getValue() {

		return this.texture;

	}

	setValue( texture ) {

		const canvas = this.dom.children[ 0 ];
		const context = canvas.getContext( '2d' );

		// Seems like context can be null if the canvas is not visible
		if ( context ) {

			// Always clear the context before set new texture, because new texture may has transparency
			context.clearRect( 0, 0, canvas.width, canvas.height );

		}

		if ( texture !== null ) {

			const image = texture.image;

			if ( image !== undefined && image !== null && image.width > 0 ) {

				canvas.title = texture.sourceFile;
				const scale = canvas.width / image.width;

				if ( texture.isDataTexture || texture.isCompressedTexture ) {

					const canvas2 = renderToCanvas( texture );
					context.drawImage( canvas2, 0, 0, image.width * scale, image.height * scale );

				} else {

					context.drawImage( image, 0, 0, image.width * scale, image.height * scale );

				}

			} else {

				canvas.title = texture.sourceFile + ' (error)';

			}

		} else {

			canvas.title = 'empty';

		}

		this.texture = texture;

	}

	setColorSpace( colorSpace ) {

		const texture = this.getValue();

		if ( texture !== null ) {

			texture.colorSpace = colorSpace;

		}

		return this;

	}

	onChange( callback ) {

		this.onChangeCallback = callback;

		return this;

	}

}

class UIOutliner extends UIDiv {

	constructor( editor ) {

		super();

		this.dom.className = 'Outliner';
		this.dom.tabIndex = 0;	// keyup event is ignored without setting tabIndex

		const scope = this;

		// hack
		this.scene = editor.scene;

		// Prevent native scroll behavior
		this.dom.addEventListener( 'keydown', function ( event ) {

			switch ( event.code ) {

				case 'ArrowUp':
				case 'ArrowDown':
					event.preventDefault();
					event.stopPropagation();
					break;

			}

		} );

		// Keybindings to support arrow navigation
		this.dom.addEventListener( 'keyup', function ( event ) {

			switch ( event.code ) {

				case 'ArrowUp':
					scope.selectIndex( scope.selectedIndex - 1 );
					break;
				case 'ArrowDown':
					scope.selectIndex( scope.selectedIndex + 1 );
					break;

			}

		} );

		this.editor = editor;

		this.options = [];
		this.selectedIndex = - 1;
		this.selectedValue = null;

	}

	selectIndex( index ) {

		if ( index >= 0 && index < this.options.length ) {

			this.setValue( this.options[ index ].value );

			const changeEvent = new Event( 'change', { bubbles: true, cancelable: true } );
			this.dom.dispatchEvent( changeEvent );

		}

	}

	setOptions( options ) {

		const scope = this;

		while ( scope.dom.children.length > 0 ) {

			scope.dom.removeChild( scope.dom.firstChild );

		}

		function onClick( event ) {

			scope.setValue( this.value );

			const changeEvent = new Event( 'change', { bubbles: true, cancelable: true } );
			changeEvent.shiftKey = event.shiftKey;
			scope.dom.dispatchEvent( changeEvent );

		}

		// Drag

		let currentDrag;

		function onDrag() {

			currentDrag = this;

		}

		function onDragStart( event ) {

			const object = scope.scene.getObjectById( this.value );
			if ( ! object || hasRestriction( object, 'locked' ) ) {

				event.preventDefault();
				return;

			}

			event.dataTransfer.setData( 'text', 'foo' );

		}

		function onDragOver( event ) {

			if ( this === currentDrag ) return;

			const area = event.offsetY / this.clientHeight;

			if ( area < 0.25 ) {

				this.className = 'option dragTop';

			} else if ( area > 0.75 ) {

				this.className = 'option dragBottom';

			} else {

				this.className = 'option drag';

			}

		}

		function onDragLeave() {

			if ( this === currentDrag ) return;

			this.className = 'option';

		}

		function onDrop( event ) {

			if ( this === currentDrag || currentDrag === undefined ) return;

			this.className = 'option';

			const scene = scope.scene;
			const object = scene.getObjectById( currentDrag.value );

			const area = event.offsetY / this.clientHeight;

			if ( area < 0.25 ) {

				const nextObject = scene.getObjectById( this.value );
				moveObject( object, nextObject.parent, nextObject );

			} else if ( area > 0.75 ) {

				let nextObject, parent;

				if ( this.nextSibling !== null ) {

					nextObject = scene.getObjectById( this.nextSibling.value );
					parent = nextObject.parent;

				} else {

					// end of list (no next object)

					nextObject = null;
					parent = scene.getObjectById( this.value ).parent;

				}

				moveObject( object, parent, nextObject );

			} else {

				const parentObject = scene.getObjectById( this.value );
				moveObject( object, parentObject );

			}

		}

		function moveObject( object, newParent, nextObject ) {

			if ( nextObject === null ) nextObject = undefined;

			let newParentIsChild = false;

			object.traverse( function ( child ) {

				if ( child === newParent ) newParentIsChild = true;

			} );

			if ( newParentIsChild ) return;

			const editor = scope.editor;
			editor.execute( new MoveObjectCommand( editor, object, newParent, nextObject ) );

			const changeEvent = new Event( 'change', { bubbles: true, cancelable: true } );
			scope.dom.dispatchEvent( changeEvent );

		}

		//

		scope.options = [];

		for ( let i = 0; i < options.length; i ++ ) {

			const div = options[ i ];
			div.className = 'option';
			scope.dom.appendChild( div );

			scope.options.push( div );

			div.addEventListener( 'click', onClick );

			if ( div.draggable === true ) {

				div.addEventListener( 'drag', onDrag );
				div.addEventListener( 'dragstart', onDragStart ); // Firefox needs this

				div.addEventListener( 'dragover', onDragOver );
				div.addEventListener( 'dragleave', onDragLeave );
				div.addEventListener( 'drop', onDrop );

			}


		}

		return scope;

	}

	getValue() {

		return this.selectedValue;

	}

	setValue( value ) {

		for ( let i = 0; i < this.options.length; i ++ ) {

			const element = this.options[ i ];

			if ( element.value === value ) {

				element.classList.add( 'active' );

				// scroll into view

				const y = element.offsetTop - this.dom.offsetTop;
				const bottomY = y + element.offsetHeight;
				const minScroll = bottomY - this.dom.offsetHeight;

				if ( this.dom.scrollTop > y ) {

					this.dom.scrollTop = y;

				} else if ( this.dom.scrollTop < minScroll ) {

					this.dom.scrollTop = minScroll;

				}

				this.selectedIndex = i;

			} else {

				element.classList.remove( 'active' );

			}

		}

		this.selectedValue = value;

		return this;

	}

	setValues( values ) {

		for ( let i = 0; i < this.options.length; i ++ ) {

			const element = this.options[ i ];

			if ( values.indexOf( element.value ) !== - 1 ) {

				element.classList.add( 'active' );

			} else {

				element.classList.remove( 'active' );

			}

		}

		this.selectedIndex = - 1;
		this.selectedValue = null;

		return this;

	}

}

class UIPoints extends UISpan {

	constructor() {

		super();

		this.dom.style.display = 'inline-block';

		this.pointsList = new UIDiv();
		this.add( this.pointsList );

		this.pointsUI = [];
		this.lastPointIdx = 0;
		this.onChangeCallback = null;

		this.update = () => { // bind lexical this

			if ( this.onChangeCallback !== null ) {

				this.onChangeCallback();

			}

		};

	}

	onChange( callback ) {

		this.onChangeCallback = callback;

		return this;

	}

	clear() {

		for ( let i = this.pointsUI.length - 1; i >= 0; -- i ) {

			this.deletePointRow( i, false );

		}

		this.lastPointIdx = 0;

	}

	deletePointRow( idx, needsUpdate = true ) {

		if ( ! this.pointsUI[ idx ] ) return;

		this.pointsList.remove( this.pointsUI[ idx ].row );

		this.pointsUI.splice( idx, 1 );

		if ( needsUpdate === true ) {

			this.update();

		}

		this.lastPointIdx --;

	}

}

class UIPoints2 extends UIPoints {

	constructor() {

		super();

		const row = new UIRow();
		this.add( row );

		const addPointButton = new UIButton( '+' );
		addPointButton.onClick( () => {

			if ( this.pointsUI.length === 0 ) {

				this.pointsList.add( this.createPointRow( 0, 0 ) );

			} else {

				const point = this.pointsUI[ this.pointsUI.length - 1 ];

				this.pointsList.add( this.createPointRow( point.x.getValue(), point.y.getValue() ) );

			}

			this.update();

		} );
		row.add( addPointButton );

	}

	getValue() {

		const points = [];

		let count = 0;

		for ( let i = 0; i < this.pointsUI.length; i ++ ) {

			const pointUI = this.pointsUI[ i ];

			if ( ! pointUI ) continue;

			points.push( new THREE.Vector2( pointUI.x.getValue(), pointUI.y.getValue() ) );
			++ count;
			pointUI.lbl.setValue( count );

		}

		return points;

	}

	setValue( points, needsUpdate = true ) {

		this.clear();

		for ( let i = 0; i < points.length; i ++ ) {

			const point = points[ i ];
			this.pointsList.add( this.createPointRow( point.x, point.y ) );

		}

		if ( needsUpdate === true ) this.update();

		return this;

	}

	createPointRow( x, y ) {

		const pointRow = new UIDiv();
		const lbl = new UIText( this.lastPointIdx + 1 ).setWidth( '20px' );
		const txtX = new UINumber( x ).setWidth( '30px' ).onChange( this.update );
		const txtY = new UINumber( y ).setWidth( '30px' ).onChange( this.update );

		const scope = this;
		const btn = new UIButton( '-' ).onClick( function () {

			if ( scope.isEditing ) return;

			const idx = scope.pointsList.getIndexOfChild( pointRow );
			scope.deletePointRow( idx );

		} );

		this.pointsUI.push( { row: pointRow, lbl: lbl, x: txtX, y: txtY } );
		++ this.lastPointIdx;
		pointRow.add( lbl, txtX, txtY, btn );

		return pointRow;

	}

}

class UIPoints3 extends UIPoints {

	constructor() {

		super();

		const row = new UIRow();
		this.add( row );

		const addPointButton = new UIButton( '+' );
		addPointButton.onClick( () => {

			if ( this.pointsUI.length === 0 ) {

				this.pointsList.add( this.createPointRow( 0, 0, 0 ) );

			} else {

				const point = this.pointsUI[ this.pointsUI.length - 1 ];

				this.pointsList.add( this.createPointRow( point.x.getValue(), point.y.getValue(), point.z.getValue() ) );

			}

			this.update();

		} );
		row.add( addPointButton );

	}

	getValue() {

		const points = [];
		let count = 0;

		for ( let i = 0; i < this.pointsUI.length; i ++ ) {

			const pointUI = this.pointsUI[ i ];

			if ( ! pointUI ) continue;

			points.push( new THREE.Vector3( pointUI.x.getValue(), pointUI.y.getValue(), pointUI.z.getValue() ) );
			++ count;
			pointUI.lbl.setValue( count );

		}

		return points;

	}

	setValue( points, needsUpdate = true ) {

		this.clear();

		for ( let i = 0; i < points.length; i ++ ) {

			const point = points[ i ];
			this.pointsList.add( this.createPointRow( point.x, point.y, point.z ) );

		}

		if ( needsUpdate === true ) this.update();

		return this;

	}

	createPointRow( x, y, z ) {

		const pointRow = new UIDiv();
		const lbl = new UIText( this.lastPointIdx + 1 ).setWidth( '20px' );
		const txtX = new UINumber( x ).setWidth( '30px' ).onChange( this.update );
		const txtY = new UINumber( y ).setWidth( '30px' ).onChange( this.update );
		const txtZ = new UINumber( z ).setWidth( '30px' ).onChange( this.update );

		const scope = this;
		const btn = new UIButton( '-' ).onClick( function () {

			if ( scope.isEditing ) return;

			const idx = scope.pointsList.getIndexOfChild( pointRow );
			scope.deletePointRow( idx );

		} );

		this.pointsUI.push( { row: pointRow, lbl: lbl, x: txtX, y: txtY, z: txtZ } );
		++ this.lastPointIdx;
		pointRow.add( lbl, txtX, txtY, txtZ, btn );

		return pointRow;

	}

}

class UIBoolean extends UISpan {

	constructor( boolean, text, glyphKey ) {

		super();

		this.setMarginRight( '4px' );

		this.checkbox = new UICheckbox( boolean );
		this.text = new UIText( text ).setMarginLeft( '3px' );
		if ( glyphKey ) this.text.setGlyphKey( glyphKey );

		this.add( this.checkbox );
		this.add( this.text );

	}

	getValue() {

		return this.checkbox.getValue();

	}

	setValue( value ) {

		return this.checkbox.setValue( value );

	}

}

let renderer, fsQuad;

function renderToCanvas( texture ) {

	if ( renderer === undefined ) {

		renderer = new THREE.WebGLRenderer();

	}

	if ( fsQuad === undefined ) {

		fsQuad = new FullScreenQuad( new THREE.MeshBasicMaterial() );

	}

	const image = texture.image;

	renderer.setSize( image.width, image.height, false );

	fsQuad.material.map = texture;
	fsQuad.render( renderer );

	return renderer.domElement;

}

export { UITexture, UIOutliner, UIPoints, UIPoints2, UIPoints3, UIBoolean, renderToCanvas };
