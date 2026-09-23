// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BilingualField, LEBANESE_ARTISANAL_SUGGESTIONS } from '../src/components/admin/cms/BilingualField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout, so no scrollIntoView; the arrow keys call it.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

let host: HTMLDivElement;
let root: Root;
const onChangeEn = vi.fn();
const onChangeAr = vi.fn();

beforeEach(() => {
  onChangeEn.mockClear();
  onChangeAr.mockClear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(
    <BilingualField label="Headline" valueEn="" valueAr="" onChangeEn={onChangeEn} onChangeAr={onChangeAr}
      presetSuggestions={LEBANESE_ARTISANAL_SUGGESTIONS} />,
  ));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

const presetsButton = () => host.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
const search = () => host.querySelector('input[aria-label="Search presets"]') as HTMLInputElement | null;
const shown = () => Array.from(host.querySelectorAll('[role="option"]')).map(o => o.querySelector('p')?.textContent);
const key = (el: Element, k: string) =>
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
const type = (text: string) => act(() => {
  const input = search()!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const open = () => act(() => { presetsButton().click(); });

describe('copy presets can be searched', () => {
  it('opens with the search box focused and every preset listed', () => {
    open();
    expect(document.activeElement).toBe(search());
    expect(shown()).toHaveLength(LEBANESE_ARTISANAL_SUGGESTIONS.length);
  });

  it('narrows by English, Arabic or category, and Enter applies the first match', () => {
    open();
    type('mouneh olive');
    expect(shown()).toEqual(['Pure Village Mouneh, Extra Virgin Olive Oil & Cedar Honey']);
    key(search()!, 'Enter');
    expect(onChangeEn).toHaveBeenCalledWith('Pure Village Mouneh, Extra Virgin Olive Oil & Cedar Honey');
    expect(onChangeAr).toHaveBeenCalledWith('مونة قروية بلدية 100%، زيت زيتون بكر ممتاز وعسل السدر النقي');
    expect(search()).toBeNull();
  });

  it('matches Arabic typed without its hamza or diacritics', () => {
    open();
    type('توصيل');
    expect(shown()).toEqual(['Fast Reliable Delivery Across All Lebanese Regions & Worldwide Diaspora']);
    type('back to school');
    expect(shown()).toHaveLength(1);
  });

  it('a space typed in the search box is text, not a pick', () => {
    open();
    key(search()!, 'ArrowDown');
    key(search()!, ' ');
    expect(onChangeEn).not.toHaveBeenCalled();
    expect(search()).not.toBeNull();
  });

  it('says when nothing matches, and Enter then does nothing', () => {
    open();
    type('zzzz');
    expect(shown()).toHaveLength(0);
    expect(host.textContent).toContain('No presets match.');
    key(search()!, 'Enter');
    expect(onChangeEn).not.toHaveBeenCalled();
  });

  it('Escape closes the presets without closing a dialog around them', () => {
    const dialogEscape = vi.fn();
    window.addEventListener('keydown', dialogEscape);
    try {
      open();
      key(search()!, 'Escape');
      expect(search()).toBeNull();
      expect(dialogEscape).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(presetsButton());
    } finally {
      window.removeEventListener('keydown', dialogEscape);
    }
  });
});
