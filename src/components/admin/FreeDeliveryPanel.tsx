import React, { useEffect, useState } from 'react';
import { Save, Truck } from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import type { FreeDeliveryFrom } from '../../lib/delivery';

type Mode = 'always' | 'from' | 'off';

const modeOf = (from: FreeDeliveryFrom): Mode => (from === null ? 'off' : from === 0 ? 'always' : 'from');

export function describeFreeDelivery(from: FreeDeliveryFrom): string {
  if (from === null) return 'Off: orders pay delivery unless every item is in a free-delivery category.';
  if (from === 0) return 'Every order in Lebanon ships free.';
  return `Orders in Lebanon from $${from.toFixed(2)} ship free.`;
}

const AMOUNT_PATTERN = /^(0|[1-9][0-9]{0,3})(\.[0-9]{1,2})?$/;

/**
 * The shop-wide free delivery rule for Lebanon. Checkout applies it
 * (private.lebanon_free_delivery_applies) to the subtotal before discounts,
 * for standard and express delivery in every Lebanese region.
 */
export const FreeDeliveryPanel: React.FC = () => {
  const { freeDeliveryFromUSD, saveFreeDeliveryFrom, showToast } = useShop();
  const [mode, setMode] = useState<Mode>(modeOf(freeDeliveryFromUSD));
  const [amount, setAmount] = useState(freeDeliveryFromUSD ? String(freeDeliveryFromUSD) : '50');
  const [saving, setSaving] = useState(false);

  // Follow the stored rule when it loads, or after a save.
  useEffect(() => {
    setMode(modeOf(freeDeliveryFromUSD));
    if (freeDeliveryFromUSD) setAmount(String(freeDeliveryFromUSD));
  }, [freeDeliveryFromUSD]);

  const typed = amount.trim();
  const amountValid = AMOUNT_PATTERN.test(typed) && Number(typed) > 0;
  const next: FreeDeliveryFrom = mode === 'off' ? null : mode === 'always' ? 0 : Number(typed);
  const invalid = mode === 'from' && !amountValid;
  const changed = !invalid && next !== freeDeliveryFromUSD;

  const save = async () => {
    if (!changed) return;
    setSaving(true);
    try {
      await saveFreeDeliveryFrom(next);
      showToast(describeFreeDelivery(next), 'success');
    } catch (err: any) {
      showToast(err?.message || 'Free delivery was not saved. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const option = (value: Mode, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      id={`free-delivery-mode-${value}`}
      onClick={() => setMode(value)}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
        mode === value ? 'bg-white text-emerald-800 shadow-xs ring-1 ring-emerald-300' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );

  return (
    <section
      id="free-delivery-panel"
      aria-labelledby="free-delivery-panel-title"
      className="bg-white p-4 sm:p-5 rounded-3xl border border-emerald-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center gap-4 justify-between"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Truck className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 id="free-delivery-panel-title" className="text-sm font-bold text-slate-900">Free delivery across Lebanon</h3>
          <p className="text-[11px] text-slate-500">
            Standard and express, every region in Lebanon; diaspora shipping is not affected. A category can also ship free
            on its own: use the switch on the category.
          </p>
          <p id="free-delivery-current" className="text-[11px] font-bold text-emerald-700 mt-1">
            Now: {describeFreeDelivery(freeDeliveryFromUSD)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div role="radiogroup" aria-label="Free delivery across Lebanon" className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {option('always', 'Every order')}
          {option('from', 'Orders from')}
          {option('off', 'Off')}
        </div>
        {mode === 'from' && (
          <label className="flex items-center gap-1 text-xs font-bold text-slate-700">
            <span aria-hidden="true">$</span>
            <input
              id="free-delivery-amount"
              type="text"
              inputMode="decimal"
              aria-label="Minimum order subtotal in US dollars"
              aria-invalid={invalid}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className={`w-24 px-2.5 py-1.5 rounded-lg border text-xs font-bold focus:outline-none focus:ring-2 ${
                invalid ? 'border-rose-300 focus:ring-rose-200' : 'border-slate-200 focus:ring-emerald-200'
              }`}
            />
          </label>
        )}
        <button
          type="button"
          id="free-delivery-save"
          onClick={save}
          disabled={!changed || saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving…' : 'Save'}</span>
        </button>
        {invalid && (
          <p role="alert" className="basis-full text-[11px] text-rose-600">
            Enter an amount from $0.01 to $9,999.99, with at most two decimals.
          </p>
        )}
      </div>
    </section>
  );
};
