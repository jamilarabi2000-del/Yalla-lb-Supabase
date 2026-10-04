// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { phoneHeroPreload } from '../src/lib/earlyHero';

// The picture named from the settings before the app has started is downloaded for nothing
// unless it is the very file the banner then asks for. This renders the real banner on a
// phone for a range of settings and compares.
const shop: Record<string, unknown> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
const { HomeTopContainer } = await import('../src/components/HomeTopContainer');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeAll(() => {
  // a phone: nothing is wide
  window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); vi.stubGlobal('Image', class { src = ''; srcset = ''; sizes = ''; fetchPriority = ''; decoding = ''; }); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const UNSPLASH = 'https://images.unsplash.com/photo-1544816155?auto=format&fit=crop&q=80&w=2000';
const STORED = 'https://abc.supabase.co/storage/v1/object/public/yalla-media/cms/2026/10/aaaa-1600.webp#w=480,960,1600';
const item = (extra: Record<string, unknown> = {}) => ({ id: 'a', type: 'image', url: UNSPLASH, isPublished: true, ...extra });
const draw = (content: object) => {
  Object.assign(shop, {
    language: 'en', setActiveTab: vi.fn(), setSelectedCategory: vi.fn(), showToast: vi.fn(), productBundles: [], isVisualEditMode: false,
    addBundleToCart: vi.fn(), openProductDetail: vi.fn(), products: [], addToCart: vi.fn(), formatPrice: (n: number) => `$${n}`,
    siteContentReady: true, siteContent: content,
  });
  act(() => root.render(<HomeTopContainer />));
  return host.querySelector('img[fetchpriority="high"]') as HTMLImageElement | null;
};

const future = '2999-01-01T00:00:00Z';
const CASES: Record<string, object> = {
  'one slide': { hero: { bgMediaItems: [item()] } },
  'a stored upload with its own widths': { hero: { bgMediaItems: [item({ url: STORED })] } },
  'a slide with its own phone picture': { hero: { bgMediaItems: [item({ mobileUrl: 'https://i.ibb.co/m.png' })] } },
  'a phone picture under the other name': { hero: { bgMediaItems: [item({ mobileImageUrl: UNSPLASH.replace('1544816155', '999') })] } },
  'the desktop picture under another name': { hero: { bgMediaItems: [item({ url: undefined, desktopImageUrl: 'https://i.ibb.co/d.png' })] } },
  'the page\'s background picture as the slide\'s': { hero: { bgImageUrl: 'https://i.ibb.co/bg.png', bgMediaItems: [item({ url: undefined })] } },
  'several slides on the air: the first one': { hero: { bgMediaItems: [item({ id: 'one', url: 'https://i.ibb.co/one.png' }), item({ id: 'two', url: 'https://i.ibb.co/two.png' }), item({ id: 'three', url: STORED })] } },
  'the first slide is off, the second is shown': { hero: { bgMediaItems: [item({ isPublished: false, url: 'https://i.ibb.co/off.png' }), item({ id: 'b', url: STORED })] } },
  'the first slide has not started': { hero: { bgMediaItems: [item({ scheduleActive: true, startDate: future, url: 'https://i.ibb.co/later.png' }), item({ id: 'b', url: 'https://i.ibb.co/now.png' })] } },
  'the first slide is over': { hero: { bgMediaItems: [item({ scheduleActive: true, endDate: '2001-01-01T00:00:00Z', url: 'https://i.ibb.co/over.png' }), item({ id: 'b', url: UNSPLASH })] } },
  'no list: a background and a phone picture': { hero: { bgImageUrl: 'https://i.ibb.co/bg.png', mobileImageUrl: 'https://i.ibb.co/phone.png' } },
  'no list: a background only': { hero: { bgImageUrl: UNSPLASH } },
  'no list: a desktop picture only': { hero: { desktopImageUrl: STORED } },
  'an empty list and a background': { hero: { bgImageUrl: 'https://i.ibb.co/bg.png', bgMediaItems: [] } },
  'every slide off, a background': { hero: { bgImageUrl: 'https://i.ibb.co/bg.png', bgMediaItems: [item({ isPublished: false })] } },
};

describe('what is named early is what the banner asks for, on a phone', () => {
  for (const [name, content] of Object.entries(CASES)) {
    it(name, () => {
      const preload = phoneHeroPreload(content)!;
      expect(preload, 'something is named').not.toBeNull();
      const picture = draw(content)!;
      expect(picture, 'the banner draws a picture').not.toBeNull();
      expect(picture.getAttribute('src')).toBe(preload.href);
      expect(picture.getAttribute('srcset')).toBe(preload.imagesrcset ?? null);
      expect(picture.getAttribute('sizes')).toBe(preload.imagesizes ?? null);
      expect(picture.getAttribute('referrerpolicy')).toBe('no-referrer');
    });
  }
});

describe('where nothing is named, the banner does not ask for a picture from outside either', () => {
  it('a first slide that is a video', () => {
    const content = { hero: { bgMediaItems: [item({ type: 'video', url: 'https://cdn.example.com/v.mp4' })] } };
    expect(phoneHeroPreload(content)).toBeNull();
    expect(draw(content)).toBeNull();
    expect(host.querySelector('video')).not.toBeNull();
  });

  it('nothing set: the built-in photo, a file of the app\'s own', () => {
    const content = { hero: { title: 'T' } };
    expect(phoneHeroPreload(content)).toBeNull();
    const picture = draw(content)!;
    expect(picture.getAttribute('src')).not.toMatch(/^https?:/);
  });
});
