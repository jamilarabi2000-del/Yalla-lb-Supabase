import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { SectionVisibilityConfig, SiteContent } from '../types';
import { 
  HomeIcon, 
  Layout, 
  ShoppingBag, 
  Search, 
  CreditCard, 
  User, 
  Newspaper, 
  Navigation, 
  Type, 
  Blocks, 
  Settings,
  Save,
  RotateCcw,
  Sparkles,
  Palette,
  Eye,
  History,
  FileCode2,
  SplitSquareVertical,
  ExternalLink,
  CheckCircle2,
  Layers,
  Monitor,
  Edit3
} from 'lucide-react';

import { CMSVisibilityTab } from './admin/cms/CMSVisibilityTab';
import { CMSNavbarTab } from './admin/cms/CMSNavbarTab';
import { CMSFooterTab } from './admin/cms/CMSFooterTab';
import { CMSHomeTab } from './admin/cms/CMSHomeTab';
import { CMSProductsTab } from './admin/cms/CMSProductsTab';
import { CMSProductDetailTab } from './admin/cms/CMSProductDetailTab';
import { CMSCheckoutTab } from './admin/cms/CMSCheckoutTab';
import { CMSAccountTab } from './admin/cms/CMSAccountTab';
import { CMSNewsTab } from './admin/cms/CMSNewsTab';
import { CMSCustomBlocksTab } from './admin/cms/CMSCustomBlocksTab';
import { CMSSeoTab } from './admin/cms/CMSSeoTab';
import { CMSThemeTab } from './admin/cms/CMSThemeTab';
import { CMSLivePreview } from './admin/cms/CMSLivePreview';
import { CMSGlobalSearch } from './admin/cms/CMSGlobalSearch';
import { CMSDiffModal } from './admin/cms/CMSDiffModal';
import { CMSVersionHistoryModal } from './admin/cms/CMSVersionHistoryModal';
import { CMSConfirmModal } from './admin/cms/CMSConfirmModal';
import { saveCmsSnapshot, getCmsSnapshots } from '../utils/cmsSnapshots';
import { loadCmsDraft, saveCmsDraft, clearCmsDraft, formatDraftAge } from '../utils/cmsDraft';

interface PageCMSManagerProps {
  initialTab?: string;
}

type TabCategory = 'all' | 'pages' | 'global' | 'layout';

interface CMSTabItem {
  id: string;
  label: string;
  category: 'pages' | 'global' | 'layout';
  icon: any;
  desc: string;
  livePath?: string;
}

const CMS_TABS: CMSTabItem[] = [
  // 1. Pages
  {
    id: 'home',
    label: 'Home Page',
    category: 'pages',
    icon: HomeIcon,
    desc: 'Hero banner, promotional carousel, featured artisans, daily deals, and terroir stories.',
    livePath: '/'
  },
  {
    id: 'productsPage',
    label: 'Catalog Page',
    category: 'pages',
    icon: ShoppingBag,
    desc: 'Products catalog layout, search headlines, category filters, and empty state messages.',
    livePath: '/products'
  },
  {
    id: 'productDetailPage',
    label: 'Product Detail',
    category: 'pages',
    icon: Search,
    desc: 'Craft stories, trust badges, terroir origin highlights, and shipping guarantees.',
    livePath: '/products'
  },
  {
    id: 'checkoutPage',
    label: 'Checkout & Delivery',
    category: 'pages',
    icon: CreditCard,
    desc: 'Cash-on-delivery instructions, courier delivery regions, and order confirmation messages.',
    livePath: '/checkout'
  },
  {
    id: 'accountPage',
    label: 'Patron Account',
    category: 'pages',
    icon: User,
    desc: 'Customer dashboard labels, saved addresses, and profile text.',
    livePath: '/account'
  },
  {
    id: 'newsSection',
    label: 'Stories & Articles',
    category: 'pages',
    icon: Newspaper,
    desc: 'Publish cultural articles, artisan spotlights, and Lebanese harvest updates.',
    livePath: '/news'
  },

  // 2. Global & Brand
  {
    id: 'navbar',
    label: 'Navbar & Ticker',
    category: 'global',
    icon: Navigation,
    desc: 'Header navigation links, top announcement ticker, brand logo, and currency switcher.'
  },
  {
    id: 'footer',
    label: 'Footer & Support',
    category: 'global',
    icon: Layout,
    desc: 'Lebanese contact details, WhatsApp concierge, copyright, and legal information.'
  },
  {
    id: 'theme',
    label: 'Theme & Design',
    category: 'global',
    icon: Palette,
    desc: 'Brand color palettes, typography styling, and visual theme accents.'
  },
  {
    id: 'seo',
    label: 'SEO & Meta Tags',
    category: 'global',
    icon: Type,
    desc: 'Global title templates, meta descriptions, and OpenGraph social share cards.'
  },

  // 3. Layout & Structure
  {
    id: 'visibility',
    label: 'Section Visibility & Order',
    category: 'layout',
    icon: Settings,
    desc: 'Drag to reorder homepage sections, or toggle individual storefront modules on or off.'
  },
  {
    id: 'customBlocks',
    label: 'Custom Banners & Blocks',
    category: 'layout',
    icon: Blocks,
    desc: 'Custom promotional blocks and dynamic marketing placements.'
  }
];

export const PageCMSManager: React.FC<PageCMSManagerProps> = ({ initialTab = 'home' }) => {
  const { siteContent, updateSiteContent, showToast } = useShop();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedCategory, setSelectedCategory] = useState<TabCategory>('all');
  const [cmsForm, setCmsForm] = useState(siteContent);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  // View modes: 'editor' (spacious full-width), 'split' (side-by-side preview), 'preview' (full preview)
  const [viewMode, setViewMode] = useState<'editor' | 'split' | 'preview'>('editor');
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [snapshotCount, setSnapshotCount] = useState(0);

  // Restore unsaved draft from persistence on mount, if available
  useEffect(() => {
    const existingDraft = loadCmsDraft();
    if (existingDraft && existingDraft.content) {
      setCmsForm(existingDraft.content);
      setIsDirty(true);
      setDraftSavedAt(existingDraft.savedAt);
      if (existingDraft.activeTab && CMS_TABS.some(t => t.id === existingDraft.activeTab)) {
        setActiveTab(existingDraft.activeTab);
      }
    } else {
      setCmsForm(siteContent);
      setIsDirty(false);
    }
  }, []);

  // Update form if siteContent changed externally AND form is not dirty
  useEffect(() => {
    if (!isDirty) {
      setCmsForm(siteContent);
    }
  }, [siteContent, isDirty]);

  // Autosave draft whenever dirty changes occur
  useEffect(() => {
    if (isDirty) {
      const savedTime = saveCmsDraft(cmsForm, activeTab);
      setDraftSavedAt(savedTime);
    }
  }, [cmsForm, isDirty, activeTab]);

  // Protect against accidental tab closure / refresh with unsaved edits
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      // Auto-set category if specific tab passed
      const foundTab = CMS_TABS.find(t => t.id === initialTab);
      if (foundTab && selectedCategory !== 'all' && selectedCategory !== foundTab.category) {
        setSelectedCategory(foundTab.category);
      }
    }
  }, [initialTab]);

  useEffect(() => {
    setSnapshotCount(getCmsSnapshots().length);
  }, []);

  // Keyboard shortcut: Cmd+S / Ctrl+S to save & publish
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isDirty && !isSaving) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, isSaving, cmsForm]);

  const handleUpdate = (updater: (prev: typeof cmsForm) => typeof cmsForm) => {
    setCmsForm(prev => {
      const next = updater(prev);
      setIsDirty(true);
      return next;
    });
  };

  const handleSave = async (sectionsToPublish?: string[]) => {
    setIsSaving(true);
    try {
      let contentToSave = cmsForm;
      if (sectionsToPublish && sectionsToPublish.length > 0) {
        const merged: SiteContent = { ...siteContent };
        for (const sectionKey of sectionsToPublish) {
          if ((cmsForm as any)[sectionKey] !== undefined) {
            (merged as any)[sectionKey] = (cmsForm as any)[sectionKey];
          }
        }
        contentToSave = merged;
      }

      saveCmsSnapshot(contentToSave, `Published updates (${new Date().toLocaleTimeString()})`);
      setSnapshotCount(getCmsSnapshots().length);

      await updateSiteContent(contentToSave);

      if (sectionsToPublish && sectionsToPublish.length > 0) {
        const savedTime = saveCmsDraft(cmsForm, activeTab);
        setDraftSavedAt(savedTime);
        setIsDirty(true);
        showToast(`Published ${sectionsToPublish.length} section(s) live. Remaining edits remain in draft.`, 'success');
      } else {
        clearCmsDraft();
        setIsDirty(false);
        setDraftSavedAt(null);
        showToast('CMS changes successfully published to the live storefront.', 'success');
      }
    } catch (err: any) {
      console.error('[PageCMSManager] Failed to save site content:', err);
      showToast(`Could not save CMS content: ${err?.message || 'the write was rejected.'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setShowDiscardModal(true);
  };

  const handleConfirmDiscard = () => {
    clearCmsDraft();
    setCmsForm(siteContent);
    setIsDirty(false);
    setDraftSavedAt(null);
    setShowDiscardModal(false);
    showToast('Discarded draft edits and reverted to live content.', 'info');
  };

  const handleRollback = (restoredContent: any) => {
    setCmsForm(restoredContent);
    setIsDirty(true);
    const savedTime = saveCmsDraft(restoredContent, activeTab);
    setDraftSavedAt(savedTime);
    showToast('Version restored to draft editor. Review and click Publish to go live.', 'info');
  };

  const currentTabObj = CMS_TABS.find(t => t.id === activeTab) || CMS_TABS[0];

  const filteredTabs = selectedCategory === 'all' 
    ? CMS_TABS 
    : CMS_TABS.filter(t => t.category === selectedCategory);

  const categoryCounts = {
    all: CMS_TABS.length,
    pages: CMS_TABS.filter(t => t.category === 'pages').length,
    global: CMS_TABS.filter(t => t.category === 'global').length,
    layout: CMS_TABS.filter(t => t.category === 'layout').length,
  };

  return (
    <div className="bg-[#1a1a2e] p-4 sm:p-6 lg:p-8 rounded-3xl text-white shadow-2xl space-y-6 relative border border-white/5">
      {/* Top Header & Global Actions Toolbar */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3.5">
          <span className="p-3 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-inner">
            <Sparkles className="w-6 h-6" />
          </span>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Storefront CMS Studio
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold tracking-wide flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Sync
              </span>
              {isDirty && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-bold tracking-wide flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Draft autosaved ({formatDraftAge(draftSavedAt)})
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Visual storefront management, bilingual EN/AR copywriting, live device preview, and version rollback.
            </p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-start xl:justify-end">
          <div className="w-full sm:w-56 md:w-64 min-w-[180px] shrink-0">
            <CMSGlobalSearch onSelectTab={(tabId) => setActiveTab(tabId)} />
          </div>

          {/* 3-Way View Switcher */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-white/10 shadow-inner shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('editor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                viewMode === 'editor'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Editor Focus: Full width comfortable dual-language editing"
            >
              <Edit3 className="w-3.5 h-3.5 shrink-0" />
              <span>Editor</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                viewMode === 'split'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Split View: Editor on left, live storefront preview on right"
            >
              <SplitSquareVertical className="w-3.5 h-3.5 shrink-0" />
              <span>Split</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                viewMode === 'preview'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Preview Focus: Full width interactive storefront with device frames"
            >
              <Monitor className="w-3.5 h-3.5 shrink-0" />
              <span>Preview</span>
            </button>
          </div>

          {/* Version History Button */}
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
            title="View CMS version history and snapshots"
          >
            <History className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>History</span>
            {snapshotCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold">
                {snapshotCount}
              </span>
            )}
          </button>

          {/* Diff Modal Button */}
          {isDirty && (
            <button
              type="button"
              onClick={() => setShowDiffModal(true)}
              className="px-3 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer animate-pulse shrink-0 whitespace-nowrap"
              title="Review differences against live site"
            >
              <FileCode2 className="w-3.5 h-3.5 shrink-0" />
              <span>Diff</span>
            </button>
          )}

          {isDirty && (
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-rose-950/40 border border-white/10 hover:border-rose-500/30 text-slate-300 hover:text-rose-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
              title="Discard unsaved changes"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Discard</span>
            </button>
          )}

          <button 
            type="button"
            onClick={() => handleSave()} 
            disabled={isSaving}
            className={`px-4 sm:px-5 py-2 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer shadow-lg active:scale-95 shrink-0 whitespace-nowrap ${
              isDirty 
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 ring-2 ring-amber-400/50 shadow-amber-500/20' 
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
            } disabled:opacity-50`}
            title="Save and publish CMS changes live to visitors (Shortcut: Cmd+S / Ctrl+S)"
          >
            <Save className={`w-4 h-4 shrink-0 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Publishing...' : isDirty ? 'Publish Changes' : 'Save & Publish Live'}</span>
            <span className="hidden md:inline-block px-1.5 py-0.5 rounded bg-black/20 text-[10px] font-mono font-normal">
              ⌘S
            </span>
          </button>
        </div>
      </div>

      {/* Category Pills & Quick Filter Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-2xl border border-white/10 w-fit">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Modules ({categoryCounts.all})
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('pages')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === 'pages'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Storefront Pages ({categoryCounts.pages})
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('global')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === 'global'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Header, Footer & Brand ({categoryCounts.global})
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('layout')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === 'layout'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Layout & Blocks ({categoryCounts.layout})
            </button>
          </div>

          {currentTabObj.livePath && (
            <a
              href={currentTabObj.livePath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-400 border border-amber-500/20 hover:border-amber-400/40 text-xs font-semibold transition-all shadow-xs group"
            >
              <span>View live on storefront</span>
              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
          )}
        </div>

        {/* Tab Buttons Grid / Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {filteredTabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer text-left border ${
                  isActive 
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/10 font-black scale-[1.02]' 
                    : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800/90 hover:text-white border-white/5 hover:border-white/15'
                }`}
              >
                <tab.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-amber-400'}`} />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Section Context / Breadcrumb Banner */}
      <div className="bg-[#121222] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <currentTabObj.icon className="w-5 h-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-white">{currentTabObj.label}</h3>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-white/5">
                {currentTabObj.category}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{currentTabObj.desc}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {isDirty ? (
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Unpublished edits pending
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Storefront synced
            </span>
          )}
        </div>
      </div>

      {/* Main Workspace Layout (Editor Focus, Split View, or Full Preview) */}
      {viewMode === 'preview' ? (
        /* Full Width Preview Focus */
        <div className="bg-slate-900 border border-white/10 rounded-3xl p-4 min-h-[750px]">
          <CMSLivePreview
            content={cmsForm}
            activeTab={activeTab}
            isSplitView={false}
            onClose={() => setViewMode('editor')}
          />
        </div>
      ) : (
        /* Editor Focus or Split View */
        <div className={`grid gap-6 ${viewMode === 'split' ? 'grid-cols-1 xl:grid-cols-12' : 'grid-cols-1'}`}>
          {/* Left/Editor Form Column */}
          <div className={viewMode === 'split' ? 'xl:col-span-7 space-y-6' : 'space-y-6'}>
            {/* 1. Section Visibility & Order */}
            {activeTab === 'visibility' && (
              <CMSVisibilityTab
                visibility={cmsForm.visibility}
                sectionOrder={(cmsForm.home as any)?.sectionOrder}
                onOrderChange={(order) => {
                  handleUpdate(prev => ({
                    ...prev,
                    home: {
                      ...(prev.home as any),
                      sectionOrder: order
                    }
                  }));
                }}
                onChange={(key: keyof SectionVisibilityConfig, value: boolean) => {
                  handleUpdate(prev => ({
                    ...prev,
                    visibility: {
                      ...prev.visibility,
                      [key]: value
                    }
                  }));
                }}
                onSetAll={(value: boolean) => {
                  handleUpdate(prev => {
                    const nextVis = { ...prev.visibility };
                    (Object.keys(nextVis) as Array<keyof SectionVisibilityConfig>).forEach(k => {
                      nextVis[k] = value;
                    });
                    return {
                      ...prev,
                      visibility: nextVis
                    };
                  });
                }}
              />
            )}

            {/* 2. Navbar & Brand */}
            {activeTab === 'navbar' && (
              <CMSNavbarTab
                navbarData={cmsForm.navbar as any}
                onChangeField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    navbar: {
                      ...(prev.navbar as any),
                      [field]: value
                    }
                  }));
                }}
              />
            )}

            {/* 3. Home Page Sections */}
            {activeTab === 'home' && (
              <CMSHomeTab
                homeData={cmsForm.home as any}
                heroData={cmsForm.hero as any}
                offersData={cmsForm.offers as any}
                promoBannerData={cmsForm.promoBanner as any}
                onChangeHomeField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    home: {
                      ...(prev.home as any),
                      [field]: value
                    }
                  }));
                }}
                onChangeHeroField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    hero: {
                      ...(prev.hero as any),
                      [field]: value
                    }
                  }));
                }}
                onChangeOffersField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    offers: {
                      ...(prev.offers as any),
                      [field]: value
                    }
                  }));
                }}
                onChangePromoBannerField={(updates) => {
                  handleUpdate(prev => ({
                    ...prev,
                    promoBanner: {
                      ...(prev.promoBanner as any),
                      ...updates
                    }
                  }));
                }}
              />
            )}

            {/* 4. Products Catalog Page */}
            {activeTab === 'productsPage' && (
              <CMSProductsTab
                productsData={cmsForm.productsPage as any}
                onChangeField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    productsPage: {
                      ...(prev.productsPage as any),
                      [field]: value
                    }
                  }));
                }}
              />
            )}

            {/* 5. Product Detail Page */}
            {activeTab === 'productDetailPage' && (
              <CMSProductDetailTab
                detailData={cmsForm.productDetailPage as any}
                onChangeField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    productDetailPage: {
                      ...(prev.productDetailPage as any),
                      [field]: value
                    }
                  }));
                }}
              />
            )}

            {/* 6. Checkout & Success Pages */}
            {activeTab === 'checkoutPage' && (
              <CMSCheckoutTab
                checkoutData={cmsForm.checkoutPage as any}
                checkoutSuccessData={cmsForm.checkoutSuccessPage as any}
                onChangeCheckoutField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    checkoutPage: {
                      ...(prev.checkoutPage as any),
                      [field]: value
                    }
                  }));
                }}
                onChangeSuccessField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    checkoutSuccessPage: {
                      ...(prev.checkoutSuccessPage as any),
                      [field]: value
                    }
                  }));
                }}
              />
            )}

            {/* 7. Patron Account Page */}
            {activeTab === 'accountPage' && (
              <CMSAccountTab
                accountData={cmsForm.accountPage as any}
                onChangeField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    accountPage: {
                      ...(prev.accountPage as any),
                      [field]: value
                    }
                  }));
                }}
              />
            )}

            {/* 8. News & Blog Stories */}
            {activeTab === 'newsSection' && (
              <CMSNewsTab
                newsData={cmsForm.newsSection as any}
                onChangeField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    newsSection: {
                      ...(prev.newsSection as any),
                      [field]: value
                    }
                  }));
                }}
              />
            )}

            {/* 9. Footer & Social Links */}
            {activeTab === 'footer' && (
              <CMSFooterTab
                footerData={cmsForm.footer as any}
                socialLinks={cmsForm.socialLinks as any}
                onChangeFooterField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    footer: {
                      ...(prev.footer as any),
                      [field]: value
                    }
                  }));
                }}
                onChangeSocialField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    socialLinks: {
                      ...(prev.socialLinks as any),
                      [field]: value
                    }
                  }));
                }}
              />
            )}

            {/* 10. Custom Divs / Visual Blocks */}
            {activeTab === 'customBlocks' && (
              <CMSCustomBlocksTab
                customBlocks={cmsForm.customBlocks || []}
                onChange={(blocks) => {
                  handleUpdate(prev => ({
                    ...prev,
                    customBlocks: blocks
                  }));
                }}
              />
            )}

            {/* 11. SEO & SERP */}
            {activeTab === 'seo' && (
              <CMSSeoTab
                seoData={cmsForm.seo as any}
                onChangeField={(field, value) => {
                  handleUpdate(prev => ({
                    ...prev,
                    seo: {
                      ...(prev.seo as any),
                      [field]: value
                    }
                  }));
                }}
              />
            )}

            {/* 12. Theme & Global Design */}
            {activeTab === 'theme' && (
              <CMSThemeTab />
            )}
          </div>

          {/* Right/Split Live Storefront Preview Column */}
          {viewMode === 'split' && (
            <div className="xl:col-span-5 relative">
              <div className="sticky top-6">
                <CMSLivePreview
                  content={cmsForm}
                  activeTab={activeTab}
                  onClose={() => setViewMode('editor')}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sticky Bottom Save / Unsaved Edits Indicator Bar */}
      {isDirty && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-8 md:max-w-xl z-40 bg-slate-900/95 backdrop-blur-md border border-amber-500/40 rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-4 animate-bounce-short">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping shrink-0" />
            <div>
              <p className="text-xs font-bold text-white">You have unpublished draft edits</p>
              <p className="text-[10px] text-slate-400">Edits are previewing live but not yet published to customers.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowDiffModal(true)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-bold border border-purple-500/30 transition-all cursor-pointer"
            >
              Review Diff
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <span>{isSaving ? 'Publishing...' : 'Publish (⌘S)'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showDiffModal && (
        <CMSDiffModal
          currentSiteContent={siteContent}
          draftSiteContent={cmsForm}
          isSaving={isSaving}
          onClose={() => setShowDiffModal(false)}
          onPublish={async (sections) => {
            setShowDiffModal(false);
            await handleSave(sections);
          }}
          onDiscard={() => {
            setShowDiffModal(false);
            handleReset();
          }}
        />
      )}

      {showHistoryModal && (
        <CMSVersionHistoryModal
          onClose={() => setShowHistoryModal(false)}
          onRollback={handleRollback}
        />
      )}

      {showDiscardModal && (
        <CMSConfirmModal
          isOpen={showDiscardModal}
          title="Discard Unsaved CMS Edits"
          message="Are you sure you want to discard all unsaved edits? Your editor will revert back to the currently published live store content, and the local draft will be cleared."
          confirmLabel="Discard Draft"
          cancelLabel="Keep Editing"
          isDanger={true}
          onConfirm={handleConfirmDiscard}
          onCancel={() => setShowDiscardModal(false)}
        />
      )}
    </div>
  );
};
