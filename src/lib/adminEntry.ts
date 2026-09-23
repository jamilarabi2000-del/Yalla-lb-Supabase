/**
 * The administrator console opens only at a private address.
 *
 * `/admin` is the first address anyone tries, so it now shows the same "page
 * not found" as any unknown page. The console answers only at a long random
 * address, and the code carries just the SHA-256 of it: reading the site's
 * JavaScript, which every visitor downloads, does not reveal the address.
 *
 * This keeps bots and passers-by away from the sign-in form. It is not what
 * protects the data -- that is the password, the authenticator code and the
 * database's own rules (SECURITY.md) -- so it only ever narrows who reaches
 * the form.
 *
 * To move the console to a new address, set VITE_ADMIN_ENTRY_SHA256 (the
 * SHA-256 hex of the new address, without the leading slash) in Vercel.
 */

const DEFAULT_ENTRY_SHA256 = '34d36d46643b221056e7de6ee60114810fea9085ea8975f83ebc2c371a83bf42';
const SHA256_HEX = /^[0-9a-f]{64}$/;
const STORAGE_KEY = 'yalla.adminEntry';

const configured = String(import.meta.env.VITE_ADMIN_ENTRY_SHA256 ?? '').trim().toLowerCase();

export const ADMIN_ENTRY_SHA256 = SHA256_HEX.test(configured) ? configured : DEFAULT_ENTRY_SHA256;

/** The address as it sits in the URL: one path segment, no slashes. */
const entrySegment = (path: string) => path.replace(/^\/+|\/+$/g, '');

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** Whether `path` (e.g. location.pathname) is the private console address. */
export async function isAdminEntryPath(path: string): Promise<boolean> {
  const segment = entrySegment(path);
  // Short or structured paths are ordinary pages; skip the hash for them.
  if (segment.length < 16 || segment.length > 128 || segment.includes('/')) return false;
  if (typeof crypto === 'undefined' || !crypto.subtle) return false;
  return (await sha256Hex(segment)) === ADMIN_ENTRY_SHA256;
}

/**
 * The console address this tab was opened at, so the address bar can show it
 * again after a visit to the storefront. Kept for the tab only.
 */
export function rememberAdminEntry(path: string): void {
  try { sessionStorage.setItem(STORAGE_KEY, '/' + entrySegment(path)); } catch { /* storage unavailable */ }
}

export function rememberedAdminEntry(): string | null {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    return value && value.length > 1 ? value : null;
  } catch {
    return null;
  }
}
