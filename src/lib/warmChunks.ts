/**
 * Code a visitor may need later is split into files fetched on demand (the cart
 * drawer, the product page, the catalogue...). Fetching one the first time it is
 * wanted adds a round trip to a click. This fetches them ahead of time, once the
 * page has finished loading, so it takes nothing from the first load.
 */

export type LazyPage = 'product' | 'products' | 'favorites';

/**
 * Which page's code an address needs, so a shared link can start fetching it
 * straight away instead of after the app has started and found out. The same
 * paths the app opens on (ShopContext: getInitialNavTab).
 */
export function pageForPath(pathname: string): LazyPage | null {
  const path = pathname.replace(/^\/+/, '');
  if (path.startsWith('product/')) return 'product';
  if (path.startsWith('products')) return 'products';
  if (path === 'favorites') return 'favorites';
  return null;
}

type Loader = () => Promise<unknown>;

interface Connection { saveData?: boolean; effectiveType?: string }

/** True on a connection where fetching things nobody asked for yet would cost the visitor. */
export function connectionIsTight(connection: Connection | undefined | null): boolean {
  if (!connection) return false;
  return connection.saveData === true || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}

/**
 * Runs `loaders` once, when the browser is idle `delayMs` after the page has
 * finished loading (so the first load is never slowed down). Nothing is fetched
 * on a Data Saver or 2G connection. A failed fetch is not reported here: the
 * page that needs the code asks for it again, with retries.
 * Returns a function that cancels it.
 */
export function warmChunksWhenIdle(loaders: Loader[], { delayMs = 600 }: { delayMs?: number } = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  if (connectionIsTight((navigator as Navigator & { connection?: Connection }).connection)) return () => {};

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;

  const run = () => {
    if (cancelled) return;
    for (const load of loaders) load().catch(() => {});
  };
  const whenIdle = () => {
    if (cancelled) return;
    if ('requestIdleCallback' in window) idle = window.requestIdleCallback(run, { timeout: 3000 });
    else run();
  };
  const afterLoad = () => { timer = setTimeout(whenIdle, delayMs); };

  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });

  return () => {
    cancelled = true;
    window.removeEventListener('load', afterLoad);
    if (timer !== undefined) clearTimeout(timer);
    if (idle !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idle);
  };
}
