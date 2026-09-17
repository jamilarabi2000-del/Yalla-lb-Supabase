<?php
/**
 * Theme supports, menus and image sizes.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

/**
 * Register theme supports.
 */
function yalla_setup(): void {
	load_theme_textdomain( 'yalla', YALLA_THEME_DIR . '/languages' );

	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'custom-logo', array(
		'height'      => 40,
		'width'       => 40,
		'flex-height' => true,
		'flex-width'  => true,
	) );
	add_theme_support( 'html5', array(
		'search-form',
		'comment-form',
		'comment-list',
		'gallery',
		'caption',
		'style',
		'script',
	) );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support( 'responsive-embeds' );

	// WooCommerce. Gallery features are declared so the reference product
	// gallery behaviour is available; templates override the markup.
	add_theme_support( 'woocommerce' );
	add_theme_support( 'wc-product-gallery-zoom' );
	add_theme_support( 'wc-product-gallery-lightbox' );
	add_theme_support( 'wc-product-gallery-slider' );

	register_nav_menus( array(
		'primary'     => __( 'Primary Navigation', 'yalla' ),
		'footer'      => __( 'Footer Quick Links', 'yalla' ),
		'mobile'      => __( 'Mobile Navigation', 'yalla' ),
	) );

	/*
	 * Product card images are rendered inside an aspect-square container with
	 * object-contain, matching ProductCard.tsx. A square crop would letterbox
	 * twice, so an uncropped size is registered instead.
	 */
	add_image_size( 'yalla-card', 600, 600, false );
	add_image_size( 'yalla-card-2x', 1200, 1200, false );
}
add_action( 'after_setup_theme', 'yalla_setup' );

/**
 * Content width used by embeds.
 */
function yalla_content_width(): void {
	$GLOBALS['content_width'] = 1536; // matches max-w-screen-2xl
}
add_action( 'after_setup_theme', 'yalla_content_width', 0 );

/**
 * Add dir="rtl" and the language attribute when Arabic is active.
 *
 * @param string $output Existing language attributes.
 * @return string
 */
function yalla_language_attributes( string $output ): string {
	if ( 'ar' !== yalla_lang() ) {
		return $output;
	}

	// Replace any existing lang/dir rather than appending a duplicate.
	$output = preg_replace( '/\s*\b(lang|dir)="[^"]*"/', '', $output );

	return trim( $output . ' lang="ar" dir="rtl"' );
}
add_filter( 'language_attributes', 'yalla_language_attributes' );

/**
 * Harden: remove the REST user endpoint and disable XML-RPC.
 *
 * The reference application enforced authorization at the database row via
 * RLS. WordPress cannot, so the public surface is reduced instead. See
 * docs/woocommerce-migration/ARCHITECTURE.md risk #1.
 */
add_filter( 'xmlrpc_enabled', '__return_false' );

/**
 * Remove the users route from the public REST API for unauthenticated callers.
 *
 * @param array $endpoints REST endpoints.
 * @return array
 */
function yalla_restrict_rest_users( array $endpoints ): array {
	if ( is_user_logged_in() ) {
		return $endpoints;
	}

	unset( $endpoints['/wp/v2/users'], $endpoints['/wp/v2/users/(?P<id>[\d]+)'] );

	return $endpoints;
}
add_filter( 'rest_endpoints', 'yalla_restrict_rest_users' );
