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
 *   node scripts/db/dryrun-hardening.mjs --set=redteam --compact --evidence > /tmp/dryrun2.sql   (the two red-team fixes of 2026-10-18)
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

/** The two fixes from the red-team review (SECURITY_REVIEW_2026-10-18.md): checkout's rate and lock order, seller badges. */
export const REDTEAM_MIGRATIONS = [
  '20261018100000_checkout_uses_lbp_rate_and_locks_in_order',
  '20261018100100_seller_cannot_set_storefront_flags',
];

/** One row of facts for the red-team set. Looks the functions up by name, so it needs no signature. */
export const REDTEAM_EVIDENCE_SQL = `with checkout as (
  select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'checkout_create_order'
), guard as (
  select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'protect_product_mutation'
)
select 'dry run finished: both migrations applied and every check passed; the next statement rolls it all back' as note,
  (select position('order by lk.id for update' in def) > 0 from checkout) as checkout_locks_in_order,
  (select position('''lbp_usd_rate''' in def) > 0 from checkout) as checkout_reads_lbp_rate,
  (select position('v_lbp_rate numeric:=89500;' in def) = 0 from checkout) as fixed_rate_gone,
  (select def ~ 'new\\.is_bestseller is distinct from old\\.is_bestseller' and def ~ 'new\\.yalla_item_code is distinct from old\\.yalla_item_code' from guard) as sellers_cannot_set_badges,
  (select value from public.app_settings where key = 'lbp_usd_rate') as lbp_rate_now;`;

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

export const MIGRATION_SETS = {
  hardening: { names: HARDENING_MIGRATIONS, label: 'the database hardening migrations', done: 'all five migrations applied and their checks passed', evidence: () => EVIDENCE_SQL },
  redteam: { names: REDTEAM_MIGRATIONS, label: 'the red-team fixes (checkout, seller badges)', done: 'both migrations applied and their checks passed', evidence: () => REDTEAM_EVIDENCE_SQL },
};

export function dryRunSql(root = process.cwd(), { compact = false, evidence = false, set = 'hardening' } = {}) {
  const chosen = MIGRATION_SETS[set];
  if (!chosen) throw new Error(`unknown migration set "${set}" (use ${Object.keys(MIGRATION_SETS).join(' or ')})`);
  const parts = [
    `-- Dry run of ${chosen.label}: everything below is rolled back at the end.`,
    'begin;',
    // On a live database: give up quickly rather than queue behind a long-running statement and block everything
    // that queues behind us, and never run away.
    "set local lock_timeout = '3s';",
    "set local statement_timeout = '120s';",
  ];
  for (const name of chosen.names) {
    parts.push(`\n-- ===== ${name} =====`);
    parts.push(`do $$ begin raise notice 'dry run: applying ${name}'; end $$;`);
    const sql = fs.readFileSync(path.join(root, 'supabase/pending', `${name}.sql`), 'utf8');
    parts.push(compact ? withoutCommentLines(sql) : sql);
  }
  parts.push(`\ndo $$ begin raise notice 'dry run: ${chosen.done}; rolling back'; end $$;`);
  if (evidence) parts.push(chosen.evidence());
  parts.push('rollback;');
  return parts.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const set = (process.argv.find(a => a.startsWith('--set=')) ?? '--set=hardening').slice('--set='.length);
  process.stdout.write(dryRunSql(process.cwd(), { compact: process.argv.includes('--compact'), evidence: process.argv.includes('--evidence'), set }));
}
