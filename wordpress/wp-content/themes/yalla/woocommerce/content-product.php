<?php
/**
 * Product loop item.
 *
 * Overrides woocommerce/templates/content-product.php so the archive renders
 * the Yalla card instead of WooCommerce's default loop markup.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

global $product;

if ( empty( $product ) || ! $product->is_visible() ) {
	return;
}
?>
<li <?php wc_product_class( 'h-full', $product ); ?>>
	<?php get_template_part( 'template-parts/product/card' ); ?>
</li>
