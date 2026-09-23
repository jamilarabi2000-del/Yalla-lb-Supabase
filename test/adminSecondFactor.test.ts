import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// A password alone must not read customer data: migration 20260923215834
// makes administrator reads of other people's rows need the session's second
// factor, and closes the admin write paths that lacked it.

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const sql = read('supabase/migrations/20260923215834_admin_reads_need_second_factor.sql').replace(/--.*$/gm, '');

const READ_TABLES = ['profiles', 'orders', 'order_items', 'carts', 'search_logs', 'seller_applications',
  'admin_activities', 'user_permissions', 'notifications', 'order_events', 'analytics_events'];

describe('administrator reads need the second factor', () => {
  it.each(READ_TABLES)('%s: other people\'s rows only with the factor', table => {
    const policy = new RegExp(
      `create policy ${table}_admin_read_needs_second_factor on public\\.${table}\\s+as restrictive for select to authenticated\\s+using \\(([^;]*)\\);`);
    const match = sql.match(policy);
    expect(match, table).not.toBeNull();
    expect(match![1]).toContain('not (select private.is_admin())');
    expect(match![1]).toContain('(select private.session_has_second_factor())');
    // The session's factor, not the 30-minute step-up window.
    expect(match![1]).not.toContain('is_admin_verified');
  });

  it('keeps the admin\'s own profile readable, which signing in needs', () => {
    expect(sql).toMatch(/profiles_admin_read_needs_second_factor[\s\S]*?using \(id = \(select auth\.uid\(\)\) or/);
  });

  it('fails the migration if any admin write path lacks a second-factor policy', () => {
    expect(sql).toMatch(/raise exception 'ADMIN_WRITE_WITHOUT_SECOND_FACTOR: %'/);
    expect(sql).toMatch(/raise exception 'ADMIN_READ_POLICY_MISSING: %'/);
  });

  it('lets a password-only admin change nobody else\'s notifications', () => {
    expect(sql).toMatch(/create policy notifications_require_verified_admin_update on public\.notifications\s+as restrictive for update to authenticated\s+using \(user_id = \(select auth\.uid\(\)\) or \(select private\.is_admin_verified\(\)\) or not \(select private\.is_admin\(\)\)\)/);
  });

  it('SECURITY.md describes reads as protected', () => {
    const doc = read('SECURITY.md');
    expect(doc).not.toMatch(/SELECT is never restricted/);
    expect(doc).toMatch(/session_has_second_factor\(\)`\. Their own rows stay readable/);
  });
});
