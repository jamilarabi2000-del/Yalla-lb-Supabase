// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { connectionIsTight, pageForPath, warmChunksWhenIdle } from '../src/lib/warmChunks';

// The cart, the quick view, the product page, the catalogue and the favourites are
// fetched on demand. Fetching one the first time it is wanted adds a round trip to a
// click, so they are fetched ahead of time, once the page has finished loading and
// the browser is idle, and never on a connection where that would cost the visitor.

describe('which page\'s code an address needs', () => {
  it('knows the pages that are loaded on demand', () => {
    expect(pageForPath('/product/33333333-cccc-4ccc-8ccc-000000000001')).toBe('product');
    expect(pageForPath('/products')).toBe('products');
    expect(pageForPath('/products/Mouneh')).toBe('products');
    expect(pageForPath('/products?search=zaatar'.split('?')[0])).toBe('products');
    expect(pageForPath('/favorites')).toBe('favorites');
  });

  it('is nothing for the home page and the pages that already load on their own', () => {
    for (const path of ['/', '', '/checkout', '/account', '/favorites/extra', '/about']) expect(pageForPath(path), path).toBeNull();
  });

  it('matches the pages the app opens on', () => {
    // ShopContext decides the starting page from the same prefixes
    const ctx = fs.readFileSync('src/context/ShopContext.tsx', 'utf8');
    expect(ctx).toContain("path.startsWith('product/')");
    expect(ctx).toContain("path.startsWith('products')");
    expect(ctx).toMatch(/path === 'favorites'/);
  });
});

describe('a connection where speculative fetching is not wanted', () => {
  it('is a Data Saver or a 2G connection', () => {
    expect(connectionIsTight({ saveData: true })).toBe(true);
    expect(connectionIsTight({ effectiveType: '2g' })).toBe(true);
    expect(connectionIsTight({ effectiveType: 'slow-2g' })).toBe(true);
  });
  it('is not 3G or 4G, a wired connection, or one that says nothing', () => {
    expect(connectionIsTight({ effectiveType: '3g' })).toBe(false);
    expect(connectionIsTight({ effectiveType: '4g', saveData: false })).toBe(false);
    expect(connectionIsTight({})).toBe(false);
    expect(connectionIsTight(undefined)).toBe(false);
    expect(connectionIsTight(null)).toBe(false);
  });
});

describe('fetching ahead of time', () => {
  let idleCallback: (() => void) | null;
  const readyState = (value: DocumentReadyState) => Object.defineProperty(document, 'readyState', { value, configurable: true });

  beforeEach(() => {
    vi.useFakeTimers();
    idleCallback = null;
    (window as any).requestIdleCallback = (fn: () => void) => { idleCallback = fn; return 7; };
    (window as any).cancelIdleCallback = vi.fn(() => { idleCallback = null; });
    readyState('complete');
    Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).requestIdleCallback;
    delete (window as any).cancelIdleCallback;
    readyState('complete');
    Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
  });

  it('waits for the browser to be idle after the page has loaded, then fetches each once', async () => {
    const loaders = [vi.fn(async () => 1), vi.fn(async () => 2)];
    warmChunksWhenIdle(loaders, { delayMs: 600 });
    expect(loaders[0]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(599);
    expect(idleCallback).toBeNull();                       // not idle-scheduled before the delay
    await vi.advanceTimersByTimeAsync(2);
    expect(idleCallback).not.toBeNull();                   // asked for an idle moment
    expect(loaders[0]).not.toHaveBeenCalled();             // ...but it has not come yet
    idleCallback!();
    expect(loaders[0]).toHaveBeenCalledTimes(1);
    expect(loaders[1]).toHaveBeenCalledTimes(1);
  });

  it('while the page is still loading, waits for it to finish first', async () => {
    readyState('loading');
    const load = vi.fn(async () => 1);
    warmChunksWhenIdle([load], { delayMs: 100 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(idleCallback).toBeNull();
    expect(load).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(101);
    idleCallback!();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('without requestIdleCallback it runs after the delay', async () => {
    delete (window as any).requestIdleCallback;
    const load = vi.fn(async () => 1);
    warmChunksWhenIdle([load], { delayMs: 50 });
    await vi.advanceTimersByTimeAsync(51);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('fetches nothing on a Data Saver connection', async () => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
    const load = vi.fn(async () => 1);
    warmChunksWhenIdle([load]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(idleCallback).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('can be cancelled at any point, before or after it has asked for an idle moment', async () => {
    const early = vi.fn(async () => 1);
    warmChunksWhenIdle([early], { delayMs: 500 })();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(idleCallback).toBeNull();
    expect(early).not.toHaveBeenCalled();

    const late = vi.fn(async () => 1);
    const cancel = warmChunksWhenIdle([late], { delayMs: 10 });
    await vi.advanceTimersByTimeAsync(11);
    expect(idleCallback).not.toBeNull();
    cancel();
    expect((window as any).cancelIdleCallback).toHaveBeenCalledWith(7);
    expect(late).not.toHaveBeenCalled();
  });

  it('a file that fails to fetch is not an error here: the page that needs it asks again', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const failing = vi.fn(async () => { throw new Error('offline'); });
    const fine = vi.fn(async () => 1);
    warmChunksWhenIdle([failing, fine], { delayMs: 1 });
    await vi.advanceTimersByTimeAsync(2);
    idleCallback!();
    await vi.advanceTimersByTimeAsync(10);
    process.off('unhandledRejection', unhandled);
    expect(fine).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
