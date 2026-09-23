import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Contract tests for the three MEDIUM findings from the 2026-09-23 audit.
 *
 * Each fix was verified live against the production database by impersonating
 * anon, a signed-in customer and an admin in a rolled-back transaction. These
 * tests pin the migrations that carry those fixes, so a later edit that
 * quietly undoes one fails here rather than in production.
 *
 * SQL comments are stripped before asserting: every migration explains the
 * pattern it removes, and that prose would otherwise satisfy the checks.
 */

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const stripSql = (s: string) => s.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
// TypeScript comments; `(^|[^:])` keeps the `//` inside URLs.
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('V4: app_settings is private unless a key is allowlisted', () => {
  const sql = stripSql(read('supabase/migrations/20260923140000_app_settings_public_key_allowlist.sql'));

  it('replaces the unconditional public read', () => {
    expect(sql).toMatch(/drop policy if exists app_settings_public_read/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it('allows exactly the keys the client reads', () => {
    // fetchLbpUsdRate is the only client read of this table.
    expect(sql).toMatch(/using\s*\(\s*key\s*=\s*any\s*\(\s*array\['lbp_usd_rate'\]/i);
  });

  it('asserts at apply time that no unconditional read survives', () => {
    expect(sql).toContain('APP_SETTINGS_STILL_UNCONDITIONALLY_READABLE');
  });

  it('matches the one key the client actually asks for', () => {
    const svc = read('src/services/supabaseCommerceService.ts');
    expect(svc).toContain(".eq('key', 'lbp_usd_rate')");
  });
});

describe('V5: storefront visibility is enforced by RLS, not by a definer copy', () => {
  const raw = read('supabase/migrations/20260923150000_storefront_view_security_invoker.sql');
  const sql = stripSql(raw);
  const grant = sql.match(/grant select \(([\s\S]*?)\)\s*on public\.products to anon/i)?.[1] ?? '';
  const granted = grant.split(',').map(c => c.trim()).filter(Boolean);

  it('runs the storefront view as the caller', () => {
    expect(sql).toMatch(/alter view public\.public_storefront_products set \(security_invoker = on\)/i);
  });

  it('grants anon only the columns the view already exposed', () => {
    expect(granted.length).toBe(34);
    for (const privateCol of ['cost_price_usd', 'seller_item_code', 'low_stock_threshold',
      'low_stock_notice', 'custom_stock_label', 'archived_at', 'scheduled_publish_at', 'slug']) {
      expect(granted, privateCol).not.toContain(privateCol);
    }
  });

  it('grants every column the view selects from products', () => {
    // A column the view reads but anon cannot would 401 the whole storefront
    // for signed-out visitors -- the outage of 2026-09-22 19:17-19:41.
    // The view's current definition: recovered byte-for-byte from production,
    // where it was applied without ever reaching the repo.
    const migration = stripSql(read('supabase/migrations/20260922190043_remove_legacy_product_price_columns.sql'));
    const view = migration.match(/create view public\.public_storefront_products as([\s\S]*?);/i)?.[1] ?? '';
    const selected = [...new Set([...view.matchAll(/\bp\.([a-z_]+)/g)].map(m => m[1]))];
    expect(selected.length).toBeGreaterThan(30);
    expect(selected.filter(c => !granted.includes(c))).toEqual([]);
  });

  it('drops the unused SECURITY DEFINER copy of the predicate', () => {
    expect(sql).toMatch(/drop function if exists public\.get_public_products\(\)/i);
    const client = ['src/services/supabaseCatalogService.ts', 'src/context/ShopContext.tsx']
      .map(f => stripSql(read(f))).join('\n');
    expect(client).not.toContain('get_public_products');
  });

  it('keeps the client on the view for signed-out visitors', () => {
    expect(read('src/services/supabaseCatalogService.ts')).toContain(".from('public_storefront_products')");
  });

  it('asserts its own invariants at apply time', () => {
    for (const marker of ['STOREFRONT_VIEW_NOT_SECURITY_INVOKER',
      'PRIVATE_PRODUCT_COLUMNS_GRANTED_TO_ANON', 'GET_PUBLIC_PRODUCTS_STILL_PRESENT']) {
      expect(raw).toContain(marker);
    }
  });
});

describe('V6: phone numbers are unique, and the check that reveals it is throttled', () => {
  const raw = read('supabase/migrations/20260923170000_enforce_phone_uniqueness.sql');
  const sql = stripSql(raw);

  it('client normaliser agrees with private.normalize_lb_phone on every case', async () => {
    const { normalizeLebanesePhone } = await import('../src/utils/phoneUtils');
    // Right-hand side is the output of the SQL function on production,
    // captured 2026-09-23. If these drift, the check and the trigger disagree
    // about which number a customer entered.
    const cases: Array<[string, string | null]> = [
      ['70123456', '70123456'],
      ['+961 70 123 456', '70123456'],
      ['+961 70123456', '70123456'],
      ['96170123456', '70123456'],
      ['3123456', '03123456'],
      ['03 123 456', '03123456'],
      ['961 3 123 456', '03123456'],
      ['123', null],
      ['', null],
      ['abc', null],
      ['701234567', null],
      ['٧٠١٢٣٤٥٦', null], // Arabic-Indic digits
    ];
    for (const [input, expected] of cases) {
      const n = normalizeLebanesePhone(input);
      expect(n.isValid ? n.cleanDigits : null, JSON.stringify(input)).toBe(expected);
    }
  });

  it('strips non-ASCII digits the way JavaScript does', () => {
    // Postgres's \\D can treat other scripts' digits as digits; JavaScript's
    // cannot. [^0-9] is the form both agree on.
    expect(sql).toContain("'[^0-9]'");
  });

  it('keeps the registry in step with profiles.phone', () => {
    expect(sql).toMatch(/after insert or update of phone or delete on public\.profiles/i);
    expect(sql).toMatch(/execute function private\.sync_phone_registry\(\)/i);
    expect(raw).toContain('PHONE_ALREADY_REGISTERED');
  });

  it('restores the check for signed-out callers', () => {
    expect(sql).toMatch(/grant execute on function private\.is_phone_available\(text\) to anon, authenticated/i);
  });

  it('declares both halves VOLATILE so PostgREST does not run them read-only', () => {
    // A STABLE function runs in a read-only transaction; the throttle insert
    // would fail and the client would silently fail open on every call.
    expect(sql).toMatch(/create or replace function private\.is_phone_available[\s\S]*?\bvolatile\b/i);
    expect(sql).toMatch(/create or replace function public\.is_phone_available[\s\S]*?\bvolatile\b/i);
  });

  it('throttles per caller and globally, and stores no raw IP', () => {
    expect(sql).toMatch(/c_caller_limit\s+constant integer\s*:=\s*10/i);
    expect(sql).toMatch(/c_global_limit\s+constant integer\s*:=\s*200/i);
    expect(sql).toContain('PHONE_CHECK_RATE_LIMITED');
    expect(sql).toMatch(/sha256\(convert_to\(/i);
  });

  it('asserts its own invariants at apply time', () => {
    for (const marker of ['PHONE_CHECK_MUST_BE_VOLATILE', 'PHONE_CHECK_NOT_CALLABLE_SIGNED_OUT',
      'PHONE_CHECK_ATTEMPTS_READABLE_BY_CLIENTS', 'PHONE_REGISTRY_TRIGGER_MISSING']) {
      expect(raw).toContain(marker);
    }
  });

  it('a taken number reaches the customer as that, not "item already exists"', async () => {
    const { toUserFacingError } = await import('../src/utils/userFacingError');
    const taken = toUserFacingError({ code: '23505', message: 'PHONE_ALREADY_REGISTERED' });
    expect(taken.publicCode).toBe('PHONE_TAKEN');
    expect(taken.message).toMatch(/phone number is already registered/i);
    // Every other unique violation keeps the generic mapping.
    expect(toUserFacingError({ code: '23505', message: 'duplicate key' }).publicCode).toBe('DUPLICATE');
  });

  it('signup writes the phone on its own, so a refusal cannot discard the address', () => {
    const shop = stripTs(read('src/context/ShopContext.tsx'));
    const signup = shop.slice(shop.indexOf('const signUpWithEmail'), shop.indexOf('const signUpWithEmail') + 9000);
    const bulk = signup.match(/\.update\(\{\s*first_name:[\s\S]*?\}\)/)?.[0] ?? '';
    expect(bulk).toContain('default_address');
    expect(bulk).not.toMatch(/\bphone\s*:/);
    expect(signup).toMatch(/\.update\(\{\s*phone:\s*targetPhone\s*\}\)/);
  });
});
