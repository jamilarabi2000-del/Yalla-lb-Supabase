// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EARLY_REQUESTS, EARLY_SCHEMA, earlyHeaders, earlyRequestUrls, sessionStorageKey } from '../src/lib/earlyRequests';

// A first visit used to wait for ~250 kB of code and only then ask for its settings and
// products, one after the other. A tiny script in the page's <head> now starts those reads
// while the code downloads, and the app picks the answers up. An early answer is reused
// only for a request with the very same address, so this file runs the REAL services and
// fails if any read they make differs from the list the script starts.
const URL_BASE = 'https://abcdefghij.supabase.co';
const KEY = 'sb_publishable_testkey123';
type Seen = { url: string; method: string; headers: Record<string, string> };
const seen: Seen[] = [];
const body = (url: string) => {
  // a row where the app expects one (maybeSingle), a list elsewhere
  if (/cms_site_content/.test(url)) return [{ content: { hero: { title: 'From the server' } } }];
  return [];
};
const recorder = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  seen.push({ url, method: (init?.method ?? 'GET').toUpperCase(), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
  return new Response(JSON.stringify(body(url)), { status: 200, headers: { 'Content-Type': 'application/json' } });
});

let catalog: typeof import('../src/services/supabaseCatalogService').supabaseCatalogService;
let cms: typeof import('../src/services/supabaseCmsService').supabaseCmsService;
let commerce: typeof import('../src/services/supabaseCommerceService').supabaseCommerceService;

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', URL_BASE);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', KEY);
  vi.stubGlobal('fetch', recorder);
  ({ supabaseCatalogService: catalog } = await import('../src/services/supabaseCatalogService'));
  ({ supabaseCmsService: cms } = await import('../src/services/supabaseCmsService'));
  ({ supabaseCommerceService: commerce } = await import('../src/services/supabaseCommerceService'));
});
beforeEach(() => { seen.length = 0; recorder.mockClear(); delete window.__yallaEarly; localStorage.clear(); });
afterEach(() => { delete window.__yallaEarly; });

/** What a signed-out visitor's page asks for as it starts: the real services, in the real way. */
const startupReads = () => Promise.allSettled([
  catalog.fetchCategories(),
  catalog.fetchRegions(),
  catalog.fetchSellers(),
  catalog.fetchProducts({ isAdmin: false, isSeller: false }),
  cms.fetchAllPublicCmsBlocks(),
  cms.fetchSiteContent(),
  cms.fetchTextRules(),
  commerce.fetchProductBundles(),
  commerce.fetchFreeDeliveryFrom(),
]);

describe('the list of early reads', () => {
  it('is built into addresses the way the Supabase client builds them', () => {
    const urls = earlyRequestUrls(URL_BASE);
    expect(urls).toHaveLength(9);
    expect(urls).toContain(`${URL_BASE}/rest/v1/cms_site_content?select=content&id=eq.main&published=eq.true`);
    expect(urls).toContain(`${URL_BASE}/rest/v1/cms_site_content?select=content&id=eq.text_styles&published=eq.true`);
    expect(urls).toContain(`${URL_BASE}/rest/v1/public_storefront_products?select=*&order=display_order.asc.nullslast%2Ccreated_at.asc`);
    expect(urls).toContain(`${URL_BASE}/rest/v1/product_bundles?select=*&order=display_order.asc%2Cid.asc`);
    expect(urls).toContain(`${URL_BASE}/rest/v1/app_settings?select=value&key=eq.lebanon_free_delivery_from_usd`);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('forgives a trailing slash on the project address', () => {
    expect(earlyRequestUrls(`${URL_BASE}/`)).toEqual(earlyRequestUrls(URL_BASE));
  });

  it('knows where the client keeps a signed-in visitor\'s session', () => {
    expect(sessionStorageKey(URL_BASE)).toBe('sb-abcdefghij-auth-token');
  });
});

describe('the real services make exactly the reads the script starts', () => {
  it('the same addresses, no more and no fewer', async () => {
    await startupReads();
    expect(seen.map(r => r.url).sort()).toEqual(earlyRequestUrls(URL_BASE).sort());
  });

  it('each as a plain GET with the public key and the schema, and nothing else of its own: what an early answer is matched on', async () => {
    await startupReads();
    expect(seen).toHaveLength(EARLY_REQUESTS.length);
    for (const request of seen) {
      expect(request.method, request.url).toBe('GET');
      expect(request.headers.apikey, request.url).toBe(KEY);
      expect(request.headers.authorization, request.url).toBe(`Bearer ${KEY}`);
      expect(request.headers['accept-profile'], request.url).toBe(EARLY_SCHEMA);
      // the client's own bookkeeping aside, no other header: nothing that could change the answer
      expect(Object.keys(request.headers).filter(h => h !== 'x-client-info').sort(), request.url).toEqual(['accept-profile', 'apikey', 'authorization']);
    }
  });

  it('and the early read carries exactly those headers', () => {
    expect(earlyHeaders(KEY)).toEqual({ apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Profile': 'public' });
  });
});

describe('the app picks the early answers up', () => {
  const startEarly = () => {
    const entries = new Map<string, { startedAt: number; response: Promise<Response | null> }>();
    for (const url of earlyRequestUrls(URL_BASE)) {
      entries.set(url, { startedAt: Date.now(), response: Promise.resolve(new Response(JSON.stringify(body(url)), { status: 200, headers: { 'Content-Type': 'application/json' } })) });
    }
    window.__yallaEarly = entries;
    return entries;
  };

  it('and asks the server for none of those reads again', async () => {
    const entries = startEarly();
    const results = await startupReads();
    expect(recorder).not.toHaveBeenCalled();
    expect(entries.size).toBe(0);                      // each used once, and used up
    // the answers were really read: the settings came back as the early answer said
    const settings = results[5];
    expect(settings.status).toBe('fulfilled');
    expect((settings as PromiseFulfilledResult<any>).value.hero.title).toBe('From the server');
  });

  it('but a later read of the same thing goes to the server (the early answer is used up)', async () => {
    startEarly();
    await startupReads();
    recorder.mockClear();
    await catalog.fetchCategories();
    expect(recorder).toHaveBeenCalledTimes(1);
  });

  it('an early read that failed is made again by the app, which reports what the server says', async () => {
    const entries = startEarly();
    const [categoriesUrl] = earlyRequestUrls(URL_BASE).filter(u => u.includes('/categories?'));
    entries.set(categoriesUrl, { startedAt: Date.now(), response: Promise.resolve(null) });
    await startupReads();
    expect(recorder).toHaveBeenCalledTimes(1);
    expect(seen[0].url).toBe(categoriesUrl);
  });

  it('an early read the server refused is made again too', async () => {
    const entries = startEarly();
    const [url] = earlyRequestUrls(URL_BASE).filter(u => u.includes('/regions?'));
    entries.set(url, { startedAt: Date.now(), response: Promise.resolve(new Response('{"message":"no"}', { status: 401 })) });
    await startupReads();
    expect(seen.map(r => r.url)).toEqual([url]);
  });
});

describe('the script and the page', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');

  it('the script is not written into index.html: Vite would fold it into the large app file, where it would run too late', () => {
    expect(read('index.html')).not.toMatch(/early\.ts|early\.js/);
  });

  it('it is its own entry of the build, added to the page first, by a plugin', () => {
    expect(read('vite.config.ts')).toMatch(/plugins: \[react\(\), tailwindcss\(\), fontPreload\(\), earlyScript\(\)\]/);
    expect(read('vite.config.ts')).toContain("import { earlyScript } from './scripts/earlyScript.mjs';");
  });

  it('the services take the columns and keys from the shared list, so those cannot drift', () => {
    expect(read('src/services/supabaseCatalogService.ts')).toContain('.select(CATEGORY_COLUMNS)');
    expect(read('src/services/supabaseCatalogService.ts')).toContain('.select(SELLER_COLUMNS)');
    expect(read('src/services/supabaseCatalogService.ts')).toContain('.select(REGION_COLUMNS)');
    expect(read('src/services/supabaseCommerceService.ts')).toContain("import { FREE_DELIVERY_SETTING_KEY } from '../lib/earlyRequests';");
    expect(read('src/services/supabaseCmsService.ts')).toContain("import { SITE_CONTENT_ROW, TEXT_RULES_ROW } from '../lib/earlyRequests';");
  });

  it('the script imports only the list and the phone-picture helper, and those import next to nothing, so the script stays tiny', () => {
    const importsOf = (file: string) => [...read(file).matchAll(/^import [^\n]*from '([^']+)';/gm)].map(m => m[1]);
    expect(importsOf('src/lib/earlyRequests.ts')).toEqual([]);
    expect(importsOf('src/lib/earlyHero.ts')).toEqual(['./responsiveImage']);
    expect(importsOf('src/lib/responsiveImage.ts')).toEqual([]);
    expect(importsOf('src/early.ts')).toEqual(['./lib/earlyRequests', './lib/earlyFetch', './lib/earlyHero']);   // the second is a type only, erased
    expect(read('src/early.ts')).toContain("import type { EarlyEntries } from './lib/earlyFetch';");
  });

  it('the Supabase client is given the wrapper, with the same key it sends', () => {
    const client = read('src/lib/supabase.ts');
    expect(client).toContain("import { fetchWithEarlyAnswers } from './earlyFetch';");
    expect(client).toContain('global: { fetch: fetchWithEarlyAnswers((input, init) => fetch(input, init), clientKey) },');
    expect(client).toContain('clientKey,\n');
  });
});
