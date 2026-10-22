/**
 * Yalla theme front-end behaviour.
 *
 * Deliberately dependency-free and minimal. Master task §21: "do not add
 * unnecessary JavaScript". Everything here is progressive enhancement -- the
 * storefront renders and navigates without it.
 */
( function () {
	'use strict';

	/**
	 * Generic toggle: a button controls the element named by aria-controls.
	 *
	 * @param {string} toggleAttr Data attribute on the trigger.
	 */
	function bindToggle( toggleAttr ) {
		document.querySelectorAll( '[' + toggleAttr + ']' ).forEach( function ( button ) {
			button.addEventListener( 'click', function () {
				var id = button.getAttribute( 'aria-controls' );
				var panel = id ? document.getElementById( id ) : null;

				if ( ! panel ) {
					return;
				}

				var isOpen = button.getAttribute( 'aria-expanded' ) === 'true';

				button.setAttribute( 'aria-expanded', isOpen ? 'false' : 'true' );
				panel.classList.toggle( 'hidden', isOpen );
			} );
		} );
	}

	/**
	 * Dropdowns close on outside click and on Escape.
	 */
	function bindDropdowns() {
		var dropdowns = document.querySelectorAll( '[data-yalla-dropdown]' );

		dropdowns.forEach( function ( dropdown ) {
			var toggle = dropdown.querySelector( '[data-yalla-dropdown-toggle]' );
			var panel = dropdown.querySelector( '[data-yalla-dropdown-panel]' );

			if ( ! toggle || ! panel ) {
				return;
			}

			function close() {
				toggle.setAttribute( 'aria-expanded', 'false' );
				panel.classList.add( 'hidden' );

				var chevron = toggle.querySelector( 'svg' );
				if ( chevron ) {
					chevron.classList.remove( 'rotate-180' );
				}
			}

			toggle.addEventListener( 'click', function ( event ) {
				event.stopPropagation();

				var isOpen = toggle.getAttribute( 'aria-expanded' ) === 'true';

				if ( isOpen ) {
					close();
					return;
				}

				toggle.setAttribute( 'aria-expanded', 'true' );
				panel.classList.remove( 'hidden' );

				var chevron = toggle.querySelector( 'svg' );
				if ( chevron ) {
					chevron.classList.add( 'rotate-180' );
				}
			} );

			document.addEventListener( 'click', function ( event ) {
				if ( ! dropdown.contains( event.target ) ) {
					close();
				}
			} );

			document.addEventListener( 'keydown', function ( event ) {
				if ( event.key === 'Escape' ) {
					close();
				}
			} );
		} );
	}

	/**
	 * Focus the search input when the mobile search panel opens.
	 */
	function bindMobileSearchFocus() {
		var toggle = document.querySelector( '[data-yalla-search-toggle]' );
		var panel = document.querySelector( '[data-yalla-search-panel]' );

		if ( ! toggle || ! panel ) {
			return;
		}

		toggle.addEventListener( 'click', function () {
			if ( toggle.getAttribute( 'aria-expanded' ) !== 'true' ) {
				return;
			}

			var input = panel.querySelector( 'input[type="search"]' );
			if ( input ) {
				input.focus();
			}
		} );
	}

	function init() {
		bindToggle( 'data-yalla-search-toggle' );
		bindToggle( 'data-yalla-menu-toggle' );
		bindDropdowns();
		bindMobileSearchFocus();
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
}() );
