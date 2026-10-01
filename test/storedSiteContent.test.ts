// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CMS_PREVIEW_STORAGE_KEY, SITE_CONTENT_STORAGE_KEY, readStoredSiteContent } from '../src/lib/storedSiteContent';

// The page needs to know whether the settings in front of it are the shop's own
// (kept by an earlier visit) or only the built-in placeholder (a first visit),
// because the placeholder's stock photos should not be downloaded.
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('a first visit', () => {
  it('has nothing stored', () => {
    expect(readStoredSiteContent()).toBeNull();
  });

  it.each(['', 'not json', '[]', '5', '"text"', 'null', 'true'])('does not take %j for settings', raw => {
    localStorage.setItem(SITE_CONTENT_STORAGE_KEY, raw);
    expect(readStoredSiteContent()).toBeNull();
  });

  it('is what a browser that refuses storage looks like', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(readStoredSiteContent()).toBeNull();
  });
});

describe('a returning visit', () => {
  const saved = { hero: { title: 'Real title' }, customBlocks: [{ id: 'keep-me' }, { id: 'heritage-diaspora-banner' }] };

  it('returns what the earlier visit saved', () => {
    localStorage.setItem(SITE_CONTENT_STORAGE_KEY, JSON.stringify({ hero: { title: 'Real title' } }));
    expect(readStoredSiteContent()).toEqual({ hero: { title: 'Real title' } });
  });

  it('leaves out the retired placeholder block, and keeps the others', () => {
    localStorage.setItem(SITE_CONTENT_STORAGE_KEY, JSON.stringify(saved));
    expect(readStoredSiteContent()).toEqual({ hero: { title: 'Real title' }, customBlocks: [{ id: 'keep-me' }] });
  });
});

describe('a CMS preview', () => {
  const draft = { hero: { title: 'Draft title' } };

  it('shows the draft the editor passed along', () => {
    window.history.replaceState(null, '', '/?cmsPreview=1');
    sessionStorage.setItem(CMS_PREVIEW_STORAGE_KEY, JSON.stringify(draft));
    localStorage.setItem(SITE_CONTENT_STORAGE_KEY, JSON.stringify({ hero: { title: 'Saved title' } }));
    expect(readStoredSiteContent()).toEqual(draft);
  });

  it('ignores a draft left behind when this is not a preview', () => {
    sessionStorage.setItem(CMS_PREVIEW_STORAGE_KEY, JSON.stringify(draft));
    expect(readStoredSiteContent()).toBeNull();
  });

  it('falls back to the saved settings when the draft is unreadable', () => {
    window.history.replaceState(null, '', '/?cmsPreview=1');
    sessionStorage.setItem(CMS_PREVIEW_STORAGE_KEY, '{broken');
    localStorage.setItem(SITE_CONTENT_STORAGE_KEY, JSON.stringify({ hero: { title: 'Saved title' } }));
    expect(readStoredSiteContent()).toEqual({ hero: { title: 'Saved title' } });
  });
});
