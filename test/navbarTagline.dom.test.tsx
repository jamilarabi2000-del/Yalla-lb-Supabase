// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

// The header drew the brand name and nothing under it. It now draws the tagline from the Navbar settings.
const ctx = vi.hoisted(() => ({ shop: {} as any }));
vi.mock('../src/context/ShopContext', () => ({ useShop: () => ctx.shop }));
const { Navbar } = await import('../src/components/Navbar');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const setUp = (navbar: Record<string, unknown>, language: 'en' | 'ar' = 'en') => {
  ctx.shop = {
    activeTab: 'home', setActiveTab: vi.fn(), cartCount: 0, setIsCartOpen: vi.fn(), wishlist: [],
    searchQuery: '', setSearchQuery: vi.fn(), logSearchQuery: vi.fn(), setSelectedCategory: vi.fn(),
    language, setLanguage: vi.fn(), t: (key: string) => key, isAdminUser: false, authUser: null, user: null,
    siteContent: { navbar: { brandName: 'Yalla', ...navbar }, visibility: {} }, categories: [],
  };
};
const render = async () => { await act(async () => { root.render(<Navbar />); }); };
const tagline = () => document.getElementById('brand-tagline');

beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('the header', () => {
  it('shows the English tagline under the brand name', async () => {
    setUp({ brandSubtitle: 'Lebanese Artisanal Marketplace', brandSubtitleArabic: 'السوق اللبناني' });
    await render();
    expect(tagline()?.textContent).toBe('Lebanese Artisanal Marketplace');
    const name = Array.from(document.querySelectorAll('header span')).find(el => el.textContent === 'Yalla')!;
    expect(name.parentElement).toBe(tagline()!.parentElement);
    expect(name.compareDocumentPosition(tagline()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the Arabic tagline in Arabic, and the English one when there is no Arabic one', async () => {
    setUp({ brandSubtitle: 'Lebanese Artisanal Marketplace', brandSubtitleArabic: 'السوق اللبناني' }, 'ar');
    await render();
    expect(tagline()?.textContent).toBe('السوق اللبناني');
    act(() => root.unmount());
    root = createRoot(host);
    setUp({ brandSubtitle: 'Lebanese Artisanal Marketplace' }, 'ar');
    await render();
    expect(tagline()?.textContent).toBe('Lebanese Artisanal Marketplace');
  });

  it('draws nothing under the brand name when the tagline is empty', async () => {
    setUp({ brandSubtitle: '', brandSubtitleArabic: '' });
    await render();
    expect(tagline()).toBeNull();
  });

  it('shows no Arabic text to English visitors when the English tagline is cleared', async () => {
    setUp({ brandSubtitle: '', brandSubtitleArabic: 'السوق اللبناني' });
    await render();
    expect(tagline()).toBeNull();
  });

  it('keeps the full text in a tooltip for when it is cut off, and escapes what the admin typed', async () => {
    setUp({ brandSubtitle: '<img src=x onerror=alert(1)> Fine & dandy' });
    await render();
    expect(tagline()?.getAttribute('title')).toBe('<img src=x onerror=alert(1)> Fine & dandy');
    expect(tagline()?.textContent).toBe('<img src=x onerror=alert(1)> Fine & dandy');
    expect(document.querySelector('header img[src="x"]')).toBeNull();
  });

  it('still shows the brand name and the logo', async () => {
    setUp({ brandSubtitle: 'Lebanese Artisanal Marketplace' });
    await render();
    expect(document.querySelector('header')?.textContent).toContain('Yalla');
    expect(document.querySelector('header img')).not.toBeNull();
  });
});

// The layout limits below were measured in real Chromium (320-1920px, English and Arabic): the header has only
// 40-90px free beside the brand name on a phone and is already tight from 768px, so the tagline takes only free
// room. If one of these changes, measure the header again before accepting it.
describe('the tagline never pushes the header around', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Navbar.tsx'), 'utf8');
  const classes = source.match(/id="brand-tagline"[^>]*className="([^"]+)"/)?.[1].split(/\s+/) ?? [];

  it('is cut off after two lines on a phone, one line on a small tablet, two lines beside the search box, one line on a wide screen', () => {
    for (const c of ['line-clamp-2', 'sm:line-clamp-1', 'md:line-clamp-2', '2xl:line-clamp-1']) expect(classes, c).toContain(c);
  });
  it('is held to a narrow column beside the search box, and wider again only on a wide screen, but still capped', () => {
    expect(classes).toContain('md:max-w-[112px]');
    expect(classes).toContain('2xl:max-w-[260px]');
  });
  it('is left out below 360px, where there is no room, and wraps even a long word', () => {
    expect(classes).toContain('max-[359px]:hidden');
    expect(classes).toContain('[overflow-wrap:anywhere]');
  });
  it('does not set display itself (a block display would switch the line limit off)', () => {
    expect(classes).not.toContain('block');
    expect(classes).not.toContain('flex');
  });
  it('lets the brand block give room back instead of staying a fixed width', () => {
    const block = source.match(/<div className="([^"]*cursor-pointer group[^"]*)"/)?.[1] ?? '';
    expect(block).not.toContain('flex-shrink-0');
  });
});
