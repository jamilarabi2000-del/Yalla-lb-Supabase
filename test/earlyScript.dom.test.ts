// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EARLY_MAX_AGE_MS } from '../src/lib/earlyFetch';
import { earlyRequestUrls } from '../src/lib/earlyRequests';

// src/early.ts runs from the page's <head> and starts the first reads while the app downloads.
// It is only for a signed-out visitor, and if anything in it goes wrong nothing is lost: the
// app makes the same reads itself.
const URL_BASE = 'https://abcdefghij.supabase.co';
const KEY = 'sb_publishable_testkey123';
let fetchMock: ReturnType<typeof vi.fn>;
const run = async () => { vi.resetModules(); await import('../src/early'); };

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', URL_BASE);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', KEY);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  localStorage.clear();
  delete window.__yallaEarly;
  fetchMock = vi.fn(async () => new Response('[]', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete window.__yallaEarly; });

describe('for a signed-out visitor', () => {
  it('starts each of the page\'s first reads, with the public key and the schema, and nothing else', async () => {
    await run();
    expect(fetchMock).toHaveBeenCalledTimes(9);
    expect(fetchMock.mock.calls.map(c => c[0]).sort()).toEqual(earlyRequestUrls(URL_BASE).sort());
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toEqual({ headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Profile': 'public' } });
    }
  });

  it('leaves the answers where the app picks them up, one per address', async () => {
    await run();
    expect([...window.__yallaEarly!.keys()].sort()).toEqual(earlyRequestUrls(URL_BASE).sort());
    const response = await [...window.__yallaEarly!.values()][0].response;
    expect(response?.ok).toBe(true);
  });

  it('lets go of what the app has not picked up after a while', async () => {
    vi.useFakeTimers();
    await run();
    expect(window.__yallaEarly!.size).toBe(9);
    await vi.advanceTimersByTimeAsync(EARLY_MAX_AGE_MS + 1);
    expect(window.__yallaEarly!.size).toBe(0);
  });

  it('a read that cannot be made is not an error: its answer is nothing, and the app makes it itself', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await run();
    const answers = await Promise.all([...window.__yallaEarly!.values()].map(entry => entry.response));
    await new Promise(resolve => setTimeout(resolve, 20));
    process.off('unhandledRejection', unhandled);
    expect(answers.every(answer => answer === null)).toBe(true);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('works with the older name for the public key too', async () => {
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'legacy-anon-key');
    await run();
    expect(fetchMock.mock.calls[0][1].headers.apikey).toBe('legacy-anon-key');
  });
});

describe('when it should start nothing', () => {
  it('a visitor who is signed in (the client keeps their session in this browser)', async () => {
    localStorage.setItem('sb-abcdefghij-auth-token', '{"access_token":"x"}');
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.__yallaEarly).toBeUndefined();
  });

  it('a browser whose storage cannot be read: it cannot tell, so it says nothing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no project address or no key (a build without them)', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv('VITE_SUPABASE_URL', URL_BASE);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a read that throws as it starts does not stop the page', async () => {
    fetchMock.mockImplementation(() => { throw new Error('sync failure'); });
    await expect(run()).resolves.toBeUndefined();
  });
});
