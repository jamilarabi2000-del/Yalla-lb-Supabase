<?php
/**
 * Primary navigation bar.
 *
 * REFERENCE: src/components/Navbar.tsx
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

$yalla_brand = (string) get_option( 'yalla_brand_name', get_bloginfo( 'name' ) );
$yalla_cats  = get_terms( array(
	'taxonomy'   => 'product_cat',
	'hide_empty' => false,
	'orderby'    => 'meta_value_num',
	'meta_key'   => 'yalla_display_order', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
	'order'      => 'ASC',
) );
$yalla_cats  = is_wp_error( $yalla_cats ) ? array() : $yalla_cats;

$yalla_cart_count = function_exists( 'WC' ) && WC()->cart ? WC()->cart->get_cart_contents_count() : 0;
?>
<header class="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-[#E5E5E5] shadow-2xs">

	<?php get_template_part( 'template-parts/header/announcement' ); ?>

	<div class="max-w-screen-2xl mx-auto px-3 sm:px-6 lg:px-8">
		<div class="flex items-center justify-between h-14 sm:h-16 lg:h-18 gap-2 sm:gap-4">

			<a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="flex items-center gap-2 sm:gap-3 group py-1 flex-shrink-0 select-none">
				<div class="relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#F8F8F6] overflow-hidden border border-[#E5E5E5] shadow-2xs group-hover:border-[#B89753] transition-all flex-shrink-0">
					<?php if ( has_custom_logo() ) : ?>
						<?php
						$yalla_logo_id = (int) get_theme_mod( 'custom_logo' );
						echo wp_get_attachment_image(
							$yalla_logo_id,
							'full',
							false,
							array(
								'class' => 'w-full h-full object-cover group-hover:scale-105 transition-transform',
								'alt'   => $yalla_brand,
							)
						);
						?>
					<?php else : ?>
						<span class="text-[#8F7137] font-black text-lg" aria-hidden="true">Y</span>
					<?php endif; ?>

					<span class="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 flex h-2.5 w-2.5 sm:h-3 sm:w-3" aria-hidden="true">
						<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
						<span class="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-emerald-500"></span>
					</span>
				</div>
				<div class="flex items-center">
					<span class="text-base sm:text-lg lg:text-xl font-bold tracking-tight text-[#171717] uppercase font-sans whitespace-nowrap leading-none">
						<?php echo esc_html( $yalla_brand ); ?>
					</span>
				</div>
			</a>

			<?php get_search_form(); ?>

			<nav class="hidden lg:flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" aria-label="<?php esc_attr_e( 'Primary', 'yalla' ); ?>">
				<div class="relative" data-yalla-dropdown>
					<button
						type="button"
						class="px-3 py-2 rounded-lg transition-all cursor-pointer text-[#737373] hover:text-[#171717] hover:bg-[#F8F8F6] flex items-center gap-1.5"
						aria-expanded="false"
						aria-controls="yalla-category-menu"
						data-yalla-dropdown-toggle
					>
						<span><?php echo esc_html( yalla_t( 'Categories', 'الفئات' ) ); ?></span>
						<?php yalla_icon( 'chevron-down', 'w-3.5 h-3.5 text-[#8F7137] transition-transform duration-200' ); ?>
					</button>

					<div
						id="yalla-category-menu"
						class="hidden absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-[#E5E5E5] py-2 z-50 max-h-[70vh] overflow-y-auto custom-scrollbar"
						data-yalla-dropdown-panel
					>
						<div class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#737373] border-b border-[#E5E5E5] sticky top-0 bg-white z-10">
							<?php echo esc_html( yalla_t( 'Categories', 'الفئات' ) ); ?>
						</div>
						<?php foreach ( $yalla_cats as $yalla_cat ) : ?>
							<a
								href="<?php echo esc_url( (string) get_term_link( $yalla_cat ) ); ?>"
								class="w-full text-left px-4 py-2 text-xs font-semibold text-[#171717] hover:bg-[#F8F8F6] hover:text-[#8F7137] flex items-center gap-2.5 transition-colors cursor-pointer"
							>
								<?php $yalla_icon_glyph = yalla_term_meta( $yalla_cat->term_id, 'yalla_icon' ); ?>
								<?php if ( '' !== $yalla_icon_glyph ) : ?>
									<span class="text-sm" aria-hidden="true"><?php echo esc_html( $yalla_icon_glyph ); ?></span>
								<?php endif; ?>
								<span><?php echo esc_html( yalla_term_name( $yalla_cat ) ); ?></span>
							</a>
						<?php endforeach; ?>
					</div>
				</div>

				<?php if ( get_option( 'yalla_seller_portal_url' ) ) : ?>
					<a
						href="<?php echo esc_url( (string) get_option( 'yalla_seller_portal_url' ) ); ?>"
						class="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer text-[#737373] hover:text-[#8F7137] hover:bg-[#F8F8F6]"
					>
						<?php yalla_icon( 'store', 'w-3.5 h-3.5 text-[#8F7137]' ); ?>
						<span><?php echo esc_html( yalla_t( 'Seller Portal', 'بوابة البائعين' ) ); ?></span>
					</a>
				<?php endif; ?>
			</nav>

			<div class="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">

				<a
					href="<?php echo esc_url( yalla_lang_switch_url() ); ?>"
					class="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F8F8F6] hover:bg-slate-200 text-[#171717] border border-[#E5E5E5] font-bold text-xs transition-colors cursor-pointer flex-shrink-0"
					title="<?php esc_attr_e( 'Switch System Language / تغيير لغة النظام', 'yalla' ); ?>"
				>
					<?php yalla_icon( 'globe', 'w-3.5 h-3.5 text-[#8F7137] flex-shrink-0' ); ?>
					<span class="font-semibold text-xs leading-none"><?php echo esc_html( yalla_is_rtl() ? 'English' : 'العربية' ); ?></span>
				</a>

				<button
					type="button"
					class="md:hidden p-2 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-[#F8F8F6] transition-colors flex items-center justify-center flex-shrink-0 cursor-pointer border border-[#E5E5E5]"
					aria-label="<?php esc_attr_e( 'Search', 'yalla' ); ?>"
					aria-expanded="false"
					aria-controls="yalla-mobile-search"
					data-yalla-search-toggle
				>
					<?php yalla_icon( 'search', 'w-4 h-4 text-[#8F7137]' ); ?>
				</button>

				<?php
				/** Wishlist shortcut. Rendered by the Yalla Core wishlist module. */
				do_action( 'yalla_header_wishlist' );
				?>

				<a
					href="<?php echo esc_url( function_exists( 'wc_get_page_permalink' ) ? (string) wc_get_page_permalink( 'myaccount' ) : home_url( '/' ) ); ?>"
					class="p-2 rounded-lg transition-colors hidden sm:flex items-center justify-center flex-shrink-0 cursor-pointer border text-[#737373] hover:text-[#8F7137] hover:bg-[#F8F8F6] border-[#E5E5E5]"
					title="<?php esc_attr_e( 'My Account & Orders', 'yalla' ); ?>"
				>
					<?php yalla_icon( 'user', 'w-4.5 h-4.5' ); ?>
				</a>

				<button
					type="button"
					class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#171717] hover:bg-[#8F7137] text-white font-bold text-xs tracking-wider shadow-2xs transition-all cursor-pointer flex-shrink-0"
					data-yalla-cart-toggle
					aria-expanded="false"
					aria-controls="yalla-cart-drawer"
				>
					<?php yalla_icon( 'shopping-bag', 'w-4 h-4 text-white flex-shrink-0' ); ?>
					<span class="hidden md:inline uppercase text-[11px] font-bold"><?php echo esc_html( yalla_t( 'Cart', 'السلة' ) ); ?></span>
					<span class="flex items-center justify-center min-w-[18px] h-4 px-1 text-[10px] font-bold bg-[#B89753] text-white rounded-full shadow-2xs" data-yalla-cart-count>
						<?php echo esc_html( (string) $yalla_cart_count ); ?>
					</span>
				</button>

				<button
					type="button"
					class="lg:hidden p-2 rounded-lg text-[#171717] hover:bg-slate-200 bg-[#F8F8F6] border border-[#E5E5E5] transition-all flex items-center justify-center cursor-pointer flex-shrink-0"
					aria-label="<?php esc_attr_e( 'Toggle Navigation Menu', 'yalla' ); ?>"
					aria-expanded="false"
					aria-controls="yalla-mobile-menu"
					data-yalla-menu-toggle
				>
					<?php yalla_icon( 'menu', 'w-4.5 h-4.5 text-[#171717]' ); ?>
				</button>
			</div>
		</div>

		<div id="yalla-mobile-search" class="hidden md:hidden pb-3" data-yalla-search-panel>
			<?php get_search_form( array( 'yalla_variant' => 'inline' ) ); ?>
		</div>
	</div>

	<?php get_template_part( 'template-parts/header/mobile-menu' ); ?>
</header>
