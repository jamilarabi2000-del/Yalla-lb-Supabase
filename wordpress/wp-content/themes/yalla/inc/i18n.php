<?php
/**
 * Bilingual bridge (EN / AR).
 *
 * MODEL: Option A from docs/woocommerce-migration/CURRENT-YALLA-INVENTORY.md §10
 * -- sibling "_ar" fields on the same record, matching the reference
 * application's arabicName / titleArabic / seo_arabic_description shape.
 * No duplicate posts, no multilingual plugin.
 *
 * Every function is guarded with function_exists(). WordPress loads plugins
 * before themes, so the Yalla Core i18n module can supersede all of this
 * without touching the theme. If the model is ever revisited in favour of
 * Polylang/WPML (Option B), this file is the only place the theme needs to
 * change.
 *
 * @package Yalla
 */

declare( strict_types = 1 );

defined( 'ABSPATH' ) || exit;

const YALLA_LANGS       = array( 'en', 'ar' );
const YALLA_LANG_COOKIE = 'yalla_lang';

if ( ! function_exists( 'yalla_default_lang' ) ) {
	/**
	 * Site default language.
	 */
	function yalla_default_lang(): string {
		$default = (string) get_option( 'yalla_default_language', 'en' );

		return in_array( $default, YALLA_LANGS, true ) ? $default : 'en';
	}
}

if ( ! function_exists( 'yalla_lang' ) ) {
	/**
	 * Active language for this request.
	 *
	 * Resolution order: ?lang= query var, then cookie, then site default.
	 * Mirrors App.tsx, which reads ?lang= and falls back to stored state.
	 */
	function yalla_lang(): string {
		static $lang = null;

		if ( null !== $lang ) {
			return $lang;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only display preference.
		$requested = isset( $_GET['lang'] ) ? sanitize_key( wp_unslash( $_GET['lang'] ) ) : '';

		if ( in_array( $requested, YALLA_LANGS, true ) ) {
			$lang = $requested;
			return $lang;
		}

		$cookie = isset( $_COOKIE[ YALLA_LANG_COOKIE ] )
			? sanitize_key( wp_unslash( $_COOKIE[ YALLA_LANG_COOKIE ] ) )
			: '';

		$lang = in_array( $cookie, YALLA_LANGS, true ) ? $cookie : yalla_default_lang();

		return $lang;
	}
}

if ( ! function_exists( 'yalla_is_rtl' ) ) {
	/**
	 * Whether the active language renders right-to-left.
	 */
	function yalla_is_rtl(): bool {
		return 'ar' === yalla_lang();
	}
}

if ( ! function_exists( 'yalla_persist_lang' ) ) {
	/**
	 * Persist an explicit ?lang= choice to a cookie.
	 *
	 * Runs before output so the header can be sent. Not httponly: the value is
	 * a display preference with no security meaning, and client code reads it.
	 */
	function yalla_persist_lang(): void {
		if ( headers_sent() ) {
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only display preference.
		$requested = isset( $_GET['lang'] ) ? sanitize_key( wp_unslash( $_GET['lang'] ) ) : '';

		if ( ! in_array( $requested, YALLA_LANGS, true ) ) {
			return;
		}

		$current = isset( $_COOKIE[ YALLA_LANG_COOKIE ] )
			? sanitize_key( wp_unslash( $_COOKIE[ YALLA_LANG_COOKIE ] ) )
			: '';

		if ( $current === $requested ) {
			return;
		}

		setcookie(
			YALLA_LANG_COOKIE,
			$requested,
			array(
				'expires'  => time() + YEAR_IN_SECONDS,
				'path'     => COOKIEPATH ? COOKIEPATH : '/',
				'domain'   => COOKIE_DOMAIN,
				'secure'   => is_ssl(),
				'httponly' => false,
				'samesite' => 'Lax',
			)
		);
	}
}
add_action( 'init', 'yalla_persist_lang' );

if ( ! function_exists( 'yalla_t' ) ) {
	/**
	 * Pick a string by active language, falling back to English.
	 *
	 * Mirrors the reference pattern: language === 'ar' ? (ar || en) : (en || ar)
	 *
	 * @param string $en English text.
	 * @param string $ar Arabic text.
	 */
	function yalla_t( string $en, string $ar = '' ): string {
		if ( yalla_is_rtl() ) {
			return '' !== trim( $ar ) ? $ar : $en;
		}

		return '' !== trim( $en ) ? $en : $ar;
	}
}

if ( ! function_exists( 'yalla_meta' ) ) {
	/**
	 * Read a post meta value in the active language.
	 *
	 * Under Arabic, "{$key}_ar" is preferred and falls back to "{$key}".
	 * Example: yalla_meta( $id, '_yalla_craft_story' ) reads
	 * _yalla_craft_story_ar first when the site is in Arabic.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $key     Base meta key.
	 * @param string $default Value when neither key is set.
	 */
	function yalla_meta( int $post_id, string $key, string $default = '' ): string {
		if ( yalla_is_rtl() ) {
			$arabic = (string) get_post_meta( $post_id, $key . '_ar', true );

			if ( '' !== trim( $arabic ) ) {
				return $arabic;
			}
		}

		$value = (string) get_post_meta( $post_id, $key, true );

		return '' !== trim( $value ) ? $value : $default;
	}
}

if ( ! function_exists( 'yalla_term_meta' ) ) {
	/**
	 * Read a term meta value in the active language.
	 *
	 * @param int    $term_id Term ID.
	 * @param string $key     Base meta key.
	 * @param string $default Value when neither key is set.
	 */
	function yalla_term_meta( int $term_id, string $key, string $default = '' ): string {
		if ( yalla_is_rtl() ) {
			$arabic = (string) get_term_meta( $term_id, $key . '_ar', true );

			if ( '' !== trim( $arabic ) ) {
				return $arabic;
			}
		}

		$value = (string) get_term_meta( $term_id, $key, true );

		return '' !== trim( $value ) ? $value : $default;
	}
}

if ( ! function_exists( 'yalla_product_title' ) ) {
	/**
	 * Product title in the active language.
	 *
	 * Reproduces ProductCard.tsx: the card shows ONE language only --
	 * arabicName || name under Arabic.
	 *
	 * @param WC_Product|int $product Product or ID.
	 */
	function yalla_product_title( $product ): string {
		$product = is_numeric( $product ) ? wc_get_product( $product ) : $product;

		if ( ! $product instanceof WC_Product ) {
			return '';
		}

		$id      = $product->get_id();
		$english = $product->get_name();

		if ( yalla_is_rtl() ) {
			$arabic = (string) get_post_meta( $id, '_yalla_name_ar', true );

			if ( '' !== trim( $arabic ) ) {
				return $arabic;
			}
		}

		return $english;
	}
}

if ( ! function_exists( 'yalla_term_name' ) ) {
	/**
	 * Term name in the active language, using the yalla_name_ar term meta.
	 *
	 * @param WP_Term|int $term Term or ID.
	 */
	function yalla_term_name( $term ): string {
		$term = is_numeric( $term ) ? get_term( (int) $term ) : $term;

		if ( ! $term instanceof WP_Term ) {
			return '';
		}

		if ( yalla_is_rtl() ) {
			$arabic = (string) get_term_meta( $term->term_id, 'yalla_name_ar', true );

			if ( '' !== trim( $arabic ) ) {
				return $arabic;
			}
		}

		return $term->name;
	}
}

if ( ! function_exists( 'yalla_lang_switch_url' ) ) {
	/**
	 * URL that switches to the other language, preserving the current page.
	 */
	function yalla_lang_switch_url(): string {
		$target = yalla_is_rtl() ? 'en' : 'ar';

		global $wp;
		$current = home_url( add_query_arg( array(), $wp->request ? $wp->request : '' ) );

		return add_query_arg( 'lang', $target, $current );
	}
}
