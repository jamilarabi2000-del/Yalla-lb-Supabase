import React, { useEffect, useId, useState } from 'react';
import {
  AlertCircle, AlignCenter, AlignLeft, AlignRight, Check, Monitor, Palette, RotateCcw, Smartphone, Undo2,
} from 'lucide-react';
import type { CMSPromoSlide } from '../../../types';
import { readableTextOn } from '../../../lib/colorContrast';
import {
  CLEARED_DESIGN, DESIGN_KEYS, MAX_OVERLAY, PROMO_DESIGN_PRESETS,
  buttonContrast, contrastNote, onDarkBackground, resolveDesign, safeColor, slideBackground,
  type ContrastNote, type PromoLayout, type PromoTextAlign, type PromoTextPosition,
} from '../../../lib/promoSlideDesign';

// Everything here edits optional fields of one slide (see promoSlideDesign.ts):
// a setting left on Auto stores nothing, and the slide looks as it always did.

/** The design fields plus the background some presets also set: what "Undo" puts back. */
const SNAPSHOT_KEYS = [...DESIGN_KEYS, 'bgStyle'] as const;
const snapshot = (slide: CMSPromoSlide): Partial<CMSPromoSlide> =>
  Object.fromEntries(SNAPSHOT_KEYS.map(k => [k, slide[k]])) as Partial<CMSPromoSlide>;

const hasDesign = (slide: CMSPromoSlide) =>
  DESIGN_KEYS.some(k => {
    const v = slide[k];
    return v !== undefined && v !== null && v !== '' && !(k === 'imageOverlay' && !Number(v));
  });

// ---------------------------------------------------------------- small parts

interface Option { value: string; label: string; Icon?: typeof AlignLeft }

/** A row of buttons of which one is on. Buttons with `aria-pressed`, so every one is reachable by keyboard. */
const Segmented: React.FC<{
  label: string; value: string; options: Option[]; onPick: (value: string) => void; disabled?: boolean;
}> = ({ label, value, options, onPick, disabled }) => (
  <div role="group" aria-label={label} className="inline-flex flex-wrap items-center gap-1">
    {options.map(({ value: v, label: text, Icon }) => {
      const on = value === v;
      return (
        <button
          key={v}
          type="button"
          aria-pressed={on}
          disabled={disabled}
          onClick={() => onPick(v)}
          className={`inline-flex items-center gap-1 min-h-8 px-2.5 py-1 rounded-lg border text-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            on
              ? 'border-[#B89753] bg-[#B89753]/10 text-[#6B5428] font-bold ring-1 ring-[#B89753]'
              : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
          }`}
        >
          {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
          <span>{text}</span>
        </button>
      );
    })}
  </div>
);

const Chip: React.FC<{ note: ContrastNote | null; photo: boolean }> = ({ note, photo }) => {
  if (photo) {
    return <p className="mt-1 text-[11px] text-neutral-700">On a photo: check the preview, and darken the photo if the text is hard to read.</p>;
  }
  if (!note) return null;
  return note.ok ? (
    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5">
      <Check className="w-3 h-3" aria-hidden="true" />
      <span>Contrast {note.ratio}:1, easy to read</span>
    </p>
  ) : (
    <p role="status" className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5">
      <AlertCircle className="w-3 h-3" aria-hidden="true" />
      <span>Contrast {note.ratio}:1, hard to read (aim for 4.5:1 or more)</span>
    </p>
  );
};

/** Colour picker + hex box + Auto. The hex box commits only a complete, valid colour. */
const ColorField: React.FC<{
  label: string; value?: string; auto: string; onChange: (value: string | undefined) => void; children?: React.ReactNode;
}> = ({ label, value, auto, onChange, children }) => {
  const id = useId();
  const [draft, setDraft] = useState(value ?? '');
  // Follow the stored value unless the box already says the same colour (typing "#fff" stores "#ffffff").
  useEffect(() => { setDraft(d => (safeColor(d) === value && d !== '' ? d : value ?? '')); }, [value]);

  const typed = draft.trim();
  const invalid = typed !== '' && !safeColor(typed.startsWith('#') ? typed : `#${typed}`);

  const commit = () => {
    if (typed === '') { onChange(undefined); return; }
    const color = safeColor(typed.startsWith('#') ? typed : `#${typed}`);
    if (color) { onChange(color); setDraft(color); } else setDraft(value ?? '');
  };

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-neutral-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}, colour picker`}
          value={safeColor(value) ?? safeColor(auto) ?? '#000000'}
          onChange={(e) => onChange(safeColor(e.target.value))}
          className="w-8 h-8 rounded border border-neutral-300 cursor-pointer shrink-0"
        />
        <input
          id={id}
          type="text"
          dir="ltr"
          spellCheck={false}
          maxLength={7}
          placeholder="Auto"
          value={draft}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value.trim())) onChange(safeColor(e.target.value));
          }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          className={`w-24 px-2.5 py-1.5 text-xs rounded border font-mono bg-white ${invalid ? 'border-rose-500' : 'border-neutral-300'}`}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`${label}: use the automatic colour`}
            className="text-[11px] font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900 cursor-pointer min-h-6"
          >
            Auto
          </button>
        )}
      </div>
      {invalid && <p className="mt-1 text-[11px] text-rose-700">Use a colour code such as #b89753.</p>}
      {children}
    </div>
  );
};

/** Desktop slider / phone cards, for the preview. */
export const PromoPreviewSwitch: React.FC<{
  value: PromoLayout; onChange: (value: PromoLayout) => void; tone?: 'light' | 'dark';
}> = ({ value, onChange, tone = 'light' }) => {
  const dark = tone === 'dark';
  const options: { value: PromoLayout; label: string; Icon: typeof Monitor }[] = [
    { value: 'slider', label: 'Desktop slider', Icon: Monitor },
    { value: 'cards', label: 'Phone & tablet cards', Icon: Smartphone },
  ];
  return (
    <div
      role="group"
      aria-label="Preview layout"
      className={`inline-flex items-center gap-1 p-1 rounded-xl border text-xs font-medium ${dark ? 'bg-neutral-900 border-neutral-700' : 'bg-neutral-100 border-neutral-200'}`}
    >
      {options.map(({ value: v, label, Icon }) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(v)}
            className={`inline-flex items-center gap-1.5 min-h-7 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              on
                ? 'bg-white text-neutral-900 shadow-xs font-bold'
                : dark ? 'text-neutral-300 hover:text-white' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
};

// ----------------------------------------------------------------- the panel

const ALIGN_OPTIONS: Option[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'start', label: 'Left', Icon: AlignLeft },
  { value: 'center', label: 'Center', Icon: AlignCenter },
  { value: 'end', label: 'Right', Icon: AlignRight },
];

const STYLE_OPTIONS: Option[] = [
  { value: 'auto', label: 'Default' },
  { value: 'solid', label: 'Solid' },
  { value: 'outline', label: 'Outline' },
  { value: 'soft', label: 'Soft' },
  { value: 'link', label: 'Link' },
];
const SHAPE_OPTIONS: Option[] = [
  { value: 'pill', label: 'Pill' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'square', label: 'Square' },
];
const SIZE_OPTIONS: Option[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
];

const SPOTS: { align: PromoTextAlign; position: PromoTextPosition; label: string }[] = [
  { align: 'start', position: 'top', label: 'Top left' },
  { align: 'center', position: 'top', label: 'Top center' },
  { align: 'end', position: 'top', label: 'Top right' },
  { align: 'start', position: 'middle', label: 'Middle left' },
  { align: 'center', position: 'middle', label: 'Middle center' },
  { align: 'end', position: 'middle', label: 'Middle right' },
  { align: 'start', position: 'bottom', label: 'Bottom left' },
  { align: 'center', position: 'bottom', label: 'Bottom center' },
  { align: 'end', position: 'bottom', label: 'Bottom right' },
];

export interface PromoSlideDesignPanelProps {
  slide: CMSPromoSlide;
  /** The layout the preview shows; contrast is judged against what sits behind the text there. */
  layout: PromoLayout;
  onLayoutChange: (layout: PromoLayout) => void;
  /** Whether the slide has a picture, its own or its product's. */
  hasPhoto: boolean;
  onChange: (updates: Partial<CMSPromoSlide>) => void;
  /** The slide as visitors see it, rendered by the editor. */
  preview?: React.ReactNode;
}

export const PromoSlideDesignPanel: React.FC<PromoSlideDesignPanelProps> = ({
  slide, layout, onLayoutChange, hasPhoto, onChange, preview,
}) => {
  const [undo, setUndo] = useState<{ label: string; previous: Partial<CMSPromoSlide> } | null>(null);

  const design = resolveDesign(slide);
  const type = slide.type ?? 'custom';
  const isImageOnly = type === 'image_only';
  const isProduct = type === 'product_promotion';
  const canPosition = type === 'image_only' || type === 'text_only';
  const buttonApplies = !isImageOnly && slide.showCta !== false;
  const darkening = hasPhoto && type !== 'text_only';

  const behind = slideBackground(slide, layout, hasPhoto);
  const dark = onDarkBackground(slide, layout, hasPhoto);
  const button = design.button;
  const buttonFill = button.color ?? (dark ? '#ffffff' : '#111111');

  /** A change by hand: the offer to undo a preset no longer describes the slide. */
  const change = (updates: Partial<CMSPromoSlide>) => { setUndo(null); onChange(updates); };
  const replaceDesign = (label: string, updates: Partial<CMSPromoSlide>) => {
    setUndo({ label, previous: snapshot(slide) });
    onChange(updates);
  };

  const textChip = (color: string | undefined) => (
    color ? <Chip note={contrastNote(color, behind)} photo={behind === null} /> : null
  );
  const buttonChip = button.custom
    ? <Chip note={buttonContrast(design, dark, behind)} photo={behind === null && button.style !== 'solid'} />
    : null;

  const overlay = design.overlay;

  return (
    <div className="space-y-4 pt-4 border-t border-neutral-100" data-testid="promo-design-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
          <Palette className="w-4 h-4 text-[#6B5428]" aria-hidden="true" />
          <span>Text & Button Design</span>
        </h4>
        {hasDesign(slide) && (
          <button
            type="button"
            onClick={() => replaceDesign('Reset', CLEARED_DESIGN)}
            className="inline-flex items-center gap-1 min-h-7 px-2 rounded-lg text-xs font-medium text-neutral-700 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset design</span>
          </button>
        )}
      </div>
      <p className="text-[11px] text-neutral-600 -mt-2">
        Optional. Anything left on Auto looks as it always did. These settings are the same on every screen size, and on the
        Arabic site left and right swap sides.
      </p>

      {undo && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-neutral-800 bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5">
          <span>{undo.label === 'Reset' ? 'Design reset.' : `Applied “${undo.label}”.`}</span>
          <button
            type="button"
            onClick={() => { onChange(undo.previous); setUndo(null); }}
            className="inline-flex items-center gap-1 font-bold text-[#6B5428] underline underline-offset-2 cursor-pointer min-h-6"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Undo</span>
          </button>
        </p>
      )}

      {/* The slide as visitors see it, next to the controls */}
      <div className="rounded-xl bg-neutral-100 border border-neutral-200 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-700">Preview of this slide</span>
          <PromoPreviewSwitch value={layout} onChange={onLayoutChange} />
        </div>
        <div className="max-w-[480px] mx-auto w-full">{preview}</div>
      </div>

      {/* One-click starting points */}
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-neutral-700">Start from a preset</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PROMO_DESIGN_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              onClick={() => replaceDesign(preset.label, { ...CLEARED_DESIGN, ...preset.design })}
              className="p-2 rounded-xl border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 hover:border-[#B89753] text-left cursor-pointer transition-all"
            >
              <div className="text-xs font-bold text-neutral-900">{preset.label}</div>
              <div className="text-[10px] text-neutral-600 leading-snug">{preset.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Alignment and position */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-start">
        <div className="space-y-2">
          <span className="block text-xs font-medium text-neutral-700">Text alignment</span>
          <Segmented
            label="Text alignment"
            value={design.align ?? 'auto'}
            options={ALIGN_OPTIONS}
            onPick={(v) => change({ textAlign: v === 'auto' ? undefined : v as PromoTextAlign })}
          />
          <p className="text-[11px] text-neutral-600">
            {isImageOnly
              ? 'Moves the badge and title.'
              : type === 'text_only'
                ? 'Moves the badge, title, description and button.'
                : 'Stacks the title above the button and aligns both.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-neutral-700">Text position</span>
          <div
            role="group"
            aria-label="Text position"
            className="grid grid-cols-3 gap-1 w-[132px] p-1.5 rounded-lg bg-neutral-100 border border-neutral-200"
          >
            {SPOTS.map(spot => {
              const on = canPosition && design.align === spot.align && design.position === spot.position;
              return (
                <button
                  key={spot.label}
                  type="button"
                  disabled={!canPosition}
                  aria-pressed={on}
                  aria-label={spot.label}
                  title={spot.label}
                  onClick={() => change({ textAlign: spot.align, textPosition: spot.position })}
                  className={`h-8 rounded-md border flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    on ? 'bg-[#6B5428] border-[#6B5428]' : 'bg-white border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  <span aria-hidden="true" className={`block w-2 h-2 rounded-full ${on ? 'bg-white' : 'bg-neutral-500'}`} />
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-neutral-600 max-w-[200px]">
            {canPosition
              ? 'Picks the side and the height together.'
              : 'Only for Image only and Text only slides. This layout keeps its picture in the middle and its text at the bottom.'}
          </p>
        </div>
      </div>

      {/* Text colours */}
      <div className="space-y-2">
        <span className="block text-xs font-bold text-neutral-900">Text colours</span>
        <div className={`grid grid-cols-1 ${isImageOnly ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-4 p-3 rounded-xl bg-neutral-50 border border-neutral-200`}>
          <ColorField label="Badge colour" value={design.badgeColor} auto={dark || isImageOnly ? '#f3e5ab' : '#595959'} onChange={(c) => change({ badgeColor: c })}>
            {textChip(design.badgeColor)}
          </ColorField>
          <ColorField label="Title colour" value={design.titleColor} auto={dark || isImageOnly ? '#ffffff' : '#111111'} onChange={(c) => change({ titleColor: c })}>
            {textChip(design.titleColor)}
          </ColorField>
          {!isImageOnly && (
            <ColorField label="Description colour" value={design.descriptionColor} auto={dark ? '#d4d4d4' : '#666666'} onChange={(c) => change({ descriptionColor: c })}>
              {textChip(design.descriptionColor)}
            </ColorField>
          )}
        </div>
        {!isImageOnly && (
          <p className="text-[11px] text-neutral-600">The phone and tablet cards show the badge, title and button, not the description.</p>
        )}
      </div>

      {/* Button */}
      <div className="space-y-2">
        <span className="block text-xs font-bold text-neutral-900">Button</span>
        {!buttonApplies ? (
          <p className="text-[11px] text-neutral-600 p-3 rounded-xl bg-neutral-50 border border-neutral-200">
            {isImageOnly
              ? 'An Image only slide has no button: tapping the picture opens its link.'
              : 'This slide has its button switched off (see the call to action above).'}
          </p>
        ) : (
          <div className="space-y-3 p-3 rounded-xl bg-neutral-50 border border-neutral-200">
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-neutral-700">Style</span>
              <Segmented
                label="Button style"
                value={button.custom ? button.style : 'auto'}
                options={STYLE_OPTIONS}
                // A button's text colour belongs to its style (on its fill, or on the slide), so a new style starts with automatic text.
                onPick={(v) => change(v === 'auto'
                  ? { buttonStyle: undefined, buttonColor: undefined, buttonTextColor: undefined, buttonShape: undefined, buttonSize: undefined }
                  : { buttonStyle: v as typeof button.style, ...(v !== button.style && { buttonTextColor: undefined }) })}
              />
              {isProduct && (
                <p className="text-[11px] text-neutral-600">On the desktop slider this styles the “Add” button. Product cards on phones have no button; the card opens the product.</p>
              )}
            </div>

            {button.custom && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ColorField label="Button colour" value={button.color} auto={buttonFill} onChange={(c) => change({ buttonColor: c })} />
                  <ColorField
                    label="Button text colour"
                    value={button.textColor}
                    auto={button.style === 'solid' ? readableTextOn(buttonFill) : buttonFill}
                    onChange={(c) => change({ buttonTextColor: c })}
                  >
                    {buttonChip}
                  </ColorField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-neutral-700">Shape</span>
                    <Segmented label="Button shape" value={button.shape} options={SHAPE_OPTIONS} onPick={(v) => change({ buttonShape: v as typeof button.shape })} />
                  </div>
                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-neutral-700">Size</span>
                    <Segmented label="Button size" value={button.size} options={SIZE_OPTIONS} onPick={(v) => change({ buttonSize: v as typeof button.size })} />
                  </div>
                </div>
              </>
            )}

            {!isProduct && (
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-neutral-700">Button position</span>
                <Segmented
                  label="Button position"
                  value={design.button.align ?? 'auto'}
                  options={ALIGN_OPTIONS}
                  onPick={(v) => change({ buttonAlign: v === 'auto' ? undefined : v as PromoTextAlign })}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Photo darkening */}
      {darkening && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="promo-design-overlay" className="text-xs font-bold text-neutral-900">Photo darkening</label>
            <span className="text-xs font-mono text-neutral-700">{overlay > 0 ? `${overlay}%` : 'Off'}</span>
          </div>
          <input
            id="promo-design-overlay"
            type="range"
            min={0}
            max={MAX_OVERLAY}
            step={5}
            value={overlay}
            aria-valuetext={overlay > 0 ? `${overlay} percent` : 'Off'}
            onChange={(e) => change({ imageOverlay: Number(e.target.value) || undefined })}
            className="w-full accent-[#6B5428] cursor-pointer"
          />
          <p className="text-[11px] text-neutral-600">
            {isImageOnly
              ? 'Darkens the picture so light text on top stays readable.'
              : 'Darkens the picture behind the text on the phone and tablet cards. On the desktop slider this slide shows its picture in the middle, so nothing is darkened there.'}
          </p>
        </div>
      )}
    </div>
  );
};
