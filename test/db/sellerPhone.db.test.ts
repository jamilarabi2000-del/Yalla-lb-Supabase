// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startScratchPostgres, postgresAvailable } from '../../scripts/db/scratchPostgres.mjs';
import { dryRunSql, SELLER_PHONE_ROUTES, SELLER_PHONE_MIGRATIONS } from '../../scripts/db/dryrun-hardening.mjs';

// Red-team review RT-8: every visitor's browser was sent every active seller's phone number. The fix is written in three
// steps, run here for real in a scratch PostgreSQL and NOT applied to the project:
//   1. private routes for the admin (all numbers) and for a seller (their own number only), purely additive;
//   2. (website: stops asking for the column; tests in test/sellerPhonePrivate.test.ts)
//   3. a column revoke that closes the public read, held until the website has been live for a day.
// The fixture is test/db/fixture_redteam.sql plus a cut-down sellers table whose column rights are modelled on the project's
// (SELECT granted column by column to anon and authenticated; read 2026-10-18).
//
// Set REQUIRE_SCRATCH_POSTGRES=1 (CI does) to fail instead of skipping when PostgreSQL's programs are missing.
const available = postgresAvailable();
if (process.env.REQUIRE_SCRATCH_POSTGRES === '1') {
  it('a PostgreSQL server is available to run the migrations in', () => { expect(available).toBe(true); });
}

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.resolve(root, file), 'utf8');
const ROUTES = '20261018232313_seller_phone_private_routes';   // applied to the project on 2026-10-18, so it lives in supabase/migrations
const REVOKE = '20261018210100_revoke_seller_phone_from_browsers';
const up = (name: string) => read(`supabase/${name === ROUTES ? 'migrations' : 'pending'}/${name}.sql`);
const down = (name: string) => read(`supabase/rollbacks/${name}.rollback.sql`);

const U = {
  adm: '00000000-0000-4000-8000-0000000000a1',
  sellerA: '00000000-0000-4000-8000-0000000000e1',
  sellerB: '00000000-0000-4000-8000-0000000000e2',
  orphan: '00000000-0000-4000-8000-0000000000e3',
  shopper: '00000000-0000-4000-8000-0000000000b2',
} as const;
const S = { a: '22222222-2222-4222-8222-aaaaaaaaaaaa', b: '22222222-2222-4222-8222-bbbbbbbbbbbb', off: '22222222-2222-4222-8222-cccccccccccc' } as const;
const PHONE = { a: '+961 70 111 111', b: '+961 71 222 222', off: '+961 76 333 333' } as const;

describe.skipIf(!available)('RT-8 seller phone numbers in a scratch PostgreSQL (not applied to the project)', () => {
  let pg: ReturnType<typeof startScratchPostgres>;
  let copies = 0;
  beforeAll(() => {
    pg = startScratchPostgres();
    pg.run('postgres', 'create database tpl;');
    pg.run('tpl', read('test/db/fixture_redteam.sql'), { singleTransaction: true });
    pg.run('tpl', `
      -- a verified-administrator test: here a setting stands in for "this session passed the second factor"
      create function private.is_admin_verified() returns boolean language sql stable security definer set search_path = ''
        as $$ select auth.uid() is not null and (select private.is_admin()) and coalesce(nullif(current_setting('test.admin_verified', true), ''), 'off') = 'on' $$;
      revoke all on function private.is_admin_verified() from public;
      grant execute on function private.is_admin_verified() to authenticated;

      -- the sellers table, with the project's column-by-column SELECT rights (no table-wide SELECT)
      create table public.sellers (id uuid primary key, seller_code text, name_en text not null, name_ar text, contact_phone text, contact_email text, is_active boolean not null default true);
      alter table public.sellers enable row level security;
      create policy sellers_read on public.sellers for select to anon, authenticated using (is_active or (select private.is_admin()));
      create policy sellers_admin_write on public.sellers for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
      revoke all on public.sellers from anon, authenticated;
      grant select (id, seller_code, name_en, name_ar, contact_phone, is_active) on public.sellers to anon, authenticated;
      grant insert, update on public.sellers to authenticated;

      insert into public.sellers (id, seller_code, name_en, contact_phone, contact_email, is_active) values
        ('${S.a}', 'S-0001', 'Koura Oil', '${PHONE.a}', 'a@x.test', true),
        ('${S.b}', 'S-0002', 'Chouf Soap', '${PHONE.b}', 'b@x.test', true),
        ('${S.off}', 'S-0003', 'Closed Shop', '${PHONE.off}', 'off@x.test', false);
      insert into auth.users (id, email) values ('${U.adm}', 'adm@x.test'), ('${U.sellerA}', 'a@x.test'), ('${U.sellerB}', 'b@x.test'), ('${U.orphan}', 'o@x.test'), ('${U.shopper}', 's@x.test');
      insert into public.profiles (id, role, seller_id, email) values
        ('${U.adm}', 'admin', null, 'adm@x.test'),
        ('${U.sellerA}', 'seller', '${S.a}', 'a@x.test'),
        ('${U.sellerB}', 'seller', '${S.b}', 'b@x.test'),
        ('${U.orphan}', 'seller', null, 'o@x.test'),
        ('${U.shopper}', 'customer', null, 's@x.test');
    `);
  }, 120_000);
  afterAll(() => { pg?.stop(); });

  type Who = keyof typeof U | 'anon' | 'unverifiedAdmin';
  const fresh = () => { const name = `p${++copies}`; pg.createDatabase(name, 'tpl'); return name; };
  const as = (db: string, who: Who, sql: string) => {
    const sub = who === 'anon' ? undefined : who === 'unverifiedAdmin' ? U.adm : U[who];
    return pg.asRole(db, who === 'anon' ? 'anon' : 'authenticated', sql, { claims: sub ? { sub } : {}, settings: who === 'adm' ? { 'test.admin_verified': 'on' } : {}, allowError: true });
  };
  const value = (db: string, sql: string) => pg.run(db, sql).out;
  const apply = (db: string, sql: string) => pg.run(db, sql, { singleTransaction: true, allowError: true });
  const applyOk = (db: string, sql: string) => pg.run(db, sql, { singleTransaction: true });
  const phoneColumnReadable = (db: string, role: 'anon' | 'authenticated') => value(db, `select has_column_privilege('${role}', 'public.sellers', 'contact_phone', 'SELECT')`) === 't';
  const aclFingerprint = (db: string) => value(db, `select md5(string_agg(coalesce(attname, '') || ':' || coalesce(attacl::text, '-'), ',' order by attnum)) from pg_attribute where attrelid = 'public.sellers'::regclass and attnum > 0 and not attisdropped`);

  describe('before: the exposure, reproduced', () => {
    it('a signed-out visitor reads every active seller\'s phone number straight from the table', () => {
      const db = fresh();
      const r = as(db, 'anon', 'select name_en, contact_phone from public.sellers order by name_en');
      expect(r.err).toBe('');
      expect(r.out).toContain(PHONE.a);
      expect(r.out).toContain(PHONE.b);
      expect(r.out).not.toContain(PHONE.off);   // the closed shop is hidden by the row rule, as live
    });

    it('so does a signed-in customer', () => {
      expect(as(fresh(), 'shopper', 'select contact_phone from public.sellers where id = \'' + S.b + '\'').out).toContain(PHONE.b);
    });
  });

  describe(`step 1: ${ROUTES}`, () => {
    it('applies in one transaction, can be applied again, and changes no table right', () => {
      const db = fresh();
      const before = aclFingerprint(db);
      applyOk(db, up(ROUTES));
      applyOk(db, up(ROUTES));
      expect(aclFingerprint(db)).toBe(before);
      expect(phoneColumnReadable(db, 'anon')).toBe(true);      // purely additive: the old read still works
    });

    it('a verified administrator gets every seller\'s phone, including a closed shop\'s', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      const r = as(db, 'adm', 'select id, contact_phone from public.admin_list_seller_phones()');
      expect(r.err).toBe('');
      for (const p of Object.values(PHONE)) expect(r.out).toContain(p);
    });

    it('an administrator whose session is not verified is refused', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      const r = as(db, 'unverifiedAdmin', 'select * from public.admin_list_seller_phones()');
      expect(r.err).toContain('ADMIN_VERIFICATION_REQUIRED');
      expect(r.out).not.toContain('+961');
    });

    it('a customer, a seller and a visitor cannot list every phone', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      for (const who of ['shopper', 'sellerA', 'orphan'] as const) {
        const r = as(db, who, 'select * from public.admin_list_seller_phones()');
        expect(r.err, who).toContain('ADMIN_VERIFICATION_REQUIRED');
        expect(r.out, who).not.toContain('+961');
      }
      const anon = as(db, 'anon', 'select * from public.admin_list_seller_phones()');
      expect(anon.err).toContain('permission denied');
      expect(anon.out).not.toContain('+961');
    });

    it('nobody can reach the private functions directly except through the guard', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      expect(as(db, 'anon', 'select * from private.admin_list_seller_phones()').err).toContain('permission denied');
      expect(as(db, 'anon', 'select * from private.my_seller_contact()').err).toContain('permission denied');
      // signed in, the private function enforces the same rule itself
      expect(as(db, 'shopper', 'select * from private.admin_list_seller_phones()').err).toContain('ADMIN_VERIFICATION_REQUIRED');
    });

    it('a seller gets their own number and no one else\'s', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      const a = as(db, 'sellerA', 'select seller_id, contact_phone from public.my_seller_contact()');
      expect(a.err).toBe('');
      expect(a.out).toContain(PHONE.a);
      expect(a.out).not.toContain(PHONE.b);
      expect(a.out).not.toContain(PHONE.off);
      const b = as(db, 'sellerB', 'select contact_phone from public.my_seller_contact()');
      expect(b.out).toContain(PHONE.b);
      expect(b.out).not.toContain(PHONE.a);
    });

    it('a seller cannot ask for another seller: the route takes no argument', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      const r = as(db, 'sellerA', `select * from public.my_seller_contact('${S.b}')`);
      expect(r.err).toMatch(/does not exist|function public\.my_seller_contact\(unknown\)/);
      expect(r.out).not.toContain(PHONE.b);
    });

    it('a customer and a seller with no seller get no rows; a visitor is refused', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      for (const who of ['shopper', 'orphan'] as const) {
        const r = as(db, who, 'select count(*) from public.my_seller_contact()');
        expect(r.err, who).toBe('');
        expect(r.out, who).toBe('0');
      }
      expect(as(db, 'anon', 'select * from public.my_seller_contact()').err).toContain('permission denied');
    });

    it('a seller who is later changed to a customer stops getting the number', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      pg.run(db, `update public.profiles set role = 'customer' where id = '${U.sellerA}'`);
      expect(as(db, 'sellerA', 'select count(*) from public.my_seller_contact()').out).toBe('0');
    });

    it('rolling it back removes the four functions and nothing else', () => {
      const db = fresh();
      const before = aclFingerprint(db);
      applyOk(db, up(ROUTES));
      applyOk(db, down(ROUTES));
      expect(Number(value(db, `select count(*) from pg_proc where proname in ('admin_list_seller_phones', 'my_seller_contact')`))).toBe(0);
      expect(aclFingerprint(db)).toBe(before);
    });
  });

  describe(`step 3: ${REVOKE} (held until the website has been live for a day)`, () => {
    it('stops, changing nothing, if the private routes are not installed', () => {
      const db = fresh();
      const r = apply(db, up(REVOKE));
      expect(r.err).toContain('are not there');
      expect(phoneColumnReadable(db, 'anon')).toBe(true);
    });

    it('closes the phone column to visitors and signed-in users, and leaves every other seller column readable', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      applyOk(db, up(REVOKE));
      expect(phoneColumnReadable(db, 'anon')).toBe(false);
      expect(phoneColumnReadable(db, 'authenticated')).toBe(false);
      for (const who of ['anon', 'shopper', 'sellerA'] as const) {
        const phone = as(db, who, 'select contact_phone from public.sellers');
        expect(phone.err, who).toContain('permission denied');
        expect(phone.out, who).not.toContain('+961');
        const star = as(db, who, 'select * from public.sellers');
        expect(star.err, who).toContain('permission denied');          // a "select *" by a browser now fails: the website lists its columns
        const listed = as(db, who, 'select id, seller_code, name_en, name_ar, is_active from public.sellers order by name_en');
        expect(listed.err, who).toBe('');
        expect(listed.out, who).toContain('Koura Oil');
      }
    });

    it('does not shut out the administrator or the seller: they still get the number through the routes', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      applyOk(db, up(REVOKE));
      const all = as(db, 'adm', 'select contact_phone from public.admin_list_seller_phones()');
      expect(all.err).toBe('');
      expect(all.out).toContain(PHONE.a);
      expect(all.out).toContain(PHONE.off);
      const own = as(db, 'sellerA', 'select contact_phone from public.my_seller_contact()');
      expect(own.err).toBe('');
      expect(own.out).toContain(PHONE.a);
      expect(own.out).not.toContain(PHONE.b);
    });

    it('does not stop an administrator saving a seller\'s phone (writes are untouched)', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      applyOk(db, up(REVOKE));
      const w = as(db, 'adm', `update public.sellers set contact_phone = '+961 3 999 999' where id = '${S.a}'`);
      expect(w.err).toBe('');
      expect(value(db, `select contact_phone from public.sellers where id = '${S.a}'`)).toBe('+961 3 999 999');
    });

    it('can be applied twice', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      applyOk(db, up(REVOKE));
      applyOk(db, up(REVOKE));
      expect(phoneColumnReadable(db, 'anon')).toBe(false);
    });

    it('is undone as a whole, with the number still readable, if a table-wide SELECT grant would keep the column open', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      pg.run(db, 'grant select on public.sellers to anon');
      const r = apply(db, up(REVOKE));
      expect(r.err).toContain('SELLER_PHONE_REVOKE_VERIFY_FAILED');
      expect(phoneColumnReadable(db, 'anon')).toBe(true);
    });

    it('its rollback gives the column back, which is the exposure, on purpose', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      applyOk(db, up(REVOKE));
      applyOk(db, down(REVOKE));
      expect(phoneColumnReadable(db, 'anon')).toBe(true);
      expect(phoneColumnReadable(db, 'authenticated')).toBe(true);
      expect(as(db, 'anon', 'select contact_phone from public.sellers').out).toContain(PHONE.a);
    });
  });

  describe('the dry run for the project', () => {
    it('covers the revoke only (the routes are already live), and leaves the database exactly as it found it', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));   // the project already has the routes; the revoke stops without them
      const sql = dryRunSql(root, { compact: true, evidence: true, set: 'sellerphones' });
      expect(SELLER_PHONE_ROUTES).toBe(ROUTES);
      expect(SELLER_PHONE_MIGRATIONS).toEqual([REVOKE]);
      expect(sql).toContain(REVOKE);
      expect(sql).not.toContain('create or replace function private.admin_list_seller_phones');
      expect(sql.trimEnd().endsWith('rollback;')).toBe(true);
      const count = 'select count(*) from pg_proc where pronamespace in (select oid from pg_namespace where nspname in (\'public\', \'private\'))';
      const before = { acl: aclFingerprint(db), fns: value(db, count) };
      const r = pg.run(db, sql);
      expect(r.out).toContain('dry run finished');
      expect(aclFingerprint(db)).toBe(before.acl);
      expect(value(db, count)).toBe(before.fns);
      expect(phoneColumnReadable(db, 'anon')).toBe(true);
    });

    it('without the routes it stops at once (so it cannot be run before step 1)', () => {
      const db = fresh();
      const r = pg.run(db, dryRunSql(root, { compact: true, evidence: true, set: 'sellerphones' }), { allowError: true });
      expect(r.err).toContain('are not there');
      expect(phoneColumnReadable(db, 'anon')).toBe(true);
    });

    it('its facts row says: routes callable by signed-in users only, the column closed, the name still readable', () => {
      const db = fresh();
      applyOk(db, up(ROUTES));
      const r = pg.run(db, dryRunSql(root, { compact: true, evidence: true, set: 'sellerphones' }));
      const row = r.out.split('\n').find(l => l.includes('dry run finished')) ?? '';
      // note | admin route: visitor, signed in | seller route: visitor, signed in | phone: visitor, signed in | name: visitor | sellers with a phone
      expect(row.split('|').map(c => c.trim()).slice(1)).toEqual(['f', 't', 'f', 't', 'f', 'f', 't', '3']);   // three sellers in the scratch copy have a phone
    });

    it('every migration has a rollback beside it', () => {
      for (const name of [ROUTES, ...SELLER_PHONE_MIGRATIONS]) expect(fs.existsSync(path.resolve(root, `supabase/rollbacks/${name}.rollback.sql`)), name).toBe(true);
    });
  });
});
