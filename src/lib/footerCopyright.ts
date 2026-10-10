/**
 * Where the footer's copyright and attribution notice sits (Admin > CMS Studio > Footer > Footer Copyright & Bottom
 * Attribution Notice). Two settings, both optional; nothing saved looks exactly as the footer always has.
 *
 * - Alignment: Auto (left on a computer, centred on a phone), or Left / Center / Right on every screen. Left and
 *   Right are the start and end of the line, so in Arabic they mirror, as the footer's icon alignment does.
 * - Vertical position: Up (the text sits close under the divider line), Normal, or Down (further below it).
 *
 * The saved values are only ever looked up in the tables below: anything else counts as "not set", and nothing the
 * admin types can become a CSS class.
 */
export type CopyrightAlign = 'auto' | 'start' | 'center' | 'end';
export type CopyrightSpacing = 'tight' | 'normal' | 'roomy';

type Saved = { copyrightAlign?: unknown; copyrightSpacing?: unknown } | null | undefined;

export const copyrightAlign = (footer: Saved): CopyrightAlign => {
  const value = footer?.copyrightAlign;
  return value === 'start' || value === 'center' || value === 'end' ? value : 'auto';
};

export const copyrightSpacing = (footer: Saved): CopyrightSpacing => {
  const value = footer?.copyrightSpacing;
  return value === 'tight' || value === 'roomy' ? value : 'normal';
};

const TOP_PADDING: Record<CopyrightSpacing, string> = { tight: 'pt-1', normal: 'pt-4', roomy: 'pt-10' };

const BAR_BY_ALIGN: Record<CopyrightAlign, string> = {
  auto: 'flex-col sm:flex-row items-center justify-between',
  start: 'flex-row items-center justify-start',
  center: 'flex-row items-center justify-center',
  end: 'flex-row items-center justify-end',
};

const TEXT_BY_ALIGN: Record<CopyrightAlign, string> = {
  auto: 'text-center sm:text-start',
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
};

/** The notice's bar: the divider line, the room above the text, and where along the line the text sits. */
export const copyrightBarClasses = (footer: Saved): string =>
  `${TOP_PADDING[copyrightSpacing(footer)]} border-t border-white/10 w-full flex ${BAR_BY_ALIGN[copyrightAlign(footer)]} gap-3 text-[11px] text-neutral-400 relative`;

/** The text itself: how its lines line up when it has more than one. */
export const copyrightTextClasses = (footer: Saved): string =>
  `whitespace-pre-line ${TEXT_BY_ALIGN[copyrightAlign(footer)]} leading-relaxed`;

export const COPYRIGHT_ALIGN_OPTIONS: readonly { value: CopyrightAlign; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Left on a computer, centred on a phone (as before)' },
  { value: 'start', label: 'Left', hint: 'Left on every screen (right in Arabic)' },
  { value: 'center', label: 'Center', hint: 'Centred on every screen' },
  { value: 'end', label: 'Right', hint: 'Right on every screen (left in Arabic)' },
];

export const COPYRIGHT_SPACING_OPTIONS: readonly { value: CopyrightSpacing; label: string; hint: string }[] = [
  { value: 'tight', label: 'Up', hint: 'Close under the divider line' },
  { value: 'normal', label: 'Normal', hint: 'The usual distance' },
  { value: 'roomy', label: 'Down', hint: 'Further below the divider line' },
];
