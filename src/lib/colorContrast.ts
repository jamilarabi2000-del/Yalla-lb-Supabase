/**
 * Readable text on a colour the administrator picks.
 *
 * The CMS theme's primary colour fills the gold buttons (.gold-btn) and the
 * skip link. White text reads on a dark primary (the live blue, 5.2:1) but not
 * on a light one (the default gold, 2.5:1), so the text colour follows the
 * background: white when it reaches WCAG AA (4.5:1), near-black otherwise.
 */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const DARK_TEXT = '#171717';
export const LIGHT_TEXT = '#ffffff';

/** [r, g, b] 0-255 for #rgb / #rrggbb, or null for anything else. */
export function parseHex(color: string | null | undefined): [number, number, number] | null {
  const m = HEX.exec(String(color ?? '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2.x relative luminance. */
export function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number | null {
  const x = parseHex(a), y = parseHex(b);
  if (!x || !y) return null;
  const [l1, l2] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** White when it reaches 4.5:1 on `background`, otherwise whichever of the two reads better. */
export function readableTextOn(background: string): string {
  const white = contrastRatio(LIGHT_TEXT, background);
  const dark = contrastRatio(DARK_TEXT, background);
  if (white === null || dark === null) return LIGHT_TEXT;
  return white >= 4.5 || white >= dark ? LIGHT_TEXT : DARK_TEXT;
}

/** The same colour mixed `amount` (0-1) of the way toward black, as #rrggbb. */
export function darken(color: string, amount: number): string | null {
  const rgb = parseHex(color);
  if (!rgb) return null;
  const k = 1 - Math.min(Math.max(amount, 0), 1);
  return '#' + rgb.map(c => Math.round(c * k).toString(16).padStart(2, '0')).join('');
}
