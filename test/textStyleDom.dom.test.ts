// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyTextRuleTags, findRuleMatches, scopeSelectorFor, textTargetFrom } from '../src/lib/textStyleDom';
import type { CMSTextRule } from '../src/lib/textStyleRules';

const rule = (over: Partial<CMSTextRule> = {}): CMSTextRule => ({
  id: 'tr_aaaaaaaaaaaa', text: 'Add to Cart', tag: 'button', scope: '[data-cms-element="product-detail"]',
  page: 'product_detail', style: { desktop: { color: 'red' } }, updatedAt: '', ...over,
});

let root: HTMLElement;
const $ = (sel: string) => root.querySelector(sel) as HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `
    <div id="root">
      <header><nav><a id="nav-home" href="/">Home</a></nav></header>
      <main id="main-content">
        <section data-cms-element="product-detail">
          <div id=":r1:"><div id="card-12345">
            <h1 class="t">Koura   Olive Oil</h1>
            <button id="add"><svg id="icon"></svg><span id="label">Add to Cart</span></button>
            <button id="add2">Add to Cart</button>
            <p id="long">${'x'.repeat(1200)}</p>
          </div></div>
        </section>
        <section id="related"><button id="add-related">Add to Cart</button></section>
      </main>
      <div data-yalla-editor=""><button id="editor-btn">Add to Cart</button></div>
    </div>`;
  root = document.getElementById('root')!;
});

describe('which element a click means', () => {
  it('the nearest element holding the text', () => {
    expect(textTargetFrom($('#label'), root)?.id).toBe('label');
    expect(textTargetFrom($('.t'), root)?.tagName).toBe('H1');
  });

  it('the button or link around an icon', () => {
    expect(textTargetFrom($('#icon'), root)?.id).toBe('add');
  });

  it('never the editor, never something outside, never a wall of text', () => {
    expect(textTargetFrom($('#editor-btn'), root)).toBeNull();
    expect(textTargetFrom(document.body, root)).toBeNull();
    expect(textTargetFrom($('#long'), root)).toBeNull();
  });
});

describe('the section a rule remembers', () => {
  it('skips generated ids on the way to a named CMS section', () => {
    // ":r1:" is a React id and "card-12345" a generated one; neither survives a reload.
    expect(scopeSelectorFor($('.t'), root)).toBe('[data-cms-element="product-detail"]');
  });

  it('takes the nearest stable name, even a button\'s own id', () => {
    expect(scopeSelectorFor($('#label'), root)).toBe('#add');
  });

  it('falls back to a stable id, then a landmark, then nothing', () => {
    expect(scopeSelectorFor($('#add-related'), root)).toBe('#related');
    expect(scopeSelectorFor($('#nav-home'), root)).toBe('nav');
    const loose = document.createElement('p');
    root.appendChild(loose);
    expect(scopeSelectorFor(loose, root)).toBe('');
  });
});

describe('finding a styled text again', () => {
  it('matches the same text in the same kind of element, only within its section', () => {
    expect(findRuleMatches(root, rule()).map(el => el.id).sort()).toEqual(['add', 'add2']);
  });

  it('ignores whitespace differences but not different words', () => {
    expect(findRuleMatches(root, rule({ text: 'Koura Olive Oil', tag: 'h1' }))).toHaveLength(1);
    expect(findRuleMatches(root, rule({ text: 'Koura Oil', tag: 'h1' }))).toHaveLength(0);
  });

  it('never matches inside the editor, and an unusable section matches nothing', () => {
    expect(findRuleMatches(root, rule({ scope: '' })).map(el => el.id)).not.toContain('editor-btn');
    expect(findRuleMatches(root, rule({ scope: '[[' }))).toEqual([]);
  });
});

describe('stamping', () => {
  it('stamps every match with its rule ids and clears stamps that no longer apply', () => {
    const a = rule();
    const b = rule({ id: 'tr_bbbbbbbbbbbb', scope: '' });
    expect(applyTextRuleTags(root, [a, b], 'product_detail')).toBe(3);
    expect($('#add').getAttribute('data-yt')).toBe('tr_aaaaaaaaaaaa tr_bbbbbbbbbbbb');
    expect($('#add-related').getAttribute('data-yt')).toBe('tr_bbbbbbbbbbbb');

    $('#add2').textContent = 'Added';
    applyTextRuleTags(root, [a, b], 'product_detail');
    expect($('#add2').hasAttribute('data-yt')).toBe(false);

    applyTextRuleTags(root, [a, b], 'home');
    expect(root.querySelectorAll('[data-yt]')).toHaveLength(0);
  });
});
