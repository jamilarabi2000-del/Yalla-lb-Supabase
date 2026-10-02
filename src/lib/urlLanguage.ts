export type UrlLanguage = 'ar' | 'en';

/** The language an address asks for with ?lang=, or null when it asks for none (or for anything else). */
export const languageFromSearch = (search: string): UrlLanguage | null => {
  const lang = new URLSearchParams(search).get('lang');
  return lang === 'ar' || lang === 'en' ? lang : null;
};

/**
 * The same address with its ?lang= set to the visitor's choice, or null when
 * the address has no ?lang= (nothing to keep in step) or already says so.
 * A ?lang= only seeds the language when the page opens; keeping it in step
 * means a reload or a copied link agrees with what the screen shows.
 */
export const addressWithLanguage = (href: string, lang: UrlLanguage): string | null => {
  const url = new URL(href);
  if (!url.searchParams.has('lang') || url.searchParams.get('lang') === lang) return null;
  url.searchParams.set('lang', lang);
  return url.toString();
};
