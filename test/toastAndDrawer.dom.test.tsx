// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { ToastHost } from '../src/components/ToastHost';
import { useDialog } from '../src/hooks/useDialog';

// Notifications had no live region (a screen reader missed every one), sat at a
// physical right-6 (wrong end of the line in Arabic), covered the add-to-basket
// and place-order buttons on a phone, vanished after 3.5 s with no way to close
// them, and a load failure printed database table names. The Arabic cart drawer
// sat on the right while the cart button is on the left and slid in from the
// left; opening it put the cursor in the coupon box; Tab left it for the footer.
const shop: Record<string, any> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
const { CartDrawer } = await import('../src/components/CartDrawer');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');

let host: HTMLDivElement;
let root: Root;
const render = (node: React.ReactElement) => act(async () => { root.render(node); });
const $ = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const key = (k: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  act(() => { window.dispatchEvent(event); });
  return event;
};
const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  // jsdom lays nothing out; the Tab loop asks which controls are on screen
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [{}] as unknown as DOMRectList);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  document.body.style.overflow = '';
  vi.restoreAllMocks();
});

describe('notifications', () => {
  const toast = (type: 'success' | 'info' | 'warning' | 'error', message = 'Saved') => ({ id: '1', type, message });

  it('both live regions are on the page before anything is announced, empty', async () => {
    await render(<ToastHost toast={null} onDismiss={() => {}} language="en" />);
    const polite = $('[role="status"]')!;
    const assertive = $('[role="alert"]')!;
    expect(polite.getAttribute('aria-live')).toBe('polite');
    expect(assertive.getAttribute('aria-live')).toBe('assertive');
    expect(polite.textContent).toBe('');
    expect(assertive.textContent).toBe('');
  });

  it('success, info and warning are announced politely; an error assertively', async () => {
    for (const type of ['success', 'info', 'warning'] as const) {
      await render(<ToastHost toast={toast(type, `m-${type}`)} onDismiss={() => {}} language="en" />);
      expect($('[role="status"]')!.textContent, type).toContain(`m-${type}`);
      expect($('[role="alert"]')!.textContent, type).toBe('');
    }
    await render(<ToastHost toast={toast('error', 'it failed')} onDismiss={() => {}} language="en" />);
    expect($('[role="alert"]')!.textContent).toContain('it failed');
    expect($('[role="status"]')!.textContent).toBe('');
  });

  it('can be closed, with a label in the page language', async () => {
    const dismiss = vi.fn();
    await render(<ToastHost toast={toast('warning')} onDismiss={dismiss} language="en" />);
    expect($('button')!.getAttribute('aria-label')).toBe('Close');
    await act(async () => { $<HTMLButtonElement>('button')!.click(); });
    expect(dismiss).toHaveBeenCalledTimes(1);
    await render(<ToastHost toast={toast('warning')} onDismiss={dismiss} language="ar" />);
    expect($('button')!.getAttribute('aria-label')).toBe('إغلاق');
  });

  it('sits at the end of the line, and on a phone at the top below the header', async () => {
    await render(<ToastHost toast={toast('info')} onDismiss={() => {}} language="ar" />);
    const classes = ($('[role="status"]')!.parentElement as HTMLElement).className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['top-24', 'inset-x-4', 'sm:inset-x-auto', 'sm:top-auto', 'sm:bottom-6', 'sm:end-6']));
    for (const physical of ['right-6', 'left-6', 'bottom-6', 'right-0', 'left-0']) expect(classes).not.toContain(physical);
  });

  it('each message reads in its own direction, so an English sentence on an Arabic page keeps its "!" at the right end', async () => {
    await render(<ToastHost toast={toast('warning', 'Could not reach the server!')} onDismiss={() => {}} language="ar" />);
    expect($('[role="status"] span')!.getAttribute('dir')).toBe('auto');
    await render(<ToastHost toast={toast('error', 'تعذر الاتصال')} onDismiss={() => {}} language="en" />);
    expect($('[role="alert"] span')!.getAttribute('dir')).toBe('auto');
  });

  it('an error looks like one', async () => {
    await render(<ToastHost toast={toast('error')} onDismiss={() => {}} language="en" />);
    expect($('[role="alert"] > div')!.className).toContain('text-[#C62828]');
    await render(<ToastHost toast={toast('info')} onDismiss={() => {}} language="en" />);
    expect($('[role="status"] > div')!.className).not.toContain('text-[#C62828]');
  });

  it('warnings and errors stay up longer than a confirmation', () => {
    const ctx = read('src/context/ShopContext.tsx');
    expect(ctx).toContain('const TOAST_MS = { success: 3500, info: 3500, warning: 6000, error: 8000 } as const;');
    expect(ctx).toContain('}, TOAST_MS[type]);');
    // the old single 3.5 s timeout is gone
    expect(ctx).not.toMatch(/setToast\(prev => \(prev\?\.id === id \? null : prev\)\);\s*\}, 3500\);/);
  });

  it('a load failure does not tell the visitor which database tables failed', () => {
    const ctx = read('src/context/ShopContext.tsx');
    expect(ctx).toContain("console.warn('[ShopContext] Could not load:', failures.join(', '));");
    expect(ctx).toContain("'Part of the page could not be loaded. Please refresh and try again.'");
    // no toast interpolates the list of failures
    for (const match of ctx.matchAll(/showToast\([^;]*?failures[^;]*?\);/gs)) throw new Error(`a toast still names what failed: ${match[0].slice(0, 120)}`);
  });

  it('the app shows them through this component', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('<ToastHost toast={toast} onDismiss={dismissToast} language={language} />');
    expect(app).not.toContain('fixed bottom-6 right-6');
  });
});

describe('the Tab loop in dialogs', () => {
  const Sample: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { containerRef } = useDialog({ isOpen: true, onClose });
    return (
      <>
        <button id="behind">behind the dialog</button>
        <div ref={containerRef} role="dialog">
          <button id="a">a</button>
          <button id="b">b</button>
          <button id="c">c</button>
        </div>
      </>
    );
  };
  const focus = (id: string) => act(() => { (document.getElementById(id) as HTMLElement).focus(); });

  it('Tab from the last control goes to the first, and Shift+Tab from the first to the last', async () => {
    await render(<Sample onClose={() => {}} />);
    focus('c');
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('a');
    expect(key('Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('c');
  });

  it('Tab between controls in the middle is left to the browser', async () => {
    await render(<Sample onClose={() => {}} />);
    focus('b');
    expect(key('Tab').defaultPrevented).toBe(false);
    expect(key('Tab', { shiftKey: true }).defaultPrevented).toBe(false);
  });

  it('does nothing when focus is not inside the dialog (something stacked above it, or a list outside it)', async () => {
    await render(<Sample onClose={() => {}} />);
    focus('behind');
    expect(key('Tab').defaultPrevented).toBe(false);
    expect(key('Tab', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(document.activeElement?.id).toBe('behind');
  });

  it('Escape still closes', async () => {
    const close = vi.fn();
    await render(<Sample onClose={close} />);
    key('Escape');
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('the cart drawer', () => {
  const item = (id: string, q = 1) => ({ product: { id, name: `Product ${id}`, arabicName: `منتج ${id}`, image: '', priceUSD: 10, origin: 'Koura', category: 'c1' }, quantity: q });
  const open = async (language: string) => {
    Object.assign(shop, {
      language, isCartOpen: true, setIsCartOpen: vi.fn(), cart: [item('1'), item('2', 2)], updateQuantity: vi.fn(), removeFromCart: vi.fn(), clearCart: vi.fn(),
      cartTotalUSD: 30, discountUSD: 0, appliedCouponCode: '', applyCoupon: vi.fn(), removeCoupon: vi.fn(), appliedDiscountRules: [],
      formatPrice: (n: number) => `$${n}`, setActiveTab: vi.fn(), t: (k: string) => k, categories: [], freeDeliveryFromUSD: null,
    });
    await render(<CartDrawer />);
    await wait(80);
  };
  beforeEach(() => { for (const k of Object.keys(shop)) delete shop[k]; });

  it('sits at the end of the line and slides in from there, in both directions of text', async () => {
    for (const language of ['en', 'ar']) {
      await open(language);
      const side = $('[role="dialog"] > .fixed')!;
      expect(side.className, language).toContain('end-0');
      expect(side.className, language).not.toMatch(/\b(right|left)-0\b/);
      const panel = side.firstElementChild as HTMLElement;
      expect(panel.className, language).toContain('border-s');
      expect(panel.className, language).not.toMatch(/\bborder-(l|r)\b/);
    }
  });

  it('puts the cursor at the heading, not in the coupon box', async () => {
    await open('en');
    expect(document.activeElement?.id).toBe('cart-drawer-heading');
    expect(document.activeElement?.tagName).toBe('H2');
    expect(document.activeElement).not.toBe($('input[type="text"]'));
  });

  it('Tab from the checkout button goes round to the top instead of the page behind', async () => {
    await open('en');
    const controls = [...$('[role="dialog"]')!.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')];
    const last = controls[controls.length - 1];
    act(() => { last.focus(); });
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(controls[0]);
  });

  it('its buttons have names in the page language', async () => {
    await open('ar');
    expect($('#close-cart-btn')!.getAttribute('aria-label')).toBe('إغلاق السلة');
    const labels = [...host.querySelectorAll('[aria-label]')].map(el => el.getAttribute('aria-label'));
    expect(labels).toEqual(expect.arrayContaining(['إزالة المنتج', 'تقليل الكمية', 'زيادة الكمية']));
    expect(labels.join('|')).not.toMatch(/Close cart|Remove item|Decrease quantity|Increase quantity/);
    await open('en');
    expect($('#close-cart-btn')!.getAttribute('aria-label')).toBe('Close cart');
  });
});
