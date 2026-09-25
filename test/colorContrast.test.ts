import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { contrastRatio, darken, parseHex, readableTextOn } from '../src/lib/colorContrast';

describe('text on the theme colour stays readable', () => {
  it('measures contrast the WCAG way', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#2563eb')!).toBeGreaterThan(5);
    expect(contrastRatio('#ffffff', '#B89753')!).toBeLessThan(3);
    expect(contrastRatio('red', '#fff')).toBeNull();
  });

  it('keeps white on the live blue and switches to dark text on the default gold', () => {
    expect(readableTextOn('#2563eb')).toBe('#ffffff');
    expect(readableTextOn('#B89753')).toBe('#171717');
    expect(readableTextOn('#c5a059')).toBe('#171717');
    expect(readableTextOn('#8F7137')).toBe('#ffffff');
    // A colour it cannot read keeps the old white.
    expect(readableTextOn('rebeccapurple')).toBe('#ffffff');
  });

  it('darkens to an opaque shade, not a see-through one', () => {
    expect(darken('#2563eb', 0.2)).toBe('#1e4fbc');
    expect(darken('#abc', 0)).toBe('#aabbcc');
    expect(darken('not a colour', 0.2)).toBeNull();
    expect(parseHex('#ABCDEF')).toEqual([171, 205, 239]);
  });

  it('wires the theme and the gold button to it', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).toMatch(/root\.style\.setProperty\('--on-gold', readableTextOn\(primary\)\)/);
    expect(app).toMatch(/root\.style\.setProperty\('--on-gold-dark', readableTextOn\(dark \?\? primary\)\)/);
    expect(app).not.toMatch(/primaryColor \+ 'cc'/);
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toMatch(/\.gold-btn \{ background: var\(--gold\); color: var\(--on-gold\) !important;/);
    expect(css).toMatch(/\.gold-btn:hover \{ background: var\(--gold-dark\); color: var\(--on-gold-dark\) !important;/);
    expect(css).toMatch(/\.skip-link \{[^}]*background:var\(--gold-dark\); color:var\(--on-gold-dark\);/);
  });
});
