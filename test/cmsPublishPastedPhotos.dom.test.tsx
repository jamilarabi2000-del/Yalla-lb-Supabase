// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_SITE_CONTENT } from '../src/data/cmsContent';

// A photo pasted into the site settings as text is downloaded by every visitor
// on every page view, shown or not (the live hero had two, 162 kB of a 185 kB
// download). The CMS had a button to move them, but Publish itself would still
// put them on the live page. Publish now saves them to storage first, and if one
// cannot be moved it asks before a heavy page goes live. The real upload code
// runs here, against a recording stand-in for Supabase Storage.
const shop: Record<string, any> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));

const storage = vi.hoisted(() => ({
  uploads: [] as { bucket: string; path: string; type: string; cacheControl: string; upsert: boolean }[],
  failOnUpload: 0,   // 1-based: fail this upload (and none other)
  failMessage: 'The storage service is unavailable',
}));
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, file: Blob, options: { cacheControl: string; contentType: string; upsert: boolean }) => {
          storage.uploads.push({ bucket, path, type: options.contentType, cacheControl: options.cacheControl, upsert: options.upsert });
          if (storage.failOnUpload === storage.uploads.length) return { error: { message: storage.failMessage, statusCode: '500' } };
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.example/${bucket}/${path}` } }),
      }),
    },
  },
}));

const none = () => null;
for (const tab of ['Visibility', 'Navbar', 'Footer', 'Products', 'ProductDetail', 'Checkout', 'Account', 'News', 'CustomBlocks', 'Seo', 'Theme']) {
  vi.doMock(`../src/components/admin/cms/CMS${tab}Tab`, () => ({ [`CMS${tab}Tab`]: none }));
}
vi.mock('../src/components/admin/cms/CMSLivePreview', () => ({ CMSLivePreview: none }));
vi.mock('../src/components/admin/cms/CMSGlobalSearch', () => ({ CMSGlobalSearch: none }));
vi.mock('../src/components/admin/cms/CMSVersionHistoryModal', () => ({ CMSVersionHistoryModal: none }));
vi.mock('../src/components/admin/cms/CMSHomeTab', () => ({ CMSHomeTab: none }));

const diff = vi.hoisted(() => ({ props: null as null | { onPublish: (sections?: string[]) => Promise<void> } }));
vi.mock('../src/components/admin/cms/CMSDiffModal', () => ({
  CMSDiffModal: (props: any) => { diff.props = props; return <div data-testid="diff-modal" />; },
}));
vi.mock('../src/components/admin/cms/CMSConfirmModal', () => ({
  CMSConfirmModal: ({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel }: any) => (
    <div data-testid="confirm" data-title={title}>
      <p data-testid="confirm-message">{message}</p>
      <button data-testid="confirm-yes" onClick={onConfirm}>{confirmLabel}</button>
      <button data-testid="confirm-no" onClick={onCancel}>{cancelLabel}</button>
    </div>
  ),
}));

const { PageCMSManager } = await import('../src/components/PageCMSManager');
const { findPastedImages } = await import('../src/lib/mediaUpload');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PHOTO_A = 'data:image/png;base64,iVBORw0KGgo=';
const PHOTO_B = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const DRAFT_KEY = 'yalla_cms_editor_draft_v1';
const BUCKET_URL = /^https:\/\/storage\.example\/yalla-media\/cms\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(png|jpg)$/;

const content = (hero: Record<string, unknown> = {}, navbar: Record<string, unknown> = {}) => ({
  ...DEFAULT_SITE_CONTENT,
  hero: { ...DEFAULT_SITE_CONTENT.hero, ...hero },
  navbar: { ...(DEFAULT_SITE_CONTENT as any).navbar, ...navbar },
});
// The order the CMS meets them in is the order it moves them in; the second one is the one that fails below.
const withPhotos = () => content(
  { bgImageUrl: PHOTO_A, bgMediaItems: [{ id: 'm1', url: PHOTO_A, type: 'image', title: 'Hero', isPublished: true }] },
  { logoUrl: PHOTO_B },
);

let host: HTMLDivElement;
let root: Root;
const $ = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const buttonWithText = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
const publish = async () => { await act(async () => { (buttonWithText('Publish') ?? buttonWithText('Save & Publish'))!.click(); }); await settle(); };
const answer = async (yes: boolean) => { await act(async () => { $<HTMLButtonElement>(yes ? '[data-testid="confirm-yes"]' : '[data-testid="confirm-no"]')!.click(); }); await settle(); };
const open = async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<PageCMSManager initialTab="home" />); });
  await settle();
};
const saved = () => (shop.updateSiteContent as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0]);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  storage.uploads.length = 0; storage.failOnUpload = 0; storage.failMessage = 'The storage service is unavailable';
  diff.props = null;
  for (const key of Object.keys(shop)) delete shop[key];
  Object.assign(shop, { siteContent: content(), updateSiteContent: vi.fn(async () => {}), showToast: vi.fn() });
});
afterEach(() => {
  try { act(() => root.unmount()); } catch { /* already gone */ }
  host?.remove();
  document.body.innerHTML = '';
});

describe('publishing a page with no pasted photo', () => {
  it('saves what is there, uploads nothing and asks nothing', async () => {
    await open();
    await publish();
    expect(storage.uploads).toHaveLength(0);
    expect($('[data-testid="confirm"]')).toBeNull();
    expect(saved()).toHaveLength(1);
    expect(saved()[0].hero.bgImageUrl).toBe(DEFAULT_SITE_CONTENT.hero.bgImageUrl);
  });
});

describe('publishing a page that holds pasted photos', () => {
  beforeEach(() => { shop.siteContent = withPhotos(); });

  it('saves each distinct photo to the storage bucket once, with the one-year cache and never overwriting', async () => {
    await open();
    await publish();
    expect(storage.uploads).toHaveLength(2);        // A is used twice but is one photo
    for (const upload of storage.uploads) {
      expect(upload.bucket).toBe('yalla-media');
      expect(upload.cacheControl).toBe('31536000');
      expect(upload.upsert).toBe(false);
    }
    expect(storage.uploads.map(u => u.type).sort()).toEqual(['image/jpeg', 'image/png']);
  });

  it('publishes the page with their new addresses everywhere, and no pasted photo left', async () => {
    await open();
    await publish();
    expect(saved()).toHaveLength(1);
    const page = saved()[0];
    expect(findPastedImages(page)).toEqual([]);
    expect(page.hero.bgImageUrl).toMatch(BUCKET_URL);
    expect(page.hero.bgMediaItems[0].url).toBe(page.hero.bgImageUrl);   // the same photo, the same new address
    expect(page.navbar.logoUrl).toMatch(BUCKET_URL);
    expect(page.navbar.logoUrl).not.toBe(page.hero.bgImageUrl);
    expect(shop.showToast).toHaveBeenCalledWith('CMS changes successfully published to the live storefront.', 'success');
  });

  it('leaves the editor showing the new addresses: nothing is offered to move, and nothing is left to publish', async () => {
    await open();
    expect(buttonWithText('Move 2 pasted photos to storage')).toBeDefined();
    await publish();
    expect(buttonWithText('pasted photo')).toBeUndefined();
    expect(buttonWithText('Discard')).toBeUndefined();
  });

  it('does not ask anything when every photo moves', async () => {
    await open();
    await publish();
    expect($('[data-testid="confirm"]')).toBeNull();
  });

  it('works the same from the keyboard shortcut', async () => {
    await open();
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })); });
    // the shortcut only publishes when there are unsaved edits; start one through a stored draft instead
    expect(saved()).toHaveLength(0);
    act(() => root.unmount()); host.remove();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ content: withPhotos(), activeTab: 'home', savedAt: new Date().toISOString() }));
    shop.siteContent = content();
    await open();
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })); });
    await settle();
    expect(storage.uploads).toHaveLength(2);
    expect(findPastedImages(saved()[0])).toEqual([]);
  });
});

describe('when a photo cannot be moved', () => {
  const [FIRST, SECOND] = findPastedImages(withPhotos());
  beforeEach(() => { shop.siteContent = withPhotos(); storage.failOnUpload = 2; });

  it('asks before publishing, says how many and why, and publishes nothing yet', async () => {
    await open();
    await publish();
    const question = $('[data-testid="confirm"]')!;
    expect(question).not.toBeNull();
    expect(question.getAttribute('data-title')).toBe('Some photos could not be moved to storage');
    expect($('[data-testid="confirm-message"]')!.textContent).toContain('1 of 2 photo(s)');
    expect($('[data-testid="confirm-message"]')!.textContent).toContain('The storage service is unavailable');
    expect($('[data-testid="confirm-yes"]')!.textContent).toBe('Publish anyway');
    expect($('[data-testid="confirm-no"]')!.textContent).toBe('Cancel');
    expect(saved()).toHaveLength(0);
  });

  it('shows a reason that ends in a full stop without doubling it', async () => {
    storage.failMessage = 'Please try again.';
    await open();
    await publish();
    expect($('[data-testid="confirm-message"]')!.textContent).toContain('(The image could not be uploaded: Please try again)');
    expect($('[data-testid="confirm-message"]')!.textContent).not.toContain('.)');
  });

  it('"Publish anyway" publishes with the photos that did move and the one that did not still pasted', async () => {
    await open();
    await publish();
    await answer(true);
    expect(saved()).toHaveLength(1);
    expect(findPastedImages(saved()[0])).toEqual([SECOND]);
    expect(JSON.stringify(saved()[0])).not.toContain(FIRST);
    expect($('[data-testid="confirm"]')).toBeNull();
  });

  it('"Cancel" publishes nothing, keeps what moved in the draft, and offers the rest again', async () => {
    await open();
    await publish();
    await answer(false);
    expect(saved()).toHaveLength(0);
    expect($('[data-testid="confirm"]')).toBeNull();
    expect(shop.showToast).toHaveBeenCalledWith('Not published. 1 photo(s) were moved to storage and are in your draft.', 'info');
    // the draft now holds the moved photo's address; the other is still offered for moving
    expect(buttonWithText('Move 1 pasted photo to storage')).toBeDefined();
    expect(buttonWithText('Discard')).toBeDefined();
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
    expect(findPastedImages(draft.content)).toEqual([SECOND]);
    expect(JSON.stringify(draft.content)).not.toContain(FIRST);
  });

  it('a first photo that fails leaves the live page and the draft exactly as they were', async () => {
    storage.failOnUpload = 1;
    await open();
    await publish();
    await answer(false);
    expect(saved()).toHaveLength(0);
    expect(shop.showToast).toHaveBeenCalledWith('Not published. Nothing was changed on the live page.', 'info');
    expect(buttonWithText('Move 2 pasted photos to storage')).toBeDefined();
    expect(buttonWithText('Discard')).toBeUndefined();
  });

  it('the button cannot be pressed again while the question is open', async () => {
    await open();
    await publish();
    expect((buttonWithText('Publishing...') ?? buttonWithText('Publish'))!.disabled).toBe(true);
  });

  it('leaving the studio with the question open publishes nothing', async () => {
    await open();
    await publish();
    act(() => root.unmount());
    await settle();
    expect(saved()).toHaveLength(0);
  });
});

describe('publishing only some sections', () => {
  it('moves the photos of the page being published, and leaves a photo that exists only in an unpublished draft section alone', async () => {
    // live page: no pasted photos. Draft: hero and navbar each hold one.
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ content: withPhotos(), activeTab: 'home', savedAt: new Date().toISOString() }));
    await open();
    await act(async () => { buttonWithText('Diff')!.click(); });
    await act(async () => { await diff.props!.onPublish(['hero']); });
    await settle();
    expect(storage.uploads).toHaveLength(1);                       // only the hero's photo
    expect(storage.uploads[0].type).toBe('image/png');
    expect(saved()).toHaveLength(1);
    expect(findPastedImages(saved()[0])).toEqual([]);
    expect(saved()[0].hero.bgImageUrl).toMatch(BUCKET_URL);
    expect(saved()[0].navbar.logoUrl).toBe((DEFAULT_SITE_CONTENT as any).navbar.logoUrl);   // the live navbar, untouched
    // the navbar's pasted photo is still in the draft, still to be moved
    expect(buttonWithText('Move 1 pasted photo to storage')).toBeDefined();
  });
});

describe('the button that moves photos by hand', () => {
  beforeEach(() => { shop.siteContent = withPhotos(); });

  it('still moves them into the draft only, and publishes nothing', async () => {
    await open();
    await act(async () => { buttonWithText('Move 2 pasted photos to storage')!.click(); });
    await settle();
    expect(storage.uploads).toHaveLength(2);
    expect(saved()).toHaveLength(0);
    expect(buttonWithText('pasted photo')).toBeUndefined();
    expect(buttonWithText('Discard')).toBeDefined();
    expect(shop.showToast).toHaveBeenCalledWith('Moved 2 photo(s) to storage. Click Publish Changes to make it live.', 'success');
  });

  it('reports a failure with how many moved', async () => {
    storage.failOnUpload = 2;
    await open();
    await act(async () => { buttonWithText('Move 2 pasted photos to storage')!.click(); });
    await settle();
    expect(shop.showToast).toHaveBeenCalledWith(expect.stringContaining('Moved 1 of 2 photo(s):'), 'error');
    expect(buttonWithText('Move 1 pasted photo to storage')).toBeDefined();
  });
});
