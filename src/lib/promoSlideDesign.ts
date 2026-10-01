import type React from 'react';
import type { CMSPromoSlide } from '../types';
import { contrastRatio, darken, parseHex, readableTextOn } from './colorContrast';

/**
 * The text and button design an administrator gives one promo slide.
 *
 * Every field is optional: a slide that sets none of them looks exactly as it
 * did before. What is stored is plain JSON in the site settings, so anything
 * read back is checked here before it reaches the page: choices come from the
 * lists below, colours must be #rgb / #rrggbb, and nothing is ever passed on
 * as raw CSS.
 */

export const TEXT_ALIGNS = ['start', 'center', 'end'] as const;
export const TEXT_POSITIONS = ['top', 'middle', 'bottom'] as const;
export const BUTTON_STYLES = ['solid', 'outline', 'soft', 'link'] as const;
export const BUTTON_SHAPES = ['pill', 'rounded', 'square'] as const;
export const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;
export const MAX_OVERLAY = 70;

export type PromoTextAlign = typeof TEXT_ALIGNS[number];
export type PromoTextPosition = typeof TEXT_POSITIONS[number];
export type PromoButtonStyle = typeof BUTTON_STYLES[number];
export type PromoButtonShape = typeof BUTTON_SHAPES[number];
export type PromoButtonSize = typeof BUTTON_SIZES[number];

/** Every design field of a slide, for clearing them all at once. */
export const DESIGN_KEYS = [
  'textAlign', 'textPosition', 'badgeColor', 'titleColor', 'descriptionColor',
  'buttonStyle', 'buttonColor', 'buttonTextColor', 'buttonShape', 'buttonSize', 'buttonAlign', 'imageOverlay',
] as const satisfies readonly (keyof CMSPromoSlide)[];

export const CLEARED_DESIGN: Partial<CMSPromoSlide> = Object.fromEntries(DESIGN_KEYS.map(k => [k, undefined]));

const pick = <T extends string>(allowed: readonly T[], value: unknown): T | undefined =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : undefined;

/** `#rrggbb` in lower case, or undefined when the value is not a hex colour. */
export function safeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const rgb = parseHex(value);
  return rgb ? '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('') : undefined;
}

export function safeOverlay(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(MAX_OVERLAY, Math.max(0, Math.round(n))) : 0;
}

export interface PromoDesign {
  align?: PromoTextAlign;
  position?: PromoTextPosition;
  badgeColor?: string;
  titleColor?: string;
  descriptionColor?: string;
  button: {
    /** True when the administrator changed anything about the button. */
    custom: boolean;
    style: PromoButtonStyle;
    color?: string;
    textColor?: string;
    shape: PromoButtonShape;
    size: PromoButtonSize;
    align?: PromoTextAlign;
  };
  /** 0-70: how much the photo is darkened under the text. */
  overlay: number;
}

export function resolveDesign(slide: Partial<CMSPromoSlide> | null | undefined): PromoDesign {
  const s = slide ?? {};
  const style = pick(BUTTON_STYLES, s.buttonStyle);
  const shape = pick(BUTTON_SHAPES, s.buttonShape);
  const size = pick(BUTTON_SIZES, s.buttonSize);
  const color = safeColor(s.buttonColor);
  const textColor = safeColor(s.buttonTextColor);
  return {
    align: pick(TEXT_ALIGNS, s.textAlign),
    position: pick(TEXT_POSITIONS, s.textPosition),
    badgeColor: safeColor(s.badgeColor),
    titleColor: safeColor(s.titleColor),
    descriptionColor: safeColor(s.descriptionColor),
    button: {
      custom: Boolean(style || shape || size || color || textColor),
      style: style ?? 'solid',
      color,
      textColor,
      shape: shape ?? 'pill',
      size: size ?? 'md',
      align: pick(TEXT_ALIGNS, s.buttonAlign),
    },
    overlay: safeOverlay(s.imageOverlay),
  };
}

// Whole class names, so Tailwind finds them.
const TEXT_ALIGN_CLASS: Record<PromoTextAlign, string> = { start: 'text-start', center: 'text-center', end: 'text-end' };
const ITEMS_CLASS: Record<PromoTextAlign, string> = { start: 'items-start', center: 'items-center', end: 'items-end' };
const SELF_CLASS: Record<PromoTextAlign, string> = { start: 'self-start', center: 'self-center', end: 'self-end' };
const JUSTIFY_ROW_CLASS: Record<PromoTextAlign, string> = { start: 'justify-start', center: 'justify-center', end: 'justify-end' };
const JUSTIFY_COL_CLASS: Record<PromoTextPosition, string> = { top: 'justify-start', middle: 'justify-center', bottom: 'justify-end' };
const MARGIN_CLASS: Record<PromoTextPosition, string> = { top: 'mb-auto', middle: 'my-auto', bottom: 'mt-auto' };

/** Alignment classes. They are logical (start/end), so Arabic mirrors by itself. */
export const alignClass = (a?: PromoTextAlign) => (a ? TEXT_ALIGN_CLASS[a] : '');
export const itemsClass = (a?: PromoTextAlign) => (a ? ITEMS_CLASS[a] : '');
export const selfClass = (a?: PromoTextAlign) => (a ? SELF_CLASS[a] : '');
export const justifyRowClass = (a?: PromoTextAlign) => (a ? JUSTIFY_ROW_CLASS[a] : '');
/** Where a column of content sits vertically (for a flex column that fills the slide). */
export const justifyColClass = (p?: PromoTextPosition) => (p ? JUSTIFY_COL_CLASS[p] : '');
/** Where a block sits between a header above it and a button below it. */
export const marginClass = (p?: PromoTextPosition) => (p ? MARGIN_CLASS[p] : '');

export const colorStyle = (color?: string): React.CSSProperties | undefined => (color ? { color } : undefined);

export function overlayStyle(overlay: number): React.CSSProperties | undefined {
  return overlay > 0 ? { backgroundColor: `rgba(0, 0, 0, ${(overlay / 100).toFixed(2)})` } : undefined;
}

const withAlpha = (hex: string, alpha: number): string => {
  const [r, g, b] = parseHex(hex) ?? [0, 0, 0];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** How much of its colour a "soft" button's background takes. */
export const SOFT_BUTTON_ALPHA = 0.16;

/** `fg` laid over `bg` at `alpha` (0-1), as #rrggbb; null when either is not a colour. */
export function blend(fg: string, bg: string, alpha: number): string | null {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) return null;
  return '#' + f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
}

/** The button's own colour, or white on a dark background and near-black on a light one. */
const buttonColor = (b: PromoDesign['button'], dark: boolean): string => b.color ?? (dark ? '#ffffff' : '#111111');

const BUTTON_SHAPE_CLASS: Record<PromoButtonShape, string> = { pill: 'rounded-full', rounded: 'rounded-lg', square: 'rounded-none' };
const BUTTON_SIZE_CLASS: Record<PromoButtonSize, string> = {
  sm: 'px-2.5 py-1 text-[10px]',
  md: 'px-3.5 py-2 text-xs',
  lg: 'px-5 py-2.5 text-sm',
};

export interface ButtonRender { className: string; style: React.CSSProperties }

/**
 * Classes and colours for a slide's button, or null when the administrator has
 * not designed it (the caller then keeps the button it always had).
 * `dark` says whether the slide's own background is dark, for the defaults.
 */
export function buttonRender(design: PromoDesign, dark: boolean): ButtonRender | null {
  const b = design.button;
  if (!b.custom) return null;
  const color = buttonColor(b, dark);
  // 24px high at the smallest size, the minimum comfortable target.
  const common = `inline-flex items-center justify-center gap-1.5 min-h-6 font-bold whitespace-nowrap transition-colors cursor-pointer active:scale-95 ${BUTTON_SHAPE_CLASS[b.shape]} ${BUTTON_SIZE_CLASS[b.size]}`;
  const hover = '[--pb-hover:transparent] hover:[background-color:var(--pb-hover)]';
  const vars = (hoverColor: string) => ({ '--pb-hover': hoverColor }) as React.CSSProperties;

  switch (b.style) {
    case 'outline':
      return {
        className: `${common} border-2 ${hover}`,
        style: { borderColor: color, color: b.textColor ?? color, backgroundColor: 'transparent', ...vars(withAlpha(color, 0.14)) },
      };
    case 'soft':
      return {
        className: `${common} ${hover}`,
        style: { backgroundColor: withAlpha(color, SOFT_BUTTON_ALPHA), color: b.textColor ?? color, ...vars(withAlpha(color, 0.28)) },
      };
    case 'link':
      return {
        className: `${common} underline underline-offset-4 decoration-2 !px-1 ${hover}`,
        style: { color: b.textColor ?? color, backgroundColor: 'transparent', ...vars(withAlpha(color, 0.1)) },
      };
    default:
      return {
        className: `${common} shadow-xs ${hover}`,
        style: { backgroundColor: color, color: b.textColor ?? readableTextOn(color), ...vars(darken(color, 0.14) ?? color) },
      };
  }
}

/** The slider beside the hero (from 1024px) or the row of cards under it (below). */
export type PromoLayout = 'slider' | 'cards';

/** The three backgrounds that make a slide's own colours light text. */
export const isDarkSlide = (slide: Partial<CMSPromoSlide>): boolean =>
  slide.bgStyle === 'dark' || slide.bgStyle === 'gold_gradient' || slide.bgStyle === 'emerald_gradient';

/**
 * Whether a slide's text sits on something dark on `layout`. A card puts its
 * photo behind the text; the slider only does that for an image-only slide.
 */
export const onDarkBackground = (slide: Partial<CMSPromoSlide>, layout: PromoLayout, hasPhoto: boolean): boolean =>
  isDarkSlide(slide) || (layout === 'cards' && hasPhoto);

/**
 * The flat colour behind a slide's text on `layout`, or null when the text sits
 * on a photo (any picture on a card; only an image-only slide on the slider).
 */
export function slideBackground(
  slide: Partial<CMSPromoSlide>,
  layout: PromoLayout = 'slider',
  hasPhoto: boolean = Boolean(slide.imageUrl),
): string | null {
  if (hasPhoto && (layout === 'cards' || slide.type === 'image_only')) return null;
  switch (slide.bgStyle) {
    case 'dark': return '#111111';
    case 'light': return '#fafafa';
    case 'gold_gradient': return '#1a1204';
    case 'emerald_gradient': return '#041610';
    case 'custom_color': return safeColor(slide.customBgColor) ?? '#1a1a1a';
    default: return '#ededed';
  }
}

export interface ContrastNote { ratio: number; ok: boolean }

/** WCAG AA (4.5:1) for text of `fg` on `bg`; null when either is not a colour. */
export function contrastNote(fg: string | undefined, bg: string | null | undefined): ContrastNote | null {
  const f = safeColor(fg);
  const b = safeColor(bg);
  if (!f || !b) return null;
  const ratio = contrastRatio(f, b);
  // Rounded down, so a ratio that fails never shows as the 4.5 that passes.
  return ratio === null ? null : { ratio: Math.floor(ratio * 10 + 1e-9) / 10, ok: ratio >= 4.5 };
}

/**
 * Contrast of a designed button's text against what is behind it: its fill for
 * a solid button, its tint over the slide for a soft one, the slide itself for
 * an outline or a link. Null when the button is not designed or `bg` is a photo.
 */
export function buttonContrast(design: PromoDesign, dark: boolean, bg: string | null): ContrastNote | null {
  const b = design.button;
  if (!b.custom) return null;
  const color = buttonColor(b, dark);
  switch (b.style) {
    case 'solid': return contrastNote(b.textColor ?? readableTextOn(color), color);
    case 'soft': return contrastNote(b.textColor ?? color, bg ? blend(color, bg, SOFT_BUTTON_ALPHA) : null);
    default: return contrastNote(b.textColor ?? color, bg);
  }
}

export interface PromoDesignPreset {
  id: string;
  label: string;
  hint: string;
  design: Partial<CMSPromoSlide>;
}

/** One-click starting points; applying one first clears every design field. */
export const PROMO_DESIGN_PRESETS: PromoDesignPreset[] = [
  {
    id: 'classic-light', label: 'Classic light', hint: 'Dark text on white, black pill button',
    design: {
      bgStyle: 'light', textAlign: 'start', textPosition: 'bottom',
      badgeColor: '#6b5428', titleColor: '#111111', descriptionColor: '#555555',
      buttonStyle: 'solid', buttonColor: '#111111', buttonTextColor: '#ffffff', buttonShape: 'pill', buttonSize: 'md',
    },
  },
  {
    id: 'dark-gold', label: 'Dark gold', hint: 'Light text on black, gold button',
    design: {
      bgStyle: 'dark', textAlign: 'start', textPosition: 'bottom',
      badgeColor: '#f3e5ab', titleColor: '#ffffff', descriptionColor: '#d4d4d4',
      buttonStyle: 'solid', buttonColor: '#b89753', buttonTextColor: '#171717', buttonShape: 'pill', buttonSize: 'md',
    },
  },
  {
    id: 'photo-overlay', label: 'Photo + dark overlay', hint: 'Centred white text over a darkened photo',
    design: {
      textAlign: 'center', textPosition: 'middle',
      badgeColor: '#f3e5ab', titleColor: '#ffffff', descriptionColor: '#f5f5f5',
      buttonStyle: 'outline', buttonColor: '#ffffff', buttonShape: 'pill', buttonSize: 'md', buttonAlign: 'center',
      imageOverlay: 45,
    },
  },
  {
    id: 'minimal-text', label: 'Minimal text', hint: 'Centred text, plain link instead of a button',
    design: {
      bgStyle: 'light', textAlign: 'center', textPosition: 'middle',
      badgeColor: '#6b5428', titleColor: '#111111', descriptionColor: '#555555',
      buttonStyle: 'link', buttonColor: '#6b5428', buttonSize: 'sm', buttonAlign: 'center',
    },
  },
];
