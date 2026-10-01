<?php
/**
 * Inline SVG icons.
 *
 * The reference application uses lucide-react. These are the same Lucide
 * glyphs inlined as SVG so the theme ships no icon font, no icon library and
 * no extra HTTP request -- per master task §21, "do not add unnecessary
 * JavaScript".
 *
 * Paths are Lucide (ISC licence). Stroke geometry is preserved exactly so the
 * icons are visually identical to the reference build.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

/**
 * Icon path definitions, keyed by Lucide name.
 *
 * @return array<string,string>
 */
function yalla_icon_paths(): array {
	return array(
		'search'        => '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
		'chevron-down'  => '<path d="m6 9 6 6 6-6"/>',
		'chevron-left'  => '<path d="m15 18-6-6 6-6"/>',
		'chevron-right' => '<path d="m9 18 6-6-6-6"/>',
		'store'         => '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>',
		'shield-check'  => '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
		'globe'         => '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
		'heart'         => '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
		'user'          => '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
		'shopping-bag'  => '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
		'menu'          => '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
		'x'             => '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
		'trash-2'       => '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
		'eye'           => '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
		'phone-call'    => '<path d="M13 2a9 9 0 0 1 9 9"/><path d="M13 6a5 5 0 0 1 5 5"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92"/>',
		'mail'          => '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
		'instagram'     => '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>',
		'facebook'      => '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
		'truck'         => '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
		'clock'         => '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
		'rotate-ccw'    => '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
		'arrow-right'   => '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
		'star'          => '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.11a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.896a.53.53 0 0 1 .294-.904l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
		'loader'        => '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
		'check-circle'  => '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
		'alert-circle'  => '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
		'info'          => '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
	);
}

/**
 * Return an inline SVG icon.
 *
 * @param string $name    Lucide icon name.
 * @param string $classes Tailwind classes for the svg element.
 * @param bool   $filled  Fill the glyph with currentColor (used by the active
 *                        wishlist heart and star ratings).
 */
function yalla_get_icon( string $name, string $classes = 'w-4 h-4', bool $filled = false ): string {
	$paths = yalla_icon_paths();

	if ( ! isset( $paths[ $name ] ) ) {
		return '';
	}

	return sprintf(
		'<svg xmlns="http://www.w3.org/2000/svg" class="%1$s" viewBox="0 0 24 24" fill="%2$s" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">%3$s</svg>',
		esc_attr( $classes ),
		$filled ? 'currentColor' : 'none',
		$paths[ $name ]
	);
}

/**
 * Echo an inline SVG icon.
 *
 * @param string $name    Lucide icon name.
 * @param string $classes Tailwind classes.
 * @param bool   $filled  Fill with currentColor.
 */
function yalla_icon( string $name, string $classes = 'w-4 h-4', bool $filled = false ): void {
	echo wp_kses( yalla_get_icon( $name, $classes, $filled ), yalla_svg_allowed_html() );
}

/**
 * Allowed SVG markup for wp_kses.
 *
 * @return array<string,array<string,bool>>
 */
function yalla_svg_allowed_html(): array {
	$attrs = array(
		'xmlns' => true, 'class' => true, 'viewBox' => true, 'viewbox' => true,
		'fill' => true, 'stroke' => true, 'stroke-width' => true,
		'stroke-linecap' => true, 'stroke-linejoin' => true,
		'aria-hidden' => true, 'focusable' => true, 'width' => true, 'height' => true,
	);

	return array(
		'svg'      => $attrs,
		'path'     => array( 'd' => true, 'fill' => true, 'stroke' => true ),
		'circle'   => array( 'cx' => true, 'cy' => true, 'r' => true, 'fill' => true ),
		'rect'     => array( 'x' => true, 'y' => true, 'width' => true, 'height' => true, 'rx' => true, 'ry' => true ),
		'line'     => array( 'x1' => true, 'x2' => true, 'y1' => true, 'y2' => true ),
		'polyline' => array( 'points' => true ),
		'g'        => array( 'fill' => true, 'stroke' => true ),
	);
}

/**
 * WhatsApp brand glyph.
 *
 * Not a Lucide icon -- this is the filled brand mark used in Footer.tsx,
 * copied verbatim so the footer social row is pixel-identical.
 */
function yalla_whatsapp_icon( string $classes = 'w-4 h-4' ): string {
	return sprintf(
		'<svg xmlns="http://www.w3.org/2000/svg" class="%s fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.68 12.04 3.68C14.25 3.68 16.31 4.54 17.87 6.1C19.42 7.66 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15ZM16.56 14.39C16.31 14.27 15.09 13.67 14.86 13.58C14.63 13.5 14.47 13.46 14.3 13.7C14.14 13.95 13.67 14.5 13.53 14.67C13.38 14.83 13.24 14.85 12.99 14.73C12.75 14.61 11.96 14.35 11.02 13.51C10.29 12.86 9.79 12.05 9.65 11.81C9.51 11.56 9.63 11.43 9.75 11.31C9.86 11.2 10.00 11.02 10.12 10.88C10.24 10.74 10.28 10.63 10.37 10.47C10.45 10.3 10.41 10.16 10.35 10.04C10.29 9.92 9.79 8.7 9.59 8.2C9.39 7.72 9.18 7.78 9.03 7.78L8.55 7.77C8.39 7.77 8.12 7.83 7.89 8.08C7.67 8.32 7.03 8.92 7.03 10.14C7.03 11.36 7.92 12.54 8.04 12.7C8.16 12.87 9.79 15.38 12.28 16.46C12.87 16.72 13.33 16.87 13.69 16.99C14.29 17.18 14.83 17.15 15.26 17.09C15.74 17.02 16.73 16.49 16.93 15.92C17.14 15.35 17.14 14.86 17.08 14.75C17.02 14.65 16.81 14.52 16.56 14.39Z"/></svg>',
		esc_attr( $classes )
	);
}
