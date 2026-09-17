import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface NotificationRow {
  id: string;
  user_id: string | null;
  title: string | null;
  body: string | null;
  kind: string | null;
  is_read: boolean | null;
  created_at: string;
}

/**
 * Notifications.
 *
 * Another tab that fell through to the "Supabase-backed administration module"
 * placeholder. `notifications` had RLS policies but no grant for
 * `authenticated`, so it was unreadable even if the tab had been implemented.
 */
export const NotificationsView: React.FC = () => {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250);
    if (loadError) setError(loadError.message);
    else setRows((data as NotificationRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    const previous = rows;
    setRows(rs => rs.map(r => (r.id === id ? { ...r, is_read: true } : r)));
    const { error: updateError } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (updateError) {
      setRows(previous);
      setError(updateError.message);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [r.title, r.body, r.kind].filter(Boolean).some(v => String(v).toLowerCase().includes(q)));
  }, [rows, query]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">Notifications</h2>
          <p className="text-sm text-slate-500">Operational notices raised by the platform.</p>
        </div>
        <button onClick={load} className="px-3 py-2 rounded-xl bg-slate-100 font-bold text-sm inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4" aria-hidden="true" />Refresh
        </button>
      </div>

      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-label="Filter notifications"
        placeholder="Filter title, body or kind…"
        className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white"
      />

      {loading ? (
        <div className="p-8 bg-white rounded-2xl border text-center text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> Loading notifications…
        </div>
      ) : error ? (
        <div className="p-8 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 bg-white rounded-2xl border text-center">
          <Bell className="w-10 h-10 mx-auto text-slate-300" aria-hidden="true" />
          <h3 className="mt-3 font-bold text-slate-700">No notifications</h3>
          <p className="text-sm text-slate-500 mt-1">Platform notices will appear here as they are raised.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map(n => (
            <li key={n.id} className={`bg-white border rounded-2xl p-4 flex items-start justify-between gap-4 ${n.is_read ? 'opacity-60' : ''}`}>
              <div className="min-w-0">
                <div className="font-bold truncate">{n.title || n.kind || 'Notification'}</div>
                {n.body && <p className="text-sm text-slate-600 mt-1">{n.body}</p>}
                <div className="text-xs text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
              </div>
              {!n.is_read && (
                <button onClick={() => markRead(n.id)} className="px-3 py-2 rounded-xl bg-slate-100 font-bold text-xs shrink-0">
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default NotificationsView;
