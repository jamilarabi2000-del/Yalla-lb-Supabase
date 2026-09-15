import React from 'react';
import { Clock3, History, Loader2, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SiteContent } from '../../types';
import { supabaseCmsService } from '../../services/supabaseCmsService';
import { safeErrorMessage } from '../../utils/errorSanitizer';

type CmsVersion = {
  id: string;
  content: SiteContent;
  published: boolean;
  created_at: string;
  created_by: string | null;
};

export const CmsVersionHistory: React.FC = () => {
  const [versions, setVersions] = React.useState<CmsVersion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const loadVersions = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const { data, error } = await supabase
      .from('cms_content_versions')
      .select('id, content, published, created_at, created_by')
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) {
      setMessage(safeErrorMessage(error));
      setVersions([]);
    } else {
      setVersions((data ?? []) as CmsVersion[]);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const restore = async (version: CmsVersion) => {
    const confirmed = window.confirm('Restore this CMS version? The current live CMS state will first be preserved so the restore can be reversed.');
    if (!confirmed) return;

    setRestoringId(version.id);
    setMessage(null);
    try {
      await supabaseCmsService.restoreSiteContent(version.content);
      setMessage('CMS version restored successfully.');
      await loadVersions();
    } catch (error) {
      setMessage(safeErrorMessage(error));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
            <History className="w-4 h-4 text-slate-700" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900">CMS Version History</h2>
            <p className="text-xs text-slate-500">Restore a previous saved storefront configuration.</p>
          </div>
        </div>
        <button type="button" onClick={() => void loadVersions()} disabled={loading} className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-50">
          Refresh
        </button>
      </div>

      {message && <div className="mx-5 mt-4 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">{message}</div>}

      {loading ? (
        <div className="p-8 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : versions.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400">No saved CMS versions yet.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {versions.map((version) => {
            const content = version.content as SiteContent & { customBlocks?: unknown[]; home?: { sectionOrder?: string[] } };
            const blockCount = Array.isArray(content.customBlocks) ? content.customBlocks.length : 0;
            const sectionCount = Array.isArray(content.home?.sectionOrder) ? content.home.sectionOrder.length : 0;
            return (
              <div key={version.id} className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Clock3 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-800">{new Date(version.created_at).toLocaleString()}</span>
                    {version.published && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">Saved</span>}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">{sectionCount} homepage sections · {blockCount} custom content blocks</div>
                </div>
                <button type="button" onClick={() => void restore(version)} disabled={restoringId !== null} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-50 shrink-0">
                  {restoringId === version.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Restore
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
