<?php
/**
 * Yalla theme bootstrap.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

define( 'YALLA_THEME_VERSION', '0.1.0' );
define( 'YALLA_THEME_DIR', get_template_directory() );
define( 'YALLA_THEME_URI', get_template_directory_uri() );

/**
 * Load theme modules.
 *
 * i18n.php and template-tags.php declare their functions behind
 * function_exists() guards. WordPress loads plugins before themes, so the
 * Yalla Core plugin can supersede any of them once its i18n module ships
 * without this theme needing to change.
 */
require_once YALLA_THEME_DIR . '/inc/setup.php';
require_once YALLA_THEME_DIR . '/inc/enqueue.php';
require_once YALLA_THEME_DIR . '/inc/i18n.php';
require_once YALLA_THEME_DIR . '/inc/icons.php';
require_once YALLA_THEME_DIR . '/inc/template-tags.php';

if ( class_exists( 'WooCommerce' ) ) {
	require_once YALLA_THEME_DIR . '/inc/woocommerce.php';
}
