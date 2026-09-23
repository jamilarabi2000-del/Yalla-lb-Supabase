/**
 * A drop-in replacement for <select>: the same value, onChange and <option>
 * children, but the list opens with a search box, so the user can pick an
 * option or type to find one. onChange receives { target: { value } } as the
 * native event would, and fires only when the choice actually changes.
 *
 * The list is rendered into document.body so a modal or a scrolling panel
 * cannot clip it. Keyboard: arrows, Page Up/Down, Enter to pick, Escape to
 * close, and typing a letter on the closed control starts a search.
 */
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { optionMatcher } from '../../lib/optionSearch';
import { EDITOR_ATTR } from '../../lib/textStyleDom';

/** Marks an open list; key handlers elsewhere leave its keys to it. */
export const SELECT_POPOVER_ATTR = 'data-yalla-select-popover';

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
  /** Defaults to "Type to search…", in Arabic when the page is. */
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

const isCoarsePointer = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

const isNode = (t: unknown): t is Node => !!t && typeof (t as Node).nodeType === 'number';

const ALIGNED = /(^|\s)text-(left|right|center|start|end|justify)(\s|$)/;

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

  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusSearch = useRef(true);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<Position | null>(null);

  const matches = open ? filterOptions(options, query) : [];
  const shown = matches.slice(0, MAX_SHOWN);
  const activeOption = active >= 0 ? shown[active] : undefined;

  const measure = useCallback((): Position | null => {
    const trigger = triggerRef.current;
    const view = trigger?.ownerDocument.defaultView;
    if (!trigger || !view) return null;
    const r = trigger.getBoundingClientRect();
    const rtl = view.getComputedStyle(trigger).direction === 'rtl';
    const width = Math.min(Math.max(r.width, 224), view.innerWidth - 16);
    const left = Math.max(8, Math.min(rtl ? r.right - width : r.left, view.innerWidth - width - 8));
    const below = view.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 240 && above > below;
    const maxHeight = Math.max(160, Math.min(360, up ? above : below));
    const host = trigger.ownerDocument.body;
    const arabic = trigger.ownerDocument.documentElement.lang.toLowerCase().startsWith('ar');
    return up
      ? { host, left, width, bottom: view.innerHeight - r.top + 4, maxHeight, rtl, arabic }
      : { host, left, width, top: r.bottom + 4, maxHeight, rtl, arabic };
  }, []);

  const isInside = (t: unknown) =>
    isNode(t) && (!!popoverRef.current?.contains(t) || !!triggerRef.current?.contains(t));

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setQuery('');
    setActive(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openList = (initial: string, viaPointer: boolean) => {
    if (disabled || open) return;
    const p = measure();
    if (!p) return;
    const list = filterOptions(options, initial).slice(0, MAX_SHOWN);
    const at = initial ? firstEnabled(list) : list.findIndex(o => o.index === selected);
    // On a touch screen, tapping to open shows the list without raising the
    // keyboard; the search box is one more tap away.
    focusSearch.current = !(viaPointer && isCoarsePointer());
    setPos(p);
    setQuery(initial);
    setActive(at >= 0 ? at : firstEnabled(list));
    setOpen(true);
  };

  const choose = (o: Match | undefined) => {
    if (!o || o.disabled) return;
    const changed = o.value !== current?.value;
    close(true);
    if (changed && onChange) {
      const target = { value: o.value };
      onChange({ target, currentTarget: target });
    }
  };

  const onQuery = (next: string) => {
    setQuery(next);
    setActive(firstEnabled(filterOptions(options, next).slice(0, MAX_SHOWN)));
  };

  const nextEnabled = (from: number, dir: 1 | -1, jump = 1) => {
    let i = Math.max(0, Math.min(shown.length - 1, from + dir * jump));
    for (; i >= 0 && i < shown.length; i += dir) if (!shown[i].disabled) return i;
    return from;
  };

  const onListKey = (e: React.KeyboardEvent) => {
    // Keys typed here belong to the list: not to a form, a modal's Escape
    // or a page shortcut behind it.
    e.stopPropagation();
    const inSearch = e.target === inputRef.current;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(a => nextEnabled(a, 1)); break;
      case 'ArrowUp': e.preventDefault(); setActive(a => nextEnabled(a, -1)); break;
      case 'PageDown': e.preventDefault(); setActive(a => nextEnabled(a, 1, 10)); break;
      case 'PageUp': e.preventDefault(); setActive(a => nextEnabled(a, -1, 10)); break;
      case 'Home': if (!inSearch) { e.preventDefault(); setActive(nextEnabled(-1, 1)); } break;
      case 'End': if (!inSearch) { e.preventDefault(); setActive(nextEnabled(shown.length, -1)); } break;
      case 'Enter': e.preventDefault(); choose(activeOption); break;
      case 'Escape': e.preventDefault(); close(true); break;
      // Back on the control, so the browser moves on from there.
      case 'Tab': close(true); break;
    }
  };

  const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList('', false);
    } else if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Typing on the closed control starts a search with that letter.
      e.preventDefault();
      openList(e.key, false);
    }
  };

  // Focus moves into the list as it opens.
  useLayoutEffect(() => {
    if (!open) return;
    const input = inputRef.current;
    if (focusSearch.current && input) {
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    } else {
      popoverRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  // The highlighted row stays in view.
  const activeRowId = activeOption ? optionId(activeOption.index) : undefined;
  useEffect(() => {
    if (!open || !activeRowId) return;
    popoverRef.current?.ownerDocument.getElementById(activeRowId)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeRowId]);

  // Closes on a press outside; follows the control when the page scrolls
  // (on a phone, raising the keyboard scrolls it too).
  useEffect(() => {
    if (!open) return;
    const doc = triggerRef.current?.ownerDocument ?? document;
    const view = doc.defaultView ?? window;
    const onPress = (e: Event) => { if (!isInside(e.target)) close(false); };
    let frame = 0;
    const follow = (e: Event) => {
      if (e.type === 'scroll' && isNode(e.target) && popoverRef.current?.contains(e.target)) return;
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(() => {
        const trigger = triggerRef.current;
        const r = trigger?.getBoundingClientRect();
        // Gone, or hidden with its section: nothing left to point at.
        if (!trigger?.isConnected || !r || (r.width === 0 && r.height === 0)) { close(false); return; }
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

  const words = WORDS[pos?.arabic ? 'ar' : 'en'];
  const placeholder = searchPlaceholder ?? words.search;

  const popover = open && pos ? createPortal(
    <div
      ref={popoverRef}
      {...{ [SELECT_POPOVER_ATTR]: '', [EDITOR_ATTR]: '' }}
      dir={pos.rtl ? 'rtl' : 'ltr'}
      tabIndex={-1}
      style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, zIndex: 10000 }}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-800 shadow-2xl outline-none"
      onKeyDown={onListKey}
      // Presses inside the list keep focus in the search box, and none of
      // these events reach the components the list is rendered for.
      onMouseDown={e => { if (e.target !== inputRef.current) e.preventDefault(); e.stopPropagation(); }}
      onClick={e => e.stopPropagation()}
      onBlur={e => { if (!isInside(e.relatedTarget)) close(false); }}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? optionId(activeOption.index) : undefined}
          autoComplete="off"
          spellCheck={false}
          // 16px on phones: iOS zooms the page into any smaller field it focuses.
          className="min-w-0 flex-1 bg-transparent py-0.5 text-base text-slate-800 outline-none placeholder:text-slate-400 sm:text-sm"
        />
      </div>
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
              <span className="min-w-0 flex-1 break-words">{o.label || '\u00A0'}</span>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="px-3 py-3 text-slate-400">{words.none}</p>}
      {matches.length > shown.length && (
        <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">{words.more(shown.length, matches.length)}</p>
      )}
    </div>,
    pos.host,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        title={title}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onClick={e => {
          if (open) close(true);
          // detail is 0 for a click made with Enter or Space.
          else openList('', e.detail > 0);
        }}
        onKeyDown={onTriggerKey}
        className={`group inline-flex items-center justify-between gap-2 align-middle disabled:cursor-not-allowed ${className}`}
      >
        <span className={`grid min-w-0 flex-auto ${ALIGNED.test(className) ? '' : 'text-start'}`}>
          {/* Drawn from an attribute, so the longest labels size the control
              without becoming part of its text. */}
          {sizers.map((s, i) => (
            <span key={i} aria-hidden="true" data-sizer={s} className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap before:content-[attr(data-sizer)]" />
          ))}
          <span className="col-start-1 row-start-1 truncate">{current?.label ?? ''}</span>
        </span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 opacity-60 transition-transform group-disabled:opacity-30 ${open ? 'rotate-180' : ''}`} />
      </button>
      {popover}
    </>
  );
};

export default SearchableSelect;
