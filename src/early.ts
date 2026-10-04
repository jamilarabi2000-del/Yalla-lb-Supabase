import { EARLY_MAX_AGE_MS, SETTINGS_REQUEST, earlyHeaders, earlyRequestUrl, earlyRequestUrls, sessionStorageKey } from './lib/earlyRequests';
import type { EarlyEntries } from './lib/earlyFetch';
import { phoneHeroPreload } from './lib/earlyHero';

/**
 * Runs from the page's <head>, ahead of the app's own code (a few hundred bytes
 * against ~250 kB), and starts the reads the page makes as it starts: its
 * settings, products, categories and so on. They used to begin only once the app
 * had downloaded and started, so a first visit waited for the code and then for
 * the data, one after the other; now they run side by side. The app picks the
 * answers up in lib/earlyFetch.ts.
 *
 * Only for a signed-out visitor, whose reads carry just the public key. Someone
 * signed in would not be able to use these answers, so nothing is started for them.
 * If anything here fails, nothing is lost: the app makes the same reads itself.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publicKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

function signedIn(url: string): boolean {
  try {
    return localStorage.getItem(sessionStorageKey(url)) !== null;
  } catch {
    return true;   // storage is unavailable: say nothing, start nothing
  }
}

if (supabaseUrl && publicKey && typeof fetch === 'function' && !signedIn(supabaseUrl)) {
  try {
    const entries: EarlyEntries = new Map();
    const startedAt = Date.now();
    for (const address of earlyRequestUrls(supabaseUrl)) {
      entries.set(address, {
        startedAt,
        response: fetch(address, { headers: earlyHeaders(publicKey) }).catch(() => null),
      });
    }
    window.__yallaEarly = entries;
    // On a phone, the banner's picture starts downloading as soon as the settings say which it is.
    if (typeof matchMedia === 'function' && !matchMedia('(min-width: 768px)').matches) {
      const settings = entries.get(earlyRequestUrl(supabaseUrl, SETTINGS_REQUEST));
      settings?.response.then(response => (response && response.ok ? response.clone().json() : null)).then(rows => {
        const preload = phoneHeroPreload(Array.isArray(rows) ? rows[0]?.content : null);
        if (!preload) return;
        // The same request the banner's <img> will make: no crossorigin, and no referrer, like its referrerPolicy.
        const link = document.createElement('link');
        link.setAttribute('rel', 'preload');
        link.setAttribute('as', 'image');
        link.setAttribute('href', preload.href);
        if (preload.imagesrcset) { link.setAttribute('imagesrcset', preload.imagesrcset); link.setAttribute('imagesizes', preload.imagesizes || '100vw'); }
        link.setAttribute('fetchpriority', 'high');
        link.setAttribute('referrerpolicy', 'no-referrer');
        document.head.appendChild(link);
      }).catch(() => {});
    }
    // Whatever the app has not picked up by then is let go.
    setTimeout(() => entries.clear(), EARLY_MAX_AGE_MS);
  } catch {
    // nothing started; the app makes its own reads
  }
}
