<?php
/**
 * Product search form.
 *
 * REFERENCE: Navbar.tsx lines 84-89.
 *
 * Accepts a $args['yalla_variant'] of 'desktop' (default, hidden below md) or
 * 'inline' (always visible, used inside the mobile search panel). WordPress
 * passes get_search_form() args into this template from 5.2 onwards.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

$yalla_variant = isset( $args['yalla_variant'] ) ? (string) $args['yalla_variant'] : 'desktop';
$yalla_wrapper = 'inline' === $yalla_variant
	? 'flex w-full items-center relative group'
	: 'hidden md:flex flex-1 max-w-md items-center relative group';

$yalla_rtl        = yalla_is_rtl();
$yalla_icon_side  = $yalla_rtl ? 'right-3.5' : 'left-3.5';
$yalla_input_pads = $yalla_rtl ? 'pr-10 pl-16 text-right' : 'pl-10 pr-16 text-left';
$yalla_id         = 'yalla-search-' . $yalla_variant;
?>
<form role="search" method="get" class="<?php echo esc_attr( $yalla_wrapper ); ?>" action="<?php echo esc_url( home_url( '/' ) ); ?>">
	<span class="absolute <?php echo esc_attr( $yalla_icon_side ); ?> text-[#737373] group-focus-within:text-[#8F7137] transition-colors pointer-events-none">
		<?php yalla_icon( 'search', 'w-4 h-4' ); ?>
	</span>

	<label for="<?php echo esc_attr( $yalla_id ); ?>" class="sr-only">
		<?php echo esc_html( yalla_t( 'Search products', 'ابحث عن المنتجات' ) ); ?>
	</label>

	<input
		id="<?php echo esc_attr( $yalla_id ); ?>"
		type="search"
		name="s"
		value="<?php echo esc_attr( get_search_query() ); ?>"
		placeholder="<?php echo esc_attr( yalla_t( (string) get_option( 'yalla_search_placeholder', 'Search Lebanese crafts, mouneh, artisans...' ), (string) get_option( 'yalla_search_placeholder_ar', 'ابحث عن الحرف اللبنانية والمونة والحرفيين...' ) ) ); ?>"
		class="w-full <?php echo esc_attr( $yalla_input_pads ); ?> py-2.5 text-xs font-normal bg-[#F8F8F6] hover:bg-slate-100/90 text-[#171717] placeholder:text-[#737373] rounded-xl border border-[#E5E5E5] focus:border-[#8F7137] focus:bg-white focus:ring-2 focus:ring-[#8F7137]/15 focus:outline-none transition-all shadow-2xs"
	/>

	<input type="hidden" name="post_type" value="product" />
</form>
