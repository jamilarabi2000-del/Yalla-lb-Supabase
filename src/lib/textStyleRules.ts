/**
 * Per-text styling: an administrator clicks any text on the storefront and
 * gives that text its own font, size, colour, alignment and spacing.
 *
 * A rule identifies its text by what it says, the kind of element it is in,
 * the nearest stable section around it and the page -- never by its position
 * in the page. If the layout or the wording changes, the rule stops matching;
 * it never restyles a different element. The DOM side is in textStyleDom.ts.
 */
import { secureRandomString } from '../utils/uuid';

export type TextDevice = 'desktop' | 'tablet' | 'mobile';

export type TextStyleProp =
  | 'font-family' | 'font-size' | 'font-weight' | 'font-style' | 'color' | 'background-color'
  | 'text-align' | 'line-height' | 'letter-spacing' | 'text-transform' | 'text-decoration-line';

export type TextStyleDecl = Partial<Record<TextStyleProp, string>>;

export interface CMSTextRule {
  id: string;
  /** The text as the admin clicked it, whitespace collapsed. */
  text: string;
  /** Lower-case tag of the element that holds it. */
  tag: string;
  /** Selector of the nearest stable section, or '' for anywhere on the page. */
  scope: string;
  /** Storefront page (activeTab) it applies on, or '*' for every page. */
  page: string;
  /** Desktop applies at every width unless tablet or mobile override it. */
  style: Partial<Record<TextDevice, TextStyleDecl>>;
  updatedAt: string;
}

export type TextRuleMap = Record<string, CMSTextRule>;

export const TEXT_STYLE_PROPS: TextStyleProp[] = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'color', 'background-color',
  'text-align', 'line-height', 'letter-spacing', 'text-transform', 'text-decoration-line',
];

/** The six families index.html loads; anything else would silently fall back. */
export const TEXT_FONTS = [
  { label: 'Plus Jakarta Sans', value: '"Plus Jakarta Sans", sans-serif' },
  { label: 'Playfair Display', value: '"Playfair Display", serif' },
  { label: 'Inter', value: '"Inter", sans-serif' },
  { label: 'Tajawal', value: '"Tajawal", sans-serif' },
  { label: 'Cairo', value: '"Cairo", sans-serif' },
  { label: 'Amiri', value: '"Amiri", serif' },
] as const;

export const MAX_RULE_TEXT = 1000;
export const TEXT_RULE_ATTR = 'data-yt';
export const TEXT_RULE_PREVIEW_ATTR = 'data-yt-preview';

const RULE_ID = /^tr_[a-z0-9]{8,32}$/;
const DEVICES: TextDevice[] = ['desktop', 'tablet', 'mobile'];

export function normalizeText(s: string | null | undefined): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

export function newRuleId(): string {
  return `tr_${secureRandomString(12)}`;
}

/**
 * Anything that could end a declaration, open a block or fetch from
 * elsewhere. Refused before the per-property patterns below, so a property
 * added later with a looser pattern still cannot inject.
 */
export const UNSAFE_CSS_VALUE = /[;{}<>\\]|\/\*|url\s*\(|expression\s*\(|@|!important/i;

/**
 * A value that cannot close the declaration, open a block or fetch anything,
 * checked against what each property actually accepts. Null when unusable.
 */
export function sanitizeValue(prop: TextStyleProp, raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  if (!v || v.length > 80) return null;
  if (UNSAFE_CSS_VALUE.test(v)) return null;
  const ok = (re: RegExp) => (re.test(v) ? v : null);
  switch (prop) {
    case 'color':
    case 'background-color':
      return ok(/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]+)$/i);
    case 'font-size':
      return ok(/^(\d+(\.\d+)?(px|rem|em|%)|small|medium|large)$/);
    case 'letter-spacing':
      return ok(/^(-?\d+(\.\d+)?(px|em|rem)|normal)$/);
    case 'line-height':
      return ok(/^(\d+(\.\d+)?(px|em|rem|%)?|normal)$/);
    case 'font-weight':
      return ok(/^(normal|bold|[1-9]00)$/);
    case 'font-style':
      return ok(/^(normal|italic)$/);
    case 'text-align':
      return ok(/^(left|center|right|justify|start|end)$/);
    case 'text-transform':
      return ok(/^(none|uppercase|lowercase|capitalize)$/);
    case 'text-decoration-line':
      return ok(/^(none|underline|line-through)$/);
    case 'font-family':
      return TEXT_FONTS.some(f => f.value === v) ? v : null;
    default:
      return null;
  }
}

export function sanitizeDecl(decl: unknown): TextStyleDecl {
  const out: TextStyleDecl = {};
  if (!decl || typeof decl !== 'object') return out;
  for (const prop of TEXT_STYLE_PROPS) {
    const value = sanitizeValue(prop, (decl as Record<string, unknown>)[prop]);
    if (value) out[prop] = value;
  }
  return out;
}

export function sanitizeStyle(style: unknown): CMSTextRule['style'] {
  const out: CMSTextRule['style'] = {};
  if (!style || typeof style !== 'object') return out;
  for (const device of DEVICES) {
    const decl = sanitizeDecl((style as Record<string, unknown>)[device]);
    if (Object.keys(decl).length) out[device] = decl;
  }
  return out;
}

export const isEmptyStyle = (style: CMSTextRule['style']) =>
  DEVICES.every(d => !style[d] || Object.keys(style[d]!).length === 0);

/**
 * Only well-formed rules survive loading. The row is written by verified
 * administrators, but it is rendered to every visitor, so it is checked the
 * same way as anything else that reaches the page.
 */
export function parseTextRules(raw: unknown): TextRuleMap {
  const out: TextRuleMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const r = value as Record<string, unknown>;
    const id = String(r.id ?? '');
    const text = normalizeText(String(r.text ?? ''));
    const tag = String(r.tag ?? '');
    const scope = String(r.scope ?? '');
    const page = String(r.page ?? '');
    if (!RULE_ID.test(id) || !text || text.length > MAX_RULE_TEXT) continue;
    if (!/^[a-z][a-z0-9]{0,9}$/.test(tag) || !/^(\*|[a-z_]{1,40})$/.test(page)) continue;
    if (scope.length > 200 || /[{}]/.test(scope)) continue;
    const style = sanitizeStyle(r.style);
    if (isEmptyStyle(style)) continue;
    out[id] = { id, text, tag, scope, page, style, updatedAt: String(r.updatedAt ?? '') };
  }
  return out;
}

export const ruleAppliesOn = (rule: CMSTextRule, page: string) => rule.page === '*' || rule.page === page;

/**
 * Two #root ids (specificity 2-1-0) outrank the theme's text roles
 * (`:root #main-content h1`, 1-1-1) and single-id design rules, so a text
 * styled on its own wins over the site-wide style for its kind.
 */
export const ruleSelector = (id: string) => `#root#root [${TEXT_RULE_ATTR}~="${id}"]`;
export const PREVIEW_SELECTOR = `#root#root [${TEXT_RULE_PREVIEW_ATTR}]`;

const declCss = (decl: TextStyleDecl | undefined) =>
  Object.entries(sanitizeDecl(decl)).map(([k, v]) => `${k}:${v} !important`).join(';');

/** Breakpoints match the theme's own tablet and mobile rules in App.tsx. */
export function styleCss(selector: string, style: CMSTextRule['style']): string {
  const base = declCss(style.desktop);
  const tablet = declCss(style.tablet);
  const mobile = declCss(style.mobile);
  return (base ? `${selector}{${base}}` : '')
    + (tablet ? `@media (min-width:768px) and (max-width:1279px){${selector}{${tablet}}}` : '')
    + (mobile ? `@media (max-width:767px){${selector}{${mobile}}}` : '');
}

export function buildTextRulesCss(rules: TextRuleMap, page: string, skipId?: string | null): string {
  return Object.values(rules)
    .filter(r => RULE_ID.test(r.id) && r.id !== skipId && ruleAppliesOn(r, page))
    .map(r => styleCss(ruleSelector(r.id), r.style))
    .join('');
}
