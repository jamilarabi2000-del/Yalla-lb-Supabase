import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Contract tests for the three MEDIUM findings from the 2026-09-23 audit.
 *
 * Each fix was verified live against the production database by impersonating
 * anon, a signed-in customer and an admin in a rolled-back transaction. These
 * tests pin the migrations that carry those fixes, so a later edit that
 * quietly undoes one fails here rather than in production.
 *
 * SQL comments are stripped before asserting: every migration explains the
 * pattern it removes, and that prose would otherwise satisfy the checks.
 */

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const stripSql = (s: string) => s.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('V4: app_settings is private unless a key is allowlisted', () => {
  const sql = stripSql(read('supabase/migrations/20260923140000_app_settings_public_key_allowlist.sql'));

  it('replaces the unconditional public read', () => {
    expect(sql).toMatch(/drop policy if exists app_settings_public_read/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it('allows exactly the keys the client reads', () => {
    // fetchLbpUsdRate is the only client read of this table.
    expect(sql).toMatch(/using\s*\(\s*key\s*=\s*any\s*\(\s*array\['lbp_usd_rate'\]/i);
  });

  it('asserts at apply time that no unconditional read survives', () => {
    expect(sql).toContain('APP_SETTINGS_STILL_UNCONDITIONALLY_READABLE');
  });

  it('matches the one key the client actually asks for', () => {
    const svc = read('src/services/supabaseCommerceService.ts');
    expect(svc).toContain(".eq('key', 'lbp_usd_rate')");
  });
});
