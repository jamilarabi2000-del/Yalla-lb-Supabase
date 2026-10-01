<?php
/**
 * Product card.
 *
 * REFERENCE: src/components/ProductCard.tsx
 * Every class below is ported verbatim from that component. Before changing
 * anything here, check it against the reference and against the anatomy
 * recorded in docs/woocommerce-migration/CURRENT-YALLA-INVENTORY.md §8.
 *
 * DELIBERATE DEVIATION: the reference makes the whole card a <div onClick>,
 * which is not keyboard reachable. Here an absolutely positioned <a> covers
 * the card at z-5, sitting under the interactive controls at z-20. The visual
 * result is identical and the card becomes focusable and screen-reader
 * navigable.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

global $product;

if ( ! $product instanceof WC_Product ) {
	return;
}

$yalla_title    = yalla_product_title( $product );
$yalla_badges   = yalla_product_badges( $product );
$yalla_eyebrow  = yalla_product_eyebrow( $product );
$yalla_in_stock = $product->is_in_stock();
?>
<div class="group relative flex flex-col h-full w-full rounded-xl bg-white border border-[#E5E5E5] hover:border-[#B89753]/60 shadow-2xs hover:shadow-lg transition-all duration-300 overflow-hidden">

	<a href="<?php echo esc_url( get_permalink( $product->get_id() ) ); ?>" class="absolute inset-0 z-[5]">
		<span class="sr-only"><?php echo esc_html( $yalla_title ); ?></span>
	</a>

	<div class="relative aspect-square w-full overflow-hidden bg-[#F8F8F6] flex items-center justify-center p-3">

		<?php echo wp_kses_post( yalla_card_image( $product ) ); ?>

		<?php if ( ! empty( $yalla_badges ) ) : ?>
			<div class="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10 pointer-events-none">
				<?php foreach ( $yalla_badges as $yalla_badge ) : ?>
					<span class="<?php echo esc_attr( $yalla_badge['classes'] ); ?>"><?php echo esc_html( $yalla_badge['label'] ); ?></span>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>

		<button
			type="button"
			class="yalla-quick-view absolute bottom-2.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-200 z-20 py-1.5 px-3 rounded-lg bg-white/95 backdrop-blur-xs text-[#171717] hover:text-[#8F7137] text-[11px] font-bold shadow-md border border-[#E5E5E5] flex items-center gap-1 cursor-pointer whitespace-nowrap"
			data-product-id="<?php echo esc_attr( (string) $product->get_id() ); ?>"
			aria-label="<?php echo esc_attr( yalla_t( 'Quick View', 'نظرة سريعة' ) ); ?>"
			title="<?php echo esc_attr( yalla_t( 'Quick View', 'نظرة سريعة' ) ); ?>"
		>
			<?php yalla_icon( 'eye', 'w-3.5 h-3.5' ); ?>
			<span><?php echo esc_html( yalla_t( 'Quick View', 'نظرة سريعة' ) ); ?></span>
		</button>

		<?php
		/**
		 * Wishlist control.
		 *
		 * Rendered by the Yalla Core wishlist module. The button is emitted
		 * here so the card markup stays whole; the module attaches state and
		 * behaviour. Until that module ships the hook has no subscribers and
		 * the slot renders nothing.
		 */
		do_action( 'yalla_product_card_wishlist', $product );
		?>
	</div>

	<div class="flex flex-1 flex-col p-3.5 sm:p-4 justify-between space-y-2.5 bg-white">
		<div>
			<?php if ( '' !== $yalla_eyebrow ) : ?>
				<span class="text-[10px] font-bold uppercase tracking-wider text-[#8F7137] line-clamp-1 block mb-0.5">
					<?php echo esc_html( $yalla_eyebrow ); ?>
				</span>
			<?php endif; ?>

			<h3 class="text-xs sm:text-sm font-bold text-[#171717] group-hover:text-[#8F7137] transition-colors line-clamp-2 leading-snug">
				<?php echo esc_html( $yalla_title ); ?>
			</h3>
		</div>

		<div class="pt-2 border-t border-[#E5E5E5] mt-auto flex flex-col gap-2">
			<div class="flex items-baseline justify-between gap-1.5">
				<div class="flex items-baseline gap-1.5 flex-wrap">
					<?php echo wp_kses_post( yalla_price_html( $product ) ); ?>
				</div>
			</div>

			<div class="relative z-20 flex items-center gap-1.5 w-full">
				<?php if ( $yalla_in_stock && $product->is_purchasable() && ! $product->is_type( 'variable' ) ) : ?>
					<a
						href="<?php echo esc_url( $product->add_to_cart_url() ); ?>"
						data-quantity="1"
						data-product_id="<?php echo esc_attr( (string) $product->get_id() ); ?>"
						data-product_sku="<?php echo esc_attr( $product->get_sku() ); ?>"
						rel="nofollow"
						class="add_to_cart_button ajax_add_to_cart flex-1 w-full py-2 px-3 rounded-lg bg-[#171717] hover:bg-[#8F7137] text-white flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shadow-2xs active:scale-[0.98] text-xs font-bold text-center"
						aria-label="<?php echo esc_attr( yalla_t( 'Add To Cart', 'أضف للسلة' ) ); ?>"
					>
						<?php yalla_icon( 'shopping-bag', 'w-3.5 h-3.5 shrink-0' ); ?>
						<span class="whitespace-nowrap"><?php echo esc_html( yalla_t( 'Add To Cart', 'أضف للسلة' ) ); ?></span>
					</a>
				<?php else : ?>
					<a
						href="<?php echo esc_url( get_permalink( $product->get_id() ) ); ?>"
						class="flex-1 w-full py-2 px-3 rounded-lg bg-[#171717] hover:bg-[#8F7137] text-white flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shadow-2xs active:scale-[0.98] text-xs font-bold text-center<?php echo $yalla_in_stock ? '' : ' opacity-40 pointer-events-none'; ?>"
						<?php echo $yalla_in_stock ? '' : 'aria-disabled="true" tabindex="-1"'; ?>
					>
						<?php yalla_icon( 'shopping-bag', 'w-3.5 h-3.5 shrink-0' ); ?>
						<span class="whitespace-nowrap">
							<?php
							echo esc_html(
								$yalla_in_stock
									? yalla_t( 'Select Options', 'اختر الخيارات' )
									: yalla_t( 'Out of Stock', 'غير متوفر' )
							);
							?>
						</span>
					</a>
				<?php endif; ?>
			</div>
		</div>
	</div>
</div>
