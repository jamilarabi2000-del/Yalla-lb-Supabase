import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The CMS Studio is a light surface (bg-slate-50). Much of it had been styled
// for a dark one: near-white field labels, pale -300/-400 accent text and
// dark see-through panel tints, which together made headers and hints hard to
// read. Contrast was measured in a real browser on every tab (WCAG AA) and
// fixed at the source; these checks keep the worst patterns from returning.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
const dir = 'src/components/admin/cms';
const lightFiles = [
  'src/components/PageCMSManager.tsx',
  ...fs.readdirSync(path.resolve(process.cwd(), dir))
    .filter(f => f.endsWith('.tsx') && f !== 'CMSLivePreview.tsx')
    .map(f => `${dir}/${f}`),
];

describe('CMS Studio text stays readable on its light background', () => {
  it('labels every field in a dark, readable colour (one shared label, repeated on every field)', () => {
    expect(read(`${dir}/BilingualField.tsx`)).toContain('block text-xs font-bold text-slate-700 uppercase tracking-wide');
    expect(read(`${dir}/MediaAssetPicker.tsx`)).toContain('block text-xs font-bold text-slate-700 uppercase tracking-wide');
  });

  it('uses no near-white text on the light studio, except on a dark element', () => {
    const darkBg = /\bbg-(?:neutral|slate|zinc|gray)-(?:800|900|950)\b|\bbg-black\b/;
    for (const file of lightFiles) {
      const classes = [...read(file).matchAll(/className=(["'`])([\s\S]*?)\1/g)].map(m => m[2]);
      const offenders = classes.filter(c => /\btext-slate-(?:100|200)\b(?![/\w-])/.test(c) && !darkBg.test(c));
      expect(offenders, file).toEqual([]);
    }
  });

  it('uses no dark see-through panel tints (the live preview backdrop is dark on purpose)', () => {
    for (const file of lightFiles) {
      expect(read(file), file).not.toMatch(/\bbg-(?:sky|emerald|rose|red|amber)-950\/\d+/);
    }
  });

  it('puts light text on the dark badges that sit on photos', () => {
    const home = read(`${dir}/CMSHomeTab.tsx`);
    expect(home).not.toMatch(/bg-black\/70 text-\[9px\] text-slate-900/);
    expect(read(`${dir}/CMSNewsTab.tsx`)).toContain('bg-black/70 backdrop-blur-xs text-white');
  });
});
