<?php
/**
 * Announcement ticker.
 *
 * REFERENCE: Navbar.tsx lines 65-71.
 * Content comes from Yalla settings; the theme owns presentation only.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

$yalla_ticker = yalla_t(
	(string) get_option( 'yalla_announcement_ticker', '' ),
	(string) get_option( 'yalla_announcement_ticker_ar', '' )
);

if ( '' === trim( $yalla_ticker ) ) {
	return;
}
?>
<div class="bg-[#171717] text-[#F8F8F6] text-[11px] sm:text-xs py-2 px-4 text-center font-bold tracking-wider flex items-center justify-center gap-2 overflow-hidden border-b border-[#8F7137]/30">
	<span class="inline-block text-[#B89753]" aria-hidden="true">&#10024;</span>
	<span class="truncate"><?php echo esc_html( $yalla_ticker ); ?></span>
	<span class="inline-block text-[#B89753]" aria-hidden="true">&#10024;</span>
</div>
