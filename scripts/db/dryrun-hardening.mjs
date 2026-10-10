#!/usr/bin/env node
/**
 * Prints one SQL script that applies the five database hardening migrations inside a transaction and then
 * rolls it back: each migration's own checks run against the real database (they stop with an error if an
 * assumption does not hold), and nothing stays. Use it for the dry run on the project, after the read-only
 * preflight (scripts/db/preflight_hardening.sql), and only with the owner's approval.
 *
 *   node scripts/db/dryrun-hardening.mjs > /tmp/dryrun.sql             (the migrations verbatim)
 *   node scripts/db/dryrun-hardening.mjs --compact > /tmp/dryrun.sql   (without comment-only lines: shorter to send)
 *   node scripts/db/dryrun-hardening.mjs --compact --evidence > /tmp/dryrun.sql   (ends by showing one row of facts, then rolls back)
 *
 * test/db/dryrun.db.test.ts runs the printed script in a scratch database and checks that it leaves the
 * database exactly as it found it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARDENING_MIGRATIONS = [
  '20261004100000_admin_delete_functions_callable',
  '20261004100100_phone_registry_written_only_by_trigger',
  '20261004100200_revoke_unneeded_browser_grants',
  '20261004100300_anonymous_insert_size_caps_and_log_purge',
  '20261010100000_rate_limit_uses_edge_ip',
];

/** The migration text without its comment-only lines (the SQL is identical; the script is much shorter to send). */
export const withoutCommentLines = sql => sql.split('\n').filter(line => !/^\s*--/.test(line)).join('\n').replace(/\n{3,}/g, '\n\n');

/**
 * One row of facts about the state inside the dry run (just before it is rolled back), so whoever runs the script in
 * an SQL editor sees what the five migrations would have done instead of an empty result.
 */
export const EVIDENCE_SQL = `select 'dry run finished: all five migrations applied and every check passed; the next statement rolls it all back' as note,
  has_function_privilege('authenticated', 'private.admin_delete_category(uuid,uuid,boolean)', 'EXECUTE') as category_delete_callable_by_signed_in,
  has_function_privilege('authenticated', 'private.admin_delete_seller(uuid,uuid)', 'EXECUTE') as seller_delete_callable_by_signed_in,
  has_function_privilege('anon', 'private.admin_delete_category(uuid,uuid,boolean)', 'EXECUTE') as anon_can_run_category_delete,
  has_table_privilege('authenticated', 'public.phone_registry', 'INSERT') as signed_in_can_insert_phone_registry,
  (select string_agg(polname || ':' || polcmd::text || ':' || case when polpermissive then 'permissive' else 'restrictive' end, ', ' order by polname) from pg_policy where polrelid = 'public.phone_registry'::regclass) as phone_registry_policies,
  has_table_privilege('anon', 'public.search_logs', 'SELECT') as anon_can_select_search_logs,
  has_table_privilege('anon', 'public.coupons', 'SELECT') as anon_can_select_coupons,
  case when current_setting('server_version_num')::int >= 170000 then (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and (has_table_privilege('anon', c.oid, 'MAINTAIN') or has_table_privilege('authenticated', c.oid, 'MAINTAIN'))) end as tables_with_maintain_for_browser_roles,
  has_table_privilege('authenticated', 'public.admin_activities', 'DELETE') as signed_in_can_delete_admin_activities,
  (select count(*) from pg_constraint where conname in ('search_logs_query_length', 'seller_applications_payload_size')) as size_caps_present,
  has_function_privilege('anon', 'private.purge_search_logs(interval)', 'EXECUTE') as purge_callable_by_anon,
  has_function_privilege('service_role', 'private.purge_search_logs(interval)', 'EXECUTE') as purge_callable_by_service_role,
  pg_get_functiondef('private.rate_limit_anonymous_insert()'::regprocedure) ~* 'cf-connecting-ip' as limiter_reads_edge_address,
  pg_get_functiondef('private.rate_limit_anonymous_insert()'::regprocedure) ~* 'x-forwarded-for|x-real-ip' as limiter_reads_visitor_header;`;

export function dryRunSql(root = process.cwd(), { compact = false, evidence = false } = {}) {
  const parts = [
    '-- Dry run of the database hardening migrations: everything below is rolled back at the end.',
    'begin;',
    // On a live database: give up quickly rather than queue behind a long-running statement and block everything
    // that queues behind us, and never run away.
    "set local lock_timeout = '3s';",
    "set local statement_timeout = '120s';",
  ];
  for (const name of HARDENING_MIGRATIONS) {
    parts.push(`\n-- ===== ${name} =====`);
    parts.push(`do $$ begin raise notice 'dry run: applying ${name}'; end $$;`);
    const sql = fs.readFileSync(path.join(root, 'supabase/pending', `${name}.sql`), 'utf8');
    parts.push(compact ? withoutCommentLines(sql) : sql);
  }
  parts.push("\ndo $$ begin raise notice 'dry run: all five migrations applied and their checks passed; rolling back'; end $$;");
  if (evidence) parts.push(EVIDENCE_SQL);
  parts.push('rollback;');
  return parts.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.stdout.write(dryRunSql(process.cwd(), { compact: process.argv.includes('--compact'), evidence: process.argv.includes('--evidence') }));
}
