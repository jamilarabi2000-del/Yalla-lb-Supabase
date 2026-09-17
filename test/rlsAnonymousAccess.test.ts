import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Live RLS regression suite.
 *
 * The rest of the suite asserts that strings appear in source files. That is
 * how a set of RLS policies with no matching table grants, and an admin RPC
 * whose contract did not match the form that calls it, both passed CI.
 *
 * These assertions talk to the real database as an anonymous visitor, using
 * only the two public values the browser bundle already contains. Set
 * VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or _ANON_KEY) to run it;
 * without them the suite skips rather than passing vacuously.
 */
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const live = Boolean(url && key);

/** Tables an anonymous visitor must never be able to read a row from. */
const PRIVATE_TABLES = [
  'profiles',
  'orders',
  'order_items',
  'product_private',
  'admin_activities',
  'carts',
  'wishlists',
  'user_addresses',
  'checkout_attempts',
  'phone_registry',
  'inventory_ledger',
] as const;

/** Reads the storefront legitimately depends on while logged out. */
const PUBLIC_READS = ['public_catalog', 'categories', 'sellers', 'regions'] as const;

/** A transport failure must fail the suite, never quietly satisfy it. */
function assertNotTransportError(error: { message?: string } | null) {
  if (!error) return;
  const message = String(error.message ?? '');
  if (/not in allowlist|fetch failed|ENOTFOUND|ECONNREFUSED|network|timeout/i.test(message)) {
    throw new Error(
      `Cannot reach Supabase, so this suite proves nothing: ${message}. ` +
        'Run it from an environment with egress to the project host.',
    );
  }
}

describe.skipIf(!live)('Anonymous access is confined to the public storefront', () => {
  let anon: SupabaseClient;

  beforeAll(async () => {
    anon = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    // Reachability probe: `regions` is world-readable, so a failure here is a
    // connectivity or configuration problem rather than a policy result.
    const { error } = await anon.from('regions').select('id').limit(1);
    assertNotTransportError(error);
    if (error) throw new Error(`Supabase reachable but misconfigured: ${error.message}`);
  });

  it.each(PRIVATE_TABLES)('anon cannot read %s', async (table) => {
    const { data, error } = await anon.from(table).select('*').limit(1);
    assertNotTransportError(error);
    // Either the grant is absent (a permission error) or RLS returns no rows.
    // Both are acceptable; returning a row is not.
    if (!error) expect(data ?? []).toHaveLength(0);
  });

  it.each(PUBLIC_READS)('anon can read %s', async (table) => {
    const { error } = await anon.from(table).select('*').limit(1);
    assertNotTransportError(error);
    expect(error).toBeNull();
  });

  it('anon cannot execute the admin product RPC', async () => {
    const { error } = await anon
      .schema('private')
      .rpc('create_product_atomic', { p_product: { name: 'x' }, p_private: {}, p_images: [] });
    assertNotTransportError(error);
    expect(error).not.toBeNull();
  });

  it('anon cannot execute the checkout gateway', async () => {
    const { error } = await anon.schema('private').rpc('checkout_create_order_gateway', {
      p_shipping: {}, p_payment_method: 'cod_usd', p_currency: 'USD',
      p_delivery_speed: 'standard', p_items: [], p_coupon_code: null,
      p_idempotency_key: '00000000-0000-0000-0000-000000000000',
    });
    assertNotTransportError(error);
    expect(error).not.toBeNull();
  });

  it('anon cannot write to the catalogue', async () => {
    const { error } = await anon.from('products').insert({ name: 'rls-probe', price_usd: 1 } as never);
    assertNotTransportError(error);
    expect(error).not.toBeNull();
  });

  it('the public catalogue never exposes cost or supplier columns', async () => {
    const { data, error } = await anon.from('public_catalog').select('*').limit(1);
    assertNotTransportError(error);
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(row).not.toHaveProperty('cost_price_usd');
      expect(row).not.toHaveProperty('seller_item_code');
      expect(row).not.toHaveProperty('low_stock_threshold');
      expect(row).not.toHaveProperty('custom_stock_label');
    }
  });

  it('full-text product search is reachable and bounded', async () => {
    const { data, error } = await anon.rpc('search_products', { p_query: '', p_limit: 5 });
    assertNotTransportError(error);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeLessThanOrEqual(5);
  });
});
