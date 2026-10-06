// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prepareFixture, postgresAvailable, read, ADMIN, SHOPPER } from './harness.mjs';
import { dryRunSql, withoutCommentLines, HARDENING_MIGRATIONS } from '../../scripts/db/dryrun-hardening.mjs';

// The two scripts for the database approval step: the read-only preflight, and the dry run that applies the
// four migrations and rolls them back. Both must leave the database exactly as they found it.
const available = postgresAvailable();
const strip = (sql: string) => sql.replace(/--[^\n]*/g, '');

describe('the read-only preflight, as a file', () => {
  const sql = read('scripts/db/preflight_hardening.sql');
  it('runs inside a READ ONLY transaction that it rolls back', () => {
    const body = strip(sql).trim();
    expect(body.startsWith('begin transaction read only;')).toBe(true);
    expect(body.endsWith('rollback;')).toBe(true);
  });
  it('only reads', () => {
    expect(strip(sql)).not.toMatch(/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|comment|vacuum|lock)\b/i);
  });
});

describe('the dry run, as a file', () => {
  it('contains the four migrations in order, between a begin and a rollback', () => {
    const sql = dryRunSql();
    expect(sql.trimEnd().endsWith('rollback;')).toBe(true);
    expect(sql).not.toMatch(/\bcommit\b/i);
    let at = sql.indexOf('begin;');
    expect(at).toBeGreaterThan(-1);
    for (const name of HARDENING_MIGRATIONS) {
      const next = sql.indexOf(read(`supabase/pending/${name}.sql`), at);
      expect(next, name).toBeGreaterThan(at);
      at = next;
    }
  });
});

describe('the dry run, compact form and timeouts', () => {
  it('sets a lock timeout and a statement timeout before touching anything, so it never queues behind live traffic', () => {
    const sql = dryRunSql();
    const timeouts = sql.indexOf("set local lock_timeout = '3s';");
    expect(timeouts).toBeGreaterThan(sql.indexOf('begin;'));
    expect(timeouts).toBeLessThan(sql.indexOf('-- ===== 20261004100000'));
    expect(sql).toContain("set local statement_timeout = '120s';");
  });

  it('the compact form is the same SQL without the comment-only lines, and much shorter', () => {
    const full = dryRunSql();
    const compact = dryRunSql(process.cwd(), { compact: true });
    expect(compact.length).toBeLessThan(full.length * 0.7);
    let at = compact.indexOf('begin;');
    for (const name of HARDENING_MIGRATIONS) {
      const next = compact.indexOf(withoutCommentLines(read(`supabase/pending/${name}.sql`)), at);
      expect(next, name).toBeGreaterThan(at);
      at = next;
    }
    expect(compact.trimEnd().endsWith('rollback;')).toBe(true);
    for (const line of compact.split('\n')) if (/^\s*--/.test(line)) expect(line).toMatch(/^-- (Dry run|=====)/);
  });
});

describe.skipIf(!available)('the approval-step scripts, run in a scratch PostgreSQL', () => {
  let fixture: ReturnType<typeof prepareFixture>;
  beforeAll(() => { fixture = prepareFixture(); }, 120_000);
  afterAll(() => { fixture?.stop(); });

  const seeded = () => {
    const db = fixture.fresh();
    fixture.pg.run(db, `
      insert into auth.users (id, email) values ('${ADMIN}', 'admin@x.test'), ('${SHOPPER}', 'shopper@x.test');
      insert into public.profiles (id, role, phone) values ('${ADMIN}', 'admin', null), ('${SHOPPER}', 'customer', '03 123 456');
      insert into public.search_logs (query) values ('zaatar'), (repeat('x', 300));
      insert into public.seller_applications (payload) values ('{"name":"Rima"}');
    `);
    return db;
  };

  it('the preflight runs, answers every question, and changes nothing', () => {
    const db = seeded();
    const before = fixture.pg.dump(db);
    const result = fixture.pg.run(db, read('scripts/db/preflight_hardening.sql'));
    expect(result.ok, result.err).toBe(true);
    expect(result.out).toContain('private.admin_delete_category(uuid,uuid,boolean)');
    expect(result.out).toContain('phone_registry_own');
    expect(result.out).toMatch(/^2\|300\|1$/m);   // search_logs: rows, longest query, queries over 200
    expect(fixture.pg.dump(db)).toBe(before);
  });

  it('the dry run applies all four migrations, their checks pass, and the database is exactly as before', () => {
    const db = seeded();
    const before = fixture.pg.dump(db);
    const result = fixture.pg.run(db, dryRunSql());
    expect(result.ok, result.err).toBe(true);
    for (const name of HARDENING_MIGRATIONS) expect(result.err, name).toContain(`dry run: applying ${name}`);
    expect(result.err).toContain('all four migrations applied and their checks passed; rolling back');
    expect(fixture.pg.dump(db)).toBe(before);
  });

  it('the compact dry run behaves the same: all four applied, all checks pass, nothing left', () => {
    const db = seeded();
    const before = fixture.pg.dump(db);
    const result = fixture.pg.run(db, dryRunSql(process.cwd(), { compact: true }));
    expect(result.ok, result.err).toBe(true);
    expect(result.err).toContain('all four migrations applied and their checks passed; rolling back');
    expect(fixture.pg.dump(db)).toBe(before);
  });

  it('the dry run stops at the first assumption that fails, and still leaves nothing behind', () => {
    const db = seeded();
    fixture.pg.run(db, `create or replace function private.admin_delete_seller(p_seller_id uuid, p_reassign_seller_id uuid default null) returns jsonb
                        language plpgsql security definer set search_path to '' as $$
                        begin perform 1; /* is_admin_verified never called */ return '{}'::jsonb; end $$;`);
    const before = fixture.pg.dump(db);
    const result = fixture.pg.run(db, dryRunSql(), { allowError: true });
    expect(result.ok).toBe(false);
    expect(result.err).toContain('did not refuse a signed-in user who is not an administrator');
    expect(result.err).not.toContain('all four migrations applied');
    expect(fixture.pg.dump(db)).toBe(before);
  });
});
