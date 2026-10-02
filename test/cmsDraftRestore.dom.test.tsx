// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_SITE_CONTENT } from '../src/data/cmsContent';

// CMS Studio keeps an unsaved draft in this browser. It used to be put back
// from an effect that a second effect then undid (the form still looked clean
// to it), and the autosave wrote the live settings over the stored draft:
// leaving the studio and coming back lost the edits while the screen still
// said "Draft autosaved". The tabs are stubbed; the home tab shows the hero
// title and can change it, which is all these tests need of the form.
const shop: Record<string, any> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));

const none = () => null;
vi.mock('../src/components/admin/cms/CMSVisibilityTab', () => ({ CMSVisibilityTab: none }));
vi.mock('../src/components/admin/cms/CMSNavbarTab', () => ({ CMSNavbarTab: none }));
vi.mock('../src/components/admin/cms/CMSFooterTab', () => ({ CMSFooterTab: none }));
vi.mock('../src/components/admin/cms/CMSProductsTab', () => ({ CMSProductsTab: none }));
vi.mock('../src/components/admin/cms/CMSProductDetailTab', () => ({ CMSProductDetailTab: none }));
vi.mock('../src/components/admin/cms/CMSCheckoutTab', () => ({ CMSCheckoutTab: none }));
vi.mock('../src/components/admin/cms/CMSAccountTab', () => ({ CMSAccountTab: none }));
vi.mock('../src/components/admin/cms/CMSNewsTab', () => ({ CMSNewsTab: none }));
vi.mock('../src/components/admin/cms/CMSCustomBlocksTab', () => ({ CMSCustomBlocksTab: none }));
vi.mock('../src/components/admin/cms/CMSSeoTab', () => ({ CMSSeoTab: none }));
vi.mock('../src/components/admin/cms/CMSThemeTab', () => ({ CMSThemeTab: none }));
vi.mock('../src/components/admin/cms/CMSLivePreview', () => ({ CMSLivePreview: none }));
vi.mock('../src/components/admin/cms/CMSGlobalSearch', () => ({ CMSGlobalSearch: none }));
vi.mock('../src/components/admin/cms/CMSDiffModal', () => ({ CMSDiffModal: none }));
vi.mock('../src/components/admin/cms/CMSVersionHistoryModal', () => ({ CMSVersionHistoryModal: none }));
vi.mock('../src/components/admin/cms/CMSConfirmModal', () => ({
  CMSConfirmModal: ({ confirmLabel, onConfirm }: any) => <button data-testid="confirm-discard" onClick={onConfirm}>{confirmLabel}</button>,
}));
vi.mock('../src/components/admin/cms/CMSHomeTab', () => ({
  CMSHomeTab: ({ heroData, onChangeHeroField }: any) => (
    <div>
      <span data-testid="hero-title">{heroData?.title}</span>
      <button data-testid="edit-title" onClick={() => onChangeHeroField('title', 'EDITED TITLE')}>edit</button>
    </div>
  ),
}));

const { PageCMSManager } = await import('../src/components/PageCMSManager');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DRAFT_KEY = 'yalla_cms_editor_draft_v1';
const withTitle = (title: string) => ({ ...DEFAULT_SITE_CONTENT, hero: { ...DEFAULT_SITE_CONTENT.hero, title } });
const storedDraft = () => JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
const putDraft = (title: string) => localStorage.setItem(DRAFT_KEY, JSON.stringify({ content: withTitle(title), activeTab: 'home', savedAt: new Date().toISOString() }));

let host: HTMLDivElement;
let root: Root;
const $ = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const title = () => $('[data-testid="hero-title"]')?.textContent;
const buttonWithText = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
const settle = () => act(async () => { await Promise.resolve(); });

const open = async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<PageCMSManager initialTab="home" />); });
  await settle();
};
const close = () => { act(() => root.unmount()); host.remove(); };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  for (const key of Object.keys(shop)) delete shop[key];
  Object.assign(shop, { siteContent: withTitle('PUBLISHED TITLE'), updateSiteContent: vi.fn(async () => {}), showToast: vi.fn() });
});

afterEach(() => {
  try { close(); } catch { /* already closed by the test */ }
  document.body.innerHTML = '';
});

describe('opening CMS Studio with an unsaved draft', () => {
  it('shows the draft, not the live settings, and says so', async () => {
    putDraft('DRAFT TITLE');
    await open();
    expect(title()).toBe('DRAFT TITLE');
    expect(host.textContent).toContain('Draft autosaved');
    expect(host.textContent).toContain('Unpublished edits pending');
  });

  it('leaves the stored draft as it was (the live settings must not be written over it)', async () => {
    putDraft('DRAFT TITLE');
    await open();
    await settle();
    expect(storedDraft().content.hero.title).toBe('DRAFT TITLE');
  });

  it('keeps edits when the administrator leaves the studio and comes back', async () => {
    await open();
    expect(title()).toBe('PUBLISHED TITLE');
    await act(async () => { $<HTMLButtonElement>('[data-testid="edit-title"]')!.click(); });
    await settle();
    expect(title()).toBe('EDITED TITLE');
    expect(storedDraft().content.hero.title).toBe('EDITED TITLE');

    close();
    await open();
    expect(title()).toBe('EDITED TITLE');
    expect(storedDraft().content.hero.title).toBe('EDITED TITLE');
  });
});

describe('opening CMS Studio with no draft', () => {
  it('shows the live settings and writes no draft', async () => {
    await open();
    expect(title()).toBe('PUBLISHED TITLE');
    expect(host.textContent).not.toContain('Draft autosaved');
    expect(host.textContent).toContain('Storefront synced');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('follows the live settings while the form is clean', async () => {
    await open();
    shop.siteContent = withTitle('PUBLISHED AGAIN');
    await act(async () => { root.render(<PageCMSManager initialTab="home" />); });
    await settle();
    expect(title()).toBe('PUBLISHED AGAIN');
  });

  it('does not follow the live settings once there are unsaved edits', async () => {
    await open();
    await act(async () => { $<HTMLButtonElement>('[data-testid="edit-title"]')!.click(); });
    shop.siteContent = withTitle('PUBLISHED AGAIN');
    await act(async () => { root.render(<PageCMSManager initialTab="home" />); });
    await settle();
    expect(title()).toBe('EDITED TITLE');
  });

  it('ignores a stored draft that has no content', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString() }));
    await open();
    expect(title()).toBe('PUBLISHED TITLE');
    expect(host.textContent).toContain('Storefront synced');
  });
});

describe('publishing and discarding a restored draft', () => {
  it('publishes the draft and clears it', async () => {
    putDraft('DRAFT TITLE');
    await open();
    await act(async () => { buttonWithText('Publish Changes')!.click(); });
    await settle();
    expect(shop.updateSiteContent).toHaveBeenCalledTimes(1);
    expect(shop.updateSiteContent.mock.calls[0][0].hero.title).toBe('DRAFT TITLE');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(host.textContent).toContain('Storefront synced');
  });

  it('discards the draft: the live settings come back and the stored draft is removed', async () => {
    putDraft('DRAFT TITLE');
    await open();
    await act(async () => { buttonWithText('Discard')!.click(); });
    await act(async () => { $<HTMLButtonElement>('[data-testid="confirm-discard"]')!.click(); });
    await settle();
    expect(title()).toBe('PUBLISHED TITLE');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(shop.updateSiteContent).not.toHaveBeenCalled();
  });
});
