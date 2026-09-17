<?php
/**
 * Site footer.
 *
 * REFERENCE: src/components/Footer.tsx
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

$yalla_about_title = yalla_t(
	(string) get_option( 'yalla_footer_about_title', 'About Us' ),
	(string) get_option( 'yalla_footer_about_title_ar', 'من نحن' )
);
$yalla_about_text  = yalla_t(
	(string) get_option( 'yalla_footer_about_text', '' ),
	(string) get_option( 'yalla_footer_about_text_ar', '' )
);
$yalla_phone   = (string) get_option( 'yalla_footer_phone', '' );
$yalla_email   = (string) get_option( 'yalla_footer_email', '' );
$yalla_address = yalla_t(
	(string) get_option( 'yalla_footer_address', '' ),
	(string) get_option( 'yalla_footer_address_ar', '' )
);
$yalla_hours = yalla_t(
	(string) get_option( 'yalla_footer_hours', '' ),
	(string) get_option( 'yalla_footer_hours_ar', '' )
);

$yalla_social = array(
	'instagram' => (string) get_option( 'yalla_social_instagram', '' ),
	'whatsapp'  => (string) get_option( 'yalla_social_whatsapp', '' ),
	'facebook'  => (string) get_option( 'yalla_social_facebook', '' ),
	'email'     => (string) get_option( 'yalla_social_email', $yalla_email ),
	'phone'     => (string) get_option( 'yalla_social_phone', $yalla_phone ),
);

$yalla_copyright = yalla_t(
	(string) get_option( 'yalla_footer_copyright', '' ),
	(string) get_option( 'yalla_footer_copyright_ar', '' )
);

if ( '' === trim( $yalla_copyright ) ) {
	/* translators: %s: current year. */
	$yalla_copyright = sprintf( yalla_t( '© %s Yalla. All Rights Reserved.', '© %s يلا. جميع الحقوق محفوظة.' ), gmdate( 'Y' ) );
}

$yalla_social_base = 'w-9 h-9 rounded-lg bg-white/[0.04] border border-white/10 text-neutral-300 flex items-center justify-center transition-all duration-200 shadow-2xs cursor-pointer group';
?>
	</main>

	<footer class="bg-[#171717] border-t border-[#B89753]/30 text-neutral-400 text-xs relative overflow-hidden select-none">
		<div class="absolute inset-0 bg-[radial-gradient(#B89753_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03] pointer-events-none" aria-hidden="true"></div>
		<div class="absolute left-1/2 -top-24 -translate-x-1/2 w-96 h-48 bg-[#B89753]/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true"></div>

		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 text-center relative z-10 flex flex-col items-center">

			<?php if ( '' !== trim( $yalla_about_text ) ) : ?>
				<div class="w-full relative mb-6">
					<div class="flex items-center justify-center gap-3 mb-3">
						<span class="h-[1px] w-6 sm:w-10 bg-gradient-to-r from-transparent to-[#B89753]/60" aria-hidden="true"></span>
						<h2 class="text-sm sm:text-base font-bold tracking-wider uppercase text-[#B89753] font-sans"><?php echo esc_html( $yalla_about_title ); ?></h2>
						<span class="h-[1px] w-6 sm:w-10 bg-gradient-to-l from-transparent to-[#B89753]/60" aria-hidden="true"></span>
					</div>
					<p class="text-xs text-neutral-300 leading-relaxed font-normal max-w-2xl mx-auto whitespace-pre-line"><?php echo esc_html( $yalla_about_text ); ?></p>
				</div>
			<?php endif; ?>

			<?php if ( '' !== trim( $yalla_phone . $yalla_email . $yalla_address . $yalla_hours ) ) : ?>
				<div class="w-full mb-6 py-4 px-6 rounded-xl bg-white/[0.03] border border-white/10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-center relative">
					<?php if ( '' !== $yalla_phone ) : ?>
						<div class="flex flex-col items-center">
							<span class="text-[10px] font-bold uppercase tracking-wider text-[#B89753] mb-1"><?php echo esc_html( yalla_t( 'Phone', 'الهاتف' ) ); ?></span>
							<a href="<?php echo esc_url( 'tel:' . $yalla_phone ); ?>" class="text-xs text-neutral-300 hover:text-white transition-colors"><?php echo esc_html( $yalla_phone ); ?></a>
						</div>
					<?php endif; ?>

					<?php if ( '' !== $yalla_email ) : ?>
						<div class="flex flex-col items-center">
							<span class="text-[10px] font-bold uppercase tracking-wider text-[#B89753] mb-1"><?php echo esc_html( yalla_t( 'Email', 'البريد الإلكتروني' ) ); ?></span>
							<a href="<?php echo esc_url( 'mailto:' . $yalla_email ); ?>" class="text-xs text-neutral-300 hover:text-white transition-colors"><?php echo esc_html( $yalla_email ); ?></a>
						</div>
					<?php endif; ?>

					<?php if ( '' !== trim( $yalla_address ) ) : ?>
						<div class="flex flex-col items-center">
							<span class="text-[10px] font-bold uppercase tracking-wider text-[#B89753] mb-1"><?php echo esc_html( yalla_t( 'Address', 'العنوان' ) ); ?></span>
							<span class="text-xs text-neutral-300 whitespace-pre-line leading-relaxed"><?php echo esc_html( $yalla_address ); ?></span>
						</div>
					<?php endif; ?>

					<?php if ( '' !== trim( $yalla_hours ) ) : ?>
						<div class="flex flex-col items-center">
							<span class="text-[10px] font-bold uppercase tracking-wider text-[#B89753] mb-1"><?php echo esc_html( yalla_t( 'Hours', 'ساعات العمل' ) ); ?></span>
							<span class="text-xs text-neutral-300 whitespace-pre-line leading-relaxed"><?php echo esc_html( $yalla_hours ); ?></span>
						</div>
					<?php endif; ?>
				</div>
			<?php endif; ?>

			<div class="flex items-center justify-center gap-3 mb-6 relative">
				<?php if ( '' !== $yalla_social['instagram'] ) : ?>
					<a href="<?php echo esc_url( $yalla_social['instagram'] ); ?>" target="_blank" rel="noopener noreferrer" aria-label="Instagram" class="<?php echo esc_attr( $yalla_social_base ); ?> hover:bg-[#B89753] hover:border-[#B89753] hover:text-black">
						<?php yalla_icon( 'instagram', 'w-4 h-4 group-hover:scale-110 transition-transform' ); ?>
					</a>
				<?php endif; ?>

				<?php if ( '' !== $yalla_social['whatsapp'] ) : ?>
					<?php $yalla_wa = preg_replace( '/[^0-9]/', '', $yalla_social['whatsapp'] ); ?>
					<a href="<?php echo esc_url( 'https://wa.me/' . $yalla_wa ); ?>" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" class="<?php echo esc_attr( $yalla_social_base ); ?> hover:bg-[#16803C] hover:border-[#16803C] hover:text-white">
						<?php echo wp_kses( yalla_whatsapp_icon( 'w-4 h-4 group-hover:scale-110 transition-transform' ), yalla_svg_allowed_html() ); ?>
					</a>
				<?php endif; ?>

				<?php if ( '' !== $yalla_social['facebook'] ) : ?>
					<a href="<?php echo esc_url( $yalla_social['facebook'] ); ?>" target="_blank" rel="noopener noreferrer" aria-label="Facebook" class="<?php echo esc_attr( $yalla_social_base ); ?> hover:bg-[#1877F2] hover:border-transparent hover:text-white">
						<?php yalla_icon( 'facebook', 'w-4 h-4 group-hover:scale-110 transition-transform' ); ?>
					</a>
				<?php endif; ?>

				<?php if ( '' !== $yalla_social['email'] ) : ?>
					<a href="<?php echo esc_url( 'mailto:' . $yalla_social['email'] ); ?>" aria-label="Email" class="<?php echo esc_attr( $yalla_social_base ); ?> hover:bg-[#B89753] hover:border-[#B89753] hover:text-black">
						<?php yalla_icon( 'mail', 'w-4 h-4 group-hover:scale-110 transition-transform' ); ?>
					</a>
				<?php endif; ?>

				<?php if ( '' !== $yalla_social['phone'] ) : ?>
					<a href="<?php echo esc_url( 'tel:' . $yalla_social['phone'] ); ?>" aria-label="Call" class="<?php echo esc_attr( $yalla_social_base ); ?> hover:bg-[#16803C] hover:border-[#16803C] hover:text-white">
						<?php yalla_icon( 'phone-call', 'w-4 h-4 group-hover:scale-110 transition-transform' ); ?>
					</a>
				<?php endif; ?>
			</div>

			<div class="pt-4 border-t border-white/10 w-full flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-neutral-400 relative">
				<div class="flex items-center gap-2">
					<span class="whitespace-pre-line text-center sm:text-start leading-relaxed"><?php echo esc_html( $yalla_copyright ); ?></span>
				</div>

				<?php if ( get_option( 'yalla_seller_portal_url' ) ) : ?>
					<div class="flex items-center gap-4 shrink-0">
						<a href="<?php echo esc_url( (string) get_option( 'yalla_seller_portal_url' ) ); ?>" class="inline-flex items-center gap-1.5 text-[#B89753] hover:text-white font-bold transition-colors cursor-pointer">
							<?php yalla_icon( 'store', 'w-3.5 h-3.5' ); ?>
							<span><?php echo esc_html( yalla_t( 'Seller & Merchant Portal', 'بوابة البائعين والتجار' ) ); ?></span>
						</a>
					</div>
				<?php endif; ?>
			</div>
		</div>
	</footer>
</div>

<?php wp_footer(); ?>
</body>
</html>
