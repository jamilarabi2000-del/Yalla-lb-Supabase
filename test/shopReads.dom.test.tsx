// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// One page view of the storefront used to ask the database for the same things
// several times over: the delivery regions three times (a probe, the load, and a
// second load), the discount rules for every visitor (who always get an empty
// answer), and two live-update channels on the product table, each re-reading the
// whole catalogue on every change, plus a listener for a table that is not
// published. This mounts the real shop provider against a recording stand-in for
// Supabase and counts.
const rec = vi.hoisted(() => ({
  reads: [] as { table: string; columns: string }[],
  rpcs: [] as string[],
  channels: [] as { name: string; tables: string[] }[],
  removed: 0,
  session: null as any,
  rows: {} as Record<string, any[]>,
  authCallbacks: [] as ((event: string, session: unknown) => void)[],
  listeners: [] as { table: string; callback: (payload: unknown) => void }[],
}));

vi.mock('../src/lib/supabase', () => {
  const answer = (table: string) => ({ data: rec.rows[table] ?? [], error: null });
  const query = (table: string): any => new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve: any, reject: any) => Promise.resolve(answer(table)).then(resolve, reject);
      if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: (rec.rows[table] ?? [])[0] ?? null, error: null });
      return () => query(table);
    },
  });
  // anything the provider calls that this test does not care about answers "nothing"
  const quiet = (): any => new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? undefined : quiet()),
    apply: () => Promise.resolve({ data: null, error: null }),
  });
  const supabase: any = {
    from: (table: string) => ({
      select: (columns = '*') => { rec.reads.push({ table, columns }); return query(table); },
      insert: () => query(table), update: () => query(table), upsert: () => query(table), delete: () => query(table),
    }),
    rpc: (fn: string) => { rec.rpcs.push(fn); return Promise.resolve({ data: null, error: null }); },
    channel: (name: string) => {
      const channel: any = {
        tables: [] as string[],
        on(_kind: string, config: { table: string }, callback: (payload: unknown) => void) { channel.tables.push(config.table); rec.listeners.push({ table: config.table, callback }); return channel; },
        subscribe() { rec.channels.push({ name, tables: channel.tables }); return channel; },
      };
      return channel;
    },
    removeChannel: () => { rec.removed += 1; },
    auth: {
      getSession: async () => ({ data: { session: rec.session }, error: null }),
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => { rec.authCallbacks.push(callback); return { data: { subscription: { unsubscribe() {} } } }; },
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

const seen: { rules: unknown[]; bulkImport: ((check: any) => Promise<{ created: number; updated: number; errors: string[] }>) | null } = { rules: [], bulkImport: null };
const Probe: React.FC = () => { const shop = useShop(); seen.rules = shop.discountRules; seen.bulkImport = shop.bulkImportProducts; return null; };

let host: HTMLDivElement;
let root: Root;
const mount = async () => {
  await act(async () => { root.render(<ShopProvider><Probe /></ShopProvider>); });
  // the page's reads are all started in the first moments; let them and the deferred sign-in work settle
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
};
const readsOf = (table: string) => rec.reads.filter(r => r.table === table);
const channelsOn = (table: string) => rec.channels.filter(c => c.tables.includes(table));

beforeEach(() => {
  rec.reads.length = 0; rec.rpcs.length = 0; rec.channels.length = 0; rec.removed = 0; rec.session = null; rec.rows = {}; rec.authCallbacks.length = 0; rec.listeners.length = 0; seen.rules = []; seen.bulkImport = null;
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('a visitor who is not signed in', () => {
  it('reads the delivery regions once, and does not probe the table first', async () => {
    await mount();
    expect(readsOf('regions')).toHaveLength(1);
    expect(readsOf('regions').filter(r => r.columns.replace(/\s/g, '') === 'id')).toHaveLength(0);
  });

  it('does not ask for discount rules, which only an administrator can see', async () => {
    await mount();
    expect(readsOf('discount_rules')).toHaveLength(0);
  });

  it('keeps one live-update channel on the product table, and none on a table that is not published', async () => {
    await mount();
    expect(channelsOn('products')).toHaveLength(1);
    expect(rec.channels.flatMap(c => c.tables)).not.toContain('product_images');
  });

  it('still reads everything the page is made of, once each', async () => {
    await mount();
    for (const table of ['categories', 'sellers', 'public_storefront_products', 'product_bundles', 'cms_custom_blocks']) {
      expect(readsOf(table).length, table).toBeGreaterThanOrEqual(1);
    }
    expect(readsOf('categories')).toHaveLength(1);
    expect(readsOf('sellers')).toHaveLength(1);
    // and keeps the live updates for categories
    expect(channelsOn('categories')).toHaveLength(1);
  });

  it('closes its channels when the page goes away', async () => {
    await mount();
    const opened = rec.channels.length;
    act(() => root.unmount());
    expect(rec.removed).toBe(opened);
    root = createRoot(host);
  });
});

describe('a change to the products', () => {
  const productReads = () => readsOf('public_storefront_products').length;

  it('announced by the database is one re-read of the catalogue, however many listeners the page has', async () => {
    await mount();
    const before = productReads();
    // the database tells every listener on the product table; the page may only react once
    vi.useFakeTimers();
    await act(async () => { rec.listeners.filter(l => l.table === 'products').forEach(l => l.callback({ eventType: 'UPDATE' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(productReads() - before).toBe(1);
  });

  it('announced by the admin screens after a save is one re-read too', async () => {
    await mount();
    const before = productReads();
    vi.useFakeTimers();
    await act(async () => { window.dispatchEvent(new CustomEvent('yalla-products-changed')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(productReads() - before).toBe(1);
  });

  it('a burst of changes is still one re-read', async () => {
    await mount();
    const before = productReads();
    vi.useFakeTimers();
    await act(async () => {
      for (let i = 0; i < 5; i += 1) rec.listeners.filter(l => l.table === 'products').forEach(l => l.callback({ eventType: 'UPDATE' }));
      window.dispatchEvent(new CustomEvent('yalla-products-changed'));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(productReads() - before).toBe(1);
  });
});

describe('an administrator', () => {
  const admin = { id: 'a1', email: 'admin@example.test', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {}, aud: 'authenticated' };

  it('still gets the discount rules', async () => {
    rec.session = { user: admin, access_token: 'x' };
    rec.rows.profiles = [{ id: 'a1', role: 'admin', email: 'admin@example.test' }];
    await mount();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
    expect(readsOf('discount_rules').length).toBeGreaterThanOrEqual(1);
  });

  it('has the rules emptied from the page when they sign out', async () => {
    rec.session = { user: admin, access_token: 'x' };
    rec.rows.profiles = [{ id: 'a1', role: 'admin', email: 'admin@example.test' }];
    rec.rows.discount_rules = [{ id: 'r1', name: 'Summer sale', is_active: true, rule: { type: 'percentage', value: 10, target: 'all' }, coupons: [] }];
    await mount();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
    expect(seen.rules).toHaveLength(1);
    // the rows stay in the stand-in on purpose: the page must not keep or re-read them for a visitor
    const readsWhileAdmin = readsOf('discount_rules').length;
    await act(async () => { rec.session = null; rec.authCallbacks.forEach(callback => callback('SIGNED_OUT', null)); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
    expect(seen.rules).toHaveLength(0);
    expect(readsOf('discount_rules')).toHaveLength(readsWhileAdmin);
  });
});

describe('the bulk product importer', () => {
  // It and its CSV reader are only for the administrator's bulk upload, so they are
  // fetched when one is run instead of being in every page's first download.
  const check = (ready: boolean) => ({ ready, rows: [], fileErrors: ready ? [] : ['The file has problems'], counts: { create: 0, update: 0, unchanged: 0, invalid: 0 } });

  it('is fetched when an import is run, and refuses a file that has problems', async () => {
    await mount();
    await expect(seen.bulkImport!(check(false))).rejects.toThrow('The file has problems; nothing was imported.');
  });

  it('imports a file that is ready, which with nothing to write is nothing created or updated', async () => {
    await mount();
    await expect(seen.bulkImport!(check(true))).resolves.toEqual({ created: 0, updated: 0, errors: [] });
  });
});
