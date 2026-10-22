<?php
/**
 * Template helpers.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

if ( ! function_exists( 'yalla_discount_percentage' ) ) {
	/**
	 * Discount percentage for a product.
	 *
	 * The reference schema stored products.discount_percentage as a column.
	 * It is derived here instead -- see DATA-MAPPING.md §1, which drops that
	 * column because WooCommerce computes it from regular vs sale price.
	 *
	 * @param WC_Product $product Product.
	 * @return int Whole percent, 0 when not on sale.
	 */
	function yalla_discount_percentage( WC_Product $product ): int {
		if ( ! $product->is_on_sale() ) {
			return 0;
		}

		$regular = (float) $product->get_regular_price();
		$sale    = (float) $product->get_sale_price();

		if ( $regular <= 0 || $sale <= 0 || $sale >= $regular ) {
			return 0;
		}

		return (int) round( ( ( $regular - $sale ) / $regular ) * 100 );
	}
}

if ( ! function_exists( 'yalla_low_stock_threshold' ) ) {
	/**
	 * Low-stock threshold for a product.
	 *
	 * ProductCard.tsx uses `product.lowStockThreshold ?? 5`. WooCommerce stores
	 * a per-product _low_stock_amount and falls back to a global setting; the
	 * reference default of 5 is used when neither is set.
	 *
	 * @param WC_Product $product Product.
	 */
	function yalla_low_stock_threshold( WC_Product $product ): int {
		$product_level = $product->get_low_stock_amount();

		if ( '' !== $product_level && null !== $product_level ) {
			return (int) $product_level;
		}

		$global = get_option( 'woocommerce_notify_low_stock_amount', '' );

		return '' !== $global ? (int) $global : 5;
	}
}

if ( ! function_exists( 'yalla_product_badges' ) ) {
	/**
	 * Badge list for a product card, in render order.
	 *
	 * Reproduces the badge stack in ProductCard.tsx exactly:
	 *   1. Out of stock            (rose)   -- OR --
	 *      Low stock               (amber)  [mutually exclusive with 1]
	 *   2. Discount                (#C62828)
	 *   3. Bestseller              (#16803C) only when NOT discounted and in stock
	 *
	 * @param WC_Product $product Product.
	 * @return array<int,array{label:string,classes:string}>
	 */
	function yalla_product_badges( WC_Product $product ): array {
		$badges = array();
		$stock  = $product->get_stock_quantity();
		$stock  = null === $stock ? ( $product->is_in_stock() ? PHP_INT_MAX : 0 ) : (int) $stock;

		$base = 'px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white rounded-md shadow-xs';

		if ( 0 === $stock || ! $product->is_in_stock() ) {
			$badges[] = array(
				'label'   => yalla_t( 'Out of Stock', 'غير متوفر' ),
				'classes' => $base . ' bg-rose-600',
			);
		} elseif ( $stock <= yalla_low_stock_threshold( $product ) ) {
			$notice = (string) get_post_meta( $product->get_id(), '_yalla_low_stock_notice', true );

			if ( '' === trim( $notice ) ) {
				$notice = 1 === $stock
					? yalla_t( 'Last piece', 'القطعة الأخيرة' )
					: yalla_t( 'Limited Stock', 'كمية محدودة' );
			}

			$badges[] = array(
				'label'   => $notice,
				'classes' => $base . ' bg-amber-600',
			);
		}

		$discount = yalla_discount_percentage( $product );

		if ( $discount > 0 ) {
			$badges[] = array(
				'label'   => '-' . $discount . '%',
				'classes' => 'px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-[#C62828] text-white rounded-md shadow-xs',
			);
		}

		$is_bestseller = (bool) get_post_meta( $product->get_id(), '_yalla_is_bestseller', true );

		if ( $is_bestseller && 0 === $discount && $stock > 0 ) {
			$badges[] = array(
				'label'   => yalla_t( 'Bestseller', 'الأكثر مبيعاً' ),
				'classes' => 'px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#16803C] text-white rounded-md shadow-xs',
			);
		}

		return $badges;
	}
}

if ( ! function_exists( 'yalla_product_eyebrow' ) ) {
	/**
	 * Small uppercase gold label above the product title.
	 *
	 * ProductCard.tsx renders product.category here.
	 *
	 * @param WC_Product $product Product.
	 */
	function yalla_product_eyebrow( WC_Product $product ): string {
		$terms = get_the_terms( $product->get_id(), 'product_cat' );

		if ( is_array( $terms ) && ! empty( $terms ) ) {
			return yalla_term_name( $terms[0] );
		}

		return (string) get_post_meta( $product->get_id(), '_yalla_origin', true );
	}
}

if ( ! function_exists( 'yalla_price_html' ) ) {
	/**
	 * Price block for a product card.
	 *
	 * Current price in near-black, original struck through in slate-400 --
	 * matching the price row in ProductCard.tsx.
	 *
	 * @param WC_Product $product Product.
	 */
	function yalla_price_html( WC_Product $product ): string {
		$current = $product->is_on_sale() ? $product->get_sale_price() : $product->get_regular_price();
		$html    = sprintf(
			'<span class="text-sm sm:text-base font-black text-[#171717] tracking-tight">%s</span>',
			wp_kses_post( wc_price( (float) $current ) )
		);

		if ( $product->is_on_sale() && (float) $product->get_regular_price() > 0 ) {
			$html .= sprintf(
				'<span class="text-xs text-slate-400 line-through font-medium">%s</span>',
				wp_kses_post( wc_price( (float) $product->get_regular_price() ) )
			);
		}

		return $html;
	}
}

if ( ! function_exists( 'yalla_card_image' ) ) {
	/**
	 * Product card image.
	 *
	 * object-contain inside an aspect-square box with p-3 padding, matching
	 * ProductCard.tsx. Lazy-loaded.
	 *
	 * @param WC_Product $product Product.
	 */
	function yalla_card_image( WC_Product $product ): string {
		$id = $product->get_image_id();

		if ( ! $id ) {
			return sprintf(
				'<img src="%s" alt="" class="h-full w-full object-contain object-center" loading="lazy" decoding="async" />',
				esc_url( wc_placeholder_img_src( 'yalla-card' ) )
			);
		}

		return wp_get_attachment_image(
			$id,
			'yalla-card',
			false,
			array(
				'class'    => 'h-full w-full object-contain object-center group-hover:scale-105 transition-transform duration-300 ease-out',
				'alt'      => yalla_product_title( $product ),
				'loading'  => 'lazy',
				'decoding' => 'async',
			)
		);
	}
}

if ( ! function_exists( 'yalla_arrow_classes' ) ) {
	/**
	 * Directional arrow classes.
	 *
	 * The reference flips arrow icons under Arabic with rotate-180.
	 *
	 * @param string $base Base sizing classes.
	 */
	function yalla_arrow_classes( string $base = 'w-3.5 h-3.5' ): string {
		return yalla_is_rtl() ? $base . ' rotate-180' : $base;
	}
}
