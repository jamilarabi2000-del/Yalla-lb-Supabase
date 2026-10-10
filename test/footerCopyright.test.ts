import { describe, it, expect } from 'vitest';
import {
  copyrightAlign, copyrightSpacing, copyrightBarClasses, copyrightTextClasses,
  COPYRIGHT_ALIGN_OPTIONS, COPYRIGHT_SPACING_OPTIONS,
} from '../src/lib/footerCopyright';

// The footer's copyright and attribution notice could not be aligned or moved by the admin: only its text, a show/hide
// switch and a pixel nudge in Style Text (whose alignment does nothing on a one-line notice).
const tokens = (classes: string) => classes.split(/\s+/);

describe('what is saved', () => {
  it('is Auto and Normal when nothing is saved, so the footer looks as it always has', () => {
    for (const footer of [undefined, null, {}]) {
      expect(copyrightAlign(footer)).toBe('auto');
      expect(copyrightSpacing(footer)).toBe('normal');
    }
  });

  it('accepts Left, Center and Right (start, center, end), and Up and Down (tight, roomy)', () => {
    for (const value of ['start', 'center', 'end', 'auto'] as const) expect(copyrightAlign({ copyrightAlign: value })).toBe(value);
    for (const value of ['tight', 'normal', 'roomy'] as const) expect(copyrightSpacing({ copyrightSpacing: value })).toBe(value);
  });

  it('treats anything else as not set, so nothing typed into the settings can become a style', () => {
    for (const value of ['left', 'LEFT', 'top', 'pt-99', '<script>', '', 7, null, {}, ['center']]) {
      expect(copyrightAlign({ copyrightAlign: value }), String(value)).toBe('auto');
      expect(copyrightSpacing({ copyrightSpacing: value }), String(value)).toBe('normal');
    }
  });
});

describe('the classes', () => {
  it('are exactly the footer\'s old ones by default', () => {
    expect(tokens(copyrightBarClasses({}))).toEqual([
      'pt-4', 'border-t', 'border-white/10', 'w-full', 'flex', 'flex-col', 'sm:flex-row', 'items-center', 'justify-between', 'gap-3',
      'text-[11px]', 'text-neutral-400', 'relative',
    ]);
    expect(tokens(copyrightTextClasses({}))).toEqual(['whitespace-pre-line', 'text-center', 'sm:text-start', 'leading-relaxed']);
  });

  it('put the notice at the start, middle or end of the line on every screen', () => {
    const bar = (copyrightAlign: string) => tokens(copyrightBarClasses({ copyrightAlign }));
    expect(bar('start')).toContain('justify-start');
    expect(bar('center')).toContain('justify-center');
    expect(bar('end')).toContain('justify-end');
    for (const side of ['start', 'center', 'end']) {
      expect(bar(side)).toContain('flex-row');
      expect(bar(side)).not.toContain('flex-col');
      expect(bar(side)).not.toContain('sm:flex-row');
    }
  });

  it('line up a notice of several lines the same way', () => {
    const text = (copyrightAlign: string) => tokens(copyrightTextClasses({ copyrightAlign }));
    expect(text('start')).toContain('text-start');
    expect(text('center')).toContain('text-center');
    expect(text('end')).toContain('text-end');
    for (const side of ['start', 'center', 'end']) {
      expect(text(side)).not.toContain('sm:text-start');
      expect(text(side)).toContain('whitespace-pre-line');
    }
  });

  it('move the text closer to the divider (Up) or further from it (Down)', () => {
    const padding = (copyrightSpacing: string) => tokens(copyrightBarClasses({ copyrightSpacing })).find(c => /^pt-/.test(c));
    expect(padding('tight')).toBe('pt-1');
    expect(padding('normal')).toBe('pt-4');
    expect(padding('roomy')).toBe('pt-10');
  });

  it('keep the divider line and the muted text whatever is chosen', () => {
    for (const copyrightAlign of ['auto', 'start', 'center', 'end']) for (const copyrightSpacing of ['tight', 'normal', 'roomy']) {
      const bar = tokens(copyrightBarClasses({ copyrightAlign, copyrightSpacing }));
      for (const needed of ['border-t', 'border-white/10', 'w-full', 'flex', 'items-center', 'text-neutral-400']) expect(bar, `${copyrightAlign}/${copyrightSpacing}`).toContain(needed);
    }
  });
});

describe('the choices offered to the admin', () => {
  it('are Auto, Left, Center, Right and Up, Normal, Down, each with a hint', () => {
    expect(COPYRIGHT_ALIGN_OPTIONS.map(o => [o.value, o.label])).toEqual([['auto', 'Auto'], ['start', 'Left'], ['center', 'Center'], ['end', 'Right']]);
    expect(COPYRIGHT_SPACING_OPTIONS.map(o => [o.value, o.label])).toEqual([['tight', 'Up'], ['normal', 'Normal'], ['roomy', 'Down']]);
    for (const option of [...COPYRIGHT_ALIGN_OPTIONS, ...COPYRIGHT_SPACING_OPTIONS]) expect(option.hint.length).toBeGreaterThan(5);
  });
});
