// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prepareFixture, postgresAvailable, read, SHOPPER, OTHER } from './harness.mjs';

// The anonymous-insert rate limit (audit SEC-2), run for real in a scratch PostgreSQL with the live limiter and its
// three triggers as the live project has them. The limiter counted signed-out visitors by the first address in
// X-Forwarded-For, which the visitor writes; the migration counts by CF-Connecting-IP, which Cloudflare sets.
// What is NOT here: the live project, and a real Cloudflare in front of it (the headers are set by hand, the way
// the Data API puts them in request.headers).
//
// Set REQUIRE_SCRATCH_POSTGRES=1 (CI does) to fail instead of skipping when PostgreSQL's programs are missing.
const available = postgresAvailable();
if (process.env.REQUIRE_SCRATCH_POSTGRES === '1') {
  it('a PostgreSQL server is available to run the migration in', () => { expect(available).toBe(true); });
}

const E = '20261010100000_rate_limit_uses_edge_ip';
const up = read(`supabase/pending/${E}.sql`);
const down = read(`supabase/rollbacks/${E}.rollback.sql`);

type Table = 'search_logs' | 'seller_applications' | 'analytics_events';
const COLUMNS: Record<Table, { cols: string; vals: (owner: string | null) => string }> = {
  search_logs: { cols: 'query, origin, user_id', vals: owner => `'q' || i, 'test', ${owner ? `'${owner}'::uuid` : 'null'}` },
  seller_applications: { cols: 'payload, applicant_user_id', vals: owner => `'{}'::jsonb, ${owner ? `'${owner}'::uuid` : 'null'}` },
  analytics_events: { cols: 'event_name, user_id', vals: owner => `'e' || i, ${owner ? `'${owner}'::uuid` : 'null'}` },
};
const LIMIT: Record<Table, number> = { search_logs: 60, seller_applications: 5, analytics_events: 60 };

describe.skipIf(!available)('the anonymous-insert rate limiter, run for real in a scratch PostgreSQL', () => {
  let fixture: ReturnType<typeof prepareFixture>;
  beforeAll(() => { fixture = prepareFixture(); }, 120_000);
  afterAll(() => { fixture?.stop(); });

  const run = (db: string, sql: string) => fixture.pg.run(db, sql);
  const value = (db: string, sql: string) => run(db, sql).out;
  const apply = (db: string, sql: string) => fixture.pg.run(db, sql, { singleTransaction: true, allowError: true });
  const withE = () => { const db = fixture.fresh(); const r = apply(db, up); expect(r.ok, r.err).toBe(true); return db; };

  /**
   * `n` inserts, one after another, as one visitor. `header(i)` is a SQL expression for the request.headers the
   * gateway would pass for insert number i. Answers how many the limiter refused (error 53400).
   */
  const burst = (db: string, who: 'anon' | 'shopper' | 'other', table: Table, n: number, header: string, owner: string | null = null) => {
    const role = who === 'anon' ? 'anon' : 'authenticated';
    const claims = who === 'shopper' ? { sub: SHOPPER } : who === 'other' ? { sub: OTHER } : {};
    const { cols, vals } = COLUMNS[table];
    const result = fixture.pg.asRole(db, role, `
      do $$
      declare refused integer := 0;
      begin
        for i in 1..${n} loop
          perform set_config('request.headers', ${header}, false);
          begin
            insert into public.${table} (${cols}) values (${vals(owner)});
          exception when sqlstate '53400' then
            refused := refused + 1;
          end;
        end loop;
        perform set_config('test.refused', refused::text, false);
      end $$;
      select current_setting('test.refused');`, { claims, allowError: true });
    expect(result.ok, result.err).toBe(true);
    return Number(result.out.split('\n').pop());
  };
  const fromEdge = (ip: string) => `json_build_object('cf-connecting-ip', '${ip}')::text`;
  const forgedForwardedFor = (ip: string) => `json_build_object('cf-connecting-ip', '${ip}', 'x-forwarded-for', '198.51.100.' || (i % 250 + 1) || ', ${ip}')::text`;
  const count = (db: string, table: Table, where = 'true') => Number(value(db, `select count(*) from public.${table} where ${where}`));

  // ── 0. the starting point: the bug, reproduced ─────────────────────────────────────────────
  describe('before the migration (what the audit found, reproduced here)', () => {
    it('one visitor who writes a different X-Forwarded-For each time is never limited', () => {
      const db = fixture.fresh();
      const refused = burst(db, 'anon', 'search_logs', 100, `json_build_object('x-forwarded-for', '198.51.100.' || (i % 250 + 1))::text`);
      expect(refused).toBe(0);
      expect(count(db, 'search_logs')).toBe(100);
    });

    it('while the same forged address is limited after 60', () => {
      const db = fixture.fresh();
      expect(burst(db, 'anon', 'search_logs', 70, `json_build_object('x-forwarded-for', '198.51.100.9')::text`)).toBe(10);
    });

    it('and a signed-in caller is never counted at all', () => {
      const db = fixture.fresh();
      expect(burst(db, 'shopper', 'seller_applications', 40, fromEdge('203.0.113.7'), SHOPPER)).toBe(0);
      expect(count(db, 'seller_applications')).toBe(40);
    });
  });

  // ── 1. after the migration ─────────────────────────────────────────────────────────────────
  describe('after the migration', () => {
    it('limits one visitor to 60 a minute however they forge X-Forwarded-For', () => {
      const db = withE();
      expect(burst(db, 'anon', 'search_logs', 100, forgedForwardedFor('203.0.113.7'))).toBe(40);
      expect(count(db, 'search_logs')).toBe(60);
    });

    it('records the Cloudflare address, not the forged one', () => {
      const db = withE();
      burst(db, 'anon', 'search_logs', 5, forgedForwardedFor('203.0.113.7'));
      expect(value(db, `select string_agg(distinct host(client_ip), ',') from public.search_logs`)).toBe('203.0.113.7');
    });

    it('keeps different visitors apart: each address has its own 60', () => {
      const db = withE();
      expect(burst(db, 'anon', 'search_logs', 60, fromEdge('203.0.113.7'))).toBe(0);
      expect(burst(db, 'anon', 'search_logs', 60, fromEdge('203.0.113.8'))).toBe(0);
      expect(burst(db, 'anon', 'search_logs', 1, fromEdge('203.0.113.7'))).toBe(1);
      expect(burst(db, 'anon', 'search_logs', 1, fromEdge('203.0.113.9'))).toBe(0);
    });

    it.each(['search_logs', 'seller_applications', 'analytics_events'] as const)('applies the same limits to %s as before (%s a minute)', table => {
      const db = withE();
      const limit = LIMIT[table];
      expect(burst(db, 'anon', table, limit + 5, fromEdge('203.0.113.7'))).toBe(5);
      expect(count(db, table)).toBe(limit);
    });

    it('refuses with the same error code and message as before', () => {
      const db = withE();
      burst(db, 'anon', 'seller_applications', 5, fromEdge('203.0.113.7'));
      const result = fixture.pg.asRole(db, 'anon', `
        select set_config('request.headers', ${fromEdge('203.0.113.7')}, false);
        insert into public.seller_applications (payload) values ('{}');`, { allowError: true });
      expect(result.ok).toBe(false);
      expect(result.err).toContain('RATE_LIMIT_EXCEEDED');
      // psql does not print the SQLSTATE, so read it from inside the database
      const code = fixture.pg.asRole(db, 'anon', `
        do $$ begin
          perform set_config('request.headers', ${fromEdge('203.0.113.7')}, false);
          insert into public.seller_applications (payload) values ('{}');
        exception when others then
          perform set_config('test.state', sqlstate || '|' || sqlerrm, false);
        end $$;
        select current_setting('test.state');`);
      expect(code.out.split('\n').pop()).toBe('53400|RATE_LIMIT_EXCEEDED');
    });

    it('only throttles: the same visitor can write again once the minute has passed', () => {
      const db = withE();
      expect(burst(db, 'anon', 'search_logs', 70, fromEdge('203.0.113.7'))).toBe(10);
      run(db, `update public.search_logs set created_at = now() - interval '2 minutes'`);
      expect(burst(db, 'anon', 'search_logs', 60, fromEdge('203.0.113.7'))).toBe(0);
    });

    it('remembers nothing about an address beyond the rows it wrote: no table, no ban list', () => {
      const db = withE();
      const tablesBefore = value(db, `select count(*) from pg_class where relkind = 'r' and relnamespace in ('public'::regnamespace, 'private'::regnamespace)`);
      burst(db, 'anon', 'search_logs', 80, fromEdge('203.0.113.7'));
      expect(value(db, `select count(*) from pg_class where relkind = 'r' and relnamespace in ('public'::regnamespace, 'private'::regnamespace)`)).toBe(tablesBefore);
    });
  });

  describe('when the address is missing or is not an address', () => {
    it('ignores X-Forwarded-For and X-Real-IP altogether: they never count as an address', () => {
      const db = withE();
      // 5 seller applications is the per-address limit; with no usable address the shared cap is 50 for everyone
      expect(burst(db, 'anon', 'seller_applications', 20, `json_build_object('x-forwarded-for', '198.51.100.' || i, 'x-real-ip', '198.51.100.' || i)::text`)).toBe(0);
      expect(value(db, `select count(*) from public.seller_applications where client_ip is not null`)).toBe('0');
    });

    it('limits everyone together to a conservative cap (ten times the per-address limit)', () => {
      const db = withE();
      expect(burst(db, 'anon', 'seller_applications', 60, `'{}'`)).toBe(10);
      expect(count(db, 'seller_applications')).toBe(50);
    });

    it.each(['not-an-ip', '999.1.1.1', '', '   ', '1.2.3', "1.2.3.4; drop table x"])('treats %j as no address and does not fail the visitor', bad => {
      const db = withE();
      expect(burst(db, 'anon', 'search_logs', 3, `json_build_object('cf-connecting-ip', '${bad.replace(/'/g, "''")}')::text`)).toBe(0);
      expect(count(db, 'search_logs')).toBe(3);
      expect(value(db, `select count(*) from public.search_logs where client_ip is not null`)).toBe('0');
    });

    it('does not fail when no headers were passed at all', () => {
      const db = withE();
      const result = fixture.pg.asRole(db, 'anon', `insert into public.search_logs (query, origin) values ('x', 'y')`, { allowError: true });
      expect(result.ok, result.err).toBe(true);
    });
  });

  describe('IPv6 visitors', () => {
    it('share one budget across the /64 they were given, so rotating the low bits does not help', () => {
      const db = withE();
      const rotating = `json_build_object('cf-connecting-ip', '2001:db8:1:2::' || to_hex(i))::text`;
      expect(burst(db, 'anon', 'search_logs', 70, rotating)).toBe(10);
    });

    it('keep other /64s apart, and record the full address', () => {
      const db = withE();
      burst(db, 'anon', 'search_logs', 60, `json_build_object('cf-connecting-ip', '2001:db8:1:2::' || to_hex(i))::text`);
      expect(burst(db, 'anon', 'search_logs', 5, fromEdge('2001:db8:1:3::1'))).toBe(0);
      expect(value(db, `select host(client_ip) from public.search_logs where client_ip = '2001:db8:1:3::1' limit 1`)).toBe('2001:db8:1:3::1');
    });
  });

  describe('signed-in callers', () => {
    it('are counted by account, at five times the signed-out allowance', () => {
      const db = withE();
      expect(burst(db, 'shopper', 'seller_applications', 30, fromEdge('203.0.113.7'), SHOPPER)).toBe(5);   // 5 x 5 = 25
      expect(count(db, 'seller_applications', `applicant_user_id = '${SHOPPER}'`)).toBe(25);
    });

    it('do not use up a signed-out visitor\'s budget, or one another\'s, even from one address', () => {
      const db = withE();
      burst(db, 'shopper', 'seller_applications', 25, fromEdge('203.0.113.7'), SHOPPER);
      expect(burst(db, 'other', 'seller_applications', 25, fromEdge('203.0.113.7'), OTHER)).toBe(0);
      expect(burst(db, 'anon', 'seller_applications', 5, fromEdge('203.0.113.7'))).toBe(0);
    });

    it('use the owner column each table has (applicant_user_id, user_id)', () => {
      const db = withE();
      expect(burst(db, 'shopper', 'analytics_events', 305, fromEdge('203.0.113.7'), SHOPPER)).toBe(5);   // 5 x 60 = 300
      expect(burst(db, 'shopper', 'search_logs', 305, fromEdge('203.0.113.7'), SHOPPER)).toBe(5);
    });

    it('cannot get round it by writing the row with no owner: that counts as signed out, by address', () => {
      const db = withE();
      expect(burst(db, 'shopper', 'seller_applications', 8, fromEdge('203.0.113.7'), null)).toBe(3);
      expect(count(db, 'seller_applications', 'client_ip is not null')).toBe(5);
    });
  });

  // ── 2. the migration's own checks ──────────────────────────────────────────────────────────
  describe('the migration', () => {
    const body = (db: string) => value(db, `select pg_get_functiondef('private.rate_limit_anonymous_insert()'::regprocedure)`);
    const shape = (db: string) => value(db, `
      select p.prosecdef::text || '|' || coalesce(p.proconfig::text, '') || '|' || coalesce(p.proacl::text, '') || '|' || p.proowner::regrole::text
             || '|' || (select string_agg(pg_get_triggerdef(t.oid), ';' order by t.tgname) from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal)
      from pg_proc p where p.oid = 'private.rate_limit_anonymous_insert()'::regprocedure`);

    it('replaces the function body and nothing else: same owner, privileges, search_path and triggers', () => {
      const db = fixture.fresh();
      const before = { body: body(db), shape: shape(db) };
      const result = apply(db, up);
      expect(result.ok, result.err).toBe(true);
      expect(body(db)).not.toBe(before.body);
      expect(shape(db)).toBe(before.shape);
      expect(shape(db)).toContain('trg_rate_limit_search_logs');
      expect(shape(db)).toContain('trg_rate_limit_seller_applications');
      expect(shape(db)).toContain('trg_rate_limit_analytics_events');
    });

    it('no longer reads any header a visitor can choose', () => {
      const text = body(withE());
      expect(text).toContain('cf-connecting-ip');
      expect(text.toLowerCase()).not.toContain('x-forwarded-for');
      expect(text.toLowerCase()).not.toContain('x-real-ip');
    });

    it('can be applied twice', () => {
      const db = withE();
      const once = body(db);
      expect(apply(db, up).ok).toBe(true);
      expect(body(db)).toBe(once);
    });

    it('proves the fix itself with a probe that reaches a conclusion, and leaves nothing behind', () => {
      const db = fixture.fresh();
      const result = apply(db, up);
      expect(result.ok, result.err).toBe(true);
      expect(result.err).not.toContain('could not run here');
      // the probe inserted as anon and undid it: no probe row is left behind
      expect(count(db, 'search_logs', `query = 'migration probe'`)).toBe(0);
      expect(value(db, `select coalesce(current_setting('request.headers', true), '')`)).not.toContain('203.0.113.7');
    });

    it('says so, and relies on the definition check, when the probe cannot insert here', () => {
      const db = fixture.fresh();
      run(db, `revoke insert on public.search_logs from anon`);
      const result = apply(db, up);
      expect(result.ok, result.err).toBe(true);
      expect(result.err).toContain('could not run here');
    });

    it('stops, changing nothing, if the new body would still read a header the visitor chooses', () => {
      const db = fixture.fresh();
      const before = body(db);
      const reads = up.replace('begin\n  -- The address Cloudflare saw.', 'begin\n  -- X-Forwarded-For is not used.\n  -- The address Cloudflare saw.');
      expect(reads).not.toBe(up);
      const result = apply(db, reads);
      expect(result.ok).toBe(false);
      expect(result.err).toContain('RATE_LIMITER_STILL_READS_A_VISITOR_CHOSEN_HEADER');
      expect(body(db)).toBe(before);
    });

    it('stops, changing nothing, if the new body records no address at all', () => {
      const db = fixture.fresh();
      const before = body(db);
      const forgetful = up.replace('  new.client_ip := v_ip;\n', '');
      expect(forgetful).not.toBe(up);
      const result = apply(db, forgetful);
      expect(result.ok).toBe(false);
      expect(result.err).toContain('RATE_LIMITER_DID_NOT_RECORD_THE_EDGE_ADDRESS');
      expect(body(db)).toBe(before);
    });

    it('stops, changing nothing, if a probe from a visitor with a forged X-Forwarded-For is recorded under the forged address', () => {
      const db = fixture.fresh();
      const before = body(db);
      // a body that reads the forged header without naming it, so only the behaviour probe can see it
      const sneaky = up.replace(
        `v_headers ->> 'cf-connecting-ip'`,
        `coalesce(split_part(v_headers ->> ('x-forwarded' || '-for'), ',', 1), v_headers ->> 'cf-connecting-ip')`,
      );
      expect(sneaky).not.toBe(up);
      const result = apply(db, sneaky);
      expect(result.ok).toBe(false);
      expect(result.err).toContain('RATE_LIMITER_RECORDED_THE_FORGED_ADDRESS (198.51.100.9)');
      expect(body(db)).toBe(before);
      expect(count(db, 'search_logs', `query = 'migration probe'`)).toBe(0);
    });

    it('stops, changing nothing, when the function is missing', () => {
      const db = fixture.fresh();
      run(db, `drop function private.rate_limit_anonymous_insert() cascade`);
      const result = apply(db, up);
      expect(result.ok).toBe(false);
      expect(result.err).toContain('does not exist');
    });

    it('stops, changing nothing, when it is not SECURITY DEFINER', () => {
      const db = fixture.fresh();
      run(db, `alter function private.rate_limit_anonymous_insert() security invoker`);
      const before = body(db);
      const result = apply(db, up);
      expect(result.ok).toBe(false);
      expect(result.err).toContain('not SECURITY DEFINER');
      expect(body(db)).toBe(before);
    });

    it('stops when the function is some other version than the one it was written against', () => {
      const db = fixture.fresh();
      run(db, `create or replace function private.rate_limit_anonymous_insert() returns trigger language plpgsql security definer set search_path = '' as $$ begin return new; end $$`);
      const result = apply(db, up);
      expect(result.ok).toBe(false);
      expect(result.err).toContain('reads neither');
    });

    it('stops when one of the three tables lost its trigger', () => {
      const db = fixture.fresh();
      run(db, `drop trigger trg_rate_limit_analytics_events on public.analytics_events`);
      const before = body(db);
      const result = apply(db, up);
      expect(result.ok).toBe(false);
      expect(result.err).toContain('analytics_events has no BEFORE INSERT trigger');
      expect(body(db)).toBe(before);
    });

    it('stops when a guarded table has no client_ip column', () => {
      const db = fixture.fresh();
      run(db, `alter table public.analytics_events drop column client_ip`);
      const result = apply(db, up);
      expect(result.ok).toBe(false);
      expect(result.err).toContain('has no client_ip or created_at column');
    });
  });

  // ── 3. the rollback ────────────────────────────────────────────────────────────────────────
  describe('the rollback', () => {
    const body = (db: string) => value(db, `select pg_get_functiondef('private.rate_limit_anonymous_insert()'::regprocedure)`);

    it('restores the previous function exactly', () => {
      const db = fixture.fresh();
      const original = body(db);
      expect(apply(db, up).ok).toBe(true);
      const result = apply(db, down);
      expect(result.ok, result.err).toBe(true);
      expect(body(db)).toBe(original);
    });

    it('and with it the old behaviour (and the old weakness)', () => {
      const db = withE();
      expect(apply(db, down).ok).toBe(true);
      expect(burst(db, 'anon', 'search_logs', 100, forgedForwardedFor('203.0.113.7'))).toBe(0);
    });

    it('refuses to run over a function the migration did not install', () => {
      const db = fixture.fresh();
      const result = apply(db, down);
      expect(result.ok).toBe(false);
      expect(result.err).toContain('not the version the migration installed');
    });

    it('can be followed by the migration again', () => {
      const db = withE();
      expect(apply(db, down).ok).toBe(true);
      expect(apply(db, up).ok).toBe(true);
      expect(burst(db, 'anon', 'search_logs', 100, forgedForwardedFor('203.0.113.7'))).toBe(40);
    });
  });
});
