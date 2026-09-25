import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// A browser scan of the customer pages (home, catalogue, product, checkout,
// account; English and Arabic; phone and desktop) found 98 texts below WCAG AA
// and 56 tap targets under 24px. The muted grey (#737373) and the dark gold
// (#8F7137) sat just under 4.5:1 on the page background (#F8F8F6), gold buttons
// carried white text, and the footer links, slider dots and a checkbox were
// smaller than a fingertip. These checks keep the patterns from returning.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
const EXCLUDE = /[\\/]admin[\\/]|[\\/](AdminView|PageCMSManager|AdminQuickEditor|TextStyleEditor|AdminGuard|SellerDashboard)\.tsx$/;
const walk = (dir: string): string[] => fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : []);
const storeFiles = walk('src/components').filter(f => !EXCLUDE.test(f));
const DARK_BG = /(?<![:\w-])(?:bg-\[#(?:171717|111111|111|0a0a0a|000|000000|1a1a1a|262626)\]|bg-black|bg-(?:neutral|slate|zinc|gray|stone)-(?:800|900|950))(?:\/(?:[4-9]\d|100))?(?![\w-])/;
const classStrings = (src: string) => [...src.matchAll(/(["'`])((?:(?!\1)[^\n])*?)\1/g)].map(m => m[2]);

describe('the store stays readable', () => {
  it('uses the readable grey and dark gold for text on light backgrounds', () => {
    for (const file of storeFiles) {
      const offenders = classStrings(read(file)).filter(c => !DARK_BG.test(c)
        && /(?<![\w-])(?:hover:|group-hover:)?text-\[#(?:737373|8F7137|999999)\](?![\w-])/.test(c));
      expect(offenders, file).toEqual([]);
    }
    const css = read('src/index.css');
    expect(css).toMatch(/--text-muted: #666666;/);
  });

  it('never puts white text on the light gold', () => {
    for (const file of storeFiles) {
      const offenders = classStrings(read(file)).filter(c =>
        /(?<![:\w-])bg-\[#B89753\](?![\w/-])/.test(c) && /(?<![:\w-])text-white(?![\w/-])/.test(c));
      expect(offenders, file).toEqual([]);
    }
  });

  it('gives the footer links, slider dots and the in-stock toggle a 24px target', () => {
    expect(read('src/components/FooterQuickLinks.tsx')).toContain('inline-flex items-center gap-1 min-h-6 text-[11px]');
    expect(read('src/components/Footer.tsx').match(/inline-flex items-center min-h-6 text-xs text-neutral-300/g)?.length).toBe(2);
    expect(read('src/components/HeroBanner.tsx')).toContain('group h-6 min-w-6 px-1 -my-[9px] flex items-center justify-center');
    expect(read('src/components/HomepagePromoSlider.tsx')).toContain('group h-6 min-w-6 -my-[9px] flex items-center justify-center');
    expect(read('src/components/ProductsView.tsx')).toMatch(/<label className="flex items-center gap-2 min-h-6 cursor-pointer[^"]*">\s*<input\s+type="checkbox"\s+id="in-stock-only-checkbox"/);
  });
});
