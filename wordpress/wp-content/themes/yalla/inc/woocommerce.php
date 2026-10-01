<?php
/**
 * WooCommerce integration.
 *
 * Strips WooCommerce's default storefront chrome so the Yalla templates own
 * the markup entirely. Loaded only when WooCommerce is active.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

/**
 * Remove default wrappers, sidebar and loop chrome.
 */
function yalla_woocommerce_unhook(): void {
	// Default page wrappers -- replaced by yalla_wrapper_start/end.
	remove_action( 'woocommerce_before_main_content', 'woocommerce_output_content_wrapper', 10 );
	remove_action( 'woocommerce_after_main_content', 'woocommerce_output_content_wrapper_end', 10 );

	// No sidebar in the Yalla design.
	remove_action( 'woocommerce_sidebar', 'woocommerce_get_sidebar', 10 );

	// Breadcrumbs are rendered by the Yalla templates where the design calls
	// for them (product detail only), not globally.
	remove_action( 'woocommerce_before_main_content', 'woocommerce_breadcrumb', 20 );

	// The demo store notice is not part of the design.
	remove_action( 'wp_footer', 'woocommerce_demo_store' );
}
add_action( 'init', 'yalla_woocommerce_unhook' );

/**
 * Open the Yalla content wrapper.
 */
function yalla_wrapper_start(): void {
	echo '<div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">';
}
add_action( 'woocommerce_before_main_content', 'yalla_wrapper_start', 10 );

/**
 * Close the Yalla content wrapper.
 */
function yalla_wrapper_end(): void {
	echo '</div>';
}
add_action( 'woocommerce_after_main_content', 'yalla_wrapper_end', 10 );

/**
 * Product grid opening tag.
 *
 * Replaces <ul class="products columns-N"> with the Tailwind grid used by
 * ProductsView.tsx.
 */
function yalla_product_loop_start(): string {
	return '<ul class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5 list-none p-0 m-0">';
}
add_filter( 'woocommerce_product_loop_start', 'yalla_product_loop_start' );

/**
 * Product grid closing tag.
 */
function yalla_product_loop_end(): string {
	return '</ul>';
}
add_filter( 'woocommerce_product_loop_end', 'yalla_product_loop_end' );

/**
 * Products per page.
 *
 * @return int
 */
function yalla_loop_shop_per_page(): int {
	return (int) apply_filters( 'yalla_products_per_page', 24 );
}
add_filter( 'loop_shop_per_page', 'yalla_loop_shop_per_page', 20 );

/**
 * Default catalogue ordering.
 *
 * The reference storefront merchandises by a hand-set display_order, which
 * maps to menu_order. WooCommerce's "menu_order" ordering already does this.
 *
 * @param string $default Current default.
 * @return string
 */
function yalla_default_catalog_orderby( string $default ): string {
	return 'menu_order';
}
add_filter( 'woocommerce_default_catalog_orderby', 'yalla_default_catalog_orderby' );

/**
 * Keep the cart count badge in sync after AJAX add-to-cart.
 *
 * @param array $fragments Refreshed fragments.
 * @return array
 */
function yalla_cart_count_fragment( array $fragments ): array {
	$count = WC()->cart ? WC()->cart->get_cart_contents_count() : 0;

	ob_start();
	printf(
		'<span class="flex items-center justify-center min-w-[18px] h-4 px-1 text-[10px] font-bold bg-[#B89753] text-white rounded-full shadow-2xs" data-yalla-cart-count>%s</span>',
		esc_html( (string) $count )
	);
	$fragments['[data-yalla-cart-count]'] = ob_get_clean();

	return $fragments;
}
add_filter( 'woocommerce_add_to_cart_fragments', 'yalla_cart_count_fragment' );

/**
 * Hide cost and operational product meta from the public REST response.
 *
 * The reference schema protected these at the column level -- see migrations
 * 20260915011351, 20260915011403 and 20260915012216, and the public_catalog
 * view which omits them. PostgreSQL enforced that regardless of query path;
 * WordPress cannot, so it is enforced here.
 *
 * See docs/woocommerce-migration/ARCHITECTURE.md risk #1.
 *
 * @param WP_REST_Response $response Response object.
 * @return WP_REST_Response
 */
function yalla_strip_protected_product_meta( $response ) {
	if ( current_user_can( 'edit_products' ) ) {
		return $response;
	}

	$protected = array(
		'_yalla_cost_price',
		'_wc_cog_cost',
		'_yalla_seller_item_code',
		'_yalla_low_stock_notice',
		'_yalla_custom_stock_label',
		'_low_stock_amount',
		'_yalla_archived_at',
	);

	$data = $response->get_data();

	if ( isset( $data['meta_data'] ) && is_array( $data['meta_data'] ) ) {
		$data['meta_data'] = array_values(
			array_filter(
				$data['meta_data'],
				static function ( $meta ) use ( $protected ) {
					$key = is_object( $meta ) && isset( $meta->key ) ? $meta->key : ( $meta['key'] ?? '' );

					return ! in_array( $key, $protected, true );
				}
			)
		);

		$response->set_data( $data );
	}

	return $response;
}
add_filter( 'woocommerce_rest_prepare_product_object', 'yalla_strip_protected_product_meta', 10, 1 );

/**
 * Register the protected meta keys as private so they are not exposed by the
 * generic post meta REST endpoint either.
 */
function yalla_protect_meta_keys(): void {
	foreach ( array( '_yalla_cost_price', '_wc_cog_cost', '_yalla_seller_item_code' ) as $key ) {
		add_filter(
			"auth_post_meta_{$key}",
			static function ( $allowed, $meta_key, $post_id, $user_id ) {
				return user_can( $user_id, 'edit_products' );
			},
			10,
			4
		);
	}
}
add_action( 'init', 'yalla_protect_meta_keys' );
