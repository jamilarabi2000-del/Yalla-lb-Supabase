/**
 * Let the browser pick a smaller file where one exists, so a phone does not
 * download a photo sized for a desktop screen.
 *
 * - Storage uploads list their widths after `#w=` (mediaUpload.ts): the same
 *   name with another width.
 * - Unsplash resizes on request through its `w` parameter.
 *
 * Anything else (i.ibb.co, the bundled fallback photos) comes in one size and
 * gets no srcset.
 */

const STORAGE_FILE = /^(https:\/\/[^#?]+\/storage\/v1\/object\/public\/[^#?]+-)(\d+)\.(webp|jpg)#w=(\d+(?:,\d+)*)$/;
const UNSPLASH_WIDTHS = [480, 960, 1600];

export function imageSrcSet(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  const stored = STORAGE_FILE.exec(url);
  if (stored) {
    const [, stem, top, ext, list] = stored;
    const widths = list.split(',').map(Number);
    if (widths.length < 2 || !widths.includes(Number(top))) return undefined;
    return widths.map(w => `${stem}${w}.${ext} ${w}w`).join(', ');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'images.unsplash.com') return undefined;
  return UNSPLASH_WIDTHS.map(w => {
    const sized = new URL(parsed.href);
    sized.searchParams.set('w', String(w));
    if (!sized.searchParams.has('auto')) sized.searchParams.set('auto', 'format');
    return `${sized.href} ${w}w`;
  }).join(', ');
}

/** `srcSet` and `sizes` together, or neither: sizes means nothing without a srcset. */
export function responsiveImage(url: string | null | undefined, sizes: string): { srcSet?: string; sizes?: string } {
  const srcSet = imageSrcSet(url);
  return srcSet ? { srcSet, sizes } : {};
}
