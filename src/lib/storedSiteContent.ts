import type { SiteContent } from '../types';

/**
 * The shop's settings as an earlier visit (or a CMS preview draft) left them in
 * this browser, or null on a first visit: nothing stored, nothing readable, or
 * the browser does not allow storage.
 *
 * The page uses the answer to tell a returning visitor, who can show the real
 * banner at once, from a first-time one, whose page has only the built-in
 * placeholder content until the server answers.
 */
export const SITE_CONTENT_STORAGE_KEY = 'yallalb_site_content';
export const CMS_PREVIEW_STORAGE_KEY = 'yalla_cms_preview';

/** A placeholder block an older version saved; it must not come back from the cache. */
const RETIRED_BLOCK_ID = 'heritage-diaspora-banner';

const isSettings = (value: unknown): value is SiteContent =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function readStoredSiteContent(): SiteContent | null {
  try {
    if (typeof window === 'undefined') return null;

    if (new URLSearchParams(window.location.search).get('cmsPreview') === '1') {
      try {
        const draft = sessionStorage.getItem(CMS_PREVIEW_STORAGE_KEY);
        const parsedDraft: unknown = draft ? JSON.parse(draft) : null;
        if (isSettings(parsedDraft)) return parsedDraft;
      } catch {
        // An unreadable draft is skipped: the saved settings are the better fallback.
      }
    }

    const saved = localStorage.getItem(SITE_CONTENT_STORAGE_KEY);
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    if (!isSettings(parsed)) return null;
    if (Array.isArray(parsed.customBlocks)) {
      parsed.customBlocks = parsed.customBlocks.filter(block => block.id !== RETIRED_BLOCK_ID);
    }
    return parsed;
  } catch {
    return null;
  }
}
