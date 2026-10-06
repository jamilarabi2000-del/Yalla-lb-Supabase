#!/usr/bin/env node
/**
 * Prints one SQL script that applies the four database hardening migrations inside a transaction and then
 * rolls it back: each migration's own checks run against the real database (they stop with an error if an
 * assumption does not hold), and nothing stays. Use it for the dry run on the project, after the read-only
 * preflight (scripts/db/preflight_hardening.sql), and only with the owner's approval.
 *
 *   node scripts/db/dryrun-hardening.mjs > /tmp/dryrun.sql             (the migrations verbatim)
 *   node scripts/db/dryrun-hardening.mjs --compact > /tmp/dryrun.sql   (without comment-only lines: shorter to send)
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
];

/** The migration text without its comment-only lines (the SQL is identical; the script is much shorter to send). */
export const withoutCommentLines = sql => sql.split('\n').filter(line => !/^\s*--/.test(line)).join('\n').replace(/\n{3,}/g, '\n\n');

export function dryRunSql(root = process.cwd(), { compact = false } = {}) {
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
  parts.push("\ndo $$ begin raise notice 'dry run: all four migrations applied and their checks passed; rolling back'; end $$;");
  parts.push('rollback;');
  return parts.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.stdout.write(dryRunSql(process.cwd(), { compact: process.argv.includes('--compact') }));
}
