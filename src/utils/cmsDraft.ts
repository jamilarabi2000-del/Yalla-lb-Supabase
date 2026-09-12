import { SiteContent } from '../types';

export interface CmsDraft {
  content: SiteContent;
  activeTab?: string;
  savedAt: string;
}

const DRAFT_STORAGE_KEY = 'yalla_cms_editor_draft_v1';
const PREVIEW_SESSION_KEY = 'yalla_cms_preview';

/**
 * Loads the active CMS editor draft from localStorage.
 */
export const loadCmsDraft = (): CmsDraft | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.content) {
      return parsed as CmsDraft;
    }
  } catch (err) {
    console.warn('[cmsDraft] Failed to load draft:', err);
  }
  return null;
};

/**
 * Saves the in-progress CMS form to localStorage (for durability)
 * and sessionStorage (for iframe live preview communication).
 */
export const saveCmsDraft = (content: SiteContent, activeTab?: string): string => {
  const savedAt = new Date().toISOString();
  if (typeof window === 'undefined') return savedAt;
  try {
    const draft: CmsDraft = {
      content,
      activeTab,
      savedAt
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    // Mirror to sessionStorage so newly opened/reloaded preview iframes immediately have the draft
    try {
      sessionStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(content));
    } catch {}
  } catch (err) {
    console.error('[cmsDraft] Failed to save draft to localStorage:', err);
  }
  return savedAt;
};

/**
 * Clears the persisted CMS draft after publishing or discarding.
 */
export const clearCmsDraft = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    sessionStorage.removeItem(PREVIEW_SESSION_KEY);
  } catch (err) {
    console.warn('[cmsDraft] Failed to clear draft:', err);
  }
};

/**
 * Formats a timestamp into human-readable relative age (e.g. "just now", "4 min ago").
 */
export const formatDraftAge = (savedAt: string | null | undefined): string => {
  if (!savedAt) return 'just now';
  try {
    const then = new Date(savedAt).getTime();
    const now = Date.now();
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));

    if (diffSec < 45) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;
    return new Date(savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'recently';
  }
};
