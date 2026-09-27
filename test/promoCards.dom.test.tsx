// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

// On phones and tablets the promo banner sat under the hero as a second
// one-slide-at-a-time slider. Below 1024px it is now a row of image cards the
// shopper swipes; the hero keeps its height, and from 1024px the slider beside
// the hero is unchanged.
const shop: Record<string, unknown> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
const { HomepagePromoSlider } = await import('../src/components/HomepagePromoSlider');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let wide = false;
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query === '(min-width: 1024px)' ? wide : false,
    media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});

const soap = { id: 'p-soap', name: 'Laurel Soap', arabicName: 'صابون غار', image: 'https://img.example.com/soap.jpg', priceUSD: 6.5 };
const SLIDES = [
  { id: 'partner', order: 1, type: 'image_only', isPublished: true, badge: 'Partner', titleArabic: 'شريكنا', imageUrl: 'https://i.ibb.co/partner.png', imageFit: 'fill', ctaUrl: 'https://maps.app.goo.gl/x' },
  { id: 'hidden', order: 2, type: 'custom', isPublished: false, title: 'Draft', imageUrl: 'https://i.ibb.co/draft.png', ctaUrl: '/products' },
  { id: 'special', order: 3, type: 'custom', isPublished: true, badge: 'New Promotion', badgeArabic: 'عرض جديد', title: 'Lebanese Artisanal Special', titleArabic: 'عرض الحرف اللبنانية', imageUrl: 'https://i.ibb.co/special.png', imageFit: 'contain', ctaUrl: '/products', ctaText: 'Shop now' },
  { id: 'product', order: 4, type: 'product_promotion', isPublished: true, selectedProductId: 'p-soap' },
  { id: 'still', order: 5, type: 'image_only', isPublished: true, title: 'Just a photo', imageUrl: 'https://i.ibb.co/still.png' },
  { id: 'words', order: 6, type: 'text_only', isPublished: true, bgStyle: 'dark', badge: 'Note', title: 'Free delivery this week' },
];

let host: HTMLDivElement;
let root: Root;
const setActiveTab = vi.fn();
const setSelectedCategory = vi.fn();
const openProductDetail = vi.fn();

const show = (slides: unknown[], language = 'en') => {
  Object.assign(shop, {
    siteContent: { promoBanner: { enabled: true, showArrows: true, showDots: true, slides } },
    language, setActiveTab, setSelectedCategory, openProductDetail,
    products: [soap], addToCart: vi.fn(), showToast: vi.fn(), isVisualEditMode: false,
    formatPrice: (usd: number) => `$${usd.toFixed(2)}`,
  });
  act(() => root.render(<HomepagePromoSlider />));
};
const items = () => [...host.querySelectorAll('[role="listitem"]')] as HTMLElement[];
const card = (name: string) => items().find(i => i.textContent?.includes(name))!;

beforeEach(() => {
  wide = false;
  vi.clearAllMocks();
  window.open = vi.fn() as typeof window.open;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('phones and tablets: a row of image cards', () => {
  it('shows every live slide as a card, and no slider controls', () => {
    show(SLIDES);
    expect(host.querySelector('[role="list"]')?.className).toContain('overflow-x-auto snap-x snap-mandatory');
    expect(items()).toHaveLength(5);
    expect(host.textContent).not.toContain('Draft');
    expect(host.querySelector('[aria-label="Next slide"]')).toBeNull();
    expect(host.querySelector('[aria-label^="Go to slide"]')).toBeNull();
  });

  it('puts the badge and title over the photo, and waits to load photos until near', () => {
    show(SLIDES);
    const special = card('Lebanese Artisanal Special');
    expect(special.textContent).toContain('New Promotion');
    const img = special.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.className).toContain('object-contain');
    for (const i of host.querySelectorAll('img')) expect(i.getAttribute('loading')).toBe('lazy');
  });

  it('opens what the slide opens', () => {
    show(SLIDES);
    act(() => card('Partner').querySelector('button')!.click());
    expect(window.open).toHaveBeenCalledWith('https://maps.app.goo.gl/x', '_blank', 'noopener,noreferrer');

    act(() => card('Lebanese Artisanal Special').querySelector('button')!.click());
    expect(setSelectedCategory).toHaveBeenCalledWith('all');
    expect(setActiveTab).toHaveBeenCalledWith('products');

    const product = card('Laurel Soap');
    expect(product.textContent).toContain('$6.50');
    act(() => product.querySelector('button')!.click());
    expect(openProductDetail).toHaveBeenCalledWith(soap);
  });

  it('a slide with nowhere to go is a plain card', () => {
    show(SLIDES);
    expect(card('Just a photo').querySelector('button')).toBeNull();
  });

  it('a slide without a photo is a text card in its colours', () => {
    show(SLIDES);
    const words = card('Free delivery this week');
    expect(words.querySelector('img')).toBeNull();
    expect(words.querySelector('button')).toBeNull(); // no link and no button text: nothing to open
    expect((words.firstElementChild as HTMLElement).className).toContain('bg-[#111111]');
  });

  it('one card fills the row; two share it; three or more let the next one peek', () => {
    show([SLIDES[0]]);
    expect(items()[0].className).toContain('w-full');
    show([SLIDES[0], SLIDES[2]]);
    expect(items()[0].className).toContain('w-[72%] sm:w-[calc(50%-6px)]');
    show(SLIDES);
    expect(items()[0].className).toContain('w-[72%] sm:w-[46%]');
  });

  it('reads in Arabic', () => {
    show(SLIDES, 'ar');
    expect(host.querySelector('[role="list"]')?.getAttribute('aria-label')).toBe('العروض');
    expect(card('عرض الحرف اللبنانية').textContent).toContain('عرض جديد');
    expect(card('صابون غار')).toBeDefined();
  });
});

describe('from 1024px: the slider beside the hero, as before', () => {
  it('keeps the slider and its controls', () => {
    wide = true;
    show(SLIDES);
    expect(host.querySelector('[role="list"]')).toBeNull();
    expect(host.querySelector('[aria-label="Next slide"]')).not.toBeNull();
    expect(host.querySelectorAll('[aria-label^="Go to slide"]')).toHaveLength(5);
  });
});

describe('what stays the same', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');

  it('the hero keeps its 200px / 260px phone height', () => {
    const hero = read('src/components/HomeTopContainer.tsx');
    expect(hero).toContain('shadow-sm group min-w-0 h-[200px] sm:h-[260px] md:h-[260px] lg:h-[400px] xl:h-[420px]');
  });

  it('only the slider runs the autoplay timer', () => {
    const promo = read('src/components/HomepagePromoSlider.tsx');
    expect(promo).toContain("const isWide = useMediaQuery('(min-width: 1024px)');");
    expect(promo).toContain('if (!isWide || slideCount <= 1 || isPaused || config?.autoplay === false) return;');
  });
});
