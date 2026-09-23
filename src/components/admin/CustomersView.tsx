import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { CheckCircle2, Download, Eye, MapPin, MessageCircle, Package, RefreshCw, Search, Users, X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { supabaseOrderService } from '../../services/supabaseOrderService';
import { supabaseUserDataService } from '../../services/supabaseUserDataService';
import { sanitizeRowForCsv } from '../../utils/csvSafe';
import type { Order } from '../../types';
import {
  buildCustomerIndex,
  customerCsvRows,
  customerGreeting,
  customerInitials,
  customerLocation,
  customerRegionLabel,
  customerWhatsAppHref,
  filterCustomers,
  orderStatusPill,
  type CustomerRecord,
} from '../../lib/customerIndex';

const usd = (n: number) => `$${n.toFixed(2)}`;
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export const CustomersView: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [query, setQuery] = useState('');
  const [viewing, setViewing] = useState<CustomerRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure('');
    try {
      // Every profile and every order, not the 50-order page the context
      // holds -- otherwise lifetime spend is only as old as that page.
      const [profiles, ledger] = await Promise.all([
        supabaseUserDataService.listProfilesForDirectory(),
        supabaseOrderService.fetchOrderLedger(),
      ]);
      setCustomers(buildCustomerIndex(profiles, ledger));
    } catch (e: any) {
      setFailure(e?.message || 'Customers could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => filterCustomers(customers, query), [customers, query]);

  const downloadReport = () => {
    const csv = Papa.unparse(customerCsvRows(visible).map(sanitizeRowForCsv));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `yalla_customers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-5 text-slate-900">
      <header className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div className="flex items-start gap-3 mr-auto">
          <div className="p-2.5 rounded-2xl bg-indigo-50 text-[#4f46e5]"><Users className="w-6 h-6" aria-hidden /></div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">Customers Directory</h2>
            <p className="text-sm text-slate-500">Manage verified buyers, lifetime spent, direct WhatsApp courier comms</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={downloadReport} disabled={loading || visible.length === 0}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-black flex items-center gap-1.5 disabled:opacity-50">
            <Download className="w-4 h-4 text-[#4f46e5]" aria-hidden /> Download Report (CSV)
          </button>
          <span className="px-3 py-2 rounded-xl bg-indigo-50 text-[#4f46e5] text-xs font-black">
            Total: {customers.length} Customer{customers.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
        <input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search customers"
          placeholder="Search by customer name, phone number, email, or city..."
          className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500" />
      </div>

      {failure ? (
        <div role="alert" className="p-6 bg-rose-50 border border-rose-200 rounded-3xl text-sm text-rose-700 flex flex-wrap items-center gap-3">
          <span className="font-bold mr-auto">{failure}</span>
          <button onClick={load} className="px-3 py-2 rounded-xl bg-white border border-rose-200 text-xs font-black flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" aria-hidden /> Retry
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                {['Customer', 'Contact Info', 'Location', 'Orders', 'Lifetime Spend', 'Last Activity', ''].map(h => (
                  <th key={h || 'actions'} scope="col" className="p-4 font-black">{h || <span className="sr-only">Actions</span>}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="p-10 text-center text-slate-500">Loading customers…</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={7} className="p-10 text-center text-slate-500">
                  {customers.length === 0 ? 'No customers yet.' : 'No customers match your search.'}
                </td></tr>
              )}
              {!loading && visible.map(c => {
                const wa = customerWhatsAppHref(c.phone, customerGreeting(c.name));
                return (
                  <tr key={c.id} className="align-top">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <span aria-hidden className="w-10 h-10 shrink-0 rounded-full bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center">
                          {customerInitials(c.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold truncate">
                            {c.name}
                            {c.role !== 'customer' && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-black uppercase">{c.role}</span>}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{c.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-mono text-xs">{c.phone || '—'}</p>
                      {wa && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> WhatsApp Enabled
                        </p>
                      )}
                    </td>
                    <td className="p-4 text-xs">
                      <p className="font-bold">{customerRegionLabel(c.governorate) || '—'}</p>
                      {c.city && <p className="text-slate-500">{c.city}</p>}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-xs font-bold whitespace-nowrap">
                        {c.ordersCount} order{c.ordersCount === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="p-4 font-black text-slate-900">{usd(c.totalSpentUSD)}</td>
                    <td className="p-4 text-xs whitespace-nowrap">
                      {c.lastOrderDate ? shortDate(c.lastOrderDate) : (
                        <span className="text-slate-400">No orders yet{c.joinedAt ? ` · joined ${shortDate(c.joinedAt)}` : ''}</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-1.5">
                        {wa ? (
                          <a href={wa} target="_blank" rel="noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black flex items-center gap-1 whitespace-nowrap">
                            <MessageCircle className="w-3.5 h-3.5" aria-hidden /> WhatsApp Chat
                          </a>
                        ) : (
                          <span title="No number that can receive WhatsApp"
                            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-[11px] font-black flex items-center gap-1 whitespace-nowrap cursor-not-allowed">
                            <MessageCircle className="w-3.5 h-3.5" aria-hidden /> WhatsApp Chat
                          </span>
                        )}
                        <button onClick={() => setViewing(c)}
                          className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[11px] font-black flex items-center gap-1 whitespace-nowrap">
                          <Eye className="w-3.5 h-3.5" aria-hidden /> View Orders
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewing && <CustomerOrdersModal customer={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
};

const CustomerOrdersModal: React.FC<{ customer: CustomerRecord; onClose: () => void }> = ({ customer, onClose }) => {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [failure, setFailure] = useState('');
  const { containerRef } = useDialog({ isOpen: true, onClose });

  useEffect(() => {
    let live = true;
    supabaseOrderService.fetchOrdersForUser(customer.id)
      .then(rows => { if (live) setOrders(rows); })
      .catch((e: any) => { if (live) setFailure(e?.message || 'Orders could not be loaded.'); });
    return () => { live = false; };
  }, [customer.id]);

  const uncounted = customer.allOrdersCount - customer.ordersCount;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={containerRef} role="dialog" aria-modal="true" aria-labelledby="customer-orders-title"
        className="w-full max-w-xl h-full bg-white shadow-xl overflow-y-auto p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span aria-hidden className="w-12 h-12 shrink-0 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center">
            {customerInitials(customer.name)}
          </span>
          <div className="min-w-0 mr-auto">
            <h3 id="customer-orders-title" className="text-lg font-black truncate">{customer.name}</h3>
            <p className="text-xs text-slate-500 truncate">{[customer.email, customer.phone].filter(Boolean).join(' · ') || 'No contact details'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" aria-hidden /></button>
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-2">
          <div className="p-3 rounded-2xl bg-slate-50">
            <dt className="text-[10px] font-black uppercase text-slate-500">Total Orders</dt>
            <dd className="text-lg font-black">{customer.ordersCount}</dd>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50">
            <dt className="text-[10px] font-black uppercase text-slate-500">Lifetime Value</dt>
            <dd className="text-lg font-black">{usd(customer.totalSpentUSD)}</dd>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 min-w-0">
            <dt className="text-[10px] font-black uppercase text-slate-500">Primary Location</dt>
            <dd className="text-sm font-black truncate flex items-center gap-1" title={customerLocation(customer)}>
              <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" aria-hidden />{customerLocation(customer) || '—'}
            </dd>
          </div>
        </dl>
        {uncounted > 0 && (
          <p className="mt-2 text-[11px] text-slate-500">
            {uncounted} cancelled or returned order{uncounted === 1 ? ' is' : 's are'} listed below but not counted.
          </p>
        )}

        <h4 className="mt-6 mb-3 text-xs font-black uppercase text-slate-500">Order History</h4>
        {failure && <p role="alert" className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{failure}</p>}
        {!failure && orders === null && <p className="text-sm text-slate-500">Loading orders…</p>}
        {orders?.length === 0 && <p className="text-sm text-slate-500">This customer has not placed an order yet.</p>}
        <div className="space-y-3">
          {orders?.map(o => {
            const pill = orderStatusPill(o.status);
            return (
              <article key={o.id} className="border border-slate-200 rounded-2xl p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400" aria-hidden />
                  <span className="font-mono text-[11px] font-bold text-indigo-950 break-all">#{o.id}</span>
                  <span className={`ml-auto px-2 py-0.5 rounded-lg border text-[11px] font-bold ${pill.className}`}>{pill.label}</span>
                </div>
                <ul className="mt-2 text-xs text-slate-600 space-y-0.5">
                  {o.items.map((item, i) => (
                    <li key={`${item.product.id}-${i}`}>{item.quantity}× {item.product.name || 'Item'}</li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500">{shortDate(o.date)}</span>
                  <span className="font-black text-slate-900">{usd(o.totalUSD)}</span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CustomersView;
