<?php
/**
 * Asset loading and runtime theming.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

/**
 * Font stacks selectable from Yalla settings.
 *
 * Mirrors CMSThemeConfig.fontFamily in src/types.ts.
 *
 * @return array<string,string>
 */
function yalla_font_stacks(): array {
	return array(
		'plus_jakarta' => '"Plus Jakarta Sans", sans-serif',
		'playfair'     => '"Playfair Display", serif',
		'inter'        => '"Inter", sans-serif',
		'tajawal'      => '"Tajawal", sans-serif',
		'cairo'        => '"Cairo", sans-serif',
		'amiri'        => '"Amiri", serif',
	);
}

/**
 * Enqueue storefront styles and scripts.
 */
function yalla_enqueue_assets(): void {
	$build     = YALLA_THEME_DIR . '/assets/css/build.css';
	$build_ver = file_exists( $build ) ? (string) filemtime( $build ) : YALLA_THEME_VERSION;

	/*
	 * Google Fonts, matching index.html in the reference application exactly.
	 *
	 * PERFORMANCE DEBT: self-hosting these removes two third-party connections
	 * and is scheduled for the performance phase. Kept on the CDN for now so
	 * font rendering is byte-identical to the reference during design sign-off.
	 */
	wp_enqueue_style(
		'yalla-fonts',
		'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Inter:wght@400;500;600;700&family=Tajawal:wght@400;500;700&family=Cairo:wght@400;600;700&family=Amiri:wght@400;700&display=swap',
		array(),
		null // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- version is in the URL.
	);

	// Compiled Tailwind utilities.
	wp_enqueue_style( 'yalla-build', YALLA_THEME_URI . '/assets/css/build.css', array( 'yalla-fonts' ), $build_ver );

	// Design tokens and component classes (style.css carries the theme header).
	wp_enqueue_style( 'yalla-tokens', get_stylesheet_uri(), array( 'yalla-build' ), YALLA_THEME_VERSION );

	wp_add_inline_style( 'yalla-tokens', yalla_runtime_theme_css() );

	wp_enqueue_script(
		'yalla-app',
		YALLA_THEME_URI . '/assets/js/app.js',
		array(),
		YALLA_THEME_VERSION,
		array(
			'strategy'  => 'defer',
			'in_footer' => true,
		)
	);

	wp_localize_script( 'yalla-app', 'yallaConfig', array(
		'restUrl'  => esc_url_raw( rest_url( 'wc/store/v1/' ) ),
		'nonce'    => wp_create_nonce( 'wp_rest' ),
		'lang'     => yalla_lang(),
		'isRtl'    => yalla_is_rtl(),
		'strings'  => array(
			'addToCart'  => yalla_t( 'Add To Cart', 'أضف للسلة' ),
			'quickView'  => yalla_t( 'Quick View', 'نظرة سريعة' ),
			'outOfStock' => yalla_t( 'Out of Stock', 'غير متوفر' ),
		),
	) );
}
add_action( 'wp_enqueue_scripts', 'yalla_enqueue_assets' );

/**
 * Runtime theme overrides.
 *
 * Reproduces the useEffect in App.tsx that writes siteContent.theme.primaryColor
 * into --gold / --gold-dark and swaps document.body.style.fontFamily. Without
 * this the admin loses live theming, which is an existing capability.
 */
function yalla_runtime_theme_css(): string {
	$primary = (string) get_option( 'yalla_theme_primary_color', '' );
	$font    = (string) get_option( 'yalla_theme_font_family', 'plus_jakarta' );
	$stacks  = yalla_font_stacks();

	$css = '';

	if ( '' !== $primary && preg_match( '/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $primary ) ) {
		// App.tsx derives the dark variant by appending "cc" (80% alpha).
		$css .= sprintf(
			':root{--gold:%1$s;--gold-dark:%1$scc;}',
			$primary
		);
	}

	$stack = $stacks[ $font ] ?? $stacks['plus_jakarta'];
	$css  .= sprintf( 'body{font-family:%s;}', $stack );

	// Arabic always overrides the body stack, matching .font-arabic in style.css.
	if ( yalla_is_rtl() ) {
		$css .= 'body{font-family:"Cairo","Tajawal","Plus Jakarta Sans",-apple-system,sans-serif;line-height:1.7;}';
	}

	return $css;
}

/**
 * Preconnect to the font CDN, matching index.html.
 *
 * @param array  $urls          URLs to print.
 * @param string $relation_type Resource hint type.
 * @return array
 */
function yalla_resource_hints( array $urls, string $relation_type ): array {
	if ( 'preconnect' !== $relation_type ) {
		return $urls;
	}

	$urls[] = array( 'href' => 'https://fonts.googleapis.com' );
	$urls[] = array(
		'href'        => 'https://fonts.gstatic.com',
		'crossorigin' => 'anonymous',
	);

	return $urls;
}
add_filter( 'wp_resource_hints', 'yalla_resource_hints', 10, 2 );

/**
 * Theme colour meta tag, matching index.html.
 */
function yalla_theme_color_meta(): void {
	echo '<meta name="theme-color" content="#F8F8F6">' . "\n";
	echo '<meta name="referrer" content="strict-origin-when-cross-origin">' . "\n";
}
add_action( 'wp_head', 'yalla_theme_color_meta', 1 );
