<?php
/**
 * Site header.
 *
 * REFERENCE: src/components/Navbar.tsx
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;
?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<?php wp_head(); ?>
</head>

<body <?php body_class( 'min-h-screen flex flex-col bg-[#F7F7F8] text-[#111111] selection:bg-[#F3E5AB] selection:text-[#111111] font-sans antialiased' ); ?>>
<?php wp_body_open(); ?>

<a href="#main-content" class="skip-link"><?php esc_html_e( 'Skip to main content', 'yalla' ); ?></a>

<div class="min-h-screen flex flex-col">

	<?php get_template_part( 'template-parts/header/navbar' ); ?>

	<main id="main-content" tabindex="-1" class="flex-1 focus:outline-none">
