// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// The home slider keeps every slide in the page and shows one. The others were hidden from screen readers
// (aria-hidden) but their buttons could still be reached with the Tab key: focus went to something invisible, and a
// hidden control inside an aria-hidden block is a failure on every accessibility audit. A hidden slide is now inert:
// not focusable, not clickable, not read out.
const ctx = vi.hoisted(() => ({ shop: {} as any }));
vi.mock('../src/context/ShopContext', () => ({ useShop: () => ctx.shop }));

const { HomepagePromoSlider } = await import('../src/components/HomepagePromoSlider');
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});

const product = (id: string, name: string) => ({
  id, name, arabicName: name, artisan: 'Farm', seller: 'Farm', brand: '', category: 'c1', origin: 'Chouf', priceUSD: 5, stock: 9,
  image: '/p.jpg', images: [], description: 'Fresh', tags: [], keywords: [], arabicKeywords: [], isPublished: true,
});
const slide = (id: string, productId: string, order: number) => ({ id, order, type: 'product_promotion', isPublished: true, selectedProductId: productId });

let host: HTMLDivElement;
let root: Root;
const open = async (transitionEffect: string) => {
  ctx.shop = {
    language: 'en', t: (k: string) => k, formatPrice: (n: number) => `$${n}`, setSelectedProductForModal: vi.fn(), openProductDetail: vi.fn(),
    addToCart: vi.fn(), toggleWishlist: vi.fn(), isInWishlist: () => false, showToast: vi.fn(), cart: [], categories: [], sellers: [],
    goBack: vi.fn(), setActiveTab: vi.fn(), setSelectedCategory: vi.fn(), isVisualEditMode: false,
    products: [product('p1', 'Zaatar'), product('p2', 'Honey'), product('p3', 'Olive oil')],
    siteContent: { visibility: {}, promoBanner: { enabled: true, showArrows: true, showDots: true, transitionEffect, slides: [slide('s1', 'p1', 1), slide('s2', 'p2', 2), slide('s3', 'p3', 3)] } },
  };
  await act(async () => { root.render(<HomepagePromoSlider layout="slider" />); });
};
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });

describe.each([['slide', 'slide'], ['fade', 'fade']])('home slider, %s transition', (_label, effect) => {
  it('hides all but one slide, and every hidden slide is inert', async () => {
    await open(effect);
    const hidden = [...host.querySelectorAll('[aria-hidden="true"]')].filter(el => el.querySelector('button, a, [tabindex]'));
    expect(hidden.length).toBe(2);
    for (const el of hidden) expect(el.hasAttribute('inert'), el.outerHTML.slice(0, 120)).toBe(true);
  });
  it('leaves the shown slide interactive', async () => {
    await open(effect);
    const shown = [...host.querySelectorAll('[aria-hidden="false"]')];
    expect(shown.length).toBe(1);
    expect(shown[0].hasAttribute('inert')).toBe(false);
    expect(shown[0].querySelector('button, a')).not.toBeNull();
  });
  it('no focusable control outside the shown slide can be reached', async () => {
    await open(effect);
    const reachable = [...host.querySelectorAll('button, a[href], [tabindex]')].filter(el => !el.closest('[inert]'));
    const shown = host.querySelector('[aria-hidden="false"]')!;
    const slideControls = reachable.filter(el => el.closest('[aria-hidden]'));
    for (const el of slideControls) expect(shown.contains(el), el.outerHTML.slice(0, 100)).toBe(true);
  });
});
