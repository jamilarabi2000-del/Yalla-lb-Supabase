import { describe, it, expect } from 'vitest';
import {
  CLEARED_DESIGN, DESIGN_KEYS, MAX_OVERLAY, PROMO_DESIGN_PRESETS, alignClass, blend, buttonContrast, buttonRender,
  contrastNote, isDarkSlide, itemsClass, justifyColClass, marginClass, onDarkBackground, overlayStyle, resolveDesign,
  safeColor, safeOverlay, slideBackground,
} from '../src/lib/promoSlideDesign';

// The design an administrator gives a promo slide is stored as plain JSON in
// the site settings and rendered for every visitor, so everything read back is
// checked: choices come from fixed lists, colours must be hex, and a slide
// that sets nothing looks exactly as it always did.

describe('what is read back from the settings is checked', () => {
  it('a slide with no design resolves to nothing, and its button is left as it was', () => {
    for (const slide of [undefined, null, {}, { title: 'Hello', bgStyle: 'dark' as const }]) {
      const d = resolveDesign(slide);
      expect([d.align, d.position, d.badgeColor, d.titleColor, d.descriptionColor]).toEqual([undefined, undefined, undefined, undefined, undefined]);
      expect(d.overlay).toBe(0);
      expect(d.button.custom).toBe(false);
      expect(buttonRender(d, false)).toBeNull();
    }
  });

  it('keeps the listed choices and drops everything else', () => {
    const d = resolveDesign({
      textAlign: 'center', textPosition: 'top', buttonStyle: 'outline', buttonShape: 'square', buttonSize: 'lg', buttonAlign: 'end',
    });
    expect([d.align, d.position, d.button.style, d.button.shape, d.button.size, d.button.align]).toEqual(['center', 'top', 'outline', 'square', 'lg', 'end']);

    const bad = resolveDesign({
      textAlign: 'left', textPosition: 'middle; position:fixed', buttonStyle: 'solid;}', buttonShape: 'circle', buttonSize: 'xl', buttonAlign: 'justify',
    } as never);
    expect([bad.align, bad.position, bad.button.align]).toEqual([undefined, undefined, undefined]);
    expect([bad.button.style, bad.button.shape, bad.button.size]).toEqual(['solid', 'pill', 'md']);
    expect(bad.button.custom).toBe(false);
  });

  it('accepts only hex colours, in any case, and writes them as #rrggbb', () => {
    expect(safeColor('#ABC')).toBe('#aabbcc');
    expect(safeColor('#B89753')).toBe('#b89753');
    expect(safeColor(' #fff ')).toBe('#ffffff');
    for (const bad of ['red', 'rgb(0,0,0)', 'url(javascript:alert(1))', '#12', '#12345', '#1234567', '#ggg', 'expression(x)', '#fff;color:red', '', null, undefined, 5, {}]) {
      expect(safeColor(bad), String(bad)).toBeUndefined();
    }
    const d = resolveDesign({ titleColor: 'red', badgeColor: '#fff;x', descriptionColor: '#C0FFEE', buttonColor: 'url(x)', buttonTextColor: '#000' });
    expect([d.titleColor, d.badgeColor, d.descriptionColor, d.button.color, d.button.textColor]).toEqual([undefined, undefined, '#c0ffee', undefined, '#000000']);
    expect(d.button.custom).toBe(true);
  });

  it('keeps the photo darkening between 0 and 70', () => {
    expect([-5, 0, 12.4, 45, 70, 71, 1000, NaN, 'x', null, undefined].map(safeOverlay)).toEqual([0, 0, 12, 45, 70, 70, 70, 0, 0, 0, 0]);
    expect(MAX_OVERLAY).toBe(70);
    expect(overlayStyle(0)).toBeUndefined();
    expect(overlayStyle(45)).toEqual({ backgroundColor: 'rgba(0, 0, 0, 0.45)' });
  });
});

describe('alignment and position', () => {
  it('uses logical classes, so Arabic mirrors without extra work', () => {
    expect(['start', 'center', 'end'].map(a => alignClass(a as never))).toEqual(['text-start', 'text-center', 'text-end']);
    expect(['start', 'center', 'end'].map(a => itemsClass(a as never))).toEqual(['items-start', 'items-center', 'items-end']);
    expect(['top', 'middle', 'bottom'].map(p => justifyColClass(p as never))).toEqual(['justify-start', 'justify-center', 'justify-end']);
    expect(['top', 'middle', 'bottom'].map(p => marginClass(p as never))).toEqual(['mb-auto', 'my-auto', 'mt-auto']);
    expect([alignClass(undefined), itemsClass(undefined), justifyColClass(undefined), marginClass(undefined)]).toEqual(['', '', '', '']);
  });
});

describe('the button', () => {
  it('a solid button picks readable text for its colour when none is chosen', () => {
    const light = buttonRender(resolveDesign({ buttonColor: '#b89753' }), false)!;
    expect(light.style).toMatchObject({ backgroundColor: '#b89753', color: '#171717' });
    const dark = buttonRender(resolveDesign({ buttonColor: '#111111' }), false)!;
    expect(dark.style).toMatchObject({ backgroundColor: '#111111', color: '#ffffff' });
    expect(light.className).toContain('rounded-full');
    expect(light.className).toContain('min-h-6');
  });

  it('defaults follow the slide: white on a dark slide, near-black on a light one', () => {
    expect(buttonRender(resolveDesign({ buttonStyle: 'solid' }), true)!.style).toMatchObject({ backgroundColor: '#ffffff', color: '#171717' });
    expect(buttonRender(resolveDesign({ buttonStyle: 'solid' }), false)!.style).toMatchObject({ backgroundColor: '#111111', color: '#ffffff' });
  });

  it('outline, soft and link each look like themselves', () => {
    const outline = buttonRender(resolveDesign({ buttonStyle: 'outline', buttonColor: '#ffffff' }), true)!;
    expect(outline.className).toContain('border-2');
    expect(outline.style).toMatchObject({ borderColor: '#ffffff', color: '#ffffff', backgroundColor: 'transparent' });
    const soft = buttonRender(resolveDesign({ buttonStyle: 'soft', buttonColor: '#b89753' }), false)!;
    expect(soft.style).toMatchObject({ backgroundColor: 'rgba(184, 151, 83, 0.16)', color: '#b89753' });
    const link = buttonRender(resolveDesign({ buttonStyle: 'link', buttonColor: '#6b5428' }), false)!;
    expect(link.className).toContain('underline');
    expect(link.style).toMatchObject({ color: '#6b5428', backgroundColor: 'transparent' });
  });

  it('shape and size choose from fixed classes', () => {
    const b = buttonRender(resolveDesign({ buttonShape: 'square', buttonSize: 'sm', buttonColor: '#111111' }), false)!;
    expect(b.className).toContain('rounded-none');
    expect(b.className).toContain('px-2.5 py-1 text-[10px]');
    const big = buttonRender(resolveDesign({ buttonShape: 'rounded', buttonSize: 'lg', buttonColor: '#111111' }), false)!;
    expect(big.className).toContain('rounded-lg');
    expect(big.className).toContain('px-5 py-2.5 text-sm');
  });

  it('a hover colour is set through a variable, never as raw CSS from the settings', () => {
    const b = buttonRender(resolveDesign({ buttonColor: '#2563eb' }), false)!;
    expect(b.className).toContain('hover:[background-color:var(--pb-hover)]');
    expect((b.style as Record<string, string>)['--pb-hover']).toBe('#2055ca'); // 14% darker
  });
});

describe('contrast', () => {
  it('knows the colour behind a slide\'s text on each layout, and when a photo is behind it', () => {
    expect(slideBackground({ bgStyle: 'dark' })).toBe('#111111');
    expect(slideBackground({})).toBe('#ededed');
    expect(slideBackground({ bgStyle: 'custom_color', customBgColor: '#123456' })).toBe('#123456');
    expect(slideBackground({ bgStyle: 'custom_color', customBgColor: 'nonsense' })).toBe('#1a1a1a');
    const photo = { imageUrl: 'https://x/y.jpg' };
    // On the slider only an image-only slide has its text on the photo.
    expect(slideBackground({ type: 'image_only', ...photo })).toBeNull();
    expect(slideBackground({ type: 'custom', ...photo })).toBe('#ededed');
    expect(slideBackground({ type: 'custom', ...photo, imageOverlay: 30 })).toBe('#ededed');
    // On a card every picture is behind the text.
    expect(slideBackground({ type: 'custom', ...photo }, 'cards')).toBeNull();
    expect(slideBackground({ type: 'custom' }, 'cards')).toBe('#ededed');
    // A product's own picture counts although the slide has no address of its own.
    expect(slideBackground({ type: 'product_promotion' }, 'cards', true)).toBeNull();
    expect(slideBackground({ type: 'product_promotion' }, 'slider', true)).toBe('#ededed');
  });

  it('says when text sits on something dark', () => {
    expect(isDarkSlide({ bgStyle: 'gold_gradient' })).toBe(true);
    expect(isDarkSlide({ bgStyle: 'custom_color' })).toBe(false);
    expect(onDarkBackground({}, 'slider', true)).toBe(false);
    expect(onDarkBackground({}, 'cards', true)).toBe(true);
    expect(onDarkBackground({}, 'cards', false)).toBe(false);
    expect(onDarkBackground({ bgStyle: 'dark' }, 'slider', false)).toBe(true);
  });

  it('reports the WCAG AA ratio, or nothing when a colour is missing', () => {
    expect(contrastNote('#000000', '#ffffff')).toEqual({ ratio: 21, ok: true });
    expect(contrastNote('#767676', '#ffffff')).toEqual({ ratio: 4.5, ok: true });
    // 4.48:1 fails, and does not show as the 4.5 that passes.
    expect(contrastNote('#777777', '#ffffff')).toEqual({ ratio: 4.4, ok: false });
    expect(contrastNote('#999999', '#ffffff')!.ok).toBe(false);
    expect(contrastNote(undefined, '#ffffff')).toBeNull();
    expect(contrastNote('#000000', null)).toBeNull();
  });
});

describe('mixing colours', () => {
  it('lays one colour over another and refuses anything that is not a colour', () => {
    expect(blend('#b89753', '#fafafa', 0.16)).toBe('#efeadf');
    expect(blend('#ff0000', '#000000', 0.5)).toBe('#800000');
    expect(blend('#fff', '#000', 1)).toBe('#ffffff');
    expect(blend('#fff', '#000', 0)).toBe('#000000');
    expect(blend('red', '#000000', 0.5)).toBeNull();
    expect(blend('#fff', 'url(x)', 0.5)).toBeNull();
  });
});

describe('contrast of a designed button', () => {
  const d = (slide: object) => resolveDesign(slide);

  it('has none to report until the button is designed', () => {
    expect(buttonContrast(d({}), false, '#fafafa')).toBeNull();
    expect(buttonContrast(d({ buttonAlign: 'center' }), false, '#fafafa')).toBeNull();
  });

  it('a solid button is its text against its own fill, and picks readable text by itself', () => {
    expect(buttonContrast(d({ buttonStyle: 'solid', buttonColor: '#b89753', buttonTextColor: '#ffffff' }), false, '#fafafa')).toEqual({ ratio: 2.7, ok: false });
    expect(buttonContrast(d({ buttonStyle: 'solid', buttonColor: '#b89753' }), false, '#fafafa')).toEqual({ ratio: 6.4, ok: true });
    expect(buttonContrast(d({ buttonStyle: 'solid' }), true, '#111111')).toEqual({ ratio: 17.9, ok: true });
  });

  it('a soft button is its text against its tint of the slide', () => {
    expect(buttonContrast(d({ buttonStyle: 'soft', buttonColor: '#b89753' }), false, '#fafafa')).toEqual({ ratio: 2.3, ok: false });
    expect(buttonContrast(d({ buttonStyle: 'soft', buttonColor: '#6b5428' }), false, '#fafafa')).toEqual({ ratio: 5.4, ok: true });
  });

  it('an outline or a link is its text against the slide itself', () => {
    expect(buttonContrast(d({ buttonStyle: 'outline', buttonColor: '#ffffff' }), true, '#111111')).toEqual({ ratio: 18.8, ok: true });
    expect(buttonContrast(d({ buttonStyle: 'outline', buttonColor: '#ffffff' }), false, '#fafafa')).toEqual({ ratio: 1, ok: false });
    expect(buttonContrast(d({ buttonStyle: 'link', buttonColor: '#b89753', buttonTextColor: '#111111' }), false, '#fafafa')).toEqual({ ratio: 18, ok: true });
  });

  it('cannot say anything over a photo, except for a solid button, which carries its own fill', () => {
    expect(buttonContrast(d({ buttonStyle: 'outline', buttonColor: '#ffffff' }), true, null)).toBeNull();
    expect(buttonContrast(d({ buttonStyle: 'soft', buttonColor: '#ffffff' }), true, null)).toBeNull();
    expect(buttonContrast(d({ buttonStyle: 'solid', buttonColor: '#111111' }), true, null)).toEqual({ ratio: 18.8, ok: true });
  });
});

describe('presets', () => {
  it('cover every design field in the clearing list, and nothing outside it', () => {
    expect(DESIGN_KEYS).toHaveLength(12);
    expect(Object.keys(CLEARED_DESIGN).sort()).toEqual([...DESIGN_KEYS].sort());
    for (const preset of PROMO_DESIGN_PRESETS) {
      for (const key of Object.keys(preset.design)) {
        expect([...DESIGN_KEYS, 'bgStyle'], `${preset.id}.${key}`).toContain(key);
      }
    }
  });

  it('survive the checks unchanged, so what they set is what shows', () => {
    for (const { id, design } of PROMO_DESIGN_PRESETS) {
      const d = resolveDesign(design);
      expect(d.align, id).toBe(design.textAlign);
      expect(d.position, id).toBe(design.textPosition);
      expect(d.titleColor, id).toBe(design.titleColor);
      expect(d.badgeColor, id).toBe(design.badgeColor);
      expect(d.descriptionColor, id).toBe(design.descriptionColor);
      expect(d.button.style, id).toBe(design.buttonStyle);
      expect(d.overlay, id).toBe(design.imageOverlay ?? 0);
    }
  });

  it('keep their texts and buttons readable on the background they set', () => {
    for (const { id, design } of PROMO_DESIGN_PRESETS) {
      const bg = slideBackground({ bgStyle: design.bgStyle });
      if (!design.bgStyle) continue; // over a photo: the overlay is what makes it readable
      for (const key of ['badgeColor', 'titleColor', 'descriptionColor'] as const) {
        expect(contrastNote(design[key], bg)?.ok, `${id}.${key} on ${bg}`).toBe(true);
      }
      if (design.buttonStyle === 'link') expect(contrastNote(design.buttonColor, bg)?.ok, `${id} link`).toBe(true);
      if (design.buttonStyle === 'solid') {
        expect(contrastNote(design.buttonTextColor, design.buttonColor)?.ok, `${id} button`).toBe(true);
      }
    }
  });
});
