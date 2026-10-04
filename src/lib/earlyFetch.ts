import { EARLY_MAX_AGE_MS, EARLY_SCHEMA } from './earlyRequests';

export { EARLY_MAX_AGE_MS };

/**
 * The reads a signed-out visitor's page makes as it starts are begun by a tiny
 * script in the page's <head> while the app's code is still downloading
 * (src/early.ts); the app then picks up the answers here instead of asking again.
 * An answer is used only when it is exactly right for the request that wants it,
 * and at most once:
 *
 *  - the same address, and a plain GET: no header that could change the answer (a
 *    range, a preference, another media type) beyond the ones the early read carried;
 *  - the request carries only the public key, as the early one did: a signed-in
 *    visitor's reads carry their own token, may be answered differently by the
 *    database, and never use an early answer;
 *  - not older than EARLY_MAX_AGE_MS, so a later read (a refresh after a change)
 *    always goes to the server;
 *  - the early answer succeeded. If it failed in any way, the request goes to the
 *    server itself and reports whatever the server says, exactly as it would have.
 */

export interface EarlyEntry {
  startedAt: number;
  /** The answer, or null if the early request could not be made. It never rejects. */
  response: Promise<Response | null>;
}
export type EarlyEntries = Map<string, EarlyEntry>;

declare global {
  interface Window { __yallaEarly?: EarlyEntries }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Besides these, a header on a read may change what it returns (range, prefer, ...): then no early answer is used. */
const HEADERS_THAT_DO_NOT_CHANGE_THE_ANSWER = new Set(['apikey', 'authorization', 'accept-profile', 'accept', 'x-client-info']);

const addressOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** The early answer for this request if it is exactly right and still fresh; taking it uses it up. */
export function takeEarlyEntry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  publicKey: string,
  entries: EarlyEntries | undefined,
  now: number = Date.now(),
): EarlyEntry | null {
  if (!entries || entries.size === 0 || !publicKey) return null;
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET') return null;
  const address = addressOf(input);
  const entry = entries.get(address);
  if (!entry) return null;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const accept = headers.get('accept');
  const alike = headers.get('apikey') === publicKey
    && headers.get('authorization') === `Bearer ${publicKey}`
    && headers.get('accept-profile') === EARLY_SCHEMA
    && (accept === null || accept === '*/*' || accept === 'application/json')
    && [...headers.keys()].every(name => HEADERS_THAT_DO_NOT_CHANGE_THE_ANSWER.has(name));
  if (!alike) return null;
  // Used up either way: a stale answer is dropped, not kept for the next request.
  entries.delete(address);
  if (now - entry.startedAt > EARLY_MAX_AGE_MS) return null;
  return entry;
}

/** `fetch` for the Supabase client: the early answer where there is one, otherwise `base`. */
export function fetchWithEarlyAnswers(base: FetchLike, publicKey: string): FetchLike {
  return (input, init) => {
    const entry = takeEarlyEntry(input, init, publicKey, typeof window === 'undefined' ? undefined : window.__yallaEarly);
    if (!entry) return base(input, init);
    return entry.response.then(response => (response && response.ok ? response : base(input, init)));
  };
}
