// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// A shopper asked for 2, then 3, of a product with 1 in stock, from Quick View. The basket correctly held 1, which is
// all there was, but the page said "Added 3": the stock warning was shown from inside the state update, and a second
// message claiming the quantity asked for replaced it. This mounts the real shop provider against a stand-in for
// Supabase and adds to the basket the way the pages do.
const rec = vi.hoisted(() => ({ rows: {} as Record<string, any[]> }));

vi.mock('../src/lib/supabase', () => {
  const answer = (table: string) => ({ data: rec.rows[table] ?? [], error: null });
  const query = (table: string): any => new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve: any, reject: any) => Promise.resolve(answer(table)).then(resolve, reject);
      if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: (rec.rows[table] ?? [])[0] ?? null, error: null });
      return () => query(table);
    },
  });
  const quiet = (): any => new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? undefined : quiet()),
    apply: () => Promise.resolve({ data: null, error: null }),
  });
  const supabase: any = {
    from: (table: string) => ({
      select: () => query(table),
      insert: () => query(table), update: () => query(table), upsert: () => query(table), delete: () => query(table),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => { const channel: any = { on: () => channel, subscribe: () => channel }; return channel; },
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      initialize: async () => ({ error: null }),
      mfa: quiet(),
    },
    storage: quiet(),
    functions: quiet(),
  };
  return { supabase };
});

const { ShopProvider, useShop } = await import('../src/context/ShopContext');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Shop = ReturnType<typeof useShop>;
const seen: { shop: Shop | null } = { shop: null };
const Probe: React.FC = () => { seen.shop = useShop(); return null; };
const shop = () => seen.shop!;

const row = (id: string, stock: number) => ({
  id, name: `Wild Zaatar ${id} (500 g)`, arabic_name: `زعتر بري ${id}`, regular_price: 5, stock,
  is_published: true, category_id: 'c1', created_at: '2026-01-01T00:00:00Z', display_order: 0,
});

let host: HTMLDivElement;
let root: Root;
let timers: { mock: { calls: unknown[][] } };

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
const mount = async (strict = false) => {
  const tree = <ShopProvider><Probe /></ShopProvider>;
  await act(async () => { root.render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree); });
  await settle();
};
const product = (id: string) => shop().products.find(p => p.id === id)!;
const line = (id: string) => shop().cart.find(item => item.product.id === id);
const add = async (id: string, quantity?: number) => {
  let plan: ReturnType<Shop['addToCart']> | undefined;
  await act(async () => { plan = shop().addToCart(product(id), quantity); });
  return plan!;
};
// each message the shop shows starts one timer to take it away again, so counting those counts the messages
const messagesShown = () => timers.mock.calls.filter(([, ms]) => [3500, 6000, 8000].includes(ms as number)).length;
const toast = () => shop().toast;

beforeEach(() => {
  rec.rows = { public_storefront_products: [row('one', 1), row('ten', 10), row('none', 0)] };
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('a product with 1 in stock (the reported case: 2 pieces, then 3)', () => {
  beforeEach(async () => { await mount(); timers = vi.spyOn(globalThis, 'setTimeout'); });

  it('stock is what the catalogue says: 1', () => {
    expect(product('one').stock).toBe(1);
  });

  it('asking for 2 puts 1 in the basket, and the message says so', async () => {
    const plan = await add('one', 2);
    expect(plan).toMatchObject({ status: 'limited', added: 1, total: 1, stock: 1 });
    expect(line('one')?.quantity).toBe(1);
    expect(toast()?.type).toBe('warning');
    expect(toast()?.message).toBe('Only 1 of "Wild Zaatar one" in stock: 1 added, 1 in your basket.');
    expect(toast()?.message).not.toMatch(/Added 2/);
  });

  it('then asking for 3 puts nothing more in, and says it is all in the basket already', async () => {
    await add('one', 2);
    const plan = await add('one', 3);
    expect(plan).toMatchObject({ status: 'at-limit', added: 0, total: 1 });
    expect(line('one')?.quantity).toBe(1);
    expect(shop().cart).toHaveLength(1);
    expect(toast()?.type).toBe('warning');
    expect(toast()?.message).toBe('All 1 of "Wild Zaatar one" in stock are already in your basket.');
    expect(toast()?.message).not.toMatch(/Added 3/);
  });

  it('says the same in Arabic, with the Arabic name', async () => {
    await act(async () => { shop().setLanguage('ar'); });
    await add('one', 2);
    expect(toast()?.message).toBe('المتوفر 1 فقط من "زعتر بري one": تمت إضافة 1، ولديك 1 في السلة.');
    await add('one', 3);
    expect(toast()?.message).toBe('كل الكمية المتوفرة (1) من "زعتر بري one" موجودة بالفعل في سلتك.');
  });

  it('asking for exactly 1 is simply added, as a success', async () => {
    const plan = await add('one', 1);
    expect(plan).toMatchObject({ status: 'added', added: 1, total: 1 });
    expect(toast()?.type).toBe('success');
    expect(toast()?.message).toBe('Added 1x "Wild Zaatar one" to cart!');
  });
});

describe('a product with plenty in stock', () => {
  beforeEach(async () => { await mount(); timers = vi.spyOn(globalThis, 'setTimeout'); });

  it('2 and then 3 make 5 in the basket, and each message says what was added', async () => {
    const first = await add('ten', 2);
    expect(first).toMatchObject({ status: 'added', added: 2, total: 2 });
    expect(line('ten')?.quantity).toBe(2);
    expect(toast()?.message).toBe('Added 2x "Wild Zaatar ten" to cart!');
    expect(toast()?.type).toBe('success');

    const second = await add('ten', 3);
    expect(second).toMatchObject({ status: 'added', added: 3, total: 5 });
    expect(line('ten')?.quantity).toBe(5);
    expect(toast()?.message).toBe('Added 3x "Wild Zaatar ten" to cart!');
  });

  it('cuts a fractional quantity to whole pieces, and the message says that number', async () => {
    const plan = await add('ten', 2.9);
    expect(plan).toMatchObject({ status: 'added', added: 2 });
    expect(line('ten')?.quantity).toBe(2);
    expect(toast()?.message).toBe('Added 2x "Wild Zaatar ten" to cart!');
  });

  it('with no quantity given adds 1', async () => {
    await add('ten');
    expect(line('ten')?.quantity).toBe(1);
  });

  it('stops at the stock when the basket is nearly full, and says how many went in', async () => {
    await add('ten', 9);
    const plan = await add('ten', 2);
    expect(plan).toMatchObject({ status: 'limited', added: 1, total: 10 });
    expect(line('ten')?.quantity).toBe(10);
    expect(toast()?.message).toBe('Only 10 of "Wild Zaatar ten" in stock: 1 added, 10 in your basket.');
  });

  it('adds nothing, and says so, once the basket holds all of it', async () => {
    await add('ten', 10);
    const plan = await add('ten', 1);
    expect(plan.status).toBe('at-limit');
    expect(line('ten')?.quantity).toBe(10);
    expect(toast()?.message).toBe('All 10 of "Wild Zaatar ten" in stock are already in your basket.');
  });
});

describe('a product that is out of stock', () => {
  beforeEach(async () => { await mount(); timers = vi.spyOn(globalThis, 'setTimeout'); });

  it('adds nothing, and says it is out of stock', async () => {
    const plan = await add('none', 2);
    expect(plan).toEqual({ status: 'out-of-stock', stock: 0, added: 0, total: 0 });
    expect(shop().cart).toHaveLength(0);
    expect(toast()).toMatchObject({ type: 'warning', message: 'Sorry, this product is currently out of stock!' });
  });

  it('in Arabic too', async () => {
    await act(async () => { shop().setLanguage('ar'); });
    await add('none');
    expect(toast()?.message).toBe('عذراً، هذا المنتج غير متوفر حالياً');
  });
});

describe('one message for each add', () => {
  beforeEach(async () => { await mount(); });

  // The stock warning used to be shown from inside the state update and then replaced by a success message:
  // two messages for one click, the later one wrong.
  it('whatever happened: added, limited, nothing more fits, out of stock', async () => {
    timers = vi.spyOn(globalThis, 'setTimeout');
    for (const [id, quantity] of [['ten', 2], ['one', 3], ['one', 1], ['none', 1]] as const) {
      const before = messagesShown();
      await add(id, quantity);
      expect(messagesShown() - before, `${id} x${quantity}`).toBe(1);
    }
  });

  it('even when React runs the state update twice, as it does in development', async () => {
    act(() => root.unmount());
    root = createRoot(host);
    await mount(true);
    timers = vi.spyOn(globalThis, 'setTimeout');
    const before = messagesShown();
    await add('one', 3);
    expect(messagesShown() - before).toBe(1);
    expect(line('one')?.quantity).toBe(1);
    expect(toast()?.message).toBe('Only 1 of "Wild Zaatar one" in stock: 1 added, 1 in your basket.');
    await add('ten', 2);
    expect(line('ten')?.quantity).toBe(2);
  });
});

describe('the line in the basket is never past the stock', () => {
  beforeEach(async () => { await mount(); timers = vi.spyOn(globalThis, 'setTimeout'); });

  it('when two adds happen before the page has re-drawn', async () => {
    await act(async () => { shop().addToCart(product('ten'), 7); shop().addToCart(product('ten'), 7); });
    expect(line('ten')?.quantity).toBe(10);
  });

  it('when the stock dropped below what is in the basket, adding brings the line back to the stock', async () => {
    await add('ten', 5);
    rec.rows.public_storefront_products = [row('one', 1), row('ten', 3), row('none', 0)];
    vi.useFakeTimers();
    await act(async () => { window.dispatchEvent(new CustomEvent('yalla-products-changed')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    vi.useRealTimers();
    await settle();
    expect(product('ten').stock).toBe(3);
    const plan = await add('ten', 1);
    expect(plan).toMatchObject({ status: 'at-limit', total: 3 });
    expect(line('ten')?.quantity).toBe(3);
    expect(toast()?.message).toBe('All 3 of "Wild Zaatar ten" in stock are already in your basket.');
  });

  it('leaves the basket as it was when nothing more fits', async () => {
    await add('one', 1);
    const before = shop().cart;
    await add('one', 2);
    expect(shop().cart).toBe(before);
  });

  it('keeps different options of one product on separate lines', async () => {
    await act(async () => { shop().addToCart(product('ten'), 2, '250 g'); });
    await act(async () => { shop().addToCart(product('ten'), 3, '500 g'); });
    await act(async () => { shop().addToCart(product('ten'), 1, '250 g'); });
    expect(shop().cart.map(item => [item.selectedOption, item.quantity])).toEqual([['250 g', 3], ['500 g', 3]]);
  });

  it('describes the line it adds to, not another option of the same product', async () => {
    await act(async () => { shop().addToCart(product('ten'), 5); });
    let plan: ReturnType<Shop['addToCart']> | undefined;
    await act(async () => { plan = shop().addToCart(product('ten'), 5, '250 g'); });
    expect(plan).toMatchObject({ status: 'added', added: 5, total: 5 });
  });

  it('uses the latest stock, not the stock on the product object it was handed', async () => {
    const stale = { ...product('ten'), stock: 99 };
    let plan: ReturnType<Shop['addToCart']> | undefined;
    await act(async () => { plan = shop().addToCart(stale, 12); });
    expect(plan).toMatchObject({ status: 'limited', added: 10, total: 10, stock: 10 });
    expect(line('ten')?.quantity).toBe(10);
  });
});
