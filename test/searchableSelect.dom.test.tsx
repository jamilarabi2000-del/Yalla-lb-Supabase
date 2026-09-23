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
const trigger = () => host.querySelector('[role="combobox"]') as HTMLButtonElement;
const popover = () => document.querySelector(`[${SELECT_POPOVER_ATTR}]`) as HTMLElement | null;
const search = () => popover()!.querySelector('input') as HTMLInputElement;
const rows = () => Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
const labels = () => rows().map(r => r.textContent);

const press = (el: Element, type: 'mousedown' | 'click', detail = 1) =>
  act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, detail })); });
const click = (el: Element, detail = 1) => { press(el, 'mousedown', detail); press(el, 'click', detail); };
const key = (el: Element, k: string) =>
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
const type = (text: string) => act(() => {
  const input = search();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

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
  it('shows the chosen option and opens a searchable list', () => {
    render(<Fruit />);
    expect(trigger().textContent).toContain('Banana');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(labels()).toEqual(['Apple', 'Banana', 'Cherry']);
    expect(rows()[1].getAttribute('aria-selected')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe(document.querySelector('[role="listbox"]')!.id);
    expect(document.activeElement).toBe(search());
  });

  it('narrows as the user types, and Enter picks the highlighted option', () => {
    const onPick = vi.fn();
    render(<Fruit onPick={onPick} />);
    click(trigger());
    type('ch');
    expect(labels()).toEqual(['Cherry']);
    key(search(), 'Enter');
    expect(onPick).toHaveBeenCalledWith('c');
    expect(popover()).toBeNull();
    expect(trigger().textContent).toContain('Cherry');
    expect(document.activeElement).toBe(trigger());
  });

  it('moves the highlight with the arrow keys', () => {
    const onPick = vi.fn();
    render(<Fruit onPick={onPick} />);
    click(trigger());
    key(search(), 'ArrowDown');
    expect(search().getAttribute('aria-activedescendant')).toBe(rows()[2].id);
    key(search(), 'ArrowDown');
    expect(search().getAttribute('aria-activedescendant')).toBe(rows()[2].id);
    key(search(), 'ArrowUp');
    key(search(), 'ArrowUp');
    key(search(), 'Enter');
    expect(onPick).toHaveBeenCalledWith('a');
  });

  it('picks an option clicked with the mouse', () => {
    const onPick = vi.fn();
    render(<Fruit onPick={onPick} />);
    click(trigger());
    click(rows()[0]);
    expect(onPick).toHaveBeenCalledWith('a');
    expect(popover()).toBeNull();
  });

  it('reports no change when the chosen option is picked again', () => {
    const onPick = vi.fn();
    render(<Fruit onPick={onPick} />);
    click(trigger());
    key(search(), 'Enter');
    expect(onPick).not.toHaveBeenCalled();
    expect(popover()).toBeNull();
  });

  it('starts a search with the letter typed on the closed control', () => {
    render(<Fruit />);
    act(() => trigger().focus());
    key(trigger(), 'c');
    expect(search().value).toBe('c');
    expect(labels()).toEqual(['Cherry']);
  });

  it('closes on Escape without closing the modal behind it', () => {
    // useDialog closes a modal from a window keydown listener.
    const modalEscape = vi.fn();
    window.addEventListener('keydown', modalEscape);
    try {
      render(<Fruit />);
      click(trigger());
      key(search(), 'Escape');
      expect(popover()).toBeNull();
      expect(document.activeElement).toBe(trigger());
      expect(modalEscape).not.toHaveBeenCalled();
      // With the list closed, Escape reaches the modal as before.
      key(trigger(), 'Escape');
      expect(modalEscape).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', modalEscape);
    }
  });

  it('closes on Tab and hands focus back to the control', () => {
    render(<Fruit />);
    click(trigger());
    key(search(), 'Tab');
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a press outside without changing anything', () => {
    const onPick = vi.fn();
    render(<Fruit onPick={onPick} />);
    click(trigger());
    press(document.body, 'mousedown');
    expect(popover()).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('stays shut when disabled', () => {
    render(<Fruit disabled />);
    expect(trigger().disabled).toBe(true);
    click(trigger());
    expect(popover()).toBeNull();
  });

  it('is named by its label and never submits the form around it', () => {
    const submit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={submit}><label htmlFor="fruit">Fruit</label><Fruit id="fruit" /></form>);
    expect(trigger().type).toBe('button');
    expect((document.querySelector('label') as HTMLLabelElement).control).toBe(trigger());
    click(trigger());
    key(search(), 'Enter');
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps events inside the list from reaching the components around it', () => {
    const outerClick = vi.fn();
    const outerKey = vi.fn();
    render(<div onClick={outerClick} onKeyDown={outerKey}><Fruit /></div>);
    click(trigger());
    outerClick.mockClear();
    key(search(), 'ArrowDown');
    click(rows()[0]);
    expect(outerClick).not.toHaveBeenCalled();
    expect(outerKey).not.toHaveBeenCalled();
  });

  it('marks the list as editor UI, never as a dialog', () => {
    render(<Fruit />);
    click(trigger());
    expect(popover()!.hasAttribute('data-yalla-editor')).toBe(true);
    expect(popover()!.closest('[role="dialog"]')).toBeNull();
    expect(popover()!.parentElement).toBe(document.body);
  });

  it('draws at most MAX_SHOWN rows, and says so', () => {
    const many = Array.from({ length: MAX_SHOWN + 50 }, (_, i) => <option key={i} value={String(i)}>{`Item ${i}`}</option>);
    render(<SearchableSelect value="0" onChange={() => {}}>{many}</SearchableSelect>);
    click(trigger());
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
      click(trigger());
      expect(search().placeholder).toBe('اكتب للبحث…');
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
    click(trigger());
    type('عكار');
    expect(labels()).toEqual(['عكّار']);
    key(search(), 'Enter');
    expect(onPick).toHaveBeenCalledWith('akkar');
  });
});
