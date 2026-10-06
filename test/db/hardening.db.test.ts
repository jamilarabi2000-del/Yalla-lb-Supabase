// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { prepareFixture, postgresAvailable, read, ADMIN, SHOPPER, OTHER } from './harness.mjs';

// The four database hardening migrations (Build 3), run for real in a scratch PostgreSQL: real roles, grants,
// row-level security and triggers, with the repository's own SQL for the objects they touch. What is NOT here:
// the live project (nothing in this file can reach it), and PostgreSQL 17's MAINTAIN privilege (the server on
// this machine may be older; that one revoke is checked by the dry-run on the project).
//
// Set REQUIRE_SCRATCH_POSTGRES=1 (CI does) to fail instead of skipping when PostgreSQL's programs are missing.
const available = postgresAvailable();
if (process.env.REQUIRE_SCRATCH_POSTGRES === '1') {
  it('a PostgreSQL server is available to run the migrations in', () => { expect(available).toBe(true); });
}

const A = '20261004100000_admin_delete_functions_callable';
const B = '20261004100100_phone_registry_written_only_by_trigger';
const C = '20261004100200_revoke_unneeded_browser_grants';
const D = '20261004100300_anonymous_insert_size_caps_and_log_purge';
const up = (name: string) => read(`supabase/pending/${name}.sql`);
const down = (name: string) => read(`supabase/rollbacks/${name}.rollback.sql`);

const CAT = '11111111-1111-4111-8111-111111111111';
const CAT2 = '11111111-1111-4111-8111-222222222222';
const SEL = '22222222-2222-4222-8222-222222222222';
const SEL2 = '22222222-2222-4222-8222-333333333333';

describe.skipIf(!available)('the database hardening migrations, run for real in a scratch PostgreSQL', () => {
  let fixture: ReturnType<typeof prepareFixture>;
  beforeAll(() => { fixture = prepareFixture(); }, 120_000);
  afterAll(() => { fixture?.stop(); });

  const run = (db: string, sql: string, allowError = false) => fixture.pg.run(db, sql, { allowError });
  const apply = (db: string, sql: string) => fixture.pg.run(db, sql, { singleTransaction: true, allowError: true });
  const applyOk = (db: string, sql: string) => fixture.pg.run(db, sql, { singleTransaction: true });
  const as = (db: string, who: 'admin' | 'unverifiedAdmin' | 'shopper' | 'other' | 'anon' | 'service', sql: string) => {
    const role = who === 'anon' ? 'anon' : who === 'service' ? 'service_role' : 'authenticated';
    const sub = who === 'admin' || who === 'unverifiedAdmin' ? ADMIN : who === 'shopper' ? SHOPPER : who === 'other' ? OTHER : undefined;
    return fixture.pg.asRole(db, role, sql, { claims: sub ? { sub } : {}, settings: who === 'admin' ? { 'test.admin_verified': 'on' } : {}, allowError: true });
  };
  const value = (db: string, sql: string) => run(db, sql).out;
  const can = (db: string, role: string, privilege: string, object: string) => value(db, `select has_table_privilege('${role}', '${object}', '${privilege}')`) === 't';
  const canRun = (db: string, role: string, fn: string) => value(db, `select has_function_privilege('${role}', '${fn}', 'EXECUTE')`) === 't';

  /** A copy of the prepared database with a few people, a category with products, a seller. */
  const seeded = () => {
    const db = fixture.fresh();
    run(db, `
      insert into auth.users (id, email) values ('${ADMIN}', 'admin@x.test'), ('${SHOPPER}', 'shopper@x.test'), ('${OTHER}', 'other@x.test');
      insert into public.profiles (id, role) values ('${ADMIN}', 'admin'), ('${SHOPPER}', 'customer'), ('${OTHER}', 'customer');
      insert into public.categories (id, name_en) values ('${CAT}', 'Mouneh'), ('${CAT2}', 'Soap');
      insert into public.sellers (id, name_en) values ('${SEL}', 'Koura Oil'), ('${SEL2}', 'Chouf Soap');
      insert into public.products (name, category_id, seller_id) values ('Zaatar', '${CAT}', '${SEL}'), ('Olive oil', '${CAT}', '${SEL}');
    `);
    return db;
  };

  // ── 0. the starting point: what the audit found, reproduced ───────────────────────────────
  describe('before the migrations (what the audit found, reproduced here)', () => {
    it('a verified administrator cannot delete a category: permission denied for the private function', () => {
      const db = seeded();
      const result = as(db, 'admin', `select public.admin_delete_category('${CAT2}')`);
      expect(result.ok).toBe(false);
      expect(result.err).toContain('permission denied for function admin_delete_category');
      expect(value(db, `select count(*) from public.categories where id = '${CAT2}'`)).toBe('1');
    });

    it('nor delete a seller', () => {
      const db = seeded();
      const result = as(db, 'admin', `select public.admin_delete_seller('${SEL2}')`);
      expect(result.err).toContain('permission denied for function admin_delete_seller');
    });

    it('any signed-in user can write phone_registry directly: claim a number, release their own', () => {
      const db = seeded();
      expect(as(db, 'shopper', `insert into public.phone_registry (phone_key, user_id) values ('70123456', '${SHOPPER}')`).ok).toBe(true);
      // the real owner of that number is now refused
      const owner = as(db, 'other', `update public.profiles set phone = '70 123 456' where id = '${OTHER}'`);
      expect(owner.err).toContain('PHONE_ALREADY_REGISTERED');
      // and a user can delete their own row to dodge "one account per number"
      expect(as(db, 'shopper', `delete from public.phone_registry where user_id = '${SHOPPER}'`).ok).toBe(true);
    });

    it('anon holds SELECT on four admin-only tables, and signed-in users hold UPDATE and DELETE on the audit trail', () => {
      const db = seeded();
      for (const table of ['coupons', 'discount_rules', 'search_logs', 'seller_applications']) expect(can(db, 'anon', 'SELECT', `public.${table}`), table).toBe(true);
      expect(can(db, 'authenticated', 'UPDATE', 'public.admin_activities')).toBe(true);
      expect(can(db, 'authenticated', 'DELETE', 'public.admin_activities')).toBe(true);
    });

    it('an anonymous visitor can write a megabyte into a search log or a seller application', () => {
      const db = seeded();
      expect(as(db, 'anon', `insert into public.search_logs (query) select repeat('x', 1000000)`).ok).toBe(true);
      expect(as(db, 'anon', `insert into public.seller_applications (payload) select jsonb_build_object('about', repeat('x', 1000000))`).ok).toBe(true);
    });
  });

  // ── A. delete functions ──────────────────────────────────────────────────────────────────
  describe(`${A}`, () => {
    it('lets a verified administrator delete a category, and the function reports what it did', () => {
      const db = seeded();
      applyOk(db, up(A));
      const result = as(db, 'admin', `select public.admin_delete_category('${CAT2}')`);
      expect(result.ok, result.err).toBe(true);
      expect(JSON.parse(result.out)).toMatchObject({ category_id: CAT2, affected_products: 0, deleted_products: 0, reassigned_products: 0 });
      expect(value(db, `select count(*) from public.categories where id = '${CAT2}'`)).toBe('0');
    });

    it("keeps the function's own rules: a category with products needs a reassignment or an explicit delete", () => {
      const db = seeded();
      applyOk(db, up(A));
      const refused = as(db, 'admin', `select public.admin_delete_category('${CAT}')`);
      expect(refused.err).toContain('product(s) are attached to this category');
      expect(value(db, `select count(*) from public.categories where id = '${CAT}'`)).toBe('1');
      const moved = as(db, 'admin', `select public.admin_delete_category('${CAT}', '${CAT2}')`);
      expect(JSON.parse(moved.out)).toMatchObject({ reassigned_products: 2 });
      expect(value(db, `select count(*) from public.products where category_id = '${CAT2}'`)).toBe('2');
    });

    it('lets a verified administrator delete a seller, moving their products when asked', () => {
      const db = seeded();
      applyOk(db, up(A));
      const result = as(db, 'admin', `select public.admin_delete_seller('${SEL}', '${SEL2}')`);
      expect(result.ok, result.err).toBe(true);
      expect(JSON.parse(result.out)).toMatchObject({ reassigned_products: 2 });
      expect(value(db, `select count(*) from public.sellers where id = '${SEL}'`)).toBe('0');
      expect(value(db, `select count(*) from public.products where seller_id = '${SEL2}'`)).toBe('2');
    });

    it('still refuses a signed-in shopper, an unverified administrator session and anyone signed out, and deletes nothing', () => {
      const db = seeded();
      applyOk(db, up(A));
      expect(as(db, 'shopper', `select public.admin_delete_category('${CAT2}')`).err).toContain('Administrator authorization required');
      expect(as(db, 'unverifiedAdmin', `select public.admin_delete_category('${CAT2}')`).err).toContain('Administrator authorization required');
      expect(as(db, 'shopper', `select public.admin_delete_seller('${SEL2}')`).err).toContain('Administrator authorization required');
      expect(as(db, 'anon', `select public.admin_delete_category('${CAT2}')`).err).toContain('permission denied');
      expect(as(db, 'anon', `select public.admin_delete_seller('${SEL2}')`).err).toContain('permission denied');
      expect(value(db, 'select (select count(*) from public.categories) || \'/\' || (select count(*) from public.sellers)')).toBe('2/2');
    });

    it('leaves anon without EXECUTE on either layer, and signed-in users with it', () => {
      const db = seeded();
      applyOk(db, up(A));
      for (const fn of ['private.admin_delete_category(uuid,uuid,boolean)', 'public.admin_delete_category(uuid,uuid,boolean)', 'private.admin_delete_seller(uuid,uuid)', 'public.admin_delete_seller(uuid,uuid)']) {
        expect(canRun(db, 'anon', fn), `anon ${fn}`).toBe(false);
        expect(canRun(db, 'authenticated', fn), `authenticated ${fn}`).toBe(true);
      }
    });

    it('takes back an EXECUTE that anon had been given directly on the private functions', () => {
      const db = seeded();
      run(db, `grant execute on function private.admin_delete_category(uuid,uuid,boolean) to anon;
               grant execute on function private.admin_delete_seller(uuid,uuid) to anon;`);
      applyOk(db, up(A));
      expect(canRun(db, 'anon', 'private.admin_delete_category(uuid,uuid,boolean)')).toBe(false);
      expect(canRun(db, 'anon', 'private.admin_delete_seller(uuid,uuid)')).toBe(false);
    });

    it('is safe to run twice', () => {
      const db = seeded();
      applyOk(db, up(A));
      expect(apply(db, up(A)).ok).toBe(true);
    });

    it('stops, granting nothing at all, when the seller function does not refuse a non-administrator', () => {
      const db = seeded();
      run(db, `create or replace function private.admin_delete_seller(p_seller_id uuid, p_reassign_seller_id uuid default null) returns jsonb
               language plpgsql security definer set search_path to '' as $$
               begin /* mentions is_admin_verified but never enforces it */ delete from public.sellers where id = p_seller_id; return '{}'::jsonb; end $$;`);
      const result = apply(db, up(A));
      expect(result.ok).toBe(false);
      expect(result.err).toContain('did not refuse a signed-in user who is not an administrator');
      expect(canRun(db, 'authenticated', 'private.admin_delete_category(uuid,uuid,boolean)'), 'the category grant was rolled back with it').toBe(false);
      expect(canRun(db, 'authenticated', 'private.admin_delete_seller(uuid,uuid)')).toBe(false);
    });

    it('stops when a function never calls the verified-administrator check', () => {
      const db = seeded();
      run(db, `create or replace function private.admin_delete_seller(p_seller_id uuid, p_reassign_seller_id uuid default null) returns jsonb
               language sql security definer set search_path to '' as $$ select '{}'::jsonb $$;`);
      const result = apply(db, up(A));
      expect(result.ok).toBe(false);
      expect(result.err).toContain('does not call private.is_admin_verified()');
      expect(canRun(db, 'authenticated', 'private.admin_delete_category(uuid,uuid,boolean)')).toBe(false);
    });

    it('stops, granting nothing, when it cannot run its own safety check (the proof must not be skipped)', () => {
      const db = seeded();
      run(db, 'revoke usage on schema private from authenticated');
      const result = apply(db, up(A));
      expect(result.ok).toBe(false);
      expect(result.err).toContain('could not run it: permission denied');
      expect(canRun(db, 'authenticated', 'private.admin_delete_category(uuid,uuid,boolean)')).toBe(false);
    });

    it('skips a seller function the project does not have, and still fixes the category one', () => {
      const db = seeded();
      run(db, 'drop function public.admin_delete_seller(uuid, uuid); drop function private.admin_delete_seller(uuid, uuid);');
      const result = apply(db, up(A));
      expect(result.ok, result.err).toBe(true);
      expect(result.err).toContain('skipped: private.admin_delete_seller(uuid,uuid) does not exist');
      expect(canRun(db, 'authenticated', 'private.admin_delete_category(uuid,uuid,boolean)')).toBe(true);
    });

    it('stops when the category function is missing, because the repository says it must exist', () => {
      const db = seeded();
      run(db, 'drop function public.admin_delete_category(uuid, uuid, boolean); drop function private.admin_delete_category(uuid, uuid, boolean);');
      const result = apply(db, up(A));
      expect(result.ok).toBe(false);
      expect(result.err).toContain('does not exist, but the repository says it should');
    });

    it('rolls back to the state it found, and can be applied again', () => {
      const db = seeded();
      applyOk(db, up(A));
      run(db, down(A));
      expect(as(db, 'admin', `select public.admin_delete_category('${CAT2}')`).err).toContain('permission denied for function admin_delete_category');
      expect(as(db, 'admin', `select public.admin_delete_seller('${SEL2}')`).err).toContain('permission denied for function admin_delete_seller');
      expect(canRun(db, 'authenticated', 'public.admin_delete_category(uuid,uuid,boolean)')).toBe(true);
      expect(apply(db, up(A)).ok).toBe(true);
      expect(as(db, 'admin', `select public.admin_delete_category('${CAT2}')`).ok).toBe(true);
    });
  });

  // ── B. phone_registry ────────────────────────────────────────────────────────────────────
  describe(`${B}`, () => {
    const registry = (db: string) => value(db, 'select string_agg(phone_key || \':\' || user_id::text, \',\' order by phone_key) from public.phone_registry');

    it('stops a signed-in user from writing the registry directly', () => {
      const db = seeded();
      applyOk(db, up(B));
      expect(as(db, 'shopper', `insert into public.phone_registry (phone_key, user_id) values ('70123456', '${SHOPPER}')`).err).toContain('permission denied for table phone_registry');
      run(db, `insert into public.phone_registry (phone_key, user_id) values ('71111111', '${SHOPPER}')`);
      expect(as(db, 'shopper', `update public.phone_registry set phone_key = '70999999' where user_id = '${SHOPPER}'`).err).toContain('permission denied');
      expect(as(db, 'shopper', `delete from public.phone_registry where user_id = '${SHOPPER}'`).err).toContain('permission denied');
      expect(as(db, 'anon', `insert into public.phone_registry (phone_key, user_id) values ('70222222', '${SHOPPER}')`).err).toContain('permission denied');
      expect(registry(db)).toBe(`71111111:${SHOPPER}`);
    });

    it("keeps the trigger working: a profile's phone still registers the number, and a taken number is still refused", () => {
      const db = seeded();
      applyOk(db, up(B));
      expect(as(db, 'shopper', `update public.profiles set phone = '03 123 456' where id = '${SHOPPER}'`).ok).toBe(true);
      expect(registry(db)).toBe(`03123456:${SHOPPER}`);
      const taken = as(db, 'other', `update public.profiles set phone = '+961 3 123 456' where id = '${OTHER}'`);
      expect(taken.err).toContain('PHONE_ALREADY_REGISTERED');
      // changing number releases the old one
      as(db, 'shopper', `update public.profiles set phone = '71 000 111' where id = '${SHOPPER}'`);
      expect(registry(db)).toBe(`71000111:${SHOPPER}`);
      expect(as(db, 'other', `update public.profiles set phone = '03 123 456' where id = '${OTHER}'`).ok).toBe(true);
    });

    it('still answers the sign-up availability check, for signed-out and signed-in callers', () => {
      const db = seeded();
      applyOk(db, up(B));
      as(db, 'shopper', `update public.profiles set phone = '70 555 666' where id = '${SHOPPER}'`);
      expect(as(db, 'anon', `select public.is_phone_available('70555666')`).out).toBe('f');
      expect(as(db, 'other', `select public.is_phone_available('70555666')`).out).toBe('f');
      expect(as(db, 'shopper', `select public.is_phone_available('70555666')`).out).toBe('t');   // their own number
      expect(as(db, 'anon', `select public.is_phone_available('70999000')`).out).toBe('t');
    });

    it('lets a signed-in user read their own row and nobody else\'s, and a signed-out visitor nothing', () => {
      const db = seeded();
      applyOk(db, up(B));
      as(db, 'shopper', `update public.profiles set phone = '70 555 666' where id = '${SHOPPER}'`);
      as(db, 'other', `update public.profiles set phone = '70 777 888' where id = '${OTHER}'`);
      expect(as(db, 'shopper', 'select string_agg(phone_key, \',\') from public.phone_registry').out).toBe('70555666');
      expect(as(db, 'other', 'select string_agg(phone_key, \',\') from public.phone_registry').out).toBe('70777888');
      expect(as(db, 'anon', 'select count(*) from public.phone_registry').out).toBe('0');
    });

    it('removes the number when the profile goes', () => {
      const db = seeded();
      applyOk(db, up(B));
      as(db, 'shopper', `update public.profiles set phone = '70 555 666' where id = '${SHOPPER}'`);
      run(db, `delete from public.profiles where id = '${SHOPPER}'`);
      expect(registry(db)).toBe('');
    });

    it('drops any other policy that lets a client write, and keeps ones that only read', () => {
      const db = seeded();
      run(db, `create policy phone_registry_admin_all on public.phone_registry for all to authenticated using (private.is_admin_verified());
               create policy phone_registry_admin_read on public.phone_registry for select to authenticated using (private.is_admin_verified());
               create policy phone_registry_odd_insert on public.phone_registry for insert to anon with check (true);`);
      const result = apply(db, up(B));
      expect(result.ok, result.err).toBe(true);
      expect(result.err).toContain('dropping policy phone_registry_admin_all');
      expect(result.err).toContain('dropping policy phone_registry_own');
      expect(result.err).toContain('dropping policy phone_registry_odd_insert');
      expect(value(db, `select string_agg(polname, ',' order by polname) from pg_policy where polrelid = 'public.phone_registry'::regclass`)).toBe('phone_registry_admin_read,phone_registry_require_verified_admin_mutation,phone_registry_select_own');
    });

    it('keeps a restrictive policy: it can only narrow access, never widen it', () => {
      const db = seeded();
      const result = apply(db, up(B));
      expect(result.ok, result.err).toBe(true);
      expect(result.err).not.toContain('dropping policy phone_registry_require_verified_admin_mutation');
      expect(value(db, `select polpermissive::text || ':' || polcmd::text from pg_policy where polrelid = 'public.phone_registry'::regclass and polname = 'phone_registry_require_verified_admin_mutation'`)).toBe('false:*');
    });

    it('before: an administrator could write any row (the live ALL policy); after: no direct writes for anyone', () => {
      const db = seeded();
      expect(as(db, 'admin', `insert into public.phone_registry (phone_key, user_id) values ('70111222', '${SHOPPER}')`).ok).toBe(true);
      run(db, 'delete from public.phone_registry');
      applyOk(db, up(B));
      expect(as(db, 'admin', `insert into public.phone_registry (phone_key, user_id) values ('70111222', '${SHOPPER}')`).err).toContain('permission denied');
    });

    it('turns row-level security back on if it had been switched off', () => {
      const db = seeded();
      run(db, 'alter table public.phone_registry disable row level security');
      applyOk(db, up(B));
      expect(value(db, `select relrowsecurity from pg_class where oid = 'public.phone_registry'::regclass`)).toBe('t');
    });

    it('stops, changing nothing, when the trigger that maintains the registry is missing', () => {
      const db = seeded();
      run(db, 'drop trigger sync_phone_registry on public.profiles');
      const result = apply(db, up(B));
      expect(result.ok).toBe(false);
      expect(result.err).toContain('sync_phone_registry trigger on public.profiles is missing or not SECURITY DEFINER');
      expect(can(db, 'authenticated', 'INSERT', 'public.phone_registry')).toBe(true);
    });

    it('stops when the trigger would run as the caller (it could no longer write the registry)', () => {
      const db = seeded();
      run(db, 'alter function private.sync_phone_registry() security invoker');
      const result = apply(db, up(B));
      expect(result.ok).toBe(false);
      expect(can(db, 'authenticated', 'INSERT', 'public.phone_registry')).toBe(true);
    });

    it('is safe to run twice, and rolls back to the state it found', () => {
      const db = seeded();
      applyOk(db, up(B));
      expect(apply(db, up(B)).ok).toBe(true);
      run(db, down(B));
      expect(as(db, 'shopper', `insert into public.phone_registry (phone_key, user_id) values ('70123456', '${SHOPPER}')`).ok).toBe(true);
      expect(as(db, 'shopper', `delete from public.phone_registry where user_id = '${SHOPPER}'`).ok).toBe(true);
      expect(value(db, `select string_agg(polname || ':' || polcmd::text, ',' order by polname) from pg_policy where polrelid = 'public.phone_registry'::regclass`)).toBe('phone_registry_own:*,phone_registry_require_verified_admin_mutation:*');
      expect(value(db, `select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.phone_registry'::regclass and polname = 'phone_registry_own'`)).toContain('is_admin()');
      expect(apply(db, up(B)).ok).toBe(true);
    });
  });

  // ── C. grants ────────────────────────────────────────────────────────────────────────────
  describe(`${C}`, () => {
    it('takes SELECT on the four admin-only tables from anon, and leaves what administrators read', () => {
      const db = seeded();
      applyOk(db, up(C));
      for (const table of ['coupons', 'discount_rules', 'search_logs', 'seller_applications']) {
        expect(can(db, 'anon', 'SELECT', `public.${table}`), `anon ${table}`).toBe(false);
        expect(as(db, 'anon', `select count(*) from public.${table}`).err, table).toContain('permission denied');
        expect(can(db, 'authenticated', 'SELECT', `public.${table}`), `authenticated ${table}`).toBe(true);
      }
      run(db, `insert into public.search_logs (query) values ('zaatar'); insert into public.coupons (coupon_code) values ('EID')`);
      expect(as(db, 'admin', 'select count(*) from public.search_logs').out).toBe('1');
      expect(as(db, 'admin', 'select count(*) from public.coupons').out).toBe('1');
      expect(as(db, 'shopper', 'select count(*) from public.search_logs').out).toBe('0');   // RLS, as before
    });

    it('keeps anonymous searches and seller applications working (they insert without reading back)', () => {
      const db = seeded();
      applyOk(db, up(C));
      expect(as(db, 'anon', `insert into public.search_logs (query, origin) values ('zaatar', 'navbar')`).ok).toBe(true);
      expect(as(db, 'shopper', `insert into public.search_logs (query, origin, user_id) values ('soap', 'navbar', '${SHOPPER}')`).ok).toBe(true);
      expect(as(db, 'anon', `insert into public.seller_applications (payload) values ('{"name":"Rima"}')`).ok).toBe(true);
      expect(value(db, 'select count(*) from public.search_logs')).toBe('2');
    });

    it("keeps an administrator's clean-up of old search logs working", () => {
      const db = seeded();
      applyOk(db, up(C));
      run(db, `insert into public.search_logs (query, created_at) values ('old', now() - interval '90 days'), ('new', now())`);
      expect(as(db, 'admin', `delete from public.search_logs where created_at < now() - interval '30 days'`).ok).toBe(true);
      expect(value(db, 'select string_agg(query, \',\') from public.search_logs')).toBe('new');
    });

    it('takes UPDATE and DELETE on the audit trail from browsers; the trigger stays as a second lock', () => {
      const db = seeded();
      run(db, `insert into public.admin_activities (action_type, summary) values ('x', 'y')`);
      applyOk(db, up(C));
      expect(can(db, 'authenticated', 'UPDATE', 'public.admin_activities')).toBe(false);
      expect(can(db, 'authenticated', 'DELETE', 'public.admin_activities')).toBe(false);
      expect(as(db, 'admin', `update public.admin_activities set summary = 'edited'`).err).toContain('permission denied');
      expect(as(db, 'admin', `delete from public.admin_activities`).err).toContain('permission denied');
      expect(as(db, 'admin', 'select count(*) from public.admin_activities').out).toBe('1');   // reading it is unchanged
      expect(run(db, `update public.admin_activities set summary = 'edited'`, true).err).toContain('append-only');   // the trigger, even for the owner
    });

    it('changes no policy and no data', () => {
      const db = seeded();
      run(db, `insert into public.search_logs (query) values ('zaatar')`);
      const policies = () => value(db, `select md5(string_agg(c.relname || polname || polcmd::text || coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), ''), '|' order by c.relname, polname)) from pg_policy p join pg_class c on c.oid = p.polrelid`);
      const before = policies();
      applyOk(db, up(C));
      expect(policies()).toBe(before);
      expect(value(db, 'select count(*) from public.search_logs')).toBe('1');
    });

    it('changes exactly the privileges it names and no others (a table by table comparison for the browser roles)', () => {
      const db = seeded();
      const grants = () => run(db, `select string_agg(grantee || ' ' || table_name || ' ' || privilege_type, E'\\n' order by grantee, table_name, privilege_type)
                                   from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')`).out.split('\n');
      const before = new Set(grants());
      applyOk(db, up(C));
      const after = new Set(grants());
      const removed = [...before].filter(g => !after.has(g)).sort();
      const added = [...after].filter(g => !before.has(g));
      expect(added).toEqual([]);
      expect(removed).toEqual([
        'anon coupons SELECT',
        'anon discount_rules SELECT',
        'anon search_logs SELECT',
        'anon seller_applications SELECT',
        'authenticated admin_activities DELETE',
        'authenticated admin_activities UPDATE',
      ]);
    });

    it('stops, changing nothing, when an insert trigger runs as the caller and reads the table', () => {
      const db = seeded();
      run(db, `create function public.count_logs_on_insert() returns trigger language plpgsql as $$
               begin perform count(*) from public.search_logs; return new; end $$;
               create trigger count_logs before insert on public.search_logs for each row execute function public.count_logs_on_insert();`);
      const result = apply(db, up(C));
      expect(result.ok).toBe(false);
      expect(result.err).toContain('insert trigger count_logs');
      expect(can(db, 'anon', 'SELECT', 'public.search_logs')).toBe(true);
    });

    it('does not stop for an update trigger that reads the table, which anon never fires', () => {
      const db = seeded();
      run(db, `create function public.guard_status() returns trigger language plpgsql as $$
               begin perform count(*) from public.seller_applications; return new; end $$;
               create trigger guard_status before update on public.seller_applications for each row execute function public.guard_status();`);
      expect(apply(db, up(C)).ok).toBe(true);
    });

    it('goes ahead for a rate limiter that runs as its owner, the usual shape, and anonymous inserts still work', () => {
      const db = seeded();
      run(db, `create function private.limit_inserts() returns trigger language plpgsql security definer set search_path = '' as $$
               begin if (select count(*) from public.search_logs where created_at > now() - interval '1 minute') >= 50 then raise exception 'rate limited'; end if; return new; end $$;
               create trigger limit_inserts before insert on public.search_logs for each row execute function private.limit_inserts();`);
      const result = apply(db, up(C));
      expect(result.ok, result.err).toBe(true);
      expect(as(db, 'anon', `insert into public.search_logs (query) values ('zaatar')`).ok).toBe(true);
    });

    it('catches what the trigger check cannot see: a caller-privilege read that never names the table', () => {
      const db = seeded();
      run(db, `create function public.count_something() returns trigger language plpgsql as $$
               begin execute format('select count(*) from public.%I', tg_table_name); return new; end $$;
               create trigger count_something before insert on public.search_logs for each row execute function public.count_something();`);
      const result = apply(db, up(C));
      expect(result.ok).toBe(false);
      expect(result.err).toContain('an anonymous insert into public.search_logs worked before revoking anon\'s SELECT and gives "permission" after');
      expect(can(db, 'anon', 'SELECT', 'public.search_logs')).toBe(true);
    });

    it('is safe to run twice, and rolls back to the state it found', () => {
      const db = seeded();
      applyOk(db, up(C));
      expect(apply(db, up(C)).ok).toBe(true);
      run(db, down(C));
      for (const table of ['coupons', 'discount_rules', 'search_logs', 'seller_applications']) expect(can(db, 'anon', 'SELECT', `public.${table}`), table).toBe(true);
      expect(can(db, 'authenticated', 'UPDATE', 'public.admin_activities')).toBe(true);
      expect(can(db, 'authenticated', 'DELETE', 'public.admin_activities')).toBe(true);
      expect(apply(db, up(C)).ok).toBe(true);
    });

    it('says that it skipped MAINTAIN on a server that does not have it, and does not pretend otherwise', () => {
      const db = seeded();
      const version = Number(value(db, "select current_setting('server_version_num')"));
      const result = apply(db, up(C));
      expect(result.ok, result.err).toBe(true);
      if (version < 170000) expect(result.err).toContain('MAINTAIN does not exist on this server version');
    });
  });

  // ── D. size caps and the purge function ──────────────────────────────────────────────────
  describe(`${D}`, () => {
    it('refuses an over-long search, for signed-out and signed-in callers, and accepts 200 characters of any script', () => {
      const db = seeded();
      applyOk(db, up(D));
      expect(as(db, 'anon', `insert into public.search_logs (query) select repeat('x', 201)`).err).toContain('violates check constraint "search_logs_query_length"');
      expect(as(db, 'shopper', `insert into public.search_logs (query, user_id) select repeat('y', 201), '${SHOPPER}'`).err).toContain('search_logs_query_length');
      expect(as(db, 'anon', `insert into public.search_logs (query) select repeat('x', 200)`).ok).toBe(true);
      expect(as(db, 'anon', `insert into public.search_logs (query) select repeat('زعتر', 50)`).ok).toBe(true);   // 200 characters, 400 bytes
    });

    it('refuses an application over 16 kB and accepts an ordinary one', () => {
      const db = seeded();
      applyOk(db, up(D));
      expect(as(db, 'anon', `insert into public.seller_applications (payload) select jsonb_build_object('about', repeat('x', 20000))`).err).toContain('seller_applications_payload_size');
      expect(as(db, 'anon', `insert into public.seller_applications (payload) values ('{"name":"Rima","phone":"03123456","about":"Wild thyme from Koura"}')`).ok).toBe(true);
    });

    it('does not scan or reject rows that are already there (NOT VALID), and says so when asked to validate', () => {
      const db = seeded();
      run(db, `insert into public.search_logs (query) select repeat('x', 5000)`);
      expect(apply(db, up(D)).ok).toBe(true);
      expect(value(db, 'select length(query) from public.search_logs')).toBe('5000');
      expect(value(db, `select convalidated from pg_constraint where conname = 'search_logs_query_length'`)).toBe('f');
      expect(run(db, 'alter table public.search_logs validate constraint search_logs_query_length', true).err).toContain('is violated by some row');
    });

    it('adds a purge function only the service role can run, that refuses a short or missing age, and deletes only older rows', () => {
      const db = seeded();
      applyOk(db, up(D));
      run(db, `insert into public.search_logs (query, created_at) values ('old', now() - interval '400 days'), ('older', now() - interval '200 days'), ('new', now())`);
      expect(canRun(db, 'anon', 'private.purge_search_logs(interval)')).toBe(false);
      expect(canRun(db, 'authenticated', 'private.purge_search_logs(interval)')).toBe(false);
      expect(as(db, 'admin', `select private.purge_search_logs(interval '180 days')`).err).toContain('permission denied');
      expect(as(db, 'service', `select private.purge_search_logs(interval '1 day')`).err).toContain('at least 7 days');
      expect(as(db, 'service', 'select private.purge_search_logs(null)').err).toContain('at least 7 days');
      expect(value(db, 'select count(*) from public.search_logs')).toBe('3');
      expect(as(db, 'service', `select private.purge_search_logs(interval '300 days')`).out).toBe('1');
      expect(as(db, 'service', `select private.purge_search_logs(interval '30 days')`).out).toBe('1');
      expect(value(db, 'select string_agg(query, \',\') from public.search_logs')).toBe('new');
    });

    it('is safe to run twice, and rolls back completely', () => {
      const db = seeded();
      applyOk(db, up(D));
      expect(apply(db, up(D)).ok).toBe(true);
      run(db, down(D));
      expect(as(db, 'anon', `insert into public.search_logs (query) select repeat('x', 5000)`).ok).toBe(true);
      expect(value(db, `select count(*) from pg_proc where proname = 'purge_search_logs'`)).toBe('0');
      expect(apply(db, up(D)).ok).toBe(true);
    });
  });

  // ── all four together ────────────────────────────────────────────────────────────────────
  describe('applied together, in order', () => {
    it('apply cleanly, change nothing the app reads, and leave the starting point after the rollbacks in reverse', () => {
      const db = seeded();
      const facts = () => ({
        deleteCategory: canRun(db, 'authenticated', 'private.admin_delete_category(uuid,uuid,boolean)'),
        deleteSeller: canRun(db, 'authenticated', 'private.admin_delete_seller(uuid,uuid)'),
        registryInsert: can(db, 'authenticated', 'INSERT', 'public.phone_registry'),
        anonCoupons: can(db, 'anon', 'SELECT', 'public.coupons'),
        anonSearchLogs: can(db, 'anon', 'SELECT', 'public.search_logs'),
        auditDelete: can(db, 'authenticated', 'DELETE', 'public.admin_activities'),
        caps: value(db, `select count(*) from pg_constraint where conname in ('search_logs_query_length', 'seller_applications_payload_size')`),
      });
      const start = facts();
      expect(start).toEqual({ deleteCategory: false, deleteSeller: false, registryInsert: true, anonCoupons: true, anonSearchLogs: true, auditDelete: true, caps: '0' });
      for (const name of [A, B, C, D]) applyOk(db, up(name));
      expect(facts()).toEqual({ deleteCategory: true, deleteSeller: true, registryInsert: false, anonCoupons: false, anonSearchLogs: false, auditDelete: false, caps: '2' });
      for (const name of [D, C, B, A]) run(db, down(name));
      expect(facts()).toEqual(start);
    });

    it('can be applied a second time over themselves', () => {
      const db = seeded();
      for (const name of [A, B, C, D]) applyOk(db, up(name));
      for (const name of [A, B, C, D]) expect(apply(db, up(name)).ok, name).toBe(true);
    });
  });
});

// ── things that need no database ───────────────────────────────────────────────────────────
describe('the hardening migrations as files', () => {
  const names = [A, B, C, D];

  it('each has a rollback beside it, named in its header, and they sort after every earlier migration', () => {
    const earlier = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && !names.some(n => f.startsWith(n))).sort();
    for (const name of names) {
      expect(fs.existsSync(`supabase/rollbacks/${name}.rollback.sql`), name).toBe(true);
      expect(up(name)).toContain(`Rollback: supabase/rollbacks/${name}.rollback.sql`);
      expect(`${name}.sql` > earlier[earlier.length - 1], `${name} sorts after ${earlier[earlier.length - 1]}`).toBe(true);
    }
  });

  it('never drop tables or schemas, never grant to anon or PUBLIC, never switch row-level security off', () => {
    for (const name of names) {
      const sql = up(name).replace(/--[^\n]*/g, '');
      expect(sql, name).not.toMatch(/drop\s+table/i);
      expect(sql, name).not.toMatch(/drop\s+schema/i);
      expect(sql, name).not.toMatch(/truncate\s/i);
      expect(sql, name).not.toMatch(/disable\s+row\s+level\s+security/i);
      expect(sql, name).not.toMatch(/grant\s[^;]*\sto\s[^;]*\b(anon|public)\b/i);
    }
  });

  it('delete rows in one place only, the purge function an owner has to call on purpose', () => {
    const withDelete = names.filter(name => /\bdelete\s+from\b/i.test(up(name).replace(/--[^\n]*/g, '')));
    expect(withDelete).toEqual([D]);
    const body = up(D).replace(/--[^\n]*/g, '');
    expect(body.match(/\bdelete\s+from\b/gi)).toHaveLength(1);
    expect(body).toContain("interval '7 days'");
  });

  it('pin the search path of every SECURITY DEFINER function they create', () => {
    for (const name of names) {
      const sql = up(name).replace(/--[^\n]*/g, '');
      for (const header of sql.match(/create (?:or replace )?function[\s\S]*?\bas \$[a-z]*\$/gi) ?? []) {
        if (/security\s+definer/i.test(header)) expect(header, `${name}: ${header.slice(0, 60)}`).toMatch(/set\s+search_path\s*(=|to)\s*''/i);
      }
    }
  });

  it('end each migration with a check of the state it was meant to reach, that stops the migration if it is not', () => {
    for (const name of names) {
      const sql = up(name);
      expect(sql, name).toMatch(/do \$verify\$/);
      expect(sql.slice(sql.indexOf('do $verify$')), name).toMatch(/raise exception/);
    }
  });
});
