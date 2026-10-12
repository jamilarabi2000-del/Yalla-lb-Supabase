// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sellerNameShown } from '../src/lib/sellerNameVisibility';
import { DEFAULT_SITE_CONTENT } from '../src/data/cmsContent';

// CMS Studio → Visibility → "Seller Name". Off, a shopper no longer sees the seller's (artisan's) name on the product
// page, in Quick View or on the promo slider, and searching by it finds nothing. On (the default, also for a site saved
// before the switch existed), everything is as before. It hides the name on screen only: the data is unchanged.
const ctx = vi.hoisted(() => ({ shop: {} as any }));
vi.mock('../src/context/ShopContext', () => ({ useShop: () => ctx.shop }));
vi.mock('../src/components/ProductReviews', () => ({ ProductReviews: () => null }));
vi.mock('../src/components/ProductCard', () => ({ ProductCard: ({ product }: { product: { name: string } }) => <div data-card>{product.name}</div> }));

const { ProductModal } = await import('../src/components/ProductModal');
const { ProductDetailView } = await import('../src/components/ProductDetailView');
const { ProductsView } = await import('../src/components/ProductsView');
const { HomepagePromoSlider } = await import('../src/components/HomepagePromoSlider');
const { CMSVisibilityTab } = await import('../src/components/admin/cms/CMSVisibilityTab');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query === '(min-width: 1024px)', media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});

const NAME = 'Mountain Farm';
const product = (extra: Record<string, unknown> = {}) => ({
  id: 'p1', name: 'Wild Zaatar', arabicName: 'زعتر بري', artisan: NAME, seller: NAME, brand: '', category: 'c1', origin: 'Chouf',
  priceUSD: 5, stock: 9, image: '/p.jpg', images: [], description: 'Fresh', tags: [], keywords: [], arabicKeywords: [], isPublished: true, ...extra,
});
const baseVisibility = { ...DEFAULT_SITE_CONTENT.visibility };
const withSwitch = (value: boolean | undefined) => {
  const v: Record<string, unknown> = { ...baseVisibility };
  if (value === undefined) delete v.sellerName; else v.sellerName = value;
  return v;
};

let host: HTMLDivElement;
let root: Root;
const setShop = (overrides: Record<string, unknown>) => {
  ctx.shop = {
    language: 'en', t: (k: string) => k, formatPrice: (n: number) => `$${n}`, setSelectedProductForModal: vi.fn(), openProductDetail: vi.fn(),
    addToCart: vi.fn(), toggleWishlist: vi.fn(), isInWishlist: () => false, showToast: vi.fn(), cart: [], categories: [], sellers: [],
    goBack: vi.fn(), setActiveTab: vi.fn(), setSelectedCategory: vi.fn(), logSearchQuery: vi.fn(), setSearchQuery: vi.fn(),
    selectedCategory: 'all', searchQuery: '', isVisualEditMode: false, products: [product()],
    ...overrides,
  };
};
const render = async (element: React.ReactElement) => { await act(async () => { root.render(element); }); };
const text = () => host.textContent ?? '';

beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });

describe('the rule', () => {
  it('hides only when the switch is explicitly off', () => {
    expect(sellerNameShown({ sellerName: false })).toBe(false);
    expect(sellerNameShown({ sellerName: true })).toBe(true);
    expect(sellerNameShown({})).toBe(true);          // a site saved before the switch existed
    expect(sellerNameShown(undefined)).toBe(true);
    expect(sellerNameShown(null)).toBe(true);
  });
  it('is on in the defaults a new site starts from', () => {
    expect((DEFAULT_SITE_CONTENT.visibility as any).sellerName).toBe(true);
  });
});

describe.each([['English', 'en'], ['Arabic', 'ar']] as const)('Quick View (%s)', (_label, language) => {
  const open = async (visibility: unknown) => {
    const p = product();
    setShop({ language, selectedProductForModal: p, siteContent: { visibility }, products: [p] });
    await render(<ProductModal />);
  };
  it('shows the seller when the switch is on, or was never set', async () => {
    await open(withSwitch(true));
    expect(text()).toContain(NAME);
  });
  it('shows the seller for a site saved before the switch existed', async () => {
    await open(withSwitch(undefined));
    expect(text()).toContain(NAME);
  });
  it('hides the seller, and its label, when the switch is off', async () => {
    await open(withSwitch(false));
    expect(text()).not.toContain(NAME);
    expect(text()).not.toContain(language === 'ar' ? 'البائع' : 'Seller:');
    expect(text()).toContain(language === 'ar' ? 'زعتر بري' : 'Wild Zaatar');          // the rest of the card is untouched
  });
});

describe('the product page', () => {
  const open = async (visibility: unknown, extra: Record<string, unknown> = {}) => {
    const p = product(extra);
    setShop({ selectedProductDetail: p, siteContent: { visibility }, products: [p] });
    await render(<ProductDetailView />);
  };
  it('shows the seller at the top of the price box and in the maker section when on', async () => {
    await open(withSwitch(true));
    expect(text().split(NAME).length - 1).toBe(2);
  });
  it('shows it for a site saved before the switch existed', async () => {
    await open(withSwitch(undefined));
    expect(text().split(NAME).length - 1).toBe(2);
  });
  it('hides the seller in both places when off', async () => {
    await open(withSwitch(false));
    expect(text()).not.toContain(NAME);
    expect(text()).toContain('Wild Zaatar');
  });
  it('never hides the shop\'s own brand line, only the seller', async () => {
    await open(withSwitch(false), { brand: 'Yalla Selection' });
    expect(text()).toContain('Yalla Selection');
    expect(text()).not.toContain(NAME);
  });
  it('keeps the maker\'s own story when only the name is hidden, and drops the section when nothing is left', async () => {
    await open(withSwitch(false), { artisanBio: 'Three generations on the same hill.' });
    expect(text()).toContain('Three generations on the same hill.');
    expect(text()).not.toContain(NAME);
    act(() => root.unmount()); root = createRoot(host);
    await open(withSwitch(false));                       // no story: no maker section at all
    expect(text()).not.toContain('From the Maker');
  });
  it('shows the name hidden by the maker-section switch only through its own switch (they are independent)', async () => {
    await open({ ...withSwitch(true), detailArtisanBio: false });
    expect(text().split(NAME).length - 1).toBe(1);     // the price-box line stays; the maker section is off
  });
});

describe('catalogue search', () => {
  const search = async (visibility: unknown, query: string) => {
    setShop({ searchQuery: query, siteContent: { visibility, productsPage: {} }, products: [product(), product({ id: 'p2', name: 'Pine Honey', artisan: 'Other Hive', seller: 'Other Hive' })] });
    await render(<ProductsView />);
    return [...host.querySelectorAll('[data-card]')].map(c => c.textContent);
  };
  it('finds a product by its seller\'s name when the name is shown', async () => {
    expect(await search(withSwitch(true), 'mountain farm')).toEqual(['Wild Zaatar']);
  });
  it('finds it for a site saved before the switch existed', async () => {
    expect(await search(withSwitch(undefined), 'mountain farm')).toEqual(['Wild Zaatar']);
  });
  it('finds nothing by the seller\'s name once it is hidden, so searching cannot reveal it', async () => {
    expect(await search(withSwitch(false), 'mountain farm')).toEqual([]);
  });
  it('stops matching as soon as the admin turns the switch off, without a reload', async () => {
    expect(await search(withSwitch(true), 'mountain farm')).toEqual(['Wild Zaatar']);
    ctx.shop = { ...ctx.shop, siteContent: { visibility: withSwitch(false), productsPage: {} } };
    await render(<ProductsView />);
    expect([...host.querySelectorAll('[data-card]')].map(c => c.textContent)).toEqual([]);
    ctx.shop = { ...ctx.shop, siteContent: { visibility: withSwitch(true), productsPage: {} } };
    await render(<ProductsView />);
    expect([...host.querySelectorAll('[data-card]')].map(c => c.textContent)).toEqual(['Wild Zaatar']);
  });
  it('still finds products by their own name when the seller name is hidden', async () => {
    expect(await search(withSwitch(false), 'zaatar')).toEqual(['Wild Zaatar']);
  });
});

describe('the home promo slider', () => {
  const slide = { id: 's', order: 1, type: 'product_promotion', isPublished: true, selectedProductId: 'p1' };
  const open = async (visibility: unknown, language = 'en') => {
    setShop({ language, siteContent: { visibility, promoBanner: { enabled: true, showArrows: true, showDots: true, slides: [slide] } }, products: [product()] });
    await render(<HomepagePromoSlider layout="slider" />);
  };
  it('shows the seller as the line under the product when on', async () => {
    await open(withSwitch(true));
    expect(text()).toContain(NAME);
  });
  it('shows it for a site saved before the switch existed', async () => {
    await open(withSwitch(undefined));
    expect(text()).toContain(NAME);
  });
  it('shows a generic line instead when off (English and Arabic)', async () => {
    await open(withSwitch(false));
    expect(text()).not.toContain(NAME);
    expect(text()).toContain('Lebanese Artisan');
    act(() => root.unmount()); root = createRoot(host);
    await open(withSwitch(false), 'ar');
    expect(text()).not.toContain(NAME);
    expect(text()).toContain('حرفي لبناني');
  });
});

describe('the admin switch in CMS Studio', () => {
  const open = async (visibility: Record<string, unknown>, onChange = vi.fn()) => {
    await render(<CMSVisibilityTab visibility={visibility as any} onChange={onChange} onSetAll={vi.fn()} />);
    return onChange;
  };
  const row = () => [...host.querySelectorAll('*')].filter(el => el.children.length === 0 && el.textContent === 'Seller Name')[0]?.closest('div.group, div[class*="rounded"]') as HTMLElement | undefined;
  const switchFor = () => {
    const label = [...host.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent === 'Seller Name')!;
    let node: HTMLElement | null = label as HTMLElement;
    while (node && !node.querySelector('button')) node = node.parentElement;
    return node!.querySelector('button') as HTMLButtonElement;
  };

  it('lists a "Seller Name" row under the product page, on for a site saved before it existed', async () => {
    await open(withSwitch(undefined));
    expect(text()).toContain('Seller Name');
    expect(text()).toContain('not removed from the shop');          // says plainly that this hides on screen only
    expect(row()).toBeDefined();
  });

  it('writes sellerName=false when the admin turns it off, and true when they turn it back on', async () => {
    const onChange = await open(withSwitch(true));
    await act(async () => { switchFor().click(); });
    expect(onChange).toHaveBeenCalledWith('sellerName', false);
    act(() => root.unmount()); root = createRoot(host);
    const again = await open(withSwitch(false));
    await act(async () => { switchFor().click(); });
    expect(again).toHaveBeenCalledWith('sellerName', true);
  });
});
