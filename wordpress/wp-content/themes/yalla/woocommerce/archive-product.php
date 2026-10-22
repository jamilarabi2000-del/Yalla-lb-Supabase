<?php
/**
 * Product archive.
 *
 * REFERENCE: src/components/ProductsView.tsx
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

get_header( 'shop' );

/**
 * Hook: woocommerce_before_main_content.
 */
do_action( 'woocommerce_before_main_content' );

$yalla_heading = woocommerce_page_title( false );
?>
<header class="mb-6 sm:mb-8">
	<h1 class="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-[#171717]">
		<?php echo esc_html( $yalla_heading ); ?>
	</h1>

	<?php if ( is_product_category() ) : ?>
		<?php
		$yalla_term = get_queried_object();
		$yalla_desc = $yalla_term instanceof WP_Term
			? yalla_term_meta( $yalla_term->term_id, 'yalla_description', $yalla_term->description )
			: '';
		?>
		<?php if ( '' !== trim( $yalla_desc ) ) : ?>
			<p class="mt-2 text-xs sm:text-sm text-[#666666] leading-relaxed max-w-3xl">
				<?php echo esc_html( wp_strip_all_tags( $yalla_desc ) ); ?>
			</p>
		<?php endif; ?>
	<?php endif; ?>
</header>

<?php if ( woocommerce_product_loop() ) : ?>

	<div class="flex items-center justify-between gap-3 mb-4 sm:mb-5 pb-4 border-b border-[#E5E5E5]">
		<div class="text-[11px] font-semibold text-[#666666]">
			<?php woocommerce_result_count(); ?>
		</div>
		<div class="text-xs">
			<?php woocommerce_catalog_ordering(); ?>
		</div>
	</div>

	<?php
	woocommerce_product_loop_start();

	if ( wc_get_loop_prop( 'total' ) ) {
		while ( have_posts() ) {
			the_post();

			/**
			 * Hook: woocommerce_shop_loop.
			 */
			do_action( 'woocommerce_shop_loop' );

			wc_get_template_part( 'content', 'product' );
		}
	}

	woocommerce_product_loop_end();
	?>

	<div class="mt-8 sm:mt-10">
		<?php woocommerce_pagination(); ?>
	</div>

<?php else : ?>
	<?php
	get_template_part(
		'template-parts/state/empty',
		null,
		array(
			'title' => yalla_t( 'No products found', 'لم يتم العثور على منتجات' ),
			'body'  => yalla_t(
				'Try a different category or search term.',
				'جرّب فئة أخرى أو كلمة بحث مختلفة.'
			),
		)
	);
	?>
<?php endif; ?>

<?php
/**
 * Hook: woocommerce_after_main_content.
 */
do_action( 'woocommerce_after_main_content' );

get_footer( 'shop' );
