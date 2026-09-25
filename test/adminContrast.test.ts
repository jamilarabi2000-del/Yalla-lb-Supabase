import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// An earlier restyle swapped white text for dark text across the admin,
// including on dark buttons, badges, gradients and a black-filled set of CMS
// inputs, which left them near 1:1. Contrast was measured in a real browser on
// every admin module (WCAG AA) and fixed at the source; these checks keep the
// dark-on-dark pattern from coming back in places no scan happens to render.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
const walk = (dir: string): string[] => fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : []);
const adminFiles = [...walk('src/components/admin'), 'src/components/PageCMSManager.tsx', 'src/components/AdminView.tsx'];

// Unprefixed tokens only: `hover:bg-black` or `placeholder:text-slate-900` say nothing about the resting state.
const NP = String.raw`(?<![:\w-])`;
const END = String.raw`(?![\w/-])`;
const DARK_BG = new RegExp(NP + String.raw`bg-(?:(?:indigo|violet|purple|blue|emerald|green|rose|red|sky|cyan|teal|pink|fuchsia)-(?:600|700|800|900|950)|(?:slate|neutral|zinc|gray|stone)-(?:700|800|900|950)|black|\[#(?:000|000000|111|111111|171717|0d0d0d|1a1a1a|262626|4f46e5|C62828|16803C)\])(?:/(?:[4-9]\d|100))?` + END);
const DARK_GRADIENT = new RegExp(NP + String.raw`from-(?:(?:indigo|violet|purple|blue|emerald|teal|rose|slate|neutral|zinc|gray)-(?:600|700|800|900|950)|black|\[#(?:4f46e5|2a1c06|06241a)\])(?:/\d+)?` + END);
const DARK_TEXT = new RegExp(NP + String.raw`text-(?:slate-(?:800|900|950)|\[#111\]|\[#111111\]|black)` + END);

const classStrings = (src: string) => [...src.matchAll(/(["'`])((?:(?!\1)[^\n])*?)\1/g)].map(m => m[2]);

describe('admin text stays readable', () => {
  it('never puts dark text on a dark or saturated background', () => {
    for (const file of adminFiles) {
      const offenders = classStrings(read(file)).filter(c => !c.includes('${')
        && DARK_TEXT.test(c) && (DARK_BG.test(c) || (c.includes('bg-gradient') && DARK_GRADIENT.test(c))));
      expect(offenders, file).toEqual([]);
    }
  });

  it('fills CMS text fields white, not black', () => {
    expect(read('src/components/admin/cms/CMSHomeTab.tsx')).not.toMatch(/rounded-lg bg-black border border-slate-200 text-xs text-slate-900/);
  });

  it('gives the dark storefront preview light text', () => {
    const preview = read('src/components/admin/ReadOnlyStorefrontPreview.tsx');
    expect(preview).toMatch(/bg-\[#000\] text-white/);
    expect(preview).toMatch(/sectionTitle\([^;]*newsletterSubtitle[^;]*, true\)/);
  });
});
