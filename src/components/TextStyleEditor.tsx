import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Italic,
  MousePointerClick, RotateCcw, Trash2, Type, Underline, X,
} from 'lucide-react';
import { removeTextRule, saveTextRule, setEditingTextRule, useTextRules } from '../hooks/useTextRules';
import { EDITOR_ATTR, findRuleMatches, isInlineElement, scopeSelectorFor, textTargetFrom } from '../lib/textStyleDom';
import {
  MAX_NUDGE_PX, PREVIEW_SELECTOR, TEXT_FONTS, TEXT_RULE_ATTR, TEXT_RULE_PREVIEW_ATTR, isEmptyStyle, newRuleId,
  normalizeText, ruleAppliesOn, sanitizeStyle, styleCss,
  type CMSTextRule, type TextDevice, type TextStyleProp,
} from '../lib/textStyleRules';
import { OPEN_SELECT_SELECTOR, SearchableSelect } from './ui/SearchableSelect';

interface Selection {
  text: string;
  tag: string;
  scope: string;
  inline: boolean;
  ruleId: string | null;
}

const PREVIEW_STYLE_ID = 'yalla-text-rule-preview';
const PAGE_LABELS: Record<string, string> = {
  home: 'the home page', products: 'the products page', product_detail: 'product pages',
  checkout: 'checkout', account: 'the account page', favorites: 'favorites',
};
const DEVICES: Array<[TextDevice, string]> = [['desktop', 'All screens'], ['tablet', 'Tablet'], ['mobile', 'Mobile']];
const WEIGHTS = ['300', '400', '500', '600', '700', '800', '900'];
const snippet = (text: string, max = 48) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const num = (value?: string) => (value ? String(parseFloat(value)) : '');

/**
 * Click any text on the storefront and give it its own font, size, colour,
 * alignment, spacing and position. Admin-only; every page click is intercepted while
 * the mode is on, so links and buttons do not fire.
 */
export const TextStyleEditor: React.FC<{
  page: string;
  onClose: () => void;
  notify?: (message: string, kind?: 'success' | 'error' | 'info') => void;
}> = ({ page, onClose, notify }) => {
  const { rules } = useTextRules();
  const [hover, setHover] = useState<DOMRect | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draft, setDraft] = useState<CMSTextRule['style']>({});
  const [device, setDevice] = useState<TextDevice>('desktop');
  const [everywhere, setEverywhere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);
  const selectedEl = useRef<Element | null>(null);

  const clearSelection = useCallback(() => {
    selectedEl.current = null;
    setSelection(null);
    setDraft({});
    setError('');
    setEditingTextRule(null);
  }, []);

  const select = useCallback((el: Element) => {
    const root = document.getElementById('root');
    if (!root) return;
    // An element already styled carries its rule ids; edit that rule.
    const ids = (el.getAttribute(TEXT_RULE_ATTR) || '').split(' ').filter(Boolean);
    const existing = ids.map(id => rules[id]).filter(Boolean).pop() ?? null;
    selectedEl.current = el;
    setSelection({
      text: existing ? existing.text : normalizeText(el.textContent),
      tag: existing ? existing.tag : el.tagName.toLowerCase(),
      scope: existing ? existing.scope : scopeSelectorFor(el, root),
      inline: isInlineElement(el),
      ruleId: existing?.id ?? null,
    });
    setDraft(existing ? sanitizeStyle(existing.style) : {});
    setEverywhere(existing ? existing.page === '*' : false);
    setDevice('desktop');
    setError('');
    setEditingTextRule(existing?.id ?? null);
  }, [rules]);

  const selectRef = useRef(select);
  selectRef.current = select;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  // Pointer and keyboard, captured before the page's own handlers.
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    // The page background and scrollbar stay usable: only real page content
    // is intercepted, and never the editor itself.
    const onPage = (t: EventTarget | null) =>
      t instanceof Element && t !== document.documentElement && t !== document.body && !t.closest(`[${EDITOR_ATTR}]`);
    const onMove = (e: MouseEvent) => {
      const el = onPage(e.target) ? textTargetFrom(e.target as Element, root) : null;
      setHover(el ? el.getBoundingClientRect() : null);
    };
    const block = (e: Event) => {
      if (onPage(e.target)) { e.preventDefault(); e.stopPropagation(); }
    };
    const onClick = (e: MouseEvent) => {
      if (!onPage(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const el = textTargetFrom(e.target as Element, root);
      if (el) selectRef.current(el);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // An open dropdown (the font list, say) closes itself first.
      if (e.target instanceof Element && e.target.closest(OPEN_SELECT_SELECTOR)) return;
      e.stopPropagation();
      if (selectionRef.current) clearSelection();
      else onClose();
    };
    const redraw = () => setTick(t => t + 1);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mousedown', block, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', redraw, true);
    window.addEventListener('resize', redraw);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mousedown', block, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', redraw, true);
      window.removeEventListener('resize', redraw);
    };
  }, [clearSelection, onClose]);

  // Live preview of the draft on every text the rule would style.
  useEffect(() => {
    const root = document.getElementById('root');
    let style = document.getElementById(PREVIEW_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = PREVIEW_STYLE_ID;
      document.head.appendChild(style);
    }
    root?.querySelectorAll(`[${TEXT_RULE_PREVIEW_ATTR}]`).forEach(el => el.removeAttribute(TEXT_RULE_PREVIEW_ATTR));
    if (!root || !selection) { style.textContent = ''; return; }
    for (const el of findRuleMatches(root, selection)) el.setAttribute(TEXT_RULE_PREVIEW_ATTR, '');
    style.textContent = styleCss(PREVIEW_SELECTOR, draft);
  }, [selection, draft]);

  useEffect(() => () => {
    document.getElementById(PREVIEW_STYLE_ID)?.remove();
    document.querySelectorAll(`[${TEXT_RULE_PREVIEW_ATTR}]`).forEach(el => el.removeAttribute(TEXT_RULE_PREVIEW_ATTR));
    setEditingTextRule(null);
  }, []);

  const current = draft[device] || {};
  const inherited = device === 'desktop' ? {} : (draft.desktop || {});
  const setProp = (prop: TextStyleProp, value: string | null) => setDraft(d => {
    const decl = { ...(d[device] || {}) };
    if (value === null || value === '') delete decl[prop];
    else decl[prop] = value;
    return { ...d, [device]: decl };
  });
  const toggle = (prop: TextStyleProp, on: string, off: string) =>
    setProp(prop, (current[prop] || inherited[prop]) === on ? (device === 'desktop' ? null : off) : on);
  /**
   * Position: whole pixels, kept within the nudge range. 0 clears it, except
   * on tablet or mobile when desktop moves the text: there 0 is kept, so that
   * device can say "do not move it here".
   */
  const setNudge = (prop: 'left' | 'top', px: number) => {
    const clamped = Math.max(-MAX_NUDGE_PX, Math.min(MAX_NUDGE_PX, Math.round(px)));
    const inheritedPx = parseFloat(inherited[prop] || '0') || 0;
    setProp(prop, clamped === 0 && (device === 'desktop' || inheritedPx === 0) ? null : `${clamped}px`);
  };
  const nudgeBy = (prop: 'left' | 'top', delta: number) =>
    setNudge(prop, (parseFloat(current[prop] || inherited[prop] || '0') || 0) + delta);

  const save = async () => {
    if (!selection) return;
    const style = sanitizeStyle(draft);
    setBusy(true);
    setError('');
    try {
      if (isEmptyStyle(style)) {
        if (selection.ruleId) await removeTextRule(selection.ruleId);
      } else {
        await saveTextRule({
          id: selection.ruleId ?? newRuleId(),
          text: selection.text,
          tag: selection.tag,
          scope: selection.scope,
          page: everywhere ? '*' : page,
          style,
          updatedAt: new Date().toISOString(),
        });
      }
      notify?.('Text style saved.', 'success');
      clearSelection();
    } catch (e: any) {
      setError(e?.message || 'The text style could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await removeTextRule(id);
      notify?.('Text style removed.', 'success');
      if (selection?.ruleId === id) clearSelection();
    } catch (e: any) {
      setError(e?.message || 'The text style could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  const selectedRect = selectedEl.current?.isConnected ? selectedEl.current.getBoundingClientRect() : null;
  const onThisPage = Object.values(rules).filter(r => ruleAppliesOn(r, page));
  const field = 'mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 bg-white';
  const label = 'block text-[11px] font-bold text-slate-600';

  return (
    <div {...{ [EDITOR_ATTR]: '' }} dir="ltr">
      {hover && (
        <div aria-hidden className="fixed pointer-events-none z-[65] rounded border-2 border-dashed border-indigo-400"
          style={{ left: hover.left - 3, top: hover.top - 3, width: hover.width + 6, height: hover.height + 6 }} />
      )}
      {selectedRect && (
        <div aria-hidden className="fixed pointer-events-none z-[65] rounded border-2 border-indigo-600"
          style={{ left: selectedRect.left - 3, top: selectedRect.top - 3, width: selectedRect.width + 6, height: selectedRect.height + 6 }} />
      )}

      {/* Not role="dialog": design rules can target dialogs, and must never hide this. */}
      <aside aria-label="Text style" className="fixed right-4 top-20 z-[70] w-80 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200 text-slate-900 font-sans">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-2">
          <Type className="w-4 h-4 text-indigo-600" aria-hidden />
          <h2 className="text-sm font-black mr-auto">Text style</h2>
          <button onClick={onClose} aria-label="Leave text styling" className="p-1 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
        </div>

        {!selection ? (
          <div className="p-4 space-y-4">
            <p className="text-xs text-slate-600 flex gap-2">
              <MousePointerClick className="w-4 h-4 shrink-0 text-indigo-600" aria-hidden />
              Click any text on the page to change its font, size, colour, alignment or position. Links and buttons do not work while this is open. Press Esc to leave.
            </p>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Styled here ({onThisPage.length})</p>
              {onThisPage.length === 0 && <p className="mt-2 text-xs text-slate-600">Nothing styled on this page yet.</p>}
              <ul className="mt-2 space-y-1.5">
                {onThisPage.map(r => (
                  <li key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate" title={r.text}>“{snippet(r.text, 36)}”</span>
                    <span className="text-[10px] text-slate-600">{r.page === '*' ? 'all pages' : 'this page'}</span>
                    <button disabled={busy} onClick={() => remove(r.id)} aria-label={`Remove style from “${snippet(r.text, 36)}”`} className="p-1 rounded hover:bg-rose-50 text-rose-600 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" aria-hidden /></button>
                  </li>
                ))}
              </ul>
            </div>
            {error && <p role="alert" className="text-xs font-bold text-rose-700">{error}</p>}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <p className="text-xs font-bold">“{snippet(selection.text)}”</p>
              <p className="mt-1 text-[10px] text-slate-500 font-mono">&lt;{selection.tag}&gt;{selection.scope ? ` in ${selection.scope}` : ''}</p>
            </div>

            <fieldset>
              <legend className={label}>Applies on</legend>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <button type="button" aria-pressed={!everywhere} onClick={() => setEverywhere(false)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold ${!everywhere ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>{PAGE_LABELS[page] || 'this page'}</button>
                <button type="button" aria-pressed={everywhere} onClick={() => setEverywhere(true)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold ${everywhere ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>Every page</button>
              </div>
              <p className="mt-1 text-[10px] text-slate-600">Every place this exact text appears in the same section.</p>
            </fieldset>

            <div role="tablist" aria-label="Screen size" className="grid grid-cols-3 gap-1">
              {DEVICES.map(([id, name]) => (
                <button key={id} role="tab" aria-selected={device === id} onClick={() => setDevice(id)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold ${device === id ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>{name}</button>
              ))}
            </div>
            {device !== 'desktop' && <p className="-mt-2 text-[10px] text-slate-600">Only what you set here overrides “All screens” on a {device}.</p>}

            <label className={label}>Font
              <SearchableSelect value={current['font-family'] || ''} onChange={e => setProp('font-family', e.target.value || null)} className={field}>
                <option value="">{device === 'desktop' ? 'Site default' : 'Same as all screens'}</option>
                {TEXT_FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
              </SearchableSelect>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className={label}>Size (px)
                <input type="number" min={6} max={200} value={num(current['font-size'])} placeholder={num(inherited['font-size']) || 'default'}
                  onChange={e => setProp('font-size', e.target.value ? `${e.target.value}px` : null)} className={field} />
              </label>
              <label className={label}>Weight
                <SearchableSelect value={current['font-weight'] || ''} onChange={e => setProp('font-weight', e.target.value || null)} className={field}>
                  <option value="">{device === 'desktop' ? 'Default' : 'Same'}</option>
                  {WEIGHTS.map(w => <option key={w} value={w}>{w}</option>)}
                </SearchableSelect>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className={label}>Colour
                <span className="mt-1 flex gap-1">
                  <input type="color" value={current.color?.startsWith('#') && current.color.length === 7 ? current.color : '#171717'}
                    onChange={e => setProp('color', e.target.value)} aria-label="Pick text colour" className="h-8 w-9 rounded border border-slate-200" />
                  <input value={current.color || ''} placeholder={inherited.color || 'default'} onChange={e => setProp('color', e.target.value || null)}
                    aria-label="Text colour value" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-xs font-mono" />
                </span>
              </label>
              <label className={label}>Highlight
                <span className="mt-1 flex gap-1">
                  <input type="color" value={current['background-color']?.startsWith('#') && current['background-color'].length === 7 ? current['background-color'] : '#ffffff'}
                    onChange={e => setProp('background-color', e.target.value)} aria-label="Pick highlight colour" className="h-8 w-9 rounded border border-slate-200" />
                  <button type="button" onClick={() => setProp('background-color', null)} className="flex-1 rounded-lg bg-slate-100 text-[11px] font-bold">None</button>
                </span>
              </label>
            </div>

            <div>
              <span className={label}>Alignment</span>
              <div className="mt-1 grid grid-cols-4 gap-1">
                {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight], ['justify', AlignJustify]] as const).map(([value, Icon]) => (
                  <button key={value} type="button" disabled={selection.inline} aria-pressed={current['text-align'] === value} aria-label={`Align ${value}`}
                    onClick={() => setProp('text-align', current['text-align'] === value ? null : value)}
                    className={`py-1.5 rounded-lg flex justify-center disabled:opacity-40 ${current['text-align'] === value ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>
                    <Icon className="w-4 h-4" aria-hidden />
                  </button>
                ))}
              </div>
              {selection.inline && <p className="mt-1 text-[10px] text-slate-500">This text sits inside a line; to align it, click the paragraph or heading around it.</p>}
            </div>

            <div>
              <span className={label}>Position</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <label className={label}>Move right (px)
                  <input id="text-style-left" disabled={selection.inline} type="number" step={1} min={-MAX_NUDGE_PX} max={MAX_NUDGE_PX} value={num(current.left)} placeholder={num(inherited.left) || '0'}
                    onChange={e => (e.target.value === '' ? setProp('left', null) : setNudge('left', Number(e.target.value)))} className={field} />
                </label>
                <label className={label}>Move down (px)
                  <input id="text-style-top" disabled={selection.inline} type="number" step={1} min={-MAX_NUDGE_PX} max={MAX_NUDGE_PX} value={num(current.top)} placeholder={num(inherited.top) || '0'}
                    onChange={e => (e.target.value === '' ? setProp('top', null) : setNudge('top', Number(e.target.value)))} className={field} />
                </label>
              </div>
              <div className="mt-1 grid grid-cols-5 gap-1">
                {([['left', -5, ArrowLeft, 'Move left 5px'], ['top', -5, ArrowUp, 'Move up 5px'], ['top', 5, ArrowDown, 'Move down 5px'], ['left', 5, ArrowRight, 'Move right 5px']] as const).map(([prop, delta, Icon, name]) => (
                  <button key={name} type="button" disabled={selection.inline} aria-label={name} title={name} onClick={() => nudgeBy(prop, delta)} className="py-1.5 rounded-lg flex justify-center bg-slate-100 hover:bg-slate-200 disabled:opacity-40">
                    <Icon className="w-4 h-4" aria-hidden />
                  </button>
                ))}
                <button type="button" disabled={selection.inline} aria-label="Reset position" title="Reset position" onClick={() => { setProp('left', null); setProp('top', null); }} className="py-1.5 rounded-lg flex justify-center bg-slate-100 hover:bg-slate-200 disabled:opacity-40">
                  <RotateCcw className="w-4 h-4" aria-hidden />
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">{selection.inline
                ? 'This text sits inside a line; to move it, click the paragraph or heading around it.'
                : `Negative numbers move it left or up (at most ${MAX_NUDGE_PX}px). The text keeps its place in the page; only where it is drawn moves.`}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className={label}>Line height
                <input type="number" step={0.1} min={0.8} max={4} value={num(current['line-height'])} placeholder={num(inherited['line-height']) || 'default'}
                  onChange={e => setProp('line-height', e.target.value || null)} className={field} />
              </label>
              <label className={label}>Letter spacing (px)
                <input type="number" step={0.5} min={-5} max={20} value={num(current['letter-spacing'])} placeholder={num(inherited['letter-spacing']) || 'default'}
                  onChange={e => setProp('letter-spacing', e.target.value ? `${e.target.value}px` : null)} className={field} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className={label}>Case
                <SearchableSelect value={current['text-transform'] || ''} onChange={e => setProp('text-transform', e.target.value || null)} className={field}>
                  <option value="">{device === 'desktop' ? 'As written' : 'Same'}</option>
                  <option value="uppercase">UPPERCASE</option>
                  <option value="lowercase">lowercase</option>
                  <option value="capitalize">Title Case</option>
                  <option value="none">As written (force)</option>
                </SearchableSelect>
              </label>
              <div>
                <span className={label}>Style</span>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <button type="button" aria-pressed={(current['font-style'] || inherited['font-style']) === 'italic'} aria-label="Italic" onClick={() => toggle('font-style', 'italic', 'normal')}
                    className={`py-1.5 rounded-lg flex justify-center ${(current['font-style'] || inherited['font-style']) === 'italic' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}><Italic className="w-4 h-4" aria-hidden /></button>
                  <button type="button" aria-pressed={(current['text-decoration-line'] || inherited['text-decoration-line']) === 'underline'} aria-label="Underline" onClick={() => toggle('text-decoration-line', 'underline', 'none')}
                    className={`py-1.5 rounded-lg flex justify-center ${(current['text-decoration-line'] || inherited['text-decoration-line']) === 'underline' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}><Underline className="w-4 h-4" aria-hidden /></button>
                </div>
              </div>
            </div>

            {error && <p role="alert" className="text-xs font-bold text-rose-700">{error}</p>}

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={save} disabled={busy} className="flex-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black disabled:opacity-50">
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={clearSelection} disabled={busy} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold">Cancel</button>
              {selection.ruleId && (
                <button type="button" onClick={() => remove(selection.ruleId!)} disabled={busy} className="w-full px-3 py-2 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" aria-hidden /> Remove this style
                </button>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
};

export default TextStyleEditor;
