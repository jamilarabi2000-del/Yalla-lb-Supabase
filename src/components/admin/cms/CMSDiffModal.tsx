import React, { useState } from 'react';
import { GitCompare, CheckCircle2, Trash2, X } from 'lucide-react';
import { CmsDiffItem, computeCmsDiffs } from '../../../utils/cmsSnapshots';
import { SiteContent } from '../../../types';

export interface CMSDiffModalProps {
  diffs?: CmsDiffItem[];
  currentSiteContent?: SiteContent;
  draftSiteContent?: SiteContent;
  isOpen?: boolean;
  onClose: () => void;
  onPublish?: (sections?: string[]) => void;
  onConfirmPublish?: (sections?: string[]) => void;
  onDiscard: () => void;
  isSaving?: boolean;
}

export const CMSDiffModal: React.FC<CMSDiffModalProps> = ({
  diffs: propDiffs,
  currentSiteContent,
  draftSiteContent,
  isOpen = true,
  onClose,
  onPublish,
  onConfirmPublish,
  onDiscard,
  isSaving = false
}) => {
  if (!isOpen) return null;

  const diffs = propDiffs || (currentSiteContent && draftSiteContent ? computeCmsDiffs(currentSiteContent, draftSiteContent) : []);

  // Section keys mapping and partial selection state
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const allSectionKeys = Array.from(new Set(diffs.map(d => d.tab)));
  const sectionKeyByLabel = diffs.reduce((acc, d) => {
    acc[d.tabLabel] = d.tab;
    return acc;
  }, {} as Record<string, string>);

  const selectedKeys = allSectionKeys.filter(k => !excluded.has(k));
  const isPartial = selectedKeys.length > 0 && selectedKeys.length < allSectionKeys.length;

  const toggleSection = (sectionKey: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  const handlePublish = () => {
    if (selectedKeys.length === 0) return;
    const publishHandler = onPublish || onConfirmPublish;
    publishHandler?.(isPartial ? selectedKeys : undefined);
  };

  // Group diffs by Tab
  const groupedDiffs = diffs.reduce((acc, diff) => {
    if (!acc[diff.tabLabel]) {
      acc[diff.tabLabel] = [];
    }
    acc[diff.tabLabel].push(diff);
    return acc;
  }, {} as Record<string, CmsDiffItem[]>);

  const formatValue = (val: any) => {
    if (val === undefined || val === null || val === '') {
      return <span className="text-slate-500 italic text-[11px]">(empty)</span>;
    }
    if (typeof val === 'boolean') {
      return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${val ? 'bg-emerald-500/20 text-emerald-800' : 'bg-rose-500/20 text-rose-800'}`}>
          {val ? 'Enabled' : 'Disabled'}
        </span>
      );
    }
    if (typeof val === 'object') {
      return <pre className="text-[10px] font-mono text-slate-600 truncate max-w-xs">{JSON.stringify(val)}</pre>;
    }
    return <span className="text-xs text-slate-900 break-words">{String(val)}</span>;
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="diff-modal-title"
        className="bg-slate-50 border border-white/15 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-indigo-600 flex items-center justify-center border border-amber-500/30">
              <GitCompare className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 id="diff-modal-title" className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Review Unsaved CMS Changes</span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-indigo-600 text-xs font-bold border border-amber-500/30">
                  {diffs.length} {diffs.length === 1 ? 'change' : 'changes'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect changes or choose specific sections to publish live while keeping the rest in draft.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-100 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close review dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Diff List */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {diffs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-slate-900">No Unsaved Changes</h4>
              <p className="text-xs text-slate-500">All CMS fields match the active live storefront configuration.</p>
            </div>
          ) : (
            Object.entries(groupedDiffs).map(([tabLabel, items]) => {
              const secKey = sectionKeyByLabel[tabLabel];
              const isExcluded = excluded.has(secKey);
              return (
                <div key={tabLabel} className={`space-y-3 p-3.5 rounded-2xl border transition-all ${isExcluded ? 'bg-slate-50/30 border-slate-200 opacity-60' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={!isExcluded}
                        onChange={() => toggleSection(secKey)}
                        aria-label={`Include ${tabLabel} changes when publishing`}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-100 border-white/20 focus:ring-amber-400 cursor-pointer"
                      />
                      <span className={`text-xs font-bold uppercase tracking-wider ${isExcluded ? 'text-slate-500 line-through' : 'text-indigo-600'}`}>
                        {tabLabel}
                      </span>
                      {isExcluded && (
                        <span className="text-[10px] text-indigo-600/80 font-normal italic">— stays in draft</span>
                      )}
                    </label>
                    <span className="text-[10px] text-slate-500">
                      ({items.length} {items.length === 1 ? 'field' : 'fields'})
                    </span>
                  </div>

                  <div className="space-y-2">
                    {items.map((diff, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-700">
                            {diff.label}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            diff.type === 'added' ? 'bg-emerald-500/20 text-emerald-800' :
                            diff.type === 'removed' ? 'bg-rose-500/20 text-rose-800' :
                            'bg-amber-500/20 text-indigo-600'
                          }`}>
                            {diff.type}
                          </span>
                        </div>

                        {/* Before vs After comparison */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {/* Before (Live) */}
                          <div className="p-2.5 rounded-xl bg-slate-50/80 border border-rose-500/20 space-y-1">
                            <span className="text-[10px] font-bold uppercase text-rose-600 tracking-wider block">
                              Before (Live):
                            </span>
                            <div className="text-slate-600">
                              {formatValue(diff.before)}
                            </div>
                          </div>

                          {/* After (Draft) */}
                          <div className="p-2.5 rounded-xl bg-slate-50/80 border border-emerald-500/20 space-y-1">
                            <span className="text-[10px] font-bold uppercase text-emerald-700 tracking-wider block">
                              After (Draft):
                            </span>
                            <div className="text-emerald-200">
                              {formatValue(diff.after)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onDiscard}
            className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Discard All Edits</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-xs font-bold transition-colors cursor-pointer"
            >
              Keep Editing
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={isSaving || diffs.length === 0 || selectedKeys.length === 0}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black uppercase tracking-wider shadow-lg hover:shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isSaving 
                  ? 'Publishing...' 
                  : isPartial 
                  ? `Publish ${selectedKeys.length} of ${allSectionKeys.length} sections` 
                  : 'Publish Live Now'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
