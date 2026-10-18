// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startScratchPostgres, postgresAvailable, findPostgresBin } from '../../scripts/db/scratchPostgres.mjs';

// The red-team review of 2026-10-18, run for real in a scratch PostgreSQL: the attacks the live guards stop (so they
// keep stopping them), and the two pending migrations that close what the review found (RT-3/RT-4 in checkout, RT-5
// the seller product flags). The function bodies and policies in fixture_redteam.sql are copied from the live project.
// What is NOT here: the project itself (nothing in this file can reach it), the real checkout function (only the two
// pieces of text the migration changes, in a stand-in), and Supabase's own auth service.
//
// Set REQUIRE_SCRATCH_POSTGRES=1 (CI does) to fail instead of skipping when PostgreSQL's programs are missing.
const available = postgresAvailable();
if (process.env.REQUIRE_SCRATCH_POSTGRES === '1') {
  it('a PostgreSQL server is available to run the migrations in', () => { expect(available).toBe(true); });
}

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.resolve(root, file), 'utf8');
const CHECKOUT = '20261018100000_checkout_uses_lbp_rate_and_locks_in_order';
const FLAGS = '20261018100100_seller_cannot_set_storefront_flags';
const up = (name: string) => read(`supabase/pending/${name}.sql`);
const down = (name: string) => read(`supabase/rollbacks/${name}.rollback.sql`);

const U = { cust: '00000000-0000-4000-8000-0000000000b2', cust2: '00000000-0000-4000-8000-0000000000c3', sell: '00000000-0000-4000-8000-0000000000d4', sell2: '00000000-0000-4000-8000-0000000000e5', adm: '00000000-0000-4000-8000-0000000000a1' } as const;
const SEL1 = '22222222-2222-4222-8222-000000000001';
const SEL2 = '22222222-2222-4222-8222-000000000002';
const P1 = '33333333-3333-4333-8333-000000000001';
const P2 = '33333333-3333-4333-8333-000000000002';
const PA = '55555555-5555-4555-8555-00000000000a';
const PB = '55555555-5555-4555-8555-00000000000b';
const ORD = '44444444-4444-4444-8444-000000000001';

describe.skipIf(!available)('red-team review: guards that hold, and the pending fixes, in a scratch PostgreSQL', () => {
  let pg: ReturnType<typeof startScratchPostgres>;
  let copies = 0;
  beforeAll(() => {
    pg = startScratchPostgres();
    pg.run('postgres', 'create database rt;');
    pg.run('rt', read('test/db/fixture_redteam.sql'), { singleTransaction: true });
    pg.run('rt', `
      insert into auth.users (id, email) values ('${U.cust}','cust@x.test'),('${U.cust2}','cust2@x.test'),('${U.sell}','sell@x.test'),('${U.sell2}','sell2@x.test'),('${U.adm}','adm@x.test');
      insert into public.profiles (id, role, seller_id, email) values ('${U.cust}','customer',null,'cust@x.test'),('${U.cust2}','customer',null,'cust2@x.test'),('${U.sell}','seller','${SEL1}','sell@x.test'),('${U.sell2}','seller','${SEL2}','sell2@x.test'),('${U.adm}','admin',null,'adm@x.test');
      insert into public.products (id, seller_id, name, artisan, yalla_item_code) values ('${P1}','${SEL1}','Zaatar','Seller One','YL-000001'),('${P2}','${SEL2}','Honey','Seller Two','YL-000002'),('${PA}','${SEL1}','A',null,null),('${PB}','${SEL1}','B',null,null);
      insert into public.orders (id, user_id, seller_ids, product_ids, subtotal_usd, delivery_fee_usd, total_usd, shipping) values ('${ORD}','${U.cust}',array['${SEL1}'::uuid],array['${P1}'::uuid],20,3,23,'{"name":"A"}');
    `);
  }, 120_000);
  afterAll(() => { pg?.stop(); });

  /** A fresh copy of the seeded database, so one test never sees another's changes. */
  const fresh = () => { const name = `c${++copies}`; pg.createDatabase(name, 'rt'); return name; };
  const as = (db: string, who: keyof typeof U | 'anon', sql: string) =>
    pg.asRole(db, who === 'anon' ? 'anon' : 'authenticated', sql, { claims: who === 'anon' ? {} : { sub: U[who] }, allowError: true });
  const value = (db: string, sql: string) => pg.run(db, sql).out;
  const apply = (db: string, sql: string) => pg.run(db, sql, { singleTransaction: true, allowError: true });
  const applyOk = (db: string, sql: string) => pg.run(db, sql, { singleTransaction: true });

  // ── what the live guards stop (regression tests for the attacks the review tried) ────────────────────────────
  describe('attacks the live guards stop', () => {
    it('a customer cannot make themselves admin or a seller: the role and seller_id changes are reverted', () => {
      const db = fresh();
      as(db, 'cust', `update public.profiles set role = 'admin', seller_id = '${SEL1}' where id = '${U.cust}'`);
      expect(value(db, `select role::text || ',' || coalesce(seller_id::text, 'none') from public.profiles where id = '${U.cust}'`)).toBe('customer,none');
    });
    it('nor mark their own email or phone as verified', () => {
      const db = fresh();
      expect(as(db, 'cust', `update public.profiles set email_verified = true where id = '${U.cust}'`).err).toContain('PROFILE_SECURITY_FIELDS_FORBIDDEN');
      expect(as(db, 'cust', `update public.profiles set is_otp_verified = true where id = '${U.cust}'`).err).toContain('PROFILE_SECURITY_FIELDS_FORBIDDEN');
    });
    it('nor insert a second, privileged copy of their profile (the row exists; there is no delete)', () => {
      const db = fresh();
      expect(as(db, 'cust', `insert into public.profiles (id, role, seller_id, is_otp_verified) values ('${U.cust}','customer','${SEL1}',true)`).err).toContain('profiles_pkey');
      expect(as(db, 'cust', `delete from public.profiles where id = '${U.cust}'`).out).not.toContain('DELETE 1');
      expect(value(db, `select count(*) from public.profiles where id = '${U.cust}'`)).toBe('1');
    });
    it("nor edit someone else's profile", () => {
      const db = fresh();
      as(db, 'cust', `update public.profiles set role = 'admin' where id = '${U.cust2}'`);
      expect(value(db, `select role::text from public.profiles where id = '${U.cust2}'`)).toBe('customer');
    });
    it('a customer cannot change an order, not even their own total', () => {
      const db = fresh();
      as(db, 'cust', `update public.orders set total_usd = 0 where id = '${ORD}'`);
      expect(value(db, `select total_usd from public.orders where id = '${ORD}'`)).toBe('23');
    });
    it("a seller on the order cannot change its money, and cannot mark it delivered; a seller not on it cannot touch it", () => {
      const db = fresh();
      expect(as(db, 'sell', `update public.orders set total_usd = 0 where id = '${ORD}'`).err).toContain('ORDER_FINANCIAL_FIELDS_FORBIDDEN');
      expect(as(db, 'sell', `update public.orders set status = 'delivered' where id = '${ORD}'`).err).toContain('ORDER_STATUS_TRANSITION_FORBIDDEN');
      as(db, 'sell2', `update public.orders set status = 'confirmed' where id = '${ORD}'`);
      expect(value(db, `select status::text from public.orders where id = '${ORD}'`)).toBe('pending');
    });
    it('a seller on the order can still move it one step forward (fulfilment keeps working)', () => {
      const db = fresh();
      expect(as(db, 'sell', `update public.orders set status = 'confirmed' where id = '${ORD}'`).ok).toBe(true);
      expect(value(db, `select status::text from public.orders where id = '${ORD}'`)).toBe('confirmed');
    });
    it("a seller cannot set their product's rating, review count or cost, nor touch another seller's product", () => {
      const db = fresh();
      expect(as(db, 'sell', `update public.products set rating = 5, reviews_count = 900 where id = '${P1}'`).err).toContain('PRODUCT_SECURITY_FIELDS_FORBIDDEN');
      expect(as(db, 'sell', `update public.products set cost_price_usd = 1 where id = '${P1}'`).err).toContain('PRODUCT_SECURITY_FIELDS_FORBIDDEN');
      as(db, 'sell', `update public.products set name = 'hijacked' where id = '${P2}'`);
      expect(value(db, `select name from public.products where id = '${P2}'`)).toBe('Honey');
    });
  });

  // ── RT-5: the seller product flags ───────────────────────────────────────────────────────────────────────────
  describe(`RT-5 ${FLAGS}`, () => {
    const grab = "update public.products set is_bestseller = true, is_featured = true, is_new_arrival = true, yalla_item_code = 'YL-000002' where id = '" + P1 + "'";

    it('before: a seller can mark their own product Bestseller, Featured and New, and take another product\'s item code', () => {
      const db = fresh();
      expect(as(db, 'sell', grab).ok).toBe(true);
      expect(value(db, `select is_bestseller and is_featured and is_new_arrival and yalla_item_code = 'YL-000002' from public.products where id = '${P1}'`)).toBe('t');
    });

    it.each([['is_bestseller', 'true'], ['is_featured', 'true'], ['is_new_arrival', 'true'], ['yalla_item_code', "'YL-000002'"]])('after: a seller changing %s is refused', (column, v) => {
      const db = fresh();
      applyOk(db, up(FLAGS));
      const result = as(db, 'sell', `update public.products set ${column} = ${v} where id = '${P1}'`);
      expect(result.err).toContain('PRODUCT_SECURITY_FIELDS_FORBIDDEN');
    });

    it('after: everything a seller does today still works (name, prices, stock, description)', () => {
      const db = fresh();
      applyOk(db, up(FLAGS));
      const result = as(db, 'sell', `update public.products set name = 'Wild Zaatar', regular_price = 12, promo_price = 9, stock = 4, discount_percentage = 25 where id = '${P1}'`);
      expect(result.ok, result.err).toBe(true);
      expect(value(db, `select name || ',' || stock from public.products where id = '${P1}'`)).toBe('Wild Zaatar,4');
    });

    it('after: an administrator can still set the badges and the item code', () => {
      const db = fresh();
      applyOk(db, up(FLAGS));
      const result = as(db, 'adm', grab);
      expect(result.ok, result.err).toBe(true);
      expect(value(db, `select is_bestseller and is_featured and is_new_arrival from public.products where id = '${P1}'`)).toBe('t');
    });

    it('after: the existing seller guards are untouched (rating is still refused)', () => {
      const db = fresh();
      applyOk(db, up(FLAGS));
      expect(as(db, 'sell', `update public.products set rating = 5 where id = '${P1}'`).err).toContain('PRODUCT_SECURITY_FIELDS_FORBIDDEN');
    });

    it('running it twice changes nothing the second time, and the function stays a trigger function with its grants', () => {
      const db = fresh();
      applyOk(db, up(FLAGS));
      const once = value(db, `select md5(pg_get_functiondef('private.protect_product_mutation'::regproc)) || coalesce(proacl::text, '') from pg_proc where oid = 'private.protect_product_mutation'::regproc`);
      applyOk(db, up(FLAGS));
      const twice = value(db, `select md5(pg_get_functiondef('private.protect_product_mutation'::regproc)) || coalesce(proacl::text, '') from pg_proc where oid = 'private.protect_product_mutation'::regproc`);
      expect(twice).toBe(once);
    });

    it('refuses, changing nothing, over a function it was not written for', () => {
      const db = fresh();
      pg.run(db, `create or replace function private.protect_product_mutation() returns trigger language plpgsql security definer set search_path to '' as $f$ begin return new; end; $f$;`);
      const result = apply(db, up(FLAGS));
      expect(result.ok).toBe(false);
      expect(result.err).toContain('not the function this migration was written against');
    });

    it('the rollback puts the old behaviour back, and refuses when the migration is not there', () => {
      const db = fresh();
      expect(apply(db, down(FLAGS)).err).toContain('ROLLBACK_PRODUCT_GUARD_TEXT_COUNT_UNEXPECTED');
      applyOk(db, up(FLAGS));
      applyOk(db, down(FLAGS));
      expect(as(db, 'sell', grab).ok).toBe(true);
    });
  });

  // ── RT-3 and RT-4: checkout ──────────────────────────────────────────────────────────────────────────────────
  describe(`RT-3 / RT-4 ${CHECKOUT}`, () => {
    const items = (first: string, second: string, sleep = 0) => JSON.stringify([{ product_id: first, sleep }, { product_id: second }]);
    const total = (db: string, usd = 10) => value(db, `select private.checkout_create_order('${items(PA, PB)}'::jsonb, ${usd})`);

    /** Two orders at the same moment whose carts hold the same two products in opposite order. */
    const opposite = (db: string) => {
      const bin = findPostgresBin()!;
      const session = (first: string, second: string) => new Promise<{ code: number | null; err: string }>(resolve => {
        const p = spawn(path.join(bin, 'psql'), ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-h', pg.socketDir, '-U', 'postgres', '-d', db], { stdio: ['pipe', 'pipe', 'pipe'] });
        let err = '';
        p.stderr.on('data', d => { err += d; });
        p.on('close', code => resolve({ code, err: err.trim() }));
        p.stdin.end(`select private.checkout_create_order('${items(first, second, 1.2)}'::jsonb, 1);`);
      });
      return Promise.all([session(PA, PB), session(PB, PA)]);
    };

    it('before: the Lebanese-pound total ignores the rate the administrator keeps', () => {
      const db = fresh();
      pg.run(db, `update public.app_settings set value = '100000' where key = 'lbp_usd_rate'`);
      expect(total(db)).toBe('895000');
    });

    it('before: two orders with the same two products in opposite order deadlock, and one fails', async () => {
      const db = fresh();
      const [a, b] = await opposite(db);
      expect([a, b].filter(s => /deadlock detected/.test(s.err))).toHaveLength(1);
    }, 30_000);

    it('after: the total uses the rate in app_settings', () => {
      const db = fresh();
      applyOk(db, up(CHECKOUT));
      expect(total(db)).toBe('895000');
      pg.run(db, `update public.app_settings set value = '100000' where key = 'lbp_usd_rate'`);
      expect(total(db)).toBe('1000000');
      pg.run(db, `update public.app_settings set value = '91250.5' where key = 'lbp_usd_rate'`);
      expect(total(db)).toBe('912505');
    });

    it.each(['abc', '', '0', '0.0000', '-5', '1e9', '12345678901', '89 500'])('after: a rate of %j is not used: the fallback 89,500 applies', bad => {
      const db = fresh();
      applyOk(db, up(CHECKOUT));
      pg.run(db, `update public.app_settings set value = '${bad}' where key = 'lbp_usd_rate'`);
      expect(total(db)).toBe('895000');
    });

    it('after: a missing setting also falls back to 89,500', () => {
      const db = fresh();
      applyOk(db, up(CHECKOUT));
      pg.run(db, `delete from public.app_settings where key = 'lbp_usd_rate'`);
      expect(total(db)).toBe('895000');
    });

    it('after: the same two orders in opposite order both succeed', async () => {
      const db = fresh();
      applyOk(db, up(CHECKOUT));
      const [a, b] = await opposite(db);
      expect(a.err, a.err).toBe('');
      expect(b.err, b.err).toBe('');
      expect([a.code, b.code]).toEqual([0, 0]);
    }, 30_000);

    it('after: a cart line that is not a product id still fails the way it did (INVALID_PRODUCT_ID), not with a cast error', () => {
      const db = fresh();
      applyOk(db, up(CHECKOUT));
      const result = pg.run(db, `select private.checkout_create_order('[{"product_id":"not-a-uuid"}]'::jsonb, 1)`, { allowError: true });
      expect(result.ok).toBe(false);
      expect(result.err).toContain('INVALID_PRODUCT_ID');
    });

    it('after: the private function is still not callable by browsers, and the migration leaves its grants as they were', () => {
      const db = fresh();
      const before = value(db, `select coalesce(proacl::text, 'null') from pg_proc where oid = 'private.checkout_create_order(jsonb,numeric)'::regprocedure`);
      applyOk(db, up(CHECKOUT));
      expect(value(db, `select coalesce(proacl::text, 'null') from pg_proc where oid = 'private.checkout_create_order(jsonb,numeric)'::regprocedure`)).toBe(before);
      expect(value(db, `select has_function_privilege('anon', 'private.checkout_create_order(jsonb,numeric)', 'execute') or has_function_privilege('authenticated', 'private.checkout_create_order(jsonb,numeric)', 'execute')`)).toBe('f');
    });

    it('running it twice changes nothing the second time', () => {
      const db = fresh();
      applyOk(db, up(CHECKOUT));
      const once = value(db, `select md5(pg_get_functiondef('private.checkout_create_order(jsonb,numeric)'::regprocedure))`);
      applyOk(db, up(CHECKOUT));
      expect(value(db, `select md5(pg_get_functiondef('private.checkout_create_order(jsonb,numeric)'::regprocedure))`)).toBe(once);
    });

    it('refuses, changing nothing, over a checkout it does not recognise', () => {
      const db = fresh();
      pg.run(db, `create or replace function private.checkout_create_order(p_items jsonb, p_usd numeric) returns numeric language plpgsql security definer set search_path to '' as $f$ begin return p_usd; end; $f$;`);
      const result = apply(db, up(CHECKOUT));
      expect(result.ok).toBe(false);
      expect(result.err).toContain('CHECKOUT_RATE_TEXT_COUNT_UNEXPECTED');
    });

    it('the rollback restores both behaviours exactly, and refuses when the migration is not there', async () => {
      const db = fresh();
      const original = value(db, `select md5(pg_get_functiondef('private.checkout_create_order(jsonb,numeric)'::regprocedure))`);
      expect(apply(db, down(CHECKOUT)).err).toContain('ROLLBACK_RATE_TEXT_COUNT_UNEXPECTED');
      applyOk(db, up(CHECKOUT));
      applyOk(db, down(CHECKOUT));
      expect(value(db, `select md5(pg_get_functiondef('private.checkout_create_order(jsonb,numeric)'::regprocedure))`)).toBe(original);
    });
  });
});
