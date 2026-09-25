import React, { useState } from 'react';
import { LayoutTemplate, Sparkles } from 'lucide-react';
import { VisualPageBuilder } from './VisualPageBuilder';
import { StorefrontLayoutBuilder } from './StorefrontLayoutBuilder';
import { CmsVersionHistory } from './CmsVersionHistory';

/**
 * Unified WordPress-style editing workspace.
 * Keeps the registered storefront structure separate from arbitrary CMS blocks,
 * while presenting both controls as one admin experience.
 */
export const UnifiedVisualBuilder: React.FC = () => {
  const [mode, setMode] = useState<'structure' | 'content'>('structure');

  return (
    <section className="space-y-5">
      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h1 className="text-2xl font-black">Visual Storefront Builder</h1>
              <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">LIVE STORE STRUCTURE</span>
            </div>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              Manage Yalla like a WordPress page builder without allowing arbitrary DOM changes to break commerce, authentication, checkout, or responsive behavior.
            </p>
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
            <button
              type="button"
              onClick={() => setMode('structure')}
              className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 ${mode === 'structure' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}
            >
              <LayoutTemplate className="w-4 h-4" />
              Structure
            </button>
            <button
              type="button"
              onClick={() => setMode('content')}
              className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 ${mode === 'content' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}
            >
              <Sparkles className="w-4 h-4" />
              Content Blocks
            </button>
          </div>
        </div>
      </div>

      {mode === 'structure' ? <StorefrontLayoutBuilder /> : <VisualPageBuilder />}
      <CmsVersionHistory />
    </section>
  );
};

export default UnifiedVisualBuilder;
