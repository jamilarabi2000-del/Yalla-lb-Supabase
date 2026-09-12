import React, { useState } from 'react';
import { useShop } from '../../context/ShopContext';
import { RecentActivity } from '../../types';
import { 
  Activity, 
  PlusCircle, 
  Edit3, 
  Trash2, 
  Truck, 
  Globe, 
  Layers, 
  User, 
  Clock,
  RotateCcw,
  Eye,
  X,
  CheckCircle2,
  FileDiff,
  ShieldCheck,
  History
} from 'lucide-react';

export const RecentActivityWidget: React.FC = () => {
  const { recentActivities, undoAdminActivity } = useShop();
  const [selectedActivityForDiff, setSelectedActivityForDiff] = useState<RecentActivity | null>(null);
  const [isAllLogsModalOpen, setIsAllLogsModalOpen] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const formatTimeAgo = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      if (seconds < 5) return 'Just now';
      if (seconds < 60) return `${seconds}s ago`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return 'Recently';
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'product_add':
        return {
          icon: <PlusCircle className="w-4 h-4" />,
          bg: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
        };
      case 'product_update':
      case 'product_bulk_update':
        return {
          icon: <Edit3 className="w-4 h-4" />,
          bg: 'bg-amber-50 text-amber-600 border border-amber-100',
        };
      case 'product_delete':
        return {
          icon: <Trash2 className="w-4 h-4" />,
          bg: 'bg-rose-50 text-rose-600 border border-rose-100',
        };
      case 'order_status':
        return {
          icon: <Truck className="w-4 h-4" />,
          bg: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
        };
      case 'meta_change':
        return {
          icon: <Globe className="w-4 h-4" />,
          bg: 'bg-teal-50 text-teal-600 border border-teal-100',
        };
      case 'cms_update':
      default:
        return {
          icon: <Layers className="w-4 h-4" />,
          bg: 'bg-purple-50 text-purple-600 border border-purple-100',
        };
    }
  };

  const handleUndo = async (act: RecentActivity) => {
    if (!confirm(`Are you sure you want to undo and recover state for: "${act.summary}"?`)) return;
    setUndoingId(act.id);
    try {
      await undoAdminActivity(act.id);
    } finally {
      setUndoingId(null);
    }
  };

  const displayedActivities = recentActivities.slice(0, 5);

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-slate-100/70 flex items-center justify-center text-slate-700">
            <Activity className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm">Recent Activity & Recovery</h3>
            <p className="text-[11px] text-slate-500">Live audit log with one-click undo</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAllLogsModalOpen(true)}
            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1"
          >
            <History className="w-3 h-3" />
            <span>All Logs</span>
          </button>
          
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[9px] font-black uppercase text-emerald-700 tracking-wider">Live</span>
          </div>
        </div>
      </div>

      {/* Activity List */}
      <div className="space-y-3">
        {displayedActivities.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mx-auto">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-400 font-medium">No recent activities recorded.</p>
          </div>
        ) : (
          displayedActivities.map((act) => {
            const styling = getActivityIcon(act.actionType);
            const hasSnapshots = !!act.snapshotBefore || !!act.snapshotAfter;
            const canUndo = !act.isUndone && (
              (act.actionType === 'product_update' && !!act.targetId && !!act.snapshotBefore) ||
              (act.actionType === 'product_add' && !!act.targetId) ||
              (act.actionType === 'product_delete' && !!act.targetId && !!act.snapshotBefore) ||
              (act.actionType === 'product_bulk_update' && Array.isArray(act.snapshotBefore))
            );

            return (
              <div key={act.id} className="flex gap-3 text-xs p-2.5 rounded-2xl hover:bg-slate-50/90 transition-all border border-slate-100 hover:border-slate-200 group">
                {/* Left: Icon Badge */}
                <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center mt-0.5 ${styling.bg}`}>
                  {styling.icon}
                </div>

                {/* Center & Right */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 truncate text-[11px] leading-snug">
                      {act.summary}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold shrink-0 flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {formatTimeAgo(act.timestamp)}
                    </span>
                  </div>
                  
                  <p className="text-[11px] text-slate-500 leading-normal line-clamp-2">
                    {act.details}
                  </p>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <User className="w-3 h-3 text-slate-300" />
                      <span className="truncate max-w-[120px]">{act.adminEmail}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {act.isUndone && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3 h-3 text-slate-400" />
                          Undone
                        </span>
                      )}

                      {hasSnapshots && (
                        <button
                          onClick={() => setSelectedActivityForDiff(act)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                          title="Preview before/after changes"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View Diff</span>
                        </button>
                      )}

                      {canUndo && (
                        <button
                          onClick={() => handleUndo(act)}
                          disabled={undoingId === act.id}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md transition-all cursor-pointer disabled:opacity-50"
                          title="Undo this change and recover previous state"
                        >
                          <RotateCcw className={`w-3 h-3 ${undoingId === act.id ? 'animate-spin' : ''}`} />
                          <span>Undo</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* View Diff Modal */}
      {selectedActivityForDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileDiff className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Activity Change Preview & Diff</h3>
                  <p className="text-xs text-slate-500">{selectedActivityForDiff.summary}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedActivityForDiff(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 text-[11px]">
                <div>
                  <span className="font-bold text-slate-500 uppercase tracking-wider block text-[9px]">Logged Time</span>
                  <span className="font-semibold text-slate-800">{new Date(selectedActivityForDiff.timestamp).toLocaleString()}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 uppercase tracking-wider block text-[9px]">Performed By</span>
                  <span className="font-semibold text-slate-800">{selectedActivityForDiff.adminEmail}</span>
                </div>
              </div>

              {/* Before vs After Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 bg-rose-50/60 border border-rose-200 rounded-2xl space-y-2">
                  <h4 className="font-bold text-rose-800 text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span>State Before Change (Original)</span>
                  </h4>
                  <pre className="p-2.5 bg-white rounded-xl border border-rose-100 font-mono text-[10px] text-slate-700 overflow-x-auto max-h-60">
                    {selectedActivityForDiff.snapshotBefore 
                      ? JSON.stringify(selectedActivityForDiff.snapshotBefore, null, 2)
                      : 'None (Item did not exist or was newly created)'}
                  </pre>
                </div>

                <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-2">
                  <h4 className="font-bold text-emerald-800 text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>State After Change (Applied)</span>
                  </h4>
                  <pre className="p-2.5 bg-white rounded-xl border border-emerald-100 font-mono text-[10px] text-slate-700 overflow-x-auto max-h-60">
                    {selectedActivityForDiff.snapshotAfter 
                      ? JSON.stringify(selectedActivityForDiff.snapshotAfter, null, 2)
                      : 'None (Item was deleted)'}
                  </pre>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div>
                {selectedActivityForDiff.isUndone && (
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>This change was previously undone and recovered.</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!selectedActivityForDiff.isUndone && (!!selectedActivityForDiff.snapshotBefore || selectedActivityForDiff.actionType === 'product_add') && (
                  <button
                    onClick={() => {
                      const act = selectedActivityForDiff;
                      setSelectedActivityForDiff(null);
                      handleUndo(act);
                    }}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Undo & Restore Previous State</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedActivityForDiff(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Activity & Audit Logs Modal */}
      {isAllLogsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Complete Activity Audit Log & State Recovery</h3>
                  <p className="text-xs text-slate-500">Every catalog edit, bulk action, and CMS update with instant rollback capabilities</p>
                </div>
              </div>
              <button
                onClick={() => setIsAllLogsModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {recentActivities.map((act) => {
                const styling = getActivityIcon(act.actionType);
                const hasSnapshots = !!act.snapshotBefore || !!act.snapshotAfter;
                const canUndo = !act.isUndone && (
                  (act.actionType === 'product_update' && !!act.targetId && !!act.snapshotBefore) ||
                  (act.actionType === 'product_add' && !!act.targetId) ||
                  (act.actionType === 'product_delete' && !!act.targetId && !!act.snapshotBefore) ||
                  (act.actionType === 'product_bulk_update' && Array.isArray(act.snapshotBefore))
                );

                return (
                  <div key={act.id} className="p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-2 hover:bg-white transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center mt-0.5 ${styling.bg}`}>
                          {styling.icon}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-xs">{act.summary}</h4>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{act.details}</p>
                          <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
                            <span>Admin: <strong className="text-slate-600">{act.adminEmail}</strong></span>
                            <span>•</span>
                            <span>{new Date(act.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {act.isUndone && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Undone / Recovered
                          </span>
                        )}

                        {hasSnapshots && (
                          <button
                            onClick={() => setSelectedActivityForDiff(act)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Diff</span>
                          </button>
                        )}

                        {canUndo && (
                          <button
                            onClick={() => handleUndo(act)}
                            disabled={undoingId === act.id}
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${undoingId === act.id ? 'animate-spin' : ''}`} />
                            <span>Undo Action</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsAllLogsModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

