import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_PENDING_AGE_MS,
  MAX_PENDING_SEARCHES,
  addPending,
  freshPending,
  isRetryableLogError,
  sendAs,
  type PendingSearch,
} from '../src/lib/searchLogQueue';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const NOW = Date.parse('2026-09-23T12:00:00Z');
const entry = (over: Partial<PendingSearch> = {}): PendingSearch => ({
  query: 'zaatar', origin: 'navbar', at: new Date(NOW - 60_000).toISOString(), userId: null, ...over,
});

describe('which failures are worth retrying', () => {
  it('retries only when the database was never reached', () => {
    expect(isRetryableLogError({ message: 'TypeError: Failed to fetch', code: '' })).toBe(true);
    expect(isRetryableLogError({ message: 'Bad gateway' })).toBe(true);
    for (const code of ['PGRST000', 'PGRST001', 'PGRST002', '08006']) expect(isRetryableLogError({ code }), code).toBe(true);
  });

  it('drops refusals, which would be refused again', () => {
    for (const code of ['42501', '53400', '23505', 'PGRST204']) expect(isRetryableLogError({ code }), code).toBe(false);
    expect(isRetryableLogError(null)).toBe(false);
  });
});

describe('the queue', () => {
  it('keeps the newest first and caps its size', () => {
    let list: PendingSearch[] = [];
    for (let i = 0; i < MAX_PENDING_SEARCHES + 5; i++) list = addPending(list, entry({ query: `q${i}` }), NOW);
    expect(list).toHaveLength(MAX_PENDING_SEARCHES);
    expect(list[0].query).toBe(`q${MAX_PENDING_SEARCHES + 4}`);
  });

  it('forgets searches older than a day, from the future, or malformed', () => {
    const kept = freshPending([
      entry({ query: 'fresh' }),
      entry({ query: 'stale', at: new Date(NOW - MAX_PENDING_AGE_MS - 1).toISOString() }),
      entry({ query: 'future', at: new Date(NOW + 5 * 60_000).toISOString() }),
      entry({ query: '  ' }),
      { query: 'no origin', at: new Date(NOW).toISOString(), userId: null },
      entry({ query: 'bad user', userId: 42 as unknown as string }),
      'junk', null,
    ], NOW);
    expect(kept.map(e => e.query)).toEqual(['fresh']);
    expect(freshPending('not a list', NOW)).toEqual([]);
  });

  it('sends a queued search under its own account only while that account is signed in', () => {
    expect(sendAs(entry({ userId: 'u-1' }), 'u-1')).toBe('u-1');
    expect(sendAs(entry({ userId: 'u-1' }), 'u-2')).toBeNull();
    expect(sendAs(entry({ userId: 'u-1' }), undefined)).toBeNull();
    expect(sendAs(entry({ userId: null }), 'u-1')).toBeNull();
  });
});

describe('wiring', () => {
  const shop = stripTs(read('src/context/ShopContext.tsx'));
  const start = shop.indexOf('const logSearchQuery = useCallback');
  const logging = shop.slice(start, shop.indexOf("window.addEventListener('online'", start));

  it('records a signed-in shopper\'s search against their account', () => {
    const svc = stripTs(read('src/services/supabaseAdminService.ts'));
    expect(svc).toMatch(/user_id: userId,/);
    expect(logging).toMatch(/const userId = authUser\?\.uid \?\? null;/);
    expect(logging).toMatch(/supabaseAdminService\.logSearch\(trimmed, origin, userId\)/);
  });

  it('queues a dropped search and never throws to the search box', () => {
    expect(logging).toMatch(/if \(isRetryableLogError\(err\)\)/);
    expect(logging).not.toMatch(/\bthrow\b/);
  });

  it('makes no realtime claim for a table that is not in the realtime publication', () => {
    const view = stripTs(read('src/components/admin/SearchAnalyticsView.tsx'));
    expect(view).not.toMatch(/\.channel\(/);
    expect(view).toMatch(/setInterval\(load, REFRESH_MS\)/);
  });

  it('the admin view reads only the columns it shows, not client addresses', () => {
    const view = stripTs(read('src/components/admin/SearchAnalyticsView.tsx'));
    expect(view).toContain(".select('id,query,origin,user_id,created_at')");
  });
});
