<?php
/**
 * Mobile navigation panel.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

$yalla_cats = get_terms( array(
	'taxonomy'   => 'product_cat',
	'hide_empty' => false,
	'orderby'    => 'meta_value_num',
	'meta_key'   => 'yalla_display_order', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
	'order'      => 'ASC',
) );
$yalla_cats = is_wp_error( $yalla_cats ) ? array() : $yalla_cats;
?>
<div id="yalla-mobile-menu" class="hidden lg:hidden border-t border-[#E5E5E5] bg-white" data-yalla-menu-panel>
	<nav class="max-w-screen-2xl mx-auto px-3 sm:px-6 py-3 space-y-1" aria-label="<?php esc_attr_e( 'Mobile', 'yalla' ); ?>">
		<div class="px-1 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
			<?php echo esc_html( yalla_t( 'Categories', 'الفئات' ) ); ?>
		</div>

		<?php foreach ( $yalla_cats as $yalla_cat ) : ?>
			<a
				href="<?php echo esc_url( (string) get_term_link( $yalla_cat ) ); ?>"
				class="w-full px-3 py-2.5 rounded-lg text-xs font-semibold text-[#171717] hover:bg-[#F8F8F6] hover:text-[#8F7137] flex items-center gap-2.5 transition-colors"
			>
				<?php $yalla_glyph = yalla_term_meta( $yalla_cat->term_id, 'yalla_icon' ); ?>
				<?php if ( '' !== $yalla_glyph ) : ?>
					<span class="text-sm" aria-hidden="true"><?php echo esc_html( $yalla_glyph ); ?></span>
				<?php endif; ?>
				<span><?php echo esc_html( yalla_term_name( $yalla_cat ) ); ?></span>
			</a>
		<?php endforeach; ?>

		<div class="pt-2 mt-2 border-t border-[#E5E5E5] flex items-center gap-2">
			<a
				href="<?php echo esc_url( function_exists( 'wc_get_page_permalink' ) ? (string) wc_get_page_permalink( 'myaccount' ) : home_url( '/' ) ); ?>"
				class="flex-1 px-3 py-2.5 rounded-lg text-xs font-bold text-[#171717] bg-[#F8F8F6] hover:bg-slate-200 flex items-center justify-center gap-1.5 transition-colors"
			>
				<?php yalla_icon( 'user', 'w-3.5 h-3.5 text-[#8F7137]' ); ?>
				<span><?php echo esc_html( yalla_t( 'Account', 'حسابي' ) ); ?></span>
			</a>
		</div>
	</nav>
</div>
