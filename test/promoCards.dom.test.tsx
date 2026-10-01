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

const show = (slides: unknown[], language = 'en', layout?: 'auto' | 'slider' | 'cards', banner: Record<string, unknown> = {}) => {
  Object.assign(shop, {
    siteContent: { promoBanner: { enabled: true, showArrows: true, showDots: true, ...banner, slides } },
    language, setActiveTab, setSelectedCategory, openProductDetail,
    products: [soap], addToCart: vi.fn(), showToast: vi.fn(), isVisualEditMode: false,
    formatPrice: (usd: number) => `$${usd.toFixed(2)}`,
  });
  act(() => root.render(<HomepagePromoSlider layout={layout} />));
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
    expect(promo).toContain("const wideScreen = useMediaQuery('(min-width: 1024px)');");
    expect(promo).toContain("const isWide = layout === 'slider' ? true : layout === 'cards' ? false : wideScreen;");
    expect(promo).toContain('if (!isWide || slideCount <= 1 || isPaused || config?.autoplay === false) return;');
  });
});

// ---------------------------------------------------------------------------
// The design an administrator gives a slide's texts and button
// ---------------------------------------------------------------------------
const PHOTO = {
  id: 'dp', order: 1, type: 'image_only', isPublished: true, badge: 'Partner', title: 'Our partner', imageUrl: 'https://i.ibb.co/p.png',
  ctaUrl: '/products', textAlign: 'center', textPosition: 'top', badgeColor: '#00ff00', titleColor: '#ff0000', imageOverlay: 40,
};
const NOTE = {
  id: 'dt', order: 2, type: 'text_only', isPublished: true, bgStyle: 'dark', badge: 'Note', title: 'Free delivery', description: 'This week only',
  ctaText: 'Shop now', ctaUrl: '/products', textAlign: 'end', textPosition: 'top', descriptionColor: '#123456',
  buttonStyle: 'outline', buttonColor: '#ffffff', buttonShape: 'square', buttonSize: 'lg', buttonAlign: 'center',
};
const byText = (root: ParentNode, text: string) => [...root.querySelectorAll('span,div,h3,p')].find(e => e.children.length === 0 && e.textContent === text) as HTMLElement;

describe('cards: the texts and the button are real elements', () => {
  it('the title is a heading outside any button, and the badge tag follows the slide type', () => {
    show(SLIDES);
    const special = card('Lebanese Artisanal Special');
    const title = special.querySelector('h3')!;
    expect(title.textContent).toBe('Lebanese Artisanal Special');
    expect(title.closest('button')).toBeNull();
    expect(byText(special, 'New Promotion').tagName).toBe('DIV'); // as on the desktop slider
    expect(byText(card('Just a photo'), 'Just a photo').tagName).toBe('H3');
    show([{ ...SLIDES[0], title: 'Our partner' }]);
    expect(byText(card('Our partner'), 'Partner').tagName).toBe('SPAN');
  });

  it('a button slide shows its button, which also opens the whole card', () => {
    show(SLIDES);
    const special = card('Lebanese Artisanal Special');
    const buttons = special.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('Shop now');
    expect(buttons[0].className).toContain('after:absolute after:inset-0');
    expect(buttons[0].className).not.toContain('active:scale-95'); // it would cancel a tap that starts on the card
    // Without a visible button the card carries an invisible one, labelled by its title.
    const still = card('Just a photo');
    expect(still.querySelectorAll('button')).toHaveLength(0);
    show([{ ...SLIDES[0], title: 'Our partner' }]);
    expect(card('Our partner').querySelector('button')!.getAttribute('aria-label')).toBe('Our partner');
  });
});

describe('cards: the design applies', () => {
  it('a photo card follows its alignment, position, colours and darkening', () => {
    show([PHOTO]);
    const c = card('Our partner');
    const box = c.querySelector('h3')!.parentElement!;
    for (const cls of ['justify-start', 'items-center', 'text-center', 'bg-gradient-to-b']) expect(box.className, cls).toContain(cls);
    expect(c.querySelector('h3')!.style.color).toBe('rgb(255, 0, 0)');
    expect(byText(c, 'Partner').style.color).toBe('rgb(0, 255, 0)');
    expect((c.querySelector('span[aria-hidden="true"]') as HTMLElement).style.backgroundColor).toBe('rgba(0, 0, 0, 0.4)');
  });

  it('a text card follows its alignment and its designed button', () => {
    show([NOTE]);
    const c = card('Free delivery');
    const box = c.querySelector('h3')!.parentElement!;
    for (const cls of ['justify-start', 'items-end', 'text-end']) expect(box.className, cls).toContain(cls);
    const button = c.querySelector('button')!;
    for (const cls of ['border-2', 'rounded-none', 'px-5 py-2.5 text-sm', 'self-center']) expect(button.className, cls).toContain(cls);
    expect(button.style.borderColor).toBe('rgb(255, 255, 255)');
    expect(button.style.getPropertyValue('--pb-hover')).toBe('rgba(255, 255, 255, 0.14)');
    expect(button.closest('h3')).toBeNull();
  });

  it('a slide with no design looks as before: bottom-left, white pill on a photo', () => {
    show([SLIDES[2]]);
    const c = card('Lebanese Artisanal Special');
    const box = c.querySelector('h3')!.parentElement!;
    expect(box.className).toContain('justify-end');
    expect(box.className).not.toMatch(/items-(start|center|end)|text-(center|end)/);
    expect(c.querySelector('h3')!.getAttribute('style')).toBeNull();
    expect(c.querySelector('button')!.className).toContain('bg-white text-black');
  });

  it('values that are not on the lists, or not hex colours, are ignored', () => {
    show([{ ...PHOTO, textAlign: 'left', textPosition: 'middle; position:fixed', titleColor: 'red; background:url(x)', badgeColor: 'url(javascript:1)', imageOverlay: 'lots', buttonShape: 'circle' }]);
    const c = card('Our partner');
    const box = c.querySelector('h3')!.parentElement!;
    expect(box.className).toContain('justify-end');
    expect(box.className).not.toMatch(/items-(start|center|end)|text-(center|end)/);
    expect(c.querySelector('h3')!.getAttribute('style')).toBeNull();
    expect(byText(c, 'Partner').getAttribute('style')).toBeNull();
    expect(c.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('uses start and end, so Arabic mirrors without a second setting', () => {
    show([NOTE], 'ar');
    expect(card('Free delivery').querySelector('h3')!.parentElement!.className).toContain('items-end');
    expect(host.querySelector('[role="list"]')!.getAttribute('aria-label')).toBe('العروض');
  });
});

describe('the slider beside the hero follows the same design', () => {
  it('shows each slide\'s own text, not the text of the slide on show', () => {
    wide = true;
    show([
      { id: 'a', order: 1, type: 'custom', isPublished: true, title: 'First title', imageUrl: 'https://i.ibb.co/a.png' },
      { id: 'b', order: 2, type: 'custom', isPublished: true, title: 'Second title', imageUrl: 'https://i.ibb.co/b.png' },
    ]);
    const titles = [...host.querySelectorAll('h3')].map(h => h.textContent);
    expect(titles).toEqual(['First title', 'Second title']);
  });

  it('a text slide gets its alignment, position, colours and button', () => {
    wide = true;
    show([NOTE]);
    const title = host.querySelector('h3')!;
    const block = title.parentElement!;
    expect(block.className).toContain('mb-auto'); // position: top
    expect(block.parentElement!.className).toContain('items-end');
    expect(block.parentElement!.className).toContain('text-end');
    expect(host.querySelector('p')!.style.color).toBe('rgb(18, 52, 86)');
    const button = host.querySelector('button.border-2') as HTMLElement;
    expect(button.className).toContain('rounded-none');
    expect(button.parentElement!.className).toContain('justify-center'); // button alignment
  });

  it('a photo slide puts its text where it is told, with the scrim on that side', () => {
    wide = true;
    show([PHOTO]);
    const box = host.querySelector('h3')!.parentElement!;
    for (const cls of ['justify-start', 'items-center', 'text-center', 'bg-gradient-to-b']) expect(box.className, cls).toContain(cls);
    expect((host.querySelector('span[aria-hidden="true"]') as HTMLElement).style.backgroundColor).toBe('rgba(0, 0, 0, 0.4)');
  });

  it('a title-and-button slide stacks them once an alignment is chosen, and keeps its row otherwise', () => {
    wide = true;
    const custom = { id: 'c', order: 1, type: 'custom', isPublished: true, title: 'Heritage', ctaText: 'Explore', ctaUrl: '/products' };
    show([custom]);
    const row = host.querySelector('h3')!.parentElement!.parentElement!;
    expect(row.className).toContain('justify-between');
    expect(row.className).not.toContain('flex-col');
    expect(host.querySelector('svg')).not.toBeNull(); // the arrow beside the badge

    show([{ ...custom, textAlign: 'center', buttonStyle: 'solid', buttonColor: '#b89753' }]);
    const stacked = host.querySelector('h3')!.parentElement!.parentElement!;
    for (const cls of ['flex-col', 'items-center', 'text-center']) expect(stacked.className, cls).toContain(cls);
    const button = stacked.querySelector('button')!;
    expect(button.className).toContain('self-center');
    expect(button.style.backgroundColor).toBe('rgb(184, 151, 83)');
    expect(button.style.color).toBe('rgb(23, 23, 23)'); // readable on the gold, chosen for the administrator
  });
});

describe('a photo that cannot be loaded', () => {
  const broken = (img: HTMLImageElement) => act(() => { img.dispatchEvent(new Event('error')); });

  it.each([['a phone card', false], ['the desktop slider', true]])('is swapped once for the bundled photo, on %s', (_name, isWide) => {
    wide = isWide;
    show([SLIDES[0], SLIDES[2], SLIDES[3]]); // image-only, custom and product slides
    const photos = [...host.querySelectorAll('img')] as HTMLImageElement[];
    expect(photos).toHaveLength(3);
    for (const img of photos) {
      img.setAttribute('srcset', 'a-480.webp 480w, a-960.webp 960w');
      broken(img);
      expect(img.getAttribute('srcset')).toBeNull();
      expect(img.src).toContain('raouche_rocks_sunset');
      expect(img.dataset.fallback).toBe('1');
      const fallback = img.src;
      broken(img); // a failing fallback must not loop
      expect(img.src).toBe(fallback);
    }
  });

  it('shows a new photo when the administrator changes the address after a failure', () => {
    show([{ ...SLIDES[2], imageUrl: 'https://i.ibb.co/old.png' }]);
    const first = host.querySelector('img') as HTMLImageElement;
    broken(first);
    expect(first.dataset.fallback).toBe('1');
    show([{ ...SLIDES[2], imageUrl: 'https://i.ibb.co/new.png' }]);
    const next = host.querySelector('img') as HTMLImageElement;
    expect(next).not.toBe(first); // a fresh element, so the next failure can fall back too
    expect(next.getAttribute('src')).toBe('https://i.ibb.co/new.png');
    expect(next.dataset.fallback).toBeUndefined();
  });
});

describe('the CMS can show either layout', () => {
  it('layout="cards" shows the phone cards even on a wide screen', () => {
    wide = true;
    show(SLIDES, 'en', 'cards');
    expect(host.querySelector('[role="list"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Next slide"]')).toBeNull();
  });

  it('layout="slider" shows the slider even on a narrow screen', () => {
    wide = false;
    show(SLIDES, 'en', 'slider');
    expect(host.querySelector('[role="list"]')).toBeNull();
    expect(host.querySelector('[aria-label="Next slide"]')).not.toBeNull();
  });

  it('layout="auto" (the default) follows the screen', () => {
    wide = false;
    show(SLIDES, 'en', 'auto');
    expect(host.querySelector('[role="list"]')).not.toBeNull();
  });
});

// The slider's arrows sit at the top end and its dots at the bottom centre.
// Text an administrator's design puts there moves clear of them; a slide with
// no design looks exactly as it did.
describe('designed text keeps clear of the slider\'s arrows and dots', () => {
  const photo = (design: object = {}) => [
    { id: 'a', order: 1, type: 'image_only', isPublished: true, badge: 'Tag', title: 'Photo', imageUrl: 'https://i.ibb.co/a.png', ...design },
    { id: 'b', order: 2, type: 'image_only', isPublished: true, title: 'Other', imageUrl: 'https://i.ibb.co/b.png' },
  ];
  const words = (design: object = {}) => [
    { id: 'a', order: 1, type: 'text_only', isPublished: true, badge: 'Note', title: 'Words', bgStyle: 'dark', ...design },
    { id: 'b', order: 2, type: 'text_only', isPublished: true, title: 'More', bgStyle: 'dark' },
  ];
  const custom = (design: object = {}) => [
    { id: 'a', order: 1, type: 'custom', isPublished: true, badge: 'Tag', title: 'Custom', imageUrl: 'https://i.ibb.co/a.png', ctaUrl: '/products', ...design },
    { id: 'b', order: 2, type: 'custom', isPublished: true, title: 'More', imageUrl: 'https://i.ibb.co/b.png' },
  ];
  const spacers = () => [...host.querySelectorAll('span[aria-hidden="true"].shrink-0')].map(e => e.className);
  const clearedHeaders = () => host.querySelectorAll('.mt-7');

  it('an image-only slide with its text on top leaves room for the arrows', () => {
    show(photo({ textPosition: 'top' }), 'en', 'slider');
    expect(spacers()).toEqual(['h-7 shrink-0']);
    const column = host.querySelector('span.shrink-0')!.parentElement!;
    expect(column.firstElementChild).toBe(host.querySelector('span.shrink-0')); // before the badge
    expect(column.className).toContain('justify-start');
  });

  it('an image-only slide with its text at the bottom leaves room for the dots', () => {
    show(photo({ textPosition: 'bottom' }), 'en', 'slider');
    expect(spacers()).toEqual(['h-3 shrink-0']);
    const column = host.querySelector('span.shrink-0')!.parentElement!;
    expect(column.lastElementChild).toBe(host.querySelector('span.shrink-0')); // after the title
  });

  it('a slide with no design, or its text in the middle, is left exactly as it was', () => {
    show(photo(), 'en', 'slider');
    expect(spacers()).toEqual([]);
    show(photo({ textPosition: 'middle' }), 'en', 'slider');
    expect(spacers()).toEqual([]);
  });

  it('adds nothing when the slider shows no arrows or dots', () => {
    show(photo({ textPosition: 'top' }), 'en', 'slider', { showArrows: false });
    expect(spacers()).toEqual([]);
    show(photo({ textPosition: 'bottom' }), 'en', 'slider', { showDots: false });
    expect(spacers()).toEqual([]);
    show([photo({ textPosition: 'top' })[0]], 'en', 'slider'); // one slide has no arrows
    expect(spacers()).toEqual([]);
  });

  it('a text-only or custom slide with its text on the arrows\' side moves its header down', () => {
    show(words({ textAlign: 'end' }), 'en', 'slider');
    expect(clearedHeaders()).toHaveLength(1);
    show(custom({ textAlign: 'end' }), 'en', 'slider');
    expect(clearedHeaders()).toHaveLength(1);
    // Not for the other sides, no design, or no arrows.
    for (const make of [words, custom]) {
      show(make({ textAlign: 'start' }), 'en', 'slider');
      expect(clearedHeaders()).toHaveLength(0);
      show(make({ textAlign: 'center' }), 'en', 'slider');
      expect(clearedHeaders()).toHaveLength(0);
      show(make(), 'en', 'slider');
      expect(clearedHeaders()).toHaveLength(0);
      show(make({ textAlign: 'end' }), 'en', 'slider', { showArrows: false });
      expect(clearedHeaders()).toHaveLength(0);
    }
  });
});

// The admin's "Style Text" tool picks the text under a click and styles every
// text like it in that section. The cards keep real headings, labels and buttons
// for exactly this, so a rule made on one layout styles the other.
describe('the Style Text tool still works on the promo section', () => {
  const textDom = import('../src/lib/textStyleDom');
  const leaf = (root: Element, text: string) =>
    [...root.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent === text) as HTMLElement;

  it('picks a card\'s badge, title and button label, and finds the section', async () => {
    const { textTargetFrom, scopeSelectorFor } = await textDom;
    show(SLIDES);
    const c = card('Lebanese Artisanal Special');
    const title = c.querySelector('h3')!;
    const badge = leaf(c, 'New Promotion');
    const label = leaf(c, 'Shop now');
    expect(textTargetFrom(title, host)).toBe(title);
    expect(textTargetFrom(badge, host)).toBe(badge);
    expect(textTargetFrom(label, host)).toBe(label);
    // A tap on the arrow beside the label means the button.
    expect(textTargetFrom(c.querySelector('button svg'), host)?.tagName).toBe('BUTTON');
    for (const el of [title, badge, label]) expect(scopeSelectorFor(el, host)).toBe('[data-cms-element="promo-slider"]');
  });

  it('a rule made on the desktop slider\'s title styles the same title on a phone', async () => {
    const { findRuleMatches } = await textDom;
    const rule = { text: 'Lebanese Artisanal Special', tag: 'h3', scope: '[data-cms-element="promo-slider"]' };
    show(SLIDES, 'en', 'slider');
    expect(findRuleMatches(host, rule).map(e => e.tagName)).toEqual(['H3']);
    show(SLIDES, 'en', 'cards');
    expect(findRuleMatches(host, rule).map(e => e.tagName)).toEqual(['H3']);
  });
});
