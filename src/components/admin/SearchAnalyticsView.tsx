import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, RefreshCw, Flame, Clock3, Copy, Check,
  ExternalLink, Trash2, Terminal, X, TrendingUp, Users
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useShop } from '../../context/ShopContext';
import { supabaseUserDataService } from '../../services/supabaseUserDataService';
import { buildCustomerIndex } from '../../lib/customerIndex';
import type { SearchLog } from '../../types';

const CACHE_KEY = 'yallalb_search_logs_cache';
// search_logs is not in the realtime publication, so the view re-reads it.
const REFRESH_MS = 30_000;
type WindowKey = 'all' | '24h' | '7d' | '30d';

const readCache = (): SearchLog[] => {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const safeCsv = (value: unknown) => {
  const s = String(value ?? '');
  const protectedValue = /^[=+\-@]/.test(s) ? "'" + s : s;
  return '"' + protectedValue.replace(/"/g, '""') + '"';
};

const relativeTime = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
};

const isArabic = (q: string) => /[\u0600-\u06FF]/.test(q);

export const SearchAnalyticsView: React.FC = () => {
  const shop = useShop() as any;
  const [rows, setRows] = useState<SearchLog[]>(readCache);
  const [windowKey, setWindowKey] = useState<WindowKey>('7d');
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [terminalQuery, setTerminalQuery] = useState('');

  const load = async () => {
    setLoading(true);
    const [{ data, error }, profiles] = await Promise.all([
      supabase
        .from('search_logs')
        .select('id,query,origin,user_id,created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      // Names for signed-in shoppers' searches; guests stay "Guest".
      supabaseUserDataService.listProfilesForDirectory().catch(() => []),
    ]);
    const names = new Map(buildCustomerIndex(profiles, [], { includeStaff: true }).map(c => [c.id, c.name]));
    if (!error) {
      const normalized = (data || []).map((r: any) => ({
        id: String(r.id),
        query: String(r.query ?? r.search_query ?? '').trim(),
        timestamp: r.timestamp ?? r.created_at ?? new Date().toISOString(),
        userId: r.user_id ?? null,
        userName: r.user_id ? names.get(r.user_id) || 'Shopper' : null,
        origin: r.origin ?? 'direct'
      })).filter((r: SearchLog) => r.query);
      setRows(normalized);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(normalized.slice(0, 200))); } catch {}
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRows = useMemo(() => {
    const now = Date.now();
    const cutoff = windowKey === 'all' ? 0 :
      windowKey === '24h' ? now - 86400000 :
      windowKey === '7d' ? now - 7 * 86400000 :
      now - 30 * 86400000;
    const q = filter.trim().toLowerCase();
    return rows.filter(r => {
      const t = new Date(r.timestamp).getTime();
      return t >= cutoff && (!q || r.query.toLowerCase().includes(q));
    });
  }, [rows, windowKey, filter]);

  const leaderboard = useMemo(() => {
    const map = new Map<string, { count: number; first: string; last: string }>();
    filteredRows.forEach(r => {
      const key = r.query.trim();
      const prev = map.get(key);
      if (!prev) map.set(key, { count: 1, first: r.timestamp, last: r.timestamp });
      else {
        prev.count++;
        if (new Date(r.timestamp) < new Date(prev.first)) prev.first = r.timestamp;
        if (new Date(r.timestamp) > new Date(prev.last)) prev.last = r.timestamp;
      }
    });
    const total = filteredRows.length;
    return [...map.entries()]
      .map(([query, v]) => ({ query, ...v, share: total ? (v.count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count || a.query.localeCompare(b.query))
      .slice(0, 50);
  }, [filteredRows]);

  const velocity24 = useMemo(() => {
    const cutoff = Date.now() - 86400000;
    return rows.filter(r => new Date(r.timestamp).getTime() >= cutoff).length;
  }, [rows]);

  const top = leaderboard[0];
  const average = leaderboard.length ? filteredRows.length / leaderboard.length : 0;

  const inspect = (query: string) => {
    shop.setSearchQuery?.(query);
    shop.setActiveTab?.('products');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const copyQuery = async (query: string) => {
    try { await navigator.clipboard.writeText(query); } catch {}
    setCopied(query);
    setTimeout(() => setCopied(null), 1200);
  };

  const exportCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    const lines = [
      ['rank','keyword','search_count','share_percent','first_seen','last_seen'].join(','),
      ...leaderboard.map((r, i) => [
        i + 1, safeCsv(r.query), r.count, r.share.toFixed(2),
        safeCsv(r.first), safeCsv(r.last)
      ].join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yalla_search_trends_' + windowKey + '_' + date + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const simulate = async (query: string) => {
    setTerminalQuery('');
    if (query.trim()) await shop.logSearchQuery?.(query.trim(), 'direct');
    await load();
  };

  const clearHistory = async () => {
    // Ask for the deleted rows back. A purge that RLS filters is not an error
    // to PostgREST, so without this an unverified administrator would see the
    // table clear on screen while every row survived in the database.
    const { data: purged, error } = await supabase
      .from('search_logs')
      .delete()
      .not('id', 'is', null)
      .select('id');

    if (error) {
      shop.showToast?.(error.message || 'Unable to clear search history', 'error');
      return;
    }

    if (!purged?.length && rows.length > 0) {
      shop.showToast?.(
        'Search history was not cleared. Your administrator session may not be verified.',
        'error',
      );
      return;
    }

    setRows([]);
    try { localStorage.removeItem(CACHE_KEY); } catch {}
    setClearOpen(false);
    shop.showToast?.(`Cleared ${purged?.length ?? 0} search records.`, 'success');
  };

  const presets = ['Zaatar Baladi','Olive Oil Koura','Soap of Tripoli','Debs El Remman','Kishk','Cedar Wood'];

  return (
    <section className="space-y-5">
      <header className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-10 h-10 rounded-2xl bg-amber-50 text-[#b89753] flex items-center justify-center"><Search className="w-5 h-5" /></span>
            <div><h2 className="text-lg sm:text-xl font-black text-slate-900">Search Trends &amp; Discovery Analytics</h2><p className="text-xs font-semibold text-slate-500">Shopper intent and demand intelligence for Yalla Lebanon.</p></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span title="Refreshes every 30 seconds" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Live Stream</span>
          <button onClick={load} className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50" aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          [Search, 'Total Searches', filteredRows.length.toLocaleString('en-US'), 'logged', 'bg-indigo-50 text-indigo-600'],
          [Users, 'Unique Keywords', leaderboard.length.toLocaleString('en-US'), 'queries', 'bg-amber-50 text-[#b89753]'],
          [Flame, 'Top Search', top ? top.query : '—', top ? `${top.share.toFixed(1)}% of searches` : '', 'bg-emerald-50 text-emerald-700'],
          [Clock3, "Today's Activity", velocity24.toLocaleString('en-US'), 'in last 24h', 'bg-violet-50 text-violet-700']
        ].map(([Icon, label, value, sub, tone]: any) => <div key={label} className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs"><div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tone}`}><Icon className="w-4 h-4" /></div><p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-2xl sm:text-3xl font-black text-slate-900 truncate">{value}</p>{sub && <p className="text-[10px] font-bold text-slate-500 mt-1">{sub}</p>}</div>)}
      </div>

      <div className="bg-slate-100/70 p-2 rounded-2xl border border-slate-200/80 flex flex-col lg:flex-row gap-2">
        <div className="flex overflow-x-auto gap-1">
          {(['all','24h','7d','30d'] as WindowKey[]).map(k => <button key={k} onClick={() => setWindowKey(k)} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${windowKey === k ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{k === 'all' ? 'All Time' : k === '24h' ? 'Last 24 Hours' : k === '7d' ? 'Past 7 Days' : 'Past 30 Days'}</button>)}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter keywords…" className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#b89753]" />
          {filter && <button onClick={() => setFilter('')} className="absolute right-2 top-2 p-1 text-slate-500"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <button onClick={exportCsv} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold hover:bg-slate-50">Export CSV</button>
        <button onClick={() => setClearOpen(true)} className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold hover:bg-rose-100"><Trash2 className="w-3.5 h-3.5 inline mr-1" />Clear History</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] gap-5">
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100"><div className="flex items-center justify-between"><div><h3 className="text-base font-black text-slate-900">Keyword Leaderboard</h3><p className="text-xs text-slate-500 mt-1">{average.toFixed(1)} searches per unique term</p></div><TrendingUp className="w-5 h-5 text-[#b89753]" /></div></div>
          <div className="divide-y divide-slate-100">
            {leaderboard.map((r, i) => <div key={r.query} className="p-4 flex items-center gap-3 hover:bg-slate-50/60">
              <span className={`w-7 h-7 shrink-0 rounded-lg border flex items-center justify-center text-[10px] font-black ${i === 0 ? 'bg-amber-100 text-amber-800 border-amber-300' : i === 1 ? 'bg-slate-200 text-slate-800 border-slate-300' : i === 2 ? 'bg-amber-700/15 text-amber-900 border-amber-700/30' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{i+1}</span>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-bold text-slate-900 truncate">{r.query}</span>{isArabic(r.query) && <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black">عربي</span>}</div><div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden"><div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{width: `${r.share}%`}} /></div><p className="mt-1 text-[10px] text-slate-500">{r.share.toFixed(1)}% share · last searched {relativeTime(r.last)}</p></div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-[#7d6230] border border-amber-200/80">{r.count}</span>
              <button onClick={() => inspect(r.query)} className="p-2 rounded-xl text-[#b89753] hover:bg-amber-50" title="Inspect in Store" aria-label={`Inspect "${r.query}" in the store`}><ExternalLink className="w-4 h-4" /></button>
              <button onClick={() => copyQuery(r.query)} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100" title="Copy Query" aria-label={`Copy "${r.query}"`}>{copied === r.query ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}</button>
            </div>)}
            {!leaderboard.length && <div className="p-10 text-center text-sm text-slate-500">No search events in this timeframe.</div>}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center gap-2"><Clock3 className="w-4 h-4 text-emerald-600" /><h3 className="font-black text-slate-900">Latest 20 Searches</h3></div>
            <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-100">
              {rows.slice(0,20).map(r => <div key={r.id} className="p-3.5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-900 truncate">{r.query}</span><span className="text-[10px] text-slate-500 whitespace-nowrap">{relativeTime(r.timestamp)}</span></div><div className="mt-1 flex items-center gap-1.5">{r.userName ? <span className="text-[9px] font-black uppercase tracking-wider text-slate-700">{r.userName}</span> : <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-500">Guest</span>}{r.origin && <span className="text-[9px] text-slate-500">• {r.origin}</span>}</div></div>)}
              {!rows.length && <div className="p-8 text-center text-xs text-slate-500">Waiting for shopper searches…</div>}
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-5 sm:p-6 text-white">
            <div className="flex items-center gap-2"><Terminal className="w-4 h-4 text-amber-400" /><h3 className="font-black">Search Pipeline Simulator</h3></div>
            <div className="flex flex-wrap gap-1.5 mt-4">{presets.map(p => <button key={p} onClick={() => simulate(p)} className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-[10px] font-bold">{p}</button>)}</div>
            <div className="flex gap-2 mt-4"><input value={terminalQuery} onChange={e => setTerminalQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') simulate(terminalQuery); }} placeholder="Inject test query…" className="min-w-0 flex-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:outline-none" /><button onClick={() => simulate(terminalQuery)} className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-2 text-xs font-extrabold">Run</button></div>
          </div>
        </aside>
      </div>

      {clearOpen && <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"><div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl"><Trash2 className="w-8 h-8 text-rose-600 mb-3" /><h3 className="text-lg font-black text-slate-900">Clear search history?</h3><p className="text-xs text-slate-500 mt-2">This permanently removes historical search logs from the analytics store.</p><div className="flex justify-end gap-2 mt-6"><button onClick={() => setClearOpen(false)} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">Cancel</button><button onClick={clearHistory} className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold">Delete History</button></div></div></div>}
    </section>
  );
};

export default SearchAnalyticsView;
