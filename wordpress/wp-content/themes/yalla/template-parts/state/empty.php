<?php
/**
 * Empty state.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

$yalla_title = isset( $args['title'] ) ? (string) $args['title'] : yalla_t( 'Nothing here yet', 'لا يوجد شيء هنا بعد' );
$yalla_body  = isset( $args['body'] ) ? (string) $args['body'] : '';
?>
<div class="flex flex-col items-center justify-center text-center py-16 px-6">
	<div class="w-14 h-14 rounded-2xl bg-[#F3E5AB] border border-[#B89753]/40 flex items-center justify-center text-[#8F7137] mb-4">
		<?php yalla_icon( 'shopping-bag', 'w-6 h-6' ); ?>
	</div>
	<h2 class="text-base font-bold text-[#171717] mb-1.5"><?php echo esc_html( $yalla_title ); ?></h2>
	<?php if ( '' !== $yalla_body ) : ?>
		<p class="text-xs text-[#666666] max-w-sm leading-relaxed"><?php echo esc_html( $yalla_body ); ?></p>
	<?php endif; ?>
</div>
