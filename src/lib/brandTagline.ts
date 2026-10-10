/**
 * The line shown under the brand name in the header, from Admin > CMS Studio > Navbar > Brand Tagline.
 *
 * English shows the English tagline only; Arabic shows the Arabic one and falls back to the English one when
 * no Arabic tagline is set (as the footer's copyright line does). Both empty: no line at all. Whitespace is
 * trimmed and runs of it (including line breaks) become one space, so a stray Enter never makes a tall header,
 * and a tagline of only spaces counts as empty.
 */
const clean = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

export const brandTagline = (
  navbar: { brandSubtitle?: string; brandSubtitleArabic?: string } | null | undefined,
  language: string,
): string => {
  const english = clean(navbar?.brandSubtitle);
  return language === 'ar' ? clean(navbar?.brandSubtitleArabic) || english : english;
};
