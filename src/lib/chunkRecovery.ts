/**
 * App files under /assets are cached by the browser for a year (vercel.json):
 * their names change whenever their content does, so a name never goes stale.
 *
 * One case needs help. A tab opened before a deploy asks for a file the new
 * deploy no longer has and is told "not found". If that same file comes back
 * later (a rollback), the browser could keep the "not found" it was given.
 * Before the page reloads, fetch the failed file once past the cache so the
 * reload gets the real one.
 *
 * Chrome, Edge and Firefox name the file in the import error; Safari does not,
 * and then this does nothing and the page reloads as before.
 */

const CHUNK_URL = /https?:\/\/[^\s'"()]+\/assets\/[^\s'"()]+\.js/;

/** The same-origin /assets/*.js file named in an import error, if any. */
export function failedChunkUrl(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = CHUNK_URL.exec(message);
  if (!match || typeof window === 'undefined') return null;
  try {
    const url = new URL(match[0]);
    // Never fetch anything but this site's own files.
    return url.origin === window.location.origin ? url.href : null;
  } catch {
    return null;
  }
}

/** Replace the browser's cached copy of the failed file with a fresh answer. */
export async function refreshFailedChunk(error: unknown, fetchImpl: typeof fetch = fetch): Promise<void> {
  const url = failedChunkUrl(error);
  if (!url) return;
  try {
    await fetchImpl(url, { cache: 'reload' });
  } catch {
    // Offline or blocked: the reload that follows behaves as it always did.
  }
}
