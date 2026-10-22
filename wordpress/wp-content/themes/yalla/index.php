<?php
/**
 * Fallback template.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

get_header();
?>
<div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
	<?php if ( have_posts() ) : ?>
		<div class="space-y-6">
			<?php
			while ( have_posts() ) :
				the_post();
				?>
				<article <?php post_class( 'premium-card rounded-xl p-5 sm:p-6' ); ?>>
					<h2 class="text-base sm:text-lg font-bold text-[#171717] mb-2">
						<a href="<?php the_permalink(); ?>" class="hover:text-[#8F7137] transition-colors"><?php the_title(); ?></a>
					</h2>
					<div class="text-xs text-[#666666] leading-relaxed"><?php the_excerpt(); ?></div>
				</article>
				<?php
			endwhile;
			?>
		</div>

		<div class="mt-8"><?php the_posts_pagination(); ?></div>
	<?php else : ?>
		<?php
		get_template_part(
			'template-parts/state/empty',
			null,
			array( 'title' => yalla_t( 'Nothing found', 'لم يتم العثور على شيء' ) )
		);
		?>
	<?php endif; ?>
</div>
<?php
get_footer();
