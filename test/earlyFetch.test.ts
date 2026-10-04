// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EARLY_MAX_AGE_MS, fetchWithEarlyAnswers, takeEarlyEntry, type EarlyEntries } from '../src/lib/earlyFetch';

// An early answer is reused only when it is exactly right for the request that wants it, and
// only once. Anything else goes to the server, so what the page shows is what the server says.
const KEY = 'sb_publishable_abc';
const URL_A = 'https://p.supabase.co/rest/v1/categories?select=id&is_published=eq.true';
const URL_B = 'https://p.supabase.co/rest/v1/regions?select=id';
const clientHeaders = (extra: Record<string, string> = {}) => ({ apikey: KEY, authorization: `Bearer ${KEY}`, 'accept-profile': 'public', 'x-client-info': 'supabase-js/2.116.0; runtime=web', ...extra });
const ok = (text = '[{"id":1}]') => new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });

let entries: EarlyEntries;
let base: ReturnType<typeof vi.fn>;
const fresh = (response: Response | null = ok(), startedAt = Date.now()) => ({ startedAt, response: Promise.resolve(response) });
const wrapped = () => fetchWithEarlyAnswers(base as unknown as typeof fetch, KEY);

beforeEach(() => {
  entries = new Map([[URL_A, fresh()], [URL_B, fresh(ok('[{"id":2}]'))]]);
  window.__yallaEarly = entries;
  base = vi.fn(async () => ok('[{"id":"from the server"}]'));
});

describe('a request the early answer is exactly right for', () => {
  it('gets the early answer, and the server is not asked', async () => {
    const response = await wrapped()(URL_A, { headers: clientHeaders() });
    expect(await response.json()).toEqual([{ id: 1 }]);
    expect(base).not.toHaveBeenCalled();
  });

  it('may give its address as a URL or a Request, and its headers any way the client does', async () => {
    expect(await (await wrapped()(new URL(URL_A), { headers: new Headers(clientHeaders()) })).json()).toEqual([{ id: 1 }]);
    expect(await (await wrapped()(new Request(URL_B, { headers: clientHeaders() }))).json()).toEqual([{ id: 2 }]);
    expect(base).not.toHaveBeenCalled();
  });

  it('may carry an Accept for JSON or none at all', async () => {
    entries.set(URL_B, fresh());
    expect(await (await wrapped()(URL_A, { headers: clientHeaders({ accept: 'application/json' }) })).json()).toEqual([{ id: 1 }]);
    expect(await (await wrapped()(URL_B, { headers: clientHeaders({ accept: '*/*' }) })).json()).toEqual([{ id: 1 }]);
    expect(base).not.toHaveBeenCalled();
  });

  it('uses the answer up: the same read a second time goes to the server', async () => {
    await wrapped()(URL_A, { headers: clientHeaders() });
    expect(entries.has(URL_A)).toBe(false);
    const again = await wrapped()(URL_A, { headers: clientHeaders() });
    expect(await again.json()).toEqual([{ id: 'from the server' }]);
    expect(base).toHaveBeenCalledTimes(1);
  });
});

describe('a request it is not right for goes to the server and leaves the early answer where it is', () => {
  const goesToServer = async (url: string, init: RequestInit | undefined) => {
    const response = await wrapped()(url, init);
    expect(await response.json()).toEqual([{ id: 'from the server' }]);
    expect(base).toHaveBeenCalledTimes(1);
    expect(entries.has(URL_A), 'the early answer is kept').toBe(true);
  };

  it('a different address', async () => { await goesToServer(URL_A.replace('select=id', 'select=id,name_en'), { headers: clientHeaders() }); });
  it('a signed-in visitor (their own token)', async () => { await goesToServer(URL_A, { headers: clientHeaders({ authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.signed.in' }) }); });
  it('another key', async () => { await goesToServer(URL_A, { headers: clientHeaders({ apikey: 'someone-elses' }) }); });
  it('no key', async () => { await goesToServer(URL_A, { headers: { 'accept-profile': 'public' } }); });
  it('another schema', async () => { await goesToServer(URL_A, { headers: clientHeaders({ 'accept-profile': 'private' }) }); });
  it('a request for one object (single)', async () => { await goesToServer(URL_A, { headers: clientHeaders({ accept: 'application/vnd.pgrst.object+json' }) }); });
  it('a request for a range of rows', async () => { await goesToServer(URL_A, { headers: clientHeaders({ range: '0-9', 'range-unit': 'items' }) }); });
  it('a request with a preference', async () => { await goesToServer(URL_A, { headers: clientHeaders({ prefer: 'count=exact' }) }); });
  it('a request with any header it does not know', async () => { await goesToServer(URL_A, { headers: clientHeaders({ 'x-something': '1' }) }); });
  it('anything but a GET', async () => { await goesToServer(URL_A, { method: 'POST', headers: clientHeaders() }); });
  it('a request with no headers at all', async () => { await goesToServer(URL_A, undefined); });
});

describe('an early answer that cannot be used', () => {
  it('one that failed to be made: the server is asked, and says whatever it says', async () => {
    entries.set(URL_A, fresh(null));
    const response = await wrapped()(URL_A, { headers: clientHeaders() });
    expect(await response.json()).toEqual([{ id: 'from the server' }]);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('one the server refused: the server is asked again, so the app reports the refusal itself', async () => {
    entries.set(URL_A, fresh(new Response('{"message":"JWT expired"}', { status: 401 })));
    base.mockResolvedValueOnce(new Response('{"message":"from the server"}', { status: 403 }));
    const response = await wrapped()(URL_A, { headers: clientHeaders() });
    expect(response.status).toBe(403);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('one that is too old: dropped, and the server is asked', async () => {
    entries.set(URL_A, fresh(ok(), Date.now() - EARLY_MAX_AGE_MS - 1));
    const response = await wrapped()(URL_A, { headers: clientHeaders() });
    expect(await response.json()).toEqual([{ id: 'from the server' }]);
    expect(entries.has(URL_A)).toBe(false);
  });

  it('none at all (the script did not run, or a signed-in visitor): the client behaves as it always did', async () => {
    delete window.__yallaEarly;
    await wrapped()(URL_A, { headers: clientHeaders() });
    expect(base).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledWith(URL_A, { headers: clientHeaders() });
  });
});

describe('takeEarlyEntry', () => {
  it('is nothing for an empty list or no key, and never throws', () => {
    expect(takeEarlyEntry(URL_A, { headers: clientHeaders() }, KEY, undefined)).toBeNull();
    expect(takeEarlyEntry(URL_A, { headers: clientHeaders() }, KEY, new Map())).toBeNull();
    expect(takeEarlyEntry(URL_A, { headers: clientHeaders() }, '', entries)).toBeNull();
  });

  it('is fresh up to the limit and no further, and the limit is seconds: an answer is never long out of date when the page uses it', () => {
    expect(EARLY_MAX_AGE_MS).toBeGreaterThanOrEqual(5_000);   // long enough for the app to download and start on a slow connection
    expect(EARLY_MAX_AGE_MS).toBeLessThanOrEqual(30_000);     // short enough that a later read is never answered from something old
    const startedAt = 1_000_000;
    entries.set(URL_A, fresh(ok(), startedAt));
    expect(takeEarlyEntry(URL_A, { headers: clientHeaders() }, KEY, entries, startedAt + EARLY_MAX_AGE_MS)).not.toBeNull();
    entries.set(URL_A, fresh(ok(), startedAt));
    expect(takeEarlyEntry(URL_A, { headers: clientHeaders() }, KEY, entries, startedAt + EARLY_MAX_AGE_MS + 1)).toBeNull();
  });
});
