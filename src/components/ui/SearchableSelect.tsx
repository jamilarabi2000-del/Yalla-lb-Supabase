/**
 * A drop-in replacement for <select>: the same value, onChange and <option>
 * children, but the field itself is typeable. Click or tap it (or its arrow)
 * to see every option, or just type: the list opens and narrows as you write.
 * onChange receives { target: { value } } as the native event would, and
 * fires only when the choice actually changes -- typing alone never changes
 * the value; an option is chosen with a click, Enter, or Tab on the
 * highlighted row, and anything else puts the chosen option's name back.
 *
 * The list is rendered into document.body so a modal or a scrolling panel
 * cannot clip it. Keyboard: arrows, Page Up/Down, Enter or Tab to pick,
 * Escape to close.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { optionMatcher } from '../../lib/optionSearch';
import { EDITOR_ATTR } from '../../lib/textStyleDom';

/** Marks an open list; key handlers elsewhere leave its keys to it. */
export const SELECT_POPOVER_ATTR = 'data-yalla-select-popover';
/** Marks the typeable field of every dropdown. */
export const SELECT_FIELD_ATTR = 'data-yalla-select';
/**
 * An open dropdown -- its list, or its field while the list shows. Escape and
 * the arrow keys belong to it until it closes.
 */
export const OPEN_SELECT_SELECTOR = `[${SELECT_POPOVER_ATTR}], [${SELECT_FIELD_ATTR}][aria-expanded="true"]`;

export interface SelectOption {
  value: string;
  label: string;
  disabled: boolean;
}

/** What onChange receives: the part of the native change event callers use. */
export interface SelectChangeEvent {
  target: { value: string };
  currentTarget: { value: string };
}

export interface SearchableSelectProps {
  value?: string | number | null;
  onChange?: (e: SelectChangeEvent) => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  title?: string;
  'aria-label'?: string;
  'aria-invalid'?: React.AriaAttributes['aria-invalid'];
  'aria-describedby'?: string;
  /** Shown in the field when it is empty. Defaults to "Type to search…", in Arabic when the page is. */
  searchPlaceholder?: string;
}

/** The most rows drawn at once; typing narrows the rest. */
export const MAX_SHOWN = 300;

type Match = SelectOption & { index: number };

interface Position {
  /** The body of the document the control is in. */
  host: HTMLElement;
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  rtl: boolean;
  /** The page is in Arabic (<html lang="ar">), so the list's own words are too. */
  arabic: boolean;
}

const WORDS = {
  en: {
    search: 'Type to search…',
    options: 'Options',
    none: 'No matches',
    more: (shown: number, total: number) => `Showing ${shown} of ${total}. Keep typing to narrow the list.`,
  },
  ar: {
    search: 'اكتب للبحث…',
    options: 'الخيارات',
    none: 'لا توجد نتائج مطابقة',
    more: (shown: number, total: number) => `يظهر ${shown} من ${total}. تابع الكتابة لتضييق القائمة.`,
  },
};

const textOf = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
};

/** The <option>s among `children`, read the way the browser reads them. */
export function readOptions(children: React.ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  const visit = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, child => {
      if (!React.isValidElement(child)) return;
      const props = child.props as { value?: unknown; label?: unknown; disabled?: boolean; children?: React.ReactNode };
      if (child.type === 'option') {
        const text = textOf(props.children).replace(/\s+/g, ' ').trim();
        out.push({
          // Like the browser: no value attribute means the option's text.
          value: props.value === undefined || props.value === null ? text : String(props.value),
          label: typeof props.label === 'string' && props.label ? props.label : text,
          disabled: !!props.disabled,
        });
      } else if (child.type === React.Fragment || child.type === 'optgroup') {
        visit(props.children);
      }
    });
  };
  visit(children);
  return out;
}

/**
 * The option shown as chosen: the one holding `value`, else -- as React does
 * for a <select> whose value matches nothing -- the first enabled one.
 */
export function selectedIndexFor(options: SelectOption[], value: unknown): number {
  const v = value === null || value === undefined ? '' : String(value);
  const i = options.findIndex(o => o.value === v);
  return i >= 0 ? i : options.findIndex(o => !o.disabled);
}

export function filterOptions(options: SelectOption[], query: string): Match[] {
  const matches = optionMatcher(query);
  return options.flatMap((o, index) => (matches(o.label) ? [{ ...o, index }] : []));
}

const firstEnabled = (list: Match[]) => list.findIndex(o => !o.disabled);

const isNode = (t: unknown): t is Node => !!t && typeof (t as Node).nodeType === 'number';

/**
 * Classes that place the control (width, margins, grid and flex placement,
 * display) go on its outer box; the rest -- padding, border, colours, text,
 * focus styles -- dress the field itself, as they dressed the old button.
 */
const LAYOUT_CLASS = /^(?:[a-z0-9-]+:)*-?(?:(?:w|min-w|max-w|basis|grow|shrink|flex|order|col|row|self|justify-self|m|mx|my|mt|mr|mb|ml|ms|me)(?:-|$)|(?:hidden|block|inline-block|inline-flex|contents)$)/;

export function splitSelectClasses(className: string): { box: string; field: string } {
  const box: string[] = [];
  const field: string[] = [];
  for (const token of className.split(/\s+/)) {
    if (token) (LAYOUT_CLASS.test(token) ? box : field).push(token);
  }
  return { box: box.join(' '), field: field.join(' ') };
}

/** Room for the arrow at the end of the field. */
const ARROW_ROOM = '2rem';

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  children,
  className = '',
  disabled,
  id,
  title,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  searchPlaceholder,
}) => {
  const options = readOptions(children);
  const selected = selectedIndexFor(options, value);
  const current = selected >= 0 ? options[selected] : undefined;
  const currentLabel = current?.label ?? '';

  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const boxRef = useRef<HTMLSpanElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  // What the user has typed since the field last showed the chosen option;
  // null while it shows that option.
  const [typed, setTyped] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<Position | null>(null);

  const query = typed ?? '';
  const matches = open ? filterOptions(options, query) : [];
  const shown = matches.slice(0, MAX_SHOWN);
  const activeOption = active >= 0 ? shown[active] : undefined;

  const measure = useCallback((): Position | null => {
    const box = boxRef.current;
    const view = box?.ownerDocument.defaultView;
    if (!box || !view) return null;
    const r = box.getBoundingClientRect();
    const rtl = view.getComputedStyle(box).direction === 'rtl';
    const width = Math.min(Math.max(r.width, 224), view.innerWidth - 16);
    const left = Math.max(8, Math.min(rtl ? r.right - width : r.left, view.innerWidth - width - 8));
    const below = view.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 240 && above > below;
    const maxHeight = Math.max(160, Math.min(360, up ? above : below));
    const host = box.ownerDocument.body;
    const arabic = box.ownerDocument.documentElement.lang.toLowerCase().startsWith('ar');
    return up
      ? { host, left, width, bottom: view.innerHeight - r.top + 4, maxHeight, rtl, arabic }
      : { host, left, width, top: r.bottom + 4, maxHeight, rtl, arabic };
  }, []);

  const isInside = (t: unknown) =>
    isNode(t) && (!!popoverRef.current?.contains(t) || !!boxRef.current?.contains(t));

  /** Closes the list; the field shows the chosen option again. */
  const close = useCallback(() => {
    setOpen(false);
    setTyped(null);
    setActive(-1);
  }, []);

  /** Opens the list for `text`: every option when it is empty. */
  const openList = (text: string) => {
    if (disabled) return;
    const p = measure();
    if (!p) return;
    const list = filterOptions(options, text).slice(0, MAX_SHOWN);
    const at = text ? firstEnabled(list) : list.findIndex(o => o.index === selected);
    setPos(p);
    setActive(at >= 0 ? at : firstEnabled(list));
    setOpen(true);
  };

  const choose = (o: Match | undefined) => {
    if (!o || o.disabled) return;
    const changed = o.value !== current?.value;
    close();
    if (changed && onChange) {
      const target = { value: o.value };
      onChange({ target, currentTarget: target });
    }
  };

  const onType = (text: string) => {
    // Typing over the chosen option's name starts a fresh search: the name
    // is selected when the field is focused, so what arrives is what was
    // typed -- unless the caret sat after it, in which case drop the name.
    const next = typed === null && currentLabel && text.startsWith(currentLabel) && text !== currentLabel
      ? text.slice(currentLabel.length)
      : text;
    setTyped(next);
    if (open) setActive(firstEnabled(filterOptions(options, next).slice(0, MAX_SHOWN)));
    else openList(next);
  };

  const nextEnabled = (from: number, dir: 1 | -1, jump = 1) => {
    let i = Math.max(0, Math.min(shown.length - 1, from + dir * jump));
    for (; i >= 0 && i < shown.length; i += dir) if (!shown[i].disabled) return i;
    return from;
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Enter never submits the form around a dropdown.
      e.preventDefault();
      if (open) { e.stopPropagation(); choose(activeOption); }
      else openList('');
      return;
    }
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openList(''); }
      return;
    }
    // While the list is open its keys are its own: not a modal's Escape, nor
    // a page shortcut behind it.
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); e.stopPropagation(); setActive(a => nextEnabled(a, 1)); break;
      case 'ArrowUp': e.preventDefault(); e.stopPropagation(); setActive(a => nextEnabled(a, -1)); break;
      case 'PageDown': e.preventDefault(); e.stopPropagation(); setActive(a => nextEnabled(a, 1, 10)); break;
      case 'PageUp': e.preventDefault(); e.stopPropagation(); setActive(a => nextEnabled(a, -1, 10)); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
      // Tab takes a highlighted match the user typed for, then moves on.
      case 'Tab': if (typed !== null && activeOption) choose(activeOption); else close(); break;
    }
  };

  // The highlighted row stays in view.
  const activeRowId = activeOption ? optionId(activeOption.index) : undefined;
  useEffect(() => {
    if (!open || !activeRowId) return;
    popoverRef.current?.ownerDocument.getElementById(activeRowId)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeRowId]);

  // Closes on a press outside; follows the field when the page scrolls
  // (on a phone, raising the keyboard scrolls it too).
  useEffect(() => {
    if (!open) return;
    const doc = boxRef.current?.ownerDocument ?? document;
    const view = doc.defaultView ?? window;
    const onPress = (e: Event) => { if (!isInside(e.target)) close(); };
    let frame = 0;
    const follow = (e: Event) => {
      if (e.type === 'scroll' && isNode(e.target) && popoverRef.current?.contains(e.target)) return;
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(() => {
        const box = boxRef.current;
        const r = box?.getBoundingClientRect();
        // Gone, or hidden with its section: nothing left to point at.
        if (!box?.isConnected || !r || (r.width === 0 && r.height === 0)) { close(); return; }
        const p = measure();
        if (p) setPos(p);
      });
    };
    doc.addEventListener('mousedown', onPress, true);
    doc.addEventListener('touchstart', onPress, true);
    doc.addEventListener('scroll', follow, true);
    view.addEventListener('resize', follow);
    return () => {
      view.cancelAnimationFrame(frame);
      doc.removeEventListener('mousedown', onPress, true);
      doc.removeEventListener('touchstart', onPress, true);
      doc.removeEventListener('scroll', follow, true);
      view.removeEventListener('resize', follow);
    };
    // isInside reads refs only, so the copy from the opening render stays correct.
  }, [open, close, measure]);

  // Sized like a native select: as wide as its longest option, whatever is chosen.
  const sizers = options.length > 1
    ? options.map(o => o.label).sort((a, b) => b.length - a.length).slice(0, 3)
    : [];

  const { box: boxClasses, field: fieldClasses } = splitSelectClasses(className);
  const words = WORDS[pos?.arabic ? 'ar' : 'en'];
  const pageArabic = typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('ar');
  const placeholder = searchPlaceholder ?? WORDS[pageArabic ? 'ar' : 'en'].search;

  const popover = open && pos ? createPortal(
    <div
      ref={popoverRef}
      {...{ [SELECT_POPOVER_ATTR]: '', [EDITOR_ATTR]: '' }}
      dir={pos.rtl ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, zIndex: 10000 }}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-800 shadow-2xl outline-none"
      // Presses inside the list keep focus in the field, and none of these
      // events reach the components the list is rendered for.
      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
      onClick={e => e.stopPropagation()}
    >
      <ul id={listId} role="listbox" aria-label={ariaLabel || title || words.options} className="min-h-0 flex-1 overflow-y-auto py-1">
        {shown.map((o, i) => {
          const isChosen = o.index === selected;
          return (
            <li
              key={o.index}
              id={optionId(o.index)}
              role="option"
              aria-selected={isChosen}
              aria-disabled={o.disabled || undefined}
              onMouseMove={() => { if (i !== active && !o.disabled) setActive(i); }}
              onClick={() => choose(o)}
              className={`flex cursor-pointer items-start gap-2 px-3 py-2 ${i === active ? 'bg-slate-100' : ''} ${isChosen ? 'font-semibold text-slate-950' : ''} ${o.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {isChosen
                ? <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                : <span aria-hidden="true" className="h-4 w-4 shrink-0" />}
              <span className="min-w-0 flex-1 break-words">{o.label || ' '}</span>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="px-3 py-3 text-slate-600">{words.none}</p>}
      {matches.length > shown.length && (
        <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">{words.more(shown.length, matches.length)}</p>
      )}
    </div>,
    pos.host,
  ) : null;

  return (
    <>
      <span ref={boxRef} className={`relative inline-grid align-middle ${boxClasses}`}>
        {/* Drawn from an attribute and dressed like the field, so the longest
            labels size the control without becoming part of its text. */}
        {sizers.map((label, i) => (
          <span
            key={i}
            aria-hidden="true"
            data-sizer={label}
            style={{ paddingInlineEnd: ARROW_ROOM }}
            className={`${fieldClasses} invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap before:content-[attr(data-sizer)]`}
          />
        ))}
        <input
          ref={fieldRef}
          type="text"
          id={id}
          title={title}
          disabled={disabled}
          {...{ [SELECT_FIELD_ATTR]: '' }}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && activeRowId ? activeRowId : undefined}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          size={1}
          value={typed ?? currentLabel}
          placeholder={placeholder}
          onChange={e => onType(e.target.value)}
          onKeyDown={onKey}
          // Selected on entry, so typing replaces the chosen option's name.
          onFocus={e => e.currentTarget.select()}
          onClick={() => { if (!open) openList(''); }}
          onBlur={e => { if (!isInside(e.relatedTarget)) close(); }}
          style={{ paddingInlineEnd: ARROW_ROOM }}
          className={`col-start-1 row-start-1 w-full min-w-0 truncate disabled:cursor-not-allowed ${fieldClasses}`}
        />
        {/* The arrow opens and closes the list for a pointer; the field
            itself is what keyboards and screen readers use. Not a <button>,
            so the storefront's button styles never reach it. */}
        <span
          aria-hidden="true"
          data-select-arrow=""
          onMouseDown={e => {
            // Keeps focus in the field.
            e.preventDefault();
            if (disabled) return;
            if (open) { close(); return; }
            fieldRef.current?.focus();
            openList('');
          }}
          className={`absolute inset-y-0 end-0 flex w-8 items-center justify-center ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${disabled ? 'opacity-30' : 'opacity-60'} ${open ? 'rotate-180' : ''}`} />
        </span>
      </span>
      {popover}
    </>
  );
};

export default SearchableSelect;
