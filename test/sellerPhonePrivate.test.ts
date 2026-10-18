// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SELLER_COLUMNS, EARLY_REQUESTS } from '../src/lib/earlyRequests';
import { withSellerPhones, withoutSellerPhone } from '../src/lib/sellerPhones';
import type { Seller } from '../src/types';

// Red-team review RT-8: every visitor's browser was sent every active seller's phone number. The public seller read no
// longer asks for it; an administrator (every seller) or a seller (their own) fetches it through the database's private
// routes (supabase/pending/20261018210000_*), and it lives in memory only. The database side is tested in
// test/db/sellerPhone.db.test.ts, in a real PostgreSQL.
const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
const URL_BASE = 'https://abcdefghij.supabase.co';
const KEY = 'sb_publishable_testkey123';
const PHONE_A = '+961 70 111 111';
const PHONE_B = '+961 71 222 222';
const ID_A = '22222222-2222-4222-8222-aaaaaaaaaaaa';
const ID_B = '22222222-2222-4222-8222-bbbbbbbbbbbb';

type Seen = { url: string; method: string };
const seen: Seen[] = [];
let reply: (url: string) => { status: number; body: unknown } = () => ({ status: 200, body: [] });
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  seen.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
  const { status, body } = reply(url);
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
});

let catalog: typeof import('../src/services/supabaseCatalogService').supabaseCatalogService;
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', URL_BASE);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', KEY);
  vi.stubGlobal('fetch', fakeFetch);
  ({ supabaseCatalogService: catalog } = await import('../src/services/supabaseCatalogService'));
});
beforeEach(() => { seen.length = 0; fakeFetch.mockClear(); reply = () => ({ status: 200, body: [] }); localStorage.clear(); });

const routeMissing = { code: 'PGRST202', message: 'Could not find the function public.x in the schema cache' };

describe('the public seller read no longer carries the phone number', () => {
  it('the shared column list, which the early script and the service both use, leaves contact_phone out', () => {
    expect(SELLER_COLUMNS.split(',')).not.toContain('contact_phone');
    expect(SELLER_COLUMNS).not.toMatch(/phone/);
    const sellers = EARLY_REQUESTS.find(r => r.table === 'sellers')!;
    expect(sellers.query.find(([name]) => name === 'select')?.[1]).toBe(SELLER_COLUMNS);
  });

  it('the request the storefront really makes for sellers does not ask for it', async () => {
    await catalog.fetchSellers();
    const url = decodeURIComponent(seen.find(s => s.url.includes('/rest/v1/sellers'))!.url);
    expect(url).toContain('select=id,seller_code,name_en');
    expect(url).not.toContain('contact_phone');
  });

  it('the service\'s public seller read still takes its columns from that list, and the only other place the column is named for reading is the private fallback', () => {
    const service = read('src/services/supabaseCatalogService.ts');
    expect(service.match(/\.select\(\s*SELLER_COLUMNS\s*\)/g)?.length).toBe(1);
    expect(service.match(/select\('id,contact_phone'\)/g)?.length).toBe(1);
    expect(read('src/lib/earlyRequests.ts').match(/contact_phone/g)?.length).toBe(1);   // only the comment saying why it is missing
  });
});

describe('fetchSellerContactPhones', () => {
  it('an administrator asks the admin route and gets every seller\'s number, keyed by seller id', async () => {
    reply = () => ({ status: 200, body: [{ id: ID_A, contact_phone: PHONE_A }, { id: ID_B, contact_phone: PHONE_B }] });
    const phones = await catalog.fetchSellerContactPhones('admin');
    expect(phones).toEqual({ [ID_A]: PHONE_A, [ID_B]: PHONE_B });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].url).toContain('/rest/v1/rpc/admin_list_seller_phones');
  });

  it('a seller asks the seller route, which answers only for their own seller', async () => {
    reply = () => ({ status: 200, body: [{ seller_id: ID_A, contact_phone: PHONE_A }] });
    expect(await catalog.fetchSellerContactPhones('seller', ID_A)).toEqual({ [ID_A]: PHONE_A });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toContain('/rest/v1/rpc/my_seller_contact');
  });

  it('empty and missing numbers are left out, not stored as blanks', async () => {
    reply = () => ({ status: 200, body: [{ id: ID_A, contact_phone: null }, { id: ID_B, contact_phone: '' }] });
    expect(await catalog.fetchSellerContactPhones('admin')).toEqual({});
  });

  it('while the routes are not installed yet it falls back to reading the column (administrator: all rows)', async () => {
    reply = (url) => url.includes('/rpc/')
      ? { status: 404, body: routeMissing }
      : { status: 200, body: [{ id: ID_A, contact_phone: PHONE_A }, { id: ID_B, contact_phone: PHONE_B }] };
    expect(await catalog.fetchSellerContactPhones('admin')).toEqual({ [ID_A]: PHONE_A, [ID_B]: PHONE_B });
    const direct = decodeURIComponent(seen[1].url);
    expect(direct).toContain('/rest/v1/sellers?select=id,contact_phone');
    expect(direct).not.toContain('id=eq.');
  });

  it('...and a seller\'s fallback asks for their own row only', async () => {
    reply = (url) => url.includes('/rpc/')
      ? { status: 404, body: routeMissing }
      : { status: 200, body: [{ id: ID_A, contact_phone: PHONE_A }] };
    expect(await catalog.fetchSellerContactPhones('seller', ID_A)).toEqual({ [ID_A]: PHONE_A });
    expect(decodeURIComponent(seen[1].url)).toContain(`id=eq.${ID_A}`);
  });

  it('a seller with no seller id makes no direct read at all', async () => {
    reply = () => ({ status: 404, body: routeMissing });
    expect(await catalog.fetchSellerContactPhones('seller', null)).toEqual({});
    expect(seen.filter(s => s.url.includes('/rest/v1/sellers'))).toHaveLength(0);
  });

  it('a refusal is thrown and does NOT fall back to the column: an unverified admin session gets no side door', async () => {
    reply = () => ({ status: 403, body: { code: '42501', message: 'ADMIN_VERIFICATION_REQUIRED' } });
    await expect(catalog.fetchSellerContactPhones('admin')).rejects.toMatchObject({ code: '42501' });
    expect(seen).toHaveLength(1);
    expect(seen.some(s => s.url.includes('/rest/v1/sellers'))).toBe(false);
  });

  it('once the column is closed, the fallback\'s own refusal is thrown rather than hidden', async () => {
    reply = (url) => url.includes('/rpc/')
      ? { status: 404, body: routeMissing }
      : { status: 403, body: { code: '42501', message: 'permission denied for table sellers' } };
    await expect(catalog.fetchSellerContactPhones('admin')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('the seller list in memory', () => {
  const seller = (id: string, extra: Partial<Seller> = {}) => ({ id, nameEn: id, sellerCode: 'S', isActive: true, createdAt: '', updatedAt: '', ...extra }) as Seller;

  it('numbers are put on the matching sellers only; a seller without one is left alone', () => {
    const merged = withSellerPhones([seller(ID_A), seller(ID_B)], { [ID_A]: PHONE_A });
    expect(merged[0].contactPhone).toBe(PHONE_A);
    expect(merged[1].contactPhone).toBeUndefined();
  });

  it('it does not change the list it was given', () => {
    const list = [seller(ID_A)];
    withSellerPhones(list, { [ID_A]: PHONE_A });
    expect(list[0].contactPhone).toBeUndefined();
  });

  it('a number is taken off a seller (cache write, sign-out) and the rest of the seller is kept', () => {
    const clean = withoutSellerPhone(seller(ID_A, { contactPhone: PHONE_A, region: 'Koura' }));
    expect('contactPhone' in clean).toBe(false);
    expect(clean.region).toBe('Koura');
  });
});

describe('where the website uses it', () => {
  const ctx = read('src/context/ShopContext.tsx');

  it('only an administrator or a seller ever asks: a visitor or a customer has no access and gets an empty answer without a request', () => {
    expect(ctx).toContain("isAdminUser ? { who: 'admin', sellerId: null } : isSellerUser ? { who: 'seller', sellerId } : null");
    const reader = ctx.slice(ctx.indexOf('const readSellerPhones'), ctx.indexOf('const readSellerPhones') + 600);
    expect(reader.indexOf('if (!access)')).toBeGreaterThan(-1);
    expect(reader.indexOf('if (!access)')).toBeLessThan(reader.indexOf('fetchSellerContactPhones'));
    expect(ctx.match(/fetchSellerContactPhones\(/g)?.length).toBe(1);
  });

  it('the browser\'s catalogue cache never holds a number, on write or on read (an older cache is cleaned too)', () => {
    expect(ctx).toContain('writeCatalogCache(CATALOG_CACHE_KEYS.sellers, (sellers.map(withoutSellerPhone)))');
    expect(ctx).toContain('readCachedList<Seller>(CATALOG_CACHE_KEYS.sellers).map(withoutSellerPhone)');
  });

  it('both ways of loading sellers put the numbers back on afterwards (first load and refresh after an admin edit)', () => {
    expect(ctx).toContain('setSellers(withSellerPhones(supabaseSellers, sellerPhonesRef.current));');
    expect(ctx).toContain('setSellers(withSellerPhones(fresh, phones));');
  });
});
