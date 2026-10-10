/**
 * How a page stays reasonably fresh without holding a live connection to the database.
 *
 * An administrator or a seller keeps a live channel: they need to see an order or an edit at once. A shopper does
 * not. A live channel per open page costs the database a connection and a permission check per page for every
 * change, and each change to the catalogue (every order lowers stock) made EVERY open page download the catalogue
 * at the same instant. With thousands of shoppers that is a burst the database was never sized for.
 *
 * So a shopper's page re-reads when it comes back into view (they switched tab or app, or the network returned)
 * after being away for a while, and only after a short random wait, so a crowd that comes back together does not
 * arrive together. The catalogue is still read when the page opens; checkout still decides stock on the server.
 */

/** A page that has been away less than this does not re-read when it comes back. */
export const REFRESH_AFTER_MS = 60_000;
/** The longest random wait before a re-read, so pages that return at the same moment do not all ask at once. */
export const REFRESH_JITTER_MS = 5_000;

/** Only these roles keep a live channel (see above). */
export const keepsLiveChannel = (roles: { isAdminUser: boolean; isSellerUser: boolean }): boolean =>
  roles.isAdminUser || roles.isSellerUser;

interface Options {
  minGapMs?: number;
  jitterMs?: number;
  /** Injected so tests do not depend on chance. */
  random?: () => number;
  now?: () => number;
}

/**
 * Calls `refresh` when the page comes back into view or back online after `minGapMs` or more since the page was
 * opened or last refreshed here, after a random wait of up to `jitterMs`. At most one re-read is waiting at a time.
 * Returns a function that stops listening and cancels a waiting re-read.
 */
export function refreshWhenBackInView(refresh: () => void, options: Options = {}): () => void {
  // looked up each time they are used, not once here, so a replaced clock or random source is always honoured
  const { minGapMs = REFRESH_AFTER_MS, jitterMs = REFRESH_JITTER_MS, random = () => Math.random(), now = () => Date.now() } = options;
  let lastRefreshAt = now();
  let waiting: ReturnType<typeof setTimeout> | null = null;

  const consider = () => {
    if (waiting !== null) return;
    if (now() - lastRefreshAt < minGapMs) return;
    waiting = setTimeout(() => {
      waiting = null;
      lastRefreshAt = now();
      refresh();
    }, Math.floor(random() * jitterMs));
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') consider();
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', consider);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', consider);
    if (waiting !== null) clearTimeout(waiting);
    waiting = null;
  };
}
