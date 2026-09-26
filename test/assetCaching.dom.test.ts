// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { failedChunkUrl, refreshFailedChunk } from '../src/lib/chunkRecovery';

// Returning visitors used to re-check every app file on every visit. The
// hashed files under /assets now stay in the browser for a year; a missing
// one gets a plain "not found" instead of the home page, and a failed file is
// fetched once past the cache before the page reloads.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
const vercel = JSON.parse(read('vercel.json')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
  rewrites: { source: string; destination: string }[];
};

describe('app files are cached for a year', () => {
  it('marks /assets/* immutable for a year, and nothing else', () => {
    const cached = vercel.headers.filter(h => h.headers.some(x => x.key === 'Cache-Control'));
    expect(cached).toEqual([{
      source: '/assets/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    }]);
  });

  it('keeps every security header on every path', () => {
    const all = vercel.headers.find(h => h.source === '/(.*)');
    expect(all?.headers.map(h => h.key)).toEqual(expect.arrayContaining([
      'Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options',
    ]));
  });

  it('never answers a missing app file with the home page', () => {
    const fallback = vercel.rewrites.at(-1)!;
    expect(fallback).toEqual({ source: '/((?!assets/).*)', destination: '/index.html' });
    const pattern = new RegExp(`^${fallback.source}$`);
    for (const p of ['/', '/products', '/admin/x', '/account', '/assetsy']) expect(pattern.test(p), p).toBe(true);
    for (const p of ['/assets/main-abc123.js', '/assets/AdminView-ClvOCIUk.js']) expect(pattern.test(p), p).toBe(false);
  });

  it('only puts hashed files under /assets', () => {
    // Everything Vite writes to /assets carries a content hash; nothing in
    // public/ may land there unhashed and then be cached for a year.
    expect(fs.existsSync(path.resolve(process.cwd(), 'public/assets'))).toBe(false);
  });
});

describe('a failed app file is fetched once past the cache', () => {
  const origin = window.location.origin;

  it('finds the file Chrome, Edge and Firefox name in the error', () => {
    expect(failedChunkUrl(new TypeError(`Failed to fetch dynamically imported module: ${origin}/assets/AdminView-ClvOCIUk.js`)))
      .toBe(`${origin}/assets/AdminView-ClvOCIUk.js`);
    expect(failedChunkUrl(new TypeError(`error loading dynamically imported module: ${origin}/assets/CheckoutView-D9Q-CUTi.js`)))
      .toBe(`${origin}/assets/CheckoutView-D9Q-CUTi.js`);
  });

  it('does nothing when the browser does not name it, or names another site', () => {
    expect(failedChunkUrl(new TypeError('Importing a module script failed.'))).toBeNull();
    expect(failedChunkUrl(new TypeError('Failed to fetch dynamically imported module: https://evil.example/assets/x.js'))).toBeNull();
    expect(failedChunkUrl(undefined)).toBeNull();
  });

  it('asks the server again, bypassing the browser cache', async () => {
    const fetchImpl = vi.fn(async () => new Response('')) as unknown as typeof fetch;
    await refreshFailedChunk(new TypeError(`Failed to fetch dynamically imported module: ${origin}/assets/x-1.js`), fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(`${origin}/assets/x-1.js`, { cache: 'reload' });

    const offline = vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    await expect(refreshFailedChunk(new TypeError(`Failed to fetch dynamically imported module: ${origin}/assets/x-2.js`), offline))
      .resolves.toBeUndefined();
  });

  it('runs before the one-time reload', () => {
    const app = read('src/App.tsx');
    expect(app).toMatch(/sessionStorage\.setItem\('chunk_reload_attempted', '1'\);\s*await refreshFailedChunk\(error\);\s*window\.location\.reload\(\);/);
  });
});
