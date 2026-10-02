// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// A shopper's order list had no Arabic at all, showed each order's raw status
// ("courier_assigned"), and offered filters ("Preparing", "Shipped") that no
// order could ever match.
vi.mock('../src/components/ui/SearchableSelect', () => ({
  SearchableSelect: ({ value, onChange, children }: any) => <select data-testid="status-filter" value={value} onChange={onChange}>{children}</select>,
}));

const { OrderHistory, STATUS_TEXT } = await import('../src/components/OrderHistory');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const order = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, status, date: '2026-09-01', totalUSD: 20, items: [{ quantity: 1 }], trackingNumber: '',
  shipping: { governorate: 'beirut' }, ...extra,
});
const ORDERS = [
  order('ord-1', 'pending'),
  order('ord-2', 'crafting', { items: [{}, {}] }),
  order('ord-3', 'in_transit', { trackingNumber: 'TRK-77', shipping: { governorate: 'north' } }),
  order('ord-4', 'delivered'),
];

let host: HTMLDivElement;
let root: Root;
let browse: ReturnType<typeof vi.fn>;
const show = (language: string, orders: unknown[] = ORDERS) => act(async () => {
  root.render(<OrderHistory orders={orders as any} formatPrice={(n: number) => `$${n}`} onNavigateProducts={browse as unknown as () => void} language={language} />);
});
const ids = () => [...host.querySelectorAll('article')].map(a => a.textContent!.match(/ord-\d/)?.[0]);
const choose = (value: string) => act(async () => {
  const select = host.querySelector<HTMLSelectElement>('[data-testid="status-filter"]')!;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  browse = vi.fn();
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

describe('the order list in Arabic', () => {
  it('speaks Arabic: status, count, region, tracking and order words', async () => {
    await show('ar');
    const text = host.textContent!;
    expect(text).toContain('طلب');
    for (const word of ['قيد الانتظار', 'قيد التحضير', 'تم الشحن', 'تم التسليم']) expect(text, word).toContain(word);
    expect(text).toContain('منتج واحد');
    expect(text).toContain('منتجان');
    expect(text).toContain('لا يوجد رقم تتبع');
    expect(text).toContain('بيروت');            // the region's name, not its id
    expect(text).not.toMatch(/crafting|in_transit|courier_assigned|beirut/);
    expect(text).not.toMatch(/No tracking|item\(s\)/);
  });

  it('the search box and the filter are in Arabic', async () => {
    await show('ar');
    expect(host.querySelector('input')!.getAttribute('placeholder')).toBe('ابحث برقم الطلب');
    expect(host.querySelector('input')!.getAttribute('aria-label')).toBe('ابحث برقم الطلب');
    const options = [...host.querySelectorAll('option')].map(o => o.textContent);
    expect(options[0]).toBe('كل الحالات');
    expect(options).toContain('تم الشحن');
  });

  it('order numbers and tracking numbers stay left to right', async () => {
    await show('ar');
    const isolated = [...host.querySelectorAll('bdi[dir="ltr"]')].map(el => el.textContent);
    expect(isolated).toContain('#ord-1');
    expect(isolated).toContain('TRK-77');
  });

  it('an empty list says so in Arabic and offers the way out', async () => {
    await show('ar', []);
    expect(host.textContent).toContain('لا توجد طلبات.');
    const button = host.querySelector('button')!;
    expect(button.textContent).toBe('تصفح المنتجات');
    await act(async () => { button.click(); });
    expect(browse).toHaveBeenCalledTimes(1);
  });
});

describe('the order list in English', () => {
  it('still reads as before, with readable status names', async () => {
    await show('en');
    const text = host.textContent!;
    for (const word of ['Pending', 'Preparing', 'Shipped', 'Delivered', 'No tracking', '1 item', '2 items', 'Order']) expect(text, word).toContain(word);
    expect(text).toContain('Beirut');
    expect(host.querySelector('input')!.getAttribute('placeholder')).toBe('Search order ID');
    expect(text).not.toMatch(/crafting|in_transit/);
  });

  it('an empty list', async () => {
    await show('en', []);
    expect(host.textContent).toContain('No orders found.');
    expect(host.querySelector('button')!.textContent).toBe('Browse products');
  });
});

describe('the filter and the search', () => {
  it('every status an order can have is offered, and each one finds its orders', async () => {
    await show('en');
    const offered = [...host.querySelectorAll('option')].map(o => (o as HTMLOptionElement).value);
    expect(offered).toEqual(['all', ...Object.keys(STATUS_TEXT)]);
    for (const [status, expected] of [['pending', ['ord-1']], ['crafting', ['ord-2']], ['in_transit', ['ord-3']], ['delivered', ['ord-4']], ['cancelled', []]] as const) {
      await choose(status);
      expect(ids(), status).toEqual(expected);
    }
    await choose('all');
    expect(ids()).toEqual(['ord-1', 'ord-2', 'ord-3', 'ord-4']);
  });

  it('the old values that matched nothing are gone', async () => {
    await show('en');
    const offered = [...host.querySelectorAll('option')].map(o => (o as HTMLOptionElement).value);
    expect(offered).not.toContain('preparing');
    expect(offered).not.toContain('shipped');
  });

  it('searching by order number narrows the list, in either language', async () => {
    for (const language of ['en', 'ar']) {
      await show(language);
      const input = host.querySelector<HTMLInputElement>('input')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'ORD-3');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(ids(), language).toEqual(['ord-3']);
    }
  });
});
