import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

// The database refuses a logged search over 200 characters (migration 20261004100300). The storefront
// cuts a search to that length before logging it, so a long paste is still counted in the analytics.
const inserted: Array<Record<string, unknown>> = [];
vi.mock('../src/lib/supabase', () => ({
  supabase: { from: () => ({ insert: async (row: Record<string, unknown>) => { inserted.push(row); return { error: null }; } }) },
}));
const { supabaseAdminService, forSearchLog, MAX_LOGGED_SEARCH_LENGTH } = await import('../src/services/supabaseAdminService');

beforeEach(() => { inserted.length = 0; });
const chars = (s: string) => Array.from(s).length;

describe('a logged search', () => {
  it('is sent as it is when it is short enough', async () => {
    await supabaseAdminService.logSearch('zaatar', 'navbar');
    expect(inserted[0].query).toBe('zaatar');
    expect(forSearchLog('x'.repeat(200))).toBe('x'.repeat(200));
  });

  it('is cut to 200 characters when longer, and still sent', async () => {
    await supabaseAdminService.logSearch('x'.repeat(5000), 'navbar');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].query).toBe('x'.repeat(200));
  });

  it('counts characters the way the database does, so Arabic is cut at 200 letters, not 200 bytes', () => {
    const arabic = 'زعتر'.repeat(80);   // 320 letters
    expect(chars(forSearchLog(arabic))).toBe(200);
    expect(forSearchLog(arabic)).toBe(arabic.slice(0, 200));
  });

  it('never cuts an emoji in half (a lone half would make the whole request invalid)', () => {
    const emoji = '🫒'.repeat(150);   // 150 characters, 300 UTF-16 units
    expect(forSearchLog(emoji)).toBe(emoji);
    const long = 'a'.repeat(199) + '🫒🫒';
    const cut = forSearchLog(long);
    expect(chars(cut)).toBe(200);
    expect(cut.endsWith('🫒')).toBe(true);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(cut)).toBe(false);
  });

  it('uses the same limit as the database check', () => {
    expect(MAX_LOGGED_SEARCH_LENGTH).toBe(200);
    const migration = fs.readFileSync('supabase/pending/20261004100300_anonymous_insert_size_caps_and_log_purge.sql', 'utf8');
    expect(migration).toContain(`check (char_length(query) <= ${MAX_LOGGED_SEARCH_LENGTH}) not valid`);
  });
});
