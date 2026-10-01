// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

// A first-time visitor's page starts from built-in placeholder content (stock
// photos) until the server's settings arrive, and used to download those photos
// and then throw them away. The banner now waits behind a box of its own size,
// fetches the next slide's picture once the current one is in, and lets only the
// promo slide on show compete for bandwidth.
const shop: Record<string, unknown> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
const { HomeTopContainer } = await import('../src/components/HomeTopContainer');
const { HomepagePromoSlider } = await import('../src/components/HomepagePromoSlider');
const { NewsSection } = await import('../src/components/NewsSection');
const { CustomBlocksRenderer } = await import('../src/components/CustomBlocksRenderer');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const flags = { desktop: true, wide: true };
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query === '(min-width: 768px)' ? flags.desktop : query === '(min-width: 1024px)' ? flags.wide : false,
    media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  // The news slider scrolls its own row; jsdom has no such method.
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});

let host: HTMLDivElement;
let root: Root;
const preloads: Array<{ src: string; srcset: string; sizes: string; fetchPriority: string; decoding: string }> = [];
class FakeImage {
  src = ''; srcset = ''; sizes = ''; fetchPriority = ''; decoding = '';
  constructor() { preloads.push(this); }
}

beforeEach(() => {
  flags.desktop = true;
  flags.wide = true;
  preloads.length = 0;
  vi.stubGlobal('Image', FakeImage);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const photo = (id: string, order = 'q=80&w=2000') => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&${order}`;
const settings = (hero: object[], promo: object[] = [{ id: 'p1', order: 1, type: 'image_only', isPublished: true, title: 'Promo', imageUrl: photo('promo') }]) => ({
  hero: { title: 'Default title', slideInterval: 0, bgMediaItems: hero },
  promoBanner: { enabled: true, showArrows: true, showDots: true, slides: promo },
});
const show = (over: Record<string, unknown>, ui: React.ReactElement = <HomeTopContainer />) => {
  Object.assign(shop, {
    language: 'en', setActiveTab: vi.fn(), setSelectedCategory: vi.fn(), showToast: vi.fn(), productBundles: [],
    isVisualEditMode: false, addBundleToCart: vi.fn(), openProductDetail: vi.fn(), products: [], addToCart: vi.fn(),
    formatPrice: (n: number) => `$${n}`, ...over,
  });
  act(() => root.render(ui));
};
const heroPicture = () => host.querySelector('img[fetchpriority="high"]') as HTMLImageElement;
const loaded = (img: HTMLImageElement) => act(() => { img.dispatchEvent(new Event('load')); });
const next = () => act(() => { (host.querySelector('[aria-label="Next slide"]') as HTMLElement).click(); });

describe('a first visit: the built-in placeholder is not downloaded', () => {
  const HERO = [{ id: 'a', url: photo('hero'), isPublished: true }];

  it('shows a box of the banner\'s size and no picture while the settings are on their way', () => {
    show({ siteContentReady: false, siteContent: settings(HERO) });
    expect(host.querySelectorAll('img')).toHaveLength(0);
    const box = host.querySelector('[role="status"][aria-busy="true"]')!;
    expect(box.getAttribute('aria-label')).toBe('Loading');
    expect(box.innerHTML).toContain('h-[200px] sm:h-[260px]');
    expect(host.textContent).not.toContain('Default title');
    expect(host.querySelector('#homepage-content-slider')).toBeNull();
  });

  it('says so in Arabic too', () => {
    show({ siteContentReady: false, language: 'ar', siteContent: settings(HERO) });
    expect(host.querySelector('[role="status"]')!.getAttribute('aria-label')).toBe('جارٍ التحميل');
  });

  it('shows the real banner once the settings are in', () => {
    show({ siteContentReady: false, siteContent: settings(HERO) });
    expect(host.querySelectorAll('img')).toHaveLength(0);
    show({ siteContentReady: true, siteContent: settings([{ id: 'real', url: 'https://i.ibb.co/real/hero.jpg', isPublished: true }]) });
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(heroPicture().getAttribute('src')).toBe('https://i.ibb.co/real/hero.jpg');
    expect(host.querySelector('#homepage-content-slider')).not.toBeNull();
  });

  it('a returning visitor, whose browser kept the settings, sees the banner at once', () => {
    show({ siteContentReady: true, siteContent: settings(HERO) });
    expect(heroPicture().getAttribute('src')).toBe(photo('hero'));
  });

  it('counts a caller that does not know the flag as ready', () => {
    show({ siteContentReady: undefined, siteContent: settings(HERO) });
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(heroPicture()).not.toBeNull();
  });
});

describe('the next slide\'s picture is fetched ahead', () => {
  const THREE = [
    { id: 'a', url: photo('one'), mobileUrl: 'https://i.ibb.co/phone/one.png', isPublished: true },
    { id: 'b', url: photo('two'), mobileUrl: 'https://i.ibb.co/phone/two.png', isPublished: true },
    { id: 'c', url: 'https://i.ibb.co/wide/three.png', isPublished: true },
  ];

  it('waits for the current picture, then asks for the next one quietly, as the screen will want it', () => {
    show({ siteContentReady: true, siteContent: settings(THREE) });
    expect(preloads).toHaveLength(0); // the visible picture comes first
    loaded(heroPicture());
    expect(preloads).toHaveLength(1);
    expect(preloads[0]).toMatchObject({ src: photo('two'), fetchPriority: 'low', decoding: 'async' });
    // The same candidates and sizes the visible picture offers, so the same file is fetched.
    expect(preloads[0].srcset).toBe([480, 960, 1600].map(w => `https://images.unsplash.com/photo-two?auto=format&fit=crop&q=80&w=${w} ${w}w`).join(', '));
    expect(preloads[0].sizes).toBe('(min-width: 1100px) 710px, (min-width: 1024px) 64vw, 100vw');
  });

  it('asks only once for a picture', () => {
    show({ siteContentReady: true, siteContent: settings(THREE) });
    loaded(heroPicture());
    loaded(heroPicture());
    expect(preloads).toHaveLength(1);
  });

  it('does not fetch a picture again when the slides come round again', () => {
    show({ siteContentReady: true, siteContent: settings(THREE.slice(0, 2)) });
    loaded(heroPicture());   // on a: fetch b
    next();
    loaded(heroPicture());   // on b: fetch a
    next();
    loaded(heroPicture());   // back on a: b was fetched already
    next();
    loaded(heroPicture());   // back on b: so was a
    expect(preloads.map(p => p.src)).toEqual([photo('two'), photo('one')]);
  });

  it('keeps one slide ahead as the slides turn, and comes back round to the first', () => {
    show({ siteContentReady: true, siteContent: settings(THREE) });
    loaded(heroPicture());
    next();
    loaded(heroPicture());
    next();
    loaded(heroPicture());
    expect(preloads.map(p => p.src)).toEqual([photo('two'), 'https://i.ibb.co/wide/three.png', photo('one')]);
    // A picture that comes in one size has no candidates to offer.
    expect(preloads[1].srcset).toBe('');
  });

  it('a phone is given the phone picture', () => {
    flags.desktop = false;
    flags.wide = false;
    show({ siteContentReady: true, siteContent: settings(THREE) });
    loaded(heroPicture());
    expect(preloads[0].src).toBe('https://i.ibb.co/phone/two.png');
    expect(preloads[0].sizes).toBe('');
  });

  it('does nothing for a single slide, or for a video next', () => {
    show({ siteContentReady: true, siteContent: settings([THREE[0]]) });
    loaded(heroPicture());
    expect(preloads).toHaveLength(0);

    show({ siteContentReady: true, siteContent: settings([THREE[0], { id: 'v', type: 'video', url: 'https://x/clip.mp4', isPublished: true }]) });
    loaded(heroPicture());
    expect(preloads).toHaveLength(0);
  });
});

describe('the promo slider: only the slide on show competes for bandwidth', () => {
  const slides = ['one', 'two', 'three'].map((n, i) => ({
    id: `s${i}`, order: i + 1, type: 'image_only', isPublished: true, title: `Slide ${n}`, imageUrl: `https://i.ibb.co/p/${n}.jpg`,
  }));
  const priorities = () => [...host.querySelectorAll('#homepage-content-slider img')].map(i => i.getAttribute('fetchpriority'));

  it('gives the other slides a low priority, and follows the slide on show', () => {
    show({ siteContentReady: true, siteContent: { promoBanner: { enabled: true, showArrows: true, slides } } }, <HomepagePromoSlider layout="slider" />);
    expect(priorities()).toEqual([null, 'low', 'low']);
    next();
    expect(priorities()).toEqual(['low', null, 'low']);
  });

  it('leaves the phone cards as they were', () => {
    flags.wide = false;
    show({ siteContentReady: true, siteContent: { promoBanner: { enabled: true, slides } } }, <HomepagePromoSlider />);
    expect(priorities()).toEqual([null, null, null]);
  });
});

describe('the pictures further down wait for the real settings too', () => {
  const articles = ['one', 'two'].map(n => ({
    id: `n-${n}`, title: `Story ${n}`, excerpt: 'About it', tag: 'events', date: '1 Jan', readTime: '3 min', source: 'Press',
    imageUrl: photo(`news-${n}`, 'w=800&q=80'), isPublished: true,
  }));
  const news = (ready: unknown) => show({ siteContentReady: ready, siteContent: { newsSection: { title: 'News', articles } } }, <NewsSection />);
  const newsPictures = () => [...host.querySelectorAll('img')].filter(i => (i.getAttribute('src') || '').includes('photo-news-'));

  it('news cards show without their pictures until the settings are in, then with them', () => {
    news(false);
    expect(host.textContent).toContain('Story one'); // the cards themselves are there
    expect(newsPictures()).toHaveLength(0);
    news(true);
    expect(newsPictures()).toHaveLength(4); // a backdrop and a picture for each card
    expect(newsPictures().every(i => i.getAttribute('loading') === 'lazy')).toBe(true);
  });

  it('counts a caller that does not know the flag as ready', () => {
    news(undefined);
    expect(newsPictures()).toHaveLength(4);
  });

  const blocks = [{ id: 'b1', isPublished: true, targetPage: 'home', position: 'top', order: 1, bgStyle: 'custom_image', title: 'Block', imageUrl: photo('block') }];
  const blockPictures = (ready: unknown) => {
    show({ siteContentReady: ready, siteContent: { customBlocks: blocks } }, <CustomBlocksRenderer page="home" position="top" />);
    return host.querySelectorAll('img').length;
  };

  it('a block\'s background picture waits, and the block does not', () => {
    expect(blockPictures(false)).toBe(0);
    expect(host.textContent).toContain('Block');
    expect(blockPictures(true)).toBe(1);
    expect(blockPictures(undefined)).toBe(1);
  });
});

describe('how it is wired', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
  const context = read('src/context/ShopContext.tsx');

  it('the context starts from what the browser kept, and says whether that is the shop\'s own', () => {
    expect(context).toContain("import { readStoredSiteContent } from '../lib/storedSiteContent';");
    expect(context).toContain('const [storedSiteContent] = useState<SiteContent | null>(readStoredSiteContent);');
    expect(context).toContain('useState<SiteContent>(() => storedSiteContent ?? DEFAULT_SITE_CONTENT)');
    expect(context).toContain('useState<boolean>(() => storedSiteContent !== null)');
    expect(context.match(/^\s+siteContentReady,$/gm)).toHaveLength(2); // the value and its dependency list
  });

  it('never keeps the placeholder as if it were the shop\'s settings', () => {
    expect(context).toMatch(/if \(!siteContentReady\) return;\s+try \{\s+const isCmsPreview/);
    expect(context).toContain('}, [siteContent, siteContentReady]);');
  });

  it('applies the page content and the catalogue each when its own reads are in', () => {
    expect(context).toContain('const [categoriesRes, regionsRes, sellersRes, productsRes] = await catalogueReads;');
    expect(context).toContain('const [blocksRes, contentRes] = await cmsReads;');
    expect(context).toContain('await Promise.all([applyCatalogue(), applyCms()]);');
    expect(context).toContain('const failures = [...catalogueFailures, ...cmsFailures];');
  });

  it('is ready when the server answered or failed, and after a wait if it never does', () => {
    const cms = context.slice(context.indexOf('const applyCms = async () => {'), context.indexOf('await Promise.all([applyCatalogue(), applyCms()]);'));
    expect(cms).toContain('setSiteContentReady(true);');
    expect(context).toContain('const SETTINGS_WAIT_MS = 10000;');
    expect(context).toMatch(/const settingsTimer = setTimeout\(\(\) => \{\s+if \(isMounted\) setSiteContentReady\(true\);\s+\}, SETTINGS_WAIT_MS\);/);
    expect(context).toContain('clearTimeout(settingsTimer);');
  });

  it('the page head warms the connection to the data and picture server', () => {
    const html = read('index.html');
    expect(html).toContain('<link rel="preconnect" href="%VITE_SUPABASE_URL%">');
    expect(html).toContain('<link rel="preconnect" href="%VITE_SUPABASE_URL%" crossorigin>');
    expect(html).toContain('<link rel="dns-prefetch" href="https://i.ibb.co">');
    expect(html).toContain('<link rel="dns-prefetch" href="https://images.unsplash.com">');
  });

  it('the logo is offered at the size it is shown', () => {
    expect(read('src/components/Navbar.tsx')).toContain("{...responsiveImage(siteContent?.navbar?.logoUrl, '(min-width: 640px) 40px, 36px')} decoding=\"async\"");
  });
});
