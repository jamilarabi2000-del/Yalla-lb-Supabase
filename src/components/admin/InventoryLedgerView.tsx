import React, { useEffect, useMemo, useState } from 'react';
import { Box, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface LedgerRow {
  id: string;
  product_id: string | null;
  quantity_change: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  created_at: string;
  products?: { name: string }[] | { name: string } | null;
}

/**
 * Inventory Ledger.
 *
 * This tab previously fell through to a placeholder card reading
 * "Supabase-backed administration module." The underlying table was also
 * unreadable: `inventory_ledger` carried RLS policies for `authenticated` but
 * no matching grant, so every query failed with "permission denied" regardless.
 * The grant is in place now, and this renders the real append-only history.
 */
/** PostgREST returns an embedded relation as an array. */
const productName = (row: LedgerRow): string | undefined => {
  const p = row.products;
  if (!p) return undefined;
  return Array.isArray(p) ? p[0]?.name : p.name;
};

export const InventoryLedgerView: React.FC = () => {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from('inventory_ledger')
      .select('id, product_id, quantity_change, reason, reference_type, reference_id, note, created_at, products(name)')
      .order('created_at', { ascending: false })
      .limit(250);
    if (loadError) setError(loadError.message);
    else setRows((data as unknown as LedgerRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [r.reason, r.reference_type, r.note, productName(r), r.product_id]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">Inventory Ledger</h2>
          <p className="text-sm text-slate-500">
            Append-only record of every stock movement: sales, adjustments, cancellations and returns.
          </p>
        </div>
        <button onClick={load} className="px-3 py-2 rounded-xl bg-slate-100 font-bold text-sm inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4" aria-hidden="true" />Refresh
        </button>
      </div>

      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-label="Filter inventory movements"
        placeholder="Filter product, reason, reference or note…"
        className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white"
      />

      {loading ? (
        <div className="p-8 bg-white rounded-2xl border text-center text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> Loading inventory movements…
        </div>
      ) : error ? (
        <div className="p-8 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 bg-white rounded-2xl border text-center">
          <Box className="w-10 h-10 mx-auto text-slate-300" aria-hidden="true" />
          <h3 className="mt-3 font-bold text-slate-700">No stock movements recorded</h3>
          <p className="text-sm text-slate-500 mt-1">
            Entries appear here as orders are placed, cancelled or adjusted.
          </p>
        </div>
      ) : (
        <div className="bg-white border rounded-2xl overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th scope="col" className="p-3">Time</th>
                <th scope="col" className="p-3">Product</th>
                <th scope="col" className="p-3">Change</th>
                <th scope="col" className="p-3">Reason</th>
                <th scope="col" className="p-3">Reference</th>
                <th scope="col" className="p-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-3">{productName(r) || (r.product_id ? <span className="font-mono text-xs">{r.product_id}</span> : <span className="text-slate-400">deleted product</span>)}</td>
                  <td className={`p-3 font-bold ${r.quantity_change < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {r.quantity_change > 0 ? `+${r.quantity_change}` : r.quantity_change}
                  </td>
                  <td className="p-3">{r.reason}</td>
                  <td className="p-3 text-xs">{r.reference_type || '—'}</td>
                  <td className="p-3 text-xs text-slate-500">{r.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default InventoryLedgerView;
