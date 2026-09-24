// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  MAX_SHOWN,
  SELECT_POPOVER_ATTR,
  SearchableSelect,
  readOptions,
  selectedIndexFor,
  splitSelectClasses,
} from '../src/components/ui/SearchableSelect';
import { foldForSearch, optionMatcher } from '../src/lib/optionSearch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  host.id = 'root';
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

const render = (ui: React.ReactElement) => act(() => root.render(ui));
const field = () => host.querySelector('[role="combobox"]') as HTMLInputElement;
const arrow = () => host.querySelector('[data-select-arrow]') as HTMLElement;
const popover = () => document.querySelector(`[${SELECT_POPOVER_ATTR}]`) as HTMLElement | null;
const rows = () => Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
const labels = () => rows().map(r => r.textContent);

const press = (el: Element, type: 'mousedown' | 'click', detail = 1) =>
  act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, detail })); });
const click = (el: Element, detail = 1) => { press(el, 'mousedown', detail); press(el, 'click', detail); };
const key = (el: Element, k: string) =>
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
/** What the field holds after the user types, as the browser reports it. */
const type = (text: string) => act(() => {
  const input = field();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const focus = () => act(() => field().focus());

function Fruit({ initial = 'b', onPick, ...rest }: { initial?: string; onPick?: (v: string) => void } & Record<string, unknown>) {
  const [value, setValue] = useState(initial);
  return (
    <SearchableSelect value={value} onChange={e => { onPick?.(e.target.value); setValue(e.target.value); }} {...rest}>
      <option value="a">Apple</option>
      <option value="b">Banana</option>
      <option value="c">Cherry</option>
    </SearchableSelect>
  );
}

describe('options are read the way the browser reads them', () => {
  it('flattens fragments, lists and conditionals; no value means the text', () => {
    const show = false;
    const options = readOptions(<>
      <option value="">Select…</option>
      {['Chouf', 'Aley'].map(d => <option key={d}>{d}</option>)}
      {show && <option value="x">Never</option>}
      <><option value={5}>{'SLR-101'}{' · '}{'Chouf Soap'}</option></>
    </>);
    expect(options).toEqual([
      { value: '', label: 'Select…', disabled: false },
      { value: 'Chouf', label: 'Chouf', disabled: false },
      { value: 'Aley', label: 'Aley', disabled: false },
      { value: '5', label: 'SLR-101 · Chouf Soap', disabled: false },
    ]);
  });

  it('shows the option holding the value, else the first enabled one, as React does', () => {
    const options = readOptions(<>
      <option value="1" disabled>One</option>
      <option value="2">Two</option>
      <option value="3">Three</option>
    </>);
    expect(selectedIndexFor(options, '3')).toBe(2);
    expect(selectedIndexFor(options, 3)).toBe(2);
    expect(selectedIndexFor(options, 'gone')).toBe(1);
    expect(selectedIndexFor([], 'x')).toBe(-1);
  });
});

describe('what the user types matches', () => {
  it('ignores case, accents, Arabic diacritics and spelling variants', () => {
    expect(foldForSearch('  Café  CRÈME ')).toBe('cafe creme');
    expect(foldForSearch('أَرْز')).toBe(foldForSearch('ارز'));
    expect(foldForSearch('إسكندر')).toBe(foldForSearch('اسكندر'));
    expect(foldForSearch('بيـــروت')).toBe(foldForSearch('بيروت'));
    expect(foldForSearch('مكتبة')).toBe(foldForSearch('مكتبه'));
    expect(foldForSearch('على')).toBe(foldForSearch('علي'));
    expect(foldForSearch('١٢٣ ۴')).toBe('123 4');
  });

  it('needs every typed word, in any order', () => {
    const m = optionMatcher('soap chouf');
    expect(m('Chouf Eco Soap')).toBe(true);
    expect(m('Chouf Olive Oil')).toBe(false);
    expect(optionMatcher('   ')('anything')).toBe(true);
  });
});

describe('the dropdown', () => {
  it('shows the chosen option in a field that opens the whole list', () => {
    render(<Fruit />);
    expect(field().tagName).toBe('INPUT');
    expect(field().value).toBe('Banana');
    expect(field().getAttribute('aria-expanded')).toBe('false');
    focus();
    click(field());
    expect(field().getAttribute('aria-expanded')).toBe('true');
    expect(labels()).toEqual(['Apple', 'Banana', 'Cherry']);
    expect(rows()[1].getAttribute('aria-selected')).toBe('true');
    expect(field().getAttribute('aria-controls')).toBe(document.querySelector('[role="listbox"]')!.id);
    expect(document.activeElement).toBe(field());
  });

  it('is writable: typing in the field opens the list and narrows it, and Enter picks', () => {
    const onPick = vi.fn();
    render(<Fruit onPick={onPick} />);
    focus();
    type('ch');
    expect(field().getAttribute('aria-expanded')).toBe('true');
    expect(field().value).toBe('ch');
    expect(labels()).toEqual(['Cherry']);
    expect(onPick).not.toHaveBeenCalled(); // typing alone changes nothing
    key(field(), 'Enter');
    expect(onPick).toHaveBeenCalledWith('c');
    expect(popover()).toBeNull();
    expect(field().value).toBe('Cherry');
    expect(document.activeElement).toBe(field());
  });

  it('starts a fresh search when typing after the chosen name', () => {
    render(<Fruit />);
    focus();
    type('Bananaap'); // caret was after "Banana"
    expect(field().value).toBe('ap');
    expect(labels()).toEqual(['Apple']);
  });

  it('moves the highlight with the arrow keys, which also open the list', () => {
    const onPick = vi.fn();
    render(<Fruit onPick={onPick} />);
    focus();
    key(field(), 'ArrowDown');
    expect(popover()).not.toBeNull();
    expect(field().getAttribute('aria-activedescendant')).toBe(rows()[1].id);
    key(field(), 'ArrowDown');
    expect(field().getAttribute('aria-activedescendant')).toBe(rows()[2].id);
    key(field(), 'ArrowDown');
    expect(field().getAttribute('aria-activedescendant')).toBe(rows()[2].id);
    key(field(), 'ArrowUp');
    key(field(), 'ArrowUp');
    key(field(), 'Enter');
    expect(onPick).toHaveBeenCalledWith('a');
  });

  it('opens and closes from its arrow, keeping focus in the field', () => {
    render(<Fruit />);
    press(arrow(), 'mousedown');
    expect(popover()).not.toBeNull();
    expect(document.activeElement).toBe(field());
    press(arrow(), 'mousedown');
    expect(popover()).toBeNull();
  });

  it('picks an option clicked with the mouse', () => {
    const onPick = vi.fn();
    render(<Fruit onPick={onPick} />);
    focus();
    click(field());
    click(rows()[0]);
    expect(onPick).toHaveBeenCalledWith('a');
    expect(popover()).toBeNull();
    expect(field().value).toBe('Apple');
  });

  it('reports no change when the chosen option is picked again', () => {
    const onPick = vi.fn();
    render(<Fruit onPick={onPick} />);
    focus();
    click(field());
    key(field(), 'Enter');
    expect(onPick).not.toHaveBeenCalled();
    expect(popover()).toBeNull();
  });

  it('Escape closes the list and restores the name, without closing the modal behind it', () => {
    // useDialog closes a modal from a window keydown listener.
    const modalEscape = vi.fn();
    window.addEventListener('keydown', modalEscape);
    try {
      render(<Fruit />);
      focus();
      type('che');
      key(field(), 'Escape');
      expect(popover()).toBeNull();
      expect(field().value).toBe('Banana');
      expect(document.activeElement).toBe(field());
      expect(modalEscape).not.toHaveBeenCalled();
      // With the list closed, Escape reaches the modal as before.
      key(field(), 'Escape');
      expect(modalEscape).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', modalEscape);
    }
  });

  it('Tab takes the match the user typed for; otherwise it just closes', () => {
    const onPick = vi.fn();
    render(<Fruit onPick={onPick} />);
    focus();
    type('app');
    key(field(), 'Tab');
    expect(onPick).toHaveBeenCalledWith('a');
    expect(popover()).toBeNull();
    onPick.mockClear();
    click(field());
    key(field(), 'Tab');
    expect(onPick).not.toHaveBeenCalled();
    expect(popover()).toBeNull();
  });

  it('a press outside, or leaving the field, restores the name and changes nothing', () => {
    const onPick = vi.fn();
    render(<><Fruit onPick={onPick} /><input id="next" /></>);
    focus();
    type('ch');
    press(document.body, 'mousedown');
    expect(popover()).toBeNull();
    expect(field().value).toBe('Banana');
    type('ch');
    act(() => (document.getElementById('next') as HTMLInputElement).focus());
    expect(popover()).toBeNull();
    expect(field().value).toBe('Banana');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('stays shut when disabled', () => {
    render(<Fruit disabled />);
    expect(field().disabled).toBe(true);
    press(arrow(), 'mousedown');
    click(field());
    expect(popover()).toBeNull();
  });

  it('is named by its label and never submits the form around it', () => {
    const submit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={submit}><label htmlFor="fruit">Fruit</label><Fruit id="fruit" /><button type="submit">Save</button></form>);
    expect((document.querySelector('label') as HTMLLabelElement).control).toBe(field());
    focus();
    key(field(), 'Enter'); // closed: opens the list
    expect(popover()).not.toBeNull();
    key(field(), 'Enter'); // open: picks
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps the list\'s clicks and keys from reaching the components around it', () => {
    const outerClick = vi.fn();
    const outerKey = vi.fn();
    render(<div onClick={outerClick} onKeyDown={outerKey}><Fruit /></div>);
    focus();
    click(field());
    outerClick.mockClear();
    outerKey.mockClear();
    key(field(), 'ArrowDown');
    click(rows()[0]);
    expect(outerClick).not.toHaveBeenCalled();
    expect(outerKey).not.toHaveBeenCalled();
  });

  it('marks the list as editor UI, never as a dialog', () => {
    render(<Fruit />);
    focus();
    click(field());
    expect(popover()!.hasAttribute('data-yalla-editor')).toBe(true);
    expect(popover()!.closest('[role="dialog"]')).toBeNull();
    expect(popover()!.parentElement).toBe(document.body);
  });

  it('draws at most MAX_SHOWN rows, and says so', () => {
    const many = Array.from({ length: MAX_SHOWN + 50 }, (_, i) => <option key={i} value={String(i)}>{`Item ${i}`}</option>);
    render(<SearchableSelect value="0" onChange={() => {}}>{many}</SearchableSelect>);
    focus();
    click(field());
    expect(rows()).toHaveLength(MAX_SHOWN);
    expect(popover()!.textContent).toContain(`Showing ${MAX_SHOWN} of ${MAX_SHOWN + 50}`);
    type('item 349');
    expect(labels()).toEqual(['Item 349']);
    type('zzz');
    expect(rows()).toHaveLength(0);
    expect(popover()!.textContent).toContain('No matches');
  });

  it('speaks Arabic when the page does', () => {
    document.documentElement.lang = 'ar';
    try {
      render(<Fruit />);
      expect(field().placeholder).toBe('اكتب للبحث…');
      focus();
      type('zzz');
      expect(popover()!.textContent).toContain('لا توجد نتائج مطابقة');
    } finally {
      document.documentElement.lang = '';
    }
  });

  it('finds Arabic options however the user spells them', () => {
    const onPick = vi.fn();
    render(
      <SearchableSelect value="" onChange={e => onPick(e.target.value)}>
        <option value="">اختر…</option>
        <option value="beirut">بيروت</option>
        <option value="mount_lebanon">جبل لبنان</option>
        <option value="akkar">عكّار</option>
      </SearchableSelect>,
    );
    focus();
    type('عكار');
    expect(labels()).toEqual(['عكّار']);
    key(field(), 'Enter');
    expect(onPick).toHaveBeenCalledWith('akkar');
  });

  it('puts placement classes on its box and dress classes on the field', () => {
    expect(splitSelectClasses('w-full mt-1.5 md:col-span-2 min-w-[130px] px-3 py-2 border rounded-xl focus:border-amber-500 text-center')).toEqual({
      box: 'w-full mt-1.5 md:col-span-2 min-w-[130px]',
      field: 'px-3 py-2 border rounded-xl focus:border-amber-500 text-center',
    });
    render(<Fruit className="w-full mt-1 px-3 border focus:border-indigo-500" />);
    const box = field().parentElement!;
    expect(box.className).toContain('w-full');
    expect(box.className).toContain('mt-1');
    expect(field().className).toContain('focus:border-indigo-500');
    expect(field().className).not.toContain('mt-1');
  });
});
