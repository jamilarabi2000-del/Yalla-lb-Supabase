import React, { useEffect, useState, useMemo } from 'react';
import { csvSafe } from '../../utils/csvSafe';
import { db } from '../../firebase';
import { collection, query, onSnapshot, orderBy, limit, doc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { 
  Search, 
  TrendingUp, 
  Clock, 
  Calendar, 
  Download, 
  Trash2, 
  Sparkles, 
  Filter, 
  ExternalLink, 
  Copy, 
  Check, 
  BarChart2, 
  Zap, 
  ArrowUpRight, 
  User, 
  Globe, 
  AlertCircle, 
  RefreshCw,
  SlidersHorizontal,
  Flame
} from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import { useDialog } from '../../hooks/useDialog';
import { SearchLog } from '../../types';

type TimeRangeFilter = 'all' | '24h' | '7d' | '30d';

export const SearchAnalyticsView: React.FC = () => {
  const { isAdminUser, setActiveTab, setSearchQuery: setGlobalSearchQuery, logSearchQuery, showToast } = useShop();
  
  const [searchLogs, setSearchLogs] = useState<SearchLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('all');
  const [tableSearchFilter, setTableSearchFilter] = useState('');
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [simulatedInput, setSimulatedInput] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  const { containerRef: clearConfirmModalRef } = useDialog({
    isOpen: showClearConfirm,
    onClose: () => setShowClearConfirm(false)
  });

  // Load from local storage cache initially
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem('yallalb_search_logs_cache');
        if (raw) {
          const cached: SearchLog[] = JSON.parse(raw);
          if (Array.isArray(cached) && cached.length > 0) {
            setSearchLogs(cached);
            setIsLoading(false);
          }
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Real-time Firestore sync listener
  useEffect(() => {
    if (!isAdminUser) return;
    let unsubscribe: () => void = () => {};
    try {
      const logsColRef = collection(db, 'search_logs');
      const q = query(logsColRef, orderBy('timestamp', 'desc'), limit(500));
      
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const fetchedLogs: SearchLog[] = [];
          snapshot.forEach((docSnap) => {
            fetchedLogs.push({ id: docSnap.id, ...docSnap.data() } as SearchLog);
          });

          // Merge with local storage cache to ensure zero loss
          let merged = fetchedLogs;
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              const raw = localStorage.getItem('yallalb_search_logs_cache');
              if (raw) {
                const cached: SearchLog[] = JSON.parse(raw);
                const fetchedIds = new Set(fetchedLogs.map(l => l.id));
                const fetchedKeys = new Set(fetchedLogs.map(l => `${l.query}_${l.timestamp?.substring(0, 16)}`));
                
                const extraCached = cached.filter(
                  c => !fetchedIds.has(c.id) && !fetchedKeys.has(`${c.query}_${c.timestamp?.substring(0, 16)}`)
                );
                merged = [...fetchedLogs, ...extraCached].sort((a, b) => {
                  return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                });
              }
            }
          } catch {
            merged = fetchedLogs;
          }

          setSearchLogs(merged);
          setIsLoading(false);
        },
        (error) => {
          console.warn("[SearchAnalyticsView] Firestore snapshot notice:", error);
          setIsLoading(false);
        }
      );
    } catch (err) {
      console.warn("[SearchAnalyticsView] Listener error:", err);
      setIsLoading(false);
    }

    return () => unsubscribe();
  }, []);

  // Filter logs by selected time range
  const filteredLogs = useMemo(() => {
    if (timeRange === 'all') return searchLogs;

    const now = Date.now();
    const thresholds: Record<TimeRangeFilter, number> = {
      all: 0,
      '24h': now - 24 * 60 * 60 * 1000,
      '7d': now - 7 * 24 * 60 * 60 * 1000,
      '30d': now - 30 * 24 * 60 * 60 * 1000,
    };

    const cutoff = thresholds[timeRange];
    return searchLogs.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return !isNaN(logTime) && logTime >= cutoff;
    });
  }, [searchLogs, timeRange]);

  // Aggregate search term frequencies & metadata
  const aggregatedTrends = useMemo(() => {
    const map: Record<string, { count: number; lastSeen: string; firstSeen: string; origins: Set<string> }> = {};

    filteredLogs.forEach((log) => {
      const q = log.query.trim();
      if (!q) return;

      if (!map[q]) {
        map[q] = {
          count: 0,
          lastSeen: log.timestamp,
          firstSeen: log.timestamp,
          origins: new Set()
        };
      }
      map[q].count += 1;
      if (new Date(log.timestamp) > new Date(map[q].lastSeen)) {
        map[q].lastSeen = log.timestamp;
      }
      if (new Date(log.timestamp) < new Date(map[q].firstSeen)) {
        map[q].firstSeen = log.timestamp;
      }
      if (log.origin) {
        map[q].origins.add(log.origin);
      }
    });

    const list = Object.entries(map).map(([term, data]) => ({
      term,
      count: data.count,
      lastSeen: data.lastSeen,
      firstSeen: data.firstSeen,
      origins: Array.from(data.origins)
    }));

    return list.sort((a, b) => b.count - a.count);
  }, [filteredLogs]);

  // Table search filtered list
  const displayedTrends = useMemo(() => {
    const filter = tableSearchFilter.trim().toLowerCase();
    if (!filter) return aggregatedTrends;
    return aggregatedTrends.filter(t => t.term.toLowerCase().includes(filter));
  }, [aggregatedTrends, tableSearchFilter]);

  // Metrics Calculations
  const totalSearches = filteredLogs.length;
  const uniqueTerms = aggregatedTrends.length;
  const topTerm = aggregatedTrends[0] || null;
  const topTermPercentage = totalSearches > 0 && topTerm ? Math.round((topTerm.count / totalSearches) * 100) : 0;

  const past24hSearchesCount = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return searchLogs.filter(l => new Date(l.timestamp).getTime() >= cutoff).length;
  }, [searchLogs]);

  // Copy query to clipboard
  const handleCopyQuery = (term: string) => {
    navigator.clipboard.writeText(term);
    setCopiedQuery(term);
    showToast(`Copied "${term}" to clipboard`, 'info');
    setTimeout(() => setCopiedQuery(null), 2000);
  };

  // Inspect in storefront catalog
  const handleInspectInStore = (term: string) => {
    setGlobalSearchQuery(term);
    setActiveTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Filtering catalog by "${term}"`, 'info');
  };

  // Export report as CSV
  const handleExportCSV = () => {
    if (aggregatedTrends.length === 0) {
      showToast('No search trends data to export yet', 'warning');
      return;
    }

    const headers = ['Rank', 'Search Term', 'Search Count', 'Percentage of Total', 'First Searched', 'Last Searched'];
    const rows = aggregatedTrends.map((t, idx) => [
      idx + 1,
      `"${csvSafe(t.term).replace(/"/g, '""')}"`,
      t.count,
      `${totalSearches > 0 ? ((t.count / totalSearches) * 100).toFixed(1) : 0}%`,
      `"${new Date(t.firstSeen).toLocaleString()}"`,
      `"${new Date(t.lastSeen).toLocaleString()}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `yalla_search_trends_${timeRange}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Search trends CSV report downloaded successfully', 'success');
  };

  // Simulate a search query (for merchant testing)
  const handleSimulateSearch = async (termToLog?: string) => {
    const term = (termToLog || simulatedInput).trim();
    if (!term) return;

    setIsSimulating(true);
    try {
      await logSearchQuery(term, 'direct');
      setSimulatedInput('');
      showToast(`Logged search query: "${term}"`, 'success');
    } catch (err) {
      console.warn("Failed to simulate search:", err);
      showToast('Failed to log test search', 'error');
    } finally {
      setIsSimulating(false);
    }
  };

  // Clear all search logs
  const handleClearLogs = async () => {
    setIsClearing(true);
    try {
      // Clear local storage
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('yallalb_search_logs_cache');
      }

      // Batch delete in Firestore
      const logsColRef = collection(db, 'search_logs');
      const snapshot = await getDocs(logsColRef);
      const batch = writeBatch(db);
      
      let count = 0;
      snapshot.forEach(docSnap => {
        batch.delete(docSnap.ref);
        count++;
      });

      if (count > 0) {
        await batch.commit();
      }

      setSearchLogs([]);
      setShowClearConfirm(false);
      showToast('Search trends history has been cleared successfully', 'success');
    } catch (err) {
      console.error("Failed to clear search logs:", err);
      showToast('Failed to clear search logs from database', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  // Format relative time helper
  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-[#b89753] flex items-center justify-center border border-amber-200/60 shadow-xs">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Search Trends & Discovery Analytics
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live Stream
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Live monitoring of search queries, shopper interests, and catalog demand across Lebanon.
              </p>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            disabled={totalSearches === 0}
            className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 flex items-center gap-2 transition-all cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          {totalSearches > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="Clear search history"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Clearing Logs */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div 
            ref={clearConfirmModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-search-modal-title"
            className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-slate-200 shadow-2xl space-y-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 id="clear-search-modal-title" className="text-base font-extrabold text-slate-900">Clear All Search Analytics Logs?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                This will permanently delete all {totalSearches} recorded search queries and reset trend leaderboards. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                disabled={isClearing}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearLogs}
                disabled={isClearing}
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isClearing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isClearing ? 'Clearing...' : 'Confirm Clear'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Searches */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Searches</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Search className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">{totalSearches}</span>
            <span className="text-xs font-semibold text-slate-400">logged</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {timeRange === 'all' ? 'All-time volume' : `Filtered (${timeRange})`}
          </p>
        </div>

        {/* Unique Terms */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Unique Keywords</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#b89753] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">{uniqueTerms}</span>
            <span className="text-xs font-semibold text-slate-400">distinct queries</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {uniqueTerms > 0 ? `${(totalSearches / Math.max(1, uniqueTerms)).toFixed(1)} searches/term avg` : 'No data yet'}
          </p>
        </div>

        {/* Top Trending Term */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Top Search</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg sm:text-xl font-black text-slate-900 truncate" title={topTerm?.term || '—'}>
              {topTerm?.term || '—'}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                {topTerm ? `${topTerm.count} queries` : '0'}
              </span>
              {topTerm && (
                <span className="text-[11px] font-semibold text-slate-400">
                  ({topTermPercentage}% of total)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Past 24h Activity */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Today's Activity</span>
            <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">{past24hSearchesCount}</span>
            <span className="text-xs font-semibold text-slate-400">in last 24h</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Real-time customer searches today
          </p>
        </div>
      </div>

      {/* Interactive Controls Bar: Timeframe & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100/70 p-2 rounded-2xl border border-slate-200/80">
        {/* Timeframe selector pills */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
          {(
            [
              { id: 'all', label: 'All Time' },
              { id: '24h', label: 'Last 24 Hours' },
              { id: '7d', label: 'Past 7 Days' },
              { id: '30d', label: 'Past 30 Days' },
            ] as const
          ).map((pill) => (
            <button
              key={pill.id}
              onClick={() => setTimeRange(pill.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                timeRange === pill.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Search query table filter */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Filter keywords in table..."
            value={tableSearchFilter}
            onChange={(e) => setTableSearchFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 bg-white text-xs text-slate-900 rounded-xl border border-slate-200 focus:outline-none focus:border-[#b89753] shadow-xs"
          />
          {tableSearchFilter && (
            <button
              onClick={() => setTableSearchFilter('')}
              className="absolute right-2.5 top-2 text-[10px] text-slate-400 hover:text-slate-600 font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Top 15 Search Trends Leaderboard & Live Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Top Search Terms Leaderboard */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-[#b89753]" />
              <h3 className="font-extrabold text-slate-900 text-sm">
                Most Popular Search Terms
              </h3>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              Showing {displayedTrends.length} keywords
            </span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-100 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">Rank</th>
                  <th className="py-3 px-4">Search Keyword</th>
                  <th className="py-3 px-4 text-center">Frequency</th>
                  <th className="py-3 px-4 w-40">Share</th>
                  <th className="py-3 px-4 text-right">Last Searched</th>
                  <th className="py-3 px-4 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedTrends.slice(0, 50).map((trend, idx) => {
                  const percentage = totalSearches > 0 ? (trend.count / totalSearches) * 100 : 0;
                  const rank = idx + 1;

                  return (
                    <tr key={trend.term} className="hover:bg-slate-50/70 transition-colors group">
                      {/* Rank badge */}
                      <td className="py-3.5 px-4 text-center">
                        {rank === 1 && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-black text-xs border border-amber-300">
                            1
                          </span>
                        )}
                        {rank === 2 && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-black text-xs border border-slate-300">
                            2
                          </span>
                        )}
                        {rank === 3 && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/15 text-amber-900 font-black text-xs border border-amber-700/30">
                            3
                          </span>
                        )}
                        {rank > 3 && (
                          <span className="text-slate-400 font-bold text-xs">{rank}</span>
                        )}
                      </td>

                      {/* Term */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs">
                            {trend.term}
                          </span>
                          {/* Arabic text badge */}
                          {/[\u0600-\u06FF]/.test(trend.term) && (
                            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              عربي
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Frequency Count */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-[#b89753] border border-amber-200/80">
                          {trend.count} {trend.count === 1 ? 'search' : 'searches'}
                        </span>
                      </td>

                      {/* Share progress bar */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-semibold text-slate-500">
                            <span>{percentage.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-amber-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(8, percentage))}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>

                      {/* Last seen */}
                      <td className="py-3.5 px-4 text-right text-[11px] text-slate-500">
                        {formatRelativeTime(trend.lastSeen)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleCopyQuery(trend.term)}
                            title="Copy query to clipboard"
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                          >
                            {copiedQuery === trend.term ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            onClick={() => handleInspectInStore(trend.term)}
                            title="Filter catalog by this term"
                            className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 transition-colors cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {displayedTrends.length === 0 && (
              <div className="py-16 px-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-[#b89753] flex items-center justify-center mx-auto">
                  <Search className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    {tableSearchFilter ? `No keywords matching "${tableSearchFilter}"` : 'No search logs recorded yet'}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    {tableSearchFilter 
                      ? 'Try adjusting your filter keyword or timeframe selector above.'
                      : 'As Lebanese shoppers search for zaatar, olive oil, or artisans on your store, their search queries will appear here in real-time.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 span): Live Activity Stream & Test Simulator */}
        <div className="space-y-6">
          {/* Live Recent Searches Stream */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-violet-600" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Live Recent Searches
                </h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                Latest 20
              </span>
            </div>

            <div className="p-3 space-y-2 max-h-[460px] overflow-y-auto divide-y divide-slate-50">
              {filteredLogs.slice(0, 20).map((log) => (
                <div 
                  key={log.id} 
                  className="pt-2 first:pt-0 flex items-start justify-between gap-3 p-2.5 rounded-2xl hover:bg-slate-50/80 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {log.query}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                      {log.userEmail ? (
                        <span className="font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <User className="w-2.5 h-2.5" />
                          {log.userName || log.userEmail.split('@')[0]}
                        </span>
                      ) : (
                        <span className="text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Globe className="w-2.5 h-2.5" />
                          Guest Shopper
                        </span>
                      )}

                      {log.origin && (
                        <span className="capitalize text-slate-400">
                          • {log.origin.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap flex-shrink-0 pt-0.5">
                    {formatRelativeTime(log.timestamp)}
                  </span>
                </div>
              ))}

              {filteredLogs.length === 0 && (
                <div className="py-12 text-center text-xs text-slate-400">
                  No recent search queries yet.
                </div>
              )}
            </div>
          </div>

          {/* Test Search Simulator (Quick Admin Utility) */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  Admin Search Pipeline Test
                </h4>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Verify your real-time tracking pipeline by injecting a test query or clicking sample Lebanese search queries below:
            </p>

            {/* Quick Lebanese Sample Buttons */}
            <div className="flex flex-wrap gap-1.5">
              {['Zaatar Baladi', 'Olive Oil Koura', 'Soap of Tripoli', 'Debs El Remman', 'Kishk', 'Cedar Wood'].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => handleSimulateSearch(sample)}
                  className="text-[10px] font-bold px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-slate-200 border border-white/10 transition-colors cursor-pointer"
                >
                  + {sample}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type custom test query..."
                value={simulatedInput}
                onChange={(e) => setSimulatedInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSimulateSearch();
                }}
                className="flex-1 px-3 py-2 bg-white/10 text-xs text-white placeholder-slate-400 rounded-xl border border-white/15 focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => handleSimulateSearch()}
                disabled={isSimulating || !simulatedInput.trim()}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-extrabold rounded-xl transition-colors cursor-pointer"
              >
                Log
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
