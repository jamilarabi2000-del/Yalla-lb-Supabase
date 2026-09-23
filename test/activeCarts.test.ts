import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Product } from '../src/types';
import {
  ABANDONED_AFTER_MINUTES,
  MAX_LINE_QUANTITY,
  buildActiveCarts,
  cartInsights,
  formatIdle,
  parseCartLines,
  recoveryMessage,
  type CartRow,
} from '../src/lib/activeCarts';
import { buildCustomerIndex } from '../src/lib/customerIndex';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const stripSql = (s: string) => s.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p-1', name: 'Laurel Soap', priceUSD: 12.5, stock: 10, isPublished: true, category: 'c', ...over,
} as Product);

const item = (id: string, quantity: unknown, snapshot: Record<string, unknown> = {}) =>
  ({ product: { id, name: 'Snapshot name', priceUSD: 1, image: 'https://tracker.example/pixel.gif', ...snapshot }, quantity });

const NOW = Date.parse('2026-09-23T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60000).toISOString();
const row = (over: Partial<CartRow> = {}): CartRow => ({
  user_id: 'u-1', items: [item('p-1', 2)], updated_at: minutesAgo(5), ...over,
});

describe('cart lines are checked, not trusted', () => {
  const catalog = new Map([
    ['p-1', product()],
    ['p-draft', product({ id: 'p-draft', name: 'Draft Jar', isPublished: false })],
    ['p-empty', product({ id: 'p-empty', name: 'Sold Out Oil', stock: 0 })],
  ]);

  it('takes the name and price from the catalog, not the shopper-written snapshot', () => {
    const { lines } = parseCartLines([item('p-1', 3, { name: 'Free Soap', priceUSD: 0.01 })], catalog);
    expect(lines).toEqual([{ productId: 'p-1', name: 'Laurel Soap', quantity: 3, unitPriceUSD: 12.5, lineTotalUSD: 37.5, problem: undefined }]);
  });

  it('never carries the snapshot image URL', () => {
    const { lines } = parseCartLines([item('p-1', 1)], catalog);
    expect(JSON.stringify(lines)).not.toContain('tracker.example');
    // Nor does the view render any image at all.
    expect(read('src/components/admin/ActiveCartsView.tsx')).not.toMatch(/<img\b/);
  });

  it(`ignores lines checkout would refuse: quantities outside 1-${MAX_LINE_QUANTITY}, fractions, strings, no product`, () => {
    const { lines, ignored } = parseCartLines([
      item('p-1', 0), item('p-1', 100), item('p-1', 1.5), item('p-1', '2'), { quantity: 1 }, null, 'junk',
      item('p-1', 99),
    ], catalog);
    expect(ignored).toBe(7);
    expect(lines.map(l => l.quantity)).toEqual([99]);
  });

  it('flags lines that cannot be bought, keeping a removed product\'s name from the snapshot', () => {
    const { lines } = parseCartLines([item('gone', 1, { name: 'Old Brass Tray' }), item('p-draft', 1), item('p-empty', 1)], catalog);
    expect(lines.map(l => [l.name, l.problem])).toEqual([
      ['Old Brass Tray', 'removed'], ['Draft Jar', 'unpublished'], ['Sold Out Oil', 'out_of_stock']]);
  });
});

describe('buildActiveCarts', () => {
  const products = [product(), product({ id: 'p-dime', priceUSD: 0.1 }), product({ id: 'p-draft', isPublished: false })];

  it('keeps only carts with something in them', () => {
    const carts = buildActiveCarts([
      row({ user_id: 'empty', items: [] }), row({ user_id: 'junk', items: [item('p-1', 0)] }), row({ user_id: 'u-1' }),
    ], products, NOW);
    expect(carts.map(c => c.userId)).toEqual(['u-1']);
  });

  it(`marks a cart abandoned after ${ABANDONED_AFTER_MINUTES} idle minutes`, () => {
    const [fresh, stale] = buildActiveCarts([
      row({ user_id: 'fresh', updated_at: minutesAgo(ABANDONED_AFTER_MINUTES - 1) }),
      row({ user_id: 'stale', updated_at: minutesAgo(ABANDONED_AFTER_MINUTES) }),
    ], products, NOW);
    expect([fresh.userId, fresh.abandoned, stale.userId, stale.abandoned]).toEqual(['fresh', false, 'stale', true]);
    expect(stale.minutesIdle).toBe(ABANDONED_AFTER_MINUTES);
  });

  it('prices only what can be bought, summed in cents', () => {
    const [cart] = buildActiveCarts([row({ items: [item('p-dime', 3), item('p-draft', 5), item('p-1', 1)] })], products, NOW);
    expect(cart.subtotalUSD).toBe(12.8);
    expect(cart.units).toBe(9);
  });

  it('adds up the insights from the carts themselves', () => {
    const carts = buildActiveCarts([
      row({ user_id: 'a', items: [item('p-1', 2)], updated_at: minutesAgo(90) }),
      row({ user_id: 'b', items: [item('p-dime', 3)], updated_at: minutesAgo(2) }),
    ], products, NOW);
    expect(cartInsights(carts)).toEqual({ carts: 2, totalValueUSD: 25.3, totalUnits: 5, abandonedCount: 1, abandonedValueUSD: 25 });
  });
});

describe('wording', () => {
  it('formats idle time like the spec', () => {
    expect([0, 12, 125, 3000].map(formatIdle)).toEqual(['just now', '12m ago', '2h ago', '2d ago']);
  });

  it('uses the spec\'s recovery message with the cart total', () => {
    expect(recoveryMessage(44)).toBe('Marhaba! We noticed you left some authentic Lebanese artisanal items in your cart on Yalla.lb ($44.00). Would you like help finalizing your delivery in Lebanon?');
  });

  it('resolves staff shoppers too, so the admin\'s own cart has a name', () => {
    const profiles = [{ id: 'admin', name: 'Store Admin', role: 'admin' }];
    expect(buildCustomerIndex(profiles, [])).toEqual([]);
    expect(buildCustomerIndex(profiles, [], { includeStaff: true }).map(c => c.name)).toEqual(['Store Admin']);
  });
});

describe('admin cart access (migration 20260923145848)', () => {
  const raw = read('supabase/migrations/20260923145848_admin_cart_visibility.sql');
  const sql = stripSql(raw);

  it('lets administrators read every cart', () => {
    expect(sql).toMatch(/create policy carts_admin_read on public\.carts\s+for select to authenticated\s+using \(\(select private\.is_admin\(\)\)\)/i);
  });

  it('lets only a verified administrator clear one, and nobody rewrite one', () => {
    expect(sql).toMatch(/create policy carts_verified_admin_delete on public\.carts\s+for delete to authenticated\s+using \(\(select private\.is_admin_verified\(\)\)\)/i);
    expect(sql).not.toMatch(/create policy\s+\w+\s+on public\.carts\s+for (insert|update|all)/i);
  });

  it('asserts its own invariants at apply time', () => {
    for (const marker of ['CARTS_ADMIN_WRITE_POLICY_UNEXPECTED', 'CARTS_DELETE_NOT_VERIFIED_ADMIN_ONLY', 'CARTS_REACHABLE_BY_ANON']) {
      expect(raw).toContain(marker);
    }
  });
});
