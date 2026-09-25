import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Lightbulb, RefreshCw, ShoppingCart, Sparkles, Trash2 } from 'lucide-react';
import { BrandIcon } from '../ui/BrandIcon';
import { useShop } from '../../context/ShopContext';
import { supabaseOrderService } from '../../services/supabaseOrderService';
import { supabaseUserDataService } from '../../services/supabaseUserDataService';
import {
  ABANDONED_AFTER_MINUTES,
  buildActiveCarts,
  cartInsights,
  formatIdle,
  recoveryMessage,
  type CartRow,
  type LineProblem,
} from '../../lib/activeCarts';
import {
  buildCustomerIndex,
  customerRegionLabel,
  customerWhatsAppHref,
  type CustomerRecord,
} from '../../lib/customerIndex';

const usd = (n: number) => `$${n.toFixed(2)}`;
const PROBLEM_LABEL: Record<LineProblem, string> = {
  removed: 'no longer in the catalog',
  unpublished: 'unpublished',
  out_of_stock: 'out of stock',
};
const REFRESH_MS = 60_000;

export const ActiveCartsView: React.FC = () => {
  const shop = useShop() as any;
  const products = shop.products || [];
  const currentUserId: string | undefined = shop.authUser?.uid;
  const toast = (msg: string, kind: 'success' | 'error' = 'success') => shop.showToast?.(msg, kind);

  const [rows, setRows] = useState<CartRow[]>([]);
  const [people, setPeople] = useState<Map<string, CustomerRecord>>(new Map());
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [clearing, setClearing] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFailure('');
    try {
      const [carts, profiles, ledger] = await Promise.all([
        supabaseUserDataService.listCartsForAdmin(),
        supabaseUserDataService.listProfilesForDirectory(),
        supabaseOrderService.fetchOrderLedger(),
      ]);
      // Every account, staff included: the admin's own cart is one of them.
      setPeople(new Map(buildCustomerIndex(profiles, ledger, { includeStaff: true }).map(c => [c.id, c])));
      setRows(carts);
      setLoadedAt(Date.now());
    } catch (e: any) {
      setFailure(e?.message || 'Carts could not be loaded.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  // Carts are not streamed; the view re-reads them every minute while open.
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const carts = useMemo(() => buildActiveCarts(rows, products, loadedAt ?? Date.now()), [rows, products, loadedAt]);
  const insights = useMemo(() => cartInsights(carts), [carts]);
  const reachable = carts.filter(c => customerWhatsAppHref(people.get(c.userId)?.phone, '')).length;

  const clearCart = async (userId: string, name: string) => {
    if (!confirm(`Clear ${name}'s saved cart?\n\nIt is removed from the server. If they are browsing right now, their open session may save it again.`)) return;
    setClearing(userId);
    try {
      await supabaseUserDataService.clearCartAsAdmin(userId);
      toast(`${name}'s cart was cleared.`);
      await load();
    } catch (e: any) {
      toast(e?.message || 'The cart could not be cleared.', 'error');
    } finally {
      setClearing(null);
    }
  };

  return (
    <section className="space-y-5 text-slate-900">
      <header className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div className="flex items-start gap-3 mr-auto">
          <div className="p-2.5 rounded-2xl bg-indigo-50 text-[#4f46e5]"><ShoppingCart className="w-6 h-6" aria-hidden /></div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">Active Shopping Carts</h2>
            <p className="text-sm text-slate-500">Live monitoring of shopping sessions, abandonment, and instant recovery</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-black flex items-center gap-2">
            <span className="relative flex w-2 h-2" aria-hidden>
              <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
            </span>
            {insights.carts} Active Cart Session{insights.carts === 1 ? '' : 's'}
          </span>
          <button onClick={load} aria-label="Refresh carts" className="p-2 rounded-xl bg-white border border-slate-200">
            <RefreshCw className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </header>

      <p className="text-xs text-slate-500">
        Signed-in shoppers only; a guest's cart stays in their browser.
        {loadedAt && ` Updated ${new Date(loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, refreshed every minute.`}
      </p>

      {failure && (
        <div role="alert" className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm font-bold text-rose-700">{failure}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-4">
          {loading && <div className="p-10 bg-white border border-slate-200 rounded-3xl text-center text-sm text-slate-500">Loading carts…</div>}
          {!loading && !failure && carts.length === 0 && (
            <div className="p-10 bg-white border border-slate-200 rounded-3xl text-center text-sm text-slate-500">
              <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-slate-300" aria-hidden />
              No shopper has anything in their cart right now.
            </div>
          )}
          {carts.map(cart => {
            const person = people.get(cart.userId);
            const name = person?.name || 'Unknown shopper';
            const isLive = cart.userId === currentUserId;
            const wa = cart.subtotalUSD > 0 ? customerWhatsAppHref(person?.phone, recoveryMessage(cart.subtotalUSD)) : undefined;
            const location = [person?.city, customerRegionLabel(person?.governorate)].filter(Boolean).join(', ');
            return (
              <article key={cart.userId} className="bg-white border border-indigo-100 shadow-sm rounded-3xl p-5">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 mr-auto">
                    <h3 className="font-black flex flex-wrap items-center gap-2">
                      {name}
                      {isLive && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden /> Live User
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500">
                      <span className="font-mono">{person?.phone || 'No phone'}</span>{location && ` • ${location}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`px-2 py-1 rounded-full font-black ${cart.abandoned ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {cart.abandoned ? 'Abandoned Cart' : 'Active'}
                    </span>
                    <span className="text-slate-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden />{formatIdle(cart.minutesIdle)}</span>
                  </div>
                </div>

                <ul className="mt-4 pt-3 border-t border-slate-100 space-y-1 text-sm">
                  {cart.lines.map((line, i) => (
                    <li key={`${line.productId}-${i}`} className={line.problem ? 'text-slate-500' : ''}>
                      • {line.quantity}× {line.name}{' '}
                      {line.problem
                        ? <span className="text-[11px] font-bold">({PROBLEM_LABEL[line.problem]})</span>
                        : <span className="text-slate-500">({usd(line.lineTotalUSD)})</span>}
                    </li>
                  ))}
                  {cart.ignoredLines > 0 && (
                    <li className="text-[11px] text-slate-500">{cart.ignoredLines} unreadable line{cart.ignoredLines === 1 ? '' : 's'} ignored</li>
                  )}
                </ul>

                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <p className="text-sm mr-auto">Subtotal: <span className="font-black">{usd(cart.subtotalUSD)}</span></p>
                  {wa ? (
                    <a href={wa} target="_blank" rel="noreferrer" data-brand="whatsapp"
                      className="social-pill px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center gap-1.5">
                      <BrandIcon brand="whatsapp" className="w-4 h-4" /> WhatsApp Recovery
                    </a>
                  ) : (
                    <span title={cart.subtotalUSD > 0 ? 'No number that can receive WhatsApp' : 'Nothing in this cart can be bought right now'}
                      className="px-3 py-2 rounded-xl bg-slate-100 text-slate-500 text-xs font-black flex items-center gap-1.5 cursor-not-allowed">
                      <BrandIcon brand="whatsapp" className="w-4 h-4" /> WhatsApp Recovery
                    </span>
                  )}
                  {cart.abandoned && (
                    <button onClick={() => clearCart(cart.userId, name)} disabled={clearing !== null}
                      className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-black flex items-center gap-1.5 disabled:opacity-50">
                      <Trash2 className="w-4 h-4" aria-hidden /> {clearing === cart.userId ? 'Clearing…' : 'Clear Cart'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <aside className="space-y-4">
          <div className="bg-white border border-indigo-100 shadow-sm rounded-3xl p-5">
            <h3 className="font-black flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#4f46e5]" aria-hidden /> Performance Insights</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Total In-Cart Value</dt><dd className="font-black">{usd(insights.totalValueUSD)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Total Cart Items</dt><dd className="font-black">{insights.totalUnits} Unit{insights.totalUnits === 1 ? '' : 's'}</dd></div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Abandoned (idle {ABANDONED_AFTER_MINUTES}+ min)</dt>
                <dd className="font-black text-right">{insights.abandonedCount} · {usd(insights.abandonedValueUSD)}</dd>
              </div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Reachable on WhatsApp</dt><dd className="font-black">{reachable} of {insights.carts}</dd></div>
            </dl>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-3xl p-5 text-sm text-amber-900">
            <p className="font-black flex items-center gap-2"><Lightbulb className="w-4 h-4" aria-hidden /> Recovery tip</p>
            <p className="mt-1">Follow up while the cart is fresh: a short, personal WhatsApp message that quotes the cart total is the quickest way to help a shopper finish checkout.</p>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default ActiveCartsView;
