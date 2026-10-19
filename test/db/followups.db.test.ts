// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startScratchPostgres, postgresAvailable } from '../../scripts/db/scratchPostgres.mjs';
import { dryRunSql, FOLLOWUP_MIGRATIONS, SIGN_IN_LOCK_MIGRATION } from '../../scripts/db/dryrun-hardening.mjs';

// The red-team follow-ups, run for real in a scratch PostgreSQL: RT-6 (the password check locks per guesser, not per
// e-mail) and RT-9 (size limits for what a signed-in user can store). Both are written and tested here and NOT applied to
// the project. Function text and policies come from test/db/fixture_redteam.sql and the repository's own sign-in migration.
//
// Set REQUIRE_SCRATCH_POSTGRES=1 (CI does) to fail instead of skipping when PostgreSQL's programs are missing.
const available = postgresAvailable();
if (process.env.REQUIRE_SCRATCH_POSTGRES === '1') {
  it('a PostgreSQL server is available to run the migrations in', () => { expect(available).toBe(true); });
}

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.resolve(root, file), 'utf8');
const LOCK = '20261018234917_sign_in_lock_is_per_guesser';
const LIMITS = '20261018200100_size_limits_for_signed_in_writes';
const up = (name: string) => read(`supabase/${name === LOCK ? 'migrations' : 'pending'}/${name}.sql`);
const down = (name: string) => read(`supabase/rollbacks/${name}.rollback.sql`);

const U = { victim: '00000000-0000-4000-8000-0000000000b2', other: '00000000-0000-4000-8000-0000000000c3', adm: '00000000-0000-4000-8000-0000000000a1' } as const;
const PASSWORD = 'Correct-Horse-9';
const EMAIL = 'victim@x.test';

describe.skipIf(!available)('red-team follow-ups RT-6 and RT-9 in a scratch PostgreSQL (not applied to the project)', () => {
  let pg: ReturnType<typeof startScratchPostgres>;
  let copies = 0;
  beforeAll(() => {
    pg = startScratchPostgres();
    pg.run('postgres', 'create database tpl;');
    pg.run('tpl', read('test/db/fixture_redteam.sql'), { singleTransaction: true });
    // the live sign-in check, from the repository's own migration
    pg.run('tpl', read('supabase/migrations/20260925013151_password_check_for_sign_in.sql'), { singleTransaction: true });
    // the live tables the limits apply to, cut down to the columns they touch, with the live row-level rules
    pg.run('tpl', `
      alter table public.profiles add column name text, add column first_name text, add column last_name text,
        add column default_governorate text, add column default_city text, add column default_address text,
        add column default_building text, add column default_notes text, add column avatar text;
      create table public.carts (user_id uuid primary key, items jsonb not null default '[]', updated_at timestamptz default now());
      create table public.wishlists (user_id uuid primary key, product_ids uuid[] not null default '{}', updated_at timestamptz default now());
      create table public.user_addresses (id uuid primary key default gen_random_uuid(), user_id uuid not null, full_name text, city text, created_at timestamptz default now(), updated_at timestamptz default now());
      alter table public.carts enable row level security;
      alter table public.wishlists enable row level security;
      alter table public.user_addresses enable row level security;
      create policy carts_own on public.carts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
      create policy wishlists_own on public.wishlists for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
      create policy addresses_own on public.user_addresses for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
      insert into auth.users (id, email, encrypted_password) values
        ('${U.victim}', '${EMAIL}', extensions.crypt('${PASSWORD}', extensions.gen_salt('bf', 6))),
        ('${U.other}', 'other@x.test', extensions.crypt('Another-Pass-1', extensions.gen_salt('bf', 6))),
        ('${U.adm}', 'adm@x.test', null);
      insert into public.profiles (id, role, email) values ('${U.victim}', 'customer', '${EMAIL}'), ('${U.other}', 'customer', 'other@x.test'), ('${U.adm}', 'admin', 'adm@x.test');
    `);
  }, 120_000);
  afterAll(() => { pg?.stop(); });

  const fresh = () => { const name = `c${++copies}`; pg.createDatabase(name, 'tpl'); return name; };
  const as = (db: string, who: 'victim' | 'other' | 'adm' | 'anon', sql: string, headers?: Record<string, string>) =>
    pg.asRole(db, who === 'anon' ? 'anon' : 'authenticated', sql, { claims: who === 'anon' ? {} : { sub: U[who] }, settings: headers ? { 'request.headers': JSON.stringify(headers) } : {}, allowError: true });
  const value = (db: string, sql: string) => pg.run(db, sql).out;
  const apply = (db: string, sql: string) => pg.run(db, sql, { singleTransaction: true, allowError: true });
  const applyOk = (db: string, sql: string) => pg.run(db, sql, { singleTransaction: true });

  // ── RT-6: the sign-in check ──────────────────────────────────────────────────────────────────────────────────
  describe(`RT-6 ${LOCK}`, () => {
    const check = (db: string, ip: string, email: string, password: string) =>
      as(db, 'anon', `select public.verify_login_password('${email}', '${password}')`, { 'cf-connecting-ip': ip }).out;
    const emailKey = (email: string) => `encode(sha256(convert_to('${email}', 'UTF8')), 'hex')`;
    const failures = (db: string, email: string) => Number(value(db, `select count(*) from private.login_failures where email_key = ${emailKey(email)}`));
    /** n recorded wrong guesses against an e-mail, each from a different person, placed 'ago' in the past. */
    const plant = (db: string, email: string, n: number, ago = '1 minute') =>
      pg.run(db, `insert into private.login_failures (email_key, caller_key, created_at) select ${emailKey(email)}, 'planted-' || i, now() - interval '${ago}' - (i || ' seconds')::interval from generate_series(1, ${n}) i`);
    const attack = (db: string, guessers: number) => Array.from({ length: guessers }, (_, i) => check(db, `198.51.100.${i + 1}`, EMAIL, `guess${i}`));

    it('before: five wrong guesses from five different addresses lock the owner out, even with the right password', () => {
      const db = fresh();
      expect(attack(db, 5)).toEqual(['wrong', 'wrong', 'wrong', 'wrong', 'wrong']);
      expect(check(db, '203.0.113.99', EMAIL, PASSWORD)).toBe('locked');
    });

    it('after: the same attack leaves the owner able to sign in from their own connection', () => {
      const db = fresh();
      applyOk(db, up(LOCK));
      expect(attack(db, 5)).toEqual(['wrong', 'wrong', 'wrong', 'wrong', 'wrong']);
      expect(check(db, '203.0.113.99', EMAIL, PASSWORD)).toBe('ok');
    });

    it('after: a guesser who gets five wrong is locked out of that e-mail (even with the right password); others are not', () => {
      const db = fresh();
      applyOk(db, up(LOCK));
      for (let i = 0; i < 5; i += 1) expect(check(db, '198.51.100.7', EMAIL, `guess${i}`)).toBe('wrong');
      expect(check(db, '198.51.100.7', EMAIL, 'guess-6th')).toBe('locked');
      expect(check(db, '198.51.100.7', EMAIL, PASSWORD)).toBe('locked');
      expect(check(db, '203.0.113.50', EMAIL, PASSWORD)).toBe('ok');
    });

    it('after: the guesser is still only locked out of the e-mail they guessed, not of a different account', () => {
      const db = fresh();
      applyOk(db, up(LOCK));
      for (let i = 0; i < 5; i += 1) check(db, '198.51.100.7', EMAIL, `guess${i}`);
      expect(check(db, '198.51.100.7', 'other@x.test', 'Another-Pass-1')).toBe('ok');
    });

    it('after: the ceiling holds against a guesser who changes address every time: 50 in 15 minutes locks everyone', () => {
      const db = fresh();
      applyOk(db, up(LOCK));
      plant(db, EMAIL, 49);
      expect(check(db, '203.0.113.99', EMAIL, PASSWORD)).toBe('ok');          // 49: still open (and a right password clears them)
      expect(failures(db, EMAIL)).toBe(0);
      plant(db, EMAIL, 50);
      expect(check(db, '203.0.113.98', EMAIL, PASSWORD)).toBe('locked');      // 50: shut, for the owner too
    });

    it('after: and 200 in a day, spread over the day, shuts it', () => {
      const db = fresh();
      applyOk(db, up(LOCK));
      pg.run(db, `insert into private.login_failures (email_key, caller_key, created_at) select ${emailKey(EMAIL)}, 'day-' || i, now() - interval '20 hours' + (i || ' minutes')::interval from generate_series(1, 199) i`);
      expect(check(db, '203.0.113.97', EMAIL, 'nope')).toBe('wrong');         // 199 + this one = 200 recorded
      expect(check(db, '203.0.113.96', EMAIL, PASSWORD)).toBe('locked');
    });

    it('after: one caller across many e-mails is still limited to 30 in 15 minutes (unchanged)', () => {
      const db = fresh();
      applyOk(db, up(LOCK));
      for (let i = 0; i < 30; i += 1) expect(check(db, '198.51.100.20', `nobody${i}@x.test`, 'x')).toBe('no_account');
      expect(check(db, '198.51.100.20', 'nobody-next@x.test', 'x')).toBe('locked');
      expect(check(db, '198.51.100.21', EMAIL, PASSWORD)).toBe('ok');
    });

    it('after: a correct password still clears the e-mail\'s failures, and the answers are the same words as before', () => {
      const db = fresh();
      applyOk(db, up(LOCK));
      plant(db, EMAIL, 3);
      expect(check(db, '203.0.113.99', EMAIL, 'wrong-one')).toBe('wrong');
      expect(check(db, '203.0.113.99', EMAIL, PASSWORD)).toBe('ok');
      expect(failures(db, EMAIL)).toBe(0);
      expect(check(db, '203.0.113.99', 'nobody@x.test', 'x')).toBe('no_account');
      expect(value(db, `select count(*) from private.login_proofs where user_id = '${U.victim}'`)).toBe('1');
    });

    it('after: the function stays VOLATILE and SECURITY DEFINER, and its grants are exactly as they were', () => {
      const db = fresh();
      const before = value(db, `select coalesce(proacl::text, 'null') from pg_proc where oid = 'private.verify_login_password(text,text)'::regprocedure`);
      applyOk(db, up(LOCK));
      expect(value(db, `select coalesce(proacl::text, 'null') from pg_proc where oid = 'private.verify_login_password(text,text)'::regprocedure`)).toBe(before);
      expect(value(db, `select prosecdef::text || provolatile::text from pg_proc where oid = 'private.verify_login_password(text,text)'::regprocedure`)).toBe('truev');
      expect(value(db, `select has_function_privilege('anon', 'public.verify_login_password(text,text)', 'execute')`)).toBe('t');
    });

    it('running it twice changes nothing the second time', () => {
      const db = fresh();
      applyOk(db, up(LOCK));
      const once = value(db, `select md5(pg_get_functiondef('private.verify_login_password(text,text)'::regprocedure))`);
      applyOk(db, up(LOCK));
      expect(value(db, `select md5(pg_get_functiondef('private.verify_login_password(text,text)'::regprocedure))`)).toBe(once);
    });

    it('refuses, changing nothing, over a function it was not written for', () => {
      const db = fresh();
      pg.run(db, `create or replace function private.verify_login_password(p_email text, p_password text) returns text language plpgsql volatile security definer set search_path = '' as $f$ begin return 'ok'; end; $f$;`);
      const result = apply(db, up(LOCK));
      expect(result.ok).toBe(false);
      expect(result.err).toContain('not the function this migration was written against');
    });

    it('the rollback puts the old lock back exactly, and refuses when the migration is not there', () => {
      const db = fresh();
      const original = value(db, `select md5(pg_get_functiondef('private.verify_login_password(text,text)'::regprocedure))`);
      expect(apply(db, down(LOCK)).err).toContain('ROLLBACK_LOGIN_LOCK_CONSTANT_TEXT_COUNT_UNEXPECTED');
      applyOk(db, up(LOCK));
      applyOk(db, down(LOCK));
      expect(value(db, `select md5(pg_get_functiondef('private.verify_login_password(text,text)'::regprocedure))`)).toBe(original);
      expect(attack(db, 5)).toHaveLength(5);
      expect(check(db, '203.0.113.99', EMAIL, PASSWORD)).toBe('locked');
    });
  });

  // ── RT-9: size limits ────────────────────────────────────────────────────────────────────────────────────────
  describe(`RT-9 ${LIMITS}`, () => {
    const bigCart = (bytes: number) => `select '${U.victim}'::uuid, jsonb_build_array(repeat('x', ${bytes - 4}))`;          // text form is exactly 'bytes' long: ["xxx"]
    const putCart = (db: string, bytes: number) => as(db, 'victim', `insert into public.carts (user_id, items) ${bigCart(bytes)} on conflict (user_id) do update set items = excluded.items`);
    const shipping = (db: string, bytes: number) => pg.run(db, `insert into public.orders (user_id, shipping) values ('${U.victim}', jsonb_build_object('a', repeat('x', ${bytes - 9}))) returning octet_length(shipping::text)`, { allowError: true });

    it('before: a signed-in user can store a megabyte cart, a thousand wishlist items, a 100 KB shipping record and 50 addresses', () => {
      const db = fresh();
      expect(putCart(db, 1_000_000).ok).toBe(true);
      expect(as(db, 'victim', `insert into public.wishlists (user_id, product_ids) select '${U.victim}', array_agg(gen_random_uuid()) from generate_series(1, 1000)`).ok).toBe(true);
      expect(shipping(db, 100_000).ok).toBe(true);
      expect(as(db, 'victim', `insert into public.user_addresses (user_id) select '${U.victim}' from generate_series(1, 50)`).ok).toBe(true);
    });

    it('after: a cart is limited to 512 KB of text: exactly 512 KB passes, one byte more is refused', () => {
      const db = fresh();
      applyOk(db, up(LIMITS));
      expect(putCart(db, 524_288).ok).toBe(true);
      const over = putCart(db, 524_289);
      expect(over.ok).toBe(false);
      expect(over.err).toContain('carts_items_size');
      expect(as(db, 'victim', `update public.carts set items = '[]' where user_id = '${U.victim}'`).ok).toBe(true);
    });

    it('after: a wishlist is limited to 500 products', () => {
      const db = fresh();
      applyOk(db, up(LIMITS));
      const put = (n: number) => as(db, 'victim', `insert into public.wishlists (user_id, product_ids) select '${U.victim}', array_agg(gen_random_uuid()) from generate_series(1, ${n}) on conflict (user_id) do update set product_ids = excluded.product_ids`);
      expect(put(500).ok).toBe(true);
      expect(put(501).err).toContain('wishlists_product_ids_count');
    });

    it('after: an order\'s shipping record is limited to 8 KB', () => {
      const db = fresh();
      applyOk(db, up(LIMITS));
      expect(shipping(db, 8192).ok).toBe(true);
      expect(shipping(db, 8193).err).toContain('orders_shipping_size');
      expect(shipping(db, 304).ok).toBe(true);
    });

    it('after: a person can keep 20 addresses, not 21; another person is unaffected', () => {
      const db = fresh();
      applyOk(db, up(LIMITS));
      expect(as(db, 'victim', `insert into public.user_addresses (user_id) select '${U.victim}' from generate_series(1, 20)`).ok).toBe(true);
      const twentyFirst = as(db, 'victim', `insert into public.user_addresses (user_id) values ('${U.victim}')`);
      expect(twentyFirst.ok).toBe(false);
      expect(twentyFirst.err).toContain('ADDRESS_LIMIT_REACHED');
      expect(as(db, 'other', `insert into public.user_addresses (user_id) values ('${U.other}')`).ok).toBe(true);
      pg.run(db, `delete from public.user_addresses where id in (select id from public.user_addresses where user_id = '${U.victim}' limit 1)`);
      expect(as(db, 'victim', `insert into public.user_addresses (user_id) values ('${U.victim}')`).ok).toBe(true);
    });

    it('after: profile text is bounded, normal values and blanks still save', () => {
      const db = fresh();
      applyOk(db, up(LIMITS));
      expect(as(db, 'victim', `update public.profiles set name = 'Rita Haddad', first_name = 'Rita', last_name = 'Haddad', phone = '+961 70 123 456', default_city = 'Beirut', default_address = 'Hamra Street 12', default_notes = '', avatar = null where id = '${U.victim}'`).ok).toBe(true);
      expect(as(db, 'victim', `update public.profiles set name = repeat('n', 300) where id = '${U.victim}'`).ok).toBe(true);
      expect(as(db, 'victim', `update public.profiles set name = repeat('n', 301) where id = '${U.victim}'`).err).toContain('profiles_text_lengths');
      expect(as(db, 'victim', `update public.profiles set default_notes = repeat('n', 1001) where id = '${U.victim}'`).err).toContain('profiles_text_lengths');
      expect(as(db, 'victim', `update public.profiles set avatar = repeat('a', 2049) where id = '${U.victim}'`).err).toContain('profiles_text_lengths');
      expect(as(db, 'victim', `update public.profiles set phone = repeat('1', 41) where id = '${U.victim}'`).err).toContain('profiles_text_lengths');
    });

    it('after: the admin is held to the same limits (they are on the table, not on a role)', () => {
      const db = fresh();
      applyOk(db, up(LIMITS));
      expect(pg.run(db, `update public.profiles set name = repeat('n', 301) where id = '${U.adm}'`, { allowError: true }).err).toContain('profiles_text_lengths');
    });

    it('after: the address-limit function is not callable by browsers', () => {
      const db = fresh();
      applyOk(db, up(LIMITS));
      expect(value(db, `select has_function_privilege('anon', 'private.limit_user_addresses()', 'execute') or has_function_privilege('authenticated', 'private.limit_user_addresses()', 'execute')`)).toBe('f');
    });

    it('running it twice changes nothing the second time', () => {
      const db = fresh();
      applyOk(db, up(LIMITS));
      const once = pg.dump(db);
      applyOk(db, up(LIMITS));
      expect(pg.dump(db)).toBe(once);
    });

    it('stops, changing nothing, if a table or column it limits is missing', () => {
      const db = fresh();
      pg.run(db, 'alter table public.profiles drop column avatar');
      const before = pg.dump(db);
      const result = apply(db, up(LIMITS));
      expect(result.ok).toBe(false);
      expect(result.err).toContain('public.profiles.avatar does not exist');
      expect(pg.dump(db)).toBe(before);
    });

    it('the rollback removes all four checks and the address limit, and leaves the data alone', () => {
      const db = fresh();
      const before = pg.dump(db);
      applyOk(db, up(LIMITS));
      expect(pg.dump(db)).not.toBe(before);
      applyOk(db, down(LIMITS));
      expect(pg.dump(db)).toBe(before);
      expect(putCart(db, 1_000_000).ok).toBe(true);
    });
  });

  // ── the dry run the owner runs before approving the apply ────────────────────────────────────────────────────
  describe('dry run of the size limits (node scripts/db/dryrun-hardening.mjs --set=followups)', () => {
    it.each([['verbatim', false], ['compact', true]])('%s: applies the size limits, shows a row of facts, and leaves the database exactly as it found it', (_label, compact) => {
      const db = fresh();
      applyOk(db, up(LOCK));   // the project already has the sign-in lock fix (applied 2026-10-18)
      const before = pg.dump(db);
      const result = pg.run(db, dryRunSql(root, { compact, evidence: true, set: 'followups' }));
      expect(result.out).toMatch(/^dry run finished: the size limits applied and every check passed.*\|t\|4\|t\|/m);
      expect(pg.dump(db)).toBe(before);
    });
    it('covers exactly the size-limits file (RT-6 is applied), each migration with a rollback beside it', () => {
      expect(SIGN_IN_LOCK_MIGRATION).toBe(LOCK);
      expect(FOLLOWUP_MIGRATIONS).toEqual([LIMITS]);
      for (const name of [LOCK, ...FOLLOWUP_MIGRATIONS]) expect(fs.existsSync(path.resolve(root, `supabase/rollbacks/${name}.rollback.sql`)), name).toBe(true);
    });
  });
});
