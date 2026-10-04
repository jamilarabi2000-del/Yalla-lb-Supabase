// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EARLY_MAX_AGE_MS, SETTINGS_REQUEST, earlyRequestUrl } from '../src/lib/earlyRequests';
import { takeEarlyEntry } from '../src/lib/earlyFetch';

// On a phone the banner's picture is the biggest thing on the screen. src/early.ts names it from
// the settings as soon as they arrive, so it downloads while the app is still starting. This is
// about when that happens and, as much, when it must not: a link that names the wrong picture, or
// one for a desktop screen, costs the visitor a download for nothing.
const URL_BASE = 'https://abcdefghij.supabase.co';
const KEY = 'sb_publishable_testkey123';
const SETTINGS_URL = earlyRequestUrl(URL_BASE, SETTINGS_REQUEST);
const PHOTO = 'https://images.unsplash.com/photo-1544816155?auto=format&fit=crop&q=80&w=2000';

const settingsWith = (hero: object) => JSON.stringify([{ content: { hero } }]);
let answer: () => Response;
let fetchMock: ReturnType<typeof vi.fn>;
const run = async () => { vi.resetModules(); await import('../src/early'); await new Promise(resolve => setTimeout(resolve, 10)); };
const links = () => [...document.head.querySelectorAll('link[rel="preload"]')];
const asPhone = (wide = false) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: wide && query === '(min-width: 768px)', media: query }));

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', URL_BASE);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', KEY);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  localStorage.clear();
  delete window.__yallaEarly;
  document.head.innerHTML = '';
  answer = () => new Response(settingsWith({ bgMediaItems: [{ id: 'a', type: 'image', url: PHOTO, isPublished: true }] }), { status: 200 });
  fetchMock = vi.fn(async (address: string) => (address === SETTINGS_URL ? answer() : new Response('[]', { status: 200 })));
  vi.stubGlobal('fetch', fetchMock);
  asPhone();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete window.__yallaEarly; document.head.innerHTML = ''; });

describe('on a phone, once the settings say which picture comes first', () => {
  it('asks for it as an image, at high priority, with the page\'s own list of sizes', async () => {
    await run();
    expect(links()).toHaveLength(1);
    const link = links()[0];
    expect(link.getAttribute('as')).toBe('image');
    expect(link.getAttribute('href')).toBe(PHOTO);
    expect(link.getAttribute('imagesizes')).toBe('100vw');
    expect(link.getAttribute('imagesrcset')).toContain('480w');
    expect(link.getAttribute('fetchpriority')).toBe('high');
  });

  it('asks the way the banner\'s own <img> will, so it is the same download: no referrer, no crossorigin', async () => {
    await run();
    const link = links()[0];
    expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(link.hasAttribute('crossorigin')).toBe(false);
  });

  it('a picture that comes in one size has no list of sizes', async () => {
    answer = () => new Response(settingsWith({ bgImageUrl: 'https://i.ibb.co/one.png' }), { status: 200 });
    await run();
    const link = links()[0];
    expect(link.getAttribute('href')).toBe('https://i.ibb.co/one.png');
    expect(link.hasAttribute('imagesrcset')).toBe(false);
    expect(link.hasAttribute('imagesizes')).toBe(false);
  });

  it('is added once, into the page\'s head', async () => {
    await run();
    expect(document.head.querySelectorAll('link[rel="preload"]')).toHaveLength(1);
    expect(document.body.querySelectorAll('link')).toHaveLength(0);
  });

  it('leaves the answer whole for the app: it can still read the settings, once, as before', async () => {
    await run();
    expect(links()).toHaveLength(1);
    const entry = takeEarlyEntry(SETTINGS_URL, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Profile': 'public' } }, KEY, window.__yallaEarly)!;
    expect(entry).not.toBeNull();
    const response = (await entry.response)!;
    expect(response.bodyUsed).toBe(false);
    expect(await response.json()).toEqual([{ content: { hero: { bgMediaItems: [{ id: 'a', type: 'image', url: PHOTO, isPublished: true }] } } }]);
  });

  it('does not make a request of its own for the settings', async () => {
    await run();
    expect(fetchMock.mock.calls.filter(([address]) => address === SETTINGS_URL)).toHaveLength(1);
  });
});

describe('where it names nothing', () => {
  it('on a desktop screen, where the size the picture is shown at depends on the panel beside it', async () => {
    asPhone(true);
    await run();
    expect(links()).toHaveLength(0);
    expect(window.__yallaEarly!.size).toBe(9);   // the reads still start
  });

  it('where the browser cannot say how wide the screen is', async () => {
    vi.stubGlobal('matchMedia', undefined);
    await run();
    expect(links()).toHaveLength(0);
    expect(window.__yallaEarly!.size).toBe(9);
  });

  it('a first slide that is a video', async () => {
    answer = () => new Response(settingsWith({ bgMediaItems: [{ id: 'v', type: 'video', url: 'https://cdn.example.com/v.mp4', isPublished: true }] }), { status: 200 });
    await run();
    expect(links()).toHaveLength(0);
  });

  it('a picture that is not an https address', async () => {
    answer = () => new Response(settingsWith({ bgImageUrl: 'http://example.com/a.jpg' }), { status: 200 });
    await run();
    expect(links()).toHaveLength(0);
  });

  it('settings with no picture: the banner shows its own built-in photo', async () => {
    answer = () => new Response(settingsWith({ title: 'Hello' }), { status: 200 });
    await run();
    expect(links()).toHaveLength(0);
  });

  it('no published settings (the table has no such row)', async () => {
    answer = () => new Response('[]', { status: 200 });
    await run();
    expect(links()).toHaveLength(0);
  });

  it('a signed-in visitor: nothing is started at all', async () => {
    localStorage.setItem('sb-abcdefghij-auth-token', '{"access_token":"x"}');
    await run();
    expect(links()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('when the settings do not come, nothing breaks and the app asks for them itself', () => {
  const unhandled = vi.fn();
  beforeEach(() => { unhandled.mockClear(); process.on('unhandledRejection', unhandled); });
  afterEach(() => { process.off('unhandledRejection', unhandled); });

  it('the server answers with an error: whatever the body says, it is not trusted', async () => {
    for (const status of [401, 404, 500, 503]) {
      answer = () => new Response(settingsWith({ bgImageUrl: 'https://i.ibb.co/one.png' }), { status });
      document.head.innerHTML = '';
      await run();
      expect(links(), `status ${status}`).toHaveLength(0);
    }
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('the answer is not JSON', async () => {
    answer = () => new Response('<html>gateway timeout</html>', { status: 200 });
    await run();
    expect(links()).toHaveLength(0);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('the answer is JSON of another shape', async () => {
    for (const body of ['null', '{}', '"text"', '[null]', '[{"content":null}]', '[{"content":"x"}]', '[{"content":{"hero":[]}}]']) {
      answer = () => new Response(body, { status: 200 });
      document.head.innerHTML = '';
      await run();
      expect(links(), body).toHaveLength(0);
    }
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('the connection fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await run();
    expect(links()).toHaveLength(0);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('the answer has already been used up by the time it is looked at', async () => {
    answer = () => { const response = new Response(settingsWith({ bgImageUrl: 'https://i.ibb.co/one.png' }), { status: 200 }); void response.text(); return response; };
    await run();
    expect(links()).toHaveLength(0);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('it does not hold the page up', () => {
  it('the link is added only when the settings arrive, not before', async () => {
    let release!: () => void;
    fetchMock.mockImplementation(async (address: string) => {
      if (address === SETTINGS_URL) await new Promise<void>(resolve => { release = resolve; });
      return address === SETTINGS_URL ? answer() : new Response('[]', { status: 200 });
    });
    vi.resetModules();
    await import('../src/early');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(links()).toHaveLength(0);
    release();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(links()).toHaveLength(1);
  });

  it('an answer that arrives after the early answers were let go still names the picture (the browser can still use it)', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    fetchMock.mockImplementation(async (address: string) => {
      if (address === SETTINGS_URL) await new Promise<void>(resolve => { release = resolve; });
      return address === SETTINGS_URL ? answer() : new Response('[]', { status: 200 });
    });
    vi.resetModules();
    await import('../src/early');
    await vi.advanceTimersByTimeAsync(EARLY_MAX_AGE_MS + 1);
    expect(window.__yallaEarly!.size).toBe(0);
    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(links()).toHaveLength(1);
  });
});
