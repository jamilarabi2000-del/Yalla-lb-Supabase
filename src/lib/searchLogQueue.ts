/**
 * Storefront searches that could not be sent, kept in the shopper's browser
 * and sent later, so a dropped connection does not lose them from the
 * analytics. Pure logic; storage access stays with the caller.
 */

export interface PendingSearch {
  query: string;
  origin: string;
  /** When the search happened; sent as created_at so the analytics keep it. */
  at: string;
  /** Whoever was signed in at the time, or null for a guest. */
  userId: string | null;
}

export const PENDING_SEARCHES_KEY = 'yallalb_search_logs_pending';
export const MAX_PENDING_SEARCHES = 50;
export const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Only a failure to reach the database is worth retrying. A refusal -- RLS,
 * the rate limit, a constraint -- would be refused again.
 */
export function isRetryableLogError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  // No SQLSTATE: the request never reached Postgres (offline, gateway error).
  if (!code) return true;
  // PostgREST's own connection errors, and Postgres connection exceptions.
  return /^PGRST00[0-2]$/.test(code) || code.startsWith('08');
}

/** Well-formed entries from the last 24 hours, and none from the future. */
export function freshPending(list: unknown, now: number): PendingSearch[] {
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is PendingSearch => {
    if (!e || typeof e !== 'object') return false;
    const { query, origin, at, userId } = e as PendingSearch;
    const t = Date.parse(at);
    return typeof query === 'string' && query.trim().length > 0 && typeof origin === 'string'
      && (userId === null || typeof userId === 'string')
      && Number.isFinite(t) && t <= now + 60_000 && now - t <= MAX_PENDING_AGE_MS;
  });
}

/** Newest first, capped, stale entries dropped. */
export function addPending(list: unknown, entry: PendingSearch, now: number): PendingSearch[] {
  return [entry, ...freshPending(list, now)].slice(0, MAX_PENDING_SEARCHES);
}

/**
 * The account a queued search may be sent under: its own, if that account is
 * still the one signed in, otherwise none. The insert policy only accepts
 * user_id = auth.uid() or null.
 */
export function sendAs(entry: PendingSearch, currentUserId: string | null | undefined): string | null {
  return entry.userId && entry.userId === currentUserId ? entry.userId : null;
}
