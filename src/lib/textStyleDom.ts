/**
 * The DOM half of per-text styling: which element a click means, how a rule
 * finds its text again, and tagging the matches so the rule's CSS applies.
 */
import {
  MAX_RULE_TEXT,
  TEXT_RULE_ATTR,
  normalizeText,
  ruleAppliesOn,
  type CMSTextRule,
} from './textStyleRules';

/** Marks the editor's own UI, which is never styled or selectable. */
export const EDITOR_ATTR = 'data-yalla-editor';

const TEXT_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'label', 'li', 'dt', 'dd',
  'small', 'strong', 'em', 'b', 'i', 'u', 'td', 'th', 'blockquote', 'figcaption', 'legend',
  'div', 'cite', 'q', 'mark', 'time', 'summary', 'caption', 'sup', 'sub', 'abbr', 'code',
]);
const LABELLED = 'button,a,label,h1,h2,h3,h4,h5,h6,p,li';

const inEditor = (el: Element) => !!el.closest(`[${EDITOR_ATTR}]`);
const hasOwnText = (el: Element) =>
  Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent || '').trim() !== '');
const usableText = (el: Element) => {
  const t = normalizeText(el.textContent);
  return t.length > 0 && t.length <= MAX_RULE_TEXT;
};

/**
 * The text element a click on `node` means: the nearest element holding text
 * of its own, or -- for a click on an icon inside a button or link -- that
 * button or link. Null for anything outside `boundary` or in the editor.
 */
export function textTargetFrom(node: Element | null, boundary: Element): Element | null {
  if (!node || !boundary.contains(node) || inEditor(node)) return null;
  let el: Element | null = node;
  for (let depth = 0; el && el !== boundary && depth < 6; depth++, el = el.parentElement) {
    if (TEXT_TAGS.has(el.tagName.toLowerCase()) && hasOwnText(el) && usableText(el)) return el;
  }
  const labelled = node.closest(LABELLED);
  return labelled && boundary.contains(labelled) && labelled !== boundary && usableText(labelled) ? labelled : null;
}

// Stable enough to find the section again on the next visit: no React ids
// (":r1:"), no generated runs of digits, not the app shell itself.
const isStableId = (id: string) =>
  id !== 'main-content' && id.length <= 60 && /^[A-Za-z][\w-]*$/.test(id) && !/\d{3,}/.test(id);
const SAFE_VALUE = /^[\w-]{1,60}$/;

/** The nearest named section around `el`, as a selector; '' when there is none. */
export function scopeSelectorFor(el: Element, boundary: Element): string {
  for (let a = el.parentElement; a && a !== boundary; a = a.parentElement) {
    const cms = a.getAttribute('data-cms-element');
    if (cms && SAFE_VALUE.test(cms)) return `[data-cms-element="${cms}"]`;
    if (a.id && isStableId(a.id)) return `#${a.id}`;
    const tag = a.tagName.toLowerCase();
    if (tag === 'header' || tag === 'footer' || tag === 'nav' || tag === 'aside') return tag;
  }
  return '';
}

/** Per-pass memo: many rules share a section and a tag, and texts repeat. */
interface MatchCache {
  candidates: Map<string, Element[]>;
  texts: WeakMap<Element, string>;
}
const newCache = (): MatchCache => ({ candidates: new Map(), texts: new WeakMap() });

/** Every element a rule should style under `root`. */
export function findRuleMatches(
  root: Element,
  rule: Pick<CMSTextRule, 'text' | 'tag' | 'scope'>,
  cache: MatchCache = newCache(),
): Element[] {
  const key = `${rule.scope}\u0000${rule.tag}`;
  let candidates = cache.candidates.get(key);
  if (!candidates) {
    candidates = [];
    try {
      const scopes = rule.scope ? Array.from(root.querySelectorAll(rule.scope)) : [root];
      const seen = new Set<Element>();
      for (const scope of scopes) {
        for (const el of Array.from(scope.querySelectorAll(rule.tag))) {
          if (!seen.has(el) && !inEditor(el)) { seen.add(el); candidates.push(el); }
        }
      }
    } catch {
      candidates = []; // an unusable selector matches nothing
    }
    cache.candidates.set(key, candidates);
  }
  return candidates.filter(el => {
    let text = cache.texts.get(el);
    if (text === undefined) { text = normalizeText(el.textContent); cache.texts.set(el, text); }
    return text === rule.text;
  });
}

/**
 * Stamps each element with the ids of the rules that match it, and clears the
 * stamp from elements that no longer match. Returns how many are styled.
 */
export function applyTextRuleTags(root: Element, rules: CMSTextRule[], page: string): number {
  const cache = newCache();
  const wanted = new Map<Element, string[]>();
  for (const rule of rules) {
    if (!ruleAppliesOn(rule, page)) continue;
    for (const el of findRuleMatches(root, rule, cache)) {
      const ids = wanted.get(el);
      if (ids) ids.push(rule.id);
      else wanted.set(el, [rule.id]);
    }
  }
  root.querySelectorAll(`[${TEXT_RULE_ATTR}]`).forEach(el => {
    if (!wanted.has(el)) el.removeAttribute(TEXT_RULE_ATTR);
  });
  wanted.forEach((ids, el) => {
    const value = ids.join(' ');
    if (el.getAttribute(TEXT_RULE_ATTR) !== value) el.setAttribute(TEXT_RULE_ATTR, value);
  });
  return wanted.size;
}

/** Alignment has no visible effect on an inline element such as a link or span. */
export function isInlineElement(el: Element): boolean {
  const display = typeof window !== 'undefined' ? window.getComputedStyle(el).display : '';
  return display === 'inline' || display === 'contents';
}
