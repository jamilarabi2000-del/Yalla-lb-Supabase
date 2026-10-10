// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_SITE_CONTENT } from '../src/data/cmsContent';

// The admin can now set where the footer's copyright and attribution notice sits (CMS -> Footer), and the footer
// obeys. The shop context is large; these components read a few fields of it.
const shop: Record<string, unknown> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
const { Footer } = await import('../src/components/Footer');
const { CMSFooterTab } = await import('../src/components/admin/cms/CMSFooterTab');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; for (const key of Object.keys(shop)) delete shop[key]; });

const tokens = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);

const renderFooter = (options: { footer?: Record<string, unknown>; language?: 'en' | 'ar'; visibility?: Record<string, boolean>; editing?: boolean } = {}) => {
  Object.assign(shop, {
    language: options.language ?? 'en', isVisualEditMode: options.editing ?? false, setActiveTab: vi.fn(),
    siteContent: {
      ...DEFAULT_SITE_CONTENT,
      footer: { ...DEFAULT_SITE_CONTENT.footer, copyrightText: '© 2026 Yalla\nMade with love', copyrightTextArabic: '© 2026 يلا\nصنع بحب', ...options.footer },
      visibility: { ...DEFAULT_SITE_CONTENT.visibility, ...options.visibility },
    },
  });
  act(() => root.render(<Footer />));
};
const bar = () => document.getElementById('footer-copyright-bar');
const text = () => document.getElementById('footer-copyright-text');

describe('the footer', () => {
  it('looks as it always has when nothing is set', () => {
    renderFooter();
    expect(tokens(bar())).toEqual(expect.arrayContaining(['pt-4', 'flex-col', 'sm:flex-row', 'justify-between', 'items-center']));
    expect(tokens(text())).toEqual(expect.arrayContaining(['text-center', 'sm:text-start', 'whitespace-pre-line']));
    expect(text()?.textContent).toBe('© 2026 Yalla\nMade with love');
  });

  it.each([['start', 'justify-start', 'text-start'], ['center', 'justify-center', 'text-center'], ['end', 'justify-end', 'text-end']])(
    'puts the notice %s when the admin chose it, whatever the screen', (side, justify, textAlign) => {
      renderFooter({ footer: { copyrightAlign: side } });
      expect(tokens(bar())).toContain(justify);
      expect(tokens(bar())).not.toContain('sm:flex-row');
      expect(tokens(text())).toContain(textAlign);
    });

  it('moves the text up or down from the divider line', () => {
    renderFooter({ footer: { copyrightSpacing: 'tight' } });
    expect(tokens(bar())).toContain('pt-1');
    act(() => root.unmount()); root = createRoot(host);
    renderFooter({ footer: { copyrightSpacing: 'roomy' } });
    expect(tokens(bar())).toContain('pt-10');
  });

  it('applies the same choice to the Arabic notice, and keeps its own text', () => {
    renderFooter({ language: 'ar', footer: { copyrightAlign: 'end' } });
    expect(tokens(bar())).toContain('justify-end');
    expect(text()?.textContent).toBe('© 2026 يلا\nصنع بحب');
  });

  it('ignores anything it does not know', () => {
    renderFooter({ footer: { copyrightAlign: 'pt-99', copyrightSpacing: '<script>' } });
    expect(tokens(bar())).toEqual(expect.arrayContaining(['pt-4', 'flex-col', 'justify-between']));
    expect(tokens(bar())).not.toContain('pt-99');
  });

  it('still hides the whole notice when the admin switched it off', () => {
    renderFooter({ footer: { copyrightAlign: 'center' }, visibility: { footerCopyright: false } });
    expect(bar()).toBeNull();
  });
});

describe('the admin\'s controls (CMS -> Footer)', () => {
  const links = { ...DEFAULT_SITE_CONTENT.socialLinks };
  const mountTab = (footerOverrides: Record<string, unknown> = {}) => {
    const onChangeFooterField = vi.fn();
    act(() => root.render(
      <CMSFooterTab
        footerData={{ ...DEFAULT_SITE_CONTENT.footer, ...footerOverrides } as never}
        socialLinks={links as never}
        onChangeFooterField={onChangeFooterField}
        onChangeSocialField={vi.fn()}
        onChangeSocialDisplay={vi.fn()}
      />,
    ));
    return onChangeFooterField;
  };
  const radio = (id: string) => document.getElementById(id) as HTMLButtonElement;
  const checked = (group: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(`button[id^="${group}-"]`)).filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.id.replace(`${group}-`, ''));

  it('offer Auto, Left, Center, Right and Up, Normal, Down', () => {
    mountTab();
    expect(Array.from(document.querySelectorAll('button[id^="copyright-align-"]')).map(b => b.textContent)).toEqual(['Auto', 'Left', 'Center', 'Right']);
    expect(Array.from(document.querySelectorAll('button[id^="copyright-spacing-"]')).map(b => b.textContent)).toEqual(['Up', 'Normal', 'Down']);
    expect(document.querySelectorAll('[role="radiogroup"][aria-labelledby="copyright-align-label"]')).toHaveLength(1);
  });

  it('show Auto and Normal until something is saved', () => {
    mountTab();
    expect(checked('copyright-align')).toEqual(['auto']);
    expect(checked('copyright-spacing')).toEqual(['normal']);
  });

  it('show what is saved', () => {
    mountTab({ copyrightAlign: 'end', copyrightSpacing: 'roomy' });
    expect(checked('copyright-align')).toEqual(['end']);
    expect(checked('copyright-spacing')).toEqual(['roomy']);
  });

  it('save the choice into the footer settings', () => {
    const change = mountTab();
    act(() => radio('copyright-align-center').click());
    act(() => radio('copyright-align-start').click());
    act(() => radio('copyright-align-end').click());
    act(() => radio('copyright-align-auto').click());
    act(() => radio('copyright-spacing-tight').click());
    act(() => radio('copyright-spacing-roomy').click());
    expect(change.mock.calls).toEqual([
      ['copyrightAlign', 'center'], ['copyrightAlign', 'start'], ['copyrightAlign', 'end'], ['copyrightAlign', 'auto'],
      ['copyrightSpacing', 'tight'], ['copyrightSpacing', 'roomy'],
    ]);
  });

  it('treat a saved value they do not know as Auto and Normal', () => {
    mountTab({ copyrightAlign: 'diagonal', copyrightSpacing: 'huge' });
    expect(checked('copyright-align')).toEqual(['auto']);
    expect(checked('copyright-spacing')).toEqual(['normal']);
  });

  it('preview the notice the way the footer will draw it', () => {
    mountTab({ copyrightAlign: 'center', copyrightSpacing: 'tight', copyrightText: 'Hello' });
    const preview = document.getElementById('copyright-preview');
    expect(tokens(preview)).toEqual(expect.arrayContaining(['justify-center', 'pt-1']));
    expect(preview?.textContent).toBe('Hello');
  });

  it('keep the two text boxes', () => {
    mountTab();
    expect(document.getElementById('footer-copyright-en')).not.toBeNull();
    expect(document.getElementById('footer-copyright-ar')).not.toBeNull();
  });
});
