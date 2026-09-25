import React, { useState } from 'react';
import { MousePointerClick, Trash2, Type } from 'lucide-react';
import { useShop } from '../../../context/ShopContext';
import { removeTextRule, useTextRules } from '../../../hooks/useTextRules';
import { TEXT_FONTS } from '../../../lib/textStyleRules';

const PAGE_NAMES: Record<string, string> = {
  '*': 'Every page', home: 'Home', products: 'Products', product_detail: 'Product pages',
  checkout: 'Checkout', account: 'Account', favorites: 'Favorites',
};
const fontName = (value?: string) => TEXT_FONTS.find(f => f.value === value)?.label;

/** Every text an administrator has styled on its own, across all pages. */
export const CMSStyledTextsPanel: React.FC = () => {
  const shop = useShop() as any;
  const { rules } = useTextRules();
  const [busy, setBusy] = useState<string | null>(null);
  const list = Object.values(rules).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await removeTextRule(id);
      shop.showToast?.('Text style removed.', 'success');
    } catch (e: any) {
      shop.showToast?.(e?.message || 'The text style could not be removed.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Type className="w-5 h-5 text-indigo-600 mt-0.5" aria-hidden />
        <div>
          <h3 className="text-base font-bold text-slate-900">Styled texts ({list.length})</h3>
          <p className="text-xs text-slate-500 mt-1 flex gap-1.5">
            <MousePointerClick className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />
            To style any single text, open the store, choose <b>Style Text</b> in the CMS Live Mode bar and click the text.
          </p>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-slate-500">No text has its own style yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.map(rule => {
            const d = rule.style.desktop || {};
            const summary = [
              fontName(d['font-family']), d['font-size'], d['font-weight'] && `weight ${d['font-weight']}`,
              d['text-align'] && `aligned ${d['text-align']}`, (rule.style.tablet || rule.style.mobile) && 'per-device sizes',
            ].filter(Boolean).join(' · ');
            return (
              <li key={rule.id} className="py-2.5 flex items-center gap-3">
                <span aria-hidden className="w-4 h-4 rounded border border-slate-200 shrink-0" style={{ background: d.color || 'transparent' }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate" title={rule.text}>“{rule.text}”</p>
                  <p className="text-[11px] text-slate-500 truncate">{PAGE_NAMES[rule.page] || rule.page}{summary ? ` · ${summary}` : ''}</p>
                </div>
                <button type="button" disabled={busy === rule.id} onClick={() => remove(rule.id)}
                  aria-label={`Remove style from “${rule.text.slice(0, 40)}”`}
                  className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                  <Trash2 className="w-4 h-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default CMSStyledTextsPanel;
