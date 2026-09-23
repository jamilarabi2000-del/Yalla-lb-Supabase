import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  TEXT_FONTS,
  UNSAFE_CSS_VALUE,
  buildTextRulesCss,
  isEmptyStyle,
  parseTextRules,
  ruleSelector,
  sanitizeStyle,
  sanitizeValue,
  type CMSTextRule,
} from '../src/lib/textStyleRules';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const rule = (over: Partial<CMSTextRule> = {}): CMSTextRule => ({
  id: 'tr_abcdef123456', text: 'Add to Cart', tag: 'button', scope: '[data-cms-element="product-detail"]',
  page: 'product_detail', style: { desktop: { color: '#c62828', 'font-size': '18px' } }, updatedAt: '2026-09-23T00:00:00Z',
  ...over,
});

/** [ids, classes/attributes/pseudo-classes, elements] of a simple selector. */
function specificity(selector: string): [number, number, number] {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\[[^\]]+\]|\.[\w-]+|:(?!:)[\w-]+/g) || []).length;
  const elements = (selector.replace(/#[\w-]+|\[[^\]]+\]|\.[\w-]+|:+[\w-]+/g, ' ').match(/[a-z][\w-]*/gi) || []).length;
  return [ids, classes, elements];
}
const outranks = (a: string, b: string) => {
  const [x, y] = [specificity(a), specificity(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

describe('values cannot break out of a declaration', () => {
  it('accepts what each property really takes', () => {
    expect(sanitizeValue('color', '#C62828')).toBe('#C62828');
    expect(sanitizeValue('color', 'rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)');
    expect(sanitizeValue('font-size', '18px')).toBe('18px');
    expect(sanitizeValue('font-size', '1.25rem')).toBe('1.25rem');
    expect(sanitizeValue('letter-spacing', '-0.5px')).toBe('-0.5px');
    expect(sanitizeValue('line-height', '1.6')).toBe('1.6');
    expect(sanitizeValue('font-weight', '700')).toBe('700');
    expect(sanitizeValue('text-align', 'center')).toBe('center');
    expect(sanitizeValue('font-family', TEXT_FONTS[1].value)).toBe(TEXT_FONTS[1].value);
  });

  it('refuses anything that could inject CSS or fetch from elsewhere', () => {
    for (const [prop, value] of [
      ['color', 'red;} body{display:none'], ['color', 'red}'], ['background-color', 'url(https://evil.example/x)'],
      ['color', 'expression(alert(1))'], ['font-size', '12px !important'], ['color', '@import "x"'],
      ['color', '/* */red'], ['font-family', '"Comic Sans MS", cursive'], ['font-size', '-5px'],
      ['text-align', 'middle'], ['font-weight', '750'], ['color', 'a'.repeat(81)],
    ] as const) {
      expect(sanitizeValue(prop, value), `${prop}: ${value}`).toBeNull();
    }
  });

  it('blocks injection before any property pattern, so a looser pattern added later stays safe', () => {
    for (const value of ['red;', 'a{', 'a}', '<x', 'a\\62', '/* x', 'url(x)', 'URL (x)', 'expression(x)', '@import', 'red !important']) {
      expect(UNSAFE_CSS_VALUE.test(value), value).toBe(true);
    }
    for (const value of ['#c62828', 'rgba(0, 0, 0, 0.5)', '18px', '"Playfair Display", serif', 'center']) {
      expect(UNSAFE_CSS_VALUE.test(value), value).toBe(false);
    }
  });

  it('drops unknown devices and properties, and knows an empty style', () => {
    const style = sanitizeStyle({ desktop: { color: 'red', position: 'fixed' }, watch: { color: 'red' }, mobile: {} });
    expect(style).toEqual({ desktop: { color: 'red' } });
    expect(isEmptyStyle(sanitizeStyle({ desktop: { position: 'fixed' } }))).toBe(true);
  });
});

describe('loading rules', () => {
  it('keeps only well-formed rules', () => {
    const good = rule();
    const loaded = parseTextRules({
      good,
      badId: rule({ id: 'tr_"]{}' }),
      badTag: rule({ id: 'tr_aaaaaaaaaaa1', tag: 'h1 > a' }),
      badPage: rule({ id: 'tr_aaaaaaaaaaa2', page: 'home; drop' }),
      badScope: rule({ id: 'tr_aaaaaaaaaaa3', scope: 'x{y}' }),
      empty: rule({ id: 'tr_aaaaaaaaaaa4', style: { desktop: { position: 'fixed' } as any } }),
      noText: rule({ id: 'tr_aaaaaaaaaaa5', text: '   ' }),
    });
    expect(Object.keys(loaded)).toEqual([good.id]);
    expect(parseTextRules(null)).toEqual({});
  });
});

describe('the CSS a rule produces', () => {
  it('targets the stamped elements, with desktop, tablet and mobile at the theme\'s breakpoints', () => {
    const css = buildTextRulesCss({ [rule().id]: rule({ style: {
      desktop: { color: '#c62828' }, tablet: { 'font-size': '16px' }, mobile: { 'font-size': '14px' },
    } }) }, 'product_detail');
    expect(css).toBe(
      '#root#root [data-yt~="tr_abcdef123456"]{color:#c62828 !important}'
      + '@media (min-width:768px) and (max-width:1279px){#root#root [data-yt~="tr_abcdef123456"]{font-size:16px !important}}'
      + '@media (max-width:767px){#root#root [data-yt~="tr_abcdef123456"]{font-size:14px !important}}');
  });

  it('applies on its own page, or on every page when set to', () => {
    const rules = { a: rule({ id: 'tr_aaaaaaaaaaaa', page: 'home' }), b: rule({ id: 'tr_bbbbbbbbbbbb', page: '*' }) };
    expect(buildTextRulesCss(rules, 'home')).toContain('tr_aaaaaaaaaaaa');
    expect(buildTextRulesCss(rules, 'checkout')).not.toContain('tr_aaaaaaaaaaaa');
    expect(buildTextRulesCss(rules, 'checkout')).toContain('tr_bbbbbbbbbbbb');
  });

  it('leaves out the rule being edited, so the preview shows only the draft', () => {
    expect(buildTextRulesCss({ a: rule() }, 'product_detail', rule().id)).toBe('');
  });

  it('outranks the site-wide text roles and single-id design rules', () => {
    // From App.tsx: the Text Style Studio and the design-rule presets.
    for (const other of [':root #main-content h1', ':root #main-content button:not([role="combobox"])', ':root nav a',
      '#main-content button:not([role="combobox"])', '#products-grid-section img']) {
      expect(outranks(ruleSelector('tr_abcdef123456'), other), other).toBe(true);
    }
  });
});

describe('storage and wiring', () => {
  const svc = stripTs(read('src/services/supabaseCmsService.ts'));

  it('keeps text styles in their own row, which the CMS form never saves over', () => {
    expect(svc).toMatch(/const TEXT_RULES_ROW = 'text_styles';/);
    const fetch = svc.slice(svc.indexOf('async fetchTextRules'), svc.indexOf('async updateTextRules'));
    expect(fetch).toMatch(/\.eq\('id', TEXT_RULES_ROW\)\s*\.eq\('published', true\)/);
    // Every read of the main document names its row, so a second row cannot be mistaken for it.
    expect(svc.match(/from\('cms_site_content'\)[^;]*?\.eq\('id', 'main'\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('re-reads before writing and fails loudly when RLS filters the save', () => {
    const update = svc.slice(svc.indexOf('async updateTextRules'), svc.indexOf('async restoreSiteContent'));
    expect(update).toMatch(/change\(await supabaseCmsService\.fetchTextRules\(\)\)/);
    expect(update).toMatch(/if \(!saved\?\.length\) throw/);
  });

  it('keeps storefront styling off the admin panel and seller portal', () => {
    const app = stripTs(read('src/App.tsx'));
    expect(app).toMatch(/const onStorefront = activeTab !== 'admin' && activeTab !== 'seller';\s*style\.textContent = onStorefront \?/);
    expect(app).toMatch(/<TextStyleLayer page=\{activeTab\} enabled=\{activeTab !== 'admin' && activeTab !== 'seller'\} \/>/);
    const bar = stripTs(read('src/components/AdminQuickEditor.tsx'));
    expect(bar).toMatch(/isStylingText && onStorefront &&/);
  });

  it('the editor panel is not a dialog, which the "Cart drawer" design target would hide', () => {
    expect(stripTs(read('src/components/TextStyleEditor.tsx'))).not.toMatch(/role="dialog"/);
  });
});
