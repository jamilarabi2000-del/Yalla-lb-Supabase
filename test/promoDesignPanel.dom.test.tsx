// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CMSPromoSlide, CMSPromoSliderConfig } from '../src/types';
import { DESIGN_KEYS, type PromoLayout } from '../src/lib/promoSlideDesign';

// The administrator designs a slide's text and button here: alignment, a nine
// spot position pad, colours with a contrast check, button style / colour /
// shape / size / position, photo darkening and four presets. Every control
// writes optional fields of that one slide, and Auto stores nothing.
const shop: Record<string, unknown> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
vi.mock('../src/lib/mediaUpload', () => ({ uploadImage: vi.fn(), formatBytes: (n: number) => `${n} B` }));
const { PromoSlideDesignPanel } = await import('../src/components/admin/cms/PromoSlideDesignPanel');
const { CMSPromoBannerEditor } = await import('../src/components/admin/cms/CMSPromoBannerEditor');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let wide = true;
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query === '(min-width: 1024px)' ? wide : false,
    media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  wide = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

// ---------------------------------------------------------------- helpers

const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
const type = (input: HTMLInputElement, value: string) =>
  act(() => { nativeValue.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
const blur = (el: HTMLElement) => act(() => { el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
const click = (el: Element | null | undefined) => { expect(el, 'element to click').toBeTruthy(); act(() => { (el as HTMLElement).click(); }); };

const panel = () => host.querySelector('[data-testid="promo-design-panel"]') as HTMLElement;
const group = (name: string) => panel().querySelector(`[role="group"][aria-label="${name}"]`) as HTMLElement | null;
const press = (groupName: string, label: string) => {
  const g = group(groupName);
  expect(g, `group ${groupName}`).toBeTruthy();
  click([...g!.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label));
};
const pressed = (groupName: string, label: string) =>
  [...group(groupName)!.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label)!.getAttribute('aria-pressed');
const textBox = (label: string) => {
  const l = [...panel().querySelectorAll('label')].find(x => x.textContent === label) as HTMLLabelElement | undefined;
  expect(l, `label ${label}`).toBeTruthy();
  return document.getElementById(l!.htmlFor) as HTMLInputElement;
};
const picker = (label: string) => panel().querySelector(`input[type="color"][aria-label="${label}, colour picker"]`) as HTMLInputElement;
const autoButton = (label: string) => panel().querySelector(`button[aria-label="${label}: use the automatic colour"]`) as HTMLButtonElement | null;
const text = () => panel().textContent ?? '';

const BASE: CMSPromoSlide = { id: 's1', type: 'custom', isPublished: true, title: 'Title', bgStyle: 'light', imageUrl: 'https://x/y.jpg' };

function mountPanel(initial: Partial<CMSPromoSlide> = {}, opts: { layout?: PromoLayout; hasPhoto?: boolean } = {}) {
  let current: CMSPromoSlide = { ...BASE, ...initial };
  const layouts: PromoLayout[] = [];
  const Harness = () => {
    const [slide, setSlide] = useState<CMSPromoSlide>(current);
    const [layout, setLayout] = useState<PromoLayout>(opts.layout ?? 'slider');
    current = slide;
    return (
      <PromoSlideDesignPanel
        slide={slide}
        layout={layout}
        onLayoutChange={(l) => { layouts.push(l); setLayout(l); }}
        hasPhoto={opts.hasPhoto ?? Boolean(slide.imageUrl)}
        onChange={(updates) => setSlide(s => ({ ...s, ...updates }))}
        preview={<div data-testid="preview">preview</div>}
      />
    );
  };
  act(() => root.render(<Harness />));
  return { slide: () => current, layouts };
}

// ---------------------------------------------------------------- presets

describe('presets', () => {
  it('replace the whole design, set the background some of them carry, and can be undone', () => {
    const view = mountPanel({ buttonAlign: 'end', imageOverlay: 20, titleColor: '#123456' });
    click([...panel().querySelectorAll('button')].find(b => b.textContent?.startsWith('Dark gold')));
    const s = view.slide();
    expect(s.bgStyle).toBe('dark');
    expect(s.titleColor).toBe('#ffffff');
    expect(s.buttonColor).toBe('#b89753');
    expect(s.buttonStyle).toBe('solid');
    // What the preset does not set is cleared, not left over from before.
    expect(s.buttonAlign).toBeUndefined();
    expect(s.imageOverlay).toBeUndefined();
    expect(text()).toContain('Applied “Dark gold”.');

    click([...panel().querySelectorAll('button')].find(b => b.textContent?.trim() === 'Undo'));
    const back = view.slide();
    expect(back.bgStyle).toBe('light');
    expect(back.titleColor).toBe('#123456');
    expect(back.buttonAlign).toBe('end');
    expect(back.imageOverlay).toBe(20);
    expect(back.buttonColor).toBeUndefined();
    expect(text()).not.toContain('Undo');
  });

  it('stop offering the undo once the slide is changed by hand', () => {
    mountPanel();
    click([...panel().querySelectorAll('button')].find(b => b.textContent?.startsWith('Classic light')));
    expect(text()).toContain('Undo');
    press('Text alignment', 'Center');
    expect(text()).not.toContain('Undo');
  });
});

describe('reset', () => {
  it('is offered only once something is designed', () => {
    mountPanel();
    expect(text()).not.toContain('Reset design');
    press('Text alignment', 'Right');
    expect(text()).toContain('Reset design');
  });

  it('clears every design field, and nothing else', () => {
    const designed = {
      textAlign: 'end', textPosition: 'top', badgeColor: '#aa0000', titleColor: '#00aa00', descriptionColor: '#0000aa',
      buttonStyle: 'outline', buttonColor: '#111111', buttonTextColor: '#222222', buttonShape: 'square', buttonSize: 'lg',
      buttonAlign: 'center', imageOverlay: 30,
    } as Partial<CMSPromoSlide>;
    const view = mountPanel(designed);
    click([...panel().querySelectorAll('button')].find(b => b.textContent?.includes('Reset design')));
    const s = view.slide();
    for (const key of DESIGN_KEYS) expect(s[key], key).toBeUndefined();
    expect(s.bgStyle).toBe('light');
    expect(s.title).toBe('Title');
    expect(text()).toContain('Design reset.');
    expect(text()).not.toContain('Reset design');
  });
});

// -------------------------------------------------- alignment and position

describe('alignment', () => {
  it('writes the chosen side, and Auto stores nothing', () => {
    const view = mountPanel();
    expect(pressed('Text alignment', 'Auto')).toBe('true');
    press('Text alignment', 'Center');
    expect(view.slide().textAlign).toBe('center');
    expect(pressed('Text alignment', 'Center')).toBe('true');
    expect(pressed('Text alignment', 'Auto')).toBe('false');
    press('Text alignment', 'Right');
    expect(view.slide().textAlign).toBe('end');
    press('Text alignment', 'Left');
    expect(view.slide().textAlign).toBe('start');
    press('Text alignment', 'Auto');
    expect(view.slide().textAlign).toBeUndefined();
  });
});

describe('position pad', () => {
  it('sets the side and the height together for an image-only slide', () => {
    const view = mountPanel({ type: 'image_only' });
    const spots = [...group('Text position')!.querySelectorAll('button')] as HTMLButtonElement[];
    expect(spots).toHaveLength(9);
    expect(spots.every(b => !b.disabled)).toBe(true);
    expect(spots.every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true);

    press('Text position', 'Top right');
    expect([view.slide().textAlign, view.slide().textPosition]).toEqual(['end', 'top']);
    expect(pressed('Text position', 'Top right')).toBe('true');
    expect(pressed('Text position', 'Top left')).toBe('false');
    expect(pressed('Text alignment', 'Right')).toBe('true'); // the same field as the alignment row

    press('Text position', 'Middle center');
    expect([view.slide().textAlign, view.slide().textPosition]).toEqual(['center', 'middle']);
  });

  it('works for a text-only slide too', () => {
    const view = mountPanel({ type: 'text_only', imageUrl: undefined });
    press('Text position', 'Bottom left');
    expect([view.slide().textAlign, view.slide().textPosition]).toEqual(['start', 'bottom']);
  });

  it('is switched off, with the reason, for the layouts that keep their own arrangement', () => {
    for (const type of ['custom', 'category_promotion', 'product_promotion'] as const) {
      act(() => root.unmount());
      root = createRoot(host);
      const view = mountPanel({ type });
      const spots = [...group('Text position')!.querySelectorAll('button')] as HTMLButtonElement[];
      expect(spots.every(b => b.disabled), type).toBe(true);
      expect(text(), type).toContain('Only for Image only and Text only slides');
      expect(view.slide().textPosition).toBeUndefined();
    }
  });
});

// ------------------------------------------------------------------ colours

describe('colours', () => {
  it('store a complete code at once, and leave a half-typed one alone', () => {
    const view = mountPanel();
    const box = textBox('Title colour');
    expect(box.value).toBe('');
    expect(box.placeholder).toBe('Auto');

    type(box, '#b8975');
    expect(view.slide().titleColor).toBeUndefined();
    type(box, '#b89753');
    expect(view.slide().titleColor).toBe('#b89753');
  });

  it('turn a short or unprefixed code into #rrggbb when the box is left', () => {
    const view = mountPanel();
    const box = textBox('Title colour');
    type(box, '#b89');
    expect(view.slide().titleColor).toBeUndefined();
    blur(box);
    expect(view.slide().titleColor).toBe('#bb8899');
    expect(box.value).toBe('#bb8899');

    const badge = textBox('Badge colour');
    type(badge, 'B89753');
    blur(badge);
    expect(view.slide().badgeColor).toBe('#b89753');
  });

  it('refuse anything that is not a colour, say so, and put the old colour back', () => {
    const view = mountPanel({ titleColor: '#112233' });
    const box = textBox('Title colour');
    expect(box.value).toBe('#112233');
    type(box, 'red; position:fixed');
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(text()).toContain('Use a colour code such as #b89753.');
    expect(view.slide().titleColor).toBe('#112233');
    blur(box);
    expect(view.slide().titleColor).toBe('#112233');
    expect(box.value).toBe('#112233');
    expect(box.getAttribute('aria-invalid')).toBeNull();
  });

  it('go back to Auto from the Auto link, or by emptying the box', () => {
    const view = mountPanel({ titleColor: '#112233', badgeColor: '#445566' });
    expect(autoButton('Description colour')).toBeNull();
    click(autoButton('Title colour'));
    expect(view.slide().titleColor).toBeUndefined();
    expect(textBox('Title colour').value).toBe('');
    expect(autoButton('Title colour')).toBeNull();

    const badge = textBox('Badge colour');
    type(badge, '');
    blur(badge);
    expect(view.slide().badgeColor).toBeUndefined();
  });

  it('accept the colour picker, which always gives a full code', () => {
    const view = mountPanel();
    type(picker('Description colour'), '#3366cc');
    expect(view.slide().descriptionColor).toBe('#3366cc');
    expect(textBox('Description colour').value).toBe('#3366cc');
  });

  it('follow a preset that sets them', () => {
    mountPanel();
    expect(textBox('Title colour').value).toBe('');
    click([...panel().querySelectorAll('button')].find(b => b.textContent?.startsWith('Dark gold')));
    expect(textBox('Title colour').value).toBe('#ffffff');
    expect(textBox('Badge colour').value).toBe('#f3e5ab');
  });

  it('leave out the description for an image-only slide, which does not show one', () => {
    mountPanel({ type: 'image_only' });
    expect([...panel().querySelectorAll('label')].some(l => l.textContent === 'Description colour')).toBe(false);
    expect(text()).not.toContain('not the description');
  });
});

describe('the contrast note beside a colour', () => {
  it('says whether text is readable on the slide, and by how much', () => {
    mountPanel({ titleColor: '#999999', descriptionColor: '#111111' });
    expect(text()).toMatch(/Contrast 2\.\d:1, hard to read \(aim for 4\.5:1 or more\)/);
    expect(text()).toMatch(/Contrast 1\d(\.\d)?:1, easy to read/);
  });

  it('has nothing to say about a colour left on Auto', () => {
    mountPanel();
    expect(text()).not.toContain('Contrast');
  });

  it('follows the layout being previewed: a photo is behind the text on a card, not on the slider', () => {
    // The same custom slide: flat colour on the slider, its picture behind the text on a card.
    mountPanel({ titleColor: '#999999' }, { layout: 'slider' });
    expect(text()).toMatch(/Contrast 2\.\d:1, hard to read/);
    expect(text()).not.toContain('On a photo');

    act(() => root.unmount());
    root = createRoot(host);
    mountPanel({ titleColor: '#999999' }, { layout: 'cards' });
    expect(text()).toContain('On a photo: check the preview');
    expect(text()).not.toMatch(/Contrast \d/);
  });

  it('cannot judge text over an image-only slide\'s photo, and says so', () => {
    mountPanel({ type: 'image_only', titleColor: '#999999' });
    expect(text()).toContain('On a photo: check the preview');
  });

  it('judges a slide without a picture on a card like any flat colour', () => {
    mountPanel({ imageUrl: undefined, titleColor: '#999999' }, { layout: 'cards', hasPhoto: false });
    expect(text()).toMatch(/Contrast 2\.\d:1, hard to read/);
    expect(text()).not.toContain('On a photo');
  });
});

// ------------------------------------------------------------------- button

describe('the button', () => {
  it('is not designed until a style is chosen, and then shows its colours, shape and size', () => {
    const view = mountPanel();
    expect(pressed('Button style', 'Default')).toBe('true');
    expect(group('Button shape')).toBeNull();
    expect([...panel().querySelectorAll('label')].some(l => l.textContent === 'Button colour')).toBe(false);
    expect(group('Button position')).not.toBeNull();

    press('Button style', 'Solid');
    expect(view.slide().buttonStyle).toBe('solid');
    expect(pressed('Button style', 'Solid')).toBe('true');
    expect(group('Button shape')).not.toBeNull();
    expect(group('Button size')).not.toBeNull();
    expect(textBox('Button colour')).toBeTruthy();
    expect(textBox('Button text colour')).toBeTruthy();

    press('Button shape', 'Square');
    press('Button size', 'Large');
    expect([view.slide().buttonShape, view.slide().buttonSize]).toEqual(['square', 'lg']);
    expect(pressed('Button shape', 'Square')).toBe('true');
    expect(pressed('Button size', 'Large')).toBe('true');
  });

  it('starts a new style with automatic text, since a text colour belongs to the style it was chosen for', () => {
    // Dark text on a gold fill, then an outline on a dark slide: the dark text would vanish.
    const view = mountPanel({ bgStyle: 'dark', buttonStyle: 'solid', buttonColor: '#b89753', buttonTextColor: '#171717' });
    press('Button style', 'Outline');
    expect(view.slide().buttonStyle).toBe('outline');
    expect(view.slide().buttonTextColor).toBeUndefined();
    expect(view.slide().buttonColor).toBe('#b89753'); // the colour itself carries over
    // Choosing the style that is already on changes nothing.
    act(() => { nativeValue.call(textBox('Button text colour'), '#ffffff'); textBox('Button text colour').dispatchEvent(new Event('input', { bubbles: true })); });
    press('Button style', 'Outline');
    expect(view.slide().buttonTextColor).toBe('#ffffff');
  });

  it('goes back to the button it always was with Default, and keeps its position', () => {
    const view = mountPanel({ buttonStyle: 'outline', buttonColor: '#111111', buttonTextColor: '#222222', buttonShape: 'square', buttonSize: 'lg', buttonAlign: 'center' });
    press('Button style', 'Default');
    const s = view.slide();
    for (const key of ['buttonStyle', 'buttonColor', 'buttonTextColor', 'buttonShape', 'buttonSize'] as const) expect(s[key], key).toBeUndefined();
    expect(s.buttonAlign).toBe('center');
    expect(group('Button shape')).toBeNull();
  });

  it('places the button on its own, apart from the text', () => {
    const view = mountPanel();
    press('Button position', 'Right');
    expect(view.slide().buttonAlign).toBe('end');
    expect(view.slide().textAlign).toBeUndefined();
    press('Button position', 'Auto');
    expect(view.slide().buttonAlign).toBeUndefined();
  });

  it('warns when its text is hard to read on its own fill', () => {
    mountPanel({ buttonStyle: 'solid', buttonColor: '#b89753', buttonTextColor: '#ffffff' });
    expect(text()).toMatch(/Contrast 2\.7:1, hard to read/);
  });

  it('is judged on the slide for an outline, and on a photo it says to check the preview', () => {
    mountPanel({ buttonStyle: 'outline', buttonColor: '#ffffff' });
    expect(text()).toMatch(/Contrast 1:1, hard to read/);
    act(() => root.unmount());
    root = createRoot(host);
    mountPanel({ buttonStyle: 'outline', buttonColor: '#ffffff' }, { layout: 'cards' });
    expect(text()).toContain('On a photo: check the preview');
  });

  it('is absent for an image-only slide, which opens its link when tapped', () => {
    mountPanel({ type: 'image_only' });
    expect(group('Button style')).toBeNull();
    expect(text()).toContain('An Image only slide has no button');
  });

  it('is absent when the slide\'s button is switched off', () => {
    mountPanel({ showCta: false });
    expect(group('Button style')).toBeNull();
    expect(text()).toContain('button switched off');
  });

  it('styles the Add button of a product slide, which has no position of its own', () => {
    mountPanel({ type: 'product_promotion', selectedProductId: 'p1' });
    expect(group('Button style')).not.toBeNull();
    expect(group('Button position')).toBeNull();
    expect(text()).toContain('styles the “Add” button');
  });
});

// ---------------------------------------------------------- photo darkening

describe('photo darkening', () => {
  const range = () => panel().querySelector('#promo-design-overlay') as HTMLInputElement | null;

  it('goes from 0 to 70 and stores nothing at 0', () => {
    const view = mountPanel();
    expect(range()!.min).toBe('0');
    expect(range()!.max).toBe('70');
    expect(text()).toContain('Off');
    type(range()!, '45');
    expect(view.slide().imageOverlay).toBe(45);
    expect(text()).toContain('45%');
    type(range()!, '0');
    expect(view.slide().imageOverlay).toBeUndefined();
    expect(text()).toContain('Off');
  });

  it('explains where it applies', () => {
    mountPanel({ type: 'image_only' });
    expect(text()).toContain('Darkens the picture so light text on top stays readable.');
    act(() => root.unmount());
    root = createRoot(host);
    mountPanel();
    expect(text()).toContain('on the phone and tablet cards');
  });

  it('is offered only when there is a photo to darken', () => {
    mountPanel({ imageUrl: undefined }, { hasPhoto: false });
    expect(range()).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    mountPanel({ type: 'text_only' }, { hasPhoto: true });
    expect(range()).toBeNull();
  });

  it('is offered for a product slide that has the product\'s own photo', () => {
    mountPanel({ type: 'product_promotion', imageUrl: undefined }, { hasPhoto: true });
    expect(range()).not.toBeNull();
  });
});

// ------------------------------------------------------------------ preview

describe('the preview beside the controls', () => {
  it('shows what the editor passes in, and switches the layout', () => {
    const view = mountPanel();
    expect(host.querySelector('[data-testid="preview"]')?.textContent).toBe('preview');
    const sw = host.querySelector('[role="group"][aria-label="Preview layout"]')!;
    const [slider, cards] = [...sw.querySelectorAll('button')];
    expect([slider.textContent, cards.textContent]).toEqual(['Desktop slider', 'Phone & tablet cards']);
    expect([slider.getAttribute('aria-pressed'), cards.getAttribute('aria-pressed')]).toEqual(['true', 'false']);
    click(cards);
    expect(view.layouts).toEqual(['cards']);
    expect(cards.getAttribute('aria-pressed')).toBe('true');
    expect(slider.getAttribute('aria-pressed')).toBe('false');
  });
});

// ------------------------------------------------------------ in the editor

describe('in the promo editor', () => {
  const SLIDES: CMSPromoSlide[] = [
    { id: 'a', order: 1, type: 'custom', isPublished: true, badge: 'Badge A', title: 'First slide', imageUrl: 'https://img.example.com/a.jpg', bgStyle: 'light', ctaUrl: '/products', ctaText: 'Shop' },
    { id: 'b', order: 2, type: 'image_only', isPublished: false, title: 'Draft slide', imageUrl: 'https://img.example.com/b.jpg' },
  ];
  let latest: CMSPromoSliderConfig;

  const mountEditor = () => {
    Object.assign(shop, {
      siteContent: { promoBanner: {} }, language: 'en', products: [], categories: [],
      setActiveTab: vi.fn(), setSelectedCategory: vi.fn(), openProductDetail: vi.fn(), addToCart: vi.fn(),
      showToast: vi.fn(), isVisualEditMode: false, formatPrice: (n: number) => `$${n}`,
    });
    const Parent = () => {
      const [data, setData] = useState<CMSPromoSliderConfig>({ enabled: true, autoplay: false, slides: SLIDES });
      latest = data;
      return <CMSPromoBannerEditor promoBannerData={data} onChangePromoBanner={(u) => setData(d => ({ ...d, ...u }))} />;
    };
    act(() => root.render(<Parent />));
  };
  const topPreview = () => host.querySelector('#homepage-content-slider') as HTMLElement;
  const miniPreview = () => host.querySelector('#promo-design-preview') as HTMLElement;
  const isCards = (el: Element) => el.querySelector('[role="list"]') !== null;

  it('sits between Background & Styling and Time-based Scheduling', () => {
    mountEditor();
    const label = (t: string) => [...host.querySelectorAll('label')].find(l => l.textContent?.includes(t))!;
    const before = label('Background & Styling').compareDocumentPosition(panel());
    const after = panel().compareDocumentPosition(label('Time-based Scheduling'));
    expect(before & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(after & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('gives the two previews different ids, so no id is used twice', () => {
    mountEditor();
    expect(host.querySelectorAll('#homepage-content-slider')).toHaveLength(1);
    expect(host.querySelectorAll('#promo-design-preview')).toHaveLength(1);
    expect(host.querySelectorAll('[data-cms-element="promo-slider"]')).toHaveLength(2);
  });

  it('starts with the layout this screen gives visitors, and one switch moves both previews', () => {
    mountEditor();
    expect([isCards(topPreview()), isCards(miniPreview())]).toEqual([false, false]);
    const cardsButtons = () => [...host.querySelectorAll('[role="group"][aria-label="Preview layout"] button')]
      .filter(b => b.textContent === 'Phone & tablet cards') as HTMLButtonElement[];
    expect(cardsButtons()).toHaveLength(2); // one in the live preview, one in the design panel
    click(cardsButtons()[1]);
    expect([isCards(topPreview()), isCards(miniPreview())]).toEqual([true, true]);
    expect(cardsButtons().map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    click([...host.querySelectorAll('[role="group"][aria-label="Preview layout"] button')].find(b => b.textContent === 'Desktop slider'));
    expect([isCards(topPreview()), isCards(miniPreview())]).toEqual([false, false]);
  });

  it('starts as cards on a narrow screen', () => {
    wide = false;
    mountEditor();
    expect([isCards(topPreview()), isCards(miniPreview())]).toEqual([true, true]);
  });

  it('changes only the slide being edited, and the preview shows it at once', () => {
    mountEditor();
    press('Text alignment', 'Center');
    expect(latest.slides![0].textAlign).toBe('center');
    expect(latest.slides![1].textAlign).toBeUndefined();
    // The stacked layout a chosen alignment gives a custom slide, in the preview of this slide alone.
    expect(miniPreview().querySelector('.items-center.text-center')).not.toBeNull();
    expect(miniPreview().textContent).toContain('First slide');
    expect(miniPreview().textContent).not.toContain('Draft slide');
  });

  it('shows a picture that cannot load as broken in the slide list, not as a stock photo', () => {
    mountEditor();
    const thumbs = () => [...host.querySelectorAll('img[alt="thumb"]')] as HTMLImageElement[];
    expect(thumbs()).toHaveLength(2);
    act(() => { thumbs()[0].dispatchEvent(new Event('error')); });
    expect(thumbs()).toHaveLength(1);
    expect(thumbs()[0].getAttribute('src')).toBe('https://img.example.com/b.jpg');
    const broken = host.querySelectorAll('[role="img"][aria-label="This image could not be loaded"]');
    expect(broken).toHaveLength(1);
    expect(broken[0].textContent).toBe('Broken');
  });

  it('previews a slide that is not published yet, once it is selected', () => {
    mountEditor();
    // Clicking the slide's name in the list selects it.
    click([...host.querySelectorAll('span')].find(s => s.textContent === 'Draft slide'));
    expect(miniPreview().textContent).toContain('Draft slide');
    expect(miniPreview().querySelector('img')?.getAttribute('src')).toBe('https://img.example.com/b.jpg');
    // The live preview above still leaves the unpublished slide out, as the storefront does.
    expect(topPreview().querySelector('img[src="https://img.example.com/b.jpg"]')).toBeNull();
  });
});
